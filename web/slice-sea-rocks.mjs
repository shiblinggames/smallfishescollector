/**
 * ── SLICE A CHROMA-KEYED ROCK SHEET INTO TRANSPARENT SPRITES ────────────────
 *
 * Kie hands back one square sheet with several objects laid out on flat magenta.
 * This keys the magenta out, finds each object, and writes it as its own
 * transparent PNG trimmed to its paint.
 *
 * IT FINDS THE OBJECTS RATHER THAN ASSUMING A GRID. Ask for a 2x2 and you get a
 * 2x2 most days and a 2x3 the rest, with the objects sitting wherever they fit;
 * a hardcoded grid quietly cuts one in half the first time that happens. Blobs
 * of connected paint cannot be wrong about how many things are on the sheet.
 *
 * Usage:
 *   node slice-sea-rocks.mjs <sheet.png> <out-prefix> [maxWidth]
 *
 * Writes public/sea/<prefix>-1.png, -2.png, … in reading order.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const [, , sheetPath, prefix, maxWArg] = process.argv
if (!sheetPath || !prefix) {
  console.error('usage: node slice-sea-rocks.mjs <sheet.png> <out-prefix> [maxWidth]')
  process.exit(1)
}
const MAX_W = Number(maxWArg ?? 620)

/** Magenta, generously. The shadows the model paints onto the background are
 *  DARK magenta, not the key colour, so an exact match leaves a purple puddle
 *  under every rock. What is actually true of all of it is that red and blue
 *  both run well ahead of green. */
const isKey = (r, g, b) => r > 60 && b > 60 && r > g * 1.30 && b > g * 1.30

const src = sharp(sheetPath)
const { width: W, height: H } = await src.metadata()
const raw = await src.ensureAlpha().raw().toBuffer()

// ── 1. KEY, AND DESPILL ────────────────────────────────────────────────────
// Anything kept that still leans magenta gets its red and blue pulled back
// toward green, which kills the pink fringe a soft painted edge leaves behind.
const mask = new Uint8Array(W * H)
for (let i = 0, p = 0; i < raw.length; i += 4, p++) {
  const r = raw[i], g = raw[i + 1], b = raw[i + 2]
  if (isKey(r, g, b)) { raw[i + 3] = 0; continue }
  mask[p] = 1
  const m = (r + b) / 2
  if (m > g + 8) {
    const k = Math.min(1, (m - g) / 90) * 0.55
    raw[i] = r * (1 - k) + g * k
    raw[i + 2] = b * (1 - k) + g * k
  }
}

// ── 2. FIND THE OBJECTS ────────────────────────────────────────────────────
// Flood fill on a coarse grid: full resolution would be four million cells for
// a question about roughly where four things are, and a coarse pass also bridges
// the one-pixel gaps a soft edge leaves inside a single object.
const S = 8
const CW = Math.ceil(W / S), CH = Math.ceil(H / S)
const cell = new Uint8Array(CW * CH)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (mask[y * W + x]) cell[Math.floor(y / S) * CW + Math.floor(x / S)] = 1
  }
}

const seen = new Uint8Array(CW * CH)
const boxes = []
for (let cy = 0; cy < CH; cy++) {
  for (let cx = 0; cx < CW; cx++) {
    const start = cy * CW + cx
    if (!cell[start] || seen[start]) continue
    let lo = 0
    const q = [start]
    seen[start] = 1
    let x0 = cx, x1 = cx, y0 = cy, y1 = cy, n = 0
    while (lo < q.length) {
      const c = q[lo++]
      const x = c % CW, y = (c - x) / CW
      n++
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue
        const k = ny * CW + nx
        if (cell[k] && !seen[k]) { seen[k] = 1; q.push(k) }
      }
    }
    // A whole sheet is a few percent of its own area per object; anything under
    // a fifth of a percent is a speck of spill, not a rock.
    if (n * S * S < W * H * 0.002) continue
    boxes.push({ x0, y0, x1, y1, n })
  }
}

// Reading order: rows first, then left to right inside a row.
boxes.sort((a, b) => (a.y0 - b.y0 > CH * 0.12 ? 1 : b.y0 - a.y0 > CH * 0.12 ? -1 : a.x0 - b.x0))

console.log(`${path.basename(sheetPath)}: ${W}x${H}, ${boxes.length} object(s)`)

const outDir = path.join('public', 'sea')
await mkdir(outDir, { recursive: true })

const keyed = await sharp(raw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()

let i = 0
for (const b of boxes) {
  const PAD = 2
  const left = Math.max(0, b.x0 * S - PAD * S)
  const top = Math.max(0, b.y0 * S - PAD * S)
  const w = Math.min(W - left, (b.x1 - b.x0 + 1 + PAD * 2) * S)
  const h = Math.min(H - top, (b.y1 - b.y0 + 1 + PAD * 2) * S)

  // TWO AWAITS, NOT A CHAIN. sharp resolves a chained .extract().trim() against
  // the ORIGINAL image, so the trim silently undoes the crop and every sprite
  // comes out as the whole sheet. This has bitten this repo before.
  const cut = await sharp(keyed).extract({ left, top, width: w, height: h }).png().toBuffer()
  const trimmed = await sharp(cut).trim({ threshold: 1 }).png().toBuffer()

  const meta = await sharp(trimmed).metadata()
  const out = path.join(outDir, `${prefix}-${++i}.png`)
  await sharp(trimmed)
    .resize({ width: Math.min(MAX_W, meta.width), withoutEnlargement: true })
    .png({ quality: 90, compressionLevel: 9, palette: true })
    .toFile(out)
  const fin = await sharp(out).metadata()
  console.log(`  ${path.basename(out).padEnd(22)} ${fin.width}x${fin.height}`
    + `  ratio ${(fin.width / fin.height).toFixed(2)}`)
}
