import type { FechaISO, MontoPYG } from './db'

/**
 * Datos ya resueltos de un presupuesto, listos para exportar.
 *
 * Los arma la pantalla a partir de lo que ya tiene cargado —los mismos
 * movimientos y el mismo cálculo que se ven en ella— con los nombres de
 * categoría y cuenta ya traducidos. El servicio de exportación no consulta
 * nada: solo da forma a estos datos.
 */

export type EstadoPresupuesto = 'activo' | 'desactivado'

export interface FilaCategoria {
  nombre: string
  monto: MontoPYG
  /** Porcentaje sobre el total gastado del presupuesto. */
  porcentaje: number
}

export interface FilaGasto {
  fecha: FechaISO
  descripcion: string
  categoria: string
  cuenta: string
  monto: MontoPYG
}

export interface ReportePresupuesto {
  categoria: string
  desde: FechaISO
  hasta: FechaISO
  limite: MontoPYG
  gastado: MontoPYG
  /** Negativo cuando el presupuesto está excedido. */
  disponible: MontoPYG
  porcentaje: number
  estado: EstadoPresupuesto
  porCategoria: FilaCategoria[]
  gastos: FilaGasto[]
}
