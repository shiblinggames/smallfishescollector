import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import path from 'path'

const PUBLIC = 'web/public'
const OUT    = 'web/public/badges'

await mkdir(OUT, { recursive: true })

// [batch, row (0-indexed), col (0-indexed)] → output filename (without .png)
// ── batch 25 — The Chart Room, new set (World Chart + Hold rework, 2026-07-21) ──
// badgebatch25.png = a 3-col × 2-row sheet; emblems in reading order below.
const PLAN = [
  [25, 0, 0, 'landfall'],            // r1c1 — first landmark
  [25, 0, 1, 'uncharted_no_more'],   // r1c2 — seven landmarks
  [25, 0, 2, 'fully_laden'],         // r1c3 — hardest hold (Man-o-War)
  [25, 1, 0, 'the_long_watch'],      // r2c1 — 500 charting points
  [25, 1, 1, 'clean_manifest'],      // r2c2 — all four holds in a week
  [25, 1, 2, 'master_cartographer'], // r2c3 — whole World Chart
]

for (const [batch, row, col, name] of PLAN) {
  const src = path.join(PUBLIC, `badgebatch${batch}.png`)
  const meta = await sharp(src).metadata()
  const w = Math.floor(meta.width  / 3)
  const h = Math.floor(meta.height / 2)
  const left = col * w
  const top  = row * h
  const dest = path.join(OUT, `${name}.png`)

  await sharp(src)
    .extract({ left, top, width: w, height: h })
    .png()
    .toFile(dest)

  console.log(`✓ ${dest}`)
}

console.log('Done.')
