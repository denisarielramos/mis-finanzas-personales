import { supabase } from '../lib/supabase'
import { ErrorApp, lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { ConciliacionOriginal, TransferenciaPotencial, UUID } from '../types/db'

/**
 * Conciliación de transferencias.
 *
 * `buscar_transferencias_potenciales` propone pares de movimientos que podrían
 * ser una única transferencia entre cuentas propias. Coincidir en importe y
 * fecha NO basta: la base exige además una señal fuerte en el texto. La
 * confirmación siempre es manual: la aplicación nunca concilia por su cuenta.
 *
 * Al conciliar, la base guarda el estado original de los dos movimientos, así
 * que la operación se puede deshacer dejándolos exactamente como estaban.
 */

/** Un día: un gasto y un ingreso más separados no se proponen. */
export const DIAS_MAX_POR_DEFECTO = 1

/**
 * Códigos con los que las funciones de conciliación explican, en español y
 * pensando en quien usa la aplicación, por qué no se puede seguir («alguno de
 * los movimientos ya forma parte de una transferencia», por ejemplo). Ese
 * mensaje es más útil que el genérico, así que se muestra tal cual.
 */
const CODIGOS_CON_MOTIVO = new Set(['P0001', 'P0002'])

function lanzarConMotivo(error: unknown, respaldo: string): void {
  if (!error) return
  const err = error as { code?: string; message?: string }
  if (err.code && CODIGOS_CON_MOTIVO.has(err.code) && err.message) {
    throw new ErrorApp(err.message, error)
  }
  lanzarSiError(error, respaldo)
}

export async function buscarTransferenciasPotenciales(
  diasMax: number = DIAS_MAX_POR_DEFECTO,
): Promise<TransferenciaPotencial[]> {
  const { data, error } = await supabase.rpc('buscar_transferencias_potenciales', {
    p_dias_max: diasMax,
  })

  lanzarSiError(error, 'No se pudieron buscar transferencias potenciales.')

  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    ...(fila as unknown as TransferenciaPotencial),
    monto: aMonto(fila.monto),
    diferencia_dias: Number(fila.diferencia_dias ?? 0),
    puntaje: Number(fila.puntaje ?? 0),
    motivos: Array.isArray(fila.motivos) ? (fila.motivos as string[]) : null,
  }))
}

/** RPC `conciliar_transferencia` — solo tras confirmación explícita. */
export async function conciliarTransferencia(
  movimientoSalidaId: UUID,
  movimientoEntradaId: UUID,
): Promise<unknown> {
  const { data, error } = await supabase.rpc('conciliar_transferencia', {
    p_movimiento_salida: movimientoSalidaId,
    p_movimiento_entrada: movimientoEntradaId,
  })

  lanzarConMotivo(error, 'No se pudo conciliar la transferencia.')
  return data
}

/**
 * RPC `revertir_conciliacion` — devuelve los dos movimientos a su estado
 * original y marca la transferencia como cancelada.
 *
 * Solo sirve para transferencias creadas por conciliación que tengan copia del
 * estado original. Para las normales se sigue usando `anular_transferencia`.
 */
export async function revertirConciliacion(transferenciaId: UUID): Promise<void> {
  const { error } = await supabase.rpc('revertir_conciliacion', {
    p_transferencia_id: transferenciaId,
  })

  lanzarConMotivo(error, 'No se pudo revertir la conciliación.')
}

export interface EstadoConciliacion {
  /** La transferencia nació de una conciliación con copia del estado original. */
  tieneCopia: boolean
  /** La copia sigue sin usarse: la reversión devolvería los dos movimientos. */
  reversible: boolean
}

const SIN_CONCILIACION: EstadoConciliacion = { tieneCopia: false, reversible: false }

/**
 * Averigua si una transferencia se puede revertir.
 *
 * Si la tabla de copias todavía no existe (la migración no se ejecutó), se
 * responde que no hay copia: la pantalla sigue funcionando como antes.
 */
export async function obtenerEstadoConciliacion(
  transferenciaId: UUID,
): Promise<EstadoConciliacion> {
  const { data, error } = await supabase
    .from('conciliaciones_movimientos_originales')
    .select('id, restaurado_en')
    .eq('transferencia_id', transferenciaId)

  if (error) {
    console.warn('[Mis Finanzas] no se pudo consultar la copia de la conciliación', error)
    return SIN_CONCILIACION
  }

  const copias = (data ?? []) as Pick<ConciliacionOriginal, 'id' | 'restaurado_en'>[]
  return {
    tieneCopia: copias.length > 0,
    reversible: copias.some((c) => c.restaurado_en === null),
  }
}

/** Motivos legibles por los que el RPC considera que el par podría ser una transferencia. */
export function motivosDeCoincidencia(candidato: TransferenciaPotencial): string[] {
  // Los motivos los calcula la base junto con el puntaje: son la razón real.
  if (candidato.motivos && candidato.motivos.length > 0) return candidato.motivos

  // RPC anterior a la mejora: se describe solo lo que se ve desde aquí.
  const motivos = ['Mismo importe en cuentas propias distintas']
  motivos.push(candidato.diferencia_dias === 0 ? 'Misma fecha' : 'Diferencia de 1 día')
  return motivos
}
