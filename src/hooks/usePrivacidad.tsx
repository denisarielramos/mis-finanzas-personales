import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  SIMBOLO_MONEDA,
  formatearGs,
  formatearGsCorto,
  prefijoSigno,
  type OpcionesFormato,
} from '../utils/money'

/**
 * Modo privacidad: oculta los importes en pantalla sin tocar ningún dato.
 *
 * Es solo presentación. Los saldos, los movimientos y los cálculos siguen
 * exactamente igual; lo único que cambia es lo que se dibuja.
 */

const CLAVE = 'finanzas.ocultarMontos'
const OCULTO = '••••••••'

function leerPreferencia(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'true'
  } catch {
    // Safari en privado, almacenamiento bloqueado… se asume visible.
    return false
  }
}

function guardarPreferencia(valor: boolean): void {
  try {
    localStorage.setItem(CLAVE, String(valor))
  } catch {
    // Si no se puede guardar, el modo sigue funcionando en esta sesión.
  }
}

interface ContextoPrivacidad {
  ocultarMontos: boolean
  alternarOcultarMontos: () => void
  /**
   * Formatea un importe respetando el modo privacidad.
   * Visible usa `formatearGs`, que sigue siendo la única autoridad de formato.
   */
  monto: (valor: unknown, opciones?: OpcionesFormato) => string
  /** Versión abreviada (ejes y totales de gráficos). */
  montoCorto: (valor: unknown) => string
}

const Contexto = createContext<ContextoPrivacidad | null>(null)

export function ProveedorPrivacidad({ children }: { children: ReactNode }) {
  const [ocultarMontos, setOcultarMontos] = useState(leerPreferencia)

  const alternarOcultarMontos = useCallback(() => {
    setOcultarMontos((actual) => {
      const siguiente = !actual
      guardarPreferencia(siguiente)
      return siguiente
    })
  }, [])

  const valor = useMemo<ContextoPrivacidad>(
    () => ({
      ocultarMontos,
      alternarOcultarMontos,
      monto: (valor, opciones) =>
        ocultarMontos
          ? `${prefijoSigno(valor, opciones)}${SIMBOLO_MONEDA} ${OCULTO}`
          : formatearGs(valor, opciones),
      montoCorto: (valor) => (ocultarMontos ? OCULTO : formatearGsCorto(valor)),
    }),
    [ocultarMontos, alternarOcultarMontos],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function usePrivacidad(): ContextoPrivacidad {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('usePrivacidad debe usarse dentro de <ProveedorPrivacidad>')
  return contexto
}
