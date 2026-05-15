import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

// Input: a 3-pose rod sheet PNG.
//   Top-left quadrant    = rest
//   Bottom-left quadrant = wait
//   Right half           = cast
//
// Output: <name>_rest.png, <name>_wait.png, <name>_cast.png alongside the
// source. Each is trimmed of fully transparent margins, then padded out
// to a FIXED canvas size per frame so every rod's output has identical
// dimensions. That means one set of position coordinates works for every
// rod — bamboo, yolo, millionaires, etc. — and decorations get visual
// breathing room (flames, sparkles, lightning, scopes) without changing
// where the rod handle lands on screen.

const rawArgs = argv.slice(2)
const files = rawArgs.filter(a => !a.startsWith('--'))

if (files.length === 0) {
  console.error('Usage: node slice-rod.mjs <rod_name.png> [more.png ...]')
  console.error('')
  console.error('Splits a 3-pose rod sheet into:')
  console.error('  <rod>_rest.png   (top-left quadrant)')
  console.error('  <rod>_wait.png   (bottom-left quadrant)')
  console.error('  <rod>_cast.png   (right half)')
  console.error('')
  console.error('Each output is trimmed of transparent margins, then padded')
  console.error('to a fixed per-frame canvas so every rod\'s sprite is the')
  console.error('same size and a single set of overlay coordinates works for')
  console.error('every rod.')
  console.error('')
  console.error('Run from the web/ directory.')
  console.error('')
  console.error('Example:')
  console.error('  node slice-rod.mjs public/rod_bamboo.png')
  exit(1)
}

// Fixed output canvas per frame. Dimensions are large enough to comfortably
// fit the rod silhouette plus a generous margin for current and future
// decorations (flames, scopes, lightning, etc.). If a future rod's trimmed
// content exceeds these, the slicer will warn and clip the padding to zero
// on the over-running axis.
const FRAMES = {
  rest: { canvasW: 600, canvasH: 540 },
  wait: { canvasW: 600, canvasH: 540 },
  cast: { canvasW: 400, canvasH: 900 },
}

const QUADS = [
  { suffix: 'rest', xFrac: 0,   yFrac: 0,   wFrac: 0.5, hFrac: 0.5, label: 'rest (top-left)'  },
  { suffix: 'wait', xFrac: 0,   yFrac: 0.5, wFrac: 0.5, hFrac: 0.5, label: 'wait (bottom-left)' },
  { suffix: 'cast', xFrac: 0.5, yFrac: 0,   wFrac: 0.5, hFrac: 1.0, label: 'cast (right half)' },
]

let failures = 0

for (const file of files) {
  try {
    const meta = await sharp(file).metadata()
    if (!meta.width || !meta.height) throw new Error('could not read image metadata')
    const baseName = file.replace(/\.png$/i, '')

    for (const { suffix, xFrac, yFrac, wFrac, hFrac, label } of QUADS) {
      const left   = Math.floor(meta.width  * xFrac)
      const top    = Math.floor(meta.height * yFrac)
      const width  = Math.floor(meta.width  * wFrac)
      const height = Math.floor(meta.height * hFrac)
      // Two-step: chaining .extract().trim() can throw "bad extract area"
      // in some sharp versions. Extract to a buffer first, then trim that.
      const cropped = await sharp(file)
        .extract({ left, top, width, height })
        .toBuffer()
      const trimmed = await sharp(cropped)
        .trim({ threshold: 1 })
        .toBuffer({ resolveWithObject: true })

      // Pad to the fixed canvas size, content centered. If trimmed content
      // exceeds the canvas, clamp the padding to 0 on the offending axis so
      // we don't error — and warn so the artist knows the rod's decorations
      // overran the standard sprite size.
      const { canvasW, canvasH } = FRAMES[suffix]
      const overW = trimmed.info.width  > canvasW
      const overH = trimmed.info.height > canvasH
      if (overW || overH) {
        console.warn(`⚠ ${file} ${suffix}: trimmed ${trimmed.info.width}×${trimmed.info.height} exceeds canvas ${canvasW}×${canvasH} — sprite will be larger than other rods. Consider tightening the source art.`)
      }
      const padX = Math.max(0, canvasW - trimmed.info.width)
      const padY = Math.max(0, canvasH - trimmed.info.height)
      const padLeft   = Math.floor(padX / 2)
      const padRight  = padX - padLeft
      const padTop    = Math.floor(padY / 2)
      const padBottom = padY - padTop

      const padded = await sharp(trimmed.data)
        .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight,
          background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer({ resolveWithObject: true })

      const outPath = `${baseName}_${suffix}.png`
      await writeFile(outPath, padded.data)
      console.log(`✓ ${outPath}: ${padded.info.width}×${padded.info.height} (${label}, trim ${trimmed.info.width}×${trimmed.info.height} → centered in ${canvasW}×${canvasH})`)
    }
  } catch (e) {
    failures++
    console.error(`✗ ${file}: ${e.message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} file(s) failed.`)
  exit(1)
}
console.log('Done.')
