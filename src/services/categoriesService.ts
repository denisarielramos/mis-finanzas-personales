import { supabase } from '../lib/supabase'
import { lanzarSiError } from '../lib/errors'
import type { Categoria, TipoCategoria, UUID } from '../types/db'
import { idUsuarioActual } from './authService'

/** Categorías (`public.categorias`), con soporte de jerarquía padre/hija. */

export async function listarCategorias(incluirInactivas = true): Promise<Categoria[]> {
  let consulta = supabase
    .from('categorias')
    .select('*')
    .order('orden', { ascending: true, nullsFirst: false })
    .order('nombre', { ascending: true })

  if (!incluirInactivas) consulta = consulta.eq('activa', true)

  const { data, error } = await consulta
  lanzarSiError(error, 'No se pudieron cargar las categorías.')
  return (data ?? []) as Categoria[]
}

export interface DatosCategoria {
  nombre: string
  tipo: TipoCategoria
  icono: string | null
  color: string | null
  categoria_padre_id: UUID | null
  activa: boolean
}

export async function crearCategoria(datos: DatosCategoria): Promise<Categoria> {
  const userId = await idUsuarioActual()

  const { data, error } = await supabase
    .from('categorias')
    .insert({
      user_id: userId,
      nombre: datos.nombre.trim(),
      tipo: datos.tipo,
      icono: datos.icono,
      color: datos.color,
      categoria_padre_id: datos.categoria_padre_id,
      activa: datos.activa,
    })
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo crear la categoría.')
  return data as Categoria
}

export async function actualizarCategoria(
  id: UUID,
  datos: Partial<DatosCategoria>,
): Promise<Categoria> {
  const cambios: Record<string, unknown> = {}
  if (datos.nombre !== undefined) cambios.nombre = datos.nombre.trim()
  if (datos.tipo !== undefined) cambios.tipo = datos.tipo
  if (datos.icono !== undefined) cambios.icono = datos.icono
  if (datos.color !== undefined) cambios.color = datos.color
  if (datos.categoria_padre_id !== undefined) cambios.categoria_padre_id = datos.categoria_padre_id
  if (datos.activa !== undefined) cambios.activa = datos.activa

  const { data, error } = await supabase
    .from('categorias')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .single()

  lanzarSiError(error, 'No se pudo actualizar la categoría.')
  return data as Categoria
}

/** Las categorías tampoco se borran: se desactivan. */
export async function cambiarEstadoCategoria(id: UUID, activa: boolean): Promise<void> {
  const { error } = await supabase.from('categorias').update({ activa }).eq('id', id)
  lanzarSiError(
    error,
    activa ? 'No se pudo activar la categoría.' : 'No se pudo desactivar la categoría.',
  )
}

/** `true` si la categoría admite movimientos del tipo indicado. */
export function categoriaAdmite(categoria: Categoria, tipo: 'ingreso' | 'gasto'): boolean {
  return categoria.tipo === 'ambos' || categoria.tipo === tipo
}

/** Ids de una categoría y de todas sus descendientes. */
export function idsConDescendientes(categorias: Categoria[], raiz: UUID): UUID[] {
  const hijosPorPadre = new Map<UUID, UUID[]>()
  for (const c of categorias) {
    if (!c.categoria_padre_id) continue
    const lista = hijosPorPadre.get(c.categoria_padre_id) ?? []
    lista.push(c.id)
    hijosPorPadre.set(c.categoria_padre_id, lista)
  }

  const resultado: UUID[] = []
  const pendientes: UUID[] = [raiz]
  const vistos = new Set<UUID>()

  while (pendientes.length > 0) {
    const actual = pendientes.pop() as UUID
    if (vistos.has(actual)) continue
    vistos.add(actual)
    resultado.push(actual)
    pendientes.push(...(hijosPorPadre.get(actual) ?? []))
  }

  return resultado
}
