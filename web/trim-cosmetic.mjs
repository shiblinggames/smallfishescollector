import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

const files = argv.slice(2)

if (files.length === 0) {
  console.error('Usage: node trim-cosmetic.mjs <file1.png> [file2.png] ...')
  console.error('')
  console.error('Trims fully-transparent padding from a PNG in place.')
  console.error('Run from the web/ directory.')
  console.error('')
  console.error('Example:')
  console.error('  node trim-cosmetic.mjs public/boat_oak.png')
  console.error('  node trim-cosmetic.mjs public/hat_tricorn.png public/hat_captain.png')
  exit(1)
}

let failures = 0

for (const file of files) {
  try {
    const before = await sharp(file).metadata()
    const { data, info } = await sharp(file)
      .trim({ threshold: 1 })
      .toBuffer({ resolveWithObject: true })

    if (info.width === before.width && info.height === before.height) {
      console.log(`= ${file}: already tight (${before.width}×${before.height})`)
      continue
    }

    await writeFile(file, data)
    console.log(`✓ ${file}: ${before.width}×${before.height} → ${info.width}×${info.height}`)
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
