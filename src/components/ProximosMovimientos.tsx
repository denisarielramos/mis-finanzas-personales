import { useState } from 'react'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { EsqueletoLista, EstadoVacio, Mensaje } from './ui/Estados'
import { HojaConfirmarRecurrente, type PrevistoRecurrente } from './HojaConfirmarRecurrente'
import { HojaPagarCuota, type CuotaPorPagar } from './HojaPagarCuota'
import type { ProximoMovimiento } from '../types/db'
import { partesFecha } from '../utils/date'
import { usePrivacidad } from '../hooks/usePrivacidad'

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

interface Props {
  proximos: ProximoMovimiento[]
  cargando: boolean
  error: string | null
  /** Se llama tras confirmar un cobro o un pago. */
  onCambio: () => void
}

/**
 * Lista de próximos cobros y pagos.
 *
 * Nada de lo que aparece aquí afecta todavía a los saldos: son previsiones.
 * Al tocar una fila se abre la confirmación correspondiente, que es la que
 * crea el movimiento real mediante el RPC.
 */
export function ProximosMovimientos({ proximos, cargando, error, onCambio }: Props) {
  const { monto } = usePrivacidad()
  const [previsto, setPrevisto] = useState<PrevistoRecurrente | null>(null)
  const [cuota, setCuota] = useState<CuotaPorPagar | null>(null)

  function abrir(proximo: ProximoMovimiento) {
    if (proximo.origen === 'cuota') {
      setCuota({
        id: proximo.origen_id,
        nombre: proximo.nombre,
        numero: proximo.numero_cuota,
        totalCuotas: proximo.total_cuotas,
        monto: proximo.monto,
        fechaVencimiento: proximo.fecha,
        cuentaId: proximo.cuenta_id,
      })
      return
    }

    setPrevisto({
      id: proximo.origen_id,
      nombre: proximo.nombre,
      monto: proximo.monto,
      fecha: proximo.fecha,
      cuentaId: proximo.cuenta_id,
      tipo: proximo.tipo,
      descripcion: proximo.detalle,
    })
  }

  if (cargando) return <EsqueletoLista filas={3} />
  if (error) return <Mensaje tipo="error">{error}</Mensaje>

  if (proximos.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay cobros ni pagos previstos."
        texto="Configura tus recurrentes o una compra en cuotas para verlos aquí."
        icono={<CalendarClock size={22} aria-hidden="true" />}
      />
    )
  }

  return (
    <>
      <ul className="lista">
        {proximos.map((proximo) => {
          const { dia, mes } = partesFecha(proximo.fecha)
          const esIngreso = proximo.tipo === 'ingreso'
          const vencido = proximo.estado === 'vencido'

          const detalle = [
            proximo.numero_cuota && proximo.total_cuotas
              ? `Cuota ${proximo.numero_cuota}/${proximo.total_cuotas}`
              : proximo.detalle,
            vencido ? 'Vencido' : 'Pendiente',
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <li key={`${proximo.origen}-${proximo.origen_id}`}>
              <button type="button" className="lista__item" onClick={() => abrir(proximo)}>
                <span
                  className={`proximo-fecha${vencido ? ' proximo-fecha--vencido' : ''}`}
                  aria-hidden="true"
                >
                  <strong className="numero">{dia}</strong>
                  <span>{MESES_CORTOS[mes - 1]}</span>
                </span>

                <span className="lista__cuerpo">
                  <span className="lista__titulo">{proximo.nombre}</span>
                  <span className={`lista__detalle${vencido ? ' texto-negativo' : ''}`}>
                    {detalle}
                  </span>
                </span>

                <span
                  className={`lista__monto numero ${esIngreso ? 'texto-positivo' : 'texto-negativo'}`}
                >
                  {monto(esIngreso ? proximo.monto : -proximo.monto, {
                    signo: esIngreso ? 'siempre' : 'auto',
                  })}
                </span>

                <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>

      <HojaConfirmarRecurrente
        previsto={previsto}
        onCerrar={() => setPrevisto(null)}
        onConfirmado={onCambio}
      />
      <HojaPagarCuota cuota={cuota} onCerrar={() => setCuota(null)} onPagada={onCambio} />
    </>
  )
}
