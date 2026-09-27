import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Categoria, MontoPYG, UUID } from '../types/db'
import { porcentaje } from '../utils/money'
import { SIN_CATEGORIA } from '../services/movementsService'
import { useTemaOscuro } from '../hooks/useTemaOscuro'
import { usePrivacidad } from '../hooks/usePrivacidad'

/**
 * Gasto del mes por categoría.
 *
 * Forma: barras horizontales (el trabajo del lector es comparar magnitudes),
 * una sola serie con rampa ordinal de un solo tono —más gasto, más oscuro—.
 * De entrada se muestran las 4 categorías con más gasto y el resto se agrupa
 * en «Otras»: cinco barras es lo que se lee cómodamente en un iPhone. Con
 * «Ver más» se abren todas.
 */

/** Rampa ordinal validada (mayor gasto primero). */
const RAMPA_CLARO = ['#0d366b', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef']
const RAMPA_OSCURO = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#184f95']

const MAXIMO_BARRAS = 5

interface Props {
  gastoPorCategoria: Map<string, MontoPYG>
  categorias: Categoria[]
  total: MontoPYG
}

interface Dato {
  clave: string
  nombre: string
  nombreCorto: string
  monto: MontoPYG
  color: string
  porcentaje: number
}

function acortar(texto: string, maximo = 14): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto
}

export function GraficoGastos({ gastoPorCategoria, categorias, total }: Props) {
  const oscuro = useTemaOscuro()
  const { monto: formatearMonto, montoCorto } = usePrivacidad()
  const rampa = oscuro ? RAMPA_OSCURO : RAMPA_CLARO
  const colorTexto = oscuro ? '#a3aebf' : '#5b6676'

  const [expandido, setExpandido] = useState(false)
  const tarjeta = useRef<HTMLDivElement>(null)

  const { datos, agrupadas } = useMemo(() => {
    const mapaCategorias = new Map<UUID, Categoria>(categorias.map((c) => [c.id, c]))

    const ordenados = [...gastoPorCategoria.entries()]
      .map(([clave, monto]) => ({
        clave,
        nombre:
          clave === SIN_CATEGORIA ? 'Sin categoría' : (mapaCategorias.get(clave)?.nombre ?? 'Sin categoría'),
        monto,
      }))
      .sort((a, b) => b.monto - a.monto)

    const visibles = ordenados.slice(0, MAXIMO_BARRAS - 1)
    const resto = ordenados.slice(MAXIMO_BARRAS - 1)

    const filas = expandido ? ordenados : [...visibles]
    if (!expandido && resto.length > 0) {
      filas.push({
        clave: 'otras',
        nombre: resto.length === 1 ? resto[0].nombre : `Otras (${resto.length})`,
        monto: resto.reduce((suma, r) => suma + r.monto, 0),
      })
    }

    /**
     * La rampa tiene cinco escalones porque es lo que cabe manteniendo saltos
     * de luminosidad visibles: interpolar once tonos del mismo azul deja
     * diferencias de ~0,04 entre filas contiguas, por debajo del mínimo, y
     * repetir la rampa en ciclo inventaría agrupaciones que no existen. Así
     * que al expandir se reparten las filas entre esos mismos cinco escalones
     * según su puesto: siempre se ven cinco niveles y el orden se mantiene.
     */
    const color = (i: number) =>
      expandido
        ? rampa[Math.min(rampa.length - 1, Math.floor((i * rampa.length) / filas.length))]
        : rampa[Math.min(i, rampa.length - 1)]

    return {
      datos: filas.map((fila, i) => ({
        ...fila,
        nombreCorto: acortar(fila.nombre),
        color: color(i),
        porcentaje: porcentaje(fila.monto, total),
      })) as Dato[],
      // Solo hay algo que abrir si de verdad quedaron varias dentro de «Otras».
      agrupadas: resto.length > 1 ? resto.length : 0,
    }
  }, [gastoPorCategoria, categorias, total, rampa, expandido])

  if (datos.length === 0) return null

  const altura = Math.max(150, datos.length * 42 + 20)

  function alternar() {
    const plegando = expandido
    setExpandido(!expandido)
    // Al plegar, la tarjeta se encoge: si quedó fuera de vista se la acerca.
    if (plegando) {
      requestAnimationFrame(() => tarjeta.current?.scrollIntoView({ block: 'nearest' }))
    }
  }

  return (
    <div className="tarjeta grafico" ref={tarjeta}>
      <div className="grafico__contenedor" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={datos}
            layout="vertical"
            margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
            barCategoryGap={10}
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="nombreCorto"
              width={96}
              axisLine={false}
              tickLine={false}
              tick={{ fill: colorTexto, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: oscuro ? 'rgba(255,255,255,0.05)' : 'rgba(11,18,32,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const dato = payload[0].payload as Dato
                return (
                  <div className="tarjeta tarjeta--relleno" style={{ padding: 10 }}>
                    <div style={{ fontWeight: 650, fontSize: 13 }}>{dato.nombre}</div>
                    <div className="numero" style={{ fontSize: 13 }}>
                      {formatearMonto(dato.monto)} · {dato.porcentaje}%
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="monto" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false}>
              {datos.map((dato) => (
                <Cell key={dato.clave} fill={dato.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalle exacto: hace las veces de tabla accesible del gráfico */}
      <ul className="grafico__leyenda">
        {datos.map((dato) => (
          <li className="grafico__item" key={dato.clave}>
            <span className="grafico__punto" style={{ background: dato.color }} aria-hidden="true" />
            <span className="grafico__nombre">{dato.nombre}</span>
            <span className="grafico__valor numero">{formatearMonto(dato.monto)}</span>
            <span className="grafico__porcentaje numero">{dato.porcentaje}%</span>
          </li>
        ))}
      </ul>

      {agrupadas > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            className="seccion__enlace"
            aria-expanded={expandido}
            onClick={alternar}
          >
            {expandido ? 'Ver menos' : 'Ver más'}
            {expandido ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </button>
        </div>
      ) : null}

      <p className="campo__ayuda" style={{ marginTop: 12, textAlign: 'right' }}>
        Total gastado: <span className="numero">{montoCorto(total)}</span>
      </p>
    </div>
  )
}
