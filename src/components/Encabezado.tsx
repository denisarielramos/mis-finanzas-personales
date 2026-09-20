import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Props {
  titulo: string
  subtitulo?: string
  /** Muestra el botón de volver. Si es una ruta, navega a ella. */
  volver?: boolean | string
  acciones?: ReactNode
  /** Alinea la cabecera con un contenido de ancho extendido en escritorio. */
  ancho?: boolean
}

/** Cabecera fija de pantalla, respetando el área segura superior de iOS. */
export function Encabezado({ titulo, subtitulo, volver, acciones, ancho = false }: Props) {
  const navegar = useNavigate()
  const [desplazado, setDesplazado] = useState(false)

  useEffect(() => {
    const alDesplazar = () => setDesplazado(window.scrollY > 4)
    alDesplazar()
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => window.removeEventListener('scroll', alDesplazar)
  }, [])

  return (
    <header className={`encabezado${desplazado ? ' encabezado--con-borde' : ''}`}>
      <div className={`contenedor${ancho ? ' contenedor--ancho' : ''}`}>
        <div className="encabezado__fila">
          {volver ? (
            <button
              type="button"
              className="boton-icono boton-icono--plano"
              aria-label="Volver"
              onClick={() => (typeof volver === 'string' ? navegar(volver) : navegar(-1))}
            >
              <ArrowLeft size={22} aria-hidden="true" />
            </button>
          ) : null}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="encabezado__titulo">{titulo}</h1>
            {subtitulo ? <p className="encabezado__subtitulo">{subtitulo}</p> : null}
          </div>

          {acciones ? <div className="encabezado__acciones">{acciones}</div> : null}
        </div>
      </div>
    </header>
  )
}
