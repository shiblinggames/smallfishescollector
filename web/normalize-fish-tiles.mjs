// Normalizes every species sprite in public/fish/ into a consistent square
// tile in public/fish-tile/, for grid views (the Bestiary).
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
//   node normalize-fish-tiles.mjs

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, 'public', 'fish')
const OUT = path.join(__dirname, 'public', 'fish-tile')

/** Output tile edge. 2x the largest place one is drawn (~64px in the species
 *  sheet header) with room to spare on a 3x display. */
const TILE = 192
/** Share of the tile the fish's LONG edge takes. The rest is breathing room,
 *  uniform across the set, which is the whole point. */
const FILL = 0.88

fs.mkdirSync(OUT, { recursive: true })

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png'))
let done = 0, failed = []

for (const f of files) {
  const src = path.join(SRC, f)
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
      .toFile(path.join(OUT, f))
    done++
  } catch (e) {
    failed.push(`${f}: ${e.message}`)
  }
}

console.log(`normalized ${done}/${files.length} -> public/fish-tile/ (${TILE}px, fish at ${Math.round(FILL * 100)}%)`)
if (failed.length) {
  console.log('FAILED:')
  for (const x of failed) console.log('  ' + x)
}
