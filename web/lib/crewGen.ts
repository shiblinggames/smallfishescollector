// Crew generation for the Darkest-Dungeon-style recruit system.
//
// Rarity == group (the single source of truth is lib/fishGroups.ts):
//   group 1 -> Common, 2 -> Rare, 3 -> Epic, 4 -> Legendary.
// A recruit is rolled by first picking a RARITY (weighted), then a random
// portrait (card) from that group, then a stat budget + a few effects.
//
// Stat budgets are tuned to the existing base-stat totals per group so the
// rolled crew stay balanced against the live Voyage/Raid scoring formulas
// (Common ~8-13, Rare ~13-18, Epic ~19-25, Legendary ~28-34 total).

import { drawDeepTrait } from './crewTraits'
import { FISH_GROUPS } from './fishGroups'
import { effectPoolForRarity } from './crewEffects'

export type CrewRarity = 1 | 2 | 3 | 4

export const RARITY_NAMES: Record<CrewRarity, string> = {
  1: 'Common', 2: 'Rare', 3: 'Epic', 4: 'Legendary',
}

export const RARITY_COLORS: Record<CrewRarity, string> = {
  1: '#8a857c', 2: '#3b8ef0', 3: '#a78bfa', 4: '#f0c040',
}

// Crew nicknames, keyed by lowercased card slug. Species without an entry fall
// back to their catalog name.
const CREW_NAMES: Record<string, string> = {
  angelfish: 'Ang', anglerfish: 'Anglerr', bass: 'Bob', beluga_whale: 'Bellie',
  blobfish: 'Bloo', blue_marlin: 'Marl', blue_whale: 'Big Blue', catfish: 'Kat',
  clownfish: 'Chloe', doby_mick: 'Doby', eel: 'Ell', flounder: 'Floop',
  giant_squid: 'Skwid', goblin_shark: 'Gob', goldfish: 'Goldie',
  great_white_shark: 'Great White', hammerhead_shark: 'Hammer', humpback_whale: 'Humps',
  jellyfish: 'Jelly',
  koi: 'Koy', krill: 'Kreel', lionfish: 'Linus', manta_ray: 'Manny', minnow: 'Min',
  nurse_shark: 'Nursa', oarfish: "O'her", orca: 'Orc', piranha: 'Perry',
  pufferfish: 'Puff', red_snapper: 'Snappy', salmon: 'Sam', sardine: 'Sard',
  sailfish: 'Selly', swordfish: 'Sawyer', tiger_shark: 'Ty', tuna: 'Toon', whale_shark: 'Welly',
  coelacanth: 'Laz',
}

/** Crew display nickname for a card slug, falling back to the catalog name. */
export function crewDisplayName(slug: string, fallbackName: string): string {
  return CREW_NAMES[slug.toLowerCase()] ?? fallbackName
}

// Board rarity weights [Common, Rare, Epic, Legendary]. The free daily board
// is a slow trickle (never Legendary, very rare Epic); the 100-gem reroll is
// the real pull (boosted Epic, the only path to a Legendary).
export const FREE_WEIGHTS: [number, number, number, number] = [76, 22, 2, 0]
// Gem rerolls are the real pull. Tuned so that per 3-candidate reroll an Epic
// shows up ~1 in 10 and a Legendary ~1 in 50 (only 2 legendary fish exist);
// the rest are commons/rares.
export const GEM_WEIGHTS:  [number, number, number, number] = [62, 34, 3.5, 0.65]

// Total stat budget band per rarity (inclusive).
const STAT_BUDGET: Record<CrewRarity, [number, number]> = {
  1: [8, 13],
  2: [13, 18],
  3: [19, 25],
  4: [28, 34],
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Group (1-4) for a card slug, or null if it isn't a crew fish. Slugs in the
 *  cards table are capitalised; FISH_GROUPS keys are lowercase. */
export function groupForSlug(slug: string): CrewRarity | null {
  const key = slug.toLowerCase()
  const i = FISH_GROUPS.findIndex(g => g.has(key))
  return i >= 0 ? ((i + 1) as CrewRarity) : null
}

/** Weighted rarity roll. weights index 0-3 == rarity 1-4. */
export function rollRarity(weights: readonly [number, number, number, number]): CrewRarity {
  const total = weights[0] + weights[1] + weights[2] + weights[3]
  let r = Math.random() * total
  for (let i = 0; i < 4; i++) {
    if (r < weights[i]) return (i + 1) as CrewRarity
    r -= weights[i]
  }
  return 1
}

/** Roll a power/dodge/fortune line summing to a rarity-banded budget, strongly
 *  biased toward the fish's catalog stat profile so each species keeps its
 *  identity (sharks skew power, goldfish skew fortune, eels skew dodge, etc.).
 *  Light jitter keeps two of the same species from being identical. */
export function rollStats(
  rarity: CrewRarity,
  profile: { power: number; dodge: number; fortune: number },
): { power: number; dodge: number; fortune: number } {
  const [lo, hi] = STAT_BUDGET[rarity]
  const budget = randInt(lo, hi)
  const stats = [1, 1, 1] // floor: every stat at least 1
  const remaining = Math.max(0, budget - 3)

  // Distribute by the fish's profile (strong affinity) with ±15% jitter. A small
  // floor stops a near-zero base stat from being mathematically impossible.
  const prof = [profile.power, profile.dodge, profile.fortune].map(v => Math.max(0.5, v))
  const w = prof.map(v => v * (0.85 + Math.random() * 0.3))
  const sumW = w[0] + w[1] + w[2]

  let assigned = 0
  for (let i = 0; i < 3; i++) {
    const a = Math.round((remaining * w[i]) / sumW)
    stats[i] += a
    assigned += a
  }
  // Reconcile rounding drift onto the highest-weighted (primary) stat.
  const primary = w[0] >= w[1] && w[0] >= w[2] ? 0 : w[1] >= w[2] ? 1 : 2
  stats[primary] += remaining - assigned
  if (stats[primary] < 1) stats[primary] = 1

  return { power: stats[0], dodge: stats[1], fortune: stats[2] }
}

// ── Trait roll (new system, 2026-06-08) ────────────────────────────────────
// Every crew member rolls ONE trait at recruit. The trait is a stat triple
// {power, dodge, fortune} where each value is in [-3, +3], rolled per-stat
// with a rarity-weighted magnitude distribution and a 50/50 sign. Net swing
// is bounded -9 to +9 by construction. There's no fixed pool of named traits
// any more — the trait identity IS the stat combo, encoded as 's:P,D,F' so it
// fits the existing user_crew.effects: string[] column without a migration.
//
// Magnitude weights below were tuned so Common crew cluster around zero
// (~22% are fully neutral) and Legendary crew are likely to hit the ±3
// extremes (~40% chance per stat). See crewEffects.decodeTraitStats /
// traitLabel for the parse + display side.
const MAG_WEIGHTS: Record<CrewRarity, [number, number, number, number]> = {
  1: [60, 25, 10,  5],   // Common:     P(0,1,2,3) magnitude
  2: [40, 30, 20, 10],   // Rare
  3: [25, 25, 30, 20],   // Epic
  4: [10, 20, 30, 40],   // Legendary
}

/** The hard ceiling on a normally-rolled stat. Recruits never exceed this. */
export const TRAIT_MAX = 3

/**
 * THE DEEP CEILING. Only the Leviathan re-cut reaches 4, and it now gets there
 * by drawing from lib/crewTraits rather than by rolling magnitudes -- the old
 * DEEP_MAG_WEIGHTS table was removed with the lattice it fed.
 *
 * Keeping the 4 off the recruit board still matters for the same reason it
 * always did: every crew you can buy tops out at 3, so nothing about existing
 * balance moves, and a Divine hand is proof of the chase rather than proof of
 * a good draw.
 */
export const DEEP_TRAIT_MAX = 4

function rollMagnitude(rarity: CrewRarity): number {
  const w: readonly number[] = MAG_WEIGHTS[rarity]
  let total = 0
  for (const n of w) total += n
  let r = Math.random() * total
  for (let i = 0; i < w.length; i++) {
    if (r < w[i]) return i
    r -= w[i]
  }
  return 0
}

export interface RolledTrait {
  power:   number
  dodge:   number
  fortune: number
}

/**
 * Roll one stat-only trait for a crew of the given rarity. Each stat is rolled
 * independently: magnitude from the rarity-weighted table, sign 50/50, so a
 * single trait can land anywhere from (-3,-3,-3) to (+3,+3,+3).
 *
 * `deep` swaps in the Leviathan table, which reaches 4. Nothing but the top
 * hall's re-cut passes it.
 */
export function rollTrait(rarity: CrewRarity, deep = false): RolledTrait {
  // THE DEEP ROLL IS A DRAW, NOT THREE ROLLS. Building a trait from three
  // independent stats meant a 9x9x9 lattice: 729 outcomes nobody authored, 82%
  // of them mixed-sign leftovers, and Divine sitting on one corner at 0.137% --
  // about 30x rarer than a Terraria top reforge, which is the feel this bunk
  // wanted. lib/crewTraits is a written list of 28 named results drawn flat, so
  // every outcome is one somebody chose and Divine lands at 3.6%.
  //
  // Rarity is deliberately not consulted here: it already decides base stats
  // (STAT_BUDGET), and a Common holding Divine still loses to a Legendary
  // holding nothing, so weighting the draw too would count it twice.
  if (deep) {
    const t = drawDeepTrait()
    return { power: t.power, dodge: t.dodge, fortune: t.fortune }
  }
  // The recruit board keeps the weighted roll. Rarity still shapes what shows
  // up on a board, and a bought crew still tops out at 3 -- a 4 remains
  // something only the top hall can produce.
  const sign = () => (Math.random() < 0.5 ? -1 : 1)
  return {
    power:   rollMagnitude(rarity) * sign(),
    dodge:   rollMagnitude(rarity) * sign(),
    fortune: rollMagnitude(rarity) * sign(),
  }
}

/** Encode a rolled trait as a single string id ('s:P,D,F') so it fits the
 *  existing user_crew.effects: string[] column. Returns null when the trait
 *  is fully neutral so we can store [] (= no trait) for those crew. */
export function encodeTraitId(t: RolledTrait): string | null {
  if (t.power === 0 && t.dodge === 0 && t.fortune === 0) return null
  return `s:${t.power},${t.dodge},${t.fortune}`
}

export interface RolledCrew {
  cardId: number
  rarity: CrewRarity
  power: number
  dodge: number
  fortune: number
  effects: string[]
}

/** Fully roll one crew member for a known portrait + rarity. */
export function rollCrew(
  cardId: number,
  rarity: CrewRarity,
  profile: { power: number; dodge: number; fortune: number },
): RolledCrew {
  const stats = rollStats(rarity, profile)
  const traitId = encodeTraitId(rollTrait(rarity))
  return { cardId, rarity, ...stats, effects: traitId ? [traitId] : [] }
}
