import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Receipt } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { FilaOperacion } from '../components/FilaOperacion'
import { Boton } from '../components/ui/Boton'
import { Esqueleto, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { obtenerDetallePresupuesto } from '../services/budgetsService'
import { agruparOperaciones } from '../utils/movimientos'
import { formatearFecha } from '../utils/date'
import { formatearGs, porcentaje } from '../utils/money'
import type { UUID } from '../types/db'

/**
 * Detalle de un presupuesto: cifras del periodo y los gastos reales que lo
 * consumen. Las reglas son las mismas que usa el cálculo del consumo, así que
 * el total de la lista coincide siempre con el «Gastado» del listado.
 */
export function PresupuestoDetallePage() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { categorias, categoriaPorId } = useCatalogo()

  const { datos, cargando, error } = useCarga(
    () => obtenerDetallePresupuesto(id, categorias),
    [id, categorias],
    'No se pudo cargar el presupuesto.',
  )

  const presupuesto = datos?.presupuesto ?? null
  const movimientos = useMemo(() => datos?.movimientos ?? [], [datos])
  const gastado = datos?.gastado ?? 0

  const operaciones = useMemo(() => agruparOperaciones(movimientos), [movimientos])

  /** Reparto del gasto por la categoría concreta de cada movimiento. */
  const porCategoria = useMemo(() => {
    const totales = new Map<UUID, number>()
    for (const m of movimientos) {
      if (!m.categoria_id) continue
      totales.set(m.categoria_id, (totales.get(m.categoria_id) ?? 0) + m.monto)
    }
    return [...totales.entries()]
      .map(([categoriaId, monto]) => ({
        categoriaId,
        nombre: categoriaPorId(categoriaId)?.nombre ?? 'Sin categoría',
        monto,
      }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientos, categoriaPorId])

  const limite = presupuesto?.monto_limite ?? 0
  const disponible = limite - gastado
  const pct = porcentaje(gastado, limite)
  const clase = pct > 100 ? 'progreso__barra--excedido' : pct >= 80 ? 'progreso__barra--aviso' : ''
  const categoria = categoriaPorId(presupuesto?.categoria_id)

  return (
    <>
      <Encabezado titulo={categoria?.nombre ?? 'Presupuesto'} volver="/presupuestos" />

      <div className="contenedor">
        {cargando ? (
          <div className="tarjeta tarjeta--relleno" style={{ display: 'grid', gap: 12 }}>
            <Esqueleto alto={30} ancho="60%" />
            <Esqueleto alto={14} />
            <Esqueleto alto={14} ancho="80%" />
          </div>
        ) : error ? (
          <Mensaje tipo="error">{error}</Mensaje>
        ) : !presupuesto ? (
          <Mensaje tipo="aviso">Este presupuesto ya no existe.</Mensaje>
        ) : (
          <>
            <div className="tarjeta presupuesto">
              <div className="presupuesto__cabecera">
                <div style={{ minWidth: 0 }}>
                  <p className="presupuesto__nombre">
                    {categoria?.nombre ?? 'Categoría eliminada'}
                  </p>
                  <p className="presupuesto__periodo numero">
                    {formatearFecha(presupuesto.fecha_desde)} –{' '}
                    {formatearFecha(presupuesto.fecha_hasta)}
                  </p>
                </div>
                <span
                  className={`etiqueta ${pct > 100 ? 'etiqueta--negativo' : pct >= 80 ? 'etiqueta--aviso' : ''}`}
                >
                  {pct}%
                </span>
              </div>

              <div className="presupuesto__cifras">
                <span className="presupuesto__gastado numero">{formatearGs(gastado)}</span>
                <span className="texto-suave numero">de {formatearGs(limite)}</span>
              </div>

              <div className="progreso">
                <div
                  className={`progreso__barra ${clase}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Consumido ${pct}%`}
                />
              </div>

              <div className="presupuesto__pie">
                <span className={disponible < 0 ? 'texto-negativo' : ''}>
                  {disponible < 0 ? 'Excedido en ' : 'Disponible: '}
                  <span className="numero">{formatearGs(Math.abs(disponible))}</span>
                </span>
                {presupuesto.activo ? null : <span className="etiqueta">Desactivado</span>}
              </div>
            </div>

            <div className="tarjeta" style={{ marginTop: 12 }}>
              <div className="datos">
                <div className="datos__fila">
                  <span className="datos__clave">Límite</span>
                  <span className="datos__valor numero">{formatearGs(limite)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Gastado</span>
                  <span className="datos__valor numero">{formatearGs(gastado)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Disponible</span>
                  <span
                    className={`datos__valor numero ${disponible < 0 ? 'texto-negativo' : ''}`}
                  >
                    {formatearGs(disponible)}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Movimientos</span>
                  <span className="datos__valor numero">{movimientos.length}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Estado</span>
                  <span className="datos__valor">
                    {presupuesto.activo ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
              </div>
            </div>

            {porCategoria.length > 1 ? (
              <section className="seccion" aria-label="Gastos por categoría">
                <div className="seccion__cabecera">
                  <h2 className="seccion__titulo">Gastos por categoría</h2>
                </div>
                <div className="tarjeta">
                  <div className="datos">
                    {porCategoria.map((fila) => (
                      <div className="datos__fila" key={fila.categoriaId}>
                        <span className="datos__clave">{fila.nombre}</span>
                        <span className="datos__valor numero">{formatearGs(fila.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="seccion" aria-label="Gastos del presupuesto">
              <div className="seccion__cabecera">
                <h2 className="seccion__titulo">Gastos</h2>
                <span className="campo__ayuda">
                  {movimientos.length}{' '}
                  {movimientos.length === 1 ? 'movimiento' : 'movimientos'}
                </span>
              </div>

              {operaciones.length === 0 ? (
                <EstadoVacio
                  titulo="No hay gastos asociados a este presupuesto."
                  texto="Los gastos confirmados dentro del periodo y en esta categoría aparecerán aquí."
                  icono={<Receipt size={22} aria-hidden="true" />}
                />
              ) : (
                <>
                  <ul className="lista">
                    {operaciones.map((operacion) => (
                      <li key={operacion.clave}>
                        <FilaOperacion operacion={operacion} />
                      </li>
                    ))}
                  </ul>

                  <div className="tarjeta" style={{ marginTop: 12 }}>
                    <div className="linea-proyectada">
                      <span className="linea-proyectada__etiqueta">Total consumido</span>
                      <span className="linea-proyectada__valor numero">
                        {formatearGs(gastado)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <div className="acciones-pila">
              <Boton
                variante="secundario"
                bloque
                icono={<Pencil size={17} aria-hidden="true" />}
                onClick={() => navegar(`/presupuestos?editar=${presupuesto.id}`)}
              >
                Editar presupuesto
              </Boton>
            </div>

            <p className="campo__ayuda" style={{ marginTop: 16 }}>
              Solo cuentan los gastos confirmados del periodo en esta categoría y en sus
              subcategorías. Las transferencias, los ingresos y lo que todavía está previsto no
              consumen presupuesto.
            </p>
          </>
        )}
      </div>
    </>
  )
}
