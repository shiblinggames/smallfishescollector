/**
 * SLICE THE FURNISHINGS.
 *
 *   node slice-furnish.mjs <sheet.png> <cols> <rows> <name,name,...>
 *
 * ── WHY THIS IS NOT THE OTHER SLICER ────────────────────────────────────────
 *
 * The generator would not stop captioning these. Told plainly not to, told
 * again in the negative prompt, and reframed away from anything resembling a
 * catalogue page, it still wrote a name under every object in white text on the
 * magenta. White text does NOT key out — the key removes magenta, and a caption
 * is the one thing on the plate that is not magenta and not the subject.
 *
 * So the object is found rather than assumed. After keying, each cell is a tall
 * block of content (the object), a gap of nothing, and then a thin block of
 * nothing-but-text. Scanning rows from the top and stopping at the first real
 * gap lands exactly on the object and leaves the caption behind, whatever height
 * either of them happened to be.
 *
 * Harmless on a sheet with no captions: there is no second block, so the scan
 * runs to the bottom of the cell and nothing is lost.
 */
import sharp from 'sharp'
import { gridCells } from './chroma-key.mjs'

const [src, colsS, rowsS, namesS] = process.argv.slice(2)
if (!src || !namesS) {
  console.error('usage: node slice-furnish.mjs <sheet.png> <cols> <rows> <name,name,...>')
  process.exit(1)
}
const cols = Number(colsS), rows = Number(rowsS)
const NAMES = namesS.split(',')

/** Rows of the cell that hold any subject at all, as a boolean per row. */
function rowsWithInk(data, w, h) {
  const out = new Array(h).fill(false)
  for (let y = 0; y < h; y++) {
    let n = 0
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) { n++; if (n > 2) break }
    }
    out[y] = n > 2                    // 2px of stray fringe is not content
  }
  return out
}

const meta = await sharp(src).metadata()
const cells = gridCells(meta.width, meta.height, cols, rows, 0.008)
console.log(`${meta.width}x${meta.height}, ${cols}x${rows}`)

for (let i = 0; i < NAMES.length; i++) {
  const { data, info } = await sharp(src).extract(cells[i])
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  // Key the magenta, exactly as chroma-key.mjs does.
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2]
    const m = Math.min(r, b) - g
    if (m > 55) { data[p + 3] = 0; continue }
    if (m > 15) data[p + 3] = Math.round(data[p + 3] * (1 - (m - 15) / 40))
    if (m > 0) { data[p] = Math.max(0, r - m * 0.7); data[p + 2] = Math.max(0, b - m * 0.7) }
  }

  // Find the FIRST block of content and stop at the gap after it.
  const ink = rowsWithInk(data, info.width, info.height)
  let top = ink.indexOf(true)
  if (top < 0) { console.log(`  ${NAMES[i]} — empty cell, skipped`); continue }
  let bottom = top
  let gap = 0
  const GAP = Math.round(info.height * 0.035)     // a real gap, not a thin waist
  for (let y = top; y < info.height; y++) {
    if (ink[y]) { bottom = y; gap = 0 } else if (++gap > GAP) break
  }

  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: 0, top, width: info.width, height: bottom - top + 1 })
    .png().toBuffer()
  const trimmed = await sharp(keyed).trim({ threshold: 12 }).png().toBuffer()
  const t = await sharp(trimmed).metadata()
  const k = 480 / Math.max(t.width, t.height)
  await sharp(trimmed)
    .resize(Math.round(t.width * k), Math.round(t.height * k), { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(`public/sea/${NAMES[i]}.png`)
  const f = await sharp(`public/sea/${NAMES[i]}.png`).metadata()
  console.log(`  ${NAMES[i].padEnd(18)} ${f.width}x${f.height}   kept rows ${top}..${bottom} of ${info.height}`)
}
