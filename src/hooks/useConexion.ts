import { useEffect, useState } from 'react'

/**
 * Estado de conexión del navegador.
 *
 * Esta primera versión no implementa una cola de operaciones offline:
 * si no hay conexión, los formularios avisan en lugar de encolar
 * operaciones financieras.
 */
export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const conectado = () => setEnLinea(true)
    const desconectado = () => setEnLinea(false)

    window.addEventListener('online', conectado)
    window.addEventListener('offline', desconectado)
    return () => {
      window.removeEventListener('online', conectado)
      window.removeEventListener('offline', desconectado)
    }
  }, [])

  return enLinea
}
