import { useId } from 'react'
import { SIMBOLO_MONEDA, formatearEntradaMonto, soloDigitos } from '../../utils/money'

interface Props {
  /** Valor en texto (solo dígitos). El componente padre guarda el texto crudo. */
  valor: string
  onChange: (digitos: string) => void
  etiqueta?: string
  autoFocus?: boolean
  error?: string | null
}

/**
 * Campo de monto grande, pensado para el pulgar en iPhone:
 * teclado numérico, sin decimales y con los miles agrupados al escribir.
 */
export function CampoMonto({ valor, onChange, etiqueta = 'Monto', autoFocus, error }: Props) {
  const id = useId()
  const digitos = formatearEntradaMonto(valor)
  // El símbolo va dentro del propio valor para que quede centrado de verdad.
  const mostrado = digitos ? `${SIMBOLO_MONEDA} ${digitos}` : ''

  return (
    <div className="monto-grande">
      <label className="monto-grande__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="monto-grande__fila">
        <input
          id={id}
          className="monto-grande__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={`${SIMBOLO_MONEDA} 0`}
          value={mostrado}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-label={`${etiqueta} en guaraníes`}
          onChange={(e) => onChange(soloDigitos(e.target.value))}
        />
      </div>
      {error ? (
        <span className="campo__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}

interface PropsInput {
  id?: string
  valor: string
  onChange: (digitos: string) => void
  disabled?: boolean
  'aria-invalid'?: boolean
}

/** Campo de monto de tamaño normal, para formularios con varios campos. */
export function InputMonto({ valor, onChange, ...resto }: PropsInput) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--texto-tenue)',
          fontSize: 16,
        }}
      >
        {SIMBOLO_MONEDA}
      </span>
      <input
        {...resto}
        className="control numero"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="0"
        style={{ paddingLeft: 52 }}
        value={formatearEntradaMonto(valor)}
        onChange={(e) => onChange(soloDigitos(e.target.value))}
      />
    </div>
  )
}
