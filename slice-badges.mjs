import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import path from 'path'

const PUBLIC = 'web/public'
const OUT    = 'web/public/badges'

await mkdir(OUT, { recursive: true })

// [batch, row (0-indexed), col (0-indexed)] → output filename (without .png)
// 2026-07 expansion — 24 new badges across batches 13–16 (3 cols × 2 rows each),
// laid out in badge-list order. Arrange each sprite sheet to match this grid.
const PLAN = [
  // Batch 13 — Gauntlet descent + Locker (start)
  [13, 0, 0, 'first_descent'],
  [13, 0, 1, 'abyssward'],
  [13, 0, 2, 'forge_worthy'],
  [13, 1, 0, 'davys_doorstep'],
  [13, 1, 1, 'well_provisioned'],
  [13, 1, 2, 'locker_raider'],
  // Batch 14 — Locker (end) + the deep (start)
  [14, 0, 0, 'forge_awakened'],
  [14, 0, 1, 'master_of_the_locker'],
  [14, 0, 2, 'push_your_luck'],
  [14, 1, 0, 'again_and_again'],
  [14, 1, 1, 'fathom_hoarder'],
  [14, 1, 2, 'one_shot'],
  // Batch 15 — the deep (end) + endgame (start)
  [15, 0, 0, 'greeds_price'],
  [15, 0, 1, 'storm_reader'],
  [15, 0, 2, 'deep_cartographer'],
  [15, 1, 0, 'weapon_of_legend'],
  [15, 1, 1, 'first_fusion'],
  [15, 1, 2, 'ruse_undone'],
  // Batch 16 — endgame (end)
  [16, 0, 0, 'account_settled'],
  [16, 0, 1, 'grand_forgemaster'],
  [16, 0, 2, 'mark_of_mastery'],
  [16, 1, 0, 'quick_draw'],
  [16, 1, 1, 'complete_captain'],
  [16, 1, 2, 'six_legends'],
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
