import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Boton } from './ui/Boton'
import { Campo } from './ui/Campo'
import { InputMonto } from './ui/CampoMonto'
import { Hoja } from './ui/Hoja'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import {
  confirmarCuotaPlan,
  obtenerTipoMontoDeCuota,
} from '../services/installmentsService'
import type { FechaISO, MontoPYG, TipoMontoCuota, UUID } from '../types/db'
import { formatearFecha, hoyISO } from '../utils/date'
import { parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'
import { usePrivacidad } from '../hooks/usePrivacidad'

/** Cuota pendiente lista para registrarse como pagada. */
export interface CuotaPorPagar {
  id: UUID
  nombre: string
  numero: number | null
  totalCuotas: number | null
  monto: MontoPYG
  fechaVencimiento: FechaISO
  cuentaId: UUID | null
  /**
   * Modalidad del plan. Si no se conoce (por ejemplo, al abrir la hoja desde
   * Inicio) se consulta al abrirla; mientras tanto se trata como fija.
   */
  tipoMonto?: TipoMontoCuota
}

interface Props {
  cuota: CuotaPorPagar | null
  onCerrar: () => void
  onPagada: () => void
}

/**
 * Registro del pago de una cuota.
 *
 * Mientras la cuota está pendiente no existe ningún gasto ni cambia ningún
 * saldo. El gasto real lo crea `confirmar_cuota_plan`.
 */
export function HojaPagarCuota({ cuota, onCerrar, onPagada }: Props) {
  const { cuentas, refrescarSaldos } = useCatalogo()
  const { monto: formatearMonto } = usePrivacidad()
  const avisos = useAvisos()
  const enLinea = useConexion()

  const [tipoMonto, setTipoMonto] = useState<TipoMontoCuota>('fijo')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO)
  const [cuentaId, setCuentaId] = useState<UUID | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')
  const [pagando, setPagando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!cuota) return
    setTipoMonto(cuota.tipoMonto ?? 'fijo')
    setMonto(String(cuota.monto))
    setFecha(hoyISO())
    setCuentaId(cuota.cuentaId ?? '')
    setDescripcion('')
    setNotas('')
    setErrores({})
  }, [cuota])

  /**
   * Cuando la hoja se abre desde una previsión, la modalidad del plan no viene
   * con la cuota: se consulta aparte. Hasta que llega se mantiene bloqueada,
   * que es lo conservador.
   */
  useEffect(() => {
    if (!cuota || cuota.tipoMonto) return
    let vigente = true

    obtenerTipoMontoDeCuota(cuota.id)
      .then((tipo) => {
        if (vigente) setTipoMonto(tipo)
      })
      .catch(() => {
        /* Se queda en «fijo». */
      })

    return () => {
      vigente = false
    }
  }, [cuota])

  async function pagar(e: FormEvent) {
    e.preventDefault()
    if (!cuota || pagando) return

    if (!enLinea) {
      avisos.error('Sin conexión: no se puede registrar el pago ahora.')
      return
    }

    // En una cuota fija el importe es el contractual: no se toma del formulario.
    const montoReal = esAproximada ? parsearEntradaMonto(monto) : cuota.monto

    const nuevos: Record<string, string> = {}
    if (montoReal <= 0) nuevos.monto = 'Escribe un monto mayor que cero.'
    if (!cuentaId) nuevos.cuenta = 'Elige una cuenta.'
    if (!fecha) nuevos.fecha = 'Elige la fecha de pago.'
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setPagando(true)
    try {
      await confirmarCuotaPlan({
        cuotaId: cuota.id,
        cuentaId: cuentaId as UUID,
        montoReal,
        fechaPago: fecha,
        descripcion: descripcion || null,
        notas: notas || null,
      })

      await refrescarSaldos()
      avisos.exito('Pago registrado correctamente.')
      onPagada()
      onCerrar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo registrar el pago de la cuota.'))
    } finally {
      setPagando(false)
    }
  }

  const etiquetaCuota =
    cuota?.numero && cuota.totalCuotas ? `Cuota ${cuota.numero}/${cuota.totalCuotas}` : 'Cuota'
  const esAproximada = tipoMonto === 'aproximado'

  return (
    <Hoja
      abierta={cuota !== null}
      titulo="Registrar pago"
      onCerrar={() => (pagando ? undefined : onCerrar())}
    >
      {cuota ? (
        <form className="formulario" onSubmit={pagar} noValidate>
          <div className="tarjeta">
            <div className="datos">
              <div className="datos__fila">
                <span className="datos__clave">Compra</span>
                <span className="datos__valor">{cuota.nombre}</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Cuota</span>
                <span className="datos__valor">{etiquetaCuota}</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">
                  {esAproximada ? 'Monto estimado' : 'Monto de cuota'}
                </span>
                <span className="datos__valor numero">{formatearMonto(cuota.monto)}</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Vencimiento</span>
                <span className="datos__valor numero">
                  {formatearFecha(cuota.fechaVencimiento)}
                </span>
              </div>
            </div>
          </div>

          {esAproximada ? (
            <Campo
              etiqueta="Monto realmente pagado"
              error={errores.monto}
              ayuda="El estimado de la cuota no cambia: solo se registra lo que se debitó."
            >
              {(props) => <InputMonto {...props} valor={monto} onChange={setMonto} />}
            </Campo>
          ) : (
            <p className="campo__ayuda">
              Es una cuota fija: se registrará exactamente el monto de la cuota.
            </p>
          )}

          <Campo etiqueta="Fecha de pago" error={errores.fecha}>
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
            <Boton variante="secundario" bloque onClick={onCerrar} disabled={pagando}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante="primario"
              bloque
              cargando={pagando}
              icono={<CheckCircle2 size={17} aria-hidden="true" />}
            >
              Registrar pago
            </Boton>
          </div>
        </form>
      ) : null}
    </Hoja>
  )
}
