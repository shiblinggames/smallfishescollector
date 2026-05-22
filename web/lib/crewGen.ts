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

import { FISH_GROUPS } from './fishGroups'
import { BUFF_IDS, FLAW_IDS } from './crewEffects'

export type CrewRarity = 1 | 2 | 3 | 4

export const RARITY_NAMES: Record<CrewRarity, string> = {
  1: 'Common', 2: 'Rare', 3: 'Epic', 4: 'Legendary',
}

export const RARITY_COLORS: Record<CrewRarity, string> = {
  1: '#8a857c', 2: '#3b8ef0', 3: '#a78bfa', 4: '#f0c040',
}

// Board rarity weights [Common, Rare, Epic, Legendary]. The free daily board
// is a slow trickle (never Legendary, very rare Epic); the 100-gem reroll is
// the real pull (boosted Epic, the only path to a Legendary).
export const FREE_WEIGHTS: [number, number, number, number] = [76, 22, 2, 0]
export const GEM_WEIGHTS:  [number, number, number, number] = [50, 33, 14, 3]

// Total stat budget band per rarity (inclusive).
const STAT_BUDGET: Record<CrewRarity, [number, number]> = {
  1: [8, 13],
  2: [13, 18],
  3: [19, 25],
  4: [28, 34],
}

// How many effects roll per rarity, and the chance each one is a buff.
const EFFECT_PLAN: Record<CrewRarity, { count: [number, number]; buffChance: number }> = {
  1: { count: [0, 1], buffChance: 0.45 },
  2: { count: [1, 1], buffChance: 0.6 },
  3: { count: [1, 2], buffChance: 0.7 },
  4: { count: [2, 2], buffChance: 1.0 }, // legendaries are all upside
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

/** Roll a power/dodge/fortune line that sums to a rarity-banded budget, with a
 *  random primary-stat lean so crew feel distinct. */
export function rollStats(rarity: CrewRarity): { power: number; dodge: number; fortune: number } {
  const [lo, hi] = STAT_BUDGET[rarity]
  const budget = randInt(lo, hi)
  const stats = [1, 1, 1] // floor: every stat at least 1
  let remaining = Math.max(0, budget - 3)

  const w = [Math.random(), Math.random(), Math.random()]
  const primary = randInt(0, 2)
  w[primary] += 1.2 // lean toward a primary stat
  const sumW = w[0] + w[1] + w[2]

  let assigned = 0
  for (let i = 0; i < 3; i++) {
    const a = Math.round((remaining * w[i]) / sumW)
    stats[i] += a
    assigned += a
  }
  // Reconcile rounding drift onto the primary stat.
  stats[primary] += remaining - assigned
  if (stats[primary] < 1) stats[primary] = 1

  return { power: stats[0], dodge: stats[1], fortune: stats[2] }
}

/** Roll the carried effect ids for a crew member of the given rarity. */
export function rollEffectIds(rarity: CrewRarity): string[] {
  const plan = EFFECT_PLAN[rarity]
  const count = randInt(plan.count[0], plan.count[1])
  const buffs = [...BUFF_IDS]
  const flaws = [...FLAW_IDS]
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const pool = Math.random() < plan.buffChance ? buffs : flaws
    if (pool.length === 0) continue
    const idx = randInt(0, pool.length - 1)
    out.push(pool.splice(idx, 1)[0]) // no duplicate effect on one crew member
  }
  return out
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
export function rollCrew(cardId: number, rarity: CrewRarity): RolledCrew {
  const stats = rollStats(rarity)
  return { cardId, rarity, ...stats, effects: rollEffectIds(rarity) }
}
