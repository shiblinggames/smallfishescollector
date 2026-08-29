// ── CUT A TOWN OFF ONE SHEET ────────────────────────────────────────────────
//
// The island buildings are generated NINE AT A TIME on a single magenta sheet,
// not one per call, and that is the whole point of this script existing. A
// camera angle does not survive being asked for nine separate times: the set
// this replaced had two buildings mirrored, one at flat elevation and two
// nearly top-down, because each was its own generation. Inside one image the
// camera holds. So the pipeline is: one sheet, then cut it up here.
//
// WHY NOT AN EVEN 3x3 GRID. The obvious slicer divides the sheet into nine
// equal cells. It does not work: the buildings are painted where they fit
// rather than centred in a grid, and the raid pier is wide enough to start in
// the first column and finish in the second. Equal cells cut it in half.
//
// So the buildings are FOUND instead of assumed. Everything that is not magenta
// is object, the object pixels are labelled into connected blobs, and blobs
// that sit close together are merged back into one building — because a hanging
// tavern sign and a drying rack of nets are painted detached from the wall they
// belong to and are still part of that building.
//
// Usage:  node slice-buildings.mjs <sheet.png> [outdir]
//
// The names below are in the sheet's own reading order, which the prompt fixes.
// If the count comes out wrong the script says so and writes a debug sheet
// rather than guessing, because a silently mis-cut town is worse than no town.

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const SHEET = process.argv[2]
const OUT = process.argv[3] || 'public/sea'

if (!SHEET || !fs.existsSync(SHEET)) {
  console.error('usage: node slice-buildings.mjs <sheet.png> [outdir]')
  process.exit(1)
}

/** Reading order, left to right then top to bottom. Fixed by the prompt. */
const NAMES = [
  'tavern', 'market', 'tackle',
  'harbour', 'shipyard', 'trawl-shed',
  'lighthouse', 'dock-raids', 'dock-voyages',
]

/** How far off pure magenta a pixel may be and still count as background. */
const KEY_TOLERANCE = 110
/** Blobs smaller than this share of the sheet are speckle, not architecture. */
const MIN_BLOB = 0.0004
/** Blobs whose boxes come within this share of the sheet width are one
 *  building — the sign on its bracket, the net rack beside the shed. */
const MERGE_GAP = 0.035
/** Every sprite is written at this width. The old set was 320; the homestead
 *  set is 512, and the chart scales everything anyway, so match the better one. */
const OUT_W = 512

const dist = (r, g, b) => Math.hypot(r - 255, g - 0, b - 255)

const src = sharp(SHEET)
const meta = await src.metadata()
const W = meta.width
const H = meta.height
console.log(`sheet ${W}x${H}`)

// ── THE MASK, at a working size ───────────────────────────────────────────
// Component labelling on 16 megapixels is pointless: a building is thousands of
// pixels across and the blobs are found just as well at a fraction of that.
const MW = 640
const MH = Math.round((H / W) * MW)
const { data: small } = await sharp(SHEET)
  .resize(MW, MH, { fit: 'fill' })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const isObj = new Uint8Array(MW * MH)
for (let i = 0; i < MW * MH; i++) {
  const r = small[i * 3], g = small[i * 3 + 1], b = small[i * 3 + 2]
  isObj[i] = dist(r, g, b) > KEY_TOLERANCE ? 1 : 0
}

// ── LABEL, iteratively. A recursive flood fill blows the stack on a blob this
// big; an explicit stack does not.
const seen = new Uint8Array(MW * MH)
let boxes = []
for (let y = 0; y < MH; y++) {
  for (let x = 0; x < MW; x++) {
    const s = y * MW + x
    if (!isObj[s] || seen[s]) continue
    let x0 = x, x1 = x, y0 = y, y1 = y, n = 0
    const stack = [s]
    seen[s] = 1
    while (stack.length) {
      const p = stack.pop()
      const px = p % MW, py = (p / MW) | 0
      n++
      if (px < x0) x0 = px; if (px > x1) x1 = px
      if (py < y0) y0 = py; if (py > y1) y1 = py
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy
          if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue
          const q = ny * MW + nx
          if (isObj[q] && !seen[q]) { seen[q] = 1; stack.push(q) }
        }
      }
    }
    if (n / (MW * MH) >= MIN_BLOB) boxes.push({ x0, y0, x1, y1 })
  }
}
console.log(`blobs found: ${boxes.length}`)

// ── MERGE what belongs together, AND ONLY AS FAR AS NEEDED ────────────────
//
// A hanging sign or a detached net rack comes out as its own blob and has to be
// folded back into the building it belongs to. But merging by "are these two
// boxes close" runs away: on a sheet of nine buildings laid out in a grid,
// every box is close to its neighbour, and one pass of that collapsed the whole
// town into a single box the size of the sheet.
//
// So the count is the stop condition. While there are more blobs than
// buildings, merge the CLOSEST remaining pair — never an arbitrary pair that
// happens to pass a threshold. Nine blobs and nine buildings means the sheet
// came out clean and nothing is merged at all, which is the usual case.
const sep = (a, b) => {
  const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1))
  const dy = Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1))
  return Math.hypot(dx, dy)
}
while (boxes.length > NAMES.length) {
  let best = null
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const d = sep(boxes[i], boxes[j])
      if (!best || d < best.d) best = { i, j, d }
    }
  }
  if (!best || best.d > MERGE_GAP * MW) break
  boxes[best.i] = {
    x0: Math.min(boxes[best.i].x0, boxes[best.j].x0), y0: Math.min(boxes[best.i].y0, boxes[best.j].y0),
    x1: Math.max(boxes[best.i].x1, boxes[best.j].x1), y1: Math.max(boxes[best.i].y1, boxes[best.j].y1),
  }
  boxes.splice(best.j, 1)
}
console.log(`after merge: ${boxes.length}`)

// ── READING ORDER. Rows first: anything whose vertical centres are within half
// a typical building height is the same row.
const cy = b => (b.y0 + b.y1) / 2
const medianH = [...boxes].map(b => b.y1 - b.y0).sort((a, b) => a - b)[boxes.length >> 1]
boxes.sort((a, b) => cy(a) - cy(b))
const rows = []
for (const b of boxes) {
  const row = rows.find(r => Math.abs(cy(r[0]) - cy(b)) < medianH * 0.6)
  if (row) row.push(b); else rows.push([b])
}
for (const r of rows) r.sort((a, b) => a.x0 - b.x0)
const ordered = rows.flat()

if (ordered.length !== NAMES.length) {
  console.error(`\nEXPECTED ${NAMES.length} buildings, FOUND ${ordered.length}.`)
  console.error('Not guessing. Tune KEY_TOLERANCE / MERGE_GAP, or fix the sheet.')
  console.error(ordered.map((b, i) => `  ${i}: ${b.x0},${b.y0} → ${b.x1},${b.y1}`).join('\n'))
  process.exit(1)
}

// ── CUT, KEY, TRIM, WRITE ─────────────────────────────────────────────────
const sx = W / MW, sy = H / MH
const pad = Math.round(MW * 0.004 * sx)

fs.mkdirSync(OUT, { recursive: true })

for (let i = 0; i < ordered.length; i++) {
  const b = ordered[i]
  const left = Math.max(0, Math.round(b.x0 * sx) - pad)
  const top = Math.max(0, Math.round(b.y0 * sy) - pad)
  const width = Math.min(W - left, Math.round((b.x1 - b.x0) * sx) + pad * 2)
  const height = Math.min(H - top, Math.round((b.y1 - b.y0) * sy) + pad * 2)

  // SPLIT INTO TWO AWAITS. Chaining .extract().trim() on one pipeline is a
  // known sharp trap in this repo — the second operation reads the ORIGINAL
  // image, not the extracted one, and you get a trim of the whole sheet.
  const cut = await sharp(SHEET).extract({ left, top, width, height }).raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info } = cut
  const px = info.width * info.height
  const rgba = Buffer.alloc(px * 4)
  for (let p = 0; p < px; p++) {
    const r = data[p * info.channels], g = data[p * info.channels + 1], bl = data[p * info.channels + 2]
    const d = dist(r, g, bl)
    // A hard cut leaves a magenta fringe on every soft painted edge, so the
    // alpha ramps across the last stretch of the key instead. Below that the
    // pixel keeps its colour and simply becomes see-through.
    let a = 255
    if (d <= KEY_TOLERANCE) a = 0
    else if (d < KEY_TOLERANCE * 1.7) a = Math.round(255 * (d - KEY_TOLERANCE) / (KEY_TOLERANCE * 0.7))
    // DESPILL. Magenta bleeds into the brushwork at the edges: where a pixel is
    // strongly red+blue and starved of green, pull the two ends down to the
    // green so the halo goes without touching genuinely purple paint.
    let rr = r, gg = g, bb = bl
    if (a > 0 && a < 255 && rr > gg && bb > gg) { rr = Math.min(rr, gg + 12); bb = Math.min(bb, gg + 12) }
    rgba[p * 4] = rr; rgba[p * 4 + 1] = gg; rgba[p * 4 + 2] = bb; rgba[p * 4 + 3] = a
  }

  const keyed = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer()

  // TRIMMED FLUSH, and this is not tidiness. A building is placed with
  // translate(-50%,-100%) off the BOTTOM EDGE of its sprite box, so any
  // transparent margin under the feet is the building hovering that far above
  // the island.
  const trimmed = await sharp(keyed).trim({ threshold: 1 }).toBuffer()

  const file = path.join(OUT, NAMES[i] + '.png')
  await sharp(trimmed)
    .resize({ width: OUT_W, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(file)

  const m = await sharp(file).metadata()
  console.log(`  ${NAMES[i].padEnd(13)} ${String(m.width).padStart(4)}x${String(m.height).padEnd(4)}  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`)
}

console.log('\ndone')
