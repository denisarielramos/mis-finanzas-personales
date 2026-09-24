interface Props {
  etiqueta: string
  descripcion?: string
  activo: boolean
  onCambio: (activo: boolean) => void
  disabled?: boolean
  /** Solo el interruptor: la etiqueta queda para lectores de pantalla. */
  compacto?: boolean
}

/** Interruptor al estilo iOS. */
export function Interruptor({
  etiqueta,
  descripcion,
  activo,
  onCambio,
  disabled,
  compacto = false,
}: Props) {
  return (
    <label className={`interruptor${compacto ? ' interruptor--compacto' : ''}`}>
      <span className={compacto ? 'solo-lectores' : undefined}>
        <span className="interruptor__texto">{etiqueta}</span>
        {descripcion ? (
          <span className="campo__ayuda" style={{ display: 'block' }}>
            {descripcion}
          </span>
        ) : null}
      </span>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <input
          type="checkbox"
          checked={activo}
          disabled={disabled}
          onChange={(e) => onCambio(e.target.checked)}
        />
        <span className="interruptor__control" aria-hidden="true" />
      </span>
    </label>
  )
}
