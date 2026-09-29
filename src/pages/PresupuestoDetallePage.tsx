import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSpreadsheet, FileText, Pencil, Receipt, Share2 } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { FilaOperacion } from '../components/FilaOperacion'
import { Boton } from '../components/ui/Boton'
import { Hoja } from '../components/ui/Hoja'
import { Esqueleto, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import { obtenerDetallePresupuesto, obtenerGastosParaExportar } from '../services/budgetsService'
import { agruparOperaciones } from '../utils/movimientos'
import { formatearFecha } from '../utils/date'
import { porcentaje } from '../utils/money'
import type { UUID } from '../types/db'
import type { ReportePresupuesto } from '../types/reportes'
import { textoDeExcepcion } from '../lib/errors'
import { usePrivacidad } from '../hooks/usePrivacidad'

/**
 * Detalle de un presupuesto: cifras del periodo y los gastos reales que lo
 * consumen. Las reglas son las mismas que usa el cálculo del consumo, así que
 * el total de la lista coincide siempre con el «Gastado» del listado.
 */
export function PresupuestoDetallePage() {
  const { monto } = usePrivacidad()
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const { categorias, categoriaPorId, cuentaPorId } = useCatalogo()

  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null)
  const [hojaAbierta, setHojaAbierta] = useState(false)

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
      .map(([categoriaId, total]) => ({
        categoriaId,
        nombre: categoriaPorId(categoriaId)?.nombre ?? 'Sin categoría',
        monto: total,
      }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientos, categoriaPorId])

  const limite = presupuesto?.monto_limite ?? 0
  const disponible = limite - gastado
  const pct = porcentaje(gastado, limite)
  const clase = pct > 100 ? 'progreso__barra--excedido' : pct >= 80 ? 'progreso__barra--aviso' : ''
  const categoria = categoriaPorId(presupuesto?.categoria_id)

  /**
   * Arma el reporte con lo que YA está en pantalla: mismos movimientos, mismo
   * cálculo y mismo desglose. Lo único que se pide aparte son las páginas que
   * falten cuando la consulta de la pantalla se topó con su límite.
   *
   * Los importes van con sus valores reales aunque el modo privacidad esté
   * activo: exportar es una acción explícita de quien usa la aplicación.
   */
  async function construirReporte(): Promise<ReportePresupuesto> {
    if (!datos || !presupuesto) throw new Error('El presupuesto todavía no se cargó.')

    const completos = await obtenerGastosParaExportar(datos)
    const totalGastado = completos.reduce((suma, m) => suma + m.monto, 0)

    const totales = new Map<UUID, number>()
    for (const m of completos) {
      if (!m.categoria_id) continue
      totales.set(m.categoria_id, (totales.get(m.categoria_id) ?? 0) + m.monto)
    }

    return {
      categoria: categoria?.nombre ?? 'Sin categoría',
      desde: presupuesto.fecha_desde,
      hasta: presupuesto.fecha_hasta,
      limite: presupuesto.monto_limite,
      gastado: totalGastado,
      disponible: presupuesto.monto_limite - totalGastado,
      porcentaje: porcentaje(totalGastado, presupuesto.monto_limite),
      estado: presupuesto.activo ? 'activo' : 'desactivado',
      porCategoria: [...totales.entries()]
        .map(([categoriaId, monto]) => ({
          nombre: categoriaPorId(categoriaId)?.nombre ?? 'Sin categoría',
          monto,
          porcentaje: porcentaje(monto, totalGastado),
        }))
        .sort((a, b) => b.monto - a.monto),
      gastos: completos.map((m) => ({
        fecha: m.fecha,
        descripcion: m.descripcion?.trim() || 'Sin descripción',
        categoria: categoriaPorId(m.categoria_id)?.nombre ?? 'Sin categoría',
        cuenta: cuentaPorId(m.cuenta_id)?.nombre ?? 'Cuenta eliminada',
        monto: m.monto,
      })),
    }
  }

  async function exportar(formato: 'pdf' | 'excel') {
    if (exportando) return
    setExportando(formato)
    try {
      const reporte = await construirReporte()
      // jspdf y xlsx pesan bastante: se descargan al exportar, no al abrir
      // el presupuesto.
      const exportador = await import('../services/budgetExportService')
      const resultado =
        formato === 'pdf'
          ? await exportador.compartirPresupuestoPdf(reporte)
          : await exportador.compartirPresupuestoExcel(reporte)

      if (resultado === 'descargado') avisos.exito('Archivo descargado.')
      if (resultado === 'compartido') avisos.exito('Reporte compartido.')
      if (resultado !== 'cancelado') setHojaAbierta(false)
    } catch (e) {
      avisos.error(
        textoDeExcepcion(
          e,
          formato === 'pdf' ? 'No se pudo generar el PDF.' : 'No se pudo generar el Excel.',
        ),
      )
    } finally {
      setExportando(null)
    }
  }

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
                <span className="presupuesto__gastado numero">{monto(gastado)}</span>
                <span className="texto-suave numero">de {monto(limite)}</span>
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
                  <span className="numero">{monto(Math.abs(disponible))}</span>
                </span>
                {presupuesto.activo ? null : <span className="etiqueta">Desactivado</span>}
              </div>
            </div>

            <div className="tarjeta" style={{ marginTop: 12 }}>
              <div className="datos">
                <div className="datos__fila">
                  <span className="datos__clave">Límite</span>
                  <span className="datos__valor numero">{monto(limite)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Gastado</span>
                  <span className="datos__valor numero">{monto(gastado)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Disponible</span>
                  <span
                    className={`datos__valor numero ${disponible < 0 ? 'texto-negativo' : ''}`}
                  >
                    {monto(disponible)}
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
                        <span className="datos__valor numero">{monto(fila.monto)}</span>
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
                        {monto(gastado)}
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
                icono={<Share2 size={17} aria-hidden="true" />}
                onClick={() => setHojaAbierta(true)}
              >
                Compartir / Exportar
              </Boton>
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

      <Hoja
        abierta={hojaAbierta}
        titulo="Compartir / Exportar"
        onCerrar={() => (exportando ? undefined : setHojaAbierta(false))}
      >
        <div className="acciones-pila">
          <Boton
            variante="secundario"
            bloque
            cargando={exportando === 'pdf'}
            disabled={exportando !== null}
            icono={<FileText size={17} aria-hidden="true" />}
            onClick={() => exportar('pdf')}
          >
            Compartir PDF
          </Boton>
          <Boton
            variante="secundario"
            bloque
            cargando={exportando === 'excel'}
            disabled={exportando !== null}
            icono={<FileSpreadsheet size={17} aria-hidden="true" />}
            onClick={() => exportar('excel')}
          >
            Compartir Excel
          </Boton>
        </div>

        <p className="campo__ayuda" style={{ marginTop: 12 }}>
          El reporte incluye el resumen, el desglose por categoría y todos los gastos del periodo,
          con sus importes reales. Si tu teléfono lo permite se abrirá la hoja de compartir; si no,
          el archivo se descarga.
        </p>
      </Hoja>
    </>
  )
}
