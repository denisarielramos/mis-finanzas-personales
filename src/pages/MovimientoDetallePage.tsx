import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { Esqueleto, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import { anularMovimiento, obtenerMovimiento } from '../services/movementsService'
import { ETIQUETA_ESTADO_MOVIMIENTO, ETIQUETA_TIPO_MOVIMIENTO } from '../types/db'
import { formatearFecha, formatearFechaHora } from '../utils/date'
import { formatearGs } from '../utils/money'
import { esEditableComoMovimiento, signoDeMovimiento } from '../utils/movimientos'
import { textoDeExcepcion } from '../lib/errors'

/** Detalle de un movimiento suelto (ingreso, gasto, ajuste o devolución). */
export function MovimientoDetallePage() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const { categoriaPorId, cuentaPorId, refrescarSaldos } = useCatalogo()

  const [confirmando, setConfirmando] = useState(false)
  const [anulando, setAnulando] = useState(false)

  const { datos: movimiento, cargando, error } = useCarga(
    () => obtenerMovimiento(id),
    [id],
    'No se pudo cargar el movimiento.',
  )

  if (!cargando && movimiento?.transferencia_id) {
    return <Navigate to={`/transferencias/${movimiento.transferencia_id}`} replace />
  }

  async function eliminar() {
    if (!movimiento) return
    setAnulando(true)
    try {
      await anularMovimiento(movimiento.id)
      await refrescarSaldos()
      avisos.exito('Movimiento eliminado correctamente.')
      navegar(-1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo eliminar el movimiento.'))
    } finally {
      setAnulando(false)
      setConfirmando(false)
    }
  }

  const signo = movimiento ? signoDeMovimiento(movimiento) : 'neutro'
  const categoria = categoriaPorId(movimiento?.categoria_id)
  const cuenta = cuentaPorId(movimiento?.cuenta_id)

  return (
    <>
      <Encabezado titulo="Detalle" volver />

      <div className="contenedor">
        {cargando ? (
          <div className="tarjeta tarjeta--relleno" style={{ display: 'grid', gap: 12 }}>
            <Esqueleto alto={36} ancho="60%" />
            <Esqueleto alto={14} />
            <Esqueleto alto={14} ancho="80%" />
          </div>
        ) : error ? (
          <Mensaje tipo="error">{error}</Mensaje>
        ) : !movimiento ? (
          <Mensaje tipo="aviso">Este movimiento ya no existe.</Mensaje>
        ) : (
          <>
            <div className="tarjeta">
              <div className="detalle__monto">
                <span className="etiqueta">{ETIQUETA_TIPO_MOVIMIENTO[movimiento.tipo]}</span>
                <p
                  className={`detalle__valor numero ${signo === 'positivo' ? 'texto-positivo' : signo === 'negativo' ? 'texto-negativo' : ''}`}
                >
                  {formatearGs(signo === 'negativo' ? -movimiento.monto : movimiento.monto, {
                    signo: signo === 'positivo' ? 'siempre' : 'auto',
                  })}
                </p>
                {movimiento.estado !== 'confirmado' ? (
                  <span
                    className={`etiqueta ${movimiento.estado === 'anulado' ? 'etiqueta--negativo' : 'etiqueta--aviso'}`}
                  >
                    {ETIQUETA_ESTADO_MOVIMIENTO[movimiento.estado]}
                  </span>
                ) : null}
              </div>

              <div className="datos">
                <div className="datos__fila">
                  <span className="datos__clave">Cuenta</span>
                  <span className="datos__valor">{cuenta?.nombre ?? '—'}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Categoría</span>
                  <span className="datos__valor">{categoria?.nombre ?? 'Sin categoría'}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Fecha</span>
                  <span className="datos__valor numero">{formatearFecha(movimiento.fecha)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Descripción</span>
                  <span className="datos__valor">{movimiento.descripcion || '—'}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Notas</span>
                  <span className="datos__valor">{movimiento.notas || '—'}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Registrado</span>
                  <span className="datos__valor numero">
                    {formatearFechaHora(movimiento.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {esEditableComoMovimiento(movimiento) ? (
              <div className="acciones-pila">
                <Boton
                  variante="secundario"
                  bloque
                  icono={<Pencil size={17} aria-hidden="true" />}
                  onClick={() => navegar(`/movimientos/${movimiento.id}/editar`)}
                >
                  Editar movimiento
                </Boton>
                <Boton
                  variante="peligro"
                  bloque
                  icono={<Trash2 size={17} aria-hidden="true" />}
                  onClick={() => setConfirmando(true)}
                >
                  Eliminar movimiento
                </Boton>
              </div>
            ) : movimiento.estado === 'anulado' ? (
              <div style={{ marginTop: 16 }}>
                <Mensaje tipo="aviso">
                  Este movimiento está anulado. Se conserva en el historial, pero no afecta a los
                  saldos ni a los totales.
                </Mensaje>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <Mensaje tipo="info">
                  Los movimientos de tipo «{ETIQUETA_TIPO_MOVIMIENTO[movimiento.tipo]}» no se editan
                  desde esta pantalla.
                </Mensaje>
              </div>
            )}
          </>
        )}
      </div>

      <Dialogo
        abierto={confirmando}
        titulo="¿Eliminar este movimiento?"
        mensaje="El movimiento quedará anulado y dejará de contar en tus saldos y totales. No se borra del historial."
        textoConfirmar="Eliminar"
        peligroso
        procesando={anulando}
        onConfirmar={eliminar}
        onCancelar={() => setConfirmando(false)}
      />
    </>
  )
}
