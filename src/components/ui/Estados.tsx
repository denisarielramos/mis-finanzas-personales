import type { ReactNode } from 'react'
import { AlertCircle, Info, TriangleAlert } from 'lucide-react'

/** Bloque de esqueleto para listas mientras se cargan los datos. */
export function EsqueletoLista({ filas = 3 }: { filas?: number }) {
  return (
    <div className="esqueleto-lista" aria-hidden="true">
      {Array.from({ length: filas }).map((_, i) => (
        <div className="esqueleto-fila" key={i}>
          <div className="esqueleto" style={{ width: 40, height: 40, borderRadius: 999 }} />
          <div style={{ flex: 1 }}>
            <div className="esqueleto" style={{ width: '55%', height: 12 }} />
            <div className="esqueleto" style={{ width: '35%', height: 10, marginTop: 8 }} />
          </div>
          <div className="esqueleto" style={{ width: 72, height: 14 }} />
        </div>
      ))}
    </div>
  )
}

/** Bloque rectangular de esqueleto. */
export function Esqueleto({ alto = 16, ancho = '100%' }: { alto?: number; ancho?: number | string }) {
  return <div className="esqueleto" style={{ height: alto, width: ancho }} aria-hidden="true" />
}

interface PropsVacio {
  titulo: string
  texto?: string
  icono?: ReactNode
  accion?: ReactNode
}

/** Estado vacío cuidado, con una acción sugerida. */
export function EstadoVacio({ titulo, texto, icono, accion }: PropsVacio) {
  return (
    <div className="vacio">
      {icono ? <div className="icono-circular icono-circular--grande">{icono}</div> : null}
      <p className="vacio__titulo">{titulo}</p>
      {texto ? <p className="vacio__texto">{texto}</p> : null}
      {accion}
    </div>
  )
}

type TipoMensaje = 'error' | 'aviso' | 'info'

const ICONO_MENSAJE = {
  error: AlertCircle,
  aviso: TriangleAlert,
  info: Info,
}

/** Mensaje en línea (errores de carga, avisos de configuración, etc.). */
export function Mensaje({
  tipo = 'info',
  children,
}: {
  tipo?: TipoMensaje
  children: ReactNode
}) {
  const Icono = ICONO_MENSAJE[tipo]
  return (
    <div className={`mensaje mensaje--${tipo}`} role={tipo === 'error' ? 'alert' : undefined}>
      <Icono size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
