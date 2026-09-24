import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { textoDeExcepcion } from '../lib/errors'

interface Resultado<T> {
  datos: T | null
  /** Primera carga: todavía no hay datos que mostrar. Es el único esqueleto. */
  cargando: boolean
  /** Revalidación con datos ya en pantalla: no se vacía nada. */
  actualizando: boolean
  /**
   * Lo que se está viendo son los datos de la consulta anterior, porque
   * cambiaron los parámetros (otro mes, otro filtro) y la nueva todavía no
   * llegó. Sirve para atenuar esa zona en vez de dejarla en blanco.
   */
  desfasado: boolean
  error: string | null
  recargar: () => Promise<void>
}

/**
 * Carga asíncrona con estados de carga y error ya resueltos.
 * Evita repetir el mismo `useEffect` en todas las pantallas.
 *
 * Funciona como *stale-while-revalidate*: mientras se vuelve a consultar, los
 * datos anteriores siguen renderizados. Así confirmar un cobro o un pago no
 * hace desaparecer la pantalla; solo se sustituyen los datos al llegar.
 */
export function useCarga<T>(
  cargar: () => Promise<T>,
  dependencias: DependencyList,
  mensajeError = 'No se pudieron cargar los datos.',
): Resultado<T> {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(cargar, dependencias)

  /** Consulta que produjo los datos que hay ahora mismo en pantalla. */
  const consultaDeLosDatos = useRef<(() => Promise<T>) | null>(null)

  const recargar = useCallback(async () => {
    if (consultaDeLosDatos.current) setActualizando(true)
    else setCargando(true)
    setError(null)
    try {
      const resultado = await ejecutar()
      setDatos(resultado)
      consultaDeLosDatos.current = ejecutar
    } catch (e) {
      setError(textoDeExcepcion(e, mensajeError))
    } finally {
      setCargando(false)
      setActualizando(false)
    }
  }, [ejecutar, mensajeError])

  useEffect(() => {
    let vigente = true

    // Con datos en pantalla la recarga es silenciosa: el esqueleto es solo
    // para la primera vez, cuando de verdad no hay nada que enseñar.
    if (consultaDeLosDatos.current) setActualizando(true)
    else setCargando(true)
    setError(null)

    ejecutar()
      .then((resultado) => {
        if (!vigente) return
        setDatos(resultado)
        consultaDeLosDatos.current = ejecutar
      })
      .catch((e: unknown) => {
        if (vigente) setError(textoDeExcepcion(e, mensajeError))
      })
      .finally(() => {
        if (!vigente) return
        setCargando(false)
        setActualizando(false)
      })

    return () => {
      vigente = false
    }
  }, [ejecutar, mensajeError])

  const desfasado =
    consultaDeLosDatos.current !== null && consultaDeLosDatos.current !== ejecutar

  return { datos, cargando, actualizando, desfasado, error, recargar }
}
