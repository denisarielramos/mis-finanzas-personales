import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { FechaISO, MontoPYG, ProximoMovimiento } from '../types/db'

/**
 * Próximos cobros y pagos (`public.v_proximos_movimientos`).
 *
 * La vista reúne los recurrentes pendientes y las cuotas de planes que
 * todavía no se pagaron. Son PREVISIONES: no existen en `public.movimientos`
 * y no modifican ningún saldo. Solo cuentan como dinero real cuando se
 * confirman con `confirmar_recurrente` o `confirmar_cuota_plan`.
 */

function normalizar(fila: Record<string, unknown>): ProximoMovimiento {
  return {
    ...(fila as unknown as ProximoMovimiento),
    monto: aMonto(fila.monto),
    numero_cuota: fila.numero_cuota === null ? null : Number(fila.numero_cuota),
    total_cuotas: fila.total_cuotas === null ? null : Number(fila.total_cuotas),
  }
}

export interface ConsultaProximos {
  desde?: FechaISO
  hasta?: FechaISO
  limite?: number
}

/** Próximos movimientos ordenados por fecha ascendente. */
export async function listarProximosMovimientos(
  opciones: ConsultaProximos = {},
): Promise<ProximoMovimiento[]> {
  const { desde, hasta, limite = 50 } = opciones

  let consulta = supabase
    .from('v_proximos_movimientos')
    .select('*')
    .order('fecha', { ascending: true })
    .limit(limite)

  if (desde) consulta = consulta.gte('fecha', desde)
  if (hasta) consulta = consulta.lte('fecha', hasta)

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar los próximos movimientos.')
  return (data ?? []).map(normalizar)
}

export interface ResumenPlanificacion {
  ingresosPendientes: MontoPYG
  pagosPendientes: MontoPYG
  /** Ingresos pendientes − pagos pendientes. */
  flujoPrevisto: MontoPYG
  cantidad: number
  vencidos: number
}

/** Totales previstos a partir de una lista de próximos movimientos. */
export function resumirPlanificacion(proximos: ProximoMovimiento[]): ResumenPlanificacion {
  const resumen: ResumenPlanificacion = {
    ingresosPendientes: 0,
    pagosPendientes: 0,
    flujoPrevisto: 0,
    cantidad: proximos.length,
    vencidos: 0,
  }

  for (const proximo of proximos) {
    if (proximo.tipo === 'ingreso') resumen.ingresosPendientes += proximo.monto
    else resumen.pagosPendientes += proximo.monto
    if (proximo.estado === 'vencido') resumen.vencidos += 1
  }

  resumen.flujoPrevisto = resumen.ingresosPendientes - resumen.pagosPendientes
  return resumen
}
