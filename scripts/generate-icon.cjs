// Generates resources/icon.png (256x256) and a multi-size resources/icon.ico
// (16/24/32/48/64/128/256) from scratch — no external image deps.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const OUT_DIR = path.join(__dirname, '..', 'resources')

function renderAtSize(SIZE) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
    const i = (y * SIZE + x) * 4
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a
  }
  const fillRoundRect = (x0, y0, w, h, radius, r, g, b, a = 255) => {
    const xs = Math.round(x0), ys = Math.round(y0)
    const xe = Math.round(x0 + w), ye = Math.round(y0 + h)
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        const dx = Math.max(xs + radius - x, x - (xe - 1 - radius), 0)
        const dy = Math.max(ys + radius - y, y - (ye - 1 - radius), 0)
        if (dx * dx + dy * dy <= radius * radius) setPixel(x, y, r, g, b, a)
      }
    }
  }

  // Rounded-square background — radial gradient. The rounding masks corners so
  // small sizes still look icon-shaped instead of stretched-square.
  const cx = SIZE / 2, cy = SIZE / 2
  const maxDist = Math.hypot(cx, cy)
  const cornerR = Math.max(2, Math.round(SIZE * 0.18))
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = Math.max(cornerR - x, x - (SIZE - 1 - cornerR), 0)
      const dy = Math.max(cornerR - y, y - (SIZE - 1 - cornerR), 0)
      if (dx * dx + dy * dy > cornerR * cornerR) continue
      const t = Math.hypot(x - cx, y - cy) / maxDist
      const r = Math.round(40 * (1 - t) + 10 * t)
      const g = Math.round(30 * (1 - t) + 15 * t)
      const b = Math.round(90 * (1 - t) + 30 * t)
      setPixel(x, y, r, g, b)
    }
  }

  // Below ~32px the 7-key motif turns to mush — drop to 3 keys + accent so the
  // glyph stays legible in the taskbar / file-list view.
  if (SIZE < 40) {
    const padX = SIZE * 0.22
    const kbW = SIZE - padX * 2
    const kbH = SIZE * 0.50
    const kbX = padX
    const kbY = SIZE * 0.32
    const whiteW = kbW / 3
    for (let i = 0; i < 3; i++) {
      const x = kbX + i * whiteW
      fillRoundRect(x, kbY, whiteW - Math.max(1, SIZE * 0.04), kbH, Math.max(0, SIZE * 0.04), 245, 245, 250)
    }
    const blackW = whiteW * 0.55
    const blackH = kbH * 0.6
    for (const i of [0, 1]) {
      fillRoundRect(kbX + (i + 1) * whiteW - blackW / 2, kbY, blackW, blackH, Math.max(0, SIZE * 0.03), 18, 18, 28)
    }
    const barH = Math.max(2, Math.round(SIZE * 0.07))
    fillRoundRect(kbX, kbY - barH * 2, kbW, barH, Math.max(0, SIZE * 0.03), 217, 70, 239)
  } else {
    const padX = SIZE * 0.14
    const kbW = SIZE - padX * 2
    const kbH = SIZE * 0.46
    const kbX = padX
    const kbY = SIZE * 0.34
    const whiteW = kbW / 7
    const whiteGap = Math.max(1, SIZE * 0.008)
    for (let i = 0; i < 7; i++) {
      const x = kbX + i * whiteW
      fillRoundRect(x, kbY, whiteW - whiteGap, kbH, Math.max(1, SIZE * 0.015), 245, 245, 250)
    }
    const blackW = whiteW * 0.6
    const blackH = kbH * 0.6
    for (const i of [0, 1, 3, 4, 5]) {
      fillRoundRect(kbX + (i + 1) * whiteW - blackW / 2, kbY, blackW, blackH, Math.max(1, SIZE * 0.012), 18, 18, 28)
    }
    const barH = Math.max(2, Math.round(SIZE * 0.03))
    const barGap = Math.max(2, Math.round(SIZE * 0.04))
    fillRoundRect(kbX, kbY - barH - barGap, kbW, barH, Math.max(1, SIZE * 0.015), 217, 70, 239)
  }

  return pixels
}

function crc32(buf) {
  let c, table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePng(pixels, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0
    pixels.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const entries = SIZES.map((size) => ({ size, png: encodePng(renderAtSize(size), size) }))

// ICO: 6-byte header + 16-byte directory entry per image + concatenated PNGs.
const HEADER = 6 + 16 * entries.length
let offset = HEADER
const dir = Buffer.alloc(HEADER)
dir.writeUInt16LE(0, 0)
dir.writeUInt16LE(1, 2)
dir.writeUInt16LE(entries.length, 4)
entries.forEach((e, i) => {
  const o = 6 + i * 16
  dir[o] = e.size === 256 ? 0 : e.size
  dir[o + 1] = e.size === 256 ? 0 : e.size
  dir[o + 2] = 0; dir[o + 3] = 0
  dir.writeUInt16LE(1, o + 4)
  dir.writeUInt16LE(32, o + 6)
  dir.writeUInt32LE(e.png.length, o + 8)
  dir.writeUInt32LE(offset, o + 12)
  offset += e.png.length
})
const ico = Buffer.concat([dir, ...entries.map((e) => e.png)])
const png256 = entries.find((e) => e.size === 256).png

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png256)
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)
console.log(`Wrote icon.png (${png256.length} bytes), icon.ico (${ico.length} bytes, ${entries.length} sizes: ${SIZES.join(', ')})`)
