/**
 * Traducción de errores de Supabase/PostgREST a mensajes en español
 * comprensibles para la persona que usa la aplicación.
 */

interface ErrorConCodigo {
  message?: string
  code?: string
  details?: string
  hint?: string
  status?: number
}

function comoError(valor: unknown): ErrorConCodigo | null {
  if (!valor || typeof valor !== 'object') return null
  return valor as ErrorConCodigo
}

/** `true` si el navegador está sin conexión. */
export function sinConexion(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

const MENSAJES_AUTH: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'El correo todavía no fue confirmado.'],
  [/invalid email/i, 'El correo no tiene un formato válido.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espera un momento y vuelve a probar.'],
  [/network|fetch/i, 'No se pudo conectar con el servidor. Revisa tu conexión.'],
]

const MENSAJES_CODIGO: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'El registro está vinculado a otros datos y no puede modificarse así.',
  '23514': 'Alguno de los datos enviados no cumple las reglas de la base.',
  '22P02': 'Alguno de los datos enviados tiene un formato inválido.',
  '42501': 'No tienes permiso para realizar esta operación.',
  '42883': 'La operación no está disponible en la base de datos.',
  PGRST116: 'No se encontró el registro solicitado.',
  PGRST301: 'La sesión expiró. Vuelve a iniciar sesión.',
}

/**
 * Devuelve un mensaje en español para mostrar en la interfaz.
 * El error técnico completo se envía a la consola para diagnóstico.
 */
export function mensajeDeError(error: unknown, respaldo = 'Ocurrió un error inesperado.'): string {
  if (import.meta.env.DEV) console.error('[Mis Finanzas]', error)

  if (sinConexion()) {
    return 'Sin conexión a internet. Vuelve a intentarlo cuando recuperes la señal.'
  }

  const err = comoError(error)
  if (!err) return respaldo

  if (err.code && MENSAJES_CODIGO[err.code]) return MENSAJES_CODIGO[err.code]

  const mensaje = err.message ?? ''
  for (const [patron, texto] of MENSAJES_AUTH) {
    if (patron.test(mensaje)) return texto
  }

  if (/failed to fetch|networkerror|load failed/i.test(mensaje)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
  }
  if (/jwt|token/i.test(mensaje)) {
    return 'La sesión expiró. Vuelve a iniciar sesión.'
  }

  return respaldo
}

/** Error de aplicación con un mensaje ya listo para mostrar. */
export class ErrorApp extends Error {
  readonly original: unknown

  constructor(mensaje: string, original?: unknown) {
    super(mensaje)
    this.name = 'ErrorApp'
    this.original = original
  }
}

/** Lanza un `ErrorApp` con el mensaje traducido cuando Supabase devuelve error. */
export function lanzarSiError(error: unknown, respaldo: string): void {
  if (!error) return
  throw new ErrorApp(mensajeDeError(error, respaldo), error)
}

/** Mensaje mostrable a partir de cualquier excepción capturada. */
export function textoDeExcepcion(e: unknown, respaldo: string): string {
  if (e instanceof ErrorApp) return e.message
  return mensajeDeError(e, respaldo)
}
