// Ship sprites -> public/ship-hero/, sized for the Ship Management hero.
//
// THE PROBLEM. Every hull is drawn on a 600x335 canvas, but the hull itself
// occupies wildly different fractions of it and sits nowhere near the middle:
//
//   rowboat      238x147  fills 40% x 44%   margins L177 R185 T70  B118
//   brigantine   312x249  fills 52% x 74%   margins L153 R135 T38  B48
//   man-o-war    391x306  fills 65% x 91%   margins L70  R139 T9   B20
//
// object-fit: contain fits the CANVAS, not the subject, so a 230px box drew a
// rowboat about 92px wide, floating high and left of where you would expect.
// The screen looked like it had enormous padding because it did: the padding
// was inside the PNG.
//
// THE FIX. Trim each sprite to its alpha bounding box, then scale it so every
// hull comes out the SAME WIDTH. No canvas is added back: the file ends exactly
// where the hull ends, in both axes, so there is no padding left to fight. A
// wide rowboat is simply a shorter file than an upright sloop, and the layout
// under it shifts a few pixels rather than every hull carrying dead space to
// suit the tallest one.
//
// Uniform width, not original pixel size, because source resolution here is
// noise rather than signal: pitchblackhull.png draws its subject 895px wide and
// man-o-war_v2.png draws 391px, and they are the same tier-6 hull. Skins are
// per-tier sprite swaps, so preserving pixel size would have made putting a
// skin on your ship double its size on screen.
//
// Tier progression therefore does NOT live in the art any more. It is a scale
// table on the one component that wants it, which is also the only place it can
// be tuned without re-exporting 39 files.
//
// A PARALLEL DIRECTORY, not an overwrite. These same sprites are positioned by
// RaidCombat, the shipyard and the hub tiles, all of which were laid out
// against the original canvases. Re-canvassing in place would silently resize
// every enemy ship in a fight. Same reason public/fish-tile/ exists alongside
// public/fish/.
//
//   node normalize-ships.mjs

import sharp from 'sharp'
import { readFileSync, mkdirSync, readdirSync } from 'fs'
import path from 'path'

const OUT = 'public/ship-hero'
// The width every hull is exported at. Generous: this is the biggest the hero
// ever draws a ship, and downscaling in the browser is free, upscaling is not.
const WIDTH = 620

// Every sprite the ship hero can show: the seven hulls plus every skin variant.
// Read out of the source of truth rather than listed here, so a new skin is
// picked up by re-running instead of by remembering to edit this file.
const srcs = new Set()
for (const f of ['lib/ships.ts', 'lib/shipSkins.ts']) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/'(\/[^']*\.png)'/g)) srcs.add(m[1])
}

const files = [...srcs]
  .map(p => ({ src: p, disk: path.join('public', p.replace(/^\//, '')) }))
  .filter(f => {
    try { readFileSync(f.disk); return true } catch { return false }
  })

/** Tightest box containing any pixel above a low alpha threshold. sharp's own
 *  trim() keys off the corner COLOUR and leaves a soft glow behind, so the
 *  bounds are measured off the raw alpha channel instead. */
async function alphaBox(disk) {
  const { data, info } = await sharp(disk).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 8) {
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

const boxes = []
for (const f of files) {
  const box = await alphaBox(f.disk)
  if (box) boxes.push({ ...f, box })
}

console.log(`every hull exported at ${WIDTH}px wide, height following its own aspect\n`)

mkdirSync(OUT, { recursive: true })

for (const { src, disk, box } of boxes) {
  // Two awaits, never a chained .extract().trim(): sharp applies chained ops
  // against the ORIGINAL image, so the second one silently ignores the first.
  const cropped = await sharp(disk).extract(box).png().toBuffer()
  const out = path.join(OUT, path.basename(disk))
  await sharp(cropped)
    .resize({ width: WIDTH })
    // Palette-quantised. These are flat-shaded hulls on transparency, so 8-bit
    // is visually lossless here and roughly quarters the set on disk.
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(out)

  const h = Math.round(box.height * (WIDTH / box.width))
  console.log(`${path.basename(disk).padEnd(30)} ${String(box.width).padStart(3)}x${String(box.height).padStart(3)} -> ${WIDTH}x${h}`)
}

console.log(`\n${boxes.length} sprites -> ${OUT}/`)
console.log(readdirSync(OUT).length, 'files written')
