import { ChevronLeft, ChevronRight } from 'lucide-react'
import { capitalizar, desplazarMes, mesActual, type RangoMes } from '../utils/date'

interface Props {
  rango: RangoMes
  onCambio: (rango: RangoMes) => void
  /** Impide avanzar más allá del mes en curso. */
  limitarFuturo?: boolean
}

export function SelectorMes({ rango, onCambio, limitarFuturo = true }: Props) {
  const actual = mesActual()
  const esMesActual = rango.anio === actual.anio && rango.mes === actual.mes
  const bloquearSiguiente = limitarFuturo && esMesActual

  return (
    <div className="selector-mes">
      <button
        type="button"
        className="selector-mes__boton"
        aria-label="Mes anterior"
        onClick={() => onCambio(desplazarMes(rango, -1))}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>

      <span className="selector-mes__etiqueta">{capitalizar(rango.etiqueta)}</span>

      <button
        type="button"
        className="selector-mes__boton"
        aria-label="Mes siguiente"
        disabled={bloquearSiguiente}
        onClick={() => onCambio(desplazarMes(rango, 1))}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  )
}
