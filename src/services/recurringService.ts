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
 *   created_at, updated_at
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
