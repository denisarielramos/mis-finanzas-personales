-- ============================================================================
-- Cuotas: modalidad fija/aproximada, edición segura y archivado
-- ============================================================================
--
-- Qué hace esta migración
--   1. Añade a `public.planes_cuotas`:
--        tipo_monto     'fijo' | 'aproximado'   (todo lo existente queda 'fijo')
--        archivado      boolean                 (todo lo existente queda false)
--        archivado_en   timestamptz
--   2. Rehace `public.v_planes_cuotas_resumen` para que:
--        monto_pagado    = suma REAL de lo pagado en las cuotas pagadas
--        saldo_pendiente = suma PROGRAMADA de las cuotas pendientes
--      y para exponer las tres columnas nuevas.
--   3. Crea `editar_plan_cuotas`: cambia datos del plan y, si se pide, el
--      importe programado SOLO de las cuotas pendientes.
--   4. Crea `archivar_plan_cuotas` y `desarchivar_plan_cuotas`. Archivar solo
--      se permite con el plan completado o cancelado.
--
-- Qué NO hace
--   - NO toca `crear_plan_cuotas`, `confirmar_cuota_plan`, `revertir_pago_cuota`
--     ni `cancelar_plan_cuotas`.
--   - NO modifica ningún movimiento, ninguna cuota pagada ni ningún importe
--     histórico. No borra ni regenera cuotas.
--   - NO toca conciliación, recurrentes, presupuestos ni saldos.
--   - NO archiva nada automáticamente.
--
-- Cómo ejecutarla
--   Supabase → SQL Editor → pegar este archivo entero → Run.
--   Es idempotente: se puede ejecutar más de una vez.
--
-- ANTES de ejecutar conviene guardar la definición actual de la vista, porque
-- el paso 2 la rehace. Ejecutar esto aparte y guardar el resultado:
--
--     select pg_get_viewdef('public.v_planes_cuotas_resumen'::regclass, true);
--
--     select p.oid::regprocedure as firma, pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('crear_plan_cuotas', 'confirmar_cuota_plan',
--                         'revertir_pago_cuota', 'cancelar_plan_cuotas');
--
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ----------------------------------------------------------------------------

alter table public.planes_cuotas
  add column if not exists tipo_monto text not null default 'fijo';

alter table public.planes_cuotas
  add column if not exists archivado boolean not null default false;

alter table public.planes_cuotas
  add column if not exists archivado_en timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planes_cuotas_tipo_monto_check'
  ) then
    alter table public.planes_cuotas
      add constraint planes_cuotas_tipo_monto_check
      check (tipo_monto in ('fijo', 'aproximado'));
  end if;
end
$$;

comment on column public.planes_cuotas.tipo_monto is
  '«fijo»: el importe de la cuota es contractual y no se edita al pagar. «aproximado»: el importe programado es una estimación y al pagar se registra el importe real.';
comment on column public.planes_cuotas.archivado is
  'Saca la financiación del listado normal. Es independiente del estado: no cambia pagos, cuotas ni saldos.';

-- El listado normal filtra por propietario, archivado y estado.
create index if not exists planes_cuotas_archivado_idx
  on public.planes_cuotas (user_id, archivado, estado);

-- ----------------------------------------------------------------------------
-- 2. Resumen: lo pagado es real, lo pendiente es programado
-- ----------------------------------------------------------------------------
--
-- No se calcula `monto_total - monto_pagado`: en un plan aproximado, pagar de
-- más o de menos deformaría la proyección de lo que todavía falta. Cada cifra
-- sale de su propia fuente.

drop view if exists public.v_planes_cuotas_resumen;

create view public.v_planes_cuotas_resumen as
select
  p.id,
  p.user_id,
  p.nombre,
  p.proveedor,
  p.descripcion,
  p.categoria_id,
  p.cuenta_preferida_id,
  p.monto_total,
  p.cantidad_cuotas,
  p.fecha_compra,
  p.fecha_primera_cuota,
  p.frecuencia_meses,
  p.estado,
  coalesce(c.cuotas_pagadas, 0)::integer   as cuotas_pagadas,
  coalesce(c.cuotas_pendientes, 0)::integer as cuotas_pendientes,
  coalesce(c.monto_pagado, 0)::bigint      as monto_pagado,
  coalesce(c.saldo_pendiente, 0)::bigint   as saldo_pendiente,
  c.proxima_cuota,
  p.tipo_monto,
  p.archivado,
  p.archivado_en
from public.planes_cuotas p
left join lateral (
  select
    count(*) filter (where q.estado = 'pagada')                        as cuotas_pagadas,
    count(*) filter (where q.estado = 'pendiente')                     as cuotas_pendientes,
    -- Lo realmente pagado. Si por lo que sea faltara el importe real, se
    -- usa el programado para no perder la cuota del recuento.
    sum(coalesce(q.monto_pagado, q.monto_programado))
      filter (where q.estado = 'pagada')                               as monto_pagado,
    -- Lo que falta: siempre importes programados de las cuotas pendientes.
    sum(q.monto_programado) filter (where q.estado = 'pendiente')      as saldo_pendiente,
    min(q.fecha_vencimiento) filter (where q.estado = 'pendiente')     as proxima_cuota
  from public.cuotas_plan q
  where q.plan_id = p.id
) c on true
where p.user_id = auth.uid();

comment on view public.v_planes_cuotas_resumen is
  'Resumen por plan. monto_pagado = suma real de las cuotas pagadas; saldo_pendiente = suma programada de las pendientes.';

-- Que la vista respete la RLS de quien consulta, además del filtro explícito.
do $$
begin
  execute 'alter view public.v_planes_cuotas_resumen set (security_invoker = true)';
exception when others then
  raise notice 'Esta versión de PostgreSQL no admite security_invoker en vistas; la vista ya filtra por auth.uid().';
end
$$;

revoke all on public.v_planes_cuotas_resumen from anon;
grant select on public.v_planes_cuotas_resumen to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Editar una financiación existente
-- ----------------------------------------------------------------------------
--
-- Solo toca datos del plan y el importe PROGRAMADO de las cuotas PENDIENTES.
-- No existe ningún camino desde aquí a una cuota pagada ni a un movimiento.

create or replace function public.editar_plan_cuotas(
  p_plan_id              uuid,
  p_nombre               text,
  p_proveedor            text    default null,
  p_descripcion          text    default null,
  p_notas                text    default null,
  p_categoria_id         uuid    default null,
  p_cuenta_preferida_id  uuid    default null,
  p_tipo_monto           text    default null,
  p_monto_cuota          bigint  default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user         uuid := auth.uid();
  v_plan         public.planes_cuotas;
  v_tipo         text;
  v_pendientes   integer;
  v_total        bigint;
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  select * into v_plan
  from public.planes_cuotas
  where id = p_plan_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Esta financiación no existe o no es tuya.' using errcode = 'P0002';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'La financiación necesita un nombre.' using errcode = '22023';
  end if;

  v_tipo := coalesce(nullif(btrim(p_tipo_monto), ''), v_plan.tipo_monto);
  if v_tipo not in ('fijo', 'aproximado') then
    raise exception 'El tipo de cuota debe ser «fijo» o «aproximado».' using errcode = '22023';
  end if;

  -- La cuenta y la categoría tienen que ser del mismo usuario.
  if p_cuenta_preferida_id is not null
     and not exists (
       select 1 from public.cuentas
       where id = p_cuenta_preferida_id and user_id = v_user
     ) then
    raise exception 'Esa cuenta no existe o no es tuya.' using errcode = 'P0002';
  end if;

  if p_categoria_id is not null
     and not exists (
       select 1 from public.categorias
       where id = p_categoria_id and user_id = v_user
     ) then
    raise exception 'Esa categoría no existe o no es tuya.' using errcode = 'P0002';
  end if;

  if p_monto_cuota is not null and p_monto_cuota <= 0 then
    raise exception 'El monto de la cuota debe ser mayor que cero.' using errcode = '22023';
  end if;

  update public.planes_cuotas
  set nombre              = btrim(p_nombre),
      proveedor           = nullif(btrim(coalesce(p_proveedor, '')), ''),
      descripcion         = nullif(btrim(coalesce(p_descripcion, '')), ''),
      notas               = nullif(btrim(coalesce(p_notas, '')), ''),
      categoria_id        = p_categoria_id,
      cuenta_preferida_id = p_cuenta_preferida_id,
      tipo_monto          = v_tipo,
      updated_at          = now()
  where id = p_plan_id and user_id = v_user;

  -- El importe nuevo solo alcanza a lo que todavía no se pagó.
  if p_monto_cuota is not null then
    update public.cuotas_plan
    set monto_programado = p_monto_cuota,
        updated_at       = now()
    where plan_id = p_plan_id
      and user_id = v_user
      and estado = 'pendiente';

    get diagnostics v_pendientes = row_count;

    -- `monto_total` queda como la suma programada de TODAS las cuotas: lo
    -- realmente pagado vive en `monto_pagado`, no se mezcla aquí.
    select sum(monto_programado) into v_total
    from public.cuotas_plan
    where plan_id = p_plan_id and user_id = v_user;

    if v_total is not null then
      update public.planes_cuotas
      set monto_total = v_total,
          updated_at  = now()
      where id = p_plan_id and user_id = v_user;
    end if;
  end if;

  return p_plan_id;
end;
$$;

comment on function public.editar_plan_cuotas(uuid, text, text, text, text, uuid, uuid, text, bigint) is
  'Edita los datos de una financiación y, opcionalmente, el importe programado de sus cuotas PENDIENTES. Nunca toca cuotas pagadas, movimientos ni saldos.';

revoke all on function public.editar_plan_cuotas(uuid, text, text, text, text, uuid, uuid, text, bigint) from public, anon;
grant execute on function public.editar_plan_cuotas(uuid, text, text, text, text, uuid, uuid, text, bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Archivar y desarchivar
-- ----------------------------------------------------------------------------
--
-- Archivar es solo visibilidad: no cambia el estado, ni las cuotas, ni los
-- pagos, ni los movimientos, ni los saldos.

create or replace function public.archivar_plan_cuotas(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan public.planes_cuotas;
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  select * into v_plan
  from public.planes_cuotas
  where id = p_plan_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Esta financiación no existe o no es tuya.' using errcode = 'P0002';
  end if;

  -- La base no se fía del frontend: una financiación activa no se archiva.
  if v_plan.estado not in ('completado', 'cancelado') then
    raise exception
      'Solo se pueden archivar las financiaciones completadas o canceladas.'
      using errcode = 'P0001';
  end if;

  if v_plan.archivado then
    return p_plan_id;
  end if;

  update public.planes_cuotas
  set archivado    = true,
      archivado_en = now(),
      updated_at   = now()
  where id = p_plan_id and user_id = v_user;

  return p_plan_id;
end;
$$;

create or replace function public.desarchivar_plan_cuotas(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  update public.planes_cuotas
  set archivado    = false,
      archivado_en = null,
      updated_at   = now()
  where id = p_plan_id and user_id = v_user;

  if not found then
    raise exception 'Esta financiación no existe o no es tuya.' using errcode = 'P0002';
  end if;

  return p_plan_id;
end;
$$;

comment on function public.archivar_plan_cuotas(uuid) is
  'Saca del listado normal una financiación completada o cancelada. No cambia estado, cuotas, pagos ni saldos.';
comment on function public.desarchivar_plan_cuotas(uuid) is
  'Devuelve una financiación archivada al listado normal.';

revoke all on function public.archivar_plan_cuotas(uuid) from public, anon;
revoke all on function public.desarchivar_plan_cuotas(uuid) from public, anon;
grant execute on function public.archivar_plan_cuotas(uuid) to authenticated;
grant execute on function public.desarchivar_plan_cuotas(uuid) to authenticated;

commit;

-- ============================================================================
-- Comprobación rápida (opcional, solo lectura)
-- ============================================================================
--
--   select nombre, tipo_monto, archivado, archivado_en, estado, monto_total
--   from public.planes_cuotas order by fecha_compra desc;
--
--   select nombre, cuotas_pagadas, cuotas_pendientes, monto_pagado,
--          saldo_pendiente, tipo_monto, archivado
--   from public.v_planes_cuotas_resumen order by fecha_compra desc;
-- ============================================================================
