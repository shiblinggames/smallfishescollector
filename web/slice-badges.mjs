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
  // ── batch 8 — Wealth (top row) + Fishing feats (bottom row) ──
  [8, 0, 0, 'baby_steps'],
  [8, 0, 1, 'deep_pockets'],
  [8, 0, 2, 'bilge_baron'],
  [8, 1, 0, 'two_for_the_pot'],
  [8, 1, 1, 'saltlung'],
  [8, 1, 2, 'crate_digger'],
  // ── batch 9 — 2026-06 expansion (fishing-heavy) ──
  [9, 0, 0, 'got_away'],
  [9, 0, 1, 'reel_lucky'],
  [9, 0, 2, 'two_fisted'],
  [9, 1, 0, 'sure_shot'],
  [9, 1, 1, 'salted_through'],
  [9, 1, 2, 'maiden_voyage'],
  // ── batch 10 — 2026-06 expansion (voyages / collection / crew / tide / captain) ──
  [10, 0, 0, 'old_sea_dog'],
  [10, 0, 1, 'hundred_fins'],
  [10, 0, 2, 'three_legends'],
  [10, 1, 0, 'beacon_breaker'],
  [10, 1, 1, 'long_haul'],
  [10, 1, 2, 'captains_colors'],
  // ── batch 11 — expansion II (parlor + den) ──
  [11, 0, 0, 'crowned'],
  [11, 0, 1, 'throne_in_sight'],
  [11, 0, 2, 'clean_sweep'],
  [11, 1, 0, 'unstoppable'],
  [11, 1, 1, 'stacked_deck'],
  [11, 1, 2, 'called_it'],
  // ── batch 12 — expansion II (fishing pet / ship / tide / trawling) ──
  [12, 0, 0, 'friend_at_sea'],
  [12, 0, 1, 'ship_of_the_line'],
  [12, 0, 2, 'wrecking_crew'],
  [12, 1, 0, 'first_haul'],
  [12, 1, 1, 'steady_nets'],
  [12, 1, 2, 'deep_trawler'],
  // ── batch 13 — 2026-07 expansion: Gauntlet descent + Locker (start) ──
  [13, 0, 0, 'first_descent'],
  [13, 0, 1, 'abyssward'],
  [13, 0, 2, 'forge_worthy'],
  [13, 1, 0, 'davys_doorstep'],
  [13, 1, 1, 'well_provisioned'],
  [13, 1, 2, 'locker_raider'],
  // ── batch 14 — Locker (end) + the deep (start) ──
  [14, 0, 0, 'forge_awakened'],
  [14, 0, 1, 'master_of_the_locker'],
  [14, 0, 2, 'push_your_luck'],
  [14, 1, 0, 'again_and_again'],
  [14, 1, 1, 'fathom_hoarder'],
  [14, 1, 2, 'one_shot'],
  // ── batch 15 — the deep (end) + endgame (start) ──
  [15, 0, 0, 'greeds_price'],
  [15, 0, 1, 'storm_reader'],
  [15, 0, 2, 'deep_cartographer'],
  [15, 1, 0, 'weapon_of_legend'],
  [15, 1, 1, 'first_fusion'],
  [15, 1, 2, 'ruse_undone'],
  // ── batch 16 — endgame (end) ──
  [16, 0, 0, 'account_settled'],
  [16, 0, 1, 'grand_forgemaster'],
  [16, 0, 2, 'mark_of_mastery'],
  [16, 1, 0, 'quick_draw'],
  [16, 1, 1, 'complete_captain'],
  [16, 1, 2, 'six_legends'],
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
