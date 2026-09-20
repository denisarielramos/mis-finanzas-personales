import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { TransferenciaPotencial, UUID } from '../types/db'

/**
 * Conciliación de transferencias.
 *
 * `buscar_transferencias_potenciales` propone pares de movimientos que podrían
 * ser una única transferencia entre cuentas propias. La confirmación siempre
 * es manual: la aplicación nunca concilia por su cuenta.
 */

export const DIAS_MAX_POR_DEFECTO = 2

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

  lanzarSiError(error, 'No se pudo conciliar la transferencia.')
  return data
}

/** Motivos legibles por los que el RPC considera que el par podría ser una transferencia. */
export function motivosDeCoincidencia(candidato: TransferenciaPotencial): string[] {
  const motivos: string[] = ['Mismo importe en ambas cuentas']

  if (candidato.diferencia_dias === 0) motivos.push('Misma fecha')
  else if (candidato.diferencia_dias === 1) motivos.push('Diferencia de 1 día')
  else motivos.push(`Diferencia de ${candidato.diferencia_dias} días`)

  const salida = (candidato.descripcion_salida ?? '').trim().toLowerCase()
  const entrada = (candidato.descripcion_entrada ?? '').trim().toLowerCase()
  if (salida && entrada) {
    const palabrasSalida = new Set(salida.split(/\s+/).filter((p) => p.length > 3))
    const compatible = entrada.split(/\s+/).some((p) => p.length > 3 && palabrasSalida.has(p))
    motivos.push(compatible ? 'Descripciones compatibles' : 'Descripciones distintas')
  }

  motivos.push('Cuentas propias distintas')
  return motivos
}
