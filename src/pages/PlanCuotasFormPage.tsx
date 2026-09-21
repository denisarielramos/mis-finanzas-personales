import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, WifiOff } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { InputMonto } from '../components/ui/CampoMonto'
import { Segmentos } from '../components/ui/Segmentos'
import { Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import { crearPlanCuotas } from '../services/installmentsService'
import { categoriaAdmite } from '../services/categoriesService'
import type { UUID } from '../types/db'
import { formatearFecha, hoyISO, sumarDias, sumarMeses } from '../utils/date'
import { formatearGs, parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

type ModoPrimera = 'fecha' | 'dias'

const OPCIONES_PRIMERA: { valor: ModoPrimera; etiqueta: string }[] = [
  { valor: 'fecha', etiqueta: 'Fecha exacta' },
  { valor: 'dias', etiqueta: 'En X días' },
]

/**
 * Nueva compra en cuotas.
 *
 * El plan y todas sus cuotas los genera la base con `crear_plan_cuotas`.
 * La previsualización es solo orientativa: la autoridad final es la base.
 */
export function PlanCuotasFormPage() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const enLinea = useConexion()
  const { cuentas, categorias } = useCatalogo()

  const [proveedor, setProveedor] = useState('')
  const [nombre, setNombre] = useState('')
  // Se pide el monto de CADA cuota; el total se deduce, nunca se escribe.
  const [montoCuota, setMontoCuota] = useState('')
  const [cantidadCuotas, setCantidadCuotas] = useState('12')
  const [fechaCompra, setFechaCompra] = useState(hoyISO)
  const [modoPrimera, setModoPrimera] = useState<ModoPrimera>('fecha')
  const [fechaPrimera, setFechaPrimera] = useState(() => sumarMeses(hoyISO(), 1))
  const [diasPrimera, setDiasPrimera] = useState('30')
  const [frecuenciaMeses, setFrecuenciaMeses] = useState('1')
  const [cuentaPreferidaId, setCuentaPreferidaId] = useState<UUID | ''>('')
  const [categoriaId, setCategoriaId] = useState<UUID | ''>('')
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const categoriasGasto = useMemo(
    () => categorias.filter((c) => c.activa && categoriaAdmite(c, 'gasto')),
    [categorias],
  )

  const cantidad = Number.parseInt(cantidadCuotas, 10)
  const frecuencia = Number.parseInt(frecuenciaMeses, 10)
  const cuota = parsearEntradaMonto(montoCuota)
  const dias = Number.parseInt(diasPrimera, 10)

  /**
   * Total comprometido = monto de la cuota × cantidad de cuotas.
   * Es informativo para quien usa la aplicación, pero es lo que espera el RPC
   * en `p_monto_total`. Al ser múltiplo exacto, la base genera todas las
   * cuotas con el mismo importe.
   */
  const totalComprometido =
    cuota > 0 && Number.isFinite(cantidad) && cantidad > 0 ? cuota * cantidad : 0

  /** Fecha de la primera cuota, se escriba directamente o se calcule por días. */
  const primeraEfectiva = useMemo(() => {
    if (modoPrimera === 'fecha') return fechaPrimera
    if (!fechaCompra || !Number.isFinite(dias)) return ''
    return sumarDias(fechaCompra, dias)
  }, [modoPrimera, fechaPrimera, fechaCompra, dias])

  const previsualizacion = useMemo(() => {
    if (!totalComprometido || !primeraEfectiva) return null
    const pasos = Number.isFinite(frecuencia) && frecuencia > 0 ? frecuencia : 1
    return {
      primera: primeraEfectiva,
      ultima: sumarMeses(primeraEfectiva, (cantidad - 1) * pasos),
      mensual: pasos === 1,
    }
  }, [totalComprometido, cantidad, frecuencia, primeraEfectiva])

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return

    if (!enLinea) {
      avisos.error('Sin conexión: no se puede guardar ahora.')
      return
    }

    const nuevos: Record<string, string> = {}
    if (!nombre.trim()) nuevos.nombre = 'Escribe el nombre de la compra.'
    if (cuota <= 0) nuevos.monto = 'Escribe el monto de la cuota.'
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      nuevos.cantidad = 'Indica cuántas cuotas son.'
    }
    if (!fechaCompra) nuevos.fechaCompra = 'Elige la fecha de compra.'
    if (!primeraEfectiva) nuevos.primera = 'Indica cuándo vence la primera cuota.'
    if (!Number.isFinite(frecuencia) || frecuencia < 1) {
      nuevos.frecuencia = 'La frecuencia debe ser de al menos 1 mes.'
    }

    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      const resultado = await crearPlanCuotas({
        nombre,
        // El RPC sigue recibiendo el total: monto de la cuota × cantidad.
        montoTotal: totalComprometido,
        cantidadCuotas: cantidad,
        fechaCompra,
        fechaPrimeraCuota: primeraEfectiva,
        proveedor: proveedor || null,
        categoriaId: categoriaId || null,
        cuentaPreferidaId: cuentaPreferidaId || null,
        frecuenciaMeses: frecuencia,
        descripcion: descripcion || null,
        notas: notas || null,
      })

      avisos.exito('Plan de cuotas creado correctamente.')

      // El RPC suele devolver el id del plan creado; si llega, se abre.
      const id = typeof resultado === 'string' ? resultado : null
      navegar(id ? `/cuotas/${id}` : '/cuotas')
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo crear el plan de cuotas.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Encabezado titulo="Nueva compra en cuotas" volver="/cuotas" />

      <div className="contenedor">
        <form className="formulario" onSubmit={alEnviar} noValidate>
          {!enLinea ? (
            <Mensaje tipo="aviso">
              <WifiOff size={14} aria-hidden="true" /> Sin conexión: podrás guardar cuando vuelva
              la señal.
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
                placeholder="Televisor"
                value={nombre}
                maxLength={80}
                onChange={(e) => setNombre(e.target.value)}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Monto de cada cuota"
            error={errores.monto}
            ayuda="El total comprometido se calcula solo."
          >
            {(props) => <InputMonto {...props} valor={montoCuota} onChange={setMontoCuota} />}
          </Campo>

          <div className="fila-doble">
            <Campo etiqueta="Cantidad de cuotas" error={errores.cantidad}>
              {(props) => (
                <input
                  {...props}
                  className="control numero"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  value={cantidadCuotas}
                  onChange={(e) => setCantidadCuotas(e.target.value)}
                />
              )}
            </Campo>

            <Campo etiqueta="Cada cuántos meses" error={errores.frecuencia}>
              {(props) => (
                <input
                  {...props}
                  className="control numero"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={frecuenciaMeses}
                  onChange={(e) => setFrecuenciaMeses(e.target.value)}
                />
              )}
            </Campo>
          </div>

          <Campo etiqueta="Fecha de compra" error={errores.fechaCompra}>
            {(props) => (
              <input
                {...props}
                className="control"
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
              />
            )}
          </Campo>

          <div className="campo">
            <span className="campo__etiqueta">Primera cuota</span>
            <Segmentos
              opciones={OPCIONES_PRIMERA}
              valor={modoPrimera}
              onCambio={setModoPrimera}
              etiquetaAccesible="Cómo definir la primera cuota"
            />
          </div>

          {modoPrimera === 'fecha' ? (
            <Campo etiqueta="Vencimiento de la primera cuota" error={errores.primera}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="date"
                  value={fechaPrimera}
                  onChange={(e) => setFechaPrimera(e.target.value)}
                />
              )}
            </Campo>
          ) : (
            <Campo
              etiqueta="Primer pago en (días)"
              error={errores.primera}
              ayuda={
                primeraEfectiva
                  ? `Vence el ${formatearFecha(primeraEfectiva)}.`
                  : 'Se cuenta desde la fecha de compra.'
              }
            >
              {(props) => (
                <input
                  {...props}
                  className="control numero"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={diasPrimera}
                  onChange={(e) => setDiasPrimera(e.target.value)}
                />
              )}
            </Campo>
          )}

          <Campo etiqueta="Cuenta preferida" ayuda="Se propondrá al registrar cada pago.">
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

          <Campo etiqueta="Categoría">
            {(props) => (
              <select
                {...props}
                className="control"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categoriasGasto.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.categoria_padre_id ? '— ' : ''}
                    {categoria.nombre}
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

          {previsualizacion ? (
            <div className="previsualizacion">
              <p className="previsualizacion__titulo">Antes de crear</p>
              <p className="lista__titulo" style={{ whiteSpace: 'normal' }}>
                {[proveedor.trim(), nombre.trim()].filter(Boolean).join(' · ') || 'Nueva compra'}
              </p>

              <p className="campo__etiqueta" style={{ marginTop: 10 }}>
                {previsualizacion.mensual ? 'Cuota mensual' : 'Monto de cada cuota'}
              </p>
              <p className="previsualizacion__cuota numero">{formatearGs(cuota)}</p>

              <div className="datos" style={{ marginTop: 10 }}>
                <div className="datos__fila">
                  <span className="datos__clave">Cuotas</span>
                  <span className="datos__valor numero">{cantidad}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Total comprometido</span>
                  <span className="datos__valor numero">{formatearGs(totalComprometido)}</span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Primera cuota</span>
                  <span className="datos__valor numero">
                    {formatearFecha(previsualizacion.primera)}
                  </span>
                </div>
                <div className="datos__fila">
                  <span className="datos__clave">Última cuota</span>
                  <span className="datos__valor numero">
                    {formatearFecha(previsualizacion.ultima)}
                  </span>
                </div>
              </div>

              <p className="campo__ayuda" style={{ marginTop: 8 }}>
                El total es informativo: se calcula como cuota × cantidad. Las cuotas
                definitivas las genera la base de datos.
              </p>
            </div>
          ) : null}

          <div className="pie-formulario">
            <Boton
              type="submit"
              variante="primario"
              tamano="grande"
              bloque
              cargando={guardando}
              icono={<CreditCard size={18} aria-hidden="true" />}
            >
              Crear plan de cuotas
            </Boton>
          </div>
        </form>
      </div>
    </>
  )
}
