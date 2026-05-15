import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

// Input: a 3-pose rod sheet PNG.
//   Top-left quadrant    = rest
//   Bottom-left quadrant = wait
//   Right half           = cast
//
// Output: <name>_rest.png, <name>_wait.png, <name>_cast.png alongside the
// source. Each output is the RAW quadrant — no trim, no centering. That's
// the only way to keep the rod handle at the same canvas position across
// every rod: trimming-and-centering shifts decorated rods (sparkles,
// lightning, scopes) relative to plain rods because decorations grow the
// bounding box asymmetrically. The artist places the rod handle at a
// consistent x,y in each source-sheet quadrant; this slicer just splits
// the sheet on the quadrant boundaries and lets the artist's placement
// carry through.

const rawArgs = argv.slice(2)
const files = rawArgs.filter(a => !a.startsWith('--'))

if (files.length === 0) {
  console.error('Usage: node slice-rod.mjs <rod_name.png> [more.png ...]')
  console.error('')
  console.error('Splits a 3-pose rod sheet into:')
  console.error('  <rod>_rest.png   (top-left quadrant — full 960x540)')
  console.error('  <rod>_wait.png   (bottom-left quadrant — full 960x540)')
  console.error('  <rod>_cast.png   (right half — full 960x1080)')
  console.error('')
  console.error('No trim, no centering. The artist places the rod handle at')
  console.error('the same x,y in each source-sheet quadrant; this slicer keeps')
  console.error('that placement intact so a single set of overlay coordinates')
  console.error('works for every rod.')
  console.error('')
  console.error('Run from the web/ directory.')
  console.error('')
  console.error('Example:')
  console.error('  node slice-rod.mjs public/rod_bamboo.png')
  exit(1)
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
      const { data, info } = await sharp(file)
        .extract({ left, top, width, height })
        .toBuffer({ resolveWithObject: true })

      const outPath = `${baseName}_${suffix}.png`
      await writeFile(outPath, data)
      console.log(`✓ ${outPath}: ${info.width}×${info.height} (${label})`)
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
