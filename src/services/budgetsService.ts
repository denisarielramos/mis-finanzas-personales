import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { Categoria, FechaISO, MontoPYG, Movimiento, Presupuesto, UUID } from '../types/db'
import { idUsuarioActual } from './authService'
import { idsConDescendientes } from './categoriesService'
import { gastoPorCategorias, listarMovimientos } from './movementsService'

/**
 * Presupuestos (`public.presupuestos`).
 *
 * Lo consumido se calcula únicamente con movimientos
 * `tipo = gasto` y `estado = confirmado` dentro del rango del presupuesto.
 * Las transferencias nunca consumen presupuesto.
 */

function normalizar(fila: Record<string, unknown>): Presupuesto {
  return {
    ...(fila as unknown as Presupuesto),
    monto_limite: aMonto(fila.monto_limite),
  }
}

export async function listarPresupuestos(soloActivos = false): Promise<Presupuesto[]> {
  let consulta = supabase
    .from('presupuestos')
    .select('*')
    .order('fecha_desde', { ascending: false })

  if (soloActivos) consulta = consulta.eq('activo', true)

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar los presupuestos.')
  return (data ?? []).map(normalizar)
}

export async function obtenerPresupuesto(id: UUID): Promise<Presupuesto | null> {
  const { data, error } = await supabase
    .from('presupuestos')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  lanzarSiError(error, 'No se pudo cargar el presupuesto.')
  return data ? normalizar(data as Record<string, unknown>) : null
}

export interface DatosPresupuesto {
  categoria_id: UUID
  monto_limite: MontoPYG
  fecha_desde: FechaISO
  fecha_hasta: FechaISO
  activo: boolean
}

export async function crearPresupuesto(datos: DatosPresupuesto): Promise<Presupuesto> {
  const userId = await idUsuarioActual()

  const { data, error } = await supabase
    .from('presupuestos')
    .insert({ user_id: userId, ...datos })
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo crear el presupuesto.')
  return normalizar(data as Record<string, unknown>)
}

export async function actualizarPresupuesto(
  id: UUID,
  datos: Partial<DatosPresupuesto>,
): Promise<Presupuesto> {
  const { data, error } = await supabase
    .from('presupuestos')
    .update(datos)
    .eq('id', id)
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo actualizar el presupuesto.')
  return normalizar(data as Record<string, unknown>)
}

export async function cambiarEstadoPresupuesto(id: UUID, activo: boolean): Promise<void> {
  const { error } = await supabase.from('presupuestos').update({ activo }).eq('id', id)
  lanzarSiError(
    error,
    activo ? 'No se pudo activar el presupuesto.' : 'No se pudo desactivar el presupuesto.',
  )
}

/**
 * Gasto consumido por cada presupuesto.
 *
 * Si la categoría del presupuesto tiene subcategorías, el gasto de las
 * subcategorías también consume el presupuesto del padre.
 */
export async function calcularConsumos(
  presupuestos: Presupuesto[],
  categorias: Categoria[],
): Promise<Map<UUID, MontoPYG>> {
  const consumos = new Map<UUID, MontoPYG>()
  if (presupuestos.length === 0) return consumos

  // Se agrupan los presupuestos por rango de fechas para hacer una sola
  // consulta por rango en lugar de una por presupuesto.
  const porRango = new Map<string, Presupuesto[]>()
  for (const p of presupuestos) {
    const clave = `${p.fecha_desde}|${p.fecha_hasta}`
    const lista = porRango.get(clave) ?? []
    lista.push(p)
    porRango.set(clave, lista)
  }

  const idsPorPresupuesto = new Map<UUID, UUID[]>()
  for (const p of presupuestos) {
    idsPorPresupuesto.set(p.id, idsConDescendientes(categorias, p.categoria_id))
  }

  await Promise.all(
    [...porRango.entries()].map(async ([clave, lista]) => {
      const [desde, hasta] = clave.split('|') as [FechaISO, FechaISO]
      const idsUnicos = [
        ...new Set(lista.flatMap((p) => idsPorPresupuesto.get(p.id) ?? [p.categoria_id])),
      ]
      const gastos = await gastoPorCategorias(desde, hasta, idsUnicos)

      for (const p of lista) {
        const ids = idsPorPresupuesto.get(p.id) ?? [p.categoria_id]
        const total = ids.reduce((suma, id) => suma + (gastos.get(id) ?? 0), 0)
        consumos.set(p.id, total)
      }
    }),
  )

  return consumos
}

export interface DetallePresupuesto {
  presupuesto: Presupuesto
  /** Categoría del presupuesto y todas sus descendientes. */
  categoriaIds: UUID[]
  /** Gastos reales que consumen el presupuesto, de más reciente a más antiguo. */
  movimientos: Movimiento[]
  /** Suma de esos gastos; coincide con lo que devuelve `calcularConsumos`. */
  gastado: MontoPYG
}

/**
 * Detalle de un presupuesto con los gastos que lo consumen.
 *
 * Aplica exactamente las mismas reglas que `calcularConsumos`, reutilizando
 * `listarMovimientos` e `idsConDescendientes`: `tipo = gasto`,
 * `estado = confirmado`, dentro del rango y en la categoría del presupuesto
 * o en alguna de sus subcategorías. Quedan fuera transferencias, ingresos y
 * movimientos anulados; las cuotas y los recurrentes pendientes ni siquiera
 * existen en `public.movimientos`.
 */
export async function obtenerDetallePresupuesto(
  id: UUID,
  categorias: Categoria[],
): Promise<DetallePresupuesto | null> {
  const presupuesto = await obtenerPresupuesto(id)
  if (!presupuesto) return null

  const categoriaIds = idsConDescendientes(categorias, presupuesto.categoria_id)
  const permitidas = new Set(categoriaIds)

  const gastos = await listarMovimientos({
    desde: presupuesto.fecha_desde,
    hasta: presupuesto.fecha_hasta,
    filtro: 'gastos',
    estados: ['confirmado'],
    limite: 1000,
  })

  const movimientos = gastos.filter((m) => m.categoria_id && permitidas.has(m.categoria_id))
  const gastado = movimientos.reduce((total, m) => total + m.monto, 0)

  return { presupuesto, categoriaIds, movimientos, gastado }
}
