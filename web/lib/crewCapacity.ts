// Roster capacity for the new crew system: how many crew you can hold at once.
// Tied to Navigation (expedition) level: 10 at Nav 1, +1 every 5 levels.
//
// Bumped 2026-06-08 — base 5 → 10 + cadence 10 levels → 5 levels — now that
// voyage and raid run independent parties. Players need bench depth to staff
// BOTH tracks plus keep backups for class diversity (Mender for heal,
// Sharpshot for damage, Snare for control, etc.). New curve: 10 at Nav 1,
// 20 at Nav 50, 30 at Nav 100 — meaningful breathing room while keeping the
// recruit decision sharp enough to matter.

// 2026-08-13 — the CREW HALL now raises it too, +2 a tier, so a maxed hall on a
// maxed Nav holds 40 instead of 30.
//
// Nav alone had the roster fully decided by Nav 100, and two captains sat hard
// against their cap with nothing to do about it but level. Hanging the last ten
// off the hall gives the building a second reason to exist besides bunks, and
// gives a capped captain something to spend a million doubloons on.
//
// It is the hall and NOT a standalone purchase on purpose: a bought slot would
// be a pure "pay for more bench", where a hall tier already carries the bunks
// that keep a bigger bench busy. More roster and more training arrive together.

import { getLevelFromXP, MAX_LEVEL as NAV_MAX_LEVEL } from './expeditionLevel'
import { clampHallTier, CREW_HALL_MAX_TIER } from './crewHall'

const BASE_CAPACITY = 10
const PER_LEVELS = 5
/** Extra roster slots per hall tier ABOVE the free first one. Tier 1 adds
 *  nothing, tier 6 adds 10, so the ceiling is 30 (Nav 100) + 10 = 40. */
const ROSTER_PER_HALL_TIER = 2

/** Roster slots the hall itself contributes at a given tier. */
export function hallRosterBonus(hallTier: number | null | undefined): number {
  return (clampHallTier(hallTier) - 1) * ROSTER_PER_HALL_TIER
}

export function crewCapacity(navLevel: number, hallTier?: number | null): number {
  return BASE_CAPACITY + Math.floor(navLevel / PER_LEVELS) + hallRosterBonus(hallTier)
}

export function crewCapacityForXP(expeditionXp: number, hallTier?: number | null): number {
  return crewCapacity(getLevelFromXP(expeditionXp), hallTier)
}

export interface CapacityBreakdown {
  base: number
  fromNav: number
  fromHall: number
  total: number
  /** Navigation level that pays the next slot, or null once Nav is maxed. */
  nextNavLevel: number | null
  /** Hall tier that pays the next slots, or null once the hall is maxed. */
  nextHallTier: number | null
  /** What that next hall tier would add, for the "and it would give you" line. */
  perHallTier: number
  navPerLevels: number
}

/**
 * The same sum the cap is built from, itemised, so the pill can show its
 * working. Derived here rather than in the panel: a second copy of "10 plus a
 * fifth of your Nav" would be a copy that can disagree with the real cap, and
 * the number it disagreed with is the one that stops you recruiting.
 */
export function capacityBreakdown(navLevel: number, hallTier?: number | null): CapacityBreakdown {
  const tier = clampHallTier(hallTier)
  const nextNav = (Math.floor(navLevel / PER_LEVELS) + 1) * PER_LEVELS
  return {
    base: BASE_CAPACITY,
    fromNav: Math.floor(navLevel / PER_LEVELS),
    fromHall: hallRosterBonus(tier),
    total: crewCapacity(navLevel, tier),
    nextNavLevel: nextNav <= NAV_MAX_LEVEL ? nextNav : null,
    nextHallTier: tier < CREW_HALL_MAX_TIER ? tier + 1 : null,
    perHallTier: ROSTER_PER_HALL_TIER,
    navPerLevels: PER_LEVELS,
  }
}
