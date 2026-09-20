import type { MontoPYG } from '../types/db'

/**
 * Utilidad central de dinero. Toda la aplicación formatea importes aquí.
 *
 * Reglas:
 *  - La única moneda es el guaraní paraguayo (PYG).
 *  - Los montos son enteros (BIGINT en PostgreSQL). Nunca hay decimales.
 *  - Visualmente siempre: `Gs. 150.000`.
 */

export const SIMBOLO_MONEDA = 'Gs.'

/**
 * Normaliza un valor que llega de Supabase (BIGINT puede llegar como number
 * o como string según el driver) a un entero de JavaScript.
 *
 * Los importes personales en PYG quedan muy por debajo de
 * `Number.MAX_SAFE_INTEGER` (9.007.199.254.740.991 ≈ 9 billones de guaraníes),
 * así que `number` es seguro; aun así la conversión se centraliza aquí para
 * poder cambiarla en un único lugar si algún día hiciera falta.
 */
export function aMonto(valor: unknown): MontoPYG {
  if (valor === null || valor === undefined || valor === '') return 0

  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor) : 0
  }
  if (typeof valor === 'bigint') {
    return Number(valor)
  }
  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^\d-]/g, '')
    const n = Number.parseInt(limpio, 10)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

/** Agrupa los miles con punto: `1250000` → `1.250.000`. */
export function agruparMiles(entero: number): string {
  const negativo = entero < 0
  const digitos = Math.abs(Math.trunc(entero)).toString()
  let salida = ''
  for (let i = 0; i < digitos.length; i++) {
    if (i > 0 && (digitos.length - i) % 3 === 0) salida += '.'
    salida += digitos[i]
  }
  return negativo ? `-${salida}` : salida
}

export interface OpcionesFormato {
  /**
   * `auto`    → muestra el signo `-` solo si el monto es negativo (por defecto).
   * `siempre` → antepone `+` o `-` según corresponda.
   * `nunca`   → muestra siempre el valor absoluto.
   */
  signo?: 'auto' | 'siempre' | 'nunca'
}

/**
 * Formato oficial de importes de la aplicación.
 *
 *   formatearGs(150000)                     → 'Gs. 150.000'
 *   formatearGs(-350000)                    → '-Gs. 350.000'
 *   formatearGs(9000000, { signo: 'siempre' }) → '+Gs. 9.000.000'
 */
export function formatearGs(valor: unknown, opciones: OpcionesFormato = {}): string {
  const monto = aMonto(valor)
  const { signo = 'auto' } = opciones
  const absoluto = agruparMiles(Math.abs(monto))

  let prefijo = ''
  if (signo === 'siempre') prefijo = monto < 0 ? '-' : '+'
  else if (signo === 'auto' && monto < 0) prefijo = '-'

  return `${prefijo}${SIMBOLO_MONEDA} ${absoluto}`
}

/** Versión abreviada para ejes y etiquetas de gráficos: `1,2 M`, `350 mil`. */
export function formatearGsCorto(valor: unknown): string {
  const monto = aMonto(valor)
  const abs = Math.abs(monto)
  const signo = monto < 0 ? '-' : ''

  if (abs >= 1_000_000_000) {
    return `${signo}${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} MM`
  }
  if (abs >= 1_000_000) {
    return `${signo}${(abs / 1_000_000).toFixed(1).replace('.', ',')} M`
  }
  if (abs >= 1_000) {
    return `${signo}${Math.round(abs / 1_000)} mil`
  }
  return `${signo}${abs}`
}

/** Deja solo los dígitos que escribió la persona: `'1.250.000x'` → `'1250000'`. */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

/** Convierte lo escrito en un campo de monto a entero. */
export function parsearEntradaMonto(texto: string): MontoPYG {
  const digitos = soloDigitos(texto)
  if (!digitos) return 0
  const n = Number.parseInt(digitos, 10)
  return Number.isSafeInteger(n) ? n : 0
}

/** Texto que se muestra mientras se escribe un monto: `'150000'` → `'150.000'`. */
export function formatearEntradaMonto(texto: string): string {
  const digitos = soloDigitos(texto)
  if (!digitos) return ''
  return agruparMiles(Number.parseInt(digitos, 10))
}

/** Porcentaje entero acotado para barras de progreso. */
export function porcentaje(parte: number, total: number): number {
  if (!total) return 0
  return Math.round((parte / total) * 100)
}
