import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { Esqueleto, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import { anularTransferencia, obtenerTransferencia } from '../services/transfersService'
import { listarMovimientosDeTransferencia } from '../services/movementsService'
import { ETIQUETA_ESTADO_TRANSFERENCIA } from '../types/db'
import { formatearFecha, formatearFechaHora } from '../utils/date'
import { textoDeExcepcion } from '../lib/errors'
import { usePrivacidad } from '../hooks/usePrivacidad'

/**
 * Detalle de una transferencia completa.
 * Nunca se muestra ni se edita una sola mitad: la operación es una sola.
 */
export function TransferenciaDetallePage() {
  const { monto: formatearMonto } = usePrivacidad()
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const { cuentaPorId, refrescarSaldos } = useCatalogo()

  const [confirmando, setConfirmando] = useState(false)
  const [anulando, setAnulando] = useState(false)

  const { datos, cargando, error } = useCarga(
    async () => {
      const [transferencia, movimientos] = await Promise.all([
        obtenerTransferencia(id),
        listarMovimientosDeTransferencia(id),
      ])
      return { transferencia, movimientos }
    },
    [id],
    'No se pudo cargar la transferencia.',
  )

  const transferencia = datos?.transferencia ?? null
  const movimientos = datos?.movimientos ?? []
  const salida = movimientos.find((m) => m.tipo === 'transferencia_salida') ?? null
  const entrada = movimientos.find((m) => m.tipo === 'transferencia_entrada') ?? null

  const origen = cuentaPorId(transferencia?.cuenta_origen_id ?? salida?.cuenta_id)
  const destino = cuentaPorId(transferencia?.cuenta_destino_id ?? entrada?.cuenta_id)
  const anulada =
    transferencia?.estado === 'cancelada' ||
    (movimientos.length > 0 && movimientos.every((m) => m.estado === 'anulado'))

  async function eliminar() {
    if (!transferencia) return
    setAnulando(true)
    try {
      await anularTransferencia(transferencia.id)
      await refrescarSaldos()
      avisos.exito('Transferencia eliminada correctamente.')
      navegar(-1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo eliminar la transferencia.'))
    } finally {
      setAnulando(false)
      setConfirmando(false)
    }
  }

  const monto = transferencia?.monto ?? salida?.monto ?? entrada?.monto ?? 0
  const fecha = transferencia?.fecha ?? salida?.fecha ?? entrada?.fecha ?? null
  const descripcion = salida?.descripcion || entrada?.descripcion || ''

  return (
    <>
      <Encabezado titulo="Transferencia" volver />

      <div className="contenedor">
        {cargando ? (
          <div className="tarjeta tarjeta--relleno" style={{ display: 'grid', gap: 12 }}>
            <Esqueleto alto={36} ancho="60%" />
            <Esqueleto alto={14} />
            <Esqueleto alto={14} ancho="80%" />
          </div>
        ) : error ? (
          <Mensaje tipo="error">{error}</Mensaje>
        ) : !transferencia && movimientos.length === 0 ? (
          <Mensaje tipo="aviso">Esta transferencia ya no existe.</Mensaje>
        ) : (
          <>
            <div className="tarjeta">
              <div className="detalle__monto">
                <span className="etiqueta etiqueta--info">Entre cuentas propias</span>
                <p className="detalle__valor numero">{formatearMonto(monto, { signo: 'nunca' })}</p>
                <p className="candidato__ruta" style={{ justifyContent: 'center' }}>
                  <span>{origen?.nombre ?? 'Cuenta de origen'}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                  <span>{destino?.nombre ?? 'Cuenta de destino'}</span>
                </p>
                {anulada ? <span className="etiqueta etiqueta--negativo">Anulada</span> : null}
              </div>

              <div className="datos">
                <div className="datos__fila">
                  <span className="datos__clave">Fecha</span>
                  <span className="datos__valor numero">{formatearFecha(fecha)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Descripción</span>
                  <span className="datos__valor">{descripcion || '—'}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Referencia</span>
                  <span className="datos__valor">{transferencia?.referencia || '—'}</span>
                </div>
                {transferencia?.notas ? (
                  <div className="datos__fila">
                    <span className="datos__clave">Notas</span>
                    <span className="datos__valor">{transferencia.notas}</span>
                  </div>
                ) : null}
                <div className="datos__fila">
                  <span className="datos__clave">Estado</span>
                  <span className="datos__valor">
                    {transferencia ? ETIQUETA_ESTADO_TRANSFERENCIA[transferencia.estado] : '—'}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Registrada</span>
                  <span className="datos__valor numero">
                    {formatearFechaHora(transferencia?.created_at ?? salida?.created_at ?? null)}
                  </span>
                </div>
              </div>
            </div>

            <p className="campo__ayuda" style={{ marginTop: 12 }}>
              Una transferencia entre tus cuentas no es un gasto ni un ingreso: el patrimonio total
              no cambia.
            </p>

            {transferencia && !anulada ? (
              <div className="acciones-pila">
                <Boton
                  variante="secundario"
                  bloque
                  icono={<Pencil size={17} aria-hidden="true" />}
                  onClick={() => navegar(`/transferencias/${transferencia.id}/editar`)}
                >
                  Editar transferencia
                </Boton>
                <Boton
                  variante="peligro"
                  bloque
                  icono={<Trash2 size={17} aria-hidden="true" />}
                  onClick={() => setConfirmando(true)}
                >
                  Eliminar transferencia
                </Boton>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Dialogo
        abierto={confirmando}
        titulo="¿Eliminar esta transferencia?"
        mensaje="Se anulará la operación completa: tanto la salida como la entrada. No se borra del historial."
        textoConfirmar="Eliminar"
        peligroso
        procesando={anulando}
        onConfirmar={eliminar}
        onCancelar={() => setConfirmando(false)}
      />
    </>
  )
}
