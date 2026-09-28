// THE FISHING RULES DO WHAT THE GAME PROMISES (Steam prep, Phase B).
//
// Runs lib/fishingRules against the real species table (content/fish_species.json)
// under fixed seeds and holds it to the rules the game has always had:
//   - the same seed rolls the same cast;
//   - a captain's first cast is always a fish, the commonest one, with no
//     jackpot or double;
//   - the Ancient Deep's giants only rise to a lure, never to worms;
//   - Megalodon never rises until the other five are on the wall;
//   - a stale crate token from other water stays a crate;
//   - over many casts the crate rate and the rarity tiers land on the zone's
//     published odds, and every wait sits inside the zone's band.
//
//   npx tsx scripts/check-fishing-rules.mts

import fs from 'fs'
import path from 'path'
import { withRng, mulberry32 } from '../lib/rng'
import { rollCast, CRATE_FISH_ID, type CastRollInput, type CastCandidate } from '../lib/fishingRules'
import { getEffectiveRod, lockedInState } from '../lib/rods'
import { NO_HOTSPOT } from '../lib/seaHotspots'
import { ZONE_RARITY_RATES, ZONE_WAIT_BASE, zoneCrateChance } from '../app/(app)/fishing/zoneData'
import { getBait } from '../lib/bait'

const worm = getBait('worm').waitMult

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

type Species = CastCandidate & { habitat: string; name: string }
const species = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'fish_species.json'), 'utf8')) as Species[]
const inZone = (h: string) => species.filter(s => s.habitat === h)

const rod = getEffectiveRod(0, null)
const base = (over: Partial<CastRollInput>): CastRollInput => ({
  habitat: 'shallows', baitType: 'worm', candidates: inZone('shallows'), fishingLevel: 10, firstEver: false,
  ancientCatches: [], ancientVigil: null, rod, locked: lockedInState(rod, 0),
  patience: { waitMult: 1, crateChanceMult: 1 }, renown: { biteWaitMult: 1, crateChanceMult: 1 },
  hotspot: NO_HOTSPOT, eventRarityBonus: 0, stale: null, alwaysAncientTrophy: false, ...over,
})
const strip = (r: ReturnType<typeof rollCast>) => JSON.stringify(r, (k, v) => (k === 'castAt' ? 0 : v))

// ── determinism ─────────────────────────────────────────────────────────────
for (const h of ['shallows', 'open_waters', 'deep', 'abyss']) {
  const a = withRng(mulberry32(11), () => Array.from({ length: 30 }, () => strip(rollCast(base({ habitat: h, candidates: inZone(h) })))))
  const b = withRng(mulberry32(11), () => Array.from({ length: 30 }, () => strip(rollCast(base({ habitat: h, candidates: inZone(h) })))))
  if (a.join() !== b.join()) fail(`${h}: the same seed rolled different casts`)
}

// ── the first cast ever ─────────────────────────────────────────────────────
{
  const pool = inZone('shallows')
  const commonest = [...pool].sort((a, b) => (a.bite_rarity - b.bite_rarity) || (a.catch_difficulty - b.catch_difficulty))[0]
  withRng(mulberry32(3), () => {
    for (let i = 0; i < 500; i++) {
      const r = rollCast(base({ firstEver: true }))
      if ('error' in r || r.crate) { fail('a first cast came up a crate or an error'); break }
      if (r.fish.id !== commonest.id) { fail(`a first cast landed ${r.fish.id}, not the commonest (${commonest.id})`); break }
      if ((r.shot.jackpotMult ?? 1) !== 1 || r.shot.doubleCatch) { fail('a first cast rolled a jackpot or double'); break }
    }
  })
}

// ── the Ancient Deep ────────────────────────────────────────────────────────
{
  const deep = inZone('ancient_deep')
  const trophies = deep.filter(s => (s.sell_value ?? 0) === 0).map(s => s.id)
  withRng(mulberry32(5), () => {
    for (let i = 0; i < 2000; i++) {
      const r = rollCast(base({ habitat: 'ancient_deep', candidates: deep, fishingLevel: 90 }))
      if (!('error' in r) && !r.crate && trophies.includes(r.fish.id)) { fail(`a giant (${r.fish.id}) rose to worms`); break }
    }
    // Lures, nothing caught yet: Megalodon (143) must never rise.
    for (let i = 0; i < 3000; i++) {
      const r = rollCast(base({ habitat: 'ancient_deep', candidates: deep, fishingLevel: 90, baitType: 'golden' }))
      if (!('error' in r) && !r.crate && r.fish.id === 143) { fail('Megalodon rose before the other five were caught'); break }
    }
    // All five caught, golden lure, test hook: Megalodon is next due.
    const r = rollCast(base({ habitat: 'ancient_deep', candidates: deep, fishingLevel: 90, baitType: 'golden',
      ancientCatches: [144, 145, 146, 147, 148], alwaysAncientTrophy: true }))
    if ('error' in r || r.crate || r.fish.id !== 143) fail('with the five caught, Megalodon was not the next giant due')
  })
}

// ── a stale crate stays a crate ─────────────────────────────────────────────
withRng(mulberry32(9), () => {
  const stale = { fishId: CRATE_FISH_ID, habitat: 'deep', baitType: 'worm', jackpotMult: 1, doubleCatch: false, castAt: 0 }
  for (let i = 0; i < 200; i++) {
    const r = rollCast(base({ stale }))
    if ('error' in r || !r.crate) { fail('an inherited crate decision was lost'); break }
  }
})

// ── the odds, over many casts ───────────────────────────────────────────────
for (const h of ['shallows', 'open_waters', 'deep', 'abyss']) {
  const pool = inZone(h)
  const N = 60_000
  let crates = 0
  const tiers: Record<number, number> = {}
  const [wMin, wMax] = ZONE_WAIT_BASE[h]
  withRng(mulberry32(21), () => {
    for (let i = 0; i < N; i++) {
      const r = rollCast(base({ habitat: h, candidates: pool, fishingLevel: 1 }))
      if ('error' in r) { fail(`${h}: ${r.error}`); return }
      if (r.crate) { crates++; continue }
      tiers[r.fish.bite_rarity] = (tiers[r.fish.bite_rarity] ?? 0) + 1
      // Level 1, a plain rod, no buffs: the zone's band times the worm's own
      // multiplier, never under the 3s floor.
      const lo = Math.max(3000, Math.round(wMin * worm)), hi = Math.max(3000, Math.round(wMax * worm))
      if (r.shot.waitMs < lo || r.shot.waitMs > hi) { fail(`${h}: wait ${r.shot.waitMs} outside ${lo}-${hi}`); return }
    }
  })
  const crateRate = crates / N
  const want = zoneCrateChance(h) * (rod.crateChanceMult ?? 1)
  if (Math.abs(crateRate - want) > Math.max(0.004, want * 0.25)) fail(`${h}: crates ${crateRate.toFixed(4)} against ${want.toFixed(4)}`)
  // The tiers present in this water, renormalised, should match the zone table.
  const rates = ZONE_RARITY_RATES[h]
  const present = [...new Set(pool.map(s => s.bite_rarity))]
  const total = present.reduce((s, t) => s + (rates[t] ?? 0), 0)
  const fish = N - crates
  for (const t of present) {
    const got = (tiers[t] ?? 0) / fish, exp = (rates[t] ?? 0) / total
    if (Math.abs(got - exp) > 0.012) fail(`${h}: tier ${t} came out ${got.toFixed(3)} against ${exp.toFixed(3)}`)
  }
}

console.log(`\n  Fishing rules: determinism, first cast, the giants, stale crates, odds and waits ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
