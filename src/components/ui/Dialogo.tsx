import { useEffect } from 'react'
import { Boton } from './Boton'

interface Props {
  abierto: boolean
  titulo: string
  mensaje: string
  textoConfirmar?: string
  textoCancelar?: string
  peligroso?: boolean
  procesando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Diálogo de confirmación. Se usa antes de anular movimientos o transferencias. */
export function Dialogo({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligroso = false,
  procesando = false,
  onConfirmar,
  onCancelar,
}: Props) {
  useEffect(() => {
    if (!abierto) return
    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !procesando) onCancelar()
    }
    document.addEventListener('keydown', alPulsarTecla)
    return () => document.removeEventListener('keydown', alPulsarTecla)
  }, [abierto, onCancelar, procesando])

  if (!abierto) return null

  return (
    <div className="capa capa--centrada" role="presentation">
      <div className="dialogo" role="alertdialog" aria-modal="true" aria-label={titulo}>
        <h2 className="dialogo__titulo">{titulo}</h2>
        <p className="dialogo__texto">{mensaje}</p>
        <div className="dialogo__acciones">
          <Boton variante="secundario" onClick={onCancelar} disabled={procesando}>
            {textoCancelar}
          </Boton>
          <Boton
            variante={peligroso ? 'peligro' : 'primario'}
            onClick={onConfirmar}
            cargando={procesando}
          >
            {textoConfirmar}
          </Boton>
        </div>
      </div>
    </div>
  )
}
