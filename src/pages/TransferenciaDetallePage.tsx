import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { Esqueleto, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import { anularTransferencia, obtenerTransferencia } from '../services/transfersService'
import {
  obtenerEstadoConciliacion,
  revertirConciliacion,
} from '../services/reconcileService'
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
  const [confirmandoReversion, setConfirmandoReversion] = useState(false)
  const [revirtiendo, setRevirtiendo] = useState(false)

  const { datos, cargando, error, recargar } = useCarga(
    async () => {
      const [transferencia, movimientos, conciliacion] = await Promise.all([
        obtenerTransferencia(id),
        listarMovimientosDeTransferencia(id),
        obtenerEstadoConciliacion(id),
      ])
      return { transferencia, movimientos, conciliacion }
    },
    [id],
    'No se pudo cargar la transferencia.',
  )

  const transferencia = datos?.transferencia ?? null
  const movimientos = datos?.movimientos ?? []
  const conciliacion = datos?.conciliacion ?? null
  const salida = movimientos.find((m) => m.tipo === 'transferencia_salida') ?? null
  const entrada = movimientos.find((m) => m.tipo === 'transferencia_entrada') ?? null

  const origen = cuentaPorId(transferencia?.cuenta_origen_id ?? salida?.cuenta_id)
  const destino = cuentaPorId(transferencia?.cuenta_destino_id ?? entrada?.cuenta_id)
  const anulada =
    transferencia?.estado === 'cancelada' ||
    (movimientos.length > 0 && movimientos.every((m) => m.estado === 'anulado'))

  /**
   * Nació de la conciliación y todavía se guarda el estado original de sus dos
   * movimientos: revertir los devuelve tal cual estaban, no los anula.
   */
  const reversible = conciliacion?.reversible === true

  /**
   * Conciliación anterior a la mejora: no hay copia del estado original.
   * Eliminarla dejaría los dos movimientos anulados sin forma de
   * reconstruirlos, así que aquí no se ofrece ninguna acción destructiva.
   */
  const conciliacionSinCopia =
    !reversible &&
    conciliacion?.tieneCopia === false &&
    (transferencia?.referencia ?? '').toUpperCase().includes('CONCILIACION')

  /** Solo las transferencias normales se anulan con `anular_transferencia`. */
  const puedeEliminar = Boolean(transferencia) && !anulada && !reversible && !conciliacionSinCopia

  async function eliminar() {
    if (!transferencia || anulando || !puedeEliminar) return
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

  async function revertir() {
    if (!transferencia || revirtiendo) return
    setRevirtiendo(true)
    try {
      await revertirConciliacion(transferencia.id)
      await refrescarSaldos()
      avisos.exito('Conciliación revertida: los dos movimientos volvieron a su estado original.')
      navegar(-1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo revertir la conciliación.'))
      // El estado real puede haber cambiado: se vuelve a leer.
      await recargar()
    } finally {
      setRevirtiendo(false)
      setConfirmandoReversion(false)
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

            {reversible && !anulada ? (
              <div style={{ marginTop: 12 }}>
                <Mensaje tipo="info">
                  Esta transferencia se creó conciliando dos movimientos. Al revertirla volverán a
                  ser el gasto y el ingreso que eran, con su categoría y su descripción.
                </Mensaje>
              </div>
            ) : null}

            {conciliacionSinCopia && !anulada ? (
              <div style={{ marginTop: 12 }}>
                <Mensaje tipo="aviso">
                  Esta conciliación fue creada antes del sistema de reversión segura y no contiene
                  una copia del estado original. No puede revertirse automáticamente.
                </Mensaje>
              </div>
            ) : null}

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

                {reversible ? (
                  <Boton
                    variante="peligro"
                    bloque
                    icono={<Undo2 size={17} aria-hidden="true" />}
                    onClick={() => setConfirmandoReversion(true)}
                  >
                    Revertir conciliación
                  </Boton>
                ) : null}

                {puedeEliminar ? (
                  <Boton
                    variante="peligro"
                    bloque
                    icono={<Trash2 size={17} aria-hidden="true" />}
                    onClick={() => setConfirmando(true)}
                  >
                    Eliminar transferencia
                  </Boton>
                ) : null}
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
        onCancelar={() => (anulando ? undefined : setConfirmando(false))}
      />

      <Dialogo
        abierto={confirmandoReversion}
        titulo="¿Revertir la conciliación?"
        mensaje="Los dos movimientos volverán exactamente a como estaban antes de conciliarlos: su tipo, su categoría, su descripción y su importe. La transferencia quedará cancelada."
        detalle={
          <div className="confirmacion-conciliacion">
            <div className="confirmacion-conciliacion__lado">
              <span className="confirmacion-conciliacion__rol">Volverá a ser un gasto</span>
              <strong>{origen?.nombre ?? 'Cuenta de origen'}</strong>
              <span className="texto-suave">{salida?.descripcion || 'Sin descripción'}</span>
            </div>
            <div className="confirmacion-conciliacion__lado">
              <span className="confirmacion-conciliacion__rol">Volverá a ser un ingreso</span>
              <strong>{destino?.nombre ?? 'Cuenta de destino'}</strong>
              <span className="texto-suave">{entrada?.descripcion || 'Sin descripción'}</span>
            </div>
          </div>
        }
        textoConfirmar="Revertir conciliación"
        peligroso
        procesando={revirtiendo}
        onConfirmar={revertir}
        onCancelar={() => (revirtiendo ? undefined : setConfirmandoReversion(false))}
      />
    </>
  )
}
