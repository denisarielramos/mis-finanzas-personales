import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type TipoAviso = 'exito' | 'error' | 'info'

interface Aviso {
  id: number
  tipo: TipoAviso
  mensaje: string
}

interface ContextoAvisos {
  exito: (mensaje: string) => void
  error: (mensaje: string) => void
  info: (mensaje: string) => void
}

const Contexto = createContext<ContextoAvisos | null>(null)

const ICONOS: Record<TipoAviso, typeof CheckCircle2> = {
  exito: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguienteId = useRef(1)

  const quitar = useCallback((id: number) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id))
  }, [])

  const mostrar = useCallback(
    (tipo: TipoAviso, mensaje: string) => {
      const id = siguienteId.current++
      setAvisos((actuales) => [...actuales.slice(-2), { id, tipo, mensaje }])
      window.setTimeout(() => quitar(id), tipo === 'error' ? 6000 : 3500)
    },
    [quitar],
  )

  const valor = useMemo<ContextoAvisos>(
    () => ({
      exito: (mensaje) => mostrar('exito', mensaje),
      error: (mensaje) => mostrar('error', mensaje),
      info: (mensaje) => mostrar('info', mensaje),
    }),
    [mostrar],
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((aviso) => {
          const Icono = ICONOS[aviso.tipo]
          return (
            <div key={aviso.id} className={`aviso aviso--${aviso.tipo}`}>
              <Icono size={18} aria-hidden="true" />
              <span>{aviso.mensaje}</span>
              <button
                type="button"
                className="aviso__cerrar"
                onClick={() => quitar(aviso.id)}
                aria-label="Cerrar aviso"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </Contexto.Provider>
  )
}

export function useAvisos(): ContextoAvisos {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAvisos debe usarse dentro de <ProveedorAvisos>')
  return contexto
}
