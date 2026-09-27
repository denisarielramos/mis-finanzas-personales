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
--   5. Añade `p_tipo_monto` a `crear_plan_cuotas`, para que una financiación
--      aproximada nazca así en la misma transacción que crea el plan.
--   6. Hace que `confirmar_cuota_plan` imponga la regla: una cuota fija se
--      paga por su monto programado y una aproximada exige el monto real.
--
-- Sobre los pasos 5 y 6
--   Las dos funciones existentes NO se reescriben. Se les cambia el nombre a
--   `*_base` y encima queda una envoltura que valida y delega, así que el
--   comportamiento actual (la generación de cuotas, el registro del pago) es
--   literalmente el mismo código de producción. Al renombrar, cada nombre
--   público queda con UNA sola función: no hay sobrecargas ambiguas. Las
--   `*_base` dejan de ser ejecutables por `authenticated`, así que no hay
--   forma de esquivar las validaciones nuevas.
--
-- Qué NO hace
--   - NO reescribe la lógica de `crear_plan_cuotas` ni de
--     `confirmar_cuota_plan`, ni toca `revertir_pago_cuota` o
--     `cancelar_plan_cuotas`.
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
-- 2. Resumen: se conserva la semántica actual y se añaden las tres columnas
-- ----------------------------------------------------------------------------
--
-- La vista de producción ya calcula `monto_pagado` como la suma real de las
-- cuotas pagadas y `saldo_pendiente` como la suma programada de las
-- pendientes: eso NO cambia. Se rehace solo para exponer `tipo_monto`,
-- `archivado` y `archivado_en`, porque `create or replace view` no permite
-- añadir columnas en medio de la lista.

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
  coalesce(c.cuotas_pagadas, 0)::integer    as cuotas_pagadas,
  coalesce(c.cuotas_pendientes, 0)::integer as cuotas_pendientes,
  coalesce(c.monto_pagado, 0)::bigint       as monto_pagado,
  coalesce(c.saldo_pendiente, 0)::bigint    as saldo_pendiente,
  c.proxima_cuota,
  p.tipo_monto,
  p.archivado,
  p.archivado_en
from public.planes_cuotas p
left join lateral (
  select
    count(*) filter (where q.estado = 'pagada')                    as cuotas_pagadas,
    count(*) filter (where q.estado = 'pendiente')                 as cuotas_pendientes,
    -- Misma semántica que ya tenía la vista en producción: lo pagado es
    -- real y lo pendiente es programado. `confirmar_cuota_plan` garantiza
    -- `monto_pagado` al pagar, así que no hace falta ningún respaldo.
    sum(q.monto_pagado) filter (where q.estado = 'pagada')         as monto_pagado,
    sum(q.monto_programado) filter (where q.estado = 'pendiente')  as saldo_pendiente,
    min(q.fecha_vencimiento) filter (where q.estado = 'pendiente') as proxima_cuota
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

-- ----------------------------------------------------------------------------
-- 5. Crear el plan ya con su modalidad, en una sola transacción
-- ----------------------------------------------------------------------------
--
-- La función que genera el plan y sus cuotas NO se reescribe: se le cambia el
-- nombre a `crear_plan_cuotas_base` y encima queda una nueva
-- `crear_plan_cuotas` con un parámetro más. Así:
--
--   - la generación de cuotas sigue siendo exactamente la de producción,
--     porque es literalmente el mismo código;
--   - solo existe UNA función llamada `crear_plan_cuotas`, sin sobrecargas
--     ambiguas para PostgREST;
--   - quien no mande `p_tipo_monto` sigue creando planes fijos;
--   - el plan nace con su modalidad dentro de la MISMA transacción: si algo
--     falla, no queda ningún plan a medias.

do $$
declare
  v_vieja text := 'public.crear_plan_cuotas(text, bigint, integer, date, date, text, uuid, uuid, smallint, text, text)';
  v_base  text := 'public.crear_plan_cuotas_base(text, bigint, integer, date, date, text, uuid, uuid, smallint, text, text)';
  v_oid   oid;
begin
  -- Primera ejecución: se aparta la original. En las siguientes ya está hecho.
  if to_regprocedure(v_base) is null then
    if to_regprocedure(v_vieja) is null then
      raise exception
        'No se encontró %. Revisa la firma real con \df crear_plan_cuotas y ajusta esta migración antes de ejecutarla.',
        v_vieja;
    end if;
    execute format('alter function %s rename to crear_plan_cuotas_base', v_vieja);
  end if;

  -- La envoltura espera un uuid: si la original devolviera otra cosa, mejor
  -- parar aquí que romper la creación de planes más tarde.
  v_oid := to_regprocedure(v_base);
  if pg_get_function_result(v_oid) <> 'uuid' then
    raise exception
      'crear_plan_cuotas devuelve % y esta migración espera uuid. Avisa antes de ejecutarla.',
      pg_get_function_result(v_oid);
  end if;
end
$$;

-- Nadie llama a la base directamente: el único camino es la envoltura.
revoke all on function public.crear_plan_cuotas_base(
  text, bigint, integer, date, date, text, uuid, uuid, smallint, text, text
) from public, anon, authenticated;

create or replace function public.crear_plan_cuotas(
  p_nombre              text,
  p_monto_total         bigint,
  p_cantidad_cuotas     integer,
  p_fecha_compra        date,
  p_fecha_primera_cuota date,
  p_proveedor           text     default null,
  p_categoria_id        uuid     default null,
  p_cuenta_preferida_id uuid     default null,
  p_frecuencia_meses    smallint default 1,
  p_descripcion         text     default null,
  p_notas               text     default null,
  p_tipo_monto          text     default 'fijo'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_tipo text := coalesce(nullif(btrim(p_tipo_monto), ''), 'fijo');
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  if v_tipo not in ('fijo', 'aproximado') then
    raise exception 'El tipo de cuota debe ser «fijo» o «aproximado».' using errcode = '22023';
  end if;

  -- El plan y todas sus cuotas los sigue generando el código de siempre.
  v_id := public.crear_plan_cuotas_base(
    p_nombre, p_monto_total, p_cantidad_cuotas, p_fecha_compra, p_fecha_primera_cuota,
    p_proveedor, p_categoria_id, p_cuenta_preferida_id, p_frecuencia_meses,
    p_descripcion, p_notas
  );

  -- Misma transacción: o queda el plan con su modalidad, o no queda nada.
  if v_tipo <> 'fijo' then
    update public.planes_cuotas
    set tipo_monto = v_tipo,
        updated_at = now()
    where id = v_id and user_id = v_user;

    if not found then
      raise exception 'No se pudo fijar la modalidad del plan recién creado.' using errcode = 'P0001';
    end if;
  end if;

  return v_id;
end;
$$;

comment on function public.crear_plan_cuotas(
  text, bigint, integer, date, date, text, uuid, uuid, smallint, text, text, text
) is
  'Crea una financiación con su modalidad («fijo» por defecto) en una sola transacción. La generación de cuotas es la de crear_plan_cuotas_base, que no se modifica.';

revoke all on function public.crear_plan_cuotas(
  text, bigint, integer, date, date, text, uuid, uuid, smallint, text, text, text
) from public, anon;
grant execute on function public.crear_plan_cuotas(
  text, bigint, integer, date, date, text, uuid, uuid, smallint, text, text, text
) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. La base impone la regla de cuota fija
-- ----------------------------------------------------------------------------
--
-- Hoy `confirmar_cuota_plan` acepta cualquier `p_monto_real`, así que llamar
-- al RPC a mano permitiría pagar una cuota contractual por otro importe.
-- Mismo método que arriba: la función real se aparta como
-- `confirmar_cuota_plan_base` y la nueva valida y delega. Todo lo que ya hacía
-- (bloqueo, propiedad, estado pendiente, plan activo, cuenta preferida,
-- crear_movimiento, vínculo de la cuota, monto_pagado, fecha_pago,
-- movimiento_id y completar el plan) se conserva intacto.

do $$
declare
  v_firma text;
  v_base  text;
  v_cuantas integer;
begin
  select count(*) into v_cuantas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'confirmar_cuota_plan_base';

  if v_cuantas = 0 then
    select count(*), min(p.oid::regprocedure::text) into v_cuantas, v_firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'confirmar_cuota_plan';

    if v_cuantas <> 1 then
      raise exception
        'Se esperaba exactamente una función confirmar_cuota_plan en public y hay %. Revisa con \df confirmar_cuota_plan antes de ejecutar esta migración.',
        v_cuantas;
    end if;

    execute format('alter function %s rename to confirmar_cuota_plan_base', v_firma);
  end if;

  select p.oid::regprocedure::text into v_base
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'confirmar_cuota_plan_base';

  execute format('revoke all on function %s from public, anon, authenticated', v_base);
end
$$;

create or replace function public.confirmar_cuota_plan(
  p_cuota_id    uuid,
  p_cuenta_id   uuid   default null,
  p_monto_real  bigint default null,
  p_fecha_pago  date   default null,
  p_descripcion text   default null,
  p_notas       text   default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_cuota public.cuotas_plan;
  v_tipo  text;
  v_monto bigint;
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  -- Se lee bloqueando, igual que hace la función original.
  select * into v_cuota
  from public.cuotas_plan
  where id = p_cuota_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Esta cuota no existe o no es tuya.' using errcode = 'P0002';
  end if;

  select tipo_monto into v_tipo
  from public.planes_cuotas
  where id = v_cuota.plan_id and user_id = v_user;

  if v_tipo is null then
    raise exception 'La financiación de esta cuota no existe o no es tuya.' using errcode = 'P0002';
  end if;

  if v_tipo = 'aproximado' then
    -- En una aproximada el importe se registra a conciencia: no se supone.
    if p_monto_real is null or p_monto_real <= 0 then
      raise exception
        'Esta cuota es aproximada: indica el monto realmente pagado.'
        using errcode = '22023';
    end if;
    v_monto := p_monto_real;
  else
    -- Fija: el importe es el contractual, venga lo que venga.
    if p_monto_real is not null and p_monto_real <> v_cuota.monto_programado then
      raise exception
        'Esta cuota es fija y debe pagarse por el monto programado.'
        using errcode = '22023';
    end if;
    v_monto := v_cuota.monto_programado;
  end if;

  -- El pago lo sigue registrando el código de siempre.
  return public.confirmar_cuota_plan_base(
    p_cuota_id, p_cuenta_id, v_monto, p_fecha_pago, p_descripcion, p_notas
  );
end;
$$;

comment on function public.confirmar_cuota_plan(uuid, uuid, bigint, date, text, text) is
  'Registra el pago de una cuota. En un plan fijo obliga a pagar el monto programado; en uno aproximado exige el monto realmente pagado. El resto lo hace confirmar_cuota_plan_base, que no se modifica.';

revoke all on function public.confirmar_cuota_plan(uuid, uuid, bigint, date, text, text) from public, anon;
grant execute on function public.confirmar_cuota_plan(uuid, uuid, bigint, date, text, text) to authenticated;

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
