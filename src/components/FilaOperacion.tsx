import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, ChevronRight, Minus, Plus, Scale, Undo2 } from 'lucide-react'
import type { Movimiento } from '../types/db'
import { ETIQUETA_TIPO_MOVIMIENTO } from '../types/db'
import { useCatalogo } from '../hooks/useCatalogo'
import { formatearGs } from '../utils/money'
import { iconoPorNombre } from './ui/SelectorIcono'
import { signoDeMovimiento, type Operacion } from '../utils/movimientos'

const ICONO_POR_TIPO = {
  ingreso: Plus,
  gasto: Minus,
  ajuste: Scale,
  devolucion: Undo2,
}

function FilaMovimiento({ movimiento }: { movimiento: Movimiento }) {
  const navegar = useNavigate()
  const { categoriaPorId, cuentaPorId } = useCatalogo()

  const categoria = categoriaPorId(movimiento.categoria_id)
  const cuenta = cuentaPorId(movimiento.cuenta_id)
  const signo = signoDeMovimiento(movimiento)
  const anulado = movimiento.estado === 'anulado'

  const IconoRespaldo =
    ICONO_POR_TIPO[movimiento.tipo as keyof typeof ICONO_POR_TIPO] ?? ArrowRightLeft
  const Icono = categoria ? iconoPorNombre(categoria.icono, IconoRespaldo) : IconoRespaldo

  const titulo =
    movimiento.descripcion?.trim() ||
    categoria?.nombre ||
    ETIQUETA_TIPO_MOVIMIENTO[movimiento.tipo]

  const detalle = [categoria?.nombre, cuenta?.nombre].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      className="lista__item"
      onClick={() => navegar(`/movimientos/${movimiento.id}`)}
    >
      <span
        className={`icono-circular icono-circular--${signo === 'positivo' ? 'positivo' : signo === 'negativo' ? 'negativo' : 'info'}`}
        aria-hidden="true"
      >
        <Icono size={19} />
      </span>

      <span className="lista__cuerpo">
        <span
          className="lista__titulo"
          style={anulado ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
        >
          {titulo}
        </span>
        <span className="lista__detalle">
          {detalle || 'Sin categoría'}
          {movimiento.estado === 'pendiente' ? ' · Pendiente' : ''}
          {anulado ? ' · Anulado' : ''}
        </span>
      </span>

      <span
        className={`lista__monto numero ${signo === 'positivo' ? 'texto-positivo' : signo === 'negativo' ? 'texto-negativo' : ''}`}
        style={anulado ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}
      >
        {formatearGs(signo === 'negativo' ? -movimiento.monto : movimiento.monto, {
          signo: signo === 'positivo' ? 'siempre' : signo === 'negativo' ? 'auto' : 'nunca',
        })}
      </span>

      <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
    </button>
  )
}

function FilaTransferencia({
  operacion,
}: {
  operacion: Extract<Operacion, { clase: 'transferencia' }>
}) {
  const navegar = useNavigate()
  const { cuentaPorId } = useCatalogo()

  const origen = cuentaPorId(operacion.salida?.cuenta_id)
  const destino = cuentaPorId(operacion.entrada?.cuenta_id)
  const anulado = operacion.estado === 'anulado'

  const ruta =
    origen && destino
      ? `${origen.nombre} → ${destino.nombre}`
      : origen
        ? `Desde ${origen.nombre}`
        : destino
          ? `Hacia ${destino.nombre}`
          : 'Transferencia'

  const descripcion =
    operacion.salida?.descripcion?.trim() || operacion.entrada?.descripcion?.trim() || ''

  return (
    <button
      type="button"
      className="lista__item"
      onClick={() => navegar(`/transferencias/${operacion.transferenciaId}`)}
    >
      <span className="icono-circular icono-circular--info" aria-hidden="true">
        <ArrowRightLeft size={18} />
      </span>

      <span className="lista__cuerpo">
        <span
          className="lista__titulo"
          style={anulado ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
        >
          {ruta}
        </span>
        <span className="lista__detalle">
          {descripcion ? `${descripcion} · ` : ''}Transferencia
          {anulado ? ' · Anulada' : ''}
        </span>
      </span>

      <span
        className="lista__monto numero texto-suave"
        style={anulado ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}
      >
        {formatearGs(operacion.monto, { signo: 'nunca' })}
      </span>

      <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
    </button>
  )
}

/** Fila de la lista de movimientos: un movimiento suelto o una transferencia completa. */
export function FilaOperacion({ operacion }: { operacion: Operacion }) {
  if (operacion.clase === 'transferencia') return <FilaTransferencia operacion={operacion} />
  return <FilaMovimiento movimiento={operacion.movimiento} />
}
