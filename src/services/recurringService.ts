import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type {
  FechaISO,
  FrecuenciaRecurrente,
  MontoPYG,
  Recurrente,
  TipoRecurrente,
  UUID,
} from '../types/db'
import { idUsuarioActual } from './authService'

/**
 * Movimientos recurrentes (`public.recurrentes`).
 *
 * Columnas reales de la tabla:
 *   id, user_id, nombre, cuenta_id, categoria_id, tipo, monto, frecuencia,
 *   proxima_fecha, generar_automaticamente, activa, descripcion,
 *   dia_mes, ultimo_dia_mes, monto_estimado, created_at, updated_at
 *
 * Un recurrente es una PREVISIÓN: no toca los saldos. El movimiento real solo
 * lo crea el RPC `confirmar_recurrente`, que además avanza `proxima_fecha`.
 *
 * La aplicación NO genera movimientos automáticamente desde el navegador:
 * solo guarda la configuración. Si `generar_automaticamente` está activo, la
 * generación real depende de un proceso del backend.
 */

function normalizar(fila: Record<string, unknown>): Recurrente {
  return {
    ...(fila as unknown as Recurrente),
    monto: aMonto(fila.monto),
  }
}

/** Lista de recurrentes ordenada por la próxima fecha y luego por nombre. */
export async function listarRecurrentes(): Promise<Recurrente[]> {
  const { data, error } = await supabase
    .from('recurrentes')
    .select('*')
    .order('proxima_fecha', { ascending: true })
    .order('nombre', { ascending: true })

  lanzarSiError(error, 'No se pudieron cargar los recurrentes.')
  return (data ?? []).map(normalizar)
}

export interface DatosRecurrente {
  nombre: string
  cuenta_id: UUID
  categoria_id: UUID | null
  tipo: TipoRecurrente
  /** Siempre mayor que cero: la base lo exige con un CHECK. */
  monto: MontoPYG
  frecuencia: FrecuenciaRecurrente
  proxima_fecha: FechaISO
  generar_automaticamente: boolean
  activa: boolean
  descripcion: string | null
  /** Día fijo del mes (1..31) o `null` si no aplica. */
  dia_mes: number | null
  /** `true` para «último día del mes»; entonces `dia_mes` va en `null`. */
  ultimo_dia_mes: boolean
  /** `true` si el monto es una estimación que se ajusta al confirmar. */
  monto_estimado: boolean
}

function aFila(datos: DatosRecurrente): Record<string, unknown> {
  return {
    nombre: datos.nombre.trim(),
    cuenta_id: datos.cuenta_id,
    categoria_id: datos.categoria_id,
    tipo: datos.tipo,
    monto: datos.monto,
    frecuencia: datos.frecuencia,
    proxima_fecha: datos.proxima_fecha,
    generar_automaticamente: datos.generar_automaticamente,
    activa: datos.activa,
    descripcion: datos.descripcion?.trim() || null,
    // «Último día del mes» y «día fijo» son excluyentes.
    dia_mes: datos.ultimo_dia_mes ? null : datos.dia_mes,
    ultimo_dia_mes: datos.ultimo_dia_mes,
    monto_estimado: datos.monto_estimado,
  }
}

export async function crearRecurrente(datos: DatosRecurrente): Promise<Recurrente> {
  // El user_id se obtiene siempre de Supabase Auth, nunca se hardcodea.
  const userId = await idUsuarioActual()

  const { data, error } = await supabase
    .from('recurrentes')
    .insert({ user_id: userId, ...aFila(datos) })
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo crear el recurrente.')
  return normalizar(data as Record<string, unknown>)
}

export async function actualizarRecurrente(
  id: UUID,
  datos: DatosRecurrente,
): Promise<Recurrente> {
  const { data, error } = await supabase
    .from('recurrentes')
    .update(aFila(datos))
    .eq('id', id)
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo actualizar el recurrente.')
  return normalizar(data as Record<string, unknown>)
}

/** Los recurrentes no se borran: se desactivan. */
export async function cambiarEstadoRecurrente(id: UUID, activa: boolean): Promise<void> {
  const { error } = await supabase.from('recurrentes').update({ activa }).eq('id', id)
  lanzarSiError(
    error,
    activa ? 'No se pudo activar el recurrente.' : 'No se pudo desactivar el recurrente.',
  )
}

export async function obtenerRecurrente(id: UUID): Promise<Recurrente | null> {
  const { data, error } = await supabase.from('recurrentes').select('*').eq('id', id).maybeSingle()
  lanzarSiError(error, 'No se pudo cargar el recurrente.')
  return data ? normalizar(data as Record<string, unknown>) : null
}

export interface DatosConfirmacion {
  recurrenteId: UUID
  /** Monto realmente cobrado o pagado. `null` usa el previsto. */
  montoReal: MontoPYG | null
  fechaReal: FechaISO | null
  cuentaId: UUID | null
  descripcion: string | null
  notas: string | null
}

/**
 * RPC `confirmar_recurrente`.
 *
 * Es la ÚNICA forma de convertir una previsión en un movimiento real:
 * crea el movimiento, lo vincula al recurrente, marca `origen = recurrente`
 * y avanza `proxima_fecha`. El frontend nunca crea ese movimiento a mano.
 */
export async function confirmarRecurrente(datos: DatosConfirmacion): Promise<unknown> {
  const { data, error } = await supabase.rpc('confirmar_recurrente', {
    p_recurrente_id: datos.recurrenteId,
    p_monto_real: datos.montoReal,
    p_fecha_real: datos.fechaReal,
    p_cuenta_id: datos.cuentaId,
    p_descripcion: datos.descripcion?.trim() || null,
    p_notas: datos.notas?.trim() || null,
  })

  lanzarSiError(error, 'No se pudo confirmar el movimiento.')
  return data
}
