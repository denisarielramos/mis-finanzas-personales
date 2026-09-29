import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { EstadoPresupuesto, FilaCategoria, FilaGasto, ReportePresupuesto } from '../types/reportes'
import { formatearFecha, partesFecha } from '../utils/date'
import { formatearGs } from '../utils/money'

/**
 * Exportación de un presupuesto a PDF y a Excel.
 *
 * El servicio no consulta nada: recibe el reporte ya armado con los mismos
 * datos que la pantalla muestra y solo genera el documento. Los importes van
 * siempre con sus valores reales: exportar es una acción explícita, así que
 * el modo privacidad de la interfaz no los toca.
 */

const AZUL = '#0d366b'
const GRIS = '#5b6676'
const BORDE = '#e4e8ee'

export type ResultadoEntrega = 'compartido' | 'descargado' | 'cancelado'

/* ------------------------------ Nombre del archivo ----------------------- */

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** `Presupuesto_Vivienda_2026-09.pdf` */
export function nombreArchivo(reporte: ReportePresupuesto, extension: string): string {
  const { anio, mes } = partesFecha(reporte.desde)
  const categoria =
    sinAcentos(reporte.categoria)
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'Presupuesto'

  return `Presupuesto_${categoria}_${anio}-${String(mes).padStart(2, '0')}.${extension}`
}

/* --------------------------- Compartir o descargar ----------------------- */

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Se libera después del click: Safari necesita que la URL siga viva.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function esCancelacion(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/**
 * Entrega el archivo por la hoja de compartir del teléfono cuando el
 * navegador admite compartir ARCHIVOS (iOS Safari lo hace desde la PWA).
 * Si no, o si algo falla, se descarga: nunca se queda sin entregar.
 */
async function entregar(
  blob: Blob,
  nombre: string,
  titulo: string,
  texto: string,
): Promise<ResultadoEntrega> {
  const archivo = new File([blob], nombre, { type: blob.type })
  const datos: ShareData = { files: [archivo], title: titulo, text: texto }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const puede = typeof navigator.canShare === 'function' ? navigator.canShare(datos) : false
    if (puede) {
      try {
        await navigator.share(datos)
        return 'compartido'
      } catch (e) {
        // Cerrar la hoja de compartir no es un error ni pide descargar.
        if (esCancelacion(e)) return 'cancelado'
        console.warn('[Mis Finanzas] no se pudo compartir, se descarga', e)
      }
    }
  }

  descargar(blob, nombre)
  return 'descargado'
}

/* ---------------------------------- PDF ---------------------------------- */

const MARGEN = 40

function textoEstado(estado: EstadoPresupuesto): string {
  return estado === 'activo' ? 'Activo' : 'Desactivado'
}

function generarPdf(reporte: ReportePresupuesto): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const excedido = reporte.disponible < 0

  // Cabecera
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(AZUL)
  doc.text('Reporte de presupuesto', MARGEN, 60)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor('#0b1220')
  doc.text(reporte.categoria, MARGEN, 82)

  doc.setFontSize(10)
  doc.setTextColor(GRIS)
  doc.text(
    `Periodo: ${formatearFecha(reporte.desde)} – ${formatearFecha(reporte.hasta)}`,
    MARGEN,
    100,
  )

  // Las tres cifras que importan, una al lado de la otra
  autoTable(doc, {
    startY: 120,
    theme: 'plain',
    styles: { font: 'helvetica', cellPadding: { top: 8, right: 8, bottom: 8, left: 8 } },
    head: [['Presupuesto', 'Gastado', excedido ? 'Excedido' : 'Disponible']],
    headStyles: { fontSize: 9, textColor: GRIS, fontStyle: 'normal' },
    body: [
      [
        formatearGs(reporte.limite),
        formatearGs(reporte.gastado),
        formatearGs(Math.abs(reporte.disponible)),
      ],
    ],
    bodyStyles: { fontSize: 14, fontStyle: 'bold', textColor: '#0b1220' },
    columnStyles: {
      0: { cellWidth: (ancho - MARGEN * 2) / 3 },
      1: { cellWidth: (ancho - MARGEN * 2) / 3 },
      2: { cellWidth: (ancho - MARGEN * 2) / 3, textColor: excedido ? '#d1384f' : '#059669' },
    },
    margin: { left: MARGEN, right: MARGEN },
  })

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, lineColor: BORDE, cellPadding: 6 },
    body: [
      ['Porcentaje utilizado', `${reporte.porcentaje}%`],
      ['Cantidad de gastos', String(reporte.gastos.length)],
      ['Estado del presupuesto', textoEstado(reporte.estado)],
    ],
    columnStyles: { 0: { textColor: GRIS, cellWidth: 200 }, 1: { fontStyle: 'bold' } },
    margin: { left: MARGEN, right: MARGEN },
  })

  // Desglose por categoría: solo aporta si hay más de una
  if (reporte.porCategoria.length > 1) {
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, lineColor: BORDE, cellPadding: 6 },
      head: [['Categoría', 'Gastado', '% del gasto']],
      headStyles: { fillColor: AZUL, textColor: '#ffffff', fontStyle: 'bold' },
      body: reporte.porCategoria.map((fila) => [
        fila.nombre,
        formatearGs(fila.monto),
        `${fila.porcentaje}%`,
      ]),
      columnStyles: {
        1: { halign: 'right', cellWidth: 110 },
        2: { halign: 'right', cellWidth: 80 },
      },
      margin: { left: MARGEN, right: MARGEN },
    })
  }

  // Detalle de gastos: se reparte solo en las páginas que haga falta
  const inicioGastos =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24

  if (reporte.gastos.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(GRIS)
    doc.text('No hay gastos que consuman este presupuesto en el periodo.', MARGEN, inicioGastos + 12)
  } else {
    autoTable(doc, {
      startY: inicioGastos,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, lineColor: BORDE, cellPadding: 5 },
      head: [['Fecha', 'Descripción', 'Categoría', 'Cuenta', 'Monto']],
      headStyles: { fillColor: AZUL, textColor: '#ffffff', fontStyle: 'bold' },
      body: reporte.gastos.map((g) => [
        formatearFecha(g.fecha),
        g.descripcion,
        g.categoria,
        g.cuenta,
        formatearGs(g.monto),
      ]),
      columnStyles: {
        0: { cellWidth: 62 },
        4: { halign: 'right', cellWidth: 90 },
      },
      margin: { left: MARGEN, right: MARGEN },
      // Repite la cabecera en cada página y nunca parte una fila por la mitad.
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
    })
  }

  // Totales, para no tener que sumar nada a mano
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 11, cellPadding: 5 },
    body: [
      ['Total presupuesto', formatearGs(reporte.limite)],
      ['Total gastado', formatearGs(reporte.gastado)],
      [
        excedido ? 'Excedido' : 'Disponible',
        formatearGs(Math.abs(reporte.disponible)),
      ],
    ],
    columnStyles: {
      0: { textColor: GRIS, cellWidth: 200 },
      1: { fontStyle: 'bold', halign: 'right', cellWidth: 140 },
    },
    margin: { left: MARGEN, right: MARGEN },
    didParseCell: (datos) => {
      if (datos.row.index === 2 && datos.column.index === 1) {
        datos.cell.styles.textColor = excedido ? '#d1384f' : '#059669'
      }
    },
  })

  // El pie se sella al final, cuando ya se sabe cuántas páginas hay
  const paginas = doc.getNumberOfPages()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(GRIS)
    doc.text(`Mis Finanzas · ${reporte.categoria}`, MARGEN, alto - 24)
    doc.text(`Página ${i} de ${paginas}`, ancho - MARGEN, alto - 24, { align: 'right' })
  }

  return doc.output('blob')
}

/* --------------------------------- Excel --------------------------------- */

const FORMATO_MONTO = '#,##0'
const FORMATO_PORCENTAJE = '0"%"'
const FORMATO_FECHA = 'dd/mm/yyyy'

/** Fecha en horario local: evita que un ISO se corra un día al exportar. */
function aFechaLocal(iso: string): Date {
  const { anio, mes, dia } = partesFecha(iso)
  return new Date(anio, mes - 1, dia)
}

function aplicarFormato(hoja: XLSX.WorkSheet, celda: string, formato: string): void {
  const valor = hoja[celda] as XLSX.CellObject | undefined
  if (valor) valor.z = formato
}

function hojaResumen(reporte: ReportePresupuesto): XLSX.WorkSheet {
  const excedido = reporte.disponible < 0

  const filas: (string | number | Date)[][] = [
    ['Categoría', reporte.categoria],
    ['Periodo desde', aFechaLocal(reporte.desde)],
    ['Periodo hasta', aFechaLocal(reporte.hasta)],
    ['Presupuesto', reporte.limite],
    ['Gastado', reporte.gastado],
    ['Disponible', excedido ? 0 : reporte.disponible],
    ['Excedido', excedido ? Math.abs(reporte.disponible) : 0],
    ['Porcentaje utilizado', reporte.porcentaje],
    ['Cantidad de movimientos', reporte.gastos.length],
    ['Estado', textoEstado(reporte.estado)],
  ]

  const hoja = XLSX.utils.aoa_to_sheet(filas, { cellDates: true })
  hoja['!cols'] = [{ wch: 26 }, { wch: 22 }]

  aplicarFormato(hoja, 'B2', FORMATO_FECHA)
  aplicarFormato(hoja, 'B3', FORMATO_FECHA)
  for (const celda of ['B4', 'B5', 'B6', 'B7']) aplicarFormato(hoja, celda, FORMATO_MONTO)
  aplicarFormato(hoja, 'B8', FORMATO_PORCENTAJE)

  return hoja
}

function hojaPorCategoria(filas: FilaCategoria[]): XLSX.WorkSheet {
  const datos: (string | number)[][] = [
    ['Categoría', 'Gastado', 'Porcentaje'],
    ...filas.map((f) => [f.nombre, f.monto, f.porcentaje]),
  ]

  const hoja = XLSX.utils.aoa_to_sheet(datos)
  hoja['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }]

  for (let i = 0; i < filas.length; i += 1) {
    aplicarFormato(hoja, `B${i + 2}`, FORMATO_MONTO)
    aplicarFormato(hoja, `C${i + 2}`, FORMATO_PORCENTAJE)
  }

  return hoja
}

function hojaGastos(gastos: FilaGasto[], total: number): XLSX.WorkSheet {
  const datos: (string | number | Date)[][] = [
    ['Fecha', 'Descripción', 'Categoría', 'Cuenta', 'Monto'],
    ...gastos.map((g) => [aFechaLocal(g.fecha), g.descripcion, g.categoria, g.cuenta, g.monto]),
    [],
    ['', '', '', 'Total gastado', total],
  ]

  const hoja = XLSX.utils.aoa_to_sheet(datos, { cellDates: true })
  hoja['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 24 }, { wch: 24 }, { wch: 16 }]

  for (let i = 0; i < gastos.length; i += 1) {
    aplicarFormato(hoja, `A${i + 2}`, FORMATO_FECHA)
    aplicarFormato(hoja, `E${i + 2}`, FORMATO_MONTO)
  }
  // Cabecera + gastos + fila en blanco + total.
  aplicarFormato(hoja, `E${gastos.length + 3}`, FORMATO_MONTO)

  return hoja
}

function generarExcel(reporte: ReportePresupuesto): Blob {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hojaResumen(reporte), 'Resumen')
  XLSX.utils.book_append_sheet(libro, hojaPorCategoria(reporte.porCategoria), 'Por categoría')
  XLSX.utils.book_append_sheet(libro, hojaGastos(reporte.gastos, reporte.gastado), 'Gastos')

  const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* --------------------------------- API ----------------------------------- */

function textoCompartir(reporte: ReportePresupuesto): string {
  return `Presupuesto de ${reporte.categoria}: ${formatearGs(reporte.gastado)} de ${formatearGs(
    reporte.limite,
  )} (${reporte.porcentaje}%).`
}

export async function compartirPresupuestoPdf(
  reporte: ReportePresupuesto,
): Promise<ResultadoEntrega> {
  const blob = generarPdf(reporte)
  return entregar(
    blob,
    nombreArchivo(reporte, 'pdf'),
    `Presupuesto ${reporte.categoria}`,
    textoCompartir(reporte),
  )
}

export async function compartirPresupuestoExcel(
  reporte: ReportePresupuesto,
): Promise<ResultadoEntrega> {
  const blob = generarExcel(reporte)
  return entregar(
    blob,
    nombreArchivo(reporte, 'xlsx'),
    `Presupuesto ${reporte.categoria}`,
    textoCompartir(reporte),
  )
}

/** Solo para pruebas y diagnóstico: devuelve el documento sin entregarlo. */
export const _generar = { pdf: generarPdf, excel: generarExcel }
