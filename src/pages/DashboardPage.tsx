import { Suspense, lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight, Scale, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { SelectorMes } from '../components/SelectorMes'
import { FilaOperacion } from '../components/FilaOperacion'
import { ProximosMovimientos } from '../components/ProximosMovimientos'
import { BotonPrivacidad } from '../components/BotonPrivacidad'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { Boton } from '../components/ui/Boton'
import { iconoPorNombre } from '../components/ui/SelectorIcono'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { calcularPatrimonio } from '../services/accountsService'
import { listarMovimientos, resumenPeriodo } from '../services/movementsService'
import { listarProximosMovimientos, resumirPlanificacion } from '../services/upcomingService'
import { agruparOperaciones } from '../utils/movimientos'
import { capitalizar, mesActual } from '../utils/date'
import { usePrivacidad } from '../hooks/usePrivacidad'

// El gráfico arrastra la librería de charts: se carga aparte para que la
// primera pantalla en el móvil sea lo más ligera posible.
const GraficoGastos = lazy(() =>
  import('../components/GraficoGastos').then((m) => ({ default: m.GraficoGastos })),
)

/** Inicio: patrimonio, resumen del mes, cuentas, últimos movimientos y gasto por categoría. */
export function DashboardPage() {
  const { monto } = usePrivacidad()
  const {
    saldos,
    cargando: cargandoCatalogo,
    error: errorCatalogo,
    categorias,
    cuentaPorId,
  } = useCatalogo()
  const [mes, setMes] = useState(() => mesActual())
  // Se incrementa al confirmar un cobro o un pago, para recargar todo.
  const [version, setVersion] = useState(0)

  const resumen = useCarga(
    () => resumenPeriodo(mes.desde, mes.hasta),
    [mes.desde, mes.hasta, version],
    'No se pudo calcular el resumen del mes.',
  )

  const ultimos = useCarga(
    () => listarMovimientos({ limite: 12 }),
    [version],
    'No se pudieron cargar los últimos movimientos.',
  )

  /**
   * Previsiones del mes seleccionado: una sola carga que alimenta tanto los
   * totales de Planificación como la lista de movimientos previstos.
   * `version` se incrementa al confirmar, así ambas secciones se refrescan.
   */
  const previstoMes = useCarga(
    () => listarProximosMovimientos({ desde: mes.desde, hasta: mes.hasta, limite: 50 }),
    [mes.desde, mes.hasta, version],
    'No se pudieron cargar los movimientos previstos del mes.',
  )

  const patrimonio = useMemo(() => calcularPatrimonio(saldos), [saldos])
  const cuentasVisibles = useMemo(
    () => saldos.filter((s) => s.activa).slice(0, 4),
    [saldos],
  )
  const operaciones = useMemo(
    () => agruparOperaciones(ultimos.datos ?? []).slice(0, 5),
    [ultimos.datos],
  )

  const totalCuentasIncluidas = saldos.filter((s) => s.activa && s.incluir_en_total).length

  const planificacion = useMemo(
    () => resumirPlanificacion(previstoMes.datos ?? []),
    [previstoMes.datos],
  )

  const actual = mesActual()
  const esMesActual = mes.anio === actual.anio && mes.mes === actual.mes

  /**
   * Disponible proyectado = patrimonio real + cobros pendientes − pagos
   * pendientes. Solo tiene sentido en el mes en curso: para otros meses no se
   * muestra, porque ignoraría lo que pase en los meses intermedios.
   */
  const disponibleProyectado = patrimonio + planificacion.flujoPrevisto

  return (
    <>
      <Encabezado
        titulo="Mis Finanzas"
        subtitulo={capitalizar(mes.etiqueta)}
        ancho
        acciones={<BotonPrivacidad />}
      />

      <div className="contenedor contenedor--ancho">
        {/* Se permite avanzar a meses futuros para revisar la planificación. */}
        <SelectorMes rango={mes} onCambio={setMes} limitarFuturo={false} />

        {errorCatalogo ? (
          <div style={{ marginTop: 16 }}>
            <Mensaje tipo="error">{errorCatalogo}</Mensaje>
          </div>
        ) : null}

        <section className="seccion" aria-label="Patrimonio total">
          <div className="tarjeta tarjeta--oscura patrimonio">
            <p className="patrimonio__etiqueta">Patrimonio total</p>
            <p className="patrimonio__monto numero">
              {cargandoCatalogo ? '—' : monto(patrimonio)}
            </p>
            <p className="patrimonio__pie">
              {totalCuentasIncluidas === 1
                ? '1 cuenta incluida en el total'
                : `${totalCuentasIncluidas} cuentas incluidas en el total`}
            </p>
          </div>
        </section>

        <section className="seccion" aria-label="Resumen del mes">
          <div className="resumen">
            <div className="resumen__celda">
              <span className="resumen__etiqueta">
                <TrendingUp size={13} aria-hidden="true" /> Ingresos
              </span>
              <p className="resumen__valor numero texto-positivo">
                {resumen.cargando ? '—' : monto(resumen.datos?.ingresos ?? 0)}
              </p>
            </div>
            <div className="resumen__celda">
              <span className="resumen__etiqueta">
                <TrendingDown size={13} aria-hidden="true" /> Gastos
              </span>
              <p className="resumen__valor numero texto-negativo">
                {resumen.cargando ? '—' : monto(resumen.datos?.gastos ?? 0)}
              </p>
            </div>
            <div className="resumen__celda">
              <span className="resumen__etiqueta">
                <Scale size={13} aria-hidden="true" /> Balance
              </span>
              <p
                className={`resumen__valor numero ${(resumen.datos?.balance ?? 0) < 0 ? 'texto-negativo' : ''}`}
              >
                {resumen.cargando ? '—' : monto(resumen.datos?.balance ?? 0)}
              </p>
            </div>
          </div>
          <p className="campo__ayuda" style={{ marginTop: 8 }}>
            Las transferencias entre tus cuentas no cuentan como ingreso ni como gasto.
          </p>
          {resumen.error ? <Mensaje tipo="error">{resumen.error}</Mensaje> : null}
        </section>

        <section className="seccion" aria-label="Planificación del mes">
          <div className="seccion__cabecera">
            <h2 className="seccion__titulo">Planificación</h2>
            {planificacion.vencidos > 0 ? (
              <span className="etiqueta etiqueta--negativo">
                {planificacion.vencidos} vencido{planificacion.vencidos === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          <div className="resumen">
            <div className="resumen__celda">
              <span className="resumen__etiqueta">
                <TrendingUp size={13} aria-hidden="true" />{' '}
                {esMesActual ? 'Ingresos pendientes' : 'Ingresos previstos'}
              </span>
              <p className="resumen__valor numero texto-positivo">
                {previstoMes.cargando ? '—' : monto(planificacion.ingresosPendientes)}
              </p>
            </div>
            <div className="resumen__celda">
              <span className="resumen__etiqueta">
                <TrendingDown size={13} aria-hidden="true" />{' '}
                {esMesActual ? 'Pagos pendientes' : 'Gastos previstos'}
              </span>
              <p className="resumen__valor numero texto-negativo">
                {previstoMes.cargando ? '—' : monto(planificacion.pagosPendientes)}
              </p>
            </div>
            <div className="resumen__celda">
              <span className="resumen__etiqueta">
                <Scale size={13} aria-hidden="true" /> Flujo previsto
              </span>
              <p
                className={`resumen__valor numero ${planificacion.flujoPrevisto < 0 ? 'texto-negativo' : ''}`}
              >
                {previstoMes.cargando ? '—' : monto(planificacion.flujoPrevisto)}
              </p>
            </div>
          </div>

          {esMesActual ? (
            <div className="tarjeta" style={{ marginTop: 8 }}>
              <div className="linea-proyectada">
                <span className="linea-proyectada__etiqueta">Disponible proyectado</span>
                <span
                  className={`linea-proyectada__valor numero ${disponibleProyectado < 0 ? 'texto-negativo' : ''}`}
                >
                  {cargandoCatalogo || previstoMes.cargando
                    ? '—'
                    : monto(disponibleProyectado)}
                </span>
              </div>
            </div>
          ) : null}

          <p className="campo__ayuda" style={{ marginTop: 8 }}>
            {esMesActual
              ? 'Patrimonio actual más los cobros pendientes, menos los pagos pendientes de este mes. Lo previsto no cambia tus saldos hasta que lo confirmas.'
              : 'Previsiones de ese mes. No incluyen lo que ocurra en los meses intermedios.'}
          </p>
          {previstoMes.error ? <Mensaje tipo="error">{previstoMes.error}</Mensaje> : null}
        </section>

        <section className="seccion" aria-label="Movimientos previstos del mes">
          <div className="seccion__cabecera" style={{ marginBottom: 4 }}>
            <h2 className="seccion__titulo">Movimientos previstos del mes</h2>
          </div>
          <p
            className="campo__ayuda"
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}
          >
            <CalendarClock size={13} aria-hidden="true" /> Cobros y pagos previstos
          </p>

          <ProximosMovimientos
            proximos={previstoMes.datos ?? []}
            cargando={previstoMes.cargando}
            error={previstoMes.error}
            onCambio={() => setVersion((v) => v + 1)}
          />
        </section>

        <div className="rejilla-escritorio">
          <section className="seccion" aria-label="Mis cuentas">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo">Mis cuentas</h2>
              <Link className="seccion__enlace" to="/cuentas">
                Ver todas <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>

            {cargandoCatalogo ? (
              <EsqueletoLista filas={3} />
            ) : cuentasVisibles.length === 0 ? (
              <EstadoVacio
                titulo="Todavía no tienes cuentas."
                texto="Crea tu primera cuenta para empezar a registrar movimientos."
                icono={<Wallet size={22} aria-hidden="true" />}
                accion={
                  <Link to="/cuentas/nueva">
                    <Boton variante="primario">Crear mi primera cuenta</Boton>
                  </Link>
                }
              />
            ) : (
              <ul className="lista">
                {cuentasVisibles.map((cuenta) => {
                  const Icono = iconoPorNombre(cuentaPorId(cuenta.id)?.icono, Wallet)
                  return (
                    <li key={cuenta.id}>
                      <Link to="/cuentas" className="lista__item">
                        <span className="icono-circular" aria-hidden="true">
                          <Icono size={18} />
                        </span>
                        <span className="lista__cuerpo">
                          <span className="lista__titulo">{cuenta.nombre}</span>
                          {!cuenta.incluir_en_total ? (
                            <span className="lista__detalle">Fuera del patrimonio</span>
                          ) : null}
                        </span>
                        <span className="lista__monto numero">
                          {monto(cuenta.saldo_actual)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="seccion" aria-label="Últimos movimientos">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo">Últimos movimientos</h2>
              <Link className="seccion__enlace" to="/movimientos">
                Ver todos <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>

            {ultimos.cargando ? (
              <EsqueletoLista filas={4} />
            ) : ultimos.error ? (
              <Mensaje tipo="error">{ultimos.error}</Mensaje>
            ) : operaciones.length === 0 ? (
              <EstadoVacio
                titulo="Todavía no tienes movimientos."
                texto="Registra tu primer gasto o ingreso con el botón +."
                accion={
                  <Link to="/nuevo/gasto">
                    <Boton variante="primario">Registrar movimiento</Boton>
                  </Link>
                }
              />
            ) : (
              <ul className="lista">
                {operaciones.map((operacion) => (
                  <li key={operacion.clave}>
                    <FilaOperacion operacion={operacion} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="seccion" aria-label="Gastos por categoría">
          <div className="seccion__cabecera">
            <h2 className="seccion__titulo">Gastos por categoría</h2>
          </div>

          {resumen.cargando ? (
            <EsqueletoLista filas={3} />
          ) : (resumen.datos?.gastos ?? 0) === 0 ? (
            <EstadoVacio
              titulo="Sin gastos este mes."
              texto="Cuando registres gastos verás aquí cómo se reparten por categoría."
            />
          ) : (
            <Suspense fallback={<EsqueletoLista filas={3} />}>
              <GraficoGastos
                gastoPorCategoria={resumen.datos?.gastoPorCategoria ?? new Map()}
                categorias={categorias}
                total={resumen.datos?.gastos ?? 0}
              />
            </Suspense>
          )}
        </section>
      </div>
    </>
  )
}
