import { useEffect, type ReactNode } from 'react'

interface Props {
  abierta: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
  /** Oculta visualmente el título (sigue disponible para lectores de pantalla). */
  tituloOculto?: boolean
}

/**
 * Hoja inferior (bottom sheet) al estilo iOS.
 * En pantallas grandes se muestra centrada como diálogo.
 */
export function Hoja({ abierta, titulo, onCerrar, children, tituloOculto = false }: Props) {
  useEffect(() => {
    if (!abierta) return

    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsarTecla)

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alPulsarTecla)
      document.body.style.overflow = overflowPrevio
    }
  }, [abierta, onCerrar])

  if (!abierta) return null

  return (
    <div
      className="capa"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="hoja__asa" aria-hidden="true" />
        {tituloOculto ? null : <h2 className="hoja__titulo">{titulo}</h2>}
        {children}
      </div>
    </div>
  )
}
