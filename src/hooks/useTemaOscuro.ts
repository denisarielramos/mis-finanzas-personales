import { useEffect, useState } from 'react'

/**
 * `true` cuando el sistema está en modo oscuro.
 *
 * Los gráficos necesitan colores resueltos en JavaScript (SVG no acepta
 * variables CSS en todos los navegadores), por eso se consulta aquí.
 */
export function useTemaOscuro(): boolean {
  const [oscuro, setOscuro] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = (e: MediaQueryListEvent) => setOscuro(e.matches)
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])

  return oscuro
}
