/**
 * SLICE THE INTERIOR SHELLS.
 *
 *   node slice-rooms.mjs <rooms.png>
 *
 * Five empty rooms out of a 2x3 sheet, shallow to grand:
 *   room-leanto, room-cottage, room-longhouse, room-hall, room-estate
 *
 * NO CHROMA-KEY and NO TRIM, unlike every other slicer here. These are full
 * bleed backgrounds rather than objects on a plate — there is nothing to key
 * out and nothing to trim to, and running either would eat the room's own edges.
 *
 * Cut with a small inset because the sheet draws a hairline between cells.
 */
import sharp from 'sharp'

const src = process.argv[2]
if (!src) { console.error('usage: node slice-rooms.mjs <rooms.png>'); process.exit(1) }

const NAMES = ['room-leanto', 'room-cottage', 'room-longhouse', 'room-hall', 'room-estate']
const m = await sharp(src).metadata()
const cw = Math.floor(m.width / 2), ch = Math.floor(m.height / 3)
const inset = Math.round(Math.min(cw, ch) * 0.012)
console.log(`rooms ${m.width}x${m.height}  cells ${cw}x${ch}`)

for (let i = 0; i < NAMES.length; i++) {
  const col = i % 2, row = Math.floor(i / 2)
  const out = `public/sea/${NAMES[i]}.jpg`
  // JPEG, not PNG. These are full-bleed painted backgrounds with no alpha, and
  // five of them as PNG runs to several megabytes for no benefit.
  await sharp(src)
    .extract({
      left: col * cw + inset, top: row * ch + inset,
      width: cw - inset * 2, height: ch - inset * 2,
    })
    .resize({ width: 1100, withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(out)
  const f = await sharp(out).metadata()
  console.log(`  ${NAMES[i].padEnd(16)} ${f.width}x${f.height}`)
}
