import { Eye, EyeOff } from 'lucide-react'
import { usePrivacidad } from '../hooks/usePrivacidad'

/**
 * Interruptor del modo privacidad.
 *
 * Solo cambia lo que se muestra: ningún saldo, movimiento ni cálculo se ve
 * afectado. La preferencia se recuerda en el propio dispositivo.
 */
export function BotonPrivacidad() {
  const { ocultarMontos, alternarOcultarMontos } = usePrivacidad()

  return (
    <button
      type="button"
      className="boton-icono boton-icono--plano"
      aria-pressed={ocultarMontos}
      aria-label={ocultarMontos ? 'Mostrar los importes' : 'Ocultar los importes'}
      title={ocultarMontos ? 'Mostrar los importes' : 'Ocultar los importes'}
      onClick={alternarOcultarMontos}
    >
      {ocultarMontos ? (
        <EyeOff size={20} aria-hidden="true" />
      ) : (
        <Eye size={20} aria-hidden="true" />
      )}
    </button>
  )
}
