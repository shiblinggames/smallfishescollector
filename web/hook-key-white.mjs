import sharp from 'sharp'
import { argv, exit } from 'process'

// Hook uploads ship as RGB with a solid-white background instead of RGBA
// with transparent margins. This script keys out near-white pixels so the
// hook composites cleanly on the fishing scene. Operates in place.
//
// Pixels with all three RGB channels >= THRESHOLD become fully transparent.
// Default 240 keeps anti-aliased hook edges intact (their gray-brown edges
// fall well under 240) while erasing the background.

const rawArgs = argv.slice(2)
const threshArg = rawArgs.find(a => a.startsWith('--threshold='))
const THRESHOLD = threshArg ? Math.max(0, Math.min(255, Number(threshArg.split('=')[1]) || 240)) : 240
const files = rawArgs.filter(a => !a.startsWith('--'))

if (files.length === 0) {
  console.error('Usage: node hook-key-white.mjs [--threshold=N] <file1.png> [more.png ...]')
  console.error('')
  console.error('Converts each PNG in place to RGBA with near-white pixels')
  console.error('(all R,G,B >= threshold) set to fully transparent.')
  console.error(`Default threshold = 240. Run from web/.`)
  exit(1)
}

let failures = 0

for (const file of files) {
  try {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let keyed = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
        data[i + 3] = 0
        keyed++
      }
    }

    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toFile(file)

    const pct = ((keyed / (info.width * info.height)) * 100).toFixed(1)
    console.log(`✓ ${file}: ${info.width}×${info.height}, ${keyed} px keyed (${pct}%)`)
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
