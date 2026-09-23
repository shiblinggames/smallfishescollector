// ── KIE ART INTO SEA ART ────────────────────────────────────────────────────
//
// Raw Nano Banana paintings on a flat magenta plate, in; the chart's own
// formats, out. Run from web/ so sharp resolves:
//
//   node scripts/process-sea-art.mjs <rawDir> <outDir> <reportJson> <contactPng>
//
// For every raw PNG:
//   1. KEY the magenta. m = min(r, b) - g. Nano Banana paints the plate with a
//      gradient, so the washed corner reads m ~ 52 and a high threshold keeps
//      the whole plate: HARD 35 / SOFT 8, and despill r and b by 0.7 m.
//   2. TRIM to the alpha bounding box ourselves; sharp.trim() keys on a corner
//      colour and finds nothing once the plate is transparent.
//   3. bay-*  -> 1024 wide WebP, the island plates (lib/islandPlates). Reports
//      each one's aspect (height over width) for the plate table.
//      mark-* -> a 320 square PNG, object bottom-centred with its foot near the
//      bottom edge, like the landmarks already on the chart. Reports a
//      MEASURED waterline (SUBMERGE) and footprint capsule (ART_COLLIDERS), both
//      starting points for the /sea/waterline and /sea/boundary benches.
//   4. A contact sheet on a checker, to look at before anything ships.
import sharp from 'sharp'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [rawDir, outDir, reportPath, contactPath] = process.argv.slice(2)
if (!contactPath) { console.error('usage: rawDir outDir report.json contact.png'); process.exit(1) }

const HARD = 35, SOFT = 8
async function keyed(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const r = data[o], g = data[o + 1], b = data[o + 2]
    const m = Math.min(r, b) - g
    let a = 255
    if (m > HARD) a = 0
    else if (m > SOFT) a = Math.round(255 * (1 - (m - SOFT) / (HARD - SOFT)))
    if (m > 0) {
      data[o] = Math.max(0, r - 0.7 * m)
      data[o + 2] = Math.max(0, b - 0.7 * m)
    }
    data[o + 3] = Math.min(data[o + 3], a)
    if (data[o + 3] > 8) {
      const x = i % w, y = (i / w) | 0
      if (x < x0) x0 = x; if (x > x1) x1 = x
      if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  const img = sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
  return { img: sharp(await img.png().toBuffer()), bw: x1 - x0 + 1, bh: y1 - y0 + 1 }
}

/** Alpha of a finished RGBA square, for measuring. */
async function alphaOf(buf, size) {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return (x, y) => data[(y * size + x) * 4 + 3]
}

const report = { plates: {}, marks: {} }
const tiles = []
const files = (await readdir(rawDir)).filter(f => f.endsWith('.png')).sort()
for (const f of files) {
  const name = f.replace(/\.png$/, '')
  const { img, bw, bh } = await keyed(path.join(rawDir, f))
  if (name.startsWith('bay-')) {
    const W = 1024
    const H = Math.round(bh * (W / bw))
    const buf = await img.resize(W, H).webp({ quality: 84, alphaQuality: 90 }).toBuffer()
    await writeFile(path.join(outDir, `${name}.webp`), buf)
    report.plates[name] = { aspect: +(H / W).toFixed(3), kb: Math.round(buf.length / 1024) }
    tiles.push(await sharp(buf).resize(360, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())
  } else if (name.startsWith('mark-')) {
    const S = 320, BOX = 296
    const k = Math.min(BOX / bw, BOX / bh)
    const w = Math.round(bw * k), h = Math.round(bh * k)
    const obj = await img.resize(w, h).png().toBuffer()
    // Foot near the bottom edge, as the existing landmarks sit.
    const top = S - 10 - h
    const left = Math.round((S - w) / 2)
    const buf = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: obj, left, top }]).png({ compressionLevel: 9, palette: false }).toBuffer()
    const kind = name.replace(/^mark-/, '')
    await writeFile(path.join(outDir, `${kind}.png`), buf)
    // THE WATERLINE: at five columns, the lowest opaque row, lifted 5% so the
    // base dissolves rather than sitting on the line.
    const a = await alphaOf(buf, S)
    const pts = []
    for (const px of [0, 25, 50, 75, 100]) {
      const cx = Math.min(S - 1, Math.max(0, Math.round(left + (w - 1) * px / 100)))
      let low = -1
      for (let y = S - 1; y >= 0; y--) {
        let hit = false
        for (let dx = -4; dx <= 4 && !hit; dx++) { const xx = cx + dx; if (xx >= 0 && xx < S && a(xx, y) > 40) hit = true }
        if (hit) { low = y; break }
      }
      const yPct = low < 0 ? 90 : Math.max(40, (low / S) * 100 - 5)
      pts.push([px, +yPct.toFixed(1)])
    }
    // The waterline runs edge to edge of the SPRITE, not the object.
    pts[0][0] = 0; pts[pts.length - 1][0] = 100
    // THE FOOTPRINT: the widest opaque run in the band just above the
    // waterline's middle, as one capsule.
    const midY = Math.round((pts[2][1] / 100) * S) - 6
    let fx0 = S, fx1 = -1
    for (let y = midY - 8; y <= midY; y++) for (let x = 0; x < S; x++) if (a(x, y) > 60) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x }
    if (fx1 < 0) { fx0 = left; fx1 = left + w }
    const ay = +(midY / S).toFixed(3)
    report.marks[kind] = {
      submerge: { keep: 0.24, pts },
      collider: { aspect: 1, shapes: [{ kind: 'capsule', ax: +((fx0 + 10) / S).toFixed(3), ay, bx: +((fx1 - 10) / S).toFixed(3), by: ay, ar: 0.1 }] },
      kb: Math.round(buf.length / 1024),
    }
    tiles.push(await sharp(buf).resize(240, 240).png().toBuffer())
  }
}
await writeFile(reportPath, JSON.stringify(report, null, 2))

// THE CONTACT SHEET, on a checker so the keying shows.
const cols = 5, cw = 360, ch = 250
const rows = Math.ceil(tiles.length / cols)
const W = cols * cw, H = rows * ch
const checker = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = ((x >> 4) + (y >> 4)) % 2 ? 58 : 38
  const o = (y * W + x) * 3; checker[o] = v; checker[o + 1] = v + 14; checker[o + 2] = v + 24
}
await sharp(checker, { raw: { width: W, height: H, channels: 3 } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * cw, top: Math.floor(i / cols) * ch })))
  .png().toFile(contactPath)
console.log(JSON.stringify({ plates: Object.keys(report.plates).length, marks: Object.keys(report.marks).length }))
