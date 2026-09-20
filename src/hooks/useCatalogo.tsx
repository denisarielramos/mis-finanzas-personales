import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Categoria, Cuenta, SaldoCuenta, UUID } from '../types/db'
import { listarCuentas, listarSaldos } from '../services/accountsService'
import { listarCategorias } from '../services/categoriesService'
import { textoDeExcepcion } from '../lib/errors'
import { useAuth } from './useAuth'

/**
 * Catálogo compartido: cuentas, saldos y categorías.
 *
 * Son tablas pequeñas y se usan en casi todas las pantallas, así que se cargan
 * una vez y se refrescan cuando una operación las cambia. De este modo los
 * listados de movimientos no necesitan descargar relaciones extra.
 */

interface ContextoCatalogo {
  cuentas: Cuenta[]
  saldos: SaldoCuenta[]
  categorias: Categoria[]
  cargando: boolean
  error: string | null
  cuentaPorId: (id: UUID | null | undefined) => Cuenta | undefined
  categoriaPorId: (id: UUID | null | undefined) => Categoria | undefined
  saldoPorId: (id: UUID | null | undefined) => SaldoCuenta | undefined
  refrescar: () => Promise<void>
  refrescarSaldos: () => Promise<void>
}

const Contexto = createContext<ContextoCatalogo | null>(null)

export function ProveedorCatalogo({ children }: { children: ReactNode }) {
  const { sesion } = useAuth()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [nuevasCuentas, nuevosSaldos, nuevasCategorias] = await Promise.all([
        listarCuentas(true),
        listarSaldos(),
        listarCategorias(true),
      ])
      setCuentas(nuevasCuentas)
      setSaldos(nuevosSaldos)
      setCategorias(nuevasCategorias)
    } catch (e) {
      setError(textoDeExcepcion(e, 'No se pudieron cargar los datos de la cuenta.'))
    } finally {
      setCargando(false)
    }
  }, [])

  const refrescarSaldos = useCallback(async () => {
    try {
      setSaldos(await listarSaldos())
    } catch (e) {
      console.error('[Mis Finanzas] no se pudieron refrescar los saldos', e)
    }
  }, [])

  // Se depende del id de usuario y no del objeto de sesión: así la renovación
  // periódica del token no vuelve a descargar todo el catálogo.
  const userId = sesion?.user?.id ?? null

  useEffect(() => {
    if (!userId) {
      setCuentas([])
      setSaldos([])
      setCategorias([])
      setCargando(false)
      return
    }
    void cargar()
  }, [userId, cargar])

  const valor = useMemo<ContextoCatalogo>(() => {
    const mapaCuentas = new Map(cuentas.map((c) => [c.id, c]))
    const mapaCategorias = new Map(categorias.map((c) => [c.id, c]))
    const mapaSaldos = new Map(saldos.map((s) => [s.id, s]))

    return {
      cuentas,
      saldos,
      categorias,
      cargando,
      error,
      cuentaPorId: (id) => (id ? mapaCuentas.get(id) : undefined),
      categoriaPorId: (id) => (id ? mapaCategorias.get(id) : undefined),
      saldoPorId: (id) => (id ? mapaSaldos.get(id) : undefined),
      refrescar: cargar,
      refrescarSaldos,
    }
  }, [cuentas, saldos, categorias, cargando, error, cargar, refrescarSaldos])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCatalogo(): ContextoCatalogo {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useCatalogo debe usarse dentro de <ProveedorCatalogo>')
  return contexto
}
