interface Opcion<T extends string> {
  valor: T
  etiqueta: string
}

interface Props<T extends string> {
  opciones: Opcion<T>[]
  valor: T
  onCambio: (valor: T) => void
  etiquetaAccesible: string
}

/** Control segmentado al estilo iOS (filtros, tipos, etc.). */
export function Segmentos<T extends string>({
  opciones,
  valor,
  onCambio,
  etiquetaAccesible,
}: Props<T>) {
  return (
    <div className="segmentos" role="group" aria-label={etiquetaAccesible}>
      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          className="segmentos__opcion"
          aria-pressed={opcion.valor === valor}
          onClick={() => onCambio(opcion.valor)}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  )
}
