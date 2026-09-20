import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, WifiOff } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { CampoMonto } from '../components/ui/CampoMonto'
import { EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import { crearTransferencia, editarTransferencia, obtenerTransferencia } from '../services/transfersService'
import { listarMovimientosDeTransferencia } from '../services/movementsService'
import { hoyISO } from '../utils/date'
import { formatearGs, parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'
import type { UUID } from '../types/db'

interface Props {
  modo?: 'crear' | 'editar'
}

/**
 * Alta y edición de transferencias entre cuentas propias.
 * Usa exclusivamente `crear_transferencia` / `editar_transferencia`:
 * el RPC crea o actualiza las dos mitades de forma atómica.
 */
export function TransferenciaFormPage({ modo = 'crear' }: Props) {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const enLinea = useConexion()
  const { cuentas, saldoPorId, refrescarSaldos } = useCatalogo()

  const editando = modo === 'editar'

  const [origenId, setOrigenId] = useState<UUID | ''>('')
  const [destinoId, setDestinoId] = useState<UUID | ''>('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO)
  const [descripcion, setDescripcion] = useState('')
  const [referencia, setReferencia] = useState('')

  const [cargandoOriginal, setCargandoOriginal] = useState(editando)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const cuentasActivas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas])

  useEffect(() => {
    if (editando || cuentasActivas.length < 2) return
    setOrigenId((actual) => actual || cuentasActivas[0].id)
    setDestinoId((actual) => actual || cuentasActivas[1].id)
  }, [editando, cuentasActivas])

  useEffect(() => {
    if (!editando || !id) return
    let vigente = true

    setCargandoOriginal(true)
    Promise.all([obtenerTransferencia(id), listarMovimientosDeTransferencia(id)])
      .then(([transferencia, movimientos]) => {
        if (!vigente) return
        if (!transferencia) {
          setErrorCarga('Esta transferencia ya no existe.')
          return
        }
        setOrigenId(transferencia.cuenta_origen_id)
        setDestinoId(transferencia.cuenta_destino_id)
        setMonto(String(transferencia.monto))
        setFecha(transferencia.fecha.slice(0, 10))
        setReferencia(transferencia.referencia ?? '')
        const salida = movimientos.find((m) => m.tipo === 'transferencia_salida')
        setDescripcion(salida?.descripcion ?? '')
      })
      .catch((e: unknown) => {
        if (vigente) setErrorCarga(textoDeExcepcion(e, 'No se pudo cargar la transferencia.'))
      })
      .finally(() => {
        if (vigente) setCargandoOriginal(false)
      })

    return () => {
      vigente = false
    }
  }, [editando, id])

  function validar(): boolean {
    const nuevos: Record<string, string> = {}
    if (parsearEntradaMonto(monto) <= 0) nuevos.monto = 'Escribe un monto mayor que cero.'
    if (!origenId) nuevos.origen = 'Elige la cuenta de origen.'
    if (!destinoId) nuevos.destino = 'Elige la cuenta de destino.'
    if (origenId && origenId === destinoId) {
      nuevos.destino = 'La cuenta de destino debe ser distinta de la de origen.'
    }
    if (!fecha) nuevos.fecha = 'Elige una fecha.'
    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    if (!enLinea) {
      avisos.error('Sin conexión: no se puede guardar ahora.')
      return
    }
    if (!validar()) return

    setGuardando(true)
    try {
      const datos = {
        cuentaOrigenId: origenId as UUID,
        cuentaDestinoId: destinoId as UUID,
        monto: parsearEntradaMonto(monto),
        fecha,
        descripcion: descripcion || null,
        referencia: referencia || null,
      }

      if (editando) {
        await editarTransferencia(id, datos)
        avisos.exito('Transferencia actualizada correctamente.')
      } else {
        await crearTransferencia(datos)
        avisos.exito('Transferencia realizada correctamente.')
      }

      await refrescarSaldos()
      navegar(-1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo realizar la transferencia.'))
    } finally {
      setGuardando(false)
    }
  }

  const saldoOrigen = saldoPorId(origenId || null)

  if (!editando && cuentasActivas.length < 2) {
    return (
      <>
        <Encabezado titulo="Nueva transferencia" volver />
        <div className="contenedor">
          <EstadoVacio
            titulo="Necesitas al menos dos cuentas."
            texto="Una transferencia mueve dinero entre dos cuentas propias."
            accion={
              <Link to="/cuentas/nueva">
                <Boton variante="primario">Crear otra cuenta</Boton>
              </Link>
            }
          />
        </div>
      </>
    )
  }

  return (
    <>
      <Encabezado titulo={editando ? 'Editar transferencia' : 'Nueva transferencia'} volver />

      <div className="contenedor">
        {errorCarga ? (
          <Mensaje tipo="error">{errorCarga}</Mensaje>
        ) : (
          <form className="formulario" onSubmit={alEnviar} noValidate>
            <CampoMonto
              valor={monto}
              onChange={setMonto}
              etiqueta="Monto a transferir"
              autoFocus={!editando}
              error={errores.monto}
            />

            {!enLinea ? (
              <Mensaje tipo="aviso">
                <WifiOff size={14} aria-hidden="true" /> Sin conexión: podrás guardar cuando vuelva
                la señal.
              </Mensaje>
            ) : null}

            <Campo
              etiqueta="Desde"
              error={errores.origen}
              ayuda={
                saldoOrigen ? `Saldo actual: ${formatearGs(saldoOrigen.saldo_actual)}` : undefined
              }
            >
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={origenId}
                  disabled={cargandoOriginal}
                  onChange={(e) => setOrigenId(e.target.value)}
                >
                  <option value="">Elige la cuenta de origen</option>
                  {cuentas
                    .filter((c) => c.activa || c.id === origenId)
                    .map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.id}>
                        {cuenta.nombre}
                      </option>
                    ))}
                </select>
              )}
            </Campo>

            <div style={{ display: 'flex', justifyContent: 'center' }} aria-hidden="true">
              <span className="icono-circular icono-circular--info">
                <ArrowDown size={18} />
              </span>
            </div>

            <Campo etiqueta="Hacia" error={errores.destino}>
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={destinoId}
                  disabled={cargandoOriginal}
                  onChange={(e) => setDestinoId(e.target.value)}
                >
                  <option value="">Elige la cuenta de destino</option>
                  {cuentas
                    .filter((c) => (c.activa || c.id === destinoId) && c.id !== origenId)
                    .map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.id}>
                        {cuenta.nombre}
                      </option>
                    ))}
                </select>
              )}
            </Campo>

            <Campo etiqueta="Fecha" error={errores.fecha}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="date"
                  value={fecha}
                  disabled={cargandoOriginal}
                  onChange={(e) => setFecha(e.target.value)}
                />
              )}
            </Campo>

            <Campo etiqueta="Descripción">
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Traspaso entre cuentas"
                  value={descripcion}
                  maxLength={200}
                  disabled={cargandoOriginal}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              )}
            </Campo>

            <Campo etiqueta="Referencia" ayuda="Opcional: número de comprobante, por ejemplo.">
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Opcional"
                  value={referencia}
                  maxLength={100}
                  disabled={cargandoOriginal}
                  onChange={(e) => setReferencia(e.target.value)}
                />
              )}
            </Campo>

            <Mensaje tipo="info">
              Una transferencia entre tus cuentas no cuenta como gasto ni como ingreso.
            </Mensaje>

            <div className="pie-formulario">
              <Boton
                type="submit"
                variante="primario"
                tamano="grande"
                bloque
                cargando={guardando}
                disabled={cargandoOriginal}
              >
                {editando ? 'Guardar cambios' : 'Transferir'}
              </Boton>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
