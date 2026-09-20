import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { alCambiarSesion, cerrarSesion, iniciarSesion, obtenerSesion } from '../services/authService'

interface ContextoAuth {
  sesion: Session | null
  usuario: User | null
  /** `true` mientras se comprueba la sesión inicial (evita el flash del login). */
  comprobando: boolean
  entrar: (correo: string, password: string) => Promise<void>
  salir: () => Promise<void>
}

const Contexto = createContext<ContextoAuth | null>(null)

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [comprobando, setComprobando] = useState(true)

  useEffect(() => {
    let vigente = true

    obtenerSesion()
      .then((s) => {
        if (!vigente) return
        setSesion(s)
      })
      .finally(() => {
        if (vigente) setComprobando(false)
      })

    const desuscribir = alCambiarSesion((nuevaSesion) => {
      if (!vigente) return
      setSesion(nuevaSesion)
      setComprobando(false)
    })

    return () => {
      vigente = false
      desuscribir()
    }
  }, [])

  const valor = useMemo<ContextoAuth>(
    () => ({
      sesion,
      usuario: sesion?.user ?? null,
      comprobando,
      entrar: async (correo, password) => {
        const nueva = await iniciarSesion(correo, password)
        setSesion(nueva)
      },
      salir: async () => {
        await cerrarSesion()
        setSesion(null)
      },
    }),
    [sesion, comprobando],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAuth debe usarse dentro de <ProveedorAuth>')
  return contexto
}
