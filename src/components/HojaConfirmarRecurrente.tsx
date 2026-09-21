import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Boton } from './ui/Boton'
import { Campo } from './ui/Campo'
import { InputMonto } from './ui/CampoMonto'
import { Hoja } from './ui/Hoja'
import { Mensaje } from './ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import { confirmarRecurrente, obtenerRecurrente } from '../services/recurringService'
import type { FechaISO, MontoPYG, UUID } from '../types/db'
import { formatearFecha, hoyISO } from '../utils/date'
import { formatearGs, parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

/** Previsión de un recurrente lista para confirmarse. */
export interface PrevistoRecurrente {
  id: UUID
  nombre: string
  monto: MontoPYG
  fecha: FechaISO
  cuentaId: UUID | null
  tipo: 'ingreso' | 'gasto'
  montoEstimado?: boolean
  descripcion?: string | null
}

interface Props {
  previsto: PrevistoRecurrente | null
  onCerrar: () => void
  /** Se llama tras confirmar, para que la pantalla refresque sus datos. */
  onConfirmado: () => void
}

/**
 * Confirmación de un recurrente previsto.
 *
 * Hasta que se pulsa «Confirmar» no existe ningún movimiento ni cambia
 * ningún saldo. La confirmación llama a `confirmar_recurrente`, que crea el
 * movimiento real y avanza la próxima fecha.
 */
export function HojaConfirmarRecurrente({ previsto, onCerrar, onConfirmado }: Props) {
  const { cuentas, refrescarSaldos } = useCatalogo()
  const avisos = useAvisos()
  const enLinea = useConexion()

  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO)
  const [cuentaId, setCuentaId] = useState<UUID | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  // Cada vez que se abre la hoja se precargan los valores previstos.
  useEffect(() => {
    if (!previsto) return
    setMonto(String(previsto.monto))
    setFecha(previsto.fecha.slice(0, 10))
    setCuentaId(previsto.cuentaId ?? '')
    setDescripcion(previsto.descripcion ?? '')
    setNotas('')
    setErrores({})
  }, [previsto])

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!previsto || confirmando) return

    if (!enLinea) {
      avisos.error('Sin conexión: no se puede confirmar ahora.')
      return
    }

    const nuevos: Record<string, string> = {}
    if (parsearEntradaMonto(monto) <= 0) nuevos.monto = 'Escribe un monto mayor que cero.'
    if (!cuentaId) nuevos.cuenta = 'Elige una cuenta.'
    if (!fecha) nuevos.fecha = 'Elige la fecha.'
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setConfirmando(true)
    try {
      await confirmarRecurrente({
        recurrenteId: previsto.id,
        montoReal: parsearEntradaMonto(monto),
        fechaReal: fecha,
        cuentaId: cuentaId as UUID,
        descripcion: descripcion || null,
        notas: notas || null,
      })

      // La base avanza `proxima_fecha`: se lee para informarla.
      let siguiente: string | null = null
      try {
        const actualizado = await obtenerRecurrente(previsto.id)
        siguiente = actualizado?.proxima_fecha ?? null
      } catch {
        siguiente = null
      }

      await refrescarSaldos()
      avisos.exito(
        siguiente
          ? `Movimiento confirmado correctamente. Próxima: ${formatearFecha(siguiente)}.`
          : 'Movimiento confirmado correctamente.',
      )
      onConfirmado()
      onCerrar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo confirmar el movimiento.'))
    } finally {
      setConfirmando(false)
    }
  }

  const esIngreso = previsto?.tipo === 'ingreso'

  return (
    <Hoja
      abierta={previsto !== null}
      titulo={esIngreso ? 'Confirmar cobro' : 'Confirmar pago'}
      onCerrar={() => (confirmando ? undefined : onCerrar())}
    >
      {previsto ? (
        <form className="formulario" onSubmit={confirmar} noValidate>
          <div className="tarjeta">
            <div className="datos">
              <div className="datos__fila">
                <span className="datos__clave">Concepto</span>
                <span className="datos__valor">{previsto.nombre}</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Monto esperado</span>
                <span className={`datos__valor numero ${esIngreso ? 'texto-positivo' : ''}`}>
                  {formatearGs(previsto.monto)}
                  {previsto.montoEstimado ? ' (estimado)' : ''}
                </span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Fecha esperada</span>
                <span className="datos__valor numero">{formatearFecha(previsto.fecha)}</span>
              </div>
            </div>
          </div>

          {previsto.montoEstimado ? (
            <Mensaje tipo="aviso">
              El monto es estimado: ajústalo al importe real antes de confirmar.
            </Mensaje>
          ) : null}

          <Campo etiqueta={esIngreso ? 'Monto realmente cobrado' : 'Monto realmente pagado'} error={errores.monto}>
            {(props) => <InputMonto {...props} valor={monto} onChange={setMonto} />}
          </Campo>

          <Campo etiqueta="Fecha real" error={errores.fecha}>
            {(props) => (
              <input
                {...props}
                className="control"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            )}
          </Campo>

          <Campo etiqueta="Cuenta" error={errores.cuenta}>
            {(props) => (
              <select
                {...props}
                className="control"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
              >
                <option value="">Elige una cuenta</option>
                {cuentas
                  .filter((c) => c.activa || c.id === cuentaId)
                  .map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.nombre}
                    </option>
                  ))}
              </select>
            )}
          </Campo>

          <Campo etiqueta="Descripción">
            {(props) => (
              <input
                {...props}
                className="control"
                type="text"
                placeholder="Opcional"
                value={descripcion}
                maxLength={200}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            )}
          </Campo>

          <Campo etiqueta="Notas">
            {(props) => (
              <textarea
                {...props}
                className="control"
                placeholder="Opcional"
                value={notas}
                maxLength={500}
                onChange={(e) => setNotas(e.target.value)}
              />
            )}
          </Campo>

          <div style={{ display: 'flex', gap: 8 }}>
            <Boton variante="secundario" bloque onClick={onCerrar} disabled={confirmando}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante="primario"
              bloque
              cargando={confirmando}
              icono={<CheckCircle2 size={17} aria-hidden="true" />}
            >
              Confirmar
            </Boton>
          </div>
        </form>
      ) : null}
    </Hoja>
  )
}
