// Trim every ship-skin PREVIEW sprite to the pixels the ship actually occupies.
//
// The sprites are combat art: a ship drawn small and off-centre on a wide
// transparent canvas, which is fine at 230px on a boss portrait and wrong in a
// 60px drop tile. Measured on the six that drop from bosses, the ship fills
// only 52-66% of the canvas width and sits up to 5.8% left of its middle. Since
// object-fit: contain fits the CANVAS and not the subject, the tile centred the
// empty rectangle: the hull rendered small and visibly off to one side of the
// name underneath it.
//
// Writes trimmed copies to public/hull-drop/ rather than touching the originals,
// which are still the enemy ships in raid combat and the previews on the skin
// shelf. Both those places want the canvas; only the drop tile wants the ship.
//
//   node trim-hull-drops.mjs
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const OUT = 'public/hull-drop'
// Height the tile draws at, doubled for retina. Trimming alone would leave a
// 1376px sprite behind a 60px tile.
const MAX_H = 140

const srcs = [
  '/enemy_finnship.png',
  '/enemychapter1brigantine_v2.png',
  '/enemychapter2brigantine_v2.png',
  '/enemychapter3brigantine.png',
  '/enemychapter4brigantine.png',
  '/tundrahull.png',
  '/volcanichull.png',
]

/** The alpha bounding box. sharp's own .trim() keys off a background colour and
 *  leaves these alone, so measure the alpha channel directly. */
async function alphaBox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  let minX = W, maxX = -1, minY = H, maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > 12) {
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

fs.mkdirSync(OUT, { recursive: true })

for (const src of srcs) {
  const inPath = path.join('public', src.replace(/^\//, ''))
  if (!fs.existsSync(inPath)) { console.log('MISSING', inPath); continue }
  // Read to a Buffer FIRST — sharp holds the file open otherwise, and on Windows
  // a later write to the same directory can fail behind that lock.
  const buf = fs.readFileSync(inPath)
  const box = await alphaBox(buf)
  if (!box) { console.log('EMPTY  ', inPath); continue }

  const outPath = path.join(OUT, path.basename(inPath))
  // extract then resize as two awaits: chaining them on one pipeline has bitten
  // this repo before.
  const cropped = await sharp(buf).extract(box).toBuffer()
  await sharp(cropped)
    .resize({ height: Math.min(MAX_H, box.height), withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(outPath)

  const before = fs.statSync(inPath).size
  const after = fs.statSync(outPath).size
  const meta = await sharp(fs.readFileSync(outPath)).metadata()
  console.log(
    path.basename(inPath).padEnd(32),
    `${box.width}x${box.height} -> ${meta.width}x${meta.height}`.padEnd(24),
    `${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`,
  )
}
