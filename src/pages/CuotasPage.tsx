import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, CreditCard, Plus } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCarga } from '../hooks/useCarga'
import {
  deudaPendiente,
  listarCuotasPendientes,
  listarPlanes,
  proximaCuotaPorPlan,
} from '../services/installmentsService'
import { ETIQUETA_ESTADO_PLAN, type PlanCuotasResumen } from '../types/db'
import { formatearFecha } from '../utils/date'
import { formatearGs, porcentaje } from '../utils/money'

/**
 * Cuotas y financiaciones.
 *
 * Las cuotas pendientes son compromisos futuros: no figuran en
 * `public.movimientos` ni afectan a los saldos hasta que se pagan.
 */
export function CuotasPage() {
  const navegar = useNavigate()

  const { datos, cargando, error } = useCarga(
    async () => {
      const planes = await listarPlanes()
      const pendientes = await listarCuotasPendientes(planes.map((p) => p.id))
      return { planes, proximas: proximaCuotaPorPlan(pendientes) }
    },
    [],
    'No se pudieron cargar los planes de cuotas.',
  )

  const planes = useMemo(() => datos?.planes ?? [], [datos])
  const proximas = datos?.proximas
  const activos = useMemo(() => planes.filter((p) => p.estado === 'activo'), [planes])
  const historial = useMemo(() => planes.filter((p) => p.estado !== 'activo'), [planes])
  const deuda = useMemo(() => deudaPendiente(planes), [planes])

  function tarjetaPlan(plan: PlanCuotasResumen) {
    const pct = porcentaje(plan.cuotas_pagadas, plan.cantidad_cuotas)
    const proxima = proximas?.get(plan.id)
    const fechaProxima = proxima?.fecha_vencimiento ?? plan.proxima_cuota

    return (
      <button
        key={plan.id}
        type="button"
        className="tarjeta tarjeta--pulsable plan"
        style={{ opacity: plan.estado === 'cancelado' ? 0.65 : 1 }}
        onClick={() => navegar(`/cuotas/${plan.id}`)}
      >
        <div className="plan__cabecera">
          <div style={{ minWidth: 0 }}>
            {plan.proveedor ? <p className="plan__proveedor">{plan.proveedor}</p> : null}
            <p className="plan__nombre">{plan.nombre}</p>
          </div>
          <span
            className={`etiqueta ${plan.estado === 'activo' ? 'etiqueta--info' : ''}`}
          >
            {plan.cuotas_pagadas} de {plan.cantidad_cuotas}
          </span>
        </div>

        <div className="plan__cifras">
          <span className="plan__pendiente numero">{formatearGs(plan.saldo_pendiente)}</span>
          <span className="texto-suave numero">de {formatearGs(plan.monto_total)}</span>
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
            {plan.estado === 'activo' && fechaProxima ? (
              <>
                Próxima: <span className="numero">{formatearFecha(fechaProxima)}</span>
                {proxima ? (
                  <>
                    {' — '}
                    <span className="numero">{formatearGs(proxima.monto_programado)}</span>
                  </>
                ) : null}
              </>
            ) : (
              ETIQUETA_ESTADO_PLAN[plan.estado]
            )}
          </span>
          <ChevronRight size={16} className="lista__flecha" aria-hidden="true" />
        </div>
      </button>
    )
  }

  return (
    <>
      <Encabezado
        titulo="Cuotas"
        volver="/mas"
        acciones={
          <button
            type="button"
            className="boton-icono"
            aria-label="Nueva compra en cuotas"
            onClick={() => navegar('/cuotas/nueva')}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        }
      />

      <div className="contenedor">
        <div className="tarjeta tarjeta--oscura patrimonio">
          <p className="patrimonio__etiqueta">Deuda pendiente total</p>
          <p className="patrimonio__monto numero">{cargando ? '—' : formatearGs(deuda)}</p>
          <p className="patrimonio__pie">
            {activos.length === 1
              ? '1 financiación activa'
              : `${activos.length} financiaciones activas`}
          </p>
        </div>

        {error ? (
          <div style={{ marginTop: 16 }}>
            <Mensaje tipo="error">{error}</Mensaje>
          </div>
        ) : null}

        <section className="seccion" aria-label="Financiaciones activas">
          {cargando ? (
            <EsqueletoLista filas={2} />
          ) : planes.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no tienes compras en cuotas."
              texto="Registra una financiación para seguir cuánto falta por pagar."
              icono={<CreditCard size={22} aria-hidden="true" />}
              accion={
                <Boton variante="primario" onClick={() => navegar('/cuotas/nueva')}>
                  Nueva compra en cuotas
                </Boton>
              }
            />
          ) : activos.length === 0 ? (
            <EstadoVacio
              titulo="No tienes financiaciones activas."
              texto="Las que ya terminaste aparecen más abajo."
              accion={
                <Boton variante="primario" onClick={() => navegar('/cuotas/nueva')}>
                  Nueva compra en cuotas
                </Boton>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activos.map(tarjetaPlan)}
            </div>
          )}
        </section>

        {historial.length > 0 ? (
          <section className="seccion" aria-label="Historial de financiaciones">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo">Historial</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {historial.map(tarjetaPlan)}
            </div>
          </section>
        ) : null}

        {planes.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            <Boton variante="secundario" bloque onClick={() => navegar('/cuotas/nueva')}>
              Nueva compra en cuotas
            </Boton>
          </div>
        ) : null}

        <p className="campo__ayuda" style={{ marginTop: 16 }}>
          Las cuotas pendientes no afectan a tus saldos: se convierten en un gasto real cuando
          registras el pago.
        </p>
      </div>
    </>
  )
}
