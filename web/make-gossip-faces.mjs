/**
 * THE FACES IN THE TAVERN.
 *
 * The overheard lines want a portrait beside them, and the fish plates are the
 * only cast of characters this game has enough of. They are also 1024px and
 * about 140KB each, which is a fine size for a catch card and an absurd one for
 * a 36px disc: six of them would be the better part of a megabyte of decoration
 * on a page nobody came to look at pictures on.
 *
 * So a curated two dozen get a small copy. The pool is deliberately SHORT and
 * fixed rather than "any of the 154": a handful of recurring faces reads as
 * regulars in a room, a different fish every time reads as a slot machine, and
 * a small pool caches after the first visit.
 *
 *   node make-gossip-faces.mjs
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const OUT = 'public/fish/face'
/** 96, for a disc drawn at 34 to 40. Twice the biggest draw covers retina and
 *  nothing more. */
const SIZE = 96

// Chosen for silhouette at thumbnail size and for having a FACE: round heads,
// obvious eyes, and a couple of grotesques, because a tavern needs a few.
const CAST = [
  'anglerfish', 'blobfish', 'pufferfish', 'seahorse',
  'clownfish', 'lionfish', 'hammerhead-shark', 'moray-eel',
  'ocean-sunfish', 'sheepshead', 'mudskipper', 'triggerfish',
  'viperfish', 'dumbo-octopus', 'vampire-squid', 'blue-tang',
  'flounder', 'bluegill', 'largemouth-bass', 'red-snapper',
  'grouper', 'barracuda', 'pumpkinseed', 'yeti-crab',
]

await mkdir(OUT, { recursive: true })
for (const id of CAST) {
  // Two awaited steps: chaining .trim() into another op in one pipeline makes
  // the trim silently misapply. A sharp trap this repo has hit before.
  const trimmed = await sharp(`public/fish/${id}.png`).trim({ threshold: 8 }).png().toBuffer()
  await sharp(trimmed)
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${id}.png`)
}
console.log(`${CAST.length} faces at ${SIZE}px in ${OUT}`)
