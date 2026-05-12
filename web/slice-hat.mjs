import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

// Input: a hat sheet PNG with:
//   - Rest/wait hat in the left half (any vertical position)
//   - Cast hat in the right half (any vertical position)
// Output: <name>_rest.png and <name>_cast.png alongside the source,
// each auto-trimmed of transparent padding.

const files = argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node slice-hat.mjs <hat_name.png> [more.png ...]')
  console.error('')
  console.error('Splits a hat sheet into:')
  console.error('  <hat_name>_rest.png   (left half — used for rest + wait frames)')
  console.error('  <hat_name>_cast.png   (right half — used for cast frame)')
  console.error('')
  console.error('Both outputs are auto-trimmed of fully transparent padding.')
  console.error('Run from the web/ directory.')
  console.error('')
  console.error('Example:')
  console.error('  node slice-hat.mjs public/hatblue.png')
  exit(1)
}

const SLICES = [
  { suffix: 'rest', xFrac: 0,   yFrac: 0, wFrac: 0.5, hFrac: 1.0, label: 'rest/wait (left half)' },
  { suffix: 'cast', xFrac: 0.5, yFrac: 0, wFrac: 0.5, hFrac: 1.0, label: 'cast (right half)' },
]

let failures = 0
for (const file of files) {
  try {
    const meta = await sharp(file).metadata()
    if (!meta.width || !meta.height) throw new Error('could not read metadata')
    const baseName = file.replace(/\.png$/i, '')

    for (const { suffix, xFrac, yFrac, wFrac, hFrac, label } of SLICES) {
      const left = Math.floor(meta.width * xFrac)
      const top = Math.floor(meta.height * yFrac)
      const width = Math.floor(meta.width * wFrac)
      const height = Math.floor(meta.height * hFrac)
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
if (failures > 0) { console.error(`\n${failures} file(s) failed.`); exit(1) }
console.log('Done.')
