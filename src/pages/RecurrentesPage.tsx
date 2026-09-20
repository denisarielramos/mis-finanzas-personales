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
import {
  ETIQUETA_FRECUENCIA,
  FRECUENCIAS_SUGERIDAS,
  actualizarRecurrente,
  crearRecurrente,
  listarRecurrentes,
  obtenerEsquemaRecurrentes,
  valoresUsados,
  type EsquemaRecurrentes,
} from '../services/recurringService'
import type { Recurrente } from '../types/db'
import { formatearFecha, hoyISO } from '../utils/date'
import { formatearGs, parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

type Valores = Record<string, string | boolean>

function texto(fila: Recurrente, columna: string): string {
  const valor = fila[columna]
  if (valor === null || valor === undefined) return ''
  return String(valor)
}

function valorInicial(fila: Recurrente | null, columna: string, respaldo = ''): string {
  if (!fila) return respaldo
  const valor = fila[columna]
  if (valor === null || valor === undefined) return respaldo
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10)
  return String(valor)
}

/**
 * Recurrentes.
 *
 * La estructura de `public.recurrentes` se detecta en tiempo de ejecución, así
 * que el formulario solo muestra los campos que existen de verdad en la tabla.
 * La aplicación NO genera movimientos automáticamente desde el navegador.
 */
export function RecurrentesPage() {
  const { cuentas, categorias } = useCatalogo()
  const avisos = useAvisos()

  const [version, setVersion] = useState(0)
  const [formulario, setFormulario] = useState<Valores | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const { datos, cargando, error } = useCarga(
    async () => {
      const esquema = await obtenerEsquemaRecurrentes()
      const filas = await listarRecurrentes()
      return { esquema, filas }
    },
    [version],
    'No se pudieron cargar los recurrentes.',
  )

  const esquema: EsquemaRecurrentes | null = datos?.esquema ?? null
  const filas = useMemo(() => datos?.filas ?? [], [datos])
  const tiene = (columna: string) => esquema?.columnas.has(columna) ?? false
  const columnaEstado = esquema?.columnaEstado ?? null

  const frecuencias = useMemo(() => {
    const usadas = valoresUsados(filas, 'frecuencia')
    return [...new Set([...usadas, ...FRECUENCIAS_SUGERIDAS])]
  }, [filas])

  const tipos = useMemo(() => {
    const usados = valoresUsados(filas, 'tipo')
    return [...new Set([...usados, 'gasto', 'ingreso'])]
  }, [filas])

  function abrir(fila: Recurrente | null) {
    setErrores({})
    setEditandoId(fila ? String(fila.id) : null)
    setFormulario({
      nombre: valorInicial(fila, 'nombre'),
      descripcion: valorInicial(fila, 'descripcion'),
      tipo: valorInicial(fila, 'tipo', 'gasto'),
      monto: valorInicial(fila, 'monto', ''),
      cuenta_id: valorInicial(fila, 'cuenta_id'),
      categoria_id: valorInicial(fila, 'categoria_id'),
      frecuencia: valorInicial(fila, 'frecuencia', 'mensual'),
      intervalo: valorInicial(fila, 'intervalo', '1'),
      dia_mes: valorInicial(fila, 'dia_mes'),
      dia_semana: valorInicial(fila, 'dia_semana'),
      proxima_fecha: valorInicial(fila, 'proxima_fecha', hoyISO()),
      fecha_inicio: valorInicial(fila, 'fecha_inicio', hoyISO()),
      fecha_fin: valorInicial(fila, 'fecha_fin'),
      notas: valorInicial(fila, 'notas'),
      generar_automaticamente: fila ? Boolean(fila.generar_automaticamente) : false,
      estado: fila && columnaEstado ? Boolean(fila[columnaEstado]) : true,
    })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!formulario || guardando || !esquema) return

    const nuevos: Record<string, string> = {}
    if (tiene('nombre') && !String(formulario.nombre).trim()) {
      nuevos.nombre = 'Escribe un nombre.'
    }
    if (tiene('monto') && parsearEntradaMonto(String(formulario.monto)) <= 0) {
      nuevos.monto = 'Escribe un monto mayor que cero.'
    }
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setGuardando(true)
    try {
      const payload: Record<string, unknown> = {}

      const textoSiExiste = (columna: string) => {
        if (!tiene(columna)) return
        const valor = String(formulario[columna] ?? '').trim()
        payload[columna] = valor || null
      }

      textoSiExiste('nombre')
      textoSiExiste('descripcion')
      textoSiExiste('tipo')
      textoSiExiste('frecuencia')
      textoSiExiste('cuenta_id')
      textoSiExiste('categoria_id')
      textoSiExiste('proxima_fecha')
      textoSiExiste('fecha_inicio')
      textoSiExiste('fecha_fin')
      textoSiExiste('notas')

      if (tiene('monto')) payload.monto = parsearEntradaMonto(String(formulario.monto))
      if (tiene('intervalo')) {
        const n = Number.parseInt(String(formulario.intervalo), 10)
        payload.intervalo = Number.isFinite(n) && n > 0 ? n : 1
      }
      if (tiene('dia_mes')) {
        const n = Number.parseInt(String(formulario.dia_mes), 10)
        payload.dia_mes = Number.isFinite(n) ? n : null
      }
      if (tiene('dia_semana')) {
        const n = Number.parseInt(String(formulario.dia_semana), 10)
        payload.dia_semana = Number.isFinite(n) ? n : null
      }
      if (tiene('generar_automaticamente')) {
        payload.generar_automaticamente = Boolean(formulario.generar_automaticamente)
      }
      if (columnaEstado) payload[columnaEstado] = Boolean(formulario.estado)

      if (editandoId) {
        await actualizarRecurrente(editandoId, payload)
        avisos.exito('Recurrente actualizado correctamente.')
      } else {
        await crearRecurrente(payload)
        avisos.exito('Recurrente creado correctamente.')
      }

      setFormulario(null)
      setEditandoId(null)
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
          esquema ? (
            <button
              type="button"
              className="boton-icono"
              aria-label="Nuevo recurrente"
              onClick={() => abrir(null)}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          ) : undefined
        }
      />

      <div className="contenedor">
        {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

        {cargando ? (
          <EsqueletoLista filas={3} />
        ) : filas.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no tienes movimientos recurrentes."
            texto="Aquí se configuran los movimientos que se repiten, como el alquiler o un servicio mensual."
            icono={<Repeat size={22} aria-hidden="true" />}
            accion={
              esquema ? (
                <Boton variante="primario" onClick={() => abrir(null)}>
                  Crear recurrente
                </Boton>
              ) : undefined
            }
          />
        ) : (
          <ul className="lista">
            {filas.map((fila) => {
              const activo = columnaEstado ? Boolean(fila[columnaEstado]) : true
              const nombre =
                texto(fila, 'nombre') || texto(fila, 'descripcion') || 'Recurrente sin nombre'
              const frecuencia = texto(fila, 'frecuencia')
              const proxima = texto(fila, 'proxima_fecha')

              return (
                <li key={String(fila.id)}>
                  <button
                    type="button"
                    className="lista__item"
                    style={{ opacity: activo ? 1 : 0.6 }}
                    onClick={() => abrir(fila)}
                  >
                    <span className="icono-circular" aria-hidden="true">
                      <Repeat size={18} />
                    </span>
                    <span className="lista__cuerpo">
                      <span className="lista__titulo">{nombre}</span>
                      <span className="lista__detalle">
                        {[
                          frecuencia ? (ETIQUETA_FRECUENCIA[frecuencia] ?? frecuencia) : null,
                          proxima ? formatearFecha(proxima) : null,
                          activo ? null : 'Desactivado',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {fila.monto !== undefined ? (
                      <span className="lista__monto numero">{formatearGs(fila.monto)}</span>
                    ) : null}
                    <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
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
        titulo={editandoId ? 'Editar recurrente' : 'Nuevo recurrente'}
        onCerrar={() => (guardando ? undefined : setFormulario(null))}
      >
        {formulario && esquema ? (
          <form className="formulario" onSubmit={guardar} noValidate>
            {tiene('nombre') ? (
              <Campo etiqueta="Nombre" error={errores.nombre}>
                {(props) => (
                  <input
                    {...props}
                    className="control"
                    type="text"
                    placeholder="Alquiler"
                    value={String(formulario.nombre ?? '')}
                    maxLength={80}
                    onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('tipo') ? (
              <Campo etiqueta="Tipo">
                {(props) => (
                  <select
                    {...props}
                    className="control"
                    value={String(formulario.tipo ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
                  >
                    {tipos.map((valor) => (
                      <option key={valor} value={valor}>
                        {valor === 'gasto' ? 'Gasto' : valor === 'ingreso' ? 'Ingreso' : valor}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            ) : null}

            {tiene('monto') ? (
              <Campo etiqueta="Monto" error={errores.monto}>
                {(props) => (
                  <InputMonto
                    {...props}
                    valor={String(formulario.monto ?? '')}
                    onChange={(monto) => setFormulario({ ...formulario, monto })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('cuenta_id') ? (
              <Campo etiqueta="Cuenta">
                {(props) => (
                  <select
                    {...props}
                    className="control"
                    value={String(formulario.cuenta_id ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, cuenta_id: e.target.value })}
                  >
                    <option value="">Sin cuenta</option>
                    {cuentas
                      .filter((c) => c.activa || c.id === formulario.cuenta_id)
                      .map((cuenta) => (
                        <option key={cuenta.id} value={cuenta.id}>
                          {cuenta.nombre}
                        </option>
                      ))}
                  </select>
                )}
              </Campo>
            ) : null}

            {tiene('categoria_id') ? (
              <Campo etiqueta="Categoría">
                {(props) => (
                  <select
                    {...props}
                    className="control"
                    value={String(formulario.categoria_id ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, categoria_id: e.target.value })}
                  >
                    <option value="">Sin categoría</option>
                    {categorias
                      .filter((c) => c.activa || c.id === formulario.categoria_id)
                      .map((categoria) => (
                        <option key={categoria.id} value={categoria.id}>
                          {categoria.nombre}
                        </option>
                      ))}
                  </select>
                )}
              </Campo>
            ) : null}

            {tiene('frecuencia') ? (
              <Campo etiqueta="Frecuencia">
                {(props) => (
                  <select
                    {...props}
                    className="control"
                    value={String(formulario.frecuencia ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, frecuencia: e.target.value })}
                  >
                    {frecuencias.map((valor) => (
                      <option key={valor} value={valor}>
                        {ETIQUETA_FRECUENCIA[valor] ?? valor}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            ) : null}

            {tiene('intervalo') ? (
              <Campo etiqueta="Intervalo" ayuda="Cada cuántos periodos se repite.">
                {(props) => (
                  <input
                    {...props}
                    className="control numero"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={String(formulario.intervalo ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, intervalo: e.target.value })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('dia_mes') ? (
              <Campo etiqueta="Día del mes">
                {(props) => (
                  <input
                    {...props}
                    className="control numero"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    value={String(formulario.dia_mes ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, dia_mes: e.target.value })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('dia_semana') ? (
              <Campo etiqueta="Día de la semana" ayuda="Según cómo lo guarde la base de datos.">
                {(props) => (
                  <input
                    {...props}
                    className="control numero"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={7}
                    value={String(formulario.dia_semana ?? '')}
                    onChange={(e) => setFormulario({ ...formulario, dia_semana: e.target.value })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('proxima_fecha') ? (
              <Campo etiqueta="Próxima fecha">
                {(props) => (
                  <input
                    {...props}
                    className="control"
                    type="date"
                    value={String(formulario.proxima_fecha ?? '')}
                    onChange={(e) =>
                      setFormulario({ ...formulario, proxima_fecha: e.target.value })
                    }
                  />
                )}
              </Campo>
            ) : null}

            {tiene('fecha_inicio') || tiene('fecha_fin') ? (
              <div className="fila-doble">
                {tiene('fecha_inicio') ? (
                  <Campo etiqueta="Inicio">
                    {(props) => (
                      <input
                        {...props}
                        className="control"
                        type="date"
                        value={String(formulario.fecha_inicio ?? '')}
                        onChange={(e) =>
                          setFormulario({ ...formulario, fecha_inicio: e.target.value })
                        }
                      />
                    )}
                  </Campo>
                ) : null}
                {tiene('fecha_fin') ? (
                  <Campo etiqueta="Fin" ayuda="Opcional">
                    {(props) => (
                      <input
                        {...props}
                        className="control"
                        type="date"
                        value={String(formulario.fecha_fin ?? '')}
                        onChange={(e) => setFormulario({ ...formulario, fecha_fin: e.target.value })}
                      />
                    )}
                  </Campo>
                ) : null}
              </div>
            ) : null}

            {tiene('descripcion') ? (
              <Campo etiqueta="Descripción">
                {(props) => (
                  <input
                    {...props}
                    className="control"
                    type="text"
                    placeholder="Opcional"
                    value={String(formulario.descripcion ?? '')}
                    maxLength={200}
                    onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('notas') ? (
              <Campo etiqueta="Notas">
                {(props) => (
                  <textarea
                    {...props}
                    className="control"
                    placeholder="Opcional"
                    value={String(formulario.notas ?? '')}
                    maxLength={500}
                    onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })}
                  />
                )}
              </Campo>
            ) : null}

            {tiene('generar_automaticamente') ? (
              <Interruptor
                etiqueta="Generar automáticamente"
                descripcion="Solo guarda la preferencia: la genera el backend, no la aplicación."
                activo={Boolean(formulario.generar_automaticamente)}
                onCambio={(valor) =>
                  setFormulario({ ...formulario, generar_automaticamente: valor })
                }
              />
            ) : null}

            {columnaEstado ? (
              <Interruptor
                etiqueta="Recurrente activo"
                activo={Boolean(formulario.estado)}
                onCambio={(valor) => setFormulario({ ...formulario, estado: valor })}
              />
            ) : null}

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
