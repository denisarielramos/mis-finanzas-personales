import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Categoria, MontoPYG, UUID } from '../types/db'
import { formatearGs, formatearGsCorto, porcentaje } from '../utils/money'
import { SIN_CATEGORIA } from '../services/movementsService'
import { useTemaOscuro } from '../hooks/useTemaOscuro'

/**
 * Gasto del mes por categoría.
 *
 * Forma: barras horizontales (el trabajo del lector es comparar magnitudes),
 * una sola serie con rampa secuencial de un solo tono —más gasto, más oscuro—.
 * Se muestran las 4 categorías con más gasto y el resto se agrupa en «Otras»:
 * cinco barras es el máximo que mantiene escalones de color distinguibles y
 * además es lo que se lee cómodamente en un iPhone.
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
  const rampa = oscuro ? RAMPA_OSCURO : RAMPA_CLARO
  const colorTexto = oscuro ? '#a3aebf' : '#5b6676'

  const datos = useMemo<Dato[]>(() => {
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

    const filas = [...visibles]
    if (resto.length > 0) {
      filas.push({
        clave: 'otras',
        nombre: resto.length === 1 ? resto[0].nombre : `Otras (${resto.length})`,
        monto: resto.reduce((suma, r) => suma + r.monto, 0),
      })
    }

    return filas.map((fila, i) => ({
      ...fila,
      nombreCorto: acortar(fila.nombre),
      color: rampa[Math.min(i, rampa.length - 1)],
      porcentaje: porcentaje(fila.monto, total),
    }))
  }, [gastoPorCategoria, categorias, total, rampa])

  if (datos.length === 0) return null

  const altura = Math.max(150, datos.length * 42 + 20)

  return (
    <div className="tarjeta grafico">
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
                      {formatearGs(dato.monto)} · {dato.porcentaje}%
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
            <span className="grafico__valor numero">{formatearGs(dato.monto)}</span>
            <span className="grafico__porcentaje numero">{dato.porcentaje}%</span>
          </li>
        ))}
      </ul>

      <p className="campo__ayuda" style={{ marginTop: 12, textAlign: 'right' }}>
        Total gastado: <span className="numero">{formatearGsCorto(total)}</span>
      </p>
    </div>
  )
}
