import { supabase } from '../lib/supabase'
import { ErrorApp, lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type {
  CuotaPlan,
  EstadoPlanCuotas,
  FechaISO,
  MontoPYG,
  PlanCuotas,
  PlanCuotasResumen,
  TipoMontoCuota,
  UUID,
} from '../types/db'

/**
 * Planes de cuotas (`public.planes_cuotas`, `public.cuotas_plan`) y su
 * resumen (`public.v_planes_cuotas_resumen`).
 *
 * Una cuota pendiente es una PREVISIÓN: no existe en `public.movimientos` y
 * no afecta a ningún saldo. El gasto real solo lo crea el RPC
 * `confirmar_cuota_plan`.
 *
 * Los planes y sus cuotas los genera íntegramente la base con
 * `crear_plan_cuotas`: el frontend nunca inserta cuotas a mano.
 */

/**
 * Mientras la migración de cuotas no se haya ejecutado, la vista todavía no
 * trae `tipo_monto` ni `archivado`: se asumen los valores por defecto, que son
 * exactamente los que la migración deja en los planes existentes.
 */
/**
 * Códigos con los que las funciones de cuotas explican por qué no se puede
 * seguir. Ese texto es más útil que el mensaje genérico, así que se muestra.
 */
const CODIGOS_CON_MOTIVO = new Set(['P0001', 'P0002', '22023'])

function lanzarConMotivo(error: unknown, respaldo: string): void {
  if (!error) return
  const err = error as { code?: string; message?: string }
  if (err.code && CODIGOS_CON_MOTIVO.has(err.code) && err.message) {
    throw new ErrorApp(err.message, error)
  }
  lanzarSiError(error, respaldo)
}

function tipoMontoDe(valor: unknown): TipoMontoCuota {
  return valor === 'aproximado' ? 'aproximado' : 'fijo'
}

function normalizarResumen(fila: Record<string, unknown>): PlanCuotasResumen {
  return {
    ...(fila as unknown as PlanCuotasResumen),
    monto_total: aMonto(fila.monto_total),
    monto_pagado: aMonto(fila.monto_pagado),
    saldo_pendiente: aMonto(fila.saldo_pendiente),
    cantidad_cuotas: Number(fila.cantidad_cuotas ?? 0),
    cuotas_pagadas: Number(fila.cuotas_pagadas ?? 0),
    cuotas_pendientes: Number(fila.cuotas_pendientes ?? 0),
    frecuencia_meses: Number(fila.frecuencia_meses ?? 1),
    tipo_monto: tipoMontoDe(fila.tipo_monto),
    archivado: fila.archivado === true,
    archivado_en: (fila.archivado_en as string | null) ?? null,
  }
}

function normalizarCuota(fila: Record<string, unknown>): CuotaPlan {
  return {
    ...(fila as unknown as CuotaPlan),
    numero: Number(fila.numero ?? 0),
    monto_programado: aMonto(fila.monto_programado),
    monto_pagado: fila.monto_pagado === null ? null : aMonto(fila.monto_pagado),
  }
}

function normalizarPlan(fila: Record<string, unknown>): PlanCuotas {
  return {
    ...(fila as unknown as PlanCuotas),
    monto_total: aMonto(fila.monto_total),
    cantidad_cuotas: Number(fila.cantidad_cuotas ?? 0),
    frecuencia_meses: Number(fila.frecuencia_meses ?? 1),
    tipo_monto: tipoMontoDe(fila.tipo_monto),
    archivado: fila.archivado === true,
    archivado_en: (fila.archivado_en as string | null) ?? null,
  }
}

/** Listado de planes desde la vista de resumen. */
export async function listarPlanes(estado?: EstadoPlanCuotas): Promise<PlanCuotasResumen[]> {
  let consulta = supabase
    .from('v_planes_cuotas_resumen')
    .select('*')
    .order('estado', { ascending: true })
    .order('fecha_compra', { ascending: false })

  if (estado) consulta = consulta.eq('estado', estado)

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar los planes de cuotas.')
  return (data ?? []).map(normalizarResumen)
}

export async function obtenerPlanResumen(id: UUID): Promise<PlanCuotasResumen | null> {
  const { data, error } = await supabase
    .from('v_planes_cuotas_resumen')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  lanzarSiError(error, 'No se pudo cargar el plan de cuotas.')
  return data ? normalizarResumen(data as Record<string, unknown>) : null
}

/** Datos completos del plan (incluye `notas`, que la vista no trae). */
export async function obtenerPlan(id: UUID): Promise<PlanCuotas | null> {
  const { data, error } = await supabase
    .from('planes_cuotas')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  lanzarSiError(error, 'No se pudo cargar el plan de cuotas.')
  return data ? normalizarPlan(data as Record<string, unknown>) : null
}

/** Cuotas de un plan, en orden. */
export async function listarCuotas(planId: UUID): Promise<CuotaPlan[]> {
  const { data, error } = await supabase
    .from('cuotas_plan')
    .select('*')
    .eq('plan_id', planId)
    .order('numero', { ascending: true })

  lanzarSiError(error, 'No se pudieron cargar las cuotas.')
  return (data ?? []).map(normalizarCuota)
}

/** Cuotas pendientes de varios planes (para mostrar la próxima de cada uno). */
export async function listarCuotasPendientes(planIds: UUID[]): Promise<CuotaPlan[]> {
  if (planIds.length === 0) return []

  const { data, error } = await supabase
    .from('cuotas_plan')
    .select('*')
    .in('plan_id', planIds)
    .eq('estado', 'pendiente')
    .order('fecha_vencimiento', { ascending: true })

  lanzarSiError(error, 'No se pudieron cargar las cuotas pendientes.')
  return (data ?? []).map(normalizarCuota)
}

/** Primera cuota pendiente de cada plan, indexada por `plan_id`. */
export function proximaCuotaPorPlan(cuotas: CuotaPlan[]): Map<UUID, CuotaPlan> {
  const mapa = new Map<UUID, CuotaPlan>()
  for (const cuota of cuotas) {
    const actual = mapa.get(cuota.plan_id)
    if (!actual || cuota.fecha_vencimiento < actual.fecha_vencimiento) {
      mapa.set(cuota.plan_id, cuota)
    }
  }
  return mapa
}

/** Deuda pendiente total de los planes activos y no archivados. */
export function deudaPendiente(planes: PlanCuotasResumen[]): MontoPYG {
  return planes
    .filter((plan) => plan.estado === 'activo' && !plan.archivado)
    .reduce((total, plan) => total + aMonto(plan.saldo_pendiente), 0)
}

/**
 * Tipo de cuota del plan al que pertenece una cuota.
 *
 * Lo usa la hoja de pago cuando se abre desde Inicio, donde la previsión no
 * trae la modalidad del plan. Si algo falla se asume `fijo`, que es lo
 * conservador: el importe queda bloqueado.
 */
export async function obtenerTipoMontoDeCuota(cuotaId: UUID): Promise<TipoMontoCuota> {
  const { data, error } = await supabase
    .from('cuotas_plan')
    .select('planes_cuotas(tipo_monto)')
    .eq('id', cuotaId)
    .maybeSingle()

  if (error) {
    console.warn('[Mis Finanzas] no se pudo leer la modalidad del plan', error)
    return 'fijo'
  }

  const plan = (data as { planes_cuotas?: { tipo_monto?: unknown } | null } | null)?.planes_cuotas
  return tipoMontoDe(plan?.tipo_monto)
}

export interface DatosPlanCuotas {
  nombre: string
  montoTotal: MontoPYG
  cantidadCuotas: number
  fechaCompra: FechaISO
  fechaPrimeraCuota: FechaISO
  proveedor: string | null
  categoriaId: UUID | null
  cuentaPreferidaId: UUID | null
  frecuenciaMeses: number
  descripcion: string | null
  notas: string | null
  tipoMonto: TipoMontoCuota
}

/**
 * RPC `crear_plan_cuotas`.
 *
 * La base genera todas las cuotas y guarda la modalidad en la misma
 * transacción: el frontend no crea cuotas ni corrige el plan después.
 */
export async function crearPlanCuotas(datos: DatosPlanCuotas): Promise<unknown> {
  const { data, error } = await supabase.rpc('crear_plan_cuotas', {
    p_nombre: datos.nombre.trim(),
    p_monto_total: datos.montoTotal,
    p_cantidad_cuotas: datos.cantidadCuotas,
    p_fecha_compra: datos.fechaCompra,
    p_fecha_primera_cuota: datos.fechaPrimeraCuota,
    p_proveedor: datos.proveedor?.trim() || null,
    p_categoria_id: datos.categoriaId,
    p_cuenta_preferida_id: datos.cuentaPreferidaId,
    p_frecuencia_meses: datos.frecuenciaMeses,
    p_descripcion: datos.descripcion?.trim() || null,
    p_notas: datos.notas?.trim() || null,
    p_tipo_monto: datos.tipoMonto,
  })

  lanzarConMotivo(error, 'No se pudo crear el plan de cuotas.')
  return data
}

export interface DatosPagoCuota {
  cuotaId: UUID
  cuentaId: UUID | null
  montoReal: MontoPYG | null
  fechaPago: FechaISO | null
  descripcion: string | null
  notas: string | null
}

/**
 * RPC `confirmar_cuota_plan`.
 * Crea el gasto real y marca la cuota como pagada. Es la única vía:
 * el frontend nunca crea ese gasto a mano.
 */
export async function confirmarCuotaPlan(datos: DatosPagoCuota): Promise<unknown> {
  const { data, error } = await supabase.rpc('confirmar_cuota_plan', {
    p_cuota_id: datos.cuotaId,
    p_cuenta_id: datos.cuentaId,
    p_monto_real: datos.montoReal,
    p_fecha_pago: datos.fechaPago,
    p_descripcion: datos.descripcion?.trim() || null,
    p_notas: datos.notas?.trim() || null,
  })

  lanzarSiError(error, 'No se pudo registrar el pago de la cuota.')
  return data
}

/** RPC `revertir_pago_cuota` — anula el movimiento y devuelve la cuota a pendiente. */
export async function revertirPagoCuota(cuotaId: UUID): Promise<unknown> {
  const { data, error } = await supabase.rpc('revertir_pago_cuota', { p_cuota_id: cuotaId })
  lanzarSiError(error, 'No se pudo revertir el pago de la cuota.')
  return data
}

export interface DatosEdicionPlan {
  planId: UUID
  nombre: string
  proveedor: string | null
  descripcion: string | null
  notas: string | null
  categoriaId: UUID | null
  cuentaPreferidaId: UUID | null
  tipoMonto: TipoMontoCuota
  /** `null` deja los importes como están; un valor solo afecta a las cuotas pendientes. */
  montoCuota: MontoPYG | null
}

/**
 * RPC `editar_plan_cuotas`.
 *
 * Cambia los datos del plan y, si se envía `montoCuota`, el importe programado
 * de las cuotas PENDIENTES. Nunca toca cuotas pagadas ni movimientos.
 */
export async function editarPlanCuotas(datos: DatosEdicionPlan): Promise<unknown> {
  const { data, error } = await supabase.rpc('editar_plan_cuotas', {
    p_plan_id: datos.planId,
    p_nombre: datos.nombre.trim(),
    p_proveedor: datos.proveedor?.trim() || null,
    p_descripcion: datos.descripcion?.trim() || null,
    p_notas: datos.notas?.trim() || null,
    p_categoria_id: datos.categoriaId,
    p_cuenta_preferida_id: datos.cuentaPreferidaId,
    p_tipo_monto: datos.tipoMonto,
    p_monto_cuota: datos.montoCuota,
  })

  lanzarConMotivo(error, 'No se pudo guardar la financiación.')
  return data
}

/** RPC `archivar_plan_cuotas` — solo saca del listado; no cambia nada más. */
export async function archivarPlanCuotas(planId: UUID): Promise<void> {
  const { error } = await supabase.rpc('archivar_plan_cuotas', { p_plan_id: planId })
  lanzarConMotivo(error, 'No se pudo archivar la financiación.')
}

/** RPC `desarchivar_plan_cuotas` — la devuelve al listado normal. */
export async function desarchivarPlanCuotas(planId: UUID): Promise<void> {
  const { error } = await supabase.rpc('desarchivar_plan_cuotas', { p_plan_id: planId })
  lanzarConMotivo(error, 'No se pudo desarchivar la financiación.')
}

/** RPC `cancelar_plan_cuotas` — cancela las cuotas pendientes y conserva los pagos. */
export async function cancelarPlanCuotas(planId: UUID): Promise<unknown> {
  const { data, error } = await supabase.rpc('cancelar_plan_cuotas', { p_plan_id: planId })
  lanzarSiError(error, 'No se pudo cancelar el plan de cuotas.')
  return data
}

/** `true` si una cuota pendiente ya venció. Es solo visual: no cambia la base. */
export function estaVencida(cuota: CuotaPlan, hoy: FechaISO): boolean {
  return cuota.estado === 'pendiente' && cuota.fecha_vencimiento < hoy
}
