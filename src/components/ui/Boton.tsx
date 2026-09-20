import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'neutro'
type Tamano = 'normal' | 'grande' | 'pequeno'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamano?: Tamano
  bloque?: boolean
  cargando?: boolean
  icono?: ReactNode
}

const CLASE_VARIANTE: Record<Variante, string> = {
  primario: 'boton--primario',
  secundario: 'boton--secundario',
  peligro: 'boton--peligro',
  fantasma: 'boton--fantasma',
  neutro: '',
}

const CLASE_TAMANO: Record<Tamano, string> = {
  normal: '',
  grande: 'boton--grande',
  pequeno: 'boton--pequeno',
}

export function Boton({
  variante = 'neutro',
  tamano = 'normal',
  bloque = false,
  cargando = false,
  icono,
  children,
  className = '',
  disabled,
  type = 'button',
  ...resto
}: Props) {
  const clases = [
    'boton',
    CLASE_VARIANTE[variante],
    CLASE_TAMANO[tamano],
    bloque ? 'boton--bloque' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={clases} disabled={disabled || cargando} {...resto}>
      {cargando ? (
        <LoaderCircle size={18} className="girando" aria-hidden="true" />
      ) : (
        icono ?? null
      )}
      {children}
    </button>
  )
}
