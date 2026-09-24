import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { BotonPrivacidad } from '../components/BotonPrivacidad'
import { SelectorMes } from '../components/SelectorMes'
import { FilaOperacion } from '../components/FilaOperacion'
import { Segmentos } from '../components/ui/Segmentos'
import { Boton } from '../components/ui/Boton'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCarga } from '../hooks/useCarga'
import { listarMovimientos, type FiltroMovimientos } from '../services/movementsService'
import { agruparOperaciones, agruparPorFecha } from '../utils/movimientos'
import { capitalizar, etiquetaGrupoFecha, mesActual } from '../utils/date'

const FILTROS: { valor: FiltroMovimientos; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'gastos', etiqueta: 'Gastos' },
  { valor: 'ingresos', etiqueta: 'Ingresos' },
  { valor: 'transferencias', etiqueta: 'Transferencias' },
]

/** Listado de movimientos del mes, agrupado por fecha. */
export function MovimientosPage() {
  const [mes, setMes] = useState(() => mesActual())
  const [filtro, setFiltro] = useState<FiltroMovimientos>('todos')

  const { datos, cargando, desfasado, error } = useCarga(
    () => listarMovimientos({ desde: mes.desde, hasta: mes.hasta, filtro, limite: 300 }),
    [mes.desde, mes.hasta, filtro],
    'No se pudieron cargar los movimientos.',
  )

  const grupos = useMemo(() => agruparPorFecha(agruparOperaciones(datos ?? [])), [datos])
  const cantidad = useMemo(
    () => grupos.reduce((total, grupo) => total + grupo.operaciones.length, 0),
    [grupos],
  )

  return (
    <>
      <Encabezado
        titulo="Movimientos"
        subtitulo={`${capitalizar(mes.etiqueta)}${
          cargando || desfasado
            ? ''
            : ` · ${cantidad} ${cantidad === 1 ? 'operación' : 'operaciones'}`
        }`}
        acciones={<BotonPrivacidad />}
      />

      <div className="contenedor">
        <SelectorMes rango={mes} onCambio={setMes} />

        <div style={{ marginTop: 12 }}>
          <Segmentos
            opciones={FILTROS}
            valor={filtro}
            onCambio={setFiltro}
            etiquetaAccesible="Filtrar movimientos"
          />
        </div>

        {error ? (
          <div style={{ marginTop: 16 }}>
            <Mensaje tipo="error">{error}</Mensaje>
          </div>
        ) : null}

        {cargando ? (
          <div style={{ marginTop: 20 }}>
            <EsqueletoLista filas={5} />
          </div>
        ) : grupos.length === 0 ? (
          <div style={{ marginTop: 20 }}>
            <EstadoVacio
              titulo="No hay movimientos en este mes."
              texto="Cambia de mes o registra una nueva operación con el botón +."
              icono={<Receipt size={22} aria-hidden="true" />}
              accion={
                <Link to="/nuevo/gasto">
                  <Boton variante="primario">Registrar movimiento</Boton>
                </Link>
              }
            />
          </div>
        ) : (
          // Mientras llega otro mes u otro filtro se mantiene la lista anterior
          // atenuada: nada desaparece y no hay saltos de altura.
          <div
            className={`revalidable${desfasado ? ' revalidable--ocupado' : ''}`}
            aria-busy={desfasado}
          >
            {grupos.map((grupo) => (
              <section key={grupo.fecha}>
                <h2 className="grupo-fecha">{etiquetaGrupoFecha(grupo.fecha)}</h2>
                <ul className="lista">
                  {grupo.operaciones.map((operacion) => (
                    <li key={operacion.clave}>
                      <FilaOperacion operacion={operacion} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
