import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type {
  EstadoMovimiento,
  FechaISO,
  MontoPYG,
  Movimiento,
  TipoMovimiento,
  UUID,
} from '../types/db'

/**
 * Movimientos (`public.movimientos`).
 *
 * Las altas, ediciones y anulaciones SIEMPRE pasan por los RPC de PostgreSQL
 * (`crear_movimiento`, `editar_movimiento`, `anular_movimiento`), que son los
 * que conocen la lógica financiera: signo del importe (`monto_firmado`),
 * estados y consistencia. React nunca duplica esa lógica ni escribe la tabla
 * directamente.
 */

export type FiltroMovimientos = 'todos' | 'gastos' | 'ingresos' | 'transferencias'

const TIPOS_POR_FILTRO: Record<FiltroMovimientos, TipoMovimiento[] | null> = {
  todos: null,
  gastos: ['gasto'],
  ingresos: ['ingreso'],
  transferencias: ['transferencia_salida', 'transferencia_entrada'],
}

export interface ConsultaMovimientos {
  desde?: FechaISO
  hasta?: FechaISO
  filtro?: FiltroMovimientos
  cuentaId?: UUID | null
  categoriaId?: UUID | null
  estados?: EstadoMovimiento[]
  incluirAnulados?: boolean
  limite?: number
  desplazamiento?: number
}

function normalizar(fila: Record<string, unknown>): Movimiento {
  return {
    ...(fila as unknown as Movimiento),
    monto: aMonto(fila.monto),
    monto_firmado: aMonto(fila.monto_firmado),
  }
}

/** Listado de movimientos ordenado por fecha (y `created_at` para desempatar). */
export async function listarMovimientos(opciones: ConsultaMovimientos = {}): Promise<Movimiento[]> {
  const {
    desde,
    hasta,
    filtro = 'todos',
    cuentaId,
    categoriaId,
    estados,
    incluirAnulados = false,
    limite = 100,
    desplazamiento = 0,
  } = opciones

  let consulta = supabase
    .from('movimientos')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .range(desplazamiento, desplazamiento + limite - 1)

  if (desde) consulta = consulta.gte('fecha', desde)
  if (hasta) consulta = consulta.lte('fecha', hasta)
  if (cuentaId) consulta = consulta.eq('cuenta_id', cuentaId)
  if (categoriaId) consulta = consulta.eq('categoria_id', categoriaId)

  const tipos = TIPOS_POR_FILTRO[filtro]
  if (tipos) consulta = consulta.in('tipo', tipos)

  if (estados && estados.length > 0) consulta = consulta.in('estado', estados)
  else if (!incluirAnulados) consulta = consulta.neq('estado', 'anulado')

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar los movimientos.')
  return (data ?? []).map(normalizar)
}

export async function obtenerMovimiento(id: UUID): Promise<Movimiento | null> {
  const { data, error } = await supabase.from('movimientos').select('*').eq('id', id).maybeSingle()
  lanzarSiError(error, 'No se pudo cargar el movimiento.')
  return data ? normalizar(data) : null
}

/** Movimientos que pertenecen a un conjunto de transferencias. */
export async function listarMovimientosDeTransferencia(
  transferenciaId: UUID,
): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('transferencia_id', transferenciaId)
    .order('tipo', { ascending: true })

  lanzarSiError(error, 'No se pudieron cargar los movimientos de la transferencia.')
  return (data ?? []).map(normalizar)
}

export interface DatosMovimiento {
  cuentaId: UUID
  tipo: 'ingreso' | 'gasto'
  /** Siempre POSITIVO: la base calcula `monto_firmado`. */
  monto: MontoPYG
  categoriaId: UUID | null
  fecha: FechaISO
  descripcion: string | null
  notas: string | null
}

/** RPC `crear_movimiento` — alta de un ingreso o un gasto. */
export async function crearMovimiento(datos: DatosMovimiento): Promise<unknown> {
  const { data, error } = await supabase.rpc('crear_movimiento', {
    p_cuenta_id: datos.cuentaId,
    p_tipo: datos.tipo,
    p_monto: datos.monto,
    p_categoria_id: datos.categoriaId,
    p_fecha: datos.fecha,
    p_descripcion: datos.descripcion?.trim() || null,
    p_notas: datos.notas?.trim() || null,
  })
  lanzarSiError(error, 'No se pudo guardar el movimiento.')
  return data
}

/** RPC `editar_movimiento` — edición de un ingreso o un gasto. */
export async function editarMovimiento(id: UUID, datos: DatosMovimiento): Promise<unknown> {
  const { data, error } = await supabase.rpc('editar_movimiento', {
    p_movimiento_id: id,
    p_cuenta_id: datos.cuentaId,
    p_tipo: datos.tipo,
    p_monto: datos.monto,
    p_categoria_id: datos.categoriaId,
    p_fecha: datos.fecha,
    p_descripcion: datos.descripcion?.trim() || null,
    p_notas: datos.notas?.trim() || null,
  })
  lanzarSiError(error, 'No se pudo actualizar el movimiento.')
  return data
}

/**
 * RPC `anular_movimiento` — en la interfaz se llama «Eliminar», pero nunca se
 * borra físicamente: el movimiento queda en estado `anulado`.
 */
export async function anularMovimiento(id: UUID): Promise<void> {
  const { error } = await supabase.rpc('anular_movimiento', { p_movimiento_id: id })
  lanzarSiError(error, 'No se pudo eliminar el movimiento.')
}

export interface ResumenPeriodo {
  ingresos: MontoPYG
  gastos: MontoPYG
  balance: MontoPYG
  /** Gasto acumulado por categoría (clave `sin-categoria` para los que no tienen). */
  gastoPorCategoria: Map<string, MontoPYG>
  cantidadMovimientos: number
}

export const SIN_CATEGORIA = 'sin-categoria'

/**
 * Resumen de un periodo.
 *
 * Regla contable: solo cuentan `tipo = ingreso` y `tipo = gasto` con
 * `estado = confirmado`. Las transferencias entre cuentas propias NO son
 * ingreso ni gasto, así que quedan fuera por construcción.
 */
export async function resumenPeriodo(desde: FechaISO, hasta: FechaISO): Promise<ResumenPeriodo> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('tipo, monto, categoria_id')
    .in('tipo', ['ingreso', 'gasto'])
    .eq('estado', 'confirmado')
    .gte('fecha', desde)
    .lte('fecha', hasta)

  lanzarSiError(error, 'No se pudo calcular el resumen del mes.')

  const resumen: ResumenPeriodo = {
    ingresos: 0,
    gastos: 0,
    balance: 0,
    gastoPorCategoria: new Map(),
    cantidadMovimientos: data?.length ?? 0,
  }

  for (const fila of data ?? []) {
    const monto = aMonto((fila as Record<string, unknown>).monto)
    const tipo = (fila as Record<string, unknown>).tipo as TipoMovimiento

    if (tipo === 'ingreso') {
      resumen.ingresos += monto
    } else if (tipo === 'gasto') {
      resumen.gastos += monto
      const clave = ((fila as Record<string, unknown>).categoria_id as string | null) ?? SIN_CATEGORIA
      resumen.gastoPorCategoria.set(clave, (resumen.gastoPorCategoria.get(clave) ?? 0) + monto)
    }
  }

  resumen.balance = resumen.ingresos - resumen.gastos
  return resumen
}

/** Gastos confirmados de un conjunto de categorías dentro de un rango (presupuestos). */
export async function gastoPorCategorias(
  desde: FechaISO,
  hasta: FechaISO,
  categoriaIds: UUID[],
): Promise<Map<UUID, MontoPYG>> {
  const acumulado = new Map<UUID, MontoPYG>()
  if (categoriaIds.length === 0) return acumulado

  const { data, error } = await supabase
    .from('movimientos')
    .select('categoria_id, monto')
    .eq('tipo', 'gasto')
    .eq('estado', 'confirmado')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .in('categoria_id', categoriaIds)

  lanzarSiError(error, 'No se pudo calcular el gasto de los presupuestos.')

  for (const fila of data ?? []) {
    const id = (fila as Record<string, unknown>).categoria_id as UUID | null
    if (!id) continue
    acumulado.set(id, (acumulado.get(id) ?? 0) + aMonto((fila as Record<string, unknown>).monto))
  }

  return acumulado
}
