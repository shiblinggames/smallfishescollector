// Normalizes the three fishing character sprites onto a shared canvas.
// Each crop is anchored so the boat bottom (lowest opaque pixel row)
// lands at the same Y coordinate on the canvas.
//
// Usage: node normalize-fishing-sprites.mjs

import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, 'public', 'newfishing.png')
const OUT = path.join(__dirname, 'public')

const CROPS = [
  { name: 'fishing_rest', left: 218, top: 1,   width: 674, height: 482 },
  { name: 'fishing_wait', left: 115, top: 613,  width: 807, height: 438 },
  { name: 'fishing_cast', left: 1011,top: 150,  width: 794, height: 713 },
]

const CANVAS_W = 900
const CANVAS_H = 800
const BOAT_BOTTOM_Y = 780  // where the boat bottom lands on every canvas

async function findLowestOpaqueRow(buf, width, height) {
  // buf is raw RGBA, 4 bytes per pixel
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const alpha = buf[(y * width + x) * 4 + 3]
      if (alpha > 10) return y
    }
  }
  return height - 1
}

async function run() {
  for (const crop of CROPS) {
    const { data: buf, info } = await sharp(SRC)
      .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const boatBottomInCrop = await findLowestOpaqueRow(buf, info.width, info.height)

    // Anchor: boat bottom in crop must land at BOAT_BOTTOM_Y on canvas
    const topOnCanvas = BOAT_BOTTOM_Y - boatBottomInCrop
    const leftOnCanvas = Math.round((CANVAS_W - crop.width) / 2)

    await sharp({
      create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: buf, raw: { width: info.width, height: info.height, channels: 4 }, left: leftOnCanvas, top: topOnCanvas }])
      .png()
      .toFile(path.join(OUT, `${crop.name}.png`))

    console.log(`✓ ${crop.name}.png  boat bottom row=${boatBottomInCrop}, placed top=${topOnCanvas} left=${leftOnCanvas}`)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
