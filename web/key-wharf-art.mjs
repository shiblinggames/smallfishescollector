/**
 * THE GUNWHARF AND THE CHARTERHOUSE, off the magenta plate and onto the water.
 *
 * Nano Banana paints a transparency checkerboard when it is asked for
 * transparency, so both buildings were generated on a flat RGB(255,0,255) plate
 * and keyed here — the same pipeline every other sea building came through.
 *
 * Committed rather than thrown away, like the slicers beside it: the next
 * building on an island wants this exact step, and a step that only exists in
 * somebody's shell history is a step that gets guessed at.
 *
 *   node key-wharf-art.mjs <raw-gunwharf.png> <raw-charterhouse.png>
 */
import sharp from 'sharp'
import { cutCell } from './chroma-key.mjs'

const OUT = 'public/sea'
/** 640, where the gauntlet icons take 512. These stand on an island at two
 *  fifths of its width, and on a desktop chart that is a big sprite. */
const LONG_EDGE = 640

const jobs = [
  [process.argv[2], `${OUT}/gunwharf.png`],
  [process.argv[3], `${OUT}/charterhouse.png`],
]

for (const [src, out] of jobs) {
  if (!src) { console.error('usage: node key-wharf-art.mjs <raw-gunwharf> <raw-charterhouse>'); process.exit(1) }
  const m = await sharp(src).metadata()
  // Whole frame: these are single subjects, not a sheet of cells.
  const meta = await cutCell(src, { left: 0, top: 0, width: m.width, height: m.height }, out, LONG_EDGE)
  console.log(`${out}  ${meta.width}x${meta.height}`)
}
