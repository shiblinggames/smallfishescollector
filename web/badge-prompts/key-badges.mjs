// Chroma-key a magenta badge sheet to alpha, ready for slice-badges.mjs.
// Nano Banana paints a checkerboard when asked for "transparent", so the sheets
// are generated on a flat magenta plate and keyed here instead. Same metric as
// the gauntlet icon pipeline: m = min(r,b) - g.
//   node key-badges.mjs badgebatch32-raw.png public/badgebatch32.png
import sharp from 'sharp'
const [, , src, dest] = process.argv
if (!src || !dest) { console.error('usage: node key-badges.mjs <raw.png> <out.png>'); process.exit(1) }
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
let cleared = 0
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  const m = Math.min(r, b) - g
  if (m > 55) { data[i + 3] = 0; cleared++ }
  else if (m > 15) { data[i + 3] = Math.round(data[i + 3] * (1 - (m - 15) / 40)) }
  if (m > 0) { data[i] = Math.max(0, r - 0.7 * m); data[i + 2] = Math.max(0, b - 0.7 * m) }  // despill
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(dest)
console.log(`${dest}  ${info.width}x${info.height}  ${(cleared / (info.width * info.height) * 100).toFixed(1)}% keyed to transparent`)
