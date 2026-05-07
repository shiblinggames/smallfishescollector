// Normalizes fishing character sprites onto a shared canvas.
// Each crop is anchored so the boat bottom (lowest opaque pixel row)
// lands at the same Y coordinate on the canvas.
//
// Usage:
//   node normalize-fishing-sprites.mjs                   (default variant from newfishing4.png)
//   node normalize-fishing-sprites.mjs gray              (gray variant from newfishinggray.png)
//   node normalize-fishing-sprites.mjs coral             (coral variant from newfishingcoral.png)

import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'public')

const variant = process.argv[2] ?? 'default'
const srcFile = variant === 'default' ? 'newfishing4.png' : `newfishing${variant}.png`
const SRC = path.join(__dirname, 'public', srcFile)
const prefix = variant === 'default' ? 'fishing' : `fishing_${variant}`

const CROPS = [
  { pose: 'rest', left: 218, top: 1,   width: 674, height: 482 },
  { pose: 'wait', left: 115, top: 613,  width: 807, height: 438 },
  { pose: 'cast', left: 1011,top: 150,  width: 794, height: 713 },
]

const CANVAS_W = 900
const CANVAS_H = 800
const BOAT_BOTTOM_Y = 780

async function findLowestOpaqueRow(buf, width, height) {
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (buf[(y * width + x) * 4 + 3] > 10) return y
    }
  }
  return height - 1
}

async function run() {
  console.log(`Slicing variant "${variant}" from ${srcFile}...`)
  for (const crop of CROPS) {
    const { data: buf, info } = await sharp(SRC)
      .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const boatBottom = await findLowestOpaqueRow(buf, info.width, info.height)
    const topOnCanvas  = BOAT_BOTTOM_Y - boatBottom
    const leftOnCanvas = Math.round((CANVAS_W - crop.width) / 2)

    const outName = `${prefix}_${crop.pose}.png`
    await sharp({
      create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: buf, raw: { width: info.width, height: info.height, channels: 4 }, left: leftOnCanvas, top: topOnCanvas }])
      .png()
      .toFile(path.join(OUT, outName))

    console.log(`  ✓ ${outName}  (boat bottom=${boatBottom}, top=${topOnCanvas})`)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
