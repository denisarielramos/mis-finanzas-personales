/**
 * Tipos que reflejan el esquema YA EXISTENTE en Supabase.
 * Este archivo no crea ni modifica nada en la base: solo la describe.
 */

/** Identificador uuid. */
export type UUID = string

/** Fecha calendario de PostgreSQL en formato `YYYY-MM-DD`. */
export type FechaISO = string

/** Monto entero en guaraníes (BIGINT en PostgreSQL). Nunca lleva decimales. */
export type MontoPYG = number

export type TipoCuenta =
  | 'banco'
  | 'efectivo'
  | 'billetera'
  | 'ahorro'
  | 'tarjeta_credito'
  | 'inversion'
  | 'otro'

export const TIPOS_CUENTA: TipoCuenta[] = [
  'banco',
  'efectivo',
  'billetera',
  'ahorro',
  'tarjeta_credito',
  'inversion',
  'otro',
]

export const ETIQUETA_TIPO_CUENTA: Record<TipoCuenta, string> = {
  banco: 'Banco',
  efectivo: 'Efectivo',
  billetera: 'Billetera',
  ahorro: 'Ahorro',
  tarjeta_credito: 'Tarjeta de crédito',
  inversion: 'Inversión',
  otro: 'Otro',
}

export type TipoCategoria = 'ingreso' | 'gasto' | 'ambos'

export const TIPOS_CATEGORIA: TipoCategoria[] = ['ingreso', 'gasto', 'ambos']

export const ETIQUETA_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  ambos: 'Ambos',
}

export type TipoMovimiento =
  | 'ingreso'
  | 'gasto'
  | 'transferencia_entrada'
  | 'transferencia_salida'
  | 'ajuste'
  | 'devolucion'

export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  transferencia_entrada: 'Transferencia recibida',
  transferencia_salida: 'Transferencia enviada',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
}

export type EstadoMovimiento = 'pendiente' | 'confirmado' | 'anulado'

export const ETIQUETA_ESTADO_MOVIMIENTO: Record<EstadoMovimiento, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  anulado: 'Anulado',
}

export type OrigenMovimiento = 'manual' | 'importado' | 'recurrente' | 'sistema'

export type EstadoTransferencia = 'pendiente' | 'conciliada' | 'cancelada'

export const ETIQUETA_ESTADO_TRANSFERENCIA: Record<EstadoTransferencia, string> = {
  pendiente: 'Pendiente',
  conciliada: 'Conciliada',
  cancelada: 'Cancelada',
}

/** Fila de `public.cuentas`. */
export interface Cuenta {
  id: UUID
  user_id: UUID
  nombre: string
  tipo: TipoCuenta
  moneda: string | null
  saldo_inicial: MontoPYG
  descripcion: string | null
  color: string | null
  icono: string | null
  activa: boolean
  incluir_en_total: boolean
  orden: number | null
  created_at: string | null
  updated_at: string | null
}

/** Fila de la vista `public.v_saldos_cuentas` (saldo actual calculado en la base). */
export interface SaldoCuenta {
  id: UUID
  user_id: UUID
  nombre: string
  tipo: TipoCuenta
  moneda: string | null
  saldo_inicial: MontoPYG
  activa: boolean
  incluir_en_total: boolean
  saldo_actual: MontoPYG
}

/** Fila de `public.categorias`. */
export interface Categoria {
  id: UUID
  user_id: UUID
  nombre: string
  tipo: TipoCategoria
  categoria_padre_id: UUID | null
  icono: string | null
  color: string | null
  activa: boolean
  orden: number | null
  created_at: string | null
  updated_at: string | null
}

/** Fila de `public.movimientos`. */
export interface Movimiento {
  id: UUID
  user_id: UUID
  cuenta_id: UUID
  categoria_id: UUID | null
  transferencia_id: UUID | null
  tipo: TipoMovimiento
  monto: MontoPYG
  monto_firmado: MontoPYG
  fecha: FechaISO
  descripcion: string | null
  notas: string | null
  origen: OrigenMovimiento | null
  estado: EstadoMovimiento
  conciliado: boolean | null
  referencia_externa: string | null
  /** Lo completa `confirmar_recurrente`; nunca se escribe desde el frontend. */
  recurrente_id?: UUID | null
  created_at: string | null
  updated_at: string | null
}

/** Fila de `public.transferencias`. */
export interface Transferencia {
  id: UUID
  user_id: UUID
  cuenta_origen_id: UUID
  cuenta_destino_id: UUID
  monto: MontoPYG
  fecha: FechaISO
  estado: EstadoTransferencia
  referencia: string | null
  notas: string | null
  created_at: string | null
  updated_at: string | null
}

/** Fila de `public.presupuestos`. */
export interface Presupuesto {
  id: UUID
  user_id: UUID
  categoria_id: UUID
  monto_limite: MontoPYG
  fecha_desde: FechaISO
  fecha_hasta: FechaISO
  activo: boolean
  created_at: string | null
  updated_at: string | null
}

/** Tipo de movimiento que genera un recurrente. */
export type TipoRecurrente = 'ingreso' | 'gasto'

export const TIPOS_RECURRENTE: TipoRecurrente[] = ['gasto', 'ingreso']

export const ETIQUETA_TIPO_RECURRENTE: Record<TipoRecurrente, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
}

/** Frecuencias admitidas por el CHECK de `public.recurrentes.frecuencia`. */
export type FrecuenciaRecurrente = 'semanal' | 'quincenal' | 'mensual' | 'anual'

export const FRECUENCIAS_RECURRENTE: FrecuenciaRecurrente[] = [
  'semanal',
  'quincenal',
  'mensual',
  'anual',
]

export const ETIQUETA_FRECUENCIA: Record<FrecuenciaRecurrente, string> = {
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  anual: 'Anual',
}

/**
 * Fila de `public.recurrentes`.
 *
 * Un recurrente es una previsión: NO afecta a los saldos hasta que se
 * confirma con el RPC `confirmar_recurrente`.
 */
export interface Recurrente {
  id: UUID
  user_id: UUID
  nombre: string
  cuenta_id: UUID
  categoria_id: UUID | null
  tipo: TipoRecurrente
  monto: MontoPYG
  frecuencia: FrecuenciaRecurrente
  proxima_fecha: FechaISO
  generar_automaticamente: boolean
  activa: boolean
  descripcion: string | null
  /** Día fijo del mes (1..31) o `null`. */
  dia_mes: number | null
  /** `true` cuando vence el último día de cada mes. */
  ultimo_dia_mes: boolean
  /** `true` cuando el monto puede variar y se ajusta al confirmar. */
  monto_estimado: boolean
  created_at: string | null
  updated_at: string | null
}

/* ------------------------- Planes de cuotas ------------------------------ */

export type EstadoPlanCuotas = 'activo' | 'completado' | 'cancelado'

export const ETIQUETA_ESTADO_PLAN: Record<EstadoPlanCuotas, string> = {
  activo: 'Activo',
  completado: 'Completado',
  cancelado: 'Cancelado',
}

/** Fila de `public.planes_cuotas`. */
export interface PlanCuotas {
  id: UUID
  user_id: UUID
  nombre: string
  proveedor: string | null
  descripcion: string | null
  categoria_id: UUID | null
  cuenta_preferida_id: UUID | null
  monto_total: MontoPYG
  cantidad_cuotas: number
  fecha_compra: FechaISO
  fecha_primera_cuota: FechaISO
  frecuencia_meses: number
  estado: EstadoPlanCuotas
  notas: string | null
  created_at: string | null
  updated_at: string | null
}

/** Fila de `public.v_planes_cuotas_resumen`. */
export interface PlanCuotasResumen {
  id: UUID
  user_id: UUID
  nombre: string
  proveedor: string | null
  descripcion: string | null
  categoria_id: UUID | null
  cuenta_preferida_id: UUID | null
  monto_total: MontoPYG
  cantidad_cuotas: number
  fecha_compra: FechaISO
  fecha_primera_cuota: FechaISO
  frecuencia_meses: number
  estado: EstadoPlanCuotas
  cuotas_pagadas: number
  cuotas_pendientes: number
  monto_pagado: MontoPYG
  saldo_pendiente: MontoPYG
  proxima_cuota: FechaISO | null
}

export type EstadoCuota = 'pendiente' | 'pagada' | 'cancelada'

export const ETIQUETA_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  pendiente: 'Pendiente',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
}

/** Fila de `public.cuotas_plan`. */
export interface CuotaPlan {
  id: UUID
  user_id: UUID
  plan_id: UUID
  numero: number
  fecha_vencimiento: FechaISO
  monto_programado: MontoPYG
  estado: EstadoCuota
  fecha_pago: FechaISO | null
  monto_pagado: MontoPYG | null
  movimiento_id: UUID | null
  created_at: string | null
  updated_at: string | null
}

/* ----------------------- Próximos movimientos ---------------------------- */

export type OrigenProximo = 'recurrente' | 'cuota'
export type EstadoProximo = 'pendiente' | 'vencido'

export const ETIQUETA_ESTADO_PROXIMO: Record<EstadoProximo, string> = {
  pendiente: 'Pendiente',
  vencido: 'Vencido',
}

/**
 * Fila de `public.v_proximos_movimientos`.
 *
 * Es la fuente de los próximos cobros y pagos. Nada de esto existe todavía
 * en `public.movimientos`: son previsiones y no afectan a ningún saldo.
 */
export interface ProximoMovimiento {
  user_id: UUID
  origen: OrigenProximo
  /** Id del recurrente o de la cuota, según el origen. */
  origen_id: UUID
  grupo_id: UUID | null
  tipo: TipoRecurrente
  nombre: string
  monto: MontoPYG
  fecha: FechaISO
  cuenta_id: UUID | null
  categoria_id: UUID | null
  estado: EstadoProximo
  detalle: string | null
  numero_cuota: number | null
  total_cuotas: number | null
}

/** Resultado del RPC `buscar_transferencias_potenciales`. */
export interface TransferenciaPotencial {
  salida_id: UUID
  entrada_id: UUID
  cuenta_origen_id: UUID
  cuenta_origen: string
  cuenta_destino_id: UUID
  cuenta_destino: string
  monto: MontoPYG
  fecha_salida: FechaISO
  fecha_entrada: FechaISO
  diferencia_dias: number
  descripcion_salida: string | null
  descripcion_entrada: string | null
  puntaje: number
  nivel: NivelCoincidencia
}

export type NivelCoincidencia = 'alta' | 'media' | 'baja'

export const ETIQUETA_NIVEL: Record<NivelCoincidencia, string> = {
  alta: 'Coincidencia alta',
  media: 'Coincidencia media',
  baja: 'Coincidencia baja',
}
