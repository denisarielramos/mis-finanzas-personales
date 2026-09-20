import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ErrorApp, mensajeDeError } from '../lib/errors'

/**
 * Autenticación con Supabase Auth (correo + contraseña).
 * No existe registro público: la aplicación es de uso personal.
 */

export async function iniciarSesion(correo: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password,
  })
  if (error || !data.session) {
    throw new ErrorApp(mensajeDeError(error, 'No se pudo iniciar sesión.'), error)
  }
  return data.session
}

export async function cerrarSesion(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new ErrorApp(mensajeDeError(error, 'No se pudo cerrar la sesión.'), error)
}

export async function obtenerSesion(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[Mis Finanzas] error al recuperar la sesión', error)
    return null
  }
  return data.session
}

/** Identificador del usuario autenticado. Nunca se hardcodea un user_id. */
export async function idUsuarioActual(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new ErrorApp('La sesión expiró. Vuelve a iniciar sesión.', error)
  }
  return data.user.id
}

export function alCambiarSesion(callback: (sesion: Session | null, usuario: User | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
    callback(sesion, sesion?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}
