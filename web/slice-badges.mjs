import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const OUT = 'public/badges'
await mkdir(OUT, { recursive: true })

// [batch, row (0-indexed), col (0-indexed), output name]
// Full 45-badge re-do (2026-06). Each batchN.png is a 3-col x 2-row grid;
// emblems are placed in reading order (row 1 L→R, then row 2 L→R).
const PLAN = [
  // ── batch 1 — Fishing I ──
  [1, 0, 0, 'prestige_i'],
  [1, 0, 1, 'trophy_catch'],
  [1, 0, 2, 'unbroken'],
  [1, 1, 0, 'relentless'],
  [1, 1, 1, 'untouchable'],
  [1, 1, 2, 'dead_eye'],
  // ── batch 2 — Fishing II + Collection ──
  [2, 0, 0, 'master_angler'],
  [2, 0, 1, 'zone_legend'],
  [2, 0, 2, 'prestige_stars'],
  [2, 1, 0, 'half_the_sea'],
  [2, 1, 1, 'ancient_ones'],
  [2, 1, 2, 'full_collection'],
  // ── batch 3 — Crew ──
  [3, 0, 0, 'growing_crew'],
  [3, 0, 1, 'theres_a_grave'],
  [3, 0, 2, 'legendary_recruit'],
  [3, 1, 0, 'crewmaster'],
  [3, 1, 1, 'full_muster'],
  [3, 1, 2, 'old_salt'],
  // ── batch 4 — Expeditions + gunnery ──
  [4, 0, 0, 'navigator'],
  [4, 0, 1, 'fleet_admiral'],
  [4, 0, 2, 'opening_salvo'],
  [4, 1, 0, 'hard_hitter'],
  [4, 1, 1, 'heavy_broadside'],
  [4, 1, 2, 'swift_reckoning'],
  // ── batch 5 — Raid bosses ──
  [5, 0, 0, 'corsairs_bane'],
  [5, 0, 1, 'ghost_ship'],
  [5, 0, 2, 'cartographers_fall'],
  [5, 1, 0, 'toll_paid'],
  [5, 1, 1, 'master_navigator'],
  [5, 1, 2, 'finndicates_bane'],
  // ── batch 6 — Gauntlet + PvP ──
  [6, 0, 0, 'into_the_deep'],
  [6, 0, 1, 'fathomless'],
  [6, 0, 2, 'davy_jones'],
  [6, 1, 0, 'first_blood'],
  [6, 1, 1, 'brawler'],
  [6, 1, 2, 'duelist'],
  // ── batch 7 — Chart Room + Tavern records ──
  [7, 0, 0, 'quartermaster'],
  [7, 0, 1, 'den_magnate'],
  [7, 0, 2, 'catfish_jackpot'],
  [7, 1, 0, 'tide_runner'],
  [7, 1, 1, 'tide_champion'],
  [7, 1, 2, 'tide_master'],
  // ── batch 8 — Wealth (3 only; bottom row blank) ──
  [8, 0, 0, 'baby_steps'],
  [8, 0, 1, 'deep_pockets'],
  [8, 0, 2, 'bilge_baron'],
]

let skipped = 0
for (const [batch, row, col, name] of PLAN) {
  const src  = `public/badgebatch${batch}.png`
  // Skip sheets that haven't been uploaded yet (e.g. doing batches 1–7 first).
  if (!existsSync(src)) { skipped++; continue }
  const meta = await sharp(src).metadata()
  const w    = Math.floor(meta.width  / 3)
  const h    = Math.floor(meta.height / 2)
  const dest = `${OUT}/${name}.png`

  // The generated sheets don't place each emblem dead-center in its cell, so
  // an even 3x2 grid division leaves badges looking off-center. sharp's
  // .trim() is unreliable here (the medallions nearly fill the cell height and
  // can touch an edge), so we scan the cell's alpha channel for the true
  // non-transparent bounding box, then re-center THAT on a square canvas.
  const { data, info } = await sharp(src)
    .extract({ left: col * w, top: row * h, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const A = 24 // alpha cutoff: ignore faint anti-alias halo
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > A) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const side = Math.round(Math.max(bw, bh) * 1.08) // ~4% breathing room each side

  // Re-extract the tight emblem straight from the source at absolute coords.
  const emblem = await sharp(src)
    .extract({ left: col * w + minX, top: row * h + minY, width: bw, height: bh })
    .png()
    .toBuffer()

  // Center on a square canvas first (sharp applies composite AFTER resize
  // regardless of call order, so resizing must happen in a separate pass —
  // otherwise the full-size emblem composites onto an already-shrunk canvas).
  const centered = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: emblem,
      left: Math.round((side - bw) / 2),
      top:  Math.round((side - bh) / 2),
    }])
    .png()
    .toBuffer()

  await sharp(centered)
    .resize(256, 256, { fit: 'inside' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(dest)

  console.log(`✓ ${dest}  (emblem ${bw}x${bh} → centered ${side})`)
}

if (skipped) console.log(`(skipped ${skipped} entries — their batch sheet wasn't found)`)
console.log('Done.')
