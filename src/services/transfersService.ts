import { supabase } from '../lib/supabase'
import { lanzarSiError, ErrorApp } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { FechaISO, MontoPYG, Transferencia, UUID } from '../types/db'

/**
 * Transferencias entre cuentas propias (`public.transferencias`).
 *
 * Una transferencia NO es un gasto ni un ingreso: el dinero solo cambia de
 * cuenta y el patrimonio total no varía.
 *
 * Todas las operaciones usan los RPC existentes, que crean/editan/anulan de
 * forma atómica las DOS mitades (`transferencia_salida` y
 * `transferencia_entrada`). El frontend nunca crea movimientos sueltos ni
 * toca una sola mitad.
 */

function normalizar(fila: Record<string, unknown>): Transferencia {
  return {
    ...(fila as unknown as Transferencia),
    monto: aMonto(fila.monto),
  }
}

export interface ConsultaTransferencias {
  desde?: FechaISO
  hasta?: FechaISO
  ids?: UUID[]
  limite?: number
}

export async function listarTransferencias(
  opciones: ConsultaTransferencias = {},
): Promise<Transferencia[]> {
  const { desde, hasta, ids, limite = 200 } = opciones

  if (ids && ids.length === 0) return []

  let consulta = supabase
    .from('transferencias')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite)

  if (ids && ids.length > 0) consulta = consulta.in('id', ids)
  if (desde) consulta = consulta.gte('fecha', desde)
  if (hasta) consulta = consulta.lte('fecha', hasta)

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar las transferencias.')
  return (data ?? []).map(normalizar)
}

export async function obtenerTransferencia(id: UUID): Promise<Transferencia | null> {
  const { data, error } = await supabase
    .from('transferencias')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  lanzarSiError(error, 'No se pudo cargar la transferencia.')
  return data ? normalizar(data) : null
}

export interface DatosTransferencia {
  cuentaOrigenId: UUID
  cuentaDestinoId: UUID
  monto: MontoPYG
  fecha: FechaISO
  descripcion: string | null
  referencia: string | null
}

function validar(datos: DatosTransferencia): void {
  if (datos.cuentaOrigenId === datos.cuentaDestinoId) {
    throw new ErrorApp('La cuenta de origen y la de destino deben ser distintas.')
  }
  if (datos.monto <= 0) {
    throw new ErrorApp('El monto debe ser mayor que cero.')
  }
}

/** RPC `crear_transferencia` — crea atómicamente salida + entrada. */
export async function crearTransferencia(datos: DatosTransferencia): Promise<unknown> {
  validar(datos)

  const { data, error } = await supabase.rpc('crear_transferencia', {
    p_cuenta_origen: datos.cuentaOrigenId,
    p_cuenta_destino: datos.cuentaDestinoId,
    p_monto: datos.monto,
    p_fecha: datos.fecha,
    p_descripcion: datos.descripcion?.trim() || null,
    p_referencia: datos.referencia?.trim() || null,
  })

  lanzarSiError(error, 'No se pudo realizar la transferencia.')
  return data
}

/** RPC `editar_transferencia` — edita la transferencia completa, nunca media. */
export async function editarTransferencia(
  id: UUID,
  datos: DatosTransferencia,
): Promise<unknown> {
  validar(datos)

  const { data, error } = await supabase.rpc('editar_transferencia', {
    p_transferencia_id: id,
    p_cuenta_origen_id: datos.cuentaOrigenId,
    p_cuenta_destino_id: datos.cuentaDestinoId,
    p_monto: datos.monto,
    p_fecha: datos.fecha,
    p_descripcion: datos.descripcion?.trim() || null,
    p_referencia: datos.referencia?.trim() || null,
  })

  lanzarSiError(error, 'No se pudo actualizar la transferencia.')
  return data
}

/** RPC `anular_transferencia` — anula la operación completa. */
export async function anularTransferencia(id: UUID): Promise<void> {
  const { error } = await supabase.rpc('anular_transferencia', { p_transferencia_id: id })
  lanzarSiError(error, 'No se pudo eliminar la transferencia.')
}
