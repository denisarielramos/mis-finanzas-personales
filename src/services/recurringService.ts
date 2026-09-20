import { supabase } from '../lib/supabase'
import { lanzarSiError, ErrorApp, mensajeDeError } from '../lib/errors'
import { aMonto } from '../utils/money'
import type { Recurrente, UUID } from '../types/db'
import { idUsuarioActual } from './authService'

/**
 * Movimientos recurrentes (`public.recurrentes`).
 *
 * La estructura real de esta tabla NO se inventa: se detecta en tiempo de
 * ejecución preguntándole a PostgREST por cada columna candidata. El
 * formulario y las escrituras usan únicamente las columnas que existen de
 * verdad, así la pantalla se adapta al esquema que ya está en la base.
 *
 * La aplicación NO genera movimientos automáticamente desde el navegador:
 * solo muestra y edita la configuración. Si existe `generar_automaticamente`,
 * la generación real depende de un proceso del backend (cron / función de
 * base de datos), no del frontend.
 */

/** Columnas que la pantalla sabe manejar si están presentes. */
export const COLUMNAS_CANDIDATAS = [
  'nombre',
  'descripcion',
  'cuenta_id',
  'categoria_id',
  'tipo',
  'monto',
  'frecuencia',
  'intervalo',
  'dia_mes',
  'dia_semana',
  'proxima_fecha',
  'fecha_inicio',
  'fecha_fin',
  'ultima_generacion',
  'generar_automaticamente',
  'activa',
  'activo',
  'notas',
] as const

export type ColumnaRecurrente = (typeof COLUMNAS_CANDIDATAS)[number]

export interface EsquemaRecurrentes {
  /** Columnas candidatas realmente presentes en la tabla. */
  columnas: Set<string>
  /** Nombre real de la columna de estado (`activa` o `activo`), si existe. */
  columnaEstado: 'activa' | 'activo' | null
  /** `true` si la tabla tiene columna `user_id`. */
  tieneUserId: boolean
}

let esquemaCacheado: EsquemaRecurrentes | null = null

function esColumnaInexistente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /does not exist|could not find|unknown column/i.test(error.message ?? '')
}

async function existeColumna(columna: string): Promise<boolean> {
  const { error } = await supabase.from('recurrentes').select(columna, { head: true }).limit(1)
  if (!error) return true
  if (esColumnaInexistente(error)) return false
  // Cualquier otro error (red, permisos, tabla ausente) se propaga.
  throw new ErrorApp(mensajeDeError(error, 'No se pudo leer la tabla de recurrentes.'), error)
}

/** Detecta (una sola vez por sesión) qué columnas existen realmente. */
export async function obtenerEsquemaRecurrentes(): Promise<EsquemaRecurrentes> {
  if (esquemaCacheado) return esquemaCacheado

  const candidatas = [...COLUMNAS_CANDIDATAS, 'user_id']
  const presentes = await Promise.all(candidatas.map((c) => existeColumna(c)))

  const columnas = new Set<string>()
  candidatas.forEach((c, i) => {
    if (presentes[i]) columnas.add(c)
  })

  const esquema: EsquemaRecurrentes = {
    columnas,
    columnaEstado: columnas.has('activa') ? 'activa' : columnas.has('activo') ? 'activo' : null,
    tieneUserId: columnas.has('user_id'),
  }

  esquemaCacheado = esquema
  return esquema
}

function normalizar(fila: Record<string, unknown>): Recurrente {
  const copia: Record<string, unknown> = { ...fila }
  if ('monto' in copia) copia.monto = aMonto(copia.monto)
  return copia as Recurrente
}

export async function listarRecurrentes(): Promise<Recurrente[]> {
  const esquema = await obtenerEsquemaRecurrentes()

  let consulta = supabase.from('recurrentes').select('*')
  if (esquema.columnas.has('proxima_fecha')) {
    consulta = consulta.order('proxima_fecha', { ascending: true, nullsFirst: false })
  } else if (esquema.columnas.has('nombre')) {
    consulta = consulta.order('nombre', { ascending: true })
  }

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar los recurrentes.')
  return (data ?? []).map(normalizar)
}

/** Deja solo las claves que existen de verdad en la tabla. */
function filtrarPorEsquema(
  valores: Record<string, unknown>,
  esquema: EsquemaRecurrentes,
): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(valores)) {
    if (esquema.columnas.has(clave)) salida[clave] = valor
  }
  return salida
}

export async function crearRecurrente(valores: Record<string, unknown>): Promise<Recurrente> {
  const esquema = await obtenerEsquemaRecurrentes()
  const fila = filtrarPorEsquema(valores, esquema)

  if (esquema.tieneUserId) fila.user_id = await idUsuarioActual()

  const { data, error } = await supabase.from('recurrentes').insert(fila).select('*').single()
  lanzarSiError(error, 'No se pudo crear el recurrente.')
  return normalizar(data as Record<string, unknown>)
}

export async function actualizarRecurrente(
  id: UUID,
  valores: Record<string, unknown>,
): Promise<Recurrente> {
  const esquema = await obtenerEsquemaRecurrentes()
  const fila = filtrarPorEsquema(valores, esquema)

  const { data, error } = await supabase
    .from('recurrentes')
    .update(fila)
    .eq('id', id)
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo actualizar el recurrente.')
  return normalizar(data as Record<string, unknown>)
}

export async function cambiarEstadoRecurrente(id: UUID, activo: boolean): Promise<void> {
  const esquema = await obtenerEsquemaRecurrentes()
  if (!esquema.columnaEstado) {
    throw new ErrorApp('La tabla de recurrentes no tiene una columna de estado.')
  }

  const { error } = await supabase
    .from('recurrentes')
    .update({ [esquema.columnaEstado]: activo })
    .eq('id', id)

  lanzarSiError(error, 'No se pudo cambiar el estado del recurrente.')
}

/** Valores distintos ya usados en una columna (para ofrecer opciones reales). */
export function valoresUsados(filas: Recurrente[], columna: string): string[] {
  const valores = new Set<string>()
  for (const fila of filas) {
    const valor = fila[columna]
    if (typeof valor === 'string' && valor.trim()) valores.add(valor)
  }
  return [...valores].sort()
}

/** Frecuencias habituales, solo como sugerencia inicial del formulario. */
export const FRECUENCIAS_SUGERIDAS = [
  'diaria',
  'semanal',
  'quincenal',
  'mensual',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
]

export const ETIQUETA_FRECUENCIA: Record<string, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}
