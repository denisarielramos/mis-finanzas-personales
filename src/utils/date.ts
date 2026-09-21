import type { FechaISO } from '../types/db'

/**
 * Utilidades de fecha.
 *
 * Las columnas `date` de PostgreSQL son fechas de calendario sin hora.
 * Para evitar que la zona horaria cambie el día, aquí NUNCA se convierte
 * un `YYYY-MM-DD` a `Date` en UTC: se trabaja con las partes del texto.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function dosDigitos(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Fecha local de hoy en formato `YYYY-MM-DD`. */
export function hoyISO(): FechaISO {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`
}

/** Partes numéricas de un `YYYY-MM-DD`. */
export function partesFecha(iso: FechaISO): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return { anio: anio || 0, mes: mes || 0, dia: dia || 0 }
}

/** `2026-09-20` → `20/09/2026`. */
export function formatearFecha(iso: FechaISO | null | undefined): string {
  if (!iso) return '—'
  const { anio, mes, dia } = partesFecha(iso)
  if (!anio) return '—'
  return `${dosDigitos(dia)}/${dosDigitos(mes)}/${anio}`
}

/** `2026-09-20` → `20 de septiembre de 2026`. */
export function formatearFechaLarga(iso: FechaISO | null | undefined): string {
  if (!iso) return '—'
  const { anio, mes, dia } = partesFecha(iso)
  if (!anio) return '—'
  return `${dia} de ${MESES[mes - 1]} de ${anio}`
}

/** `2026-09-20` → `20 sep`. */
export function formatearFechaCorta(iso: FechaISO | null | undefined): string {
  if (!iso) return '—'
  const { mes, dia } = partesFecha(iso)
  if (!mes) return '—'
  return `${dia} ${MESES_CORTOS[mes - 1]}`
}

/** Fecha y hora de una columna `timestamptz` → `20/09/2026 14:35`. */
export function formatearFechaHora(valor: string | null | undefined): string {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
}

/** Suma (o resta) días a una fecha de calendario, sin tocar zonas horarias. */
export function sumarDias(iso: FechaISO, dias: number): FechaISO {
  const { anio, mes, dia } = partesFecha(iso)
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + dias)
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`
}

/**
 * Suma meses a una fecha de calendario.
 * Si el día no existe en el mes destino se usa el último día de ese mes
 * (31/01 + 1 mes → 28/02).
 */
export function sumarMeses(iso: FechaISO, meses: number): FechaISO {
  const { anio, mes, dia } = partesFecha(iso)
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1))
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${destino.getUTCFullYear()}-${dosDigitos(destino.getUTCMonth() + 1)}-${dosDigitos(diaFinal)}`
}

/** Días de diferencia entre dos fechas de calendario (b - a). */
export function diferenciaDias(a: FechaISO, b: FechaISO): number {
  const pa = partesFecha(a)
  const pb = partesFecha(b)
  const ms =
    Date.UTC(pb.anio, pb.mes - 1, pb.dia) - Date.UTC(pa.anio, pa.mes - 1, pa.dia)
  return Math.round(ms / 86400000)
}

export interface RangoMes {
  anio: number
  mes: number
  desde: FechaISO
  hasta: FechaISO
  etiqueta: string
}

/** Rango `[primer día, último día]` de un mes concreto. */
export function rangoMes(anio: number, mes: number): RangoMes {
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return {
    anio,
    mes,
    desde: `${anio}-${dosDigitos(mes)}-01`,
    hasta: `${anio}-${dosDigitos(mes)}-${dosDigitos(ultimoDia)}`,
    etiqueta: `${MESES[mes - 1]} ${anio}`,
  }
}

/** Rango del mes en curso. */
export function mesActual(): RangoMes {
  const ahora = new Date()
  return rangoMes(ahora.getFullYear(), ahora.getMonth() + 1)
}

/** Devuelve el mes desplazado `delta` meses respecto al recibido. */
export function desplazarMes(rango: RangoMes, delta: number): RangoMes {
  const base = new Date(Date.UTC(rango.anio, rango.mes - 1 + delta, 1))
  return rangoMes(base.getUTCFullYear(), base.getUTCMonth() + 1)
}

/** Capitaliza la primera letra: `septiembre 2026` → `Septiembre 2026`. */
export function capitalizar(texto: string): string {
  if (!texto) return texto
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Encabezado de grupo de movimientos: `HOY`, `AYER` o la fecha larga. */
export function etiquetaGrupoFecha(iso: FechaISO): string {
  const hoy = hoyISO()
  if (iso === hoy) return 'Hoy'
  if (iso === sumarDias(hoy, -1)) return 'Ayer'
  return capitalizar(formatearFechaLarga(iso))
}

/** Comparación de fechas de calendario como texto (el formato ISO lo permite). */
export function esAnterior(a: FechaISO, b: FechaISO): boolean {
  return a < b
}

/** `true` si `fecha` está dentro de `[desde, hasta]` inclusive. */
export function dentroDeRango(fecha: FechaISO, desde: FechaISO, hasta: FechaISO): boolean {
  return fecha >= desde && fecha <= hasta
}
