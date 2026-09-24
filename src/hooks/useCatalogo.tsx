import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
 * una vez y se revalidan cuando una operación las cambia. De este modo los
 * listados de movimientos no necesitan descargar relaciones extra.
 *
 * El catálogo se comporta como una caché en memoria (nunca en localStorage:
 * los saldos son dato financiero y su autoridad es `v_saldos_cuentas`):
 *
 * - `cargando` solo es cierto en la PRIMERA carga, cuando todavía no hay nada
 *   que enseñar. Es el único momento en el que las pantallas ponen esqueletos.
 * - `actualizando` marca una revalidación con datos ya visibles: la pantalla
 *   se mantiene tal cual y los datos se sustituyen cuando llegan.
 */

/** Campos que `public.cuentas` y `v_saldos_cuentas` comparten. */
function camposCompartidos(cambios: Partial<Cuenta>): Partial<SaldoCuenta> {
  const compartidos: Partial<SaldoCuenta> = {}
  if (cambios.nombre !== undefined) compartidos.nombre = cambios.nombre
  if (cambios.tipo !== undefined) compartidos.tipo = cambios.tipo
  if (cambios.saldo_inicial !== undefined) compartidos.saldo_inicial = cambios.saldo_inicial
  if (cambios.activa !== undefined) compartidos.activa = cambios.activa
  if (cambios.incluir_en_total !== undefined) {
    compartidos.incluir_en_total = cambios.incluir_en_total
  }
  return compartidos
}

interface ContextoCatalogo {
  cuentas: Cuenta[]
  saldos: SaldoCuenta[]
  categorias: Categoria[]
  /** Primera carga: todavía no hay nada que mostrar. */
  cargando: boolean
  /** Revalidación en segundo plano con los datos anteriores en pantalla. */
  actualizando: boolean
  error: string | null
  cuentaPorId: (id: UUID | null | undefined) => Cuenta | undefined
  categoriaPorId: (id: UUID | null | undefined) => Categoria | undefined
  saldoPorId: (id: UUID | null | undefined) => SaldoCuenta | undefined
  /**
   * Aplica un cambio ya conocido sobre una cuenta sin volver a consultar nada.
   * Refleja en `saldos` los campos que la vista comparte con la tabla; el
   * `saldo_actual` NO se recalcula aquí: su autoridad es `v_saldos_cuentas`.
   */
  actualizarCuentaLocal: (id: UUID, cambios: Partial<Cuenta>) => void
  /** Revalidación completa. Solo cuando de verdad cambió todo el catálogo. */
  refrescar: () => Promise<void>
  refrescarCuentas: () => Promise<void>
  refrescarSaldos: () => Promise<void>
  refrescarCategorias: () => Promise<void>
}

const Contexto = createContext<ContextoCatalogo | null>(null)

export function ProveedorCatalogo({ children }: { children: ReactNode }) {
  const { sesion } = useAuth()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Hubo al menos una carga completa con éxito: a partir de ahí, sin esqueletos. */
  const hayDatos = useRef(false)

  const cargar = useCallback(async () => {
    if (hayDatos.current) setActualizando(true)
    else setCargando(true)
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
      hayDatos.current = true
    } catch (e) {
      setError(textoDeExcepcion(e, 'No se pudieron cargar los datos de la cuenta.'))
    } finally {
      setCargando(false)
      setActualizando(false)
    }
  }, [])

  /**
   * Revalidaciones parciales: descargan solo lo que cambió y nunca vacían la
   * pantalla. Un fallo aquí no borra lo que ya se está viendo.
   */
  const refrescarCuentas = useCallback(async () => {
    setActualizando(true)
    try {
      setCuentas(await listarCuentas(true))
    } catch (e) {
      console.error('[Mis Finanzas] no se pudieron refrescar las cuentas', e)
    } finally {
      setActualizando(false)
    }
  }, [])

  const refrescarSaldos = useCallback(async () => {
    setActualizando(true)
    try {
      setSaldos(await listarSaldos())
    } catch (e) {
      console.error('[Mis Finanzas] no se pudieron refrescar los saldos', e)
    } finally {
      setActualizando(false)
    }
  }, [])

  const refrescarCategorias = useCallback(async () => {
    setActualizando(true)
    try {
      setCategorias(await listarCategorias(true))
    } catch (e) {
      console.error('[Mis Finanzas] no se pudieron refrescar las categorías', e)
    } finally {
      setActualizando(false)
    }
  }, [])

  const actualizarCuentaLocal = useCallback((id: UUID, cambios: Partial<Cuenta>) => {
    setCuentas((actuales) =>
      actuales.map((cuenta) => (cuenta.id === id ? { ...cuenta, ...cambios } : cuenta)),
    )

    const compartidos = camposCompartidos(cambios)
    if (Object.keys(compartidos).length === 0) return

    setSaldos((actuales) =>
      actuales.map((saldo) => (saldo.id === id ? { ...saldo, ...compartidos } : saldo)),
    )
  }, [])

  // Se depende del id de usuario y no del objeto de sesión: así la renovación
  // periódica del token no vuelve a descargar todo el catálogo.
  const userId = sesion?.user?.id ?? null

  useEffect(() => {
    if (!userId) {
      hayDatos.current = false
      setCuentas([])
      setSaldos([])
      setCategorias([])
      setCargando(false)
      setActualizando(false)
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
      actualizando,
      error,
      cuentaPorId: (id) => (id ? mapaCuentas.get(id) : undefined),
      categoriaPorId: (id) => (id ? mapaCategorias.get(id) : undefined),
      saldoPorId: (id) => (id ? mapaSaldos.get(id) : undefined),
      actualizarCuentaLocal,
      refrescar: cargar,
      refrescarCuentas,
      refrescarSaldos,
      refrescarCategorias,
    }
  }, [
    cuentas,
    saldos,
    categorias,
    cargando,
    actualizando,
    error,
    actualizarCuentaLocal,
    cargar,
    refrescarCuentas,
    refrescarSaldos,
    refrescarCategorias,
  ])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCatalogo(): ContextoCatalogo {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useCatalogo debe usarse dentro de <ProveedorCatalogo>')
  return contexto
}
