import { useId, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props {
  etiqueta: string
  error?: string | null
  ayuda?: string
  children: (props: { id: string; 'aria-invalid'?: boolean }) => ReactNode
}

/** Campo de formulario con etiqueta asociada, texto de ayuda y error. */
export function Campo({ etiqueta, error, ayuda, children }: Props) {
  const id = useId()

  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined })}
      {ayuda && !error ? <span className="campo__ayuda">{ayuda}</span> : null}
      {error ? (
        <span className="campo__error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  )
}
