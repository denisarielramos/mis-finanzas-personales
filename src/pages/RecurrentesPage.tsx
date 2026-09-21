import { useMemo, useState, type FormEvent } from 'react'
import { ChevronRight, Plus, Repeat } from 'lucide-react'
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
import { useConexion } from '../hooks/useConexion'
import {
  actualizarRecurrente,
  crearRecurrente,
  listarRecurrentes,
} from '../services/recurringService'
import { categoriaAdmite } from '../services/categoriesService'
import {
  ETIQUETA_FRECUENCIA,
  ETIQUETA_TIPO_RECURRENTE,
  FRECUENCIAS_RECURRENTE,
  TIPOS_RECURRENTE,
  type FrecuenciaRecurrente,
  type Recurrente,
  type TipoRecurrente,
  type UUID,
} from '../types/db'
import { formatearFecha, hoyISO } from '../utils/date'
import { formatearGs, parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

interface EstadoFormulario {
  id: UUID | null
  nombre: string
  tipo: TipoRecurrente
  monto: string
  cuentaId: UUID | ''
  categoriaId: UUID | ''
  frecuencia: FrecuenciaRecurrente
  proximaFecha: string
  descripcion: string
  generarAutomaticamente: boolean
  activa: boolean
}

function formularioVacio(cuentaPorDefecto: UUID | ''): EstadoFormulario {
  return {
    id: null,
    nombre: '',
    tipo: 'gasto',
    monto: '',
    cuentaId: cuentaPorDefecto,
    categoriaId: '',
    frecuencia: 'mensual',
    proximaFecha: hoyISO(),
    descripcion: '',
    generarAutomaticamente: false,
    activa: true,
  }
}

/**
 * Recurrentes: movimientos que se repiten.
 *
 * Esta pantalla solo guarda la configuración en `public.recurrentes`.
 * La generación de los movimientos depende de un proceso del backend:
 * la aplicación nunca los crea desde el navegador.
 */
export function RecurrentesPage() {
  const { cuentas, categorias } = useCatalogo()
  const avisos = useAvisos()
  const enLinea = useConexion()

  const [version, setVersion] = useState(0)
  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const { datos, cargando, error } = useCarga(
    () => listarRecurrentes(),
    [version],
    'No se pudieron cargar los recurrentes.',
  )

  const recurrentes = useMemo(() => datos ?? [], [datos])
  const cuentasActivas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas])

  const categoriasDisponibles = useMemo(
    () => categorias.filter((c) => c.activa && categoriaAdmite(c, formulario?.tipo ?? 'gasto')),
    [categorias, formulario?.tipo],
  )

  function abrirNuevo() {
    if (cuentasActivas.length === 0) {
      avisos.error('Necesitas al menos una cuenta activa para crear un recurrente.')
      return
    }
    setErrores({})
    setFormulario(formularioVacio(cuentasActivas[0].id))
  }

  function abrirEdicion(recurrente: Recurrente) {
    setErrores({})
    setFormulario({
      id: recurrente.id,
      nombre: recurrente.nombre,
      tipo: recurrente.tipo,
      monto: String(recurrente.monto),
      cuentaId: recurrente.cuenta_id,
      categoriaId: recurrente.categoria_id ?? '',
      frecuencia: recurrente.frecuencia,
      proximaFecha: recurrente.proxima_fecha.slice(0, 10),
      descripcion: recurrente.descripcion ?? '',
      generarAutomaticamente: recurrente.generar_automaticamente,
      activa: recurrente.activa,
    })
  }

  /** Al cambiar el tipo se descarta la categoría si ya no lo admite. */
  function cambiarTipo(tipo: TipoRecurrente) {
    if (!formulario) return
    const categoria = categorias.find((c) => c.id === formulario.categoriaId)
    const sigueValida = categoria ? categoriaAdmite(categoria, tipo) : true
    setFormulario({
      ...formulario,
      tipo,
      categoriaId: sigueValida ? formulario.categoriaId : '',
    })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!formulario || guardando) return

    if (!enLinea) {
      avisos.error('Sin conexión: no se puede guardar ahora.')
      return
    }

    const nuevos: Record<string, string> = {}
    if (!formulario.nombre.trim()) nuevos.nombre = 'Escribe un nombre para el recurrente.'
    if (parsearEntradaMonto(formulario.monto) <= 0) {
      nuevos.monto = 'Escribe un monto mayor que cero.'
    }
    if (!formulario.cuentaId) nuevos.cuenta = 'Elige una cuenta.'
    if (!formulario.proximaFecha) nuevos.proximaFecha = 'Elige la próxima fecha.'

    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      const datosRecurrente = {
        nombre: formulario.nombre,
        cuenta_id: formulario.cuentaId as UUID,
        categoria_id: formulario.categoriaId || null,
        tipo: formulario.tipo,
        monto: parsearEntradaMonto(formulario.monto),
        frecuencia: formulario.frecuencia,
        proxima_fecha: formulario.proximaFecha,
        generar_automaticamente: formulario.generarAutomaticamente,
        activa: formulario.activa,
        descripcion: formulario.descripcion || null,
      }

      if (formulario.id) {
        await actualizarRecurrente(formulario.id, datosRecurrente)
        avisos.exito('Recurrente actualizado correctamente.')
      } else {
        await crearRecurrente(datosRecurrente)
        avisos.exito('Recurrente creado correctamente.')
      }

      setFormulario(null)
      setVersion((v) => v + 1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo guardar el recurrente.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Encabezado
        titulo="Recurrentes"
        volver="/mas"
        acciones={
          <button
            type="button"
            className="boton-icono"
            aria-label="Nuevo recurrente"
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
        ) : recurrentes.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no tienes movimientos recurrentes."
            texto="Aquí se configuran los movimientos que se repiten, como el alquiler o un servicio mensual."
            icono={<Repeat size={22} aria-hidden="true" />}
            accion={
              <Boton variante="primario" onClick={abrirNuevo}>
                Crear recurrente
              </Boton>
            }
          />
        ) : (
          <ul className="lista">
            {recurrentes.map((recurrente) => (
              <li key={recurrente.id}>
                <button
                  type="button"
                  className="lista__item"
                  style={{ opacity: recurrente.activa ? 1 : 0.6 }}
                  onClick={() => abrirEdicion(recurrente)}
                >
                  <span
                    className={`icono-circular ${recurrente.tipo === 'ingreso' ? 'icono-circular--positivo' : 'icono-circular--negativo'}`}
                    aria-hidden="true"
                  >
                    <Repeat size={18} />
                  </span>
                  <span className="lista__cuerpo">
                    <span className="lista__titulo">{recurrente.nombre}</span>
                    <span className="lista__detalle">
                      {[
                        ETIQUETA_FRECUENCIA[recurrente.frecuencia] ?? recurrente.frecuencia,
                        // En un recurrente desactivado la próxima fecha no aplica.
                        recurrente.activa
                          ? formatearFecha(recurrente.proxima_fecha)
                          : 'Desactivado',
                      ].join(' · ')}
                    </span>
                  </span>
                  <span
                    className={`lista__monto numero ${recurrente.tipo === 'ingreso' ? 'texto-positivo' : 'texto-negativo'}`}
                  >
                    {formatearGs(
                      recurrente.tipo === 'ingreso' ? recurrente.monto : -recurrente.monto,
                      { signo: recurrente.tipo === 'ingreso' ? 'siempre' : 'auto' },
                    )}
                  </span>
                  <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 16 }}>
          <Mensaje tipo="info">
            Esta pantalla guarda la configuración de los recurrentes. La generación automática de
            movimientos depende de un proceso del backend (por ejemplo, una tarea programada en la
            base de datos): la aplicación no crea movimientos por su cuenta desde el navegador.
          </Mensaje>
        </div>
      </div>

      <Hoja
        abierta={formulario !== null}
        titulo={formulario?.id ? 'Editar recurrente' : 'Nuevo recurrente'}
        onCerrar={() => (guardando ? undefined : setFormulario(null))}
      >
        {formulario ? (
          <form className="formulario" onSubmit={guardar} noValidate>
            <Campo etiqueta="Nombre" error={errores.nombre}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Alquiler"
                  value={formulario.nombre}
                  maxLength={80}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                />
              )}
            </Campo>

            <Campo etiqueta="Tipo">
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={formulario.tipo}
                  onChange={(e) => cambiarTipo(e.target.value as TipoRecurrente)}
                >
                  {TIPOS_RECURRENTE.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETA_TIPO_RECURRENTE[valor]}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo etiqueta="Monto" error={errores.monto}>
              {(props) => (
                <InputMonto
                  {...props}
                  valor={formulario.monto}
                  onChange={(monto) => setFormulario({ ...formulario, monto })}
                />
              )}
            </Campo>

            <Campo etiqueta="Cuenta" error={errores.cuenta}>
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={formulario.cuentaId}
                  onChange={(e) => setFormulario({ ...formulario, cuentaId: e.target.value })}
                >
                  <option value="">Elige una cuenta</option>
                  {cuentas
                    .filter((c) => c.activa || c.id === formulario.cuentaId)
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
                  value={formulario.categoriaId}
                  onChange={(e) => setFormulario({ ...formulario, categoriaId: e.target.value })}
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

            <Campo etiqueta="Frecuencia">
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={formulario.frecuencia}
                  onChange={(e) =>
                    setFormulario({
                      ...formulario,
                      frecuencia: e.target.value as FrecuenciaRecurrente,
                    })
                  }
                >
                  {FRECUENCIAS_RECURRENTE.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETA_FRECUENCIA[valor]}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo etiqueta="Próxima fecha" error={errores.proximaFecha}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="date"
                  value={formulario.proximaFecha}
                  onChange={(e) => setFormulario({ ...formulario, proximaFecha: e.target.value })}
                />
              )}
            </Campo>

            <Campo etiqueta="Descripción">
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Opcional"
                  value={formulario.descripcion}
                  maxLength={200}
                  onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                />
              )}
            </Campo>

            <Interruptor
              etiqueta="Generar automáticamente"
              descripcion="Solo guarda la preferencia: los movimientos los genera el backend, no la aplicación."
              activo={formulario.generarAutomaticamente}
              onCambio={(generarAutomaticamente) =>
                setFormulario({ ...formulario, generarAutomaticamente })
              }
            />

            <Interruptor
              etiqueta="Recurrente activo"
              activo={formulario.activa}
              onCambio={(activa) => setFormulario({ ...formulario, activa })}
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
