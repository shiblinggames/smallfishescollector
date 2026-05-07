// Normalizes the three fishing character sprites onto a shared canvas so
// they appear the same size when rendered at the same CSS width%.
// Each crop is bottom-anchored and horizontally centered within the canvas.
//
// Source crops from newfishing.png (1920x1080):
//   rest: left=218, top=1,   w=674, h=482
//   wait: left=115, top=613, w=807, h=438
//   cast: left=1011,top=150, w=794, h=713
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

// Canvas size: wider than widest crop, taller than tallest crop
const CANVAS_W = 850
const CANVAS_H = 750

async function run() {
  for (const crop of CROPS) {
    // Extract the crop from the source sheet as raw RGBA pixels
    const cropped = await sharp(SRC)
      .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Position: bottom-anchored, horizontally centered
    const left = Math.round((CANVAS_W - crop.width) / 2)
    const top  = CANVAS_H - crop.height

    // Composite onto transparent canvas
    await sharp({
      create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: cropped.data, raw: cropped.info, left, top }])
      .png()
      .toFile(path.join(OUT, `${crop.name}.png`))

    console.log(`✓ ${crop.name}.png  (placed at ${left}, ${top} on ${CANVAS_W}×${CANVAS_H} canvas)`)
  }
}

run().catch(err => { console.error(err); process.exit(1) })
