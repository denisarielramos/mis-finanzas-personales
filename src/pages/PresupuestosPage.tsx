import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { InputMonto } from '../components/ui/CampoMonto'
import { Hoja } from '../components/ui/Hoja'
import { Interruptor } from '../components/ui/Interruptor'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCatalogo } from '../hooks/useCatalogo'
import { useCarga } from '../hooks/useCarga'
import { useAvisos } from '../hooks/useToast'
import {
  actualizarPresupuesto,
  calcularConsumos,
  crearPresupuesto,
  listarPresupuestos,
} from '../services/budgetsService'
import { categoriaAdmite } from '../services/categoriesService'
import type { Presupuesto, UUID } from '../types/db'
import { formatearFecha, mesActual } from '../utils/date'
import { formatearGs, parsearEntradaMonto, porcentaje } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

interface EstadoFormulario {
  id: UUID | null
  categoriaId: UUID | ''
  limite: string
  desde: string
  hasta: string
  activo: boolean
}

function formularioVacio(): EstadoFormulario {
  const mes = mesActual()
  return {
    id: null,
    categoriaId: '',
    limite: '',
    desde: mes.desde,
    hasta: mes.hasta,
    activo: true,
  }
}

/**
 * Presupuestos por categoría.
 * Lo gastado se calcula solo con movimientos `gasto` + `confirmado`
 * dentro del rango; las transferencias nunca consumen presupuesto.
 */
export function PresupuestosPage() {
  const { categorias, categoriaPorId } = useCatalogo()
  const avisos = useAvisos()
  const navegar = useNavigate()
  const [parametros, setParametros] = useSearchParams()

  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [version, setVersion] = useState(0)

  const { datos, cargando, error } = useCarga(
    async () => {
      const presupuestos = await listarPresupuestos()
      const consumos = await calcularConsumos(presupuestos, categorias)
      return { presupuestos, consumos }
    },
    [categorias, version],
    'No se pudieron cargar los presupuestos.',
  )

  const categoriasGasto = useMemo(
    () => categorias.filter((c) => c.activa && categoriaAdmite(c, 'gasto')),
    [categorias],
  )

  const presupuestos = datos?.presupuestos ?? []
  const consumos = datos?.consumos ?? new Map<UUID, number>()

  function abrirNuevo() {
    setErrores({})
    setFormulario(formularioVacio())
  }

  function abrirEdicion(presupuesto: Presupuesto) {
    setErrores({})
    setFormulario({
      id: presupuesto.id,
      categoriaId: presupuesto.categoria_id,
      limite: String(presupuesto.monto_limite),
      desde: presupuesto.fecha_desde.slice(0, 10),
      hasta: presupuesto.fecha_hasta.slice(0, 10),
      activo: presupuesto.activo,
    })
  }

  /**
   * El detalle pide editar con `?editar=<id>`: así el formulario sigue
   * viviendo en un único sitio en lugar de duplicarse.
   */
  const aEditar = parametros.get('editar')
  useEffect(() => {
    if (!aEditar || presupuestos.length === 0) return
    const presupuesto = presupuestos.find((p) => p.id === aEditar)
    if (presupuesto) abrirEdicion(presupuesto)
    parametros.delete('editar')
    setParametros(parametros, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aEditar, presupuestos])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!formulario || guardando) return

    const nuevos: Record<string, string> = {}
    if (!formulario.categoriaId) nuevos.categoria = 'Elige una categoría.'
    if (parsearEntradaMonto(formulario.limite) <= 0) nuevos.limite = 'Escribe un límite mayor que cero.'
    if (!formulario.desde || !formulario.hasta) nuevos.fechas = 'Indica el periodo del presupuesto.'
    else if (formulario.hasta < formulario.desde)
      nuevos.fechas = 'La fecha final debe ser posterior a la inicial.'

    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      const datosPresupuesto = {
        categoria_id: formulario.categoriaId as UUID,
        monto_limite: parsearEntradaMonto(formulario.limite),
        fecha_desde: formulario.desde,
        fecha_hasta: formulario.hasta,
        activo: formulario.activo,
      }

      if (formulario.id) {
        await actualizarPresupuesto(formulario.id, datosPresupuesto)
        avisos.exito('Presupuesto actualizado correctamente.')
      } else {
        await crearPresupuesto(datosPresupuesto)
        avisos.exito('Presupuesto creado correctamente.')
      }

      setFormulario(null)
      setVersion((v) => v + 1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo guardar el presupuesto.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Encabezado
        titulo="Presupuestos"
        volver="/mas"
        acciones={
          <button
            type="button"
            className="boton-icono"
            aria-label="Nuevo presupuesto"
            onClick={abrirNuevo}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        }
      />

      <div className="contenedor">
        {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

        {cargando ? (
          <EsqueletoLista filas={3} />
        ) : presupuestos.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no tienes presupuestos."
            texto="Define un límite de gasto por categoría y sigue cuánto te queda."
            icono={<Target size={22} aria-hidden="true" />}
            accion={
              <Boton variante="primario" onClick={abrirNuevo}>
                Crear presupuesto
              </Boton>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {presupuestos.map((presupuesto) => {
              const gastado = consumos.get(presupuesto.id) ?? 0
              const limite = presupuesto.monto_limite
              const disponible = limite - gastado
              const pct = porcentaje(gastado, limite)
              const categoria = categoriaPorId(presupuesto.categoria_id)
              const clase =
                pct > 100 ? 'progreso__barra--excedido' : pct >= 80 ? 'progreso__barra--aviso' : ''

              return (
                <button
                  key={presupuesto.id}
                  type="button"
                  className="tarjeta tarjeta--pulsable presupuesto"
                  style={{ opacity: presupuesto.activo ? 1 : 0.6 }}
                  onClick={() => navegar(`/presupuestos/${presupuesto.id}`)}
                >
                  <div className="presupuesto__cabecera">
                    <div>
                      <p className="presupuesto__nombre">
                        {categoria?.nombre ?? 'Categoría eliminada'}
                      </p>
                      <p className="presupuesto__periodo numero">
                        {formatearFecha(presupuesto.fecha_desde)} –{' '}
                        {formatearFecha(presupuesto.fecha_hasta)}
                      </p>
                    </div>
                    <span
                      className={`etiqueta ${pct > 100 ? 'etiqueta--negativo' : pct >= 80 ? 'etiqueta--aviso' : ''}`}
                    >
                      {pct}%
                    </span>
                  </div>

                  <div className="presupuesto__cifras">
                    <span className="presupuesto__gastado numero">{formatearGs(gastado)}</span>
                    <span className="texto-suave numero">de {formatearGs(limite)}</span>
                  </div>

                  <div className="progreso">
                    <div
                      className={`progreso__barra ${clase}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Consumido ${pct}%`}
                    />
                  </div>

                  <div className="presupuesto__pie">
                    <span className={disponible < 0 ? 'texto-negativo' : ''}>
                      {disponible < 0 ? 'Excedido en ' : 'Disponible: '}
                      <span className="numero">{formatearGs(Math.abs(disponible))}</span>
                    </span>
                    {!presupuesto.activo ? <span className="etiqueta">Desactivado</span> : null}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <p className="campo__ayuda" style={{ marginTop: 16 }}>
          Si la categoría tiene subcategorías, el gasto de estas también consume el presupuesto.
        </p>
      </div>

      <Hoja
        abierta={formulario !== null}
        titulo={formulario?.id ? 'Editar presupuesto' : 'Nuevo presupuesto'}
        onCerrar={() => (guardando ? undefined : setFormulario(null))}
      >
        {formulario ? (
          <form className="formulario" onSubmit={guardar} noValidate>
            <Campo etiqueta="Categoría" error={errores.categoria}>
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={formulario.categoriaId}
                  onChange={(e) => setFormulario({ ...formulario, categoriaId: e.target.value })}
                >
                  <option value="">Elige una categoría</option>
                  {categoriasGasto.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.categoria_padre_id ? '— ' : ''}
                      {categoria.nombre}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo etiqueta="Límite" error={errores.limite}>
              {(props) => (
                <InputMonto
                  {...props}
                  valor={formulario.limite}
                  onChange={(limite) => setFormulario({ ...formulario, limite })}
                />
              )}
            </Campo>

            <div className="fila-doble">
              <Campo etiqueta="Desde" error={errores.fechas}>
                {(props) => (
                  <input
                    {...props}
                    className="control"
                    type="date"
                    value={formulario.desde}
                    onChange={(e) => setFormulario({ ...formulario, desde: e.target.value })}
                  />
                )}
              </Campo>
              <Campo etiqueta="Hasta">
                {(props) => (
                  <input
                    {...props}
                    className="control"
                    type="date"
                    value={formulario.hasta}
                    onChange={(e) => setFormulario({ ...formulario, hasta: e.target.value })}
                  />
                )}
              </Campo>
            </div>

            <Interruptor
              etiqueta="Presupuesto activo"
              activo={formulario.activo}
              onCambio={(activo) => setFormulario({ ...formulario, activo })}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <Boton
                variante="secundario"
                bloque
                onClick={() => setFormulario(null)}
                disabled={guardando}
              >
                Cancelar
              </Boton>
              <Boton type="submit" variante="primario" bloque cargando={guardando}>
                Guardar
              </Boton>
            </div>
          </form>
        ) : null}
      </Hoja>
    </>
  )
}
