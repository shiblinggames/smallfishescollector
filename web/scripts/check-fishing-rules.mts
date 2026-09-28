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
import { rollCast, landFish, landAncient, wormholeExit, prestigeStep, biteFloorMs, crateStreak, CRATE_FISH_ID, type CastRollInput, type CastCandidate, type FishLandingInput, type LandingFish } from '../lib/fishingRules'
import { getEffectiveRod, lockedInState } from '../lib/rods'
import { NO_HOTSPOT } from '../lib/seaHotspots'
import { ZONE_RARITY_RATES, ZONE_WAIT_BASE, zoneCrateChance } from '../app/(app)/fishing/zoneData'
import { getBait } from '../lib/bait'
import { rollCrateLoot } from '../lib/crateLoot'

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

// ── the landing ─────────────────────────────────────────────────────────────
{
  const eye = { perfectBaitSave: false, goldenOddsMult: 1, fishingXpMult: 1 }
  const shallows = inZone('shallows').filter(s => (s.sell_value ?? 0) > 0) as unknown as LandingFish[]
  const land = (over: Partial<FishLandingInput>) => landFish({
    profile: { fishing_xp: 50_000, current_perfect_streak: 4, highest_perfect_streak: 9 }, fish: shallows[0], result: 'perfect', baitType: 'worm',
    rod, eye, renownXpMult: 1, doubleCatch: false, jackpotMult: 1, lockedCatchQty: 1, holdCount: 0, holdCapacity: 100, ...over,
  })
  // Determinism.
  const a = withRng(mulberry32(31), () => JSON.stringify(Array.from({ length: 50 }, (_, k) => land({ fish: shallows[k % shallows.length] }))))
  const b = withRng(mulberry32(31), () => JSON.stringify(Array.from({ length: 50 }, (_, k) => land({ fish: shallows[k % shallows.length] }))))
  if (a.replace(/"highest_streak_set_at":"[^"]*"/g, '') !== b.replace(/"highest_streak_set_at":"[^"]*"/g, '')) fail('the same seed landed differently')

  withRng(mulberry32(33), () => {
    for (let k = 0; k < 4000; k++) {
      const fish = species[k % species.length] as unknown as LandingFish
      if ((fish.sell_value ?? 0) === 0) continue
      const result = k % 3 === 0 ? 'catch' : 'perfect'
      const r = land({ fish, result, profile: { fishing_xp: (k * 7919) % 900_000, current_perfect_streak: k % 25, prestige_levels: { [fish.habitat]: k % 7 } },
        renownXpMult: 1 + (k % 5) * 0.01, eye: { ...eye, fishingXpMult: 1 + (k % 3) * 0.1 } })
      // The three parts the card shows add up to the XP banked.
      if (r.xpCatch + (r.perfectBonusXP ?? 0) + r.xpStreak !== r.xpGained) { fail(`xp parts do not sum on ${fish.id}`); break }
      if (result === 'catch' && (r.perfectStreak !== 0 || r.perfectBonusXP !== undefined)) { fail('a plain catch kept a streak or a perfect bonus'); break }
    }
  })
  // A shiny is one fish, whatever the haul said.
  const shiny = land({ profile: { force_shiny_always: true }, jackpotMult: 100, doubleCatch: true })
  if (!shiny.isShiny || shiny.catchQty !== 1) fail('a shiny did not collapse the haul to one')
  // A full hold banks nothing (and a nothing-banked catch is not rerollable).
  const full = land({ result: 'catch', holdCount: 100, holdCapacity: 100 })
  if (full.catchQty !== 0) fail('a full hold still banked a fish')
  // Jackpot beats the Locked-In triple beats the double; clamped to free space.
  if (land({ result: 'catch', jackpotMult: 100, lockedCatchQty: 3, doubleCatch: true }).catchQty !== 100) fail('the jackpot did not win the haul')
  if (land({ result: 'catch', lockedCatchQty: 3, doubleCatch: true }).catchQty !== 3) fail('the Locked-In triple did not beat the double')
  if (land({ result: 'catch', doubleCatch: true }).catchQty !== 2) fail('a double did not land two')
  if (land({ result: 'catch', jackpotMult: 100, holdCount: 95 }).catchQty !== 5) fail('the jackpot was not clamped to the free space')
  // The record believes a streak only up to the ceiling.
  const wild = land({ profile: { current_perfect_streak: 500, highest_perfect_streak: 10 } })
  if (!wild.anomaly || 'highest_perfect_streak' in wild.updates) fail('an implausible streak was recorded')
  const best = land({ profile: { current_perfect_streak: 11, highest_perfect_streak: 5 } })
  if (best.updates.highest_perfect_streak !== 12) fail('a new best streak was not recorded')

  // The giants: a released one ranks up on a perfect, not on a plain catch;
  // the capstone pet is owed once, when all six reach the top rank.
  const six = [143, 144, 145, 146, 147, 148]
  const released = landAncient({ ancient_catches: six, ancient_vigil: { '144': { rank: 2, released: true } } }, 144, 'perfect', 1)
  if (!released.vigilRankUp || released.vigilRankUp.to !== 3) fail('a released giant did not rank up on a perfect')
  const plain = landAncient({ ancient_catches: six, ancient_vigil: { '144': { rank: 2, released: true } } }, 144, 'catch', 1)
  if (plain.vigilRankUp) fail('a released giant ranked up on a plain catch')
  const top = Object.fromEntries(six.map(id => [String(id), { rank: 5, released: false }]))
  top['148'] = { rank: 4, released: true }
  const cap = landAncient({ ancient_catches: six, ancient_vigil: top }, 148, 'perfect', 1)
  if (!cap.grantVigilPet) fail('the capstone pet was not owed when all six reached the top')
  const capOwned = landAncient({ ancient_catches: six, ancient_vigil: top, unlocked_pets: ['plesiosaur_baby'] }, 148, 'perfect', 1)
  if (capOwned.grantVigilPet) fail('the capstone pet was owed twice')
  const first = landAncient({ ancient_catches: [144, 145] }, 146, 'catch', 1)
  if (!first.isNewTrophy || !(first.updates.ancient_catches as number[]).includes(146)) fail('a new giant was not added to the wall')
}

// ── crates, the Wormhole, prestige, timing ──────────────────────────────────
{
  // The crate's outcomes land on their weights; an owned cosmetic never drops;
  // with every cosmetic owned, the cosmetic share folds into doubloons.
  const none: { skins: string[]; boats: string[]; hats: string[] } = { skins: [], boats: [], hats: [] }
  const all = { skins: ['mint', 'lavender', 'storm'], boats: ['charcoal', 'offwhite'], hats: ['black', 'gray', 'golden', 'cheetah', 'fuego', 'spotted'] }
  const tally = (tier: Parameters<typeof rollCrateLoot>[0], owned: typeof none) => {
    const t = { doubloons: 0, bait: 0, cosmetic: 0 }
    withRng(mulberry32(41), () => { for (let k = 0; k < 40_000; k++) t[rollCrateLoot(tier, owned).outcome.kind]++ })
    return t
  }
  const g = tally('gold', none)
  // gold: doubloons 55 / bait 35 / cosmetic 10
  if (Math.abs(g.doubloons / 40_000 - 0.55) > 0.012 || Math.abs(g.cosmetic / 40_000 - 0.10) > 0.008) fail(`gold crate outcomes off: ${JSON.stringify(g)}`)
  const ga = tally('gold', all)
  if (ga.cosmetic !== 0 || Math.abs(ga.doubloons / 40_000 - 0.65) > 0.012) fail(`an all-owned gold crate did not fold cosmetics into doubloons: ${JSON.stringify(ga)}`)
  withRng(mulberry32(43), () => {
    for (let k = 0; k < 5000; k++) {
      const r = rollCrateLoot('ancient', { skins: ['mint'], boats: [], hats: ['golden'] })
      if (r.outcome.kind === 'cosmetic' && (r.outcome.entry.id === 'mint' || r.outcome.entry.id === 'golden')) { fail('a crate dropped a cosmetic already owned'); break }
      if (r.outcome.kind === 'bait' && r.outcome.qty !== 30) { fail('an ancient crate paid the wrong bait count'); break }
    }
  })

  // The Wormhole never comes out where it went in.
  const pool = inZone('deep')
  withRng(mulberry32(47), () => {
    for (let k = 0; k < 3000; k++) {
      const orig = pool[k % pool.length].id
      const out = wormholeExit(pool, orig, 'deep', rod)
      if (!out || out.id === orig) { fail('the wormhole landed on the fish it was sent from'); break }
    }
  })
  if (wormholeExit([pool[0]], pool[0].id, 'deep', rod) !== null) fail('a one-fish water still produced a wormhole exit')

  // Prestige: a level to the cap, then golden boosts; all four waters noticed.
  let lv: Record<string, number> = {}, gb: Record<string, number> = {}
  for (let k = 0; k < 7; k++) { const r = prestigeStep(lv, gb, 'deep', 5); lv = r.newLevels; gb = r.newGoldenBoosts }
  if (lv.deep !== 5 || gb.deep !== 2) fail(`seven prestiges gave level ${lv.deep} and golden ${gb.deep}, not 5 and 2`)
  const four = prestigeStep({ shallows: 1, open_waters: 2, deep: 1 }, {}, 'abyss', 5)
  if (!four.allZonesPrestiged) fail('prestiging the last water did not count all four')
  if (prestigeStep({ shallows: 1 }, {}, 'deep', 5).allZonesPrestiged) fail('two waters counted as all four')

  // The bite floor and the crate streak.
  if (biteFloorMs({ shot: { fishId: 1, catchDifficulty: 1, biteRarity: 1, waitMs: 5000, instantBite: true } }) !== 760) fail('an instant bite did not use the 760ms floor')
  if (biteFloorMs({ shot: { fishId: 1, catchDifficulty: 1, biteRarity: 1, waitMs: 5000 } }) !== 5000) fail('the bite floor did not follow the rolled wait')
  const cs = crateStreak({ current_perfect_streak: 3, highest_perfect_streak: 3 }, 'perfect', 'deep')
  if (cs.streak !== 4 || cs.updates.highest_perfect_streak !== 4) fail('a perfect crate did not extend the streak and its record')
  if (crateStreak({ current_perfect_streak: 9 }, 'catch', 'deep').streak !== 0) fail('a plain crate kept the streak')
}

console.log(`\n  Fishing rules: determinism, first cast, the giants, stale crates, odds, waits, landings, crates, the Wormhole and prestige ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
