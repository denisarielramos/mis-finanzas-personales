import { useCallback, useEffect, useState, type DependencyList } from 'react'
import { textoDeExcepcion } from '../lib/errors'

interface Resultado<T> {
  datos: T | null
  cargando: boolean
  error: string | null
  recargar: () => Promise<void>
}

/**
 * Carga asíncrona con estados de carga y error ya resueltos.
 * Evita repetir el mismo `useEffect` en todas las pantallas.
 */
export function useCarga<T>(
  cargar: () => Promise<T>,
  dependencias: DependencyList,
  mensajeError = 'No se pudieron cargar los datos.',
): Resultado<T> {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(cargar, dependencias)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setDatos(await ejecutar())
    } catch (e) {
      setError(textoDeExcepcion(e, mensajeError))
    } finally {
      setCargando(false)
    }
  }, [ejecutar, mensajeError])

  useEffect(() => {
    let vigente = true

    setCargando(true)
    setError(null)
    ejecutar()
      .then((resultado) => {
        if (vigente) setDatos(resultado)
      })
      .catch((e: unknown) => {
        if (vigente) setError(textoDeExcepcion(e, mensajeError))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [ejecutar, mensajeError])

  return { datos, cargando, error, recargar }
}
