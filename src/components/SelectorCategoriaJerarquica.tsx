import { useMemo } from 'react'
import { Campo } from './ui/Campo'
import { categoriaAdmite } from '../services/categoriesService'
import type { Categoria, UUID } from '../types/db'

interface Props {
  /** Catálogo completo de categorías; el filtrado se hace aquí dentro. */
  categorias: Categoria[]
  tipo: 'ingreso' | 'gasto'
  /** Id que se guarda en `movimientos.categoria_id`: la hoja elegida. */
  valor: UUID | ''
  onCambio: (valor: UUID | '') => void
  disabled?: boolean
  etiqueta?: string
}

/**
 * Elección de categoría en dos pasos: primero la principal y, solo si tiene
 * hijas, la subcategoría.
 *
 * La base sigue guardando un único `categoria_id`, así que el componente no
 * tiene estado propio: la jerarquía se deduce del valor. Por eso al editar un
 * movimiento guardado con una subcategoría aparecen ya seleccionadas la madre
 * y la hija, sin ningún paso extra.
 */
export function SelectorCategoriaJerarquica({
  categorias,
  tipo,
  valor,
  onCambio,
  disabled,
  etiqueta = 'Categoría',
}: Props) {
  const { principalId, raices, hijas, sinCategorias } = useMemo(() => {
    const porId = new Map(categorias.map((c) => [c.id, c]))
    const actual = valor ? (porId.get(valor) ?? null) : null
    const madreActual = actual?.categoria_padre_id
      ? (porId.get(actual.categoria_padre_id) ?? null)
      : null

    // Se admite lo activo y compatible, más lo que ya estuviera elegido: al
    // editar un movimiento antiguo no se pierde su categoría.
    const disponibles = categorias.filter(
      (c) =>
        (c.activa && categoriaAdmite(c, tipo)) || c.id === actual?.id || c.id === madreActual?.id,
    )
    const idsDisponibles = new Set(disponibles.map((c) => c.id))

    // Si la madre no está disponible, la hija se ofrece como principal en vez
    // de desaparecer del selector.
    const esRaiz = (c: Categoria) =>
      !c.categoria_padre_id || !idsDisponibles.has(c.categoria_padre_id)

    const principal = actual ? (esRaiz(actual) ? actual : madreActual) : null

    return {
      principalId: principal?.id ?? '',
      raices: disponibles.filter(esRaiz),
      hijas: principal ? disponibles.filter((c) => c.categoria_padre_id === principal.id) : [],
      sinCategorias: disponibles.length === 0,
    }
  }, [categorias, tipo, valor])

  // Al cambiar de categoría principal se guarda la madre: la subcategoría
  // anterior deja de aplicarse sola, sin arrastrar nada de la elección previa.
  const subcategoriaId = valor && valor !== principalId ? valor : ''

  return (
    <>
      <Campo
        etiqueta={etiqueta}
        ayuda={sinCategorias ? 'Todavía no tienes categorías para este tipo.' : undefined}
      >
        {(props) => (
          <select
            {...props}
            className="control"
            value={principalId}
            disabled={disabled}
            onChange={(e) => onCambio(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {raices.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        )}
      </Campo>

      {hijas.length > 0 ? (
        <Campo etiqueta="Subcategoría">
          {(props) => (
            <select
              {...props}
              className="control"
              value={subcategoriaId}
              disabled={disabled}
              onChange={(e) => onCambio(e.target.value || principalId)}
            >
              <option value="">General / Sin subcategoría</option>
              {hijas.map((hija) => (
                <option key={hija.id} value={hija.id}>
                  {hija.nombre}
                </option>
              ))}
            </select>
          )}
        </Campo>
      ) : null}
    </>
  )
}
