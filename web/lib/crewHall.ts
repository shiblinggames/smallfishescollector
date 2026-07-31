// Crew Hall upgrade ladder — Darkest Dungeon-style building progression.
// The hall itself levels up (paid in doubloons, profiles.crew_hall_tier);
// each tier raises the level NEW recruits arrive at. Existing crew are
// untouched — this is about the quality of sailor a famous hall attracts,
// not retroactive training.
//
// Why start LEVELS instead of stat bonuses: level is derived from XP
// (lib/crewLevel.ts), so granting a starting level is just inserting the
// matching XP — every downstream system (stat ticks at Lv 3/6/9...,
// ability unlock at Lv 10 via crewClasses, Lv chips, XP bars) works with
// zero extra wiring. Max tier means recruits arrive raid-ready: ability
// already unlocked + 3 stat ticks banked.
//
// Cost ladder is exponential (×3 steps, ~200k total) — deliberately the
// same lifetime investment as the endgame ship (22k→80k→200k), so the
// hall is the parallel long-term doubloon sink for crew-focused players.
//
// Each tier also carries a visual THEME for the recruit board region —
// the hall should visibly improve as it's upgraded (weathered driftwood
// → oak → brass → gold → radiant). Consumed by CrewClient's recruit tab
// panel + the upgrade modal.

import { XP_TABLE } from './crewLevel'

export type CrewHallTierNum = 1 | 2 | 3 | 4 | 5

export type CrewHallTierDef = {
  tier: CrewHallTierNum
  name: string
  /** Level new recruits start at while the hall is at this tier. */
  startLevel: number
  /** Doubloon cost to UPGRADE TO this tier (0 for the base tier). */
  cost: number
  /** Theme accent for the recruit-board region + upgrade UI. */
  accent: string
  /**
   * Opaque base the hero paints on. Every accent here is warm gold or brown,
   * and the hero used to sit them on a navy `rgba(14,19,28,0.97)` shared with
   * the rest of the page - gold over navy is what read as a muddy yellow wash.
   * The base carries the tier as much as the accent does: driftwood is nearly
   * colourless, the Hall of Legends is rich.
   */
  base: string
  /** Short flavor line shown on the hall panel + upgrade modal. */
  flavor: string
  /** Soft outer glow on the board region — only the top tiers earn one. */
  glow?: string
}

export const CREW_HALL_TIERS: Record<CrewHallTierNum, CrewHallTierDef> = {
  1: {
    tier: 1, name: 'Driftwood Hall', startLevel: 1, cost: 0,
    accent: '#97836a',
    base: '#16130f',
    flavor: 'Salvaged planks and a leaky roof. Greenhorns only.',
  },
  2: {
    tier: 2, name: 'Oakhewn Hall', startLevel: 3, cost: 5_000,
    accent: '#b3814a',
    base: '#1a130c',
    flavor: 'Solid oak beams. Word spreads, and sailors with sea legs sign on.',
  },
  3: {
    tier: 3, name: 'Brassbound Hall', startLevel: 5, cost: 15_000,
    accent: '#d9a83a',
    base: '#1e170c',
    flavor: 'Brass fittings and a proper bar. Seasoned crews ask about you.',
  },
  4: {
    tier: 4, name: 'Gilded Hall', startLevel: 7, cost: 45_000,
    accent: '#f0c040',
    base: '#231a0b',
    flavor: 'Gold leaf on the rafters. Veterans queue at the door.',
    glow: 'rgba(240,192,64,0.10)',
  },
  5: {
    tier: 5, name: 'Hall of Legends', startLevel: 10, cost: 135_000,
    accent: '#ffd966',
    base: '#281f0d',
    flavor: 'Names sung in every port. Recruits arrive with their craft already honed.',
    glow: 'rgba(255,217,102,0.16)',
  },
}

export const CREW_HALL_MAX_TIER: CrewHallTierNum = 5

export function clampHallTier(t: number | null | undefined): CrewHallTierNum {
  const n = Math.max(1, Math.min(CREW_HALL_MAX_TIER, Math.floor(t ?? 1)))
  return n as CrewHallTierNum
}

export function hallTierDef(t: number | null | undefined): CrewHallTierDef {
  return CREW_HALL_TIERS[clampHallTier(t)]
}

/** The tier above the given one, or null when the hall is maxed. */
export function nextHallTier(t: number | null | undefined): CrewHallTierDef | null {
  const cur = clampHallTier(t)
  return cur >= CREW_HALL_MAX_TIER ? null : CREW_HALL_TIERS[(cur + 1) as CrewHallTierNum]
}

/** XP a fresh recruit is inserted with at this hall tier. XP_TABLE[n] is
 *  the total XP needed to reach level n+1, so startLevel L = XP_TABLE[L-1]
 *  (0 for Lv 1 — identical to the pre-hall behavior). */
export function hallStartXP(t: number | null | undefined): number {
  return XP_TABLE[hallTierDef(t).startLevel - 1] ?? 0
}
