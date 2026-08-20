/**
 * Builds apps/site/assets/og-image.png, the 1200x630 card that WhatsApp,
 * Instagram, Facebook and X show when someone shares a link to the site.
 *
 * It was referenced in both HTML heads but never existed, so every share
 * preview came back blank. This composites the existing conference logo onto
 * the brand ground rather than depending on a design tool, so it can be rebuilt
 * whenever the logo changes:
 *
 *   node scripts/build-og-image.mjs
 *
 * Only handles 8-bit RGBA non-interlaced PNG input, which is what
 * lri-mun-logo.png is. If you replace the logo with a different format this
 * will tell you rather than writing something wrong.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = resolve(root, 'apps/site/assets')

const WIDTH = 1200
const HEIGHT = 630

// tokens.css
const INK = [0x2b, 0x0a, 0x21]
const MAGENTA = [0xb4, 0x18, 0x84]
const GOLD = [0xd9, 0xa4, 0x41]

// Declared up here because the drawing code below runs before the bottom of
// this module is evaluated, and a `let` down there would still be in its TDZ.
let crcTable = null

const logo = decodePng(readFileSync(resolve(SITE, 'lri-mun-logo.png')))

const canvas = new Uint8Array(WIDTH * HEIGHT * 4)

// Ground, with a magenta wash bleeding up from the lower left the way the hero
// does. Distance is normalised so the falloff does not stretch with the canvas.
const cx = WIDTH * 0.24
const cy = HEIGHT * 1.02
const radius = HEIGHT * 1.5

for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const d = Math.hypot(x - cx, y - cy) / radius
    const wash = Math.max(0, 1 - d) ** 2 * 0.55
    setPixel(canvas, x, y, mix(INK, MAGENTA, wash), 255)
  }
}

// Gold hairline, inset. Gives the card an edge on a white chat background.
const INSET = 28
rect(canvas, INSET, INSET, WIDTH - INSET * 2, HEIGHT - INSET * 2, GOLD, 1)

// Logo, centred, sized off the canvas height so it holds up when the source
// logo is swapped for a different aspect.
const targetH = Math.round(HEIGHT * 0.46)
const scale = targetH / logo.height
const targetW = Math.round(logo.width * scale)
const originX = Math.round((WIDTH - targetW) / 2)
const originY = Math.round((HEIGHT - targetH) / 2) - 26

drawScaled(canvas, logo, originX, originY, targetW, targetH)

// A short gold rule under the mark, matching the section rules on the site.
const ruleW = 132
rect(
  canvas,
  Math.round((WIDTH - ruleW) / 2),
  originY + targetH + 54,
  ruleW,
  2,
  GOLD,
  1,
  true,
)

writeFileSync(resolve(SITE, 'og-image.png'), encodePng(canvas, WIDTH, HEIGHT))
console.log(`[og] wrote apps/site/assets/og-image.png (${WIDTH}x${HEIGHT})`)

// --- pixels ----------------------------------------------------------------

function setPixel(buf, x, y, rgb, a) {
  const i = (y * WIDTH + x) * 4
  buf[i] = rgb[0]
  buf[i + 1] = rgb[1]
  buf[i + 2] = rgb[2]
  buf[i + 3] = a
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function rect(buf, x, y, w, h, rgb, alpha, filled = false) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= WIDTH || yy >= HEIGHT) continue
      const edge = xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1
      if (!filled && !edge) continue
      blend(buf, xx, yy, rgb, alpha)
    }
  }
}

function blend(buf, x, y, rgb, alpha) {
  const i = (y * WIDTH + x) * 4
  buf[i] = Math.round(buf[i] + (rgb[0] - buf[i]) * alpha)
  buf[i + 1] = Math.round(buf[i + 1] + (rgb[1] - buf[i + 1]) * alpha)
  buf[i + 2] = Math.round(buf[i + 2] + (rgb[2] - buf[i + 2]) * alpha)
  buf[i + 3] = 255
}

/** Box-samples the source so downscaling does not alias the logo edges. */
function drawScaled(buf, img, dx, dy, dw, dh) {
  const sxStep = img.width / dw
  const syStep = img.height / dh

  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const sx0 = Math.floor(x * sxStep)
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sxStep))
      const sy0 = Math.floor(y * syStep)
      const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * syStep))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0

      for (let sy = sy0; sy < sy1 && sy < img.height; sy += 1) {
        for (let sx = sx0; sx < sx1 && sx < img.width; sx += 1) {
          const i = (sy * img.width + sx) * 4
          const alpha = img.data[i + 3] / 255
          r += img.data[i] * alpha
          g += img.data[i + 1] * alpha
          b += img.data[i + 2] * alpha
          a += alpha
          n += 1
        }
      }

      if (n === 0 || a === 0) continue

      const coverage = a / n
      blend(buf, dx + x, dy + y, [r / a, g / a, b / a], coverage)
    }
  }
}

// --- PNG -------------------------------------------------------------------

function decodePng(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('lri-mun-logo.png is not a PNG')
  }

  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  const interlace = buf[28]

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `Expected 8-bit RGBA non-interlaced PNG, got bitDepth=${bitDepth} ` +
        `colorType=${colorType} interlace=${interlace}. Re-export the logo as RGBA PNG.`,
    )
  }

  const idat = []
  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.slice(off + 4, off + 8).toString('ascii')
    if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len))
    off += 12 + len
  }

  const raw = inflateSync(Buffer.concat(idat))
  const data = new Uint8Array(width * height * 4)
  const stride = width * 4

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)

    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? data[y * stride + x - 4] : 0
      const b = y > 0 ? data[(y - 1) * stride + x] : 0
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0

      let value = line[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) value += paeth(a, b, c)

      data[y * stride + x] = value & 0xff
    }
  }

  return { width, height, data }
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function encodePng(pixels, width, height) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([len, body, crc])
}

function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }

  let c = -1
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}
