/**
 * SLICE THE SEA ROCKS.
 *
 *   node slice-rocks.mjs <boulders.png> <gaterocks.png>
 *
 * Two magenta-plate sheets in, eight tight PNGs out under public/sea/:
 *
 *   boulders.png  a 3x2 grid   -> rock-spire, rock-dome, rock-split
 *                                 rock-slab, rock-crag, rock-cobbles
 *   gaterocks.png two stacks   -> rock-gate-w, rock-gate-e
 *
 * ── WHY TIGHT, NOT SQUARE ───────────────────────────────────────────────────
 *
 * `SeaMark` sets `width: size` with the height left to the sprite, and masks the
 * bottom of it by a PERCENTAGE to sink it into the water. Both of those read the
 * sprite's own box, so any transparent padding is a lie about where the rock is:
 * it makes `size` mean something different per file, and it puts the waterline
 * somewhere in the empty space below the rock. Every output here is therefore
 * trimmed hard to the paint, and its aspect ratio is whatever the rock's is.
 *
 * ── THE MAGENTA ─────────────────────────────────────────────────────────────
 *
 * Nano Banana paints a checkerboard when asked for "transparent", so the sheets
 * are generated on a flat RGB(255,0,255) plate and keyed here. Metric is
 * `m = min(r,b) - g`, which is high on magenta and near zero on stone, warm or
 * cool. Above 55 the pixel is background; 15..55 is the antialiased fringe and
 * gets a ramp; anything positive is despilled, or every rock keeps a pink rim.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const [sheetPath, gatePath] = process.argv.slice(2)
if (!sheetPath || !gatePath) {
  console.error('usage: node slice-rocks.mjs <boulders.png> <gaterocks.png>')
  process.exit(1)
}

const OUT = 'public/sea'

/** Cut a cell, key the magenta, trim to the paint, write it. */
async function cut(src, { left, top, width, height }, name) {
  // Two awaited steps. Chaining .extract() into another op in one pipeline makes
  // the extract silently misapply — a sharp trap this repo has hit before.
  const cell = await sharp(src).extract({ left, top, width, height })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const { data, info } = cell
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const m = Math.min(r, b) - g
    if (m > 55) { data[i + 3] = 0; continue }
    if (m > 15) data[i + 3] = Math.round(data[i + 3] * (1 - (m - 15) / 40))
    if (m > 0) {                                  // despill, or it keeps a pink rim
      data[i] = Math.max(0, r - m * 0.7)
      data[i + 2] = Math.max(0, b - m * 0.7)
    }
  }

  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer()

  // Trim on alpha, then cap the long edge. Rocks are drawn at ~800px in world
  // space at most, so 512 is already generous and keeps the files small.
  const out = `${OUT}/${name}.png`
  const trimmed = await sharp(keyed).trim({ threshold: 12 }).png().toBuffer()
  const meta = await sharp(trimmed).metadata()
  const scale = 512 / Math.max(meta.width, meta.height)
  await sharp(trimmed)
    .resize(Math.max(1, Math.round(meta.width * scale)), Math.max(1, Math.round(meta.height * scale)),
      { fit: 'fill', kernel: 'lanczos3' })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(out)

  const final = await sharp(out).metadata()
  console.log(`  ${name.padEnd(14)} ${String(final.width).padStart(3)}x${String(final.height).padStart(3)}` +
    `  ratio ${(final.width / final.height).toFixed(2)}`)
}

await mkdir(OUT, { recursive: true })

// ── the 3x2 grid ───────────────────────────────────────────────────────────
// Inset every cell. The sheet is drawn with faint pale rules on the cell
// boundaries, and those are not magenta, so they survive the key and would
// blow up the trim box into the neighbouring cell.
const NAMES = [['rock-spire', 'rock-dome', 'rock-split'],
               ['rock-slab', 'rock-crag', 'rock-cobbles']]
const sheet = await sharp(sheetPath).metadata()
const cw = Math.floor(sheet.width / 3), ch = Math.floor(sheet.height / 2)
const inset = Math.round(Math.min(cw, ch) * 0.02)

console.log(`boulders  ${sheet.width}x${sheet.height}  cells ${cw}x${ch}  inset ${inset}`)
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 3; col++) {
    await cut(sheetPath, {
      left: col * cw + inset, top: row * ch + inset,
      width: cw - inset * 2, height: ch - inset * 2,
    }, NAMES[row][col])
  }
}

// ── the two gate stacks ────────────────────────────────────────────────────
// Split down the middle. They are generated with a wide magenta gap between
// them, so a halfway cut lands in empty space and the trim finds each stack.
const g = await sharp(gatePath).metadata()
const half = Math.floor(g.width / 2)
console.log(`gate      ${g.width}x${g.height}  half ${half}`)
await cut(gatePath, { left: 0, top: 0, width: half, height: g.height }, 'rock-gate-w')
await cut(gatePath, { left: half, top: 0, width: g.width - half, height: g.height }, 'rock-gate-e')
