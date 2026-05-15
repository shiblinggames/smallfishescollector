import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { argv, exit } from 'process'

// Outputs <name>_thumb.png alongside each input PNG, trimmed tight to
// non-transparent content. Used for shop / profile thumbnails where the
// raw padded sprite (rest_960x540 rod or raw_1920x1080 reel) renders
// laughably small at objectFit: contain — the rod or reel itself is just
// a small portion of the source canvas. The _thumb files are visual-only
// and never used for in-game rendering where positioning depends on the
// raw canvas.

const files = argv.slice(2)

if (files.length === 0) {
  console.error('Usage: node slice-thumb.mjs <file1.png> [more.png ...]')
  console.error('')
  console.error('Outputs <name>_thumb.png alongside each input, trimmed')
  console.error('tight to non-transparent content. Run from web/.')
  console.error('')
  console.error('Example:')
  console.error('  node slice-thumb.mjs public/rod_bamboo_rest.png')
  console.error('  node slice-thumb.mjs public/reel_basic.png')
  exit(1)
}

let failures = 0

for (const file of files) {
  try {
    // Strip any trailing _rest / _wait / _cast so the thumb is named after
    // the rod/reel itself rather than the pose it was generated from.
    const baseName = file.replace(/\.png$/i, '').replace(/_(?:rest|wait|cast)$/, '')
    const { data, info } = await sharp(file)
      .trim({ threshold: 1 })
      .toBuffer({ resolveWithObject: true })
    const outPath = `${baseName}_thumb.png`
    await writeFile(outPath, data)
    console.log(`✓ ${outPath}: ${info.width}×${info.height}`)
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
