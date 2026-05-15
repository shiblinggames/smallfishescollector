import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

// Input: a 3-pose rod sheet PNG.
//   Top-left quadrant    = rest
//   Bottom-left quadrant = wait
//   Right half           = cast
//
// Output: <name>_rest.png, <name>_wait.png, <name>_cast.png alongside the
// source, each auto-trimmed of transparent padding.

const files = argv.slice(2)

if (files.length === 0) {
  console.error('Usage: node slice-rod.mjs <rod_name.png> [more.png ...]')
  console.error('')
  console.error('Splits a 3-pose rod sheet into:')
  console.error('  <rod>_rest.png   (top-left quadrant)')
  console.error('  <rod>_wait.png   (bottom-left quadrant)')
  console.error('  <rod>_cast.png   (right half)')
  console.error('')
  console.error('All outputs are auto-trimmed of fully transparent padding.')
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
      // Two-step: chaining .extract().trim() can throw "bad extract area"
      // in some sharp versions. Extract to a buffer first, then trim that.
      const cropped = await sharp(file)
        .extract({ left, top, width, height })
        .toBuffer()
      const { data, info } = await sharp(cropped)
        .trim({ threshold: 1 })
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
