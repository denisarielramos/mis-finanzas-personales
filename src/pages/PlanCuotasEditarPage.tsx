import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, WifiOff } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { InputMonto } from '../components/ui/CampoMonto'
import { Segmentos } from '../components/ui/Segmentos'
import { SelectorCategoriaJerarquica } from '../components/SelectorCategoriaJerarquica'
import { Esqueleto, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import {
  editarPlanCuotas,
  listarCuotas,
  obtenerPlan,
} from '../services/installmentsService'
import { AYUDA_TIPO_MONTO, type TipoMontoCuota, type UUID } from '../types/db'
import { parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'
import { usePrivacidad } from '../hooks/usePrivacidad'

const OPCIONES_TIPO: { valor: TipoMontoCuota; etiqueta: string }[] = [
  { valor: 'fijo', etiqueta: 'Cuota fija' },
  { valor: 'aproximado', etiqueta: 'Cuota aproximada' },
]

/**
 * Editar una financiación existente.
 *
 * Solo toca datos del plan y el importe programado de las cuotas PENDIENTES,
 * y siempre a través del RPC `editar_plan_cuotas`. No se editan la cantidad de
 * cuotas, las fechas ni nada de lo ya pagado: regenerar cuotas destruiría el
 * historial.
 */
export function PlanCuotasEditarPage() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const enLinea = useConexion()
  const { cuentas, categorias } = useCatalogo()
  const { monto: formatearMonto } = usePrivacidad()

  const [nombre, setNombre] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')
  const [cuentaPreferidaId, setCuentaPreferidaId] = useState<UUID | ''>('')
  const [categoriaId, setCategoriaId] = useState<UUID | ''>('')
  const [tipoMonto, setTipoMonto] = useState<TipoMontoCuota>('fijo')
  const [montoCuota, setMontoCuota] = useState('')

  /** Importe programado de las pendientes al abrir: si no cambia, no se envía. */
  const [montoOriginal, setMontoOriginal] = useState<number | null>(null)
  const [pendientes, setPendientes] = useState(0)
  const [pagadas, setPagadas] = useState(0)

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    let vigente = true

    setCargando(true)
    Promise.all([obtenerPlan(id), listarCuotas(id)])
      .then(([plan, cuotas]) => {
        if (!vigente) return
        if (!plan) {
          setErrorCarga('Esta financiación ya no existe.')
          return
        }

        setNombre(plan.nombre)
        setProveedor(plan.proveedor ?? '')
        setDescripcion(plan.descripcion ?? '')
        setNotas(plan.notas ?? '')
        setCuentaPreferidaId(plan.cuenta_preferida_id ?? '')
        setCategoriaId(plan.categoria_id ?? '')
        setTipoMonto(plan.tipo_monto)

        const cuotasPendientes = cuotas.filter((c) => c.estado === 'pendiente')
        setPendientes(cuotasPendientes.length)
        setPagadas(cuotas.filter((c) => c.estado === 'pagada').length)

        const referencia = cuotasPendientes[0]?.monto_programado ?? null
        setMontoOriginal(referencia)
        setMontoCuota(referencia === null ? '' : String(referencia))
      })
      .catch((e: unknown) => {
        if (vigente) setErrorCarga(textoDeExcepcion(e, 'No se pudo cargar la financiación.'))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [id])

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return

    if (!enLinea) {
      avisos.error('Sin conexión: no se puede guardar ahora.')
      return
    }

    const nuevos: Record<string, string> = {}
    if (!nombre.trim()) nuevos.nombre = 'Escribe el nombre de la financiación.'

    const nuevoMonto = parsearEntradaMonto(montoCuota)
    const cambiaMonto = pendientes > 0 && montoOriginal !== null && nuevoMonto !== montoOriginal
    if (cambiaMonto && nuevoMonto <= 0) {
      nuevos.monto = 'El monto de la cuota debe ser mayor que cero.'
    }

    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      await editarPlanCuotas({
        planId: id,
        nombre,
        proveedor: proveedor || null,
        descripcion: descripcion || null,
        notas: notas || null,
        categoriaId: categoriaId || null,
        cuentaPreferidaId: cuentaPreferidaId || null,
        tipoMonto,
        // Solo se manda si de verdad cambió: así nunca se tocan importes sin querer.
        montoCuota: cambiaMonto ? nuevoMonto : null,
      })

      avisos.exito('Financiación actualizada correctamente.')
      navegar(`/cuotas/${id}`)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo guardar la financiación.'))
    } finally {
      setGuardando(false)
    }
  }

  const esAproximada = tipoMonto === 'aproximado'

  return (
    <>
      <Encabezado titulo="Editar financiación" volver={`/cuotas/${id}`} />

      <div className="contenedor">
        {errorCarga ? (
          <Mensaje tipo="error">{errorCarga}</Mensaje>
        ) : cargando ? (
          <div className="tarjeta tarjeta--relleno" style={{ display: 'grid', gap: 12 }}>
            <Esqueleto alto={30} ancho="60%" />
            <Esqueleto alto={14} />
            <Esqueleto alto={14} ancho="80%" />
          </div>
        ) : (
          <form className="formulario" onSubmit={alEnviar} noValidate>
            {!enLinea ? (
              <Mensaje tipo="aviso">
                <WifiOff size={14} aria-hidden="true" /> Sin conexión: podrás guardar cuando
                vuelva la señal.
              </Mensaje>
            ) : null}

            <Campo etiqueta="Proveedor">
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Nombre del comercio"
                  value={proveedor}
                  maxLength={80}
                  onChange={(e) => setProveedor(e.target.value)}
                />
              )}
            </Campo>

            <Campo etiqueta="Nombre de la compra" error={errores.nombre}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  value={nombre}
                  maxLength={80}
                  onChange={(e) => setNombre(e.target.value)}
                />
              )}
            </Campo>

            <div className="campo">
              <span className="campo__etiqueta">Tipo de cuota</span>
              <Segmentos
                opciones={OPCIONES_TIPO}
                valor={tipoMonto}
                onCambio={setTipoMonto}
                etiquetaAccesible="Tipo de cuota"
              />
              <span className="campo__ayuda">{AYUDA_TIPO_MONTO[tipoMonto]}</span>
            </div>

            {pendientes > 0 ? (
              <Campo
                etiqueta={esAproximada ? 'Monto estimado de cada cuota' : 'Monto de cada cuota'}
                error={errores.monto}
                ayuda={
                  pagadas > 0
                    ? `Solo cambia las ${pendientes} ${pendientes === 1 ? 'cuota pendiente' : 'cuotas pendientes'}. Las ${pagadas} ya ${pagadas === 1 ? 'pagada' : 'pagadas'} no se tocan.`
                    : `Se aplicará a las ${pendientes} ${pendientes === 1 ? 'cuota pendiente' : 'cuotas pendientes'}.`
                }
              >
                {(props) => (
                  <InputMonto {...props} valor={montoCuota} onChange={setMontoCuota} />
                )}
              </Campo>
            ) : (
              <Mensaje tipo="info">
                Esta financiación no tiene cuotas pendientes: sus importes ya no se pueden
                cambiar.
              </Mensaje>
            )}

            <Campo etiqueta="Cuenta preferida" ayuda="Solo afecta a los pagos futuros.">
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={cuentaPreferidaId}
                  onChange={(e) => setCuentaPreferidaId(e.target.value)}
                >
                  <option value="">Sin cuenta preferida</option>
                  {cuentas
                    .filter((c) => c.activa || c.id === cuentaPreferidaId)
                    .map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.id}>
                        {cuenta.nombre}
                      </option>
                    ))}
                </select>
              )}
            </Campo>

            <SelectorCategoriaJerarquica
              categorias={categorias}
              tipo="gasto"
              valor={categoriaId}
              onCambio={setCategoriaId}
            />

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

            {pagadas > 0 && montoOriginal !== null ? (
              <p className="campo__ayuda">
                Las {pagadas} {pagadas === 1 ? 'cuota ya pagada conserva' : 'cuotas ya pagadas conservan'}{' '}
                su importe y su movimiento. La cuenta y la categoría nuevas solo se usarán en los
                próximos pagos; los anteriores no se mueven.
              </p>
            ) : null}

            <p className="campo__ayuda">
              La cantidad de cuotas y las fechas no se editan aquí: cambiarlas obligaría a
              regenerar las cuotas y se perdería el historial. Importe actual de una cuota
              pendiente: <span className="numero">{formatearMonto(montoOriginal ?? 0)}</span>.
            </p>

            <div className="pie-formulario">
              <Boton
                type="submit"
                variante="primario"
                tamano="grande"
                bloque
                cargando={guardando}
                icono={<Save size={18} aria-hidden="true" />}
              >
                Guardar cambios
              </Boton>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
