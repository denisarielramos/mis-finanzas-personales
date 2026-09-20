import type { EstadoMovimiento, FechaISO, MontoPYG, Movimiento, UUID } from '../types/db'

/**
 * Agrupación de movimientos para la interfaz.
 *
 * Las dos mitades de una transferencia (`transferencia_salida` y
 * `transferencia_entrada`) comparten `transferencia_id`, así que se muestran
 * como UNA sola operación: «Banco Atlas → Ueno». Nunca como un gasto y un
 * ingreso separados.
 */

export interface OperacionSimple {
  clase: 'movimiento'
  clave: string
  fecha: FechaISO
  estado: EstadoMovimiento
  monto: MontoPYG
  movimiento: Movimiento
}

export interface OperacionTransferencia {
  clase: 'transferencia'
  clave: string
  fecha: FechaISO
  estado: EstadoMovimiento
  monto: MontoPYG
  transferenciaId: UUID
  salida: Movimiento | null
  entrada: Movimiento | null
}

export type Operacion = OperacionSimple | OperacionTransferencia

export interface GrupoFecha {
  fecha: FechaISO
  operaciones: Operacion[]
}

function ordenar(a: Operacion, b: Operacion): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
  const creadoA = fechaCreacion(a)
  const creadoB = fechaCreacion(b)
  return creadoB.localeCompare(creadoA)
}

function fechaCreacion(operacion: Operacion): string {
  if (operacion.clase === 'movimiento') return operacion.movimiento.created_at ?? ''
  return operacion.salida?.created_at ?? operacion.entrada?.created_at ?? ''
}

/** Convierte una lista de movimientos en operaciones listas para mostrar. */
export function agruparOperaciones(movimientos: Movimiento[]): Operacion[] {
  const transferencias = new Map<UUID, OperacionTransferencia>()
  const operaciones: Operacion[] = []

  for (const movimiento of movimientos) {
    if (movimiento.transferencia_id) {
      const id = movimiento.transferencia_id
      let operacion = transferencias.get(id)

      if (!operacion) {
        operacion = {
          clase: 'transferencia',
          clave: `t-${id}`,
          fecha: movimiento.fecha,
          estado: movimiento.estado,
          monto: movimiento.monto,
          transferenciaId: id,
          salida: null,
          entrada: null,
        }
        transferencias.set(id, operacion)
        operaciones.push(operacion)
      }

      if (movimiento.tipo === 'transferencia_salida') operacion.salida = movimiento
      else if (movimiento.tipo === 'transferencia_entrada') operacion.entrada = movimiento

      // La salida manda para la fecha mostrada de la operación.
      if (movimiento.tipo === 'transferencia_salida') operacion.fecha = movimiento.fecha
      continue
    }

    operaciones.push({
      clase: 'movimiento',
      clave: `m-${movimiento.id}`,
      fecha: movimiento.fecha,
      estado: movimiento.estado,
      monto: movimiento.monto,
      movimiento,
    })
  }

  return operaciones.sort(ordenar)
}

/** Agrupa las operaciones por día, manteniendo el orden descendente. */
export function agruparPorFecha(operaciones: Operacion[]): GrupoFecha[] {
  const grupos: GrupoFecha[] = []
  let actual: GrupoFecha | null = null

  for (const operacion of operaciones) {
    if (!actual || actual.fecha !== operacion.fecha) {
      actual = { fecha: operacion.fecha, operaciones: [] }
      grupos.push(actual)
    }
    actual.operaciones.push(operacion)
  }

  return grupos
}

/** Signo visual de un movimiento suelto según su tipo. */
export function signoDeMovimiento(movimiento: Movimiento): 'positivo' | 'negativo' | 'neutro' {
  switch (movimiento.tipo) {
    case 'ingreso':
    case 'devolucion':
    case 'transferencia_entrada':
      return 'positivo'
    case 'gasto':
    case 'transferencia_salida':
      return 'negativo'
    case 'ajuste':
      return movimiento.monto_firmado < 0 ? 'negativo' : 'positivo'
    default:
      return 'neutro'
  }
}

/** `true` si el movimiento puede editarse con `editar_movimiento`. */
export function esEditableComoMovimiento(movimiento: Movimiento): boolean {
  return (
    !movimiento.transferencia_id &&
    (movimiento.tipo === 'ingreso' || movimiento.tipo === 'gasto') &&
    movimiento.estado !== 'anulado'
  )
}
