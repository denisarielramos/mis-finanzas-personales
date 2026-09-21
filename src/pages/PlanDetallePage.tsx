import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Ban, Undo2 } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { Esqueleto, Mensaje } from '../components/ui/Estados'
import { HojaPagarCuota, type CuotaPorPagar } from '../components/HojaPagarCuota'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import {
  cancelarPlanCuotas,
  estaVencida,
  listarCuotas,
  obtenerPlan,
  obtenerPlanResumen,
  revertirPagoCuota,
} from '../services/installmentsService'
import { ETIQUETA_ESTADO_PLAN, type CuotaPlan } from '../types/db'
import { formatearFecha, hoyISO } from '../utils/date'
import { formatearGs, porcentaje } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

/**
 * Detalle de un plan de cuotas.
 *
 * El estado «Vencida» es solo visual (fecha de vencimiento pasada y cuota
 * pendiente): nunca se modifica el estado guardado en la base.
 */
export function PlanDetallePage() {
  const { id = '' } = useParams()
  const avisos = useAvisos()
  const { categoriaPorId, cuentaPorId, refrescarSaldos } = useCatalogo()

  const [version, setVersion] = useState(0)
  const [cuotaAPagar, setCuotaAPagar] = useState<CuotaPorPagar | null>(null)
  const [cuotaARevertir, setCuotaARevertir] = useState<CuotaPlan | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [revirtiendo, setRevirtiendo] = useState(false)

  const { datos, cargando, error } = useCarga(
    async () => {
      const [resumen, plan, cuotas] = await Promise.all([
        obtenerPlanResumen(id),
        obtenerPlan(id),
        listarCuotas(id),
      ])
      return { resumen, plan, cuotas }
    },
    [id, version],
    'No se pudo cargar el plan de cuotas.',
  )

  const resumen = datos?.resumen ?? null
  const plan = datos?.plan ?? null
  const cuotas = useMemo(() => datos?.cuotas ?? [], [datos])
  const hoy = hoyISO()

  const pct = resumen ? porcentaje(resumen.cuotas_pagadas, resumen.cantidad_cuotas) : 0

  function refrescar() {
    setVersion((v) => v + 1)
  }

  async function revertir() {
    if (!cuotaARevertir) return
    setRevirtiendo(true)
    try {
      await revertirPagoCuota(cuotaARevertir.id)
      await refrescarSaldos()
      avisos.exito('Pago revertido correctamente.')
      setCuotaARevertir(null)
      refrescar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo revertir el pago.'))
    } finally {
      setRevirtiendo(false)
    }
  }

  async function cancelarPlan() {
    if (!plan) return
    setCancelando(true)
    try {
      await cancelarPlanCuotas(plan.id)
      avisos.exito('Financiación cancelada correctamente.')
      setConfirmandoCancelar(false)
      refrescar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo cancelar la financiación.'))
    } finally {
      setCancelando(false)
    }
  }

  function etiquetaEstadoCuota(cuota: CuotaPlan) {
    if (cuota.estado === 'pagada') return { texto: 'Pagada', clase: 'etiqueta--positivo' }
    if (cuota.estado === 'cancelada') return { texto: 'Cancelada', clase: '' }
    if (estaVencida(cuota, hoy)) return { texto: 'Vencida', clase: 'etiqueta--negativo' }
    return { texto: 'Pendiente', clase: 'etiqueta--aviso' }
  }

  return (
    <>
      <Encabezado titulo={resumen?.nombre ?? 'Plan de cuotas'} volver="/cuotas" />

      <div className="contenedor">
        {cargando ? (
          <div className="tarjeta tarjeta--relleno" style={{ display: 'grid', gap: 12 }}>
            <Esqueleto alto={30} ancho="60%" />
            <Esqueleto alto={14} />
            <Esqueleto alto={14} ancho="80%" />
          </div>
        ) : error ? (
          <Mensaje tipo="error">{error}</Mensaje>
        ) : !resumen ? (
          <Mensaje tipo="aviso">Este plan de cuotas ya no existe.</Mensaje>
        ) : (
          <>
            <div className="tarjeta plan">
              <div className="plan__cabecera">
                <div style={{ minWidth: 0 }}>
                  {resumen.proveedor ? (
                    <p className="plan__proveedor">{resumen.proveedor}</p>
                  ) : null}
                  <p className="plan__nombre">{resumen.nombre}</p>
                </div>
                <span
                  className={`etiqueta ${resumen.estado === 'activo' ? 'etiqueta--info' : ''}`}
                >
                  {ETIQUETA_ESTADO_PLAN[resumen.estado]}
                </span>
              </div>

              <div className="plan__cifras">
                <span className="plan__pendiente numero">
                  {formatearGs(resumen.saldo_pendiente)}
                </span>
                <span className="texto-suave numero">de {formatearGs(resumen.monto_total)}</span>
              </div>

              <div className="progreso">
                <div
                  className="progreso__barra"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Pagado ${pct}%`}
                />
              </div>

              <div className="plan__pie">
                <span>
                  {resumen.cuotas_pagadas} de {resumen.cantidad_cuotas} cuotas pagadas
                </span>
                <span className="numero">{pct}%</span>
              </div>
            </div>

            <div className="tarjeta" style={{ marginTop: 12 }}>
              <div className="datos">
                <div className="datos__fila">
                  <span className="datos__clave">Pagado</span>
                  <span className="datos__valor numero">{formatearGs(resumen.monto_pagado)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Pendiente</span>
                  <span className="datos__valor numero">
                    {formatearGs(resumen.saldo_pendiente)}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Cuotas restantes</span>
                  <span className="datos__valor numero">{resumen.cuotas_pendientes}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Próxima cuota</span>
                  <span className="datos__valor numero">
                    {resumen.proxima_cuota ? formatearFecha(resumen.proxima_cuota) : '—'}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Fecha de compra</span>
                  <span className="datos__valor numero">
                    {formatearFecha(resumen.fecha_compra)}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Cuenta preferida</span>
                  <span className="datos__valor">
                    {cuentaPorId(resumen.cuenta_preferida_id)?.nombre ?? '—'}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Categoría</span>
                  <span className="datos__valor">
                    {categoriaPorId(resumen.categoria_id)?.nombre ?? 'Sin categoría'}
                  </span>
                </div>
                {resumen.descripcion ? (
                  <div className="datos__fila">
                    <span className="datos__clave">Descripción</span>
                    <span className="datos__valor">{resumen.descripcion}</span>
                  </div>
                ) : null}
                {plan?.notas ? (
                  <div className="datos__fila">
                    <span className="datos__clave">Notas</span>
                    <span className="datos__valor">{plan.notas}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <section className="seccion" aria-label="Cuotas del plan">
              <div className="seccion__cabecera">
                <h2 className="seccion__titulo">Cuotas</h2>
              </div>

              <ul className="lista">
                {cuotas.map((cuota) => {
                  const estado = etiquetaEstadoCuota(cuota)
                  const montoMostrado =
                    cuota.estado === 'pagada' && cuota.monto_pagado !== null
                      ? cuota.monto_pagado
                      : cuota.monto_programado

                  return (
                    <li className="fila-con-accion" key={cuota.id}>
                      <div className="lista__item lista__item--estatico">
                        <span className="lista__cuerpo">
                          <span className="lista__titulo">
                            {cuota.numero}/{resumen.cantidad_cuotas} ·{' '}
                            <span className="numero">
                              {formatearFecha(cuota.fecha_vencimiento)}
                            </span>
                          </span>
                          <span className="lista__detalle">
                            <span className={`etiqueta ${estado.clase}`}>{estado.texto}</span>
                            {cuota.estado === 'pagada' && cuota.fecha_pago ? (
                              <span className="numero"> el {formatearFecha(cuota.fecha_pago)}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="lista__monto numero">{formatearGs(montoMostrado)}</span>
                      </div>

                      {cuota.estado === 'pendiente' ? (
                        <span className="fila-con-accion__accion">
                          <Boton
                            variante="primario"
                            tamano="pequeno"
                            onClick={() =>
                              setCuotaAPagar({
                                id: cuota.id,
                                nombre: resumen.nombre,
                                numero: cuota.numero,
                                totalCuotas: resumen.cantidad_cuotas,
                                monto: cuota.monto_programado,
                                fechaVencimiento: cuota.fecha_vencimiento,
                                cuentaId: resumen.cuenta_preferida_id,
                              })
                            }
                          >
                            Pagar
                          </Boton>
                        </span>
                      ) : cuota.estado === 'pagada' ? (
                        <span className="fila-con-accion__accion">
                          <Boton
                            variante="secundario"
                            tamano="pequeno"
                            aria-label={`Revertir el pago de la cuota ${cuota.numero}`}
                            onClick={() => setCuotaARevertir(cuota)}
                          >
                            <Undo2 size={15} aria-hidden="true" />
                          </Boton>
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>

            {resumen.estado === 'activo' ? (
              <div className="acciones-pila">
                <Boton
                  variante="peligro"
                  bloque
                  icono={<Ban size={17} aria-hidden="true" />}
                  onClick={() => setConfirmandoCancelar(true)}
                >
                  Cancelar financiación
                </Boton>
              </div>
            ) : null}

            <p className="campo__ayuda" style={{ marginTop: 16 }}>
              Las cuotas pendientes no afectan a tus saldos. Al registrar un pago se crea el gasto
              real en la cuenta elegida.
            </p>
          </>
        )}
      </div>

      <HojaPagarCuota
        cuota={cuotaAPagar}
        onCerrar={() => setCuotaAPagar(null)}
        onPagada={refrescar}
      />

      <Dialogo
        abierto={cuotaARevertir !== null}
        titulo="¿Revertir este pago?"
        mensaje="El movimiento asociado será anulado y la cuota volverá a pendiente."
        textoConfirmar="Revertir"
        peligroso
        procesando={revirtiendo}
        onConfirmar={revertir}
        onCancelar={() => setCuotaARevertir(null)}
      />

      <Dialogo
        abierto={confirmandoCancelar}
        titulo="¿Cancelar esta financiación?"
        mensaje="Las cuotas pendientes se cancelarán y dejarán de contar como compromisos futuros. Las cuotas ya pagadas se conservan como historial."
        textoConfirmar="Cancelar financiación"
        peligroso
        procesando={cancelando}
        onConfirmar={cancelarPlan}
        onCancelar={() => setConfirmandoCancelar(false)}
      />
    </>
  )
}
