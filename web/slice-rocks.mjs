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
import { cutCell, gridCells } from './chroma-key.mjs'

const [sheetPath, gatePath] = process.argv.slice(2)
if (!sheetPath || !gatePath) {
  console.error('usage: node slice-rocks.mjs <boulders.png> <gaterocks.png>')
  process.exit(1)
}

const OUT = 'public/sea'

/** Cut, key and report one rock. The keying itself lives in chroma-key.mjs,
 *  shared with the isle-prop slicer so the two cannot drift apart. */
async function cut(src, box, name) {
  const f = await cutCell(src, box, `${OUT}/${name}.png`)
  console.log(`  ${name.padEnd(14)} ${String(f.width).padStart(3)}x${String(f.height).padStart(3)}` +
    `  ratio ${(f.width / f.height).toFixed(2)}`)
}

await mkdir(OUT, { recursive: true })

// ── the 3x2 grid ───────────────────────────────────────────────────────────
// Inset every cell. The sheet is drawn with faint pale rules on the cell
// boundaries, and those are not magenta, so they survive the key and would
// blow up the trim box into the neighbouring cell.
const NAMES = [['rock-spire', 'rock-dome', 'rock-split'],
               ['rock-slab', 'rock-crag', 'rock-cobbles']]
const sheet = await sharp(sheetPath).metadata()
const cells = gridCells(sheet.width, sheet.height, 3, 2)
console.log(`boulders  ${sheet.width}x${sheet.height}`)
for (let i = 0; i < cells.length; i++) await cut(sheetPath, cells[i], NAMES.flat()[i])

// ── the two gate stacks ────────────────────────────────────────────────────
// Split down the middle. They are generated with a wide magenta gap between
// them, so a halfway cut lands in empty space and the trim finds each stack.
const g = await sharp(gatePath).metadata()
const half = Math.floor(g.width / 2)
console.log(`gate      ${g.width}x${g.height}  half ${half}`)
await cut(gatePath, { left: 0, top: 0, width: half, height: g.height }, 'rock-gate-w')
await cut(gatePath, { left: half, top: 0, width: g.width - half, height: g.height }, 'rock-gate-e')
