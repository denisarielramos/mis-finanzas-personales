import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase único y reutilizable de toda la aplicación.
 *
 * Solo se usan las credenciales públicas (URL + publishable/anon key).
 * Nunca se utiliza `service_role` ni ninguna clave secreta en el frontend:
 * el acceso a los datos lo controla RLS en PostgreSQL.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

/** `true` cuando las dos variables de entorno están presentes. */
export const supabaseConfigurado = Boolean(url && publishableKey)

/**
 * Si faltan las variables se usa un destino inofensivo para que el módulo no
 * explote al importarse: la interfaz muestra una pantalla de configuración
 * en lugar de una pantalla en blanco.
 */
const urlEfectiva = supabaseConfigurado ? url : 'https://no-configurado.supabase.co'
const keyEfectiva = supabaseConfigurado ? publishableKey : 'no-configurado'

export const supabase: SupabaseClient = createClient(urlEfectiva, keyEfectiva, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'mis-finanzas-auth',
  },
  global: {
    headers: { 'x-client-info': 'mis-finanzas-pwa' },
  },
})
