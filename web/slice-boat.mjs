import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

// Input: a 2-boat sheet PNG, left = rest/wait boat, right = cast boat.
// Output: <name>_rest.png and <name>_cast.png alongside the source,
// each auto-trimmed of transparent padding.

const files = argv.slice(2)

if (files.length === 0) {
  console.error('Usage: node slice-boat.mjs <boat_name.png> [more.png ...]')
  console.error('')
  console.error('Splits a horizontal 2-boat sheet into:')
  console.error('  <boat_name>_rest.png   (left half — used for rest + wait frames)')
  console.error('  <boat_name>_cast.png   (right half — used for cast frame)')
  console.error('')
  console.error('Both outputs are auto-trimmed of fully transparent padding.')
  console.error('Run from the web/ directory.')
  console.error('')
  console.error('Example:')
  console.error('  node slice-boat.mjs art-source/boat_oak.png')
  exit(1)
}

const SIDES = [
  { suffix: 'rest', xFrac: 0,   label: 'rest/wait' },
  { suffix: 'cast', xFrac: 0.5, label: 'cast' },
]

let failures = 0

for (const file of files) {
  try {
    const meta = await sharp(file).metadata()
    if (!meta.width || !meta.height) throw new Error('could not read image metadata')
    const halfW = Math.floor(meta.width / 2)
    const baseName = file.replace(/\.png$/i, '')

    for (const { suffix, xFrac, label } of SIDES) {
      const left = Math.floor(meta.width * xFrac)
      // Two-step: chaining .extract().trim() can throw "bad extract area"
      // in some sharp versions. Extract to a buffer first, then trim that.
      const cropped = await sharp(file)
        .extract({ left, top: 0, width: halfW, height: meta.height })
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
