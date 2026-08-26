/**
 * SLICE THE ISLE PROPS.
 *
 *   node slice-isle-props.mjs <props.png>
 *
 * One 2x2 magenta sheet in, four PNGs out under public/sea/:
 *
 *   isle-chest        a plain banded chest, closed. Shallows and Open Waters.
 *   isle-chest-open   the same chest open and spilling, for after you take it.
 *   isle-chest-deep   the ornate barnacled one. The Deep and further out.
 *   isle-note         a post with a note tied to it, and a bottle at its foot.
 *
 * Trimmed tight, like the rocks: these are drawn at a `size` that means WIDTH
 * and anchored at the bottom, so padding would move where the prop stands.
 */
import { cutCell, gridCells } from './chroma-key.mjs'
import sharp from 'sharp'

const src = process.argv[2]
if (!src) { console.error('usage: node slice-isle-props.mjs <props.png>'); process.exit(1) }

const NAMES = ['isle-chest', 'isle-chest-open', 'isle-chest-deep', 'isle-note']
const m = await sharp(src).metadata()
const cells = gridCells(m.width, m.height, 2, 2)
console.log(`props ${m.width}x${m.height}`)
for (let i = 0; i < NAMES.length; i++) {
  // 320 not 512: a chest renders about 90 world pixels wide on an isle, so
  // half the rocks' budget is already twice what any screen will ask for.
  const out = await cutCell(src, cells[i], `public/sea/${NAMES[i]}.png`, 320)
  console.log(`  ${NAMES[i].padEnd(16)} ${out.width}x${out.height}  ratio ${(out.width / out.height).toFixed(2)}`)
}
