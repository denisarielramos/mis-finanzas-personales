import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { Cuenta, MontoPYG, SaldoCuenta, TipoCuenta, UUID } from '../types/db'
import { idUsuarioActual } from './authService'

/**
 * Cuentas (`public.cuentas`) y saldos (`public.v_saldos_cuentas`).
 *
 * El saldo actual SIEMPRE proviene de la vista: no se recalcula en React
 * descargando movimientos.
 */

function normalizarCuenta(fila: Record<string, unknown>): Cuenta {
  return {
    ...(fila as unknown as Cuenta),
    saldo_inicial: aMonto(fila.saldo_inicial),
  }
}

function normalizarSaldo(fila: Record<string, unknown>): SaldoCuenta {
  return {
    ...(fila as unknown as SaldoCuenta),
    saldo_inicial: aMonto(fila.saldo_inicial),
    saldo_actual: aMonto(fila.saldo_actual),
  }
}

/** Lista de cuentas ordenada por `orden` y luego `nombre`. */
export async function listarCuentas(incluirInactivas = true): Promise<Cuenta[]> {
  let consulta = supabase
    .from('cuentas')
    .select('*')
    .order('orden', { ascending: true, nullsFirst: false })
    .order('nombre', { ascending: true })

  if (!incluirInactivas) consulta = consulta.eq('activa', true)

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar las cuentas.')
  return (data ?? []).map(normalizarCuenta)
}

export async function obtenerCuenta(id: UUID): Promise<Cuenta | null> {
  const { data, error } = await supabase.from('cuentas').select('*').eq('id', id).maybeSingle()
  lanzarSiError(error, 'No se pudo cargar la cuenta.')
  return data ? normalizarCuenta(data) : null
}

/** Saldos actuales calculados por la base de datos. */
export async function listarSaldos(): Promise<SaldoCuenta[]> {
  const { data, error } = await supabase
    .from('v_saldos_cuentas')
    .select('*')
    .order('nombre', { ascending: true })

  lanzarSiError(error, 'No se pudieron cargar los saldos.')
  return (data ?? []).map(normalizarSaldo)
}

/** Patrimonio total: solo cuentas activas e incluidas en el total. */
export function calcularPatrimonio(saldos: SaldoCuenta[]): MontoPYG {
  return saldos
    .filter((s) => s.activa && s.incluir_en_total)
    .reduce((total, s) => total + aMonto(s.saldo_actual), 0)
}

export interface DatosCuenta {
  nombre: string
  tipo: TipoCuenta
  saldo_inicial: MontoPYG
  descripcion: string | null
  color: string | null
  icono: string | null
  incluir_en_total: boolean
  activa: boolean
}

export async function crearCuenta(datos: DatosCuenta): Promise<Cuenta> {
  // El user_id se obtiene siempre de Supabase Auth, nunca se hardcodea.
  const userId = await idUsuarioActual()

  const { data, error } = await supabase
    .from('cuentas')
    .insert({
      user_id: userId,
      nombre: datos.nombre.trim(),
      tipo: datos.tipo,
      moneda: 'PYG',
      saldo_inicial: datos.saldo_inicial,
      descripcion: datos.descripcion?.trim() || null,
      color: datos.color,
      icono: datos.icono,
      incluir_en_total: datos.incluir_en_total,
      activa: datos.activa,
    })
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo crear la cuenta.')
  return normalizarCuenta(data as Record<string, unknown>)
}

export async function actualizarCuenta(id: UUID, datos: Partial<DatosCuenta>): Promise<Cuenta> {
  const cambios: Record<string, unknown> = {}
  if (datos.nombre !== undefined) cambios.nombre = datos.nombre.trim()
  if (datos.tipo !== undefined) cambios.tipo = datos.tipo
  if (datos.saldo_inicial !== undefined) cambios.saldo_inicial = datos.saldo_inicial
  if (datos.descripcion !== undefined) cambios.descripcion = datos.descripcion?.trim() || null
  if (datos.color !== undefined) cambios.color = datos.color
  if (datos.icono !== undefined) cambios.icono = datos.icono
  if (datos.incluir_en_total !== undefined) cambios.incluir_en_total = datos.incluir_en_total
  if (datos.activa !== undefined) cambios.activa = datos.activa

  const { data, error } = await supabase
    .from('cuentas')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo actualizar la cuenta.')
  return normalizarCuenta(data as Record<string, unknown>)
}

/** Las cuentas no se borran: se desactivan para conservar el historial. */
export async function cambiarEstadoCuenta(id: UUID, activa: boolean): Promise<void> {
  const { error } = await supabase.from('cuentas').update({ activa }).eq('id', id)
  lanzarSiError(error, activa ? 'No se pudo activar la cuenta.' : 'No se pudo desactivar la cuenta.')
}
