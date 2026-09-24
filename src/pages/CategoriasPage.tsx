import { useMemo, useState, type FormEvent } from 'react'
import { ChevronRight, Plus, Tags } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { Hoja } from '../components/ui/Hoja'
import { Interruptor } from '../components/ui/Interruptor'
import { Segmentos } from '../components/ui/Segmentos'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { SelectorColor, SelectorIcono, iconoPorNombre } from '../components/ui/SelectorIcono'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { actualizarCategoria, crearCategoria } from '../services/categoriesService'
import {
  ETIQUETA_TIPO_CATEGORIA,
  TIPOS_CATEGORIA,
  type Categoria,
  type TipoCategoria,
  type UUID,
} from '../types/db'
import { textoDeExcepcion } from '../lib/errors'

type FiltroTipo = 'todas' | TipoCategoria

const FILTROS: { valor: FiltroTipo; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'gasto', etiqueta: 'Gasto' },
  { valor: 'ingreso', etiqueta: 'Ingreso' },
  { valor: 'ambos', etiqueta: 'Ambos' },
]

interface EstadoFormulario {
  id: UUID | null
  nombre: string
  tipo: TipoCategoria
  padre: UUID | ''
  icono: string | null
  color: string | null
  activa: boolean
}

const FORMULARIO_VACIO: EstadoFormulario = {
  id: null,
  nombre: '',
  tipo: 'gasto',
  padre: '',
  icono: 'tag',
  color: null,
  activa: true,
}

/** Categorías: crear, editar y desactivar, con soporte de categorías hijas. */
export function CategoriasPage() {
  const { categorias, cargando, error, refrescarCategorias } = useCatalogo()
  const avisos = useAvisos()

  const [filtro, setFiltro] = useState<FiltroTipo>('todas')
  const [formulario, setFormulario] = useState<EstadoFormulario | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorNombre, setErrorNombre] = useState<string | null>(null)

  const visibles = useMemo(() => {
    const filtradas =
      filtro === 'todas' ? categorias : categorias.filter((c) => c.tipo === filtro)

    // Orden: primero las categorías raíz, con sus hijas justo debajo.
    const raices = filtradas.filter((c) => !c.categoria_padre_id)
    const hijas = filtradas.filter((c) => c.categoria_padre_id)
    const ordenadas: Categoria[] = []

    for (const raiz of raices) {
      ordenadas.push(raiz)
      ordenadas.push(...hijas.filter((h) => h.categoria_padre_id === raiz.id))
    }
    // Hijas cuyo padre no está en el filtro actual
    ordenadas.push(
      ...hijas.filter((h) => !raices.some((r) => r.id === h.categoria_padre_id)),
    )

    return ordenadas
  }, [categorias, filtro])

  const posiblesPadres = useMemo(
    () => categorias.filter((c) => !c.categoria_padre_id && c.id !== formulario?.id),
    [categorias, formulario?.id],
  )

  function abrirNueva() {
    setErrorNombre(null)
    setFormulario({ ...FORMULARIO_VACIO, tipo: filtro === 'todas' ? 'gasto' : filtro })
  }

  function abrirEdicion(categoria: Categoria) {
    setErrorNombre(null)
    setFormulario({
      id: categoria.id,
      nombre: categoria.nombre,
      tipo: categoria.tipo,
      padre: categoria.categoria_padre_id ?? '',
      icono: categoria.icono ?? 'tag',
      color: categoria.color,
      activa: categoria.activa,
    })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!formulario || guardando) return

    if (!formulario.nombre.trim()) {
      setErrorNombre('Escribe un nombre para la categoría.')
      return
    }

    setGuardando(true)
    try {
      const datos = {
        nombre: formulario.nombre,
        tipo: formulario.tipo,
        icono: formulario.icono,
        color: formulario.color,
        categoria_padre_id: formulario.padre || null,
        activa: formulario.activa,
      }

      if (formulario.id) {
        await actualizarCategoria(formulario.id, datos)
        avisos.exito('Categoría actualizada correctamente.')
      } else {
        await crearCategoria(datos)
        avisos.exito('Categoría creada correctamente.')
      }

      // Solo cambiaron las categorías: no hace falta volver a traer cuentas
      // ni saldos, y la lista sigue en pantalla mientras se revalida.
      await refrescarCategorias()
      setFormulario(null)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo guardar la categoría.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Encabezado
        titulo="Categorías"
        volver="/mas"
        acciones={
          <button
            type="button"
            className="boton-icono"
            aria-label="Nueva categoría"
            onClick={abrirNueva}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        }
      />

      <div className="contenedor">
        <Segmentos
          opciones={FILTROS}
          valor={filtro}
          onCambio={setFiltro}
          etiquetaAccesible="Filtrar categorías por tipo"
        />

        {error ? (
          <div style={{ marginTop: 16 }}>
            <Mensaje tipo="error">{error}</Mensaje>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          {cargando ? (
            <EsqueletoLista filas={5} />
          ) : visibles.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no tienes categorías."
              texto="Las categorías te ayudan a ver en qué se va el dinero."
              icono={<Tags size={22} aria-hidden="true" />}
              accion={
                <Boton variante="primario" onClick={abrirNueva}>
                  Crear categoría
                </Boton>
              }
            />
          ) : (
            <ul className="lista">
              {visibles.map((categoria) => {
                const Icono = iconoPorNombre(categoria.icono)
                const esHija = Boolean(categoria.categoria_padre_id)
                return (
                  <li key={categoria.id}>
                    <button
                      type="button"
                      className="lista__item"
                      style={{
                        opacity: categoria.activa ? 1 : 0.55,
                        paddingLeft: esHija ? 32 : undefined,
                      }}
                      onClick={() => abrirEdicion(categoria)}
                    >
                      <span
                        className="icono-circular"
                        aria-hidden="true"
                        style={
                          categoria.color
                            ? { background: `${categoria.color}1a`, color: categoria.color }
                            : undefined
                        }
                      >
                        <Icono size={18} />
                      </span>
                      <span className="lista__cuerpo">
                        <span className="lista__titulo">{categoria.nombre}</span>
                        <span className="lista__detalle">
                          {ETIQUETA_TIPO_CATEGORIA[categoria.tipo] ?? categoria.tipo}
                          {categoria.activa ? '' : ' · Desactivada'}
                        </span>
                      </span>
                      <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <Hoja
        abierta={formulario !== null}
        titulo={formulario?.id ? 'Editar categoría' : 'Nueva categoría'}
        onCerrar={() => (guardando ? undefined : setFormulario(null))}
      >
        {formulario ? (
          <form className="formulario" onSubmit={guardar} noValidate>
            <Campo etiqueta="Nombre" error={errorNombre}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Alimentación"
                  value={formulario.nombre}
                  maxLength={60}
                  onChange={(e) =>
                    setFormulario({ ...formulario, nombre: e.target.value })
                  }
                />
              )}
            </Campo>

            <Campo etiqueta="Tipo">
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={formulario.tipo}
                  onChange={(e) =>
                    setFormulario({ ...formulario, tipo: e.target.value as TipoCategoria })
                  }
                >
                  {TIPOS_CATEGORIA.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETA_TIPO_CATEGORIA[valor]}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo etiqueta="Categoría padre" ayuda="Opcional: para agrupar subcategorías.">
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={formulario.padre}
                  onChange={(e) => setFormulario({ ...formulario, padre: e.target.value })}
                >
                  <option value="">Sin categoría padre</option>
                  {posiblesPadres.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <div className="campo">
              <span className="campo__etiqueta">Icono</span>
              <SelectorIcono
                valor={formulario.icono}
                onCambio={(icono) => setFormulario({ ...formulario, icono })}
              />
            </div>

            <div className="campo">
              <span className="campo__etiqueta">Color</span>
              <SelectorColor
                valor={formulario.color}
                onCambio={(color) => setFormulario({ ...formulario, color })}
              />
            </div>

            <Interruptor
              etiqueta="Categoría activa"
              descripcion="Las categorías desactivadas no aparecen al registrar movimientos."
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
