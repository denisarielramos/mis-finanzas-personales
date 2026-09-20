/**
 * Genera los iconos PNG de la PWA sin dependencias externas.
 *
 * Son iconos PROVISIONALES: un cuadrado oscuro con tres barras ascendentes.
 * Para reemplazarlos por el logotipo definitivo basta con sobrescribir los
 * archivos de `public/icons/` manteniendo los mismos nombres y tamaños.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/icons')

const BG = [11, 18, 32, 255] // #0b1220
const BAR_MUTED = [71, 85, 105, 255] // #475569
const BAR_SOFT = [148, 163, 184, 255] // #94a3b8
const BAR_ACCENT = [16, 185, 129, 255] // #10b981

/* ------------------------------ Codificador PNG ----------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filtro "None"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------- Dibujo simple ------------------------------ */

function createCanvas(size) {
  return { size, data: Buffer.alloc(size * size * 4, 0) }
}

function blend(canvas, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size || alpha <= 0) return
  const i = (y * canvas.size + x) * 4
  const a = Math.min(1, alpha)
  for (let c = 0; c < 3; c++) {
    canvas.data[i + c] = Math.round(canvas.data[i + c] * (1 - a) + color[c] * a)
  }
  canvas.data[i + 3] = Math.round(Math.min(255, canvas.data[i + 3] * (1 - a) + 255 * a))
}

/** Rectángulo con esquinas redondeadas y antialiasing por supersampling. */
function roundedRect(canvas, x0, y0, w, h, radius, color) {
  const x1 = x0 + w
  const y1 = y0 + h
  const r = Math.min(radius, w / 2, h / 2)
  const samples = 3
  const step = 1 / samples

  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      let hits = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) * step
          const py = y + (sy + 0.5) * step
          if (px < x0 || px > x1 || py < y0 || py > y1) continue
          const cx = Math.min(Math.max(px, x0 + r), x1 - r)
          const cy = Math.min(Math.max(py, y0 + r), y1 - r)
          const dx = px - cx
          const dy = py - cy
          if (dx * dx + dy * dy <= r * r + 1e-9) hits++
        }
      }
      if (hits > 0) blend(canvas, x, y, color, hits / (samples * samples))
    }
  }
}

function buildIcon(size, { fullBleed = false, padding = 0.18 } = {}) {
  const canvas = createCanvas(size)
  const bgRadius = fullBleed ? 0 : size * 0.22
  roundedRect(canvas, 0, 0, size, size, bgRadius, BG)

  const pad = size * padding
  const area = size - pad * 2
  const gap = area * 0.1
  const barWidth = (area - gap * 2) / 3
  const radius = barWidth * 0.32
  const heights = [0.45, 0.68, 1]
  const colors = [BAR_MUTED, BAR_SOFT, BAR_ACCENT]

  for (let i = 0; i < 3; i++) {
    const h = area * heights[i]
    const x = pad + i * (barWidth + gap)
    const y = pad + (area - h)
    roundedRect(canvas, x, y, barWidth, h, radius, colors[i])
  }

  return encodePng(size, size, canvas.data)
}

/* --------------------------------- Salida ---------------------------------- */

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  ['icon-192.png', buildIcon(192)],
  ['icon-512.png', buildIcon(512)],
  ['icon-maskable-512.png', buildIcon(512, { fullBleed: true, padding: 0.28 })],
  ['apple-touch-icon.png', buildIcon(180, { fullBleed: true, padding: 0.2 })],
]

for (const [name, buffer] of targets) {
  writeFileSync(resolve(OUT_DIR, name), buffer)
  console.log(`✓ public/icons/${name} (${buffer.length} bytes)`)
}
