// Key each painted VFX element off its magenta plate, trim to its alpha
// bounding box, and pack all of them into ONE sheet — because a Pixi
// ParticleContainer draws every particle from one texture source.
//
// Run from web/ so sharp resolves:  node <this> <fxDir> <outSheet> <outContact>
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const [fxDir, outSheet, outContact] = process.argv.slice(2)
const NAMES = ['fx-flame', 'fx-ember', 'fx-ice', 'fx-frost', 'fx-ward', 'fx-smoke', 'fx-spark', 'fx-splash', 'fx-flash', 'fx-fireball']
const CELL = 128
const COLS = 4

async function key(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels
  // Plate colour from the four corners (the plate drifts off pure magenta).
  let cr = 0, cg = 0, cb = 0, n = 0
  for (const [cx, cy] of [[8, 8], [W - 33, 8], [8, H - 33], [W - 33, H - 33]]) {
    for (let dy = 0; dy < 24; dy++) for (let dx = 0; dx < 24; dx++) {
      const i = ((cy + dy) * W + (cx + dx)) * C
      cr += data[i]; cg += data[i + 1]; cb += data[i + 2]; n++
    }
  }
  cr /= n; cg /= n; cb /= n
  const NEAR = 34, FAR = 95
  const magenta = cr > cg && cb > cg
  for (let i = 0; i < data.length; i += C) {
    const d = Math.hypot(data[i] - cr, data[i + 1] - cg, data[i + 2] - cb)
    if (d < NEAR) { data[i + 3] = 0; continue }
    if (d < FAR) data[i + 3] = Math.round(data[i + 3] * ((d - NEAR) / (FAR - NEAR)))
    if (magenta) {
      const m = Math.min(data[i], data[i + 2]) - data[i + 1]
      if (m > 0) { data[i] = Math.max(0, data[i] - m * 0.7); data[i + 2] = Math.max(0, data[i + 2] - m * 0.7) }
    }
  }
  // Alpha bounding box, computed by hand: sharp.trim() keys on a corner
  // COLOUR and transparent pixels still carry RGB, so it finds nothing.
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) throw new Error(`${src}: keyed to nothing`)
  const pad = 4
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad)
  const cut = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(CELL - 8, CELL - 8, { fit: 'inside', withoutEnlargement: false })
    .png().toBuffer()
  const m = await sharp(cut).metadata()
  return { buf: cut, w: m.width, h: m.height, plate: [cr, cg, cb].map(v => Math.round(v)) }
}

const cells = []
const frames = {}
for (let i = 0; i < NAMES.length; i++) {
  const src = path.join(fxDir, 'raw', `${NAMES[i]}.png`)
  if (!fs.existsSync(src)) { console.log('missing', NAMES[i]); continue }
  const k = await key(src)
  const col = i % COLS, row = Math.floor(i / COLS)
  // Centred in its cell, and the frame recorded as the CELL, so anchors are
  // 0.5/0.5 for every element regardless of its own aspect.
  const left = col * CELL + Math.floor((CELL - k.w) / 2)
  const top = row * CELL + Math.floor((CELL - k.h) / 2)
  cells.push({ input: k.buf, left, top })
  frames[NAMES[i]] = [col * CELL, row * CELL, CELL, CELL]
  console.log(NAMES[i].padEnd(10), `${k.w}x${k.h}`, `plate(${k.plate.join(',')})`)
}
const ROWS = Math.ceil(NAMES.length / COLS)
const sheet = sharp({ create: { width: COLS * CELL, height: ROWS * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(cells)
await sheet.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(outSheet)

// Contact sheet on a checker so the cutouts can be judged by eye.
const checkSvg = `<svg width="${COLS * CELL}" height="${ROWS * CELL}" xmlns="http://www.w3.org/2000/svg">
<defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse">
<rect width="8" height="8" fill="#2a2a2e"/><rect x="8" y="8" width="8" height="8" fill="#2a2a2e"/>
<rect x="8" width="8" height="8" fill="#3a3a40"/><rect y="8" width="8" height="8" fill="#3a3a40"/></pattern></defs>
<rect width="100%" height="100%" fill="url(#c)"/></svg>`
await sharp(Buffer.from(checkSvg)).composite([{ input: await sheet.clone().png().toBuffer(), left: 0, top: 0 }]).png().toFile(outContact)
const st = fs.statSync(outSheet)
console.log('sheet', `${COLS * CELL}x${ROWS * CELL}`, `${(st.size / 1024).toFixed(0)} KB`)
console.log('FRAMES =', JSON.stringify(frames))
