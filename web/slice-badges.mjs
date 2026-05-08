import sharp from 'sharp'
import { mkdir } from 'fs/promises'

const OUT = 'public/badges'
await mkdir(OUT, { recursive: true })

// [batch, row (0-indexed), col (0-indexed), output name]
const PLAN = [
  [1, 0, 1, 'master_angler'],   // batch1 r1c2 — crowned fish
  [1, 0, 2, 'deep_pockets'],    // batch1 r1c3 — treasure chest
  [2, 0, 0, 'fleet_admiral'],   // batch2 r1c1 — anchor shield
  [2, 0, 1, 'full_collection'], // batch2 r1c2 — fish skeleton
  [2, 1, 0, 'prestige_i'],      // batch2 r2c1 — green pennant
  [2, 1, 2, 'navigator'],       // batch2 r2c3 — silver/red compass
  [3, 0, 0, 'ancient_ones'],    // batch3 r1c1 — anglerfish + arrows
  [3, 0, 2, 'unbroken'],        // batch3 r1c3 — blue star compass + coral
  [3, 1, 1, 'davy_jones'],      // batch3 r2c2 — tentacle compass wheel
  [3, 1, 2, 'corsairs_bane'],   // batch3 r2c3 — pirate skull + swords
  [4, 0, 2, 'zone_legend'],     // batch4 r1c3 — gold crown + coral
  [4, 1, 2, 'ghost_ship'],      // batch4 r2c3 — lantern shield
]

for (const [batch, row, col, name] of PLAN) {
  const src  = `public/badgebatch${batch}.png`
  const meta = await sharp(src).metadata()
  const w    = Math.floor(meta.width  / 3)
  const h    = Math.floor(meta.height / 2)
  const dest = `${OUT}/${name}.png`

  await sharp(src)
    .extract({ left: col * w, top: row * h, width: w, height: h })
    .png()
    .toFile(dest)

  console.log(`✓ ${dest}`)
}

console.log('Done.')
