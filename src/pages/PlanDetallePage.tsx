import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Ban, Pencil, Undo2 } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { Esqueleto, Mensaje } from '../components/ui/Estados'
import { HojaPagarCuota, type CuotaPorPagar } from '../components/HojaPagarCuota'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import {
  archivarPlanCuotas,
  cancelarPlanCuotas,
  desarchivarPlanCuotas,
  estaVencida,
  listarCuotas,
  obtenerPlan,
  obtenerPlanResumen,
  revertirPagoCuota,
} from '../services/installmentsService'
import { ETIQUETA_ESTADO_PLAN, ETIQUETA_TIPO_MONTO, type CuotaPlan } from '../types/db'
import { formatearFecha, hoyISO } from '../utils/date'
import { porcentaje } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'
import { usePrivacidad } from '../hooks/usePrivacidad'

/**
 * Detalle de un plan de cuotas.
 *
 * El estado «Vencida» es solo visual (fecha de vencimiento pasada y cuota
 * pendiente): nunca se modifica el estado guardado en la base.
 */
export function PlanDetallePage() {
  const { monto } = usePrivacidad()
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const { categoriaPorId, cuentaPorId, refrescarSaldos } = useCatalogo()

  const [version, setVersion] = useState(0)
  const [cuotaAPagar, setCuotaAPagar] = useState<CuotaPorPagar | null>(null)
  const [cuotaARevertir, setCuotaARevertir] = useState<CuotaPlan | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [revirtiendo, setRevirtiendo] = useState(false)
  const [archivando, setArchivando] = useState(false)

  const { datos, cargando, error, recargar } = useCarga(
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

  /** Monto de cada cuota: el de la primera pendiente o el reparto del total. */
  const montoCuota = useMemo(() => {
    const pendiente = cuotas.find((c) => c.estado === 'pendiente')
    if (pendiente) return pendiente.monto_programado
    if (cuotas.length > 0) return cuotas[0].monto_programado
    if (resumen && resumen.cantidad_cuotas > 0) {
      return Math.round(resumen.monto_total / resumen.cantidad_cuotas)
    }
    return 0
  }, [cuotas, resumen])

  const pct = resumen ? porcentaje(resumen.cuotas_pagadas, resumen.cantidad_cuotas) : 0
  const esAproximada = resumen?.tipo_monto === 'aproximado'
  /** Solo se archiva lo terminado: la base rechaza archivar una activa. */
  const puedeArchivar =
    resumen !== null && !resumen.archivado && resumen.estado !== 'activo'

  /** Revalidación silenciosa: los datos anteriores siguen en pantalla. */
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

  async function archivar() {
    if (!plan || archivando) return
    setArchivando(true)
    try {
      await archivarPlanCuotas(plan.id)
      avisos.exito('Financiación archivada.')
      await recargar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo archivar la financiación.'))
    } finally {
      setArchivando(false)
    }
  }

  async function desarchivar() {
    if (!plan || archivando) return
    setArchivando(true)
    try {
      await desarchivarPlanCuotas(plan.id)
      avisos.exito('Financiación devuelta al listado.')
      await recargar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo desarchivar la financiación.'))
    } finally {
      setArchivando(false)
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
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {resumen.archivado ? <span className="etiqueta">Archivada</span> : null}
                  <span
                    className={`etiqueta ${resumen.estado === 'activo' ? 'etiqueta--info' : ''}`}
                  >
                    {ETIQUETA_ESTADO_PLAN[resumen.estado]}
                  </span>
                </span>
              </div>

              <div className="plan__cifras">
                <span className="plan__pendiente numero">
                  {esAproximada ? 'Cuota estimada' : 'Cuota'}: {monto(montoCuota)}
                </span>
                <span className="texto-suave numero">
                  {resumen.cuotas_pagadas} de {resumen.cantidad_cuotas} pagadas
                </span>
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
                <span className="numero">
                  {esAproximada ? 'Pendiente estimado' : 'Pendiente'}:{' '}
                  {monto(resumen.saldo_pendiente)}
                </span>
                <span className="numero">{pct}%</span>
              </div>
            </div>

            <div className="tarjeta" style={{ marginTop: 12 }}>
              <div className="datos">
                <div className="datos__fila">
                  <span className="datos__clave">
                    {esAproximada ? 'Cuota estimada' : 'Monto de cuota'}
                  </span>
                  <span className="datos__valor numero">{monto(montoCuota)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Tipo de cuota</span>
                  <span className="datos__valor">{ETIQUETA_TIPO_MONTO[resumen.tipo_monto]}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Cuotas</span>
                  <span className="datos__valor numero">{resumen.cantidad_cuotas}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Pagado</span>
                  <span className="datos__valor numero">
                    {monto(resumen.monto_pagado)} · {resumen.cuotas_pagadas}{' '}
                    {resumen.cuotas_pagadas === 1 ? 'cuota' : 'cuotas'}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">
                    {esAproximada ? 'Proyección pendiente' : 'Pendiente'}
                  </span>
                  <span className="datos__valor numero">
                    {monto(resumen.saldo_pendiente)}
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

            {/* Antes de la lista: en un plan de 36 cuotas, al final quedaba
                demasiado lejos. */}
            <div className="acciones-pila">
              <Boton
                variante="secundario"
                bloque
                icono={<Pencil size={17} aria-hidden="true" />}
                onClick={() => navegar(`/cuotas/${resumen.id}/editar`)}
              >
                Editar financiación
              </Boton>
            </div>

            <section className="seccion" aria-label="Cuotas del plan">
              <div className="seccion__cabecera">
                <h2 className="seccion__titulo">Cuotas</h2>
              </div>

              <ul className="lista">
                {cuotas.map((cuota) => {
                  const estado = etiquetaEstadoCuota(cuota)
                  // Una cuota pagada muestra lo REAL; una pendiente, lo programado.
                  const pagadaConImporte =
                    cuota.estado === 'pagada' && cuota.monto_pagado !== null
                  const montoMostrado = pagadaConImporte
                    ? (cuota.monto_pagado as number)
                    : cuota.monto_programado
                  const difiereDelEstimado =
                    pagadaConImporte && cuota.monto_pagado !== cuota.monto_programado

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
                          {difiereDelEstimado ? (
                            <span className="lista__momento numero">
                              Estimado: {monto(cuota.monto_programado)}
                            </span>
                          ) : null}
                        </span>
                        <span className="lista__monto numero">
                          {monto(montoMostrado)}
                          {difiereDelEstimado ? (
                            <span className="lista__periodo">pagado</span>
                          ) : null}
                        </span>
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
                                tipoMonto: resumen.tipo_monto,
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

            {/* Al final quedan solo las acciones de estado. */}
            <div className="acciones-pila">
              {puedeArchivar ? (
                <Boton
                  variante="secundario"
                  bloque
                  cargando={archivando}
                  icono={<Archive size={17} aria-hidden="true" />}
                  onClick={archivar}
                >
                  Archivar financiación
                </Boton>
              ) : null}

              {resumen.archivado ? (
                <Boton
                  variante="secundario"
                  bloque
                  cargando={archivando}
                  icono={<ArchiveRestore size={17} aria-hidden="true" />}
                  onClick={desarchivar}
                >
                  Desarchivar
                </Boton>
              ) : null}

              {resumen.estado === 'activo' ? (
                <Boton
                  variante="peligro"
                  bloque
                  icono={<Ban size={17} aria-hidden="true" />}
                  onClick={() => setConfirmandoCancelar(true)}
                >
                  Cancelar financiación
                </Boton>
              ) : null}
            </div>

            <p className="campo__ayuda" style={{ marginTop: 16 }}>
              {esAproximada
                ? 'El importe de las cuotas es una estimación: al registrar cada pago se guarda lo que realmente se debitó, y el estimado de las demás cuotas no cambia.'
                : 'Las cuotas pendientes no afectan a tus saldos. Al registrar un pago se crea el gasto real en la cuenta elegida.'}
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
