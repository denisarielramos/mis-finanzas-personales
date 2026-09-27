-- ============================================================================
-- Conciliación: candidatos conservadores y reversión exacta
-- ============================================================================
--
-- Qué hace esta migración
--   1. Crea `public.conciliaciones_movimientos_originales`: la copia del
--      estado ORIGINAL de cada movimiento antes de convertirlo en
--      transferencia.
--   2. Reemplaza `buscar_transferencias_potenciales`: ahora exige una señal
--      fuerte de transferencia, no solo importe y fecha.
--   3. Reemplaza `conciliar_transferencia`: valida la elegibilidad, guarda la
--      copia ANTES de tocar nada y hace todo en una sola transacción.
--   4. Crea `revertir_conciliacion`: deshace una conciliación devolviendo los
--      dos movimientos exactamente a su estado anterior.
--   5. Crea un disparador que impide anular un movimiento cuya conciliación
--      todavía se puede revertir: así el camino equivocado falla en vez de
--      dejar los dos movimientos anulados.
--
-- Qué NO hace
--   - NO toca `crear_transferencia`, `editar_transferencia` ni
--     `anular_transferencia`: las transferencias normales se comportan igual.
--   - NO toca `crear_movimiento`, `editar_movimiento`, `anular_movimiento`,
--     recurrentes, cuotas ni presupuestos.
--   - NO modifica ni «arregla» ningún dato histórico. Las conciliaciones
--     anteriores a esta migración no tienen copia y se quedan como están.
--   - NO crea, borra ni anula ningún movimiento.
--
-- Cómo ejecutarla
--   Supabase → SQL Editor → pegar este archivo entero → Run.
--   Es idempotente: se puede ejecutar más de una vez sin efectos extra.
--
-- ANTES de ejecutar, conviene guardar las definiciones actuales por si se
-- quiere volver atrás. Ejecutar esto aparte y guardar el resultado:
--
--     select p.oid::regprocedure as firma, pg_get_functiondef(p.oid) as definicion
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('buscar_transferencias_potenciales',
--                         'conciliar_transferencia',
--                         'anular_transferencia',
--                         'crear_transferencia');
--
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Copia del estado original de los movimientos conciliados
-- ----------------------------------------------------------------------------

create table if not exists public.conciliaciones_movimientos_originales (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  transferencia_id   uuid not null references public.transferencias (id) on delete cascade,
  movimiento_id      uuid not null references public.movimientos (id) on delete cascade,
  -- Qué mitad de la transferencia pasó a ser este movimiento.
  rol                text not null check (rol in ('salida', 'entrada')),

  -- Estado ORIGINAL, columna a columna, para poder restaurarlo tal cual.
  cuenta_id          uuid not null,
  categoria_id       uuid,
  tipo               text not null,
  monto              bigint not null,
  monto_firmado      bigint not null,
  fecha              date not null,
  descripcion        text,
  notas              text,
  origen             text,
  estado             text not null,
  conciliado         boolean,
  referencia_externa text,
  recurrente_id      uuid,
  cuota_plan_id      uuid,

  -- La fila entera tal como estaba, por si el esquema crece más adelante.
  snapshot           jsonb not null,

  creado_en          timestamptz not null default now(),
  -- Se rellena al revertir: impide restaurar dos veces la misma conciliación.
  restaurado_en      timestamptz,

  -- Un movimiento no puede tener dos copias para la misma transferencia…
  constraint conciliaciones_mov_orig_unico unique (movimiento_id, transferencia_id),
  -- …ni una transferencia dos salidas o dos entradas.
  constraint conciliaciones_mov_orig_rol_unico unique (transferencia_id, rol)
);

comment on table public.conciliaciones_movimientos_originales is
  'Estado original de los movimientos convertidos en transferencia por conciliación. Solo lo escriben conciliar_transferencia y revertir_conciliacion.';

create index if not exists conciliaciones_mov_orig_transferencia_idx
  on public.conciliaciones_movimientos_originales (transferencia_id);

-- Búsqueda del disparador de protección: solo las copias sin restaurar.
create index if not exists conciliaciones_mov_orig_pendientes_idx
  on public.conciliaciones_movimientos_originales (movimiento_id)
  where restaurado_en is null;

alter table public.conciliaciones_movimientos_originales enable row level security;

-- Solo el propietario ve sus copias. Escribir es cosa de las funciones.
drop policy if exists "conciliaciones_originales_propietario_select"
  on public.conciliaciones_movimientos_originales;
create policy "conciliaciones_originales_propietario_select"
  on public.conciliaciones_movimientos_originales
  for select
  using (auth.uid() = user_id);

revoke all on public.conciliaciones_movimientos_originales from anon, authenticated;
grant select on public.conciliaciones_movimientos_originales to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Ayudantes de texto (sin extensiones: no se depende de `unaccent`)
-- ----------------------------------------------------------------------------

create or replace function public.conc_normalizar_texto(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select translate(
    lower(coalesce(p_texto, '')),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

comment on function public.conc_normalizar_texto(text) is
  'Minúsculas y sin tildes, para comparar descripciones.';

-- Vocabulario que de verdad indica un movimiento entre cuentas propias.
-- Para afinar la conciliación, este es el único sitio que hay que tocar.
create or replace function public.conc_tiene_vocabulario_transferencia(p_texto text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select public.conc_normalizar_texto(p_texto) ~ (
    'transferenc'          -- transferencia, transferencias, transferencié…
    '|transfer'            -- transfer, transferir, transferido
    '|traspas'             -- traspaso, traspasar
    '|pasar dinero'
    '|pase de dinero'
    '|envio de dinero'
    '|envio a mi'
    '|entre cuentas'
    '|entre mis cuentas'
    '|movimiento entre cuentas'
    '|de mi cuenta'
    '|a mi cuenta'
    '|entre bancos'
  );
$$;

comment on function public.conc_tiene_vocabulario_transferencia(text) is
  'Señal fuerte: el texto habla explícitamente de mover dinero entre cuentas propias.';

-- Palabras con contenido, para comparar dos descripciones entre sí.
create or replace function public.conc_palabras_significativas(p_texto text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct palabra), '{}'::text[])
  from unnest(
    regexp_split_to_array(public.conc_normalizar_texto(p_texto), '[^a-z0-9]+')
  ) as palabra
  where length(palabra) >= 4
    and palabra not in (
      'para', 'pago', 'pagos', 'pagar', 'gasto', 'gastos', 'ingreso', 'ingresos',
      'cobro', 'cobros', 'compra', 'compras', 'monto', 'plata', 'dinero', 'saldo',
      'este', 'esta', 'esto', 'esos', 'esas', 'desde', 'hasta', 'sobre', 'como',
      'cuando', 'porque', 'mensual', 'dias', 'hoy', 'ayer', 'total', 'varios',
      'otro', 'otros', 'otra', 'otras', 'mano', 'obra', 'trabajo', 'nuevo', 'nueva'
    );
$$;

-- ¿El texto nombra esa cuenta? («Traspaso de Itaú a Ueno» nombra «Banco Itaú»).
create or replace function public.conc_menciona_cuenta(p_texto text, p_nombre_cuenta text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from unnest(
      regexp_split_to_array(public.conc_normalizar_texto(p_nombre_cuenta), '[^a-z0-9]+')
    ) as palabra
    where length(palabra) >= 4
      -- Palabras genéricas: «Banco Itaú» y «Banco Ueno» comparten «banco».
      and palabra not in (
        'banco', 'bancos', 'cuenta', 'cuentas', 'tarjeta', 'caja', 'ahorro',
        'ahorros', 'efectivo', 'billetera', 'corriente', 'credito', 'debito'
      )
      and public.conc_normalizar_texto(p_texto) like '%' || palabra || '%'
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Candidatos: se limpia cualquier versión anterior de las dos funciones
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('buscar_transferencias_potenciales', 'conciliar_transferencia')
  loop
    execute format('drop function if exists %s;', r.firma);
  end loop;
end
$$;

-- Nunca se proponen pares por importe y fecha: hace falta una señal fuerte.
create function public.buscar_transferencias_potenciales(p_dias_max integer default 1)
returns table (
  salida_id           uuid,
  entrada_id          uuid,
  cuenta_origen_id    uuid,
  cuenta_origen       text,
  cuenta_destino_id   uuid,
  cuenta_destino      text,
  monto               bigint,
  fecha_salida        date,
  fecha_entrada       date,
  diferencia_dias     integer,
  descripcion_salida  text,
  descripcion_entrada text,
  puntaje             integer,
  nivel               text,
  motivos             text[]
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with elegibles as (
    select
      m.id, m.cuenta_id, m.tipo, m.monto, m.fecha, m.descripcion,
      -- Todo el texto del movimiento cuenta como señal.
      concat_ws(' ', m.descripcion, m.notas, m.referencia_externa) as texto,
      c.nombre as cuenta_nombre
    from public.movimientos m
    join public.cuentas c on c.id = m.cuenta_id
    where m.user_id = auth.uid()
      and m.estado = 'confirmado'          -- ni anulados ni pendientes
      and m.transferencia_id is null       -- todavía no forma parte de una transferencia
      and coalesce(m.conciliado, false) = false
      and m.recurrente_id is null          -- nunca se propone lo que nació de un recurrente
      and m.cuota_plan_id is null          -- ni lo que nació de una cuota
      and m.tipo in ('gasto', 'ingreso')
      and m.monto > 0
  ),
  pares as (
    select
      s.id as salida_id,
      e.id as entrada_id,
      s.cuenta_id as cuenta_origen_id,
      s.cuenta_nombre as cuenta_origen,
      e.cuenta_id as cuenta_destino_id,
      e.cuenta_nombre as cuenta_destino,
      s.monto,
      s.fecha as fecha_salida,
      e.fecha as fecha_entrada,
      abs(e.fecha - s.fecha)::integer as diferencia_dias,
      s.descripcion as descripcion_salida,
      e.descripcion as descripcion_entrada,
      public.conc_tiene_vocabulario_transferencia(s.texto) as vocabulario_salida,
      public.conc_tiene_vocabulario_transferencia(e.texto) as vocabulario_entrada,
      (
        public.conc_menciona_cuenta(s.texto, e.cuenta_nombre)
        or public.conc_menciona_cuenta(e.texto, s.cuenta_nombre)
      ) as menciona_la_otra_cuenta,
      (
        public.conc_palabras_significativas(s.descripcion)
        && public.conc_palabras_significativas(e.descripcion)
      ) as descripciones_compatibles
    from elegibles s
    join elegibles e
      on e.tipo = 'ingreso'
     and s.tipo = 'gasto'
     and e.cuenta_id <> s.cuenta_id       -- cuentas propias distintas
     and e.monto = s.monto                -- mismo importe exacto
     -- Como máximo un día, aunque el cliente pida más.
     and abs(e.fecha - s.fecha) <= least(greatest(coalesce(p_dias_max, 1), 0), 1)
  ),
  puntuados as (
    select
      p.*,
      (
        case when p.vocabulario_salida or p.vocabulario_entrada then 3 else 0 end
        + case when p.vocabulario_salida and p.vocabulario_entrada then 2 else 0 end
        + case when p.menciona_la_otra_cuenta then 3 else 0 end
        + case when p.descripciones_compatibles then 1 else 0 end
        + case when p.diferencia_dias = 0 then 1 else 0 end
      )::integer as puntaje
    from pares p
  )
  select
    q.salida_id,
    q.entrada_id,
    q.cuenta_origen_id,
    q.cuenta_origen,
    q.cuenta_destino_id,
    q.cuenta_destino,
    q.monto,
    q.fecha_salida,
    q.fecha_entrada,
    q.diferencia_dias,
    q.descripcion_salida,
    q.descripcion_entrada,
    q.puntaje,
    case when q.puntaje >= 6 then 'alta' else 'media' end as nivel,
    (
      array_remove(array[
        case when q.vocabulario_salida and q.vocabulario_entrada
             then 'Las dos descripciones hablan de una transferencia'
             when q.vocabulario_salida or q.vocabulario_entrada
             then 'Una de las descripciones habla de una transferencia' end,
        case when q.menciona_la_otra_cuenta
             then 'Una descripción nombra la otra cuenta' end,
        case when q.descripciones_compatibles
             then 'Descripciones compatibles' end,
        case when q.diferencia_dias = 0 then 'Misma fecha'
             else 'Diferencia de 1 día' end,
        'Mismo importe en cuentas propias distintas'
      ], null)
    ) as motivos
  from puntuados q
  -- La señal fuerte es obligatoria: importe + fecha nunca llegan al umbral.
  where (q.vocabulario_salida or q.vocabulario_entrada or q.menciona_la_otra_cuenta)
    and q.puntaje >= 3
  order by q.puntaje desc, q.fecha_salida desc, q.monto desc;
$$;

comment on function public.buscar_transferencias_potenciales(integer) is
  'Pares que podrían ser una transferencia entre cuentas propias. Exige una señal fuerte en el texto: coincidir en importe y fecha no basta. La conciliación nunca es automática.';

-- ----------------------------------------------------------------------------
-- 4. Conciliar: guardar la copia ANTES de tocar nada
-- ----------------------------------------------------------------------------

create function public.conciliar_transferencia(
  p_movimiento_salida uuid,
  p_movimiento_entrada uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user             uuid := auth.uid();
  v_salida           public.movimientos;
  v_entrada          public.movimientos;
  v_transferencia_id uuid;
  v_movimientos_ajenos integer;
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  if p_movimiento_salida is null or p_movimiento_entrada is null then
    raise exception 'Hacen falta los dos movimientos.' using errcode = '22023';
  end if;

  if p_movimiento_salida = p_movimiento_entrada then
    raise exception 'Hay que elegir dos movimientos distintos.' using errcode = '22023';
  end if;

  -- Se bloquean los dos en orden estable: dos toques seguidos del botón no
  -- pueden crear dos transferencias con los mismos movimientos.
  perform 1
  from public.movimientos
  where id in (p_movimiento_salida, p_movimiento_entrada)
    and user_id = v_user
  order by id
  for update;

  select * into v_salida
  from public.movimientos
  where id = p_movimiento_salida and user_id = v_user;

  select * into v_entrada
  from public.movimientos
  where id = p_movimiento_entrada and user_id = v_user;

  if v_salida.id is null or v_entrada.id is null then
    raise exception 'Alguno de los movimientos ya no existe o no es tuyo.' using errcode = 'P0002';
  end if;

  -- A partir de aquí, cualquier cambio desde que se vio la sugerencia aborta
  -- la operación con un mensaje claro. No se concilia «a medias».
  if v_salida.estado <> 'confirmado' or v_entrada.estado <> 'confirmado' then
    raise exception 'Solo se pueden conciliar movimientos confirmados.' using errcode = 'P0001';
  end if;

  if v_salida.transferencia_id is not null or v_entrada.transferencia_id is not null then
    raise exception 'Alguno de los movimientos ya forma parte de una transferencia.' using errcode = 'P0001';
  end if;

  if coalesce(v_salida.conciliado, false) or coalesce(v_entrada.conciliado, false) then
    raise exception 'Alguno de los movimientos ya estaba conciliado.' using errcode = 'P0001';
  end if;

  if v_salida.recurrente_id is not null or v_entrada.recurrente_id is not null
     or v_salida.cuota_plan_id is not null or v_entrada.cuota_plan_id is not null then
    raise exception 'Los movimientos de recurrentes y de cuotas no se concilian.' using errcode = 'P0001';
  end if;

  if v_salida.tipo <> 'gasto' or v_entrada.tipo <> 'ingreso' then
    raise exception 'La conciliación necesita un gasto y un ingreso.' using errcode = 'P0001';
  end if;

  if v_salida.cuenta_id = v_entrada.cuenta_id then
    raise exception 'Los dos movimientos son de la misma cuenta.' using errcode = 'P0001';
  end if;

  if v_salida.monto <> v_entrada.monto or v_salida.monto <= 0 then
    raise exception 'Los importes no coinciden.' using errcode = 'P0001';
  end if;

  if abs(v_entrada.fecha - v_salida.fecha) > 1 then
    raise exception 'Las fechas se llevan más de un día.' using errcode = 'P0001';
  end if;

  insert into public.transferencias (
    user_id, cuenta_origen_id, cuenta_destino_id, monto, fecha, estado, referencia
  )
  values (
    v_user, v_salida.cuenta_id, v_entrada.cuenta_id, v_salida.monto, v_salida.fecha,
    'conciliada', 'CONCILIACION'
  )
  returning id into v_transferencia_id;

  -- Salvaguarda: si la base generase movimientos por su cuenta al insertar la
  -- transferencia, se aborta en vez de duplicar dinero.
  select count(*) into v_movimientos_ajenos
  from public.movimientos
  where transferencia_id = v_transferencia_id;

  if v_movimientos_ajenos > 0 then
    raise exception
      'La inserción en transferencias generó movimientos automáticamente; revisa los disparadores antes de usar la conciliación.'
      using errcode = 'P0001';
  end if;

  -- LA COPIA VA ANTES DE MODIFICAR NADA.
  insert into public.conciliaciones_movimientos_originales (
    user_id, transferencia_id, movimiento_id, rol,
    cuenta_id, categoria_id, tipo, monto, monto_firmado, fecha,
    descripcion, notas, origen, estado, conciliado, referencia_externa,
    recurrente_id, cuota_plan_id, snapshot
  )
  values
    (v_user, v_transferencia_id, v_salida.id, 'salida',
     v_salida.cuenta_id, v_salida.categoria_id, v_salida.tipo, v_salida.monto,
     v_salida.monto_firmado, v_salida.fecha, v_salida.descripcion, v_salida.notas,
     v_salida.origen, v_salida.estado, v_salida.conciliado, v_salida.referencia_externa,
     v_salida.recurrente_id, v_salida.cuota_plan_id, to_jsonb(v_salida)),
    (v_user, v_transferencia_id, v_entrada.id, 'entrada',
     v_entrada.cuenta_id, v_entrada.categoria_id, v_entrada.tipo, v_entrada.monto,
     v_entrada.monto_firmado, v_entrada.fecha, v_entrada.descripcion, v_entrada.notas,
     v_entrada.origen, v_entrada.estado, v_entrada.conciliado, v_entrada.referencia_externa,
     v_entrada.recurrente_id, v_entrada.cuota_plan_id, to_jsonb(v_entrada));

  -- El importe con signo no cambia: el patrimonio total queda igual.
  update public.movimientos
  set transferencia_id = v_transferencia_id,
      tipo             = 'transferencia_salida',
      categoria_id     = null,
      monto_firmado    = -abs(v_salida.monto),
      conciliado       = true,
      updated_at       = now()
  where id = v_salida.id and user_id = v_user;

  update public.movimientos
  set transferencia_id = v_transferencia_id,
      tipo             = 'transferencia_entrada',
      categoria_id     = null,
      monto_firmado    = abs(v_entrada.monto),
      conciliado       = true,
      updated_at       = now()
  where id = v_entrada.id and user_id = v_user;

  return v_transferencia_id;
end;
$$;

comment on function public.conciliar_transferencia(uuid, uuid) is
  'Convierte un gasto y un ingreso en una transferencia, guardando antes el estado original de ambos para poder revertirlo. Solo se llama tras confirmación manual.';

revoke all on function public.conciliar_transferencia(uuid, uuid) from public, anon;
grant execute on function public.conciliar_transferencia(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Revertir: devolver los dos movimientos exactamente a su estado anterior
-- ----------------------------------------------------------------------------

create or replace function public.revertir_conciliacion(p_transferencia_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user           uuid := auth.uid();
  v_transferencia  public.transferencias;
  v_copia          public.conciliaciones_movimientos_originales;
  v_restauradas    integer := 0;
begin
  if v_user is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  select * into v_transferencia
  from public.transferencias
  where id = p_transferencia_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Esta transferencia no existe o no es tuya.' using errcode = 'P0002';
  end if;

  -- Las copias se bloquean: dos toques seguidos no restauran dos veces.
  perform 1
  from public.conciliaciones_movimientos_originales
  where transferencia_id = p_transferencia_id
    and user_id = v_user
    and restaurado_en is null
  for update;

  if not found then
    raise exception
      'Esta transferencia no se puede revertir automáticamente: no se guardó el estado original de sus movimientos (conciliación anterior a esta mejora, o ya revertida).'
      using errcode = 'P0002';
  end if;

  for v_copia in
    select *
    from public.conciliaciones_movimientos_originales
    where transferencia_id = p_transferencia_id
      and user_id = v_user
      and restaurado_en is null
    order by rol
  loop
    update public.movimientos
    set cuenta_id          = v_copia.cuenta_id,
        categoria_id       = v_copia.categoria_id,
        tipo               = v_copia.tipo,
        monto              = v_copia.monto,
        monto_firmado      = v_copia.monto_firmado,
        fecha              = v_copia.fecha,
        descripcion        = v_copia.descripcion,
        notas              = v_copia.notas,
        origen             = v_copia.origen,
        estado             = v_copia.estado,
        conciliado         = v_copia.conciliado,
        referencia_externa = v_copia.referencia_externa,
        recurrente_id      = v_copia.recurrente_id,
        cuota_plan_id      = v_copia.cuota_plan_id,
        transferencia_id   = null,
        updated_at         = now()
    where id = v_copia.movimiento_id
      and user_id = v_user;

    if not found then
      raise exception 'El movimiento original ya no existe: no se puede revertir la conciliación.'
        using errcode = 'P0002';
    end if;

    v_restauradas := v_restauradas + 1;
  end loop;

  if v_restauradas <> 2 then
    raise exception 'La copia de esta conciliación está incompleta (% de 2): no se revierte nada.', v_restauradas
      using errcode = 'P0001';
  end if;

  -- La copia se conserva como historial; solo se marca como usada.
  update public.conciliaciones_movimientos_originales
  set restaurado_en = now()
  where transferencia_id = p_transferencia_id
    and user_id = v_user
    and restaurado_en is null;

  update public.transferencias
  set estado     = 'cancelada',
      updated_at = now()
  where id = p_transferencia_id
    and user_id = v_user;

  return p_transferencia_id;
end;
$$;

comment on function public.revertir_conciliacion(uuid) is
  'Deshace una conciliación: devuelve los dos movimientos a su estado original y marca la transferencia como cancelada. No sirve para transferencias creadas a mano ni para conciliaciones sin copia.';

revoke all on function public.revertir_conciliacion(uuid) from public, anon;
grant execute on function public.revertir_conciliacion(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Red de seguridad: una conciliación reversible no se anula, se revierte
-- ----------------------------------------------------------------------------

create or replace function public.conc_proteger_movimiento_conciliado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'anulado'
     and coalesce(old.estado, '') <> 'anulado'
     and exists (
       select 1
       from public.conciliaciones_movimientos_originales c
       where c.movimiento_id = old.id
         and c.restaurado_en is null
     ) then
    raise exception
      'Este movimiento forma parte de una transferencia creada por conciliación: usa «Revertir conciliación» para devolverlo a su estado original en lugar de anularlo.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.conc_proteger_movimiento_conciliado() is
  'Impide que anular la transferencia deje anulados los dos movimientos originales de una conciliación reversible.';

drop trigger if exists movimientos_proteger_conciliados on public.movimientos;
create trigger movimientos_proteger_conciliados
  before update on public.movimientos
  for each row
  execute function public.conc_proteger_movimiento_conciliado();

commit;

-- ============================================================================
-- Comprobación rápida (opcional, solo lectura)
-- ============================================================================
--
--   -- Conciliaciones que ya se pueden revertir:
--   select transferencia_id, rol, descripcion, tipo, estado, restaurado_en
--   from public.conciliaciones_movimientos_originales
--   order by creado_en desc;
--
--   -- Conciliaciones antiguas SIN copia (se quedan como están):
--   select t.id, t.fecha, t.monto, t.estado
--   from public.transferencias t
--   where t.referencia = 'CONCILIACION'
--     and not exists (
--       select 1 from public.conciliaciones_movimientos_originales c
--       where c.transferencia_id = t.id
--     );
-- ============================================================================
