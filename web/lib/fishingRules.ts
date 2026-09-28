// ── THE FISHING RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// What a cast rolls and what a landing pays, as plain functions over plain
// inputs. The server actions in app/(app)/fishing/actions.ts do the rest:
// who is asking, what they own, the gates, and writing the result. Moved out
// verbatim, so nothing about the odds or the payouts changed in the move;
// scripts/check-fishing-rules.mts holds them to that.
//
// Every roll goes through rngNext and every clock read through clockNow, so a
// seeded replay (verified runs) or an offline engine (a Steam build) gets the
// same answer the server would.
//
// NOT 'use server', on purpose: this is a plain module, so its types and its
// sync exports survive (a 'use server' file strips both).

import { getBait } from '@/lib/bait'
import { jackpotChanceForZone, rodWaitMult, type RodDef, type LockedInState } from '@/lib/rods'
import type { HotspotEffect } from '@/lib/seaHotspots'
import type { EyeEffects } from '@/lib/finnItems'
import { isReleased, vigilHuntChance, VIGIL_MAX_RANK, ANCIENT_IDS, vigilFor, ancientCatchXP, vigilPaidAfter, vigilComplete, VIGIL_PET_ID, type VigilState } from '@/lib/ancientVigil'
import { catchXP, getLevelFromXP } from '@/lib/fishingLevel'
import { streakMult, STREAK_RECORD_CEILING } from '@/lib/perfectStreak'
import { rollShiny } from '@/lib/shiny'
import { goldenBoostMult } from '@/lib/zoneRewards'
import { rollFishSize, type FishSizeTier } from '@/lib/fishSize'
import type { CrateTier } from '@/lib/crateLoot'
import { ZONE_RARITY_RATES, ZONE_WAIT_BASE, ZONE_CRATE_TIERS, zoneCrateChance } from '@/app/(app)/fishing/zoneData'
import { rngNext } from '@/lib/rng'
import { clockNow } from '@/lib/clock'

/** The species id a crate cast carries in place of a fish. */
export const CRATE_FISH_ID = -1

/** castLine's client payload, minus baitRemaining (which is read live). */
export type CastShot = {
  fishId: number; catchDifficulty: number; biteRarity: number; waitMs: number
  crateTier?: CrateTier; instantBite?: boolean; jackpotMult?: number
  doubleCatch?: boolean; catchQty?: number; lockedStage?: number
  /** THE LONG VIGIL: the rank this hooked giant is being fought FOR (current
   *  rank + 1). Absent unless a released ancient is on the line. Drives the
   *  client's boss-fight scaling, and rides in the shot so a resumed cast
   *  replays the same difficulty. */
  vigilRank?: number
}

// Server-rolled outcome of a cast, persisted to profiles.pending_cast and
// consumed one-shot by reelIn / reelCrate. The client can pass whatever it
// likes to those actions; the server binds to THESE values instead.
export type PendingCast = {
  fishId: number          // the rolled species id (CRATE_FISH_ID === -1 for a crate)
  habitat: string
  baitType: string
  crateTier?: CrateTier    // present only for crate casts
  jackpotMult: number      // server-rolled YOLO jackpot (1 = none)
  doubleCatch: boolean     // server-rolled double catch
  catchQty?: number        // Locked-In Rod guaranteed haul (3 at streak 5+); overrides double
  castAt: number
  /** The EXACT payload this cast handed the client. Stored so an interrupted
   *  cast can be replayed byte-for-byte instead of re-derived from current gear
   *  (which would let a player swap rods mid-abandon to improve a live roll).
   *  Optional: tokens written before this shipped simply cannot be resumed. */
  shot?: CastShot
}

/** The species columns a cast rolls against. */
export type CastCandidate = { id: number; catch_difficulty: number; catch_score?: number; bite_rarity: number; sell_value: number | null }

/**
 * HOW LONG THE BITE TAKES. The zone sets a band and the cast rolls inside it.
 *
 * IT TOOK A `catchScore` AND THAT WAS THE BUG IN IT. The wait was interpolated
 * across the band by the fish's own score, and score climbs with rarity in
 * every zone, so the delay told you what was coming: a Shallows legendary
 * averaged 7.4s against a common's 3.2s. You knew roughly what you had before
 * the needle appeared, which takes the reveal off the dial and off the card and
 * gives it to a progress bar.
 *
 * Uniform inside the band now. Nothing here knows which fish was picked, and
 * the picking is untouched — the rarity table still decides that, on its own.
 */
export function fishWaitMs(habitat: string, baitType: string, fishingLevel: number, renownWaitMult = 1, rodMult = 1): number {
  const [zMin, zMax] = ZONE_WAIT_BASE[habitat] ?? [13000, 21000]
  const base = zMin + rngNext() * (zMax - zMin)
  const baitMult = getBait(baitType).waitMult
  const levelMult = 1 - ((fishingLevel - 1) / 99) * 0.33
  // No upper cap — the zone band and the multipliers need to land where they
  // land. The cap was a legacy sanity rail from before the Ancient Deep had a
  // band measured in minutes; it squashed every worm-baited cast out there to a
  // flat 60s and erased the bait choice the player had just made. The 3s floor
  // stays as a guard against negative waits from stacked buffs.
  return Math.max(3000, Math.round(base * baitMult * levelMult * renownWaitMult * rodMult))
}

// Two-stage fish selection:
//   Stage 1 — roll rarity tier using zone-specific fixed rates (commons always dominant)
//   Stage 2 — pick uniformly among fish of that tier in this zone
// Adding more fish of a rarity increases variety, not that rarity's probability.
// Tiers absent from a zone are excluded and the remaining rates normalise automatically.
export function tierWeightedPick<T extends { bite_rarity: number }>(items: T[], habitat: string, rarityBonus: number): T {
  const baseRates = ZONE_RARITY_RATES[habitat] ?? ZONE_RARITY_RATES.shallows

  // Group fish by rarity tier
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const g = groups.get(item.bite_rarity) ?? []
    g.push(item)
    groups.set(item.bite_rarity, g)
  }

  // Apply rod rarity bias: higher tiers get boosted proportionally
  const tiers = [...groups.keys()]
  const adjustedRates: Record<number, number> = {}
  for (const r of tiers) {
    adjustedRates[r] = (baseRates[r] ?? 0) * (1 + rarityBonus * (r - 1))
  }

  const totalWeight = tiers.reduce((s, r) => s + adjustedRates[r], 0)
  if (totalWeight === 0) return items[Math.floor(rngNext() * items.length)]

  let rand = rngNext() * totalWeight
  let selectedTier = tiers[0]
  for (const r of tiers) {
    rand -= adjustedRates[r]
    if (rand <= 0) { selectedTier = r; break }
  }

  const pool = groups.get(selectedTier)!
  return pool[Math.floor(rngNext() * pool.length)]
}

export function rollCrateTier(habitat: string): CrateTier {
  const dist = ZONE_CRATE_TIERS[habitat] ?? ZONE_CRATE_TIERS.shallows
  // Walks whatever tiers the zone's table actually lists, rather than the four
  // it used to name inline. That is what lets the Ancient Deep hold exactly one
  // tier and everywhere else hold four, with no branch here.
  const entries = Object.entries(dist) as [CrateTier, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rngNext() * total
  for (const [tier, w] of entries) {
    r -= w
    if (r < 0) return tier
  }
  return entries[entries.length - 1]?.[0] ?? 'wooden'
}

// ── Server-side event validation ─────────────────────────────────────────────

const EVENT_DURATION_MS = 120_000

/** The zone event running on this profile, if it has not expired. */
export function activeEventOf(raw: unknown): { type: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as { type?: string; started_at?: string }
  if (!e.type || !e.started_at) return null
  if (clockNow() - new Date(e.started_at).getTime() > EVENT_DURATION_MS) return null
  return { type: e.type }
}

/** Megalodon never surfaces until the other five giants are on the wall. */
const MEGALODON_ID = 143
const MEGALODON_PREREQS = [144, 145, 146, 147, 148]

export type CastRollInput = {
  habitat: string
  baitType: string
  /** Every species in this water. */
  candidates: CastCandidate[]
  fishingLevel: number
  /** This is the captain's first cast ever (no fishing xp): always a fish, the
   *  commonest one, with no jackpot or double. */
  firstEver: boolean
  /** profiles.ancient_catches and ancient_vigil, for the Ancient Deep pool. */
  ancientCatches: number[]
  ancientVigil: unknown
  rod: RodDef
  locked: LockedInState
  /** The Angler's Patience (identity when not seated). */
  patience: Pick<EyeEffects, 'waitMult' | 'crateChanceMult'>
  renown: { biteWaitMult: number; crateChanceMult: number }
  hotspot: HotspotEffect
  /** The red-tide event's rarity lift (0 when none). */
  eventRarityBonus: number
  /** A live token from a DIFFERENT water: its crate decision is inherited. */
  stale: PendingCast | null
  /** The one test account that always hooks the next Ancient trophy. */
  alwaysAncientTrophy: boolean
}

export type CastRoll =
  | { error: string }
  | { crate: true; shot: CastShot; token: PendingCast }
  | { crate: false; fish: CastCandidate; shot: CastShot; token: PendingCast }

/**
 * ONE CAST, ROLLED. Everything castLine decides once it knows the captain may
 * cast here: which Ancient Deep giants are in the water, crate or fish, which
 * fish, how long the bite takes, a Lightspeed instant bite, the jackpot or the
 * double, the Locked-In haul, and the Vigil rank a released giant fights for.
 * Returns the shot for the client and the token castLine persists.
 */
export function rollCast(i: CastRollInput): CastRoll {
  const { habitat, baitType, candidates, rod, locked, patience, renown, hotspot: hs, eventRarityBonus, stale, firstEver } = i
  if (!candidates || candidates.length === 0) return { error: 'No fish found in this zone' }

  // Ancient Deep pool filter:
  //   1. Already-caught trophies always filter out (one-and-done).
  //   2. With regular bait, ALL trophies filter out — the 12 regulars
  //      bite on worms etc., but the 6 prehistoric trophies will only
  //      surface for a Luminous or Golden Lure. Sell_value === 0 is
  //      the trophy discriminator (matches the trophy/inventory split
  //      in the catch handler).
  // Set inside the ancient_deep branch below; read again when the shot is built.
  let vigilState: VigilState = {}

  let pool = candidates
  if (habitat === 'ancient_deep') {
    const caught = new Set<number>(i.ancientCatches)
    // THE LONG VIGIL: a giant you have RELEASED is back in the water and can be
    // hooked again. ancient_catches still lists it (that array is append-only —
    // the finale gate and the ancient_ones badge read it), so "on the wall" is
    // caught AND not released.
    const vigil = vigilFor(i.ancientVigil, i.ancientCatches)
    vigilState = vigil
    const isLure = baitType === 'luminous' || baitType === 'golden'
    // Megalodon (143) is the final-final boss of fishing: it never surfaces until
    // the other five giants (144-148) are all on the wall. Enforced HERE, server-
    // side, so it holds no matter what a client claims.
    const megalodonLocked = !MEGALODON_PREREQS.every(id => caught.has(id))
    pool = candidates.filter(f => {
      if (caught.has(f.id) && !isReleased(vigil, f.id)) return false
      if (!isLure && !i.alwaysAncientTrophy && (f.sell_value ?? 0) === 0) return false
      if (f.id === MEGALODON_ID && megalodonLocked) return false
      return true
    })
    if (pool.length === 0) return { error: 'You have caught every Ancient Deep species available with this bait!' }
  }

  // Crate encounter (see castLine for the history): the zone's rate times the
  // rod, the Angler's Patience, renown Providence and the hotspot. A stale token
  // from other water hands its crate decision on, so abandoning and hopping
  // zones cannot reroll the chest check. The first cast ever is always a fish.
  const isCrate = firstEver
    ? false
    : stale
      ? stale.fishId === CRATE_FISH_ID
      : rngNext() < zoneCrateChance(habitat) * (rod.crateChanceMult ?? 1) * patience.crateChanceMult * renown.crateChanceMult * hs.crateChanceMult

  if (isCrate) {
    const crateWait = { shallows: 4000, open_waters: 7000, deep: 11000, abyss: 16000 }[habitat] ?? 6000
    const crateTier = rollCrateTier(habitat)
    const shot: CastShot = { fishId: CRATE_FISH_ID, catchDifficulty: 1, biteRarity: 1, waitMs: crateWait, crateTier }
    const token: PendingCast = { fishId: CRATE_FISH_ID, habitat, baitType, crateTier, jackpotMult: 1, doubleCatch: false, castAt: clockNow(), shot }
    return { crate: true, shot, token }
  }

  // Fish selection. In Ancient Deep the TROPHY (tier-5) roll is an EXPLICIT flat
  // chance set by the lure — Luminous 15%, Golden 20% — so the two premium lures
  // are meaningfully different. Rod + event rarity bonuses still amplify it.
  // Non-lure casts never reach the trophy pool (filtered out above).
  let fish: CastCandidate
  if (habitat === 'ancient_deep') {
    const trophyPool  = pool.filter(f => (f.sell_value ?? 0) === 0)
    const regularPool = pool.filter(f => (f.sell_value ?? 0) > 0)
    // TWO DIFFERENT HUNTS share this pool. A giant you have never landed is the
    // original story gate and keeps its shipped rate. One you RELEASED runs the
    // Vigil's own, much tighter roll (see vigilHuntChance).
    const everCaught = new Set<number>(i.ancientCatches)
    const firstHunt = trophyPool.filter(f => !everCaught.has(f.id))
    const released  = trophyPool.filter(f => everCaught.has(f.id))
    const rarityBonus = rod.rarityBonus + eventRarityBonus + locked.rarityBonus
    const baseTrophyChance = baitType === 'golden' ? 0.20 : baitType === 'luminous' ? 0.15 : 0
    const trophyChance = Math.min(0.95, baseTrophyChance * (1 + rarityBonus * 4))
    // Each released giant rolls on ITS OWN rank, so two out means two chances
    // (the water is genuinely busier) and the wariest stays hardest to raise.
    const onLure = baitType === 'luminous' || baitType === 'golden'
    const vigilHit = onLure
      ? released.find(f => rngNext() < vigilHuntChance(
          Math.min(VIGIL_MAX_RANK, (vigilState[String(f.id)]?.rank ?? 1) + 1),
          rarityBonus,
          baitType === 'golden' ? 'golden' : 'luminous',
        ))
      : undefined
    // WHICH GIANT SURFACES: the next uncaught one in ANCIENT_IDS order (Finn
    // hands them out one at a time, by name). Megalodon's gate above is
    // independent of this ordering.
    const nextInOrder = ANCIENT_IDS
      .map(id => firstHunt.find(f => f.id === id))
      .find((f): f is CastCandidate => !!f)
    if (i.alwaysAncientTrophy && trophyPool.length > 0) {
      // Test account: skip the roll entirely and hand over the next one due.
      fish = nextInOrder ?? [...trophyPool].sort((a, b) => a.id - b.id)[0]
    } else if (vigilHit) {
      fish = vigilHit
    } else if (nextInOrder && rngNext() < trophyChance) {
      fish = nextInOrder
    } else if (regularPool.length > 0) {
      fish = tierWeightedPick(regularPool, habitat, rod.rarityBonus + eventRarityBonus + locked.rarityBonus + hs.rarityBonus)
    } else {
      // Regulars somehow exhausted — hand back a trophy so the cast still lands.
      fish = trophyPool[Math.floor(rngNext() * trophyPool.length)]
    }
  } else if (firstEver) {
    // THE COMMONEST THING IN THIS WATER, chosen rather than rolled. bite_rarity
    // is a TIER and LOW IS COMMON; ties go to the easiest fish. Picked from the
    // data rather than pinned to an id, so a retired species cannot break the
    // one cast that has to work.
    fish = [...pool].sort((a, b) =>
      (a.bite_rarity - b.bite_rarity) || (a.catch_difficulty - b.catch_difficulty))[0]
  } else {
    fish = tierWeightedPick(pool, habitat, rod.rarityBonus + eventRarityBonus + locked.rarityBonus + hs.rarityBonus)
  }

  // Locked-In quickens bites at streak 3+ (−20%) / 10+ (−35%); take the faster of
  // the rod's base speed and the streak stage. NOT GIVEN THE FISH: the wait is a
  // roll on the zone, so it cannot announce what is on the line.
  let waitMs = fishWaitMs(habitat, baitType, i.fishingLevel, renown.biteWaitMult, Math.min(rodWaitMult(rod), locked.waitMult) * patience.waitMult * hs.waitMult)

  // Lightsaber Rod — "Lightspeed": a chance the bite is near-instant.
  let instantBite = false
  if ((rod.instantBiteChance ?? 0) > 0 && rngNext() < rod.instantBiteChance!) {
    waitMs = Math.min(waitMs, 700)
    instantBite = true
  }

  // The haul multipliers, rolled at cast time and locked into the token.
  // Ancient trophies (sell_value 0) never multiply; ancient regulars only double
  // with an always-double rod. Jackpot and double never stack (jackpot wins).
  // Neither on the first cast ever: two celebrations on top of the tour's is
  // how a first minute gets lost.
  const isAncientTrophyRoll = habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0
  const canDoubleHere = habitat !== 'ancient_deep' || (rod.doubleCatchChance ?? 0) >= 1
  const zoneJackpotChance = isAncientTrophyRoll ? 0 : jackpotChanceForZone(rod, habitat)
  const jackpotHit = !firstEver && zoneJackpotChance > 0 && rngNext() < zoneJackpotChance
  const rolledJackpotMult = jackpotHit ? (rod.jackpotMultiplier ?? 1) : 1
  const rolledDoubleCatch = !firstEver && !jackpotHit && !isAncientTrophyRoll && canDoubleHere
    && (rod.doubleCatchChance ?? 0) > 0 && rngNext() < (rod.doubleCatchChance ?? 0)

  const lockedQty = locked.catchQty > 1 ? locked.catchQty : undefined
  // A RELEASED giant fights for its next rank. vigilFor seeds rank 1 from
  // ancient_catches, so `+ 1` is the rank being attempted.
  const vigilAttempt = habitat === 'ancient_deep' && isReleased(vigilState, fish.id)
    ? Math.min(VIGIL_MAX_RANK, (vigilState[String(fish.id)]?.rank ?? 1) + 1)
    : undefined
  const shot: CastShot = { fishId: fish.id, catchDifficulty: fish.catch_difficulty, biteRarity: fish.bite_rarity, waitMs, instantBite, jackpotMult: rolledJackpotMult, doubleCatch: rolledDoubleCatch, catchQty: lockedQty, lockedStage: locked.stage, vigilRank: vigilAttempt }
  const token: PendingCast = { fishId: fish.id, habitat, baitType, jackpotMult: rolledJackpotMult, doubleCatch: rolledDoubleCatch, catchQty: lockedQty, castAt: clockNow(), shot }
  return { crate: false, fish, shot, token }
}

// ════════════════════════════════════════════════════════════════════════════
// ── THE LANDING ─────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//
// What a fish that made it into the boat is worth, once reelIn has bound the
// cast to its server token and claimed it. Moved out of reelIn verbatim
// (2026-09-28); the action reads, claims, and writes what these return.

/** The profile columns a landing reads. */
export type LandingProfile = {
  fishing_xp?: number | null
  current_perfect_streak?: number | null
  highest_perfect_streak?: number | null
  total_perfects?: number | null
  zone_perfects?: unknown
  prestige_levels?: unknown
  fishing_abyss_streak?: number | null
  has_phantom_hook?: boolean | null
  has_perfected_sigil?: boolean | null
  equipped_special?: string | null
  force_shiny_next_perfect?: boolean | null
  force_shiny_always?: boolean | null
  zone_golden_boost?: unknown
  ancient_catches?: unknown
  ancient_vigil?: unknown
  unlocked_pets?: unknown
  equipped_raid_items?: unknown
  finn_spoil_free?: string | null
  finn_spoil_paid?: string | null
  borrowed_jaw_xp?: number | null
}

/** The species columns a landing reads. */
export type LandingFish = {
  id: number; habitat: string; catch_difficulty: number; bite_rarity: number
  sell_value: number | null; length_min_in?: number | string | null; length_max_in?: number | string | null
}

export type LandingResult = 'perfect' | 'catch'

/** THE BORROWED JAW charges on FISHING xp, and only while it is mounted. */
function jawChargeAfter(p: LandingProfile, xpGained: number): number | null {
  const mounted = ((p.equipped_raid_items as string[] | null) ?? []).includes('borrowed_jaw')
    && (p.finn_spoil_free === 'nav' || p.finn_spoil_paid === 'nav')
  return mounted ? Number(p.borrowed_jaw_xp ?? 0) + xpGained : null
}

/**
 * THE STREAK RECORD. The live counter runs on regardless; the record believes
 * it only up to STREAK_RECORD_CEILING (a streak past it is flagged, not
 * written: gameplay is not what gets forged, the record books are).
 */
function streakRecord(streak: number, best: number, zone: string): { anomaly: boolean; updates: Record<string, unknown> } {
  if (streak > STREAK_RECORD_CEILING) return { anomaly: true, updates: {} }
  if (streak > best) {
    return { anomaly: false, updates: { highest_perfect_streak: streak, highest_streak_set_at: new Date(clockNow()).toISOString(), best_streak_zone: zone } }
  }
  return { anomaly: false, updates: {} }
}

export type AncientLanding = {
  isNewTrophy: boolean
  xpGained: number
  newXP: number
  perfectStreak: number
  /** Written to profiles in one update by reelIn. */
  updates: Record<string, unknown>
  /** A streak past the record ceiling: flag it, do not record it. */
  anomaly: boolean
  vigil: VigilState
  vigilWritten: boolean
  vigilRankUp: { from: number; to: number } | null
  /** All six at rank 5 and the pet not owned yet: grant it. */
  grantVigilPet: boolean
  trophyCount: number
  sigilBonus: number
  badges: string[]
}

/**
 * ONE OF THE SIX GIANTS, LANDED. reelIn is only reached once the whole
 * multi-phase fight is cleared, so `result` is the FINAL phase: perfect lands a
 * Vigil rank on a released giant, an ordinary catch just puts it back on the
 * wall. ancient_catches stays append-only (the finale's gate).
 */
export function landAncient(p: LandingProfile, fishId: number, result: LandingResult, renownXpMult: number): AncientLanding {
  const existing = (p.ancient_catches as number[] | null) ?? []
  const isNewTrophy = !existing.includes(fishId)

  const vigil = vigilFor(p.ancient_vigil, existing)
  const vigilKey = String(fishId)
  const wasReleased = vigil[vigilKey]?.released === true
  const fromRank = vigil[vigilKey]?.rank ?? 1
  const paidThrough = vigil[vigilKey]?.paid ?? 0
  const perfect = result === 'perfect'

  const xpGained = Math.round(ancientCatchXP({ firstCatch: isNewTrophy, wasReleased, fromRank, perfect, paidThrough }) * renownXpMult)
  const jawCharge = jawChargeAfter(p, xpGained)
  const newXP = (p.fishing_xp ?? 0) + xpGained
  // Perfect streak counts in ancient too (no streak XP bonus here, by design).
  const aStreak = perfect ? (p.current_perfect_streak ?? 0) + 1 : 0
  const updates: Record<string, unknown> = { fishing_xp: newXP, current_perfect_streak: aStreak, catch_pending: false, ...(jawCharge !== null ? { borrowed_jaw_xp: jawCharge } : {}) }
  if (perfect) updates.total_perfects = (p.total_perfects ?? 0) + 1
  const rec = streakRecord(aStreak, p.highest_perfect_streak ?? 0, 'ancient_deep')
  Object.assign(updates, rec.updates)
  if (isNewTrophy) updates.ancient_catches = [...existing, fishId]

  let vigilRankUp: { from: number; to: number } | null = null
  let grantVigilPet = false
  let vigilWritten = false
  if (wasReleased) {
    const ranked = perfect && fromRank < VIGIL_MAX_RANK
    const to = ranked ? fromRank + 1 : fromRank
    // `paid` records that this rung has spent its one consolation.
    const paid = vigilPaidAfter({ wasReleased, fromRank, perfect, paidThrough })
    vigil[vigilKey] = paid > 0 ? { rank: to, released: false, paid } : { rank: to, released: false }
    updates.ancient_vigil = vigil
    vigilWritten = true
    if (ranked) vigilRankUp = { from: fromRank, to }
    // THE CAPSTONE, granted on STATE: all six at rank 5 pays the pet.
    if (vigilComplete(vigil)) {
      const ownedPets = (p.unlocked_pets as string[] | null) ?? []
      grantVigilPet = !ownedPets.includes(VIGIL_PET_ID)
    }
  }
  const trophyCount = isNewTrophy ? existing.length + 1 : existing.length
  const badges: string[] = []
  if (trophyCount >= 6) badges.push('ancient_ones')
  if (aStreak >= 10) badges.push('unbroken')
  // Perfected Sigil: equipped + perfect, +10 ⟡ × min(streak, 3).
  const sigilBonus = perfect && p.has_perfected_sigil && p.equipped_special === 'perfected_sigil'
    ? Math.min(aStreak, 3) * 10
    : 0
  return { isNewTrophy, xpGained, newXP, perfectStreak: aStreak, updates, anomaly: rec.anomaly, vigil, vigilWritten, vigilRankUp, grantVigilPet, trophyCount, sigilBonus, badges }
}

const PERFECT_BAIT_SAVE_CHANCE = 0.5

export type FishLandingInput = {
  profile: LandingProfile
  fish: LandingFish
  result: LandingResult
  baitType: string
  rod: RodDef
  eye: Pick<EyeEffects, 'perfectBaitSave' | 'goldenOddsMult' | 'fishingXpMult'>
  renownXpMult: number
  /** The haul the cast token locked in. */
  doubleCatch: boolean
  jackpotMult: number
  lockedCatchQty: number
  /** Fish already in the hold, for the capacity clamp. */
  holdCount: number
  holdCapacity: number
}

export type FishLanding = {
  baitSaved: boolean
  isShiny: boolean
  /** Fish actually banked (0 when the hold is full; 1 for a shiny). */
  catchQty: number
  effectiveDoubleCatch: boolean
  effectiveJackpotMult: number
  xpGained: number
  newXP: number
  /** The pre-multiplier streak XP, as it was always reported. */
  streakBonusXP: number
  xpCatch: number
  perfectBonusXP?: number
  xpStreak: number
  perfectStreak: number
  sigilBonus: number
  wormhole: boolean
  size: { sizeIn: number; sizeTier?: FishSizeTier; sizeMin: number | null; sizeMax: number | null }
  deepStirs: boolean
  /** Written to profiles in one update by reelIn (pending_reroll aside). */
  updates: Record<string, unknown>
  anomaly: boolean
  levels: { from: number; to: number }
  badges: string[]
}

/**
 * AN ORDINARY FISH, LANDED (and the Ancient Deep's sellable regulars). The bait
 * save, the shiny, the haul clamped to the hold, the XP and the three parts it
 * is reported in, the streak, the Sigil, the Wormhole, the size, and the rare
 * omen in the Ancient Deep.
 */
export function landFish(i: FishLandingInput): FishLanding {
  const { profile: p, fish, result, rod, eye } = i
  const perfect = result === 'perfect'

  // Perfect: 50% chance to return the bait used for this cast. The Phantom Hook
  // adds 25% on any catch, but only when SEATED in the special slot. The
  // Primeval Eye's top tier makes a perfect never cost bait.
  let baitSaved = perfect && rngNext() < PERFECT_BAIT_SAVE_CHANCE
  const phantomSeated = p.has_phantom_hook && p.equipped_special === 'phantom_hook'
  if (!baitSaved && phantomSeated) baitSaved = rngNext() < 0.25
  if (!baitSaved && eye.perfectBaitSave && perfect) baitSaved = true

  // Shinies: Perfect + a 1/SHINY_ODDS roll, with two admin overrides for QA.
  // A shiny is the whole catch: it lives in shiny_catches, never the hold.
  const forcedShinyOnce = !!p.force_shiny_next_perfect && perfect
  const forcedShinyAlways = !!p.force_shiny_always
  const goldenWipes = ((p.zone_golden_boost as Record<string, number> | null) ?? {})[fish.habitat] ?? 0
  const isShiny = forcedShinyOnce || forcedShinyAlways || rollShiny({ isPerfect: perfect, habitat: fish.habitat, sellValue: fish.sell_value ?? 0, oddsMult: goldenBoostMult(goldenWipes) * eye.goldenOddsMult })

  // The haul: jackpot beats Locked-In triple beats double; the Ancient Deep only
  // doubles on an always-double rod; clamped to the hold's free space.
  const noDoubleCatch = fish.habitat === 'ancient_deep' && (rod.doubleCatchChance ?? 0) < 1
  const effectiveDoubleCatch = i.doubleCatch && !noDoubleCatch
  const effectiveJackpotMult = Math.min(i.jackpotMult, 100)
  const desired = isShiny ? 1 : (effectiveJackpotMult > 1 ? effectiveJackpotMult : (i.lockedCatchQty > 1 ? i.lockedCatchQty : (effectiveDoubleCatch ? 2 : 1)))
  const catchQty = isShiny ? 1 : Math.min(desired, Math.max(0, i.holdCapacity - i.holdCount))

  const newAbyssStreak = perfect && fish.habitat === 'abyss' ? (p.fishing_abyss_streak ?? 0) + 1 : 0
  const zonePerfects = { ...((p.zone_perfects as Record<string, number> | null) ?? {}) }
  if (perfect) zonePerfects[fish.habitat] = (zonePerfects[fish.habitat] ?? 0) + 1
  const zonePrestige = ((p.prestige_levels as Record<string, number> | null) ?? {})[fish.habitat] ?? 0
  // +10% catch XP per prestige, capped at P5.
  const prestigeXPMult = 1 + Math.min(zonePrestige, 5) * 0.10
  const perfectXpMult = perfect ? (rod.perfectXpMult ?? 1) : 1
  // The streak MULTIPLIES the catch (lib/perfectStreak), scaled by level.
  const newPerfectStreak = perfect ? (p.current_perfect_streak ?? 0) + 1 : 0
  const mult = streakMult(newPerfectStreak, getLevelFromXP(p.fishing_xp ?? 0))
  const baseCatchXP = catchXP(fish.catch_difficulty, fish.habitat, perfect)
  const streakBonusXP = Math.round(baseCatchXP * (mult - 1))
  const xpGained = Math.round((baseCatchXP + streakBonusXP) * prestigeXPMult * perfectXpMult * i.renownXpMult * eye.fishingXpMult)
  // THE THREE PARTS THE CARD SHOWS, and they add up to xpGained.
  const perfectBonusXP = perfect
    ? Math.round(baseCatchXP * prestigeXPMult * perfectXpMult * i.renownXpMult * eye.fishingXpMult)
      - Math.round(catchXP(fish.catch_difficulty, fish.habitat, false) * prestigeXPMult * i.renownXpMult * eye.fishingXpMult)
    : undefined
  const xpStreak = xpGained - Math.round(baseCatchXP * prestigeXPMult * perfectXpMult * i.renownXpMult * eye.fishingXpMult)
  const xpCatch = xpGained - (perfectBonusXP ?? 0) - xpStreak
  const jawCharge = jawChargeAfter(p, xpGained)
  const newXP = (p.fishing_xp ?? 0) + xpGained

  // Perfected Sigil: equipped + perfect, +10 ⟡ × min(streak, 3).
  const sigilBonus = perfect && p.has_perfected_sigil && p.equipped_special === 'perfected_sigil'
    ? Math.min(newPerfectStreak, 3) * 10
    : 0
  // Galaxy Rod's Wormhole: a normal landable catch can be rerolled once.
  const wormhole = !!rod.wormhole && !isShiny && catchQty > 0

  const updates: Record<string, unknown> = {
    fishing_abyss_streak: newAbyssStreak, fishing_xp: newXP, current_perfect_streak: newPerfectStreak, catch_pending: false,
    ...(perfect ? { zone_perfects: zonePerfects } : {}),
    ...(jawCharge !== null ? { borrowed_jaw_xp: jawCharge } : {}),
  }
  if (perfect) updates.total_perfects = (p.total_perfects ?? 0) + 1
  const rec = streakRecord(newPerfectStreak, p.highest_perfect_streak ?? 0, fish.habitat)
  Object.assign(updates, rec.updates)

  const from = getLevelFromXP(p.fishing_xp ?? 0)
  const to = getLevelFromXP(newXP)
  const badges: string[] = []
  if (from < 100 && to >= 100) badges.push('master_angler')
  if (newPerfectStreak >= 10) badges.push('unbroken')

  // Size: rolled inside the species range; a shiny is locked to the max.
  const sizeMin = fish.length_min_in == null ? null : Number(fish.length_min_in)
  const sizeMax = fish.length_max_in == null ? null : Number(fish.length_max_in)
  let sizeIn = 0
  let sizeTier: FishSizeTier | undefined
  if (sizeMin != null && sizeMax != null) {
    if (isShiny) { sizeIn = sizeMax; sizeTier = 'trophy' }
    else { const roll = rollFishSize(sizeMin, sizeMax); sizeIn = roll.lengthIn; sizeTier = roll.tier }
  }

  // The Ancient Deep's rare omen: a regular on common bait while giants remain.
  const deepStirs = fish.habitat === 'ancient_deep'
    && i.baitType !== 'luminous' && i.baitType !== 'golden'
    && (((p.ancient_catches as number[] | null) ?? []).length < 6)
    && rngNext() < 0.14

  return {
    baitSaved, isShiny, catchQty, effectiveDoubleCatch, effectiveJackpotMult,
    xpGained, newXP, streakBonusXP, xpCatch, perfectBonusXP, xpStreak, perfectStreak: newPerfectStreak,
    sigilBonus, wormhole, size: { sizeIn, sizeTier, sizeMin, sizeMax }, deepStirs,
    updates, anomaly: rec.anomaly, levels: { from, to }, badges,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── THE REST OF A CAST: timing, crates, the Wormhole, prestige ─────────────
// ════════════════════════════════════════════════════════════════════════════

/**
 * THE BITE FLOOR. The token pins WHAT was on the line; this pins WHEN. The
 * client never shows a bite before max(760ms, the rolled wait), so a reel (or
 * a crate opened) sooner than that came from a script replaying cast and reel
 * back to back. Every clock is the server's: castAt was written by castLine.
 */
export function biteFloorMs(token: Pick<PendingCast, 'shot'>): number {
  return token.shot?.instantBite ? 760 : Math.max(760, Number(token.shot?.waitMs ?? 0))
}

/** Did this reel arrive before the bite could have happened? */
export function reelTooEarly(token: Pick<PendingCast, 'shot' | 'castAt'>): { early: boolean; elapsed: number; floor: number } {
  const floor = biteFloorMs(token)
  const elapsed = clockNow() - Number(token.castAt ?? 0)
  return { early: elapsed < floor, elapsed, floor }
}

/**
 * A CRATE MOVES THE STREAK, and nothing else: a perfect reel adds one,
 * anything less resets it. total_perfects, the shiny rolls and the Finn
 * perfect challenge are about landing FISH well, and a crate is not a fish.
 */
export function crateStreak(p: Pick<LandingProfile, 'current_perfect_streak' | 'highest_perfect_streak'>, result: LandingResult, habitat: string): { streak: number; updates: Record<string, unknown>; anomaly: boolean } {
  const streak = result === 'perfect' ? (p.current_perfect_streak ?? 0) + 1 : 0
  const rec = streakRecord(streak, p.highest_perfect_streak ?? 0, habitat)
  return { streak, updates: { current_perfect_streak: streak, catch_pending: false, ...rec.updates }, anomaly: rec.anomaly }
}

/**
 * WHERE THE WORMHOLE COMES OUT: a DIFFERENT fish from the same water, picked on
 * the zone's normal rarity odds with the rod's own bias (better or worse). The
 * original is excluded so a reroll always lands somewhere else. Null when the
 * water holds nothing else. The size is rolled like any catch.
 */
export function wormholeExit<T extends CastCandidate>(candidates: T[], origId: number, habitat: string, rod: RodDef): T | null {
  const pool = candidates.filter(f => f.id !== origId)
  if (pool.length === 0) return null
  return tierWeightedPick(pool, habitat, rod.rarityBonus)
}

/** A catch's size, or none when the species has no range. */
export function rollCatchSize(fish: Pick<LandingFish, 'length_min_in' | 'length_max_in'>): { sizeIn: number; sizeTier?: FishSizeTier; sizeMin: number | null; sizeMax: number | null } {
  const sizeMin = fish.length_min_in == null ? null : Number(fish.length_min_in)
  const sizeMax = fish.length_max_in == null ? null : Number(fish.length_max_in)
  if (sizeMin == null || sizeMax == null) return { sizeIn: 0, sizeMin, sizeMax }
  const roll = rollFishSize(sizeMin, sizeMax)
  return { sizeIn: roll.lengthIn, sizeTier: roll.tier, sizeMin, sizeMax }
}

/** The four waters that prestige (the Ancient Deep does not). */
export const PRESTIGE_ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const

/**
 * ONE PRESTIGE. Below the cap it is a level; AT the cap (PRESTIGE_MAX) a wipe
 * no longer raises the level and instead adds a permanent GOLDEN BOOST to this
 * water. Either way the cycle's catch log resets (goldens kept) and the
 * completion reward re-opens; the caller does those writes.
 */
export function prestigeStep(levels: Record<string, number>, goldenBoosts: Record<string, number>, zone: string, max: number): {
  atMax: boolean; newLevel: number; newLevels: Record<string, number>
  newGoldenBoost: number; newGoldenBoosts: Record<string, number>; allZonesPrestiged: boolean
} {
  const cur = levels[zone] ?? 0
  const atMax = cur >= max
  const newLevel = atMax ? max : cur + 1
  const newLevels = { ...levels, [zone]: newLevel }
  const newGoldenBoost = (goldenBoosts[zone] ?? 0) + (atMax ? 1 : 0)
  const newGoldenBoosts = atMax ? { ...goldenBoosts, [zone]: newGoldenBoost } : goldenBoosts
  const allZonesPrestiged = PRESTIGE_ZONES.every(z => (newLevels[z] ?? 0) >= 1)
  return { atMax, newLevel, newLevels, newGoldenBoost, newGoldenBoosts, allZonesPrestiged }
}
