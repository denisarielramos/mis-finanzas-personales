import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { CampoMonto } from '../components/ui/CampoMonto'
import { EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import { categoriaAdmite } from '../services/categoriesService'
import { crearMovimiento, editarMovimiento, obtenerMovimiento } from '../services/movementsService'
import { hoyISO } from '../utils/date'
import { parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'
import type { UUID } from '../types/db'

interface Props {
  tipo?: 'gasto' | 'ingreso'
  modo?: 'crear' | 'editar'
}

/**
 * Alta y edición de gastos e ingresos.
 * Siempre a través de los RPC `crear_movimiento` / `editar_movimiento`:
 * la persona escribe un monto POSITIVO y la base calcula `monto_firmado`.
 */
export function MovimientoFormPage({ tipo: tipoInicial = 'gasto', modo = 'crear' }: Props) {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const enLinea = useConexion()
  const { cuentas, categorias, refrescarSaldos } = useCatalogo()

  const editando = modo === 'editar'

  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>(tipoInicial)
  const [monto, setMonto] = useState('')
  const [cuentaId, setCuentaId] = useState<UUID | ''>('')
  const [categoriaId, setCategoriaId] = useState<UUID | ''>('')
  const [fecha, setFecha] = useState(hoyISO)
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')

  const [cargandoOriginal, setCargandoOriginal] = useState(editando)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const cuentasActivas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas])

  const categoriasDisponibles = useMemo(
    () => categorias.filter((c) => c.activa && categoriaAdmite(c, tipo)),
    [categorias, tipo],
  )

  // Cuenta por defecto en altas nuevas
  useEffect(() => {
    if (!editando && !cuentaId && cuentasActivas.length > 0) {
      setCuentaId(cuentasActivas[0].id)
    }
  }, [editando, cuentaId, cuentasActivas])

  // Carga del movimiento a editar
  useEffect(() => {
    if (!editando || !id) return
    let vigente = true

    setCargandoOriginal(true)
    obtenerMovimiento(id)
      .then((movimiento) => {
        if (!vigente) return
        if (!movimiento) {
          setErrorCarga('Este movimiento ya no existe.')
          return
        }
        if (movimiento.tipo !== 'gasto' && movimiento.tipo !== 'ingreso') {
          setErrorCarga('Este movimiento no se edita desde esta pantalla.')
          return
        }
        setTipo(movimiento.tipo)
        setMonto(String(movimiento.monto))
        setCuentaId(movimiento.cuenta_id)
        setCategoriaId(movimiento.categoria_id ?? '')
        setFecha(movimiento.fecha.slice(0, 10))
        setDescripcion(movimiento.descripcion ?? '')
        setNotas(movimiento.notas ?? '')
      })
      .catch((e: unknown) => {
        if (vigente) setErrorCarga(textoDeExcepcion(e, 'No se pudo cargar el movimiento.'))
      })
      .finally(() => {
        if (vigente) setCargandoOriginal(false)
      })

    return () => {
      vigente = false
    }
  }, [editando, id])

  // Si la categoría elegida deja de ser válida al cambiar de tipo, se limpia
  useEffect(() => {
    if (categoriaId && !categoriasDisponibles.some((c) => c.id === categoriaId)) {
      setCategoriaId('')
    }
  }, [categoriaId, categoriasDisponibles])

  function validar(): boolean {
    const nuevos: Record<string, string> = {}
    if (parsearEntradaMonto(monto) <= 0) nuevos.monto = 'Escribe un monto mayor que cero.'
    if (!cuentaId) nuevos.cuenta = 'Elige una cuenta.'
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
        cuentaId: cuentaId as UUID,
        tipo,
        monto: parsearEntradaMonto(monto),
        categoriaId: categoriaId || null,
        fecha,
        descripcion: descripcion || null,
        notas: notas || null,
      }

      if (editando) {
        await editarMovimiento(id, datos)
        avisos.exito('Movimiento actualizado correctamente.')
      } else {
        await crearMovimiento(datos)
        avisos.exito('Movimiento guardado correctamente.')
      }

      await refrescarSaldos()
      navegar(-1)
    } catch (e) {
      avisos.error(
        textoDeExcepcion(e, editando ? 'No se pudo actualizar el movimiento.' : 'No se pudo guardar el movimiento.'),
      )
    } finally {
      setGuardando(false)
    }
  }

  const esGasto = tipo === 'gasto'
  const titulo = editando ? 'Editar movimiento' : esGasto ? 'Nuevo gasto' : 'Nuevo ingreso'

  if (!editando && cuentasActivas.length === 0) {
    return (
      <>
        <Encabezado titulo={titulo} volver />
        <div className="contenedor">
          <EstadoVacio
            titulo="Todavía no tienes cuentas."
            texto="Necesitas al menos una cuenta activa para registrar movimientos."
            accion={
              <Link to="/cuentas/nueva">
                <Boton variante="primario">Crear mi primera cuenta</Boton>
              </Link>
            }
          />
        </div>
      </>
    )
  }

  return (
    <>
      <Encabezado titulo={titulo} volver />

      <div className="contenedor">
        {errorCarga ? (
          <Mensaje tipo="error">{errorCarga}</Mensaje>
        ) : (
          <form className="formulario" onSubmit={alEnviar} noValidate>
            <CampoMonto
              valor={monto}
              onChange={setMonto}
              etiqueta={esGasto ? 'Monto del gasto' : 'Monto del ingreso'}
              autoFocus={!editando}
              error={errores.monto}
            />

            {!enLinea ? (
              <Mensaje tipo="aviso">
                <WifiOff size={14} aria-hidden="true" /> Sin conexión: podrás guardar cuando vuelva
                la señal.
              </Mensaje>
            ) : null}

            <Campo etiqueta="Cuenta" error={errores.cuenta}>
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={cuentaId}
                  disabled={cargandoOriginal}
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

            <Campo
              etiqueta="Categoría"
              ayuda={
                categoriasDisponibles.length === 0
                  ? 'Todavía no tienes categorías para este tipo.'
                  : undefined
              }
            >
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={categoriaId}
                  disabled={cargandoOriginal}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  <option value="">Sin categoría</option>
                  {categoriasDisponibles.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.categoria_padre_id ? '— ' : ''}
                      {categoria.nombre}
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
                  enterKeyHint="next"
                  placeholder={esGasto ? 'Supermercado' : 'Salario'}
                  value={descripcion}
                  maxLength={200}
                  disabled={cargandoOriginal}
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
                  disabled={cargandoOriginal}
                  onChange={(e) => setNotas(e.target.value)}
                />
              )}
            </Campo>

            <div className="pie-formulario">
              <Boton
                type="submit"
                variante="primario"
                tamano="grande"
                bloque
                cargando={guardando}
                disabled={cargandoOriginal}
              >
                {editando ? 'Guardar cambios' : esGasto ? 'Guardar gasto' : 'Guardar ingreso'}
              </Boton>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
