import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ChevronRight } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCarga } from '../hooks/useCarga'
import { listarPlanes } from '../services/installmentsService'
import { ETIQUETA_ESTADO_PLAN } from '../types/db'
import { formatearFecha } from '../utils/date'
import { usePrivacidad } from '../hooks/usePrivacidad'

/**
 * Financiaciones archivadas.
 *
 * Archivar es solo visibilidad: el estado, las cuotas, los pagos y los saldos
 * quedan exactamente como estaban.
 */
export function CuotasArchivadasPage() {
  const { monto } = usePrivacidad()
  const navegar = useNavigate()

  const { datos, cargando, error } = useCarga(
    () => listarPlanes(),
    [],
    'No se pudieron cargar las financiaciones archivadas.',
  )

  const archivadas = useMemo(
    () => (datos ?? []).filter((plan) => plan.archivado),
    [datos],
  )

  return (
    <>
      <Encabezado
        titulo="Financiaciones archivadas"
        volver="/cuotas"
        subtitulo={
          cargando
            ? undefined
            : `${archivadas.length} ${archivadas.length === 1 ? 'archivada' : 'archivadas'}`
        }
      />

      <div className="contenedor">
        {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

        {cargando ? (
          <EsqueletoLista filas={3} />
        ) : archivadas.length === 0 ? (
          <EstadoVacio
            titulo="No tienes financiaciones archivadas."
            texto="Cuando una financiación termine o la canceles, podrás archivarla desde su detalle para sacarla del listado."
            icono={<Archive size={22} aria-hidden="true" />}
          />
        ) : (
          <ul className="lista">
            {archivadas.map((plan) => (
              <li key={plan.id}>
                <button
                  type="button"
                  className="lista__item"
                  onClick={() => navegar(`/cuotas/${plan.id}`)}
                >
                  <span className="icono-circular" aria-hidden="true">
                    <Archive size={18} />
                  </span>
                  <span className="lista__cuerpo">
                    <span className="lista__titulo">
                      {[plan.proveedor, plan.nombre].filter(Boolean).join(' · ')}
                    </span>
                    <span className="lista__detalle">
                      {ETIQUETA_ESTADO_PLAN[plan.estado]} · {plan.cuotas_pagadas} de{' '}
                      {plan.cantidad_cuotas} pagadas
                    </span>
                    {plan.archivado_en ? (
                      <span className="lista__momento">
                        Archivada el{' '}
                        <span className="numero">
                          {formatearFecha(plan.archivado_en.slice(0, 10))}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="lista__monto numero">{monto(plan.monto_pagado)}</span>
                  <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="campo__ayuda" style={{ marginTop: 16 }}>
          Archivar no borra nada: los pagos, las cuotas y los movimientos siguen igual. Desde el
          detalle de cada una puedes devolverla al listado.
        </p>
      </div>
    </>
  )
}
