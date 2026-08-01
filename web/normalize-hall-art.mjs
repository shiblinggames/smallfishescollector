// Normalize the Crew Hall's three art sets to one consistent frame.
//
// The pictures arrived from the generator with wildly different content-to-
// canvas ratios: stores_1 filled 100% of its 200x200 edge to edge, hall_4
// filled 47%. Dropped into the same fixed box that makes one look twice the
// size of another, and the ones touching the edge read as badly centred even
// though every single one measured dead centre horizontally.
//
// So: trim to the actual artwork, scale it to a fixed INSET, and re-centre it
// on a clean 200x200. Every tier now sits in the same frame with the same
// breathing room, and centring is exact rather than inherited from whatever
// the generator happened to leave in the alpha.
//
// Run from web/:  node normalize-hall-art.mjs [--apply]

import sharp from 'sharp'
import { readdirSync, mkdirSync, copyFileSync } from 'node:fs'

const CANVAS = 200
/** Longest edge of the artwork inside the canvas. 172 of 200 leaves a 14px
 *  margin, which is enough to lift the picture off the edge without shrinking
 *  it into a stamp. */
const INSET = 172

const APPLY = process.argv.includes('--apply')
const SRC = 'public/crew'
const TMP = '.hall-art-normalized'
mkdirSync(TMP, { recursive: true })

const files = readdirSync(SRC)
  .filter(f => /^(drill|stores|hall)_\d+\.png$/.test(f)).sort()

async function alphaBox(file) {
  const img = sharp(file)
  const { width, height } = await img.metadata()
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const ch = info.channels
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * ch + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} - inset ${INSET} on a ${CANVAS}px canvas\n`)
console.log('file            was          now         margin')

for (const f of files) {
  const src = `${SRC}/${f}`
  const b = await alphaBox(src)
  if (!b) { console.log(`${f.padEnd(14)} EMPTY, skipped`); continue }

  // Two separate awaits, never a chained .extract().trim(): chaining those in
  // a loop intermittently throws "bad extract area" (see the sharp gotcha note).
  const cropped = await sharp(src).extract(b).png().toBuffer()

  const scale = INSET / Math.max(b.width, b.height)
  const w = Math.max(1, Math.round(b.width * scale))
  const h = Math.max(1, Math.round(b.height * scale))
  const resized = await sharp(cropped).resize(w, h, { fit: 'fill' }).png().toBuffer()

  // Centred by construction. Odd leftovers go to the right/bottom, so the
  // worst possible offset is half a pixel.
  const left = Math.floor((CANVAS - w) / 2)
  const top = Math.floor((CANVAS - h) / 2)
  await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${TMP}/${f}`)

  console.log(
    `${f.padEnd(14)} ${String(`${b.width}x${b.height}`).padEnd(12)} ${String(`${w}x${h}`).padEnd(11)} ` +
    `${left}/${top}`,
  )
}

if (APPLY) {
  for (const f of files) copyFileSync(`${TMP}/${f}`, `${SRC}/${f}`)
  console.log(`\nwrote ${files.length} files into ${SRC}`)
} else {
  console.log(`\npreview only, files in ${TMP}/ - re-run with --apply`)
}
