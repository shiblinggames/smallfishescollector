// Normalizes sprites into consistent square tiles for GRID views (the
// Angler's Almanac): fish from public/fish/ -> public/fish-tile/, and the pet
// sprites -> public/pet-tile/.
//
// WHY THIS EXISTS. The sprites in public/fish/ were cut from many different
// sheets over a long time and they agree on nothing:
//
//   swordfish  1024x1031 canvas, fish fills 100% x  52%
//   blobfish    479x424  canvas, fish fills  81% x  47%
//   seahorse    675x1295 canvas, fish fills  81% x  87%
//
// Different canvas sizes, different canvas aspect ratios, and a different
// amount of baked-in transparent margin each. Drop those into one fixed box
// and every fish renders at a different apparent size, sitting at a different
// optical centre. No amount of object-fit fixes that, because object-fit
// honours the transparent padding: it is fitting the CANVAS, not the fish.
//
// So: trim each sprite to its actual pixels, scale the fish to a fixed
// fraction of the tile, and centre it on a square transparent canvas. Every
// output is TILE x TILE with the fish occupying the same share of it, so a
// grid of them lines up and reads as one set.
//
// The originals are left alone. The fishing screen, blackjack and the raid
// summons all position public/fish/ art in ways that depend on those exact
// canvases.
//
// The pets are the same story and worse: 1024x576 LANDSCAPE canvases holding a
// small upright animal that fills 22% to 42% of the width. Contained into a
// 76px box a parrot drew about 18x24, which is not art-forward, it is a stamp.
//
//   node normalize-tiles.mjs

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUB = path.join(__dirname, 'public')

/** Each set: where the sprites are, where the tiles go, and how to pick them. */
const SETS = [
  { name: 'fish', src: path.join(PUB, 'fish'), out: path.join(PUB, 'fish-tile'), pick: null },
  // The pets live loose in public/ rather than a folder, so the file list comes
  // from the registry itself. A seventh species needs no edit here.
  { name: 'pets', src: PUB, out: path.join(PUB, 'pet-tile'), pick: petFiles },
]

function petFiles() {
  const src = fs.readFileSync(path.join(__dirname, 'lib', 'pets.ts'), 'utf8')
  return [...src.matchAll(/restImageUrl:\s*'\/([^']+)'/g)].map(m => m[1])
}

/** Output tile edge. 2x the largest place one is drawn (~64px in the species
 *  sheet header) with room to spare on a 3x display. */
const TILE = 192
/** Share of the tile the fish's LONG edge takes. The rest is breathing room,
 *  uniform across the set, which is the whole point. */
const FILL = 0.88

for (const set of SETS) {
fs.mkdirSync(set.out, { recursive: true })

const files = set.pick ? set.pick() : fs.readdirSync(set.src).filter(f => f.endsWith('.png'))
let done = 0, failed = []

for (const f of files) {
  const src = path.join(set.src, f)
  try {
    // Two awaits, never a chained .extract().trim(): sharp resolves a chained
    // pair against the ORIGINAL image, not the intermediate.
    const trimmed = await sharp(src).trim({ threshold: 6 }).toBuffer()
    const m = await sharp(trimmed).metadata()

    const box = Math.round(TILE * FILL)
    const scale = box / Math.max(m.width, m.height)
    const w = Math.max(1, Math.round(m.width * scale))
    const h = Math.max(1, Math.round(m.height * scale))

    await sharp(trimmed)
      .resize(w, h, { fit: 'fill' })
      .extend({
        top: Math.floor((TILE - h) / 2),
        bottom: TILE - h - Math.floor((TILE - h) / 2),
        left: Math.floor((TILE - w) / 2),
        right: TILE - w - Math.floor((TILE - w) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(set.out, f))
    done++
  } catch (e) {
    failed.push(`${f}: ${e.message}`)
  }
}

console.log(`${set.name}: normalized ${done}/${files.length} -> ${set.out.split(/[\/]/).pop()}/ (${TILE}px, subject at ${Math.round(FILL * 100)}%)`)
if (failed.length) {
  console.log('FAILED:')
  for (const x of failed) console.log('  ' + x)
}
}
