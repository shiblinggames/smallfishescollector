// THE CREW HALL'S BUNKS — training rates, upgrade costs and accrual math.
//
// The hall used to pre-level RECRUITS (hallStartXP). That only ever helped crew
// you did not own yet, so at a full roster it did nothing at all — which is why
// only 13 of 67 players had ever upgraded it. It trains the crew you HAVE now:
// a benched crew sits in a bunk and accrues crew XP continuously.
//
// A bunk is a COMMITMENT. Put a hand in and they are locked there for the full
// stint: you cannot pull them out, reassign them or dismiss them until it ends.
// That is the cost of the XP, and it is why the payout is the whole stint
// rather than whatever has accrued so far - there is no partial claim, because
// there is no partial stay.
//
// When the stint ends the hand is free: collecting pays the XP AND empties the
// bunk. If a claim left them in it, the clock would restart and they would be
// locked forever.
//
// PLAIN MODULE, deliberately not 'use server' — a 'use server' file silently
// drops every non-async export, which would strip all of this at build time.
// Both bunkActions.ts and HallBunks.tsx import it, so the number the panel
// previews and the number the server grants cannot drift.

import { crewLevelFromXP, CREW_MAX_LEVEL } from './crewLevel'
import { hallTierDef } from './crewHall'

/**
 * Release gate. FALSE while the hall's bunks are admin-only: they are hidden
 * for everyone else and every bunk action refuses server-side, so hiding the UI
 * is not the only thing standing between a player and a free XP faucet.
 *
 * Flip to true to open it to everyone. Nothing else needs to change — the
 * tables, columns and RPC are already live and inert for non-admins.
 */
export const HALL_BUNKS_LIVE = false

/** Can this player use the hall's bunks at all? */
export function hallBunksOpen(isAdmin: boolean | null | undefined): boolean {
  return HALL_BUNKS_LIVE || isAdmin === true
}

/**
 * Base XP an hour, before Drills. FLAT — Navigation is deliberately not in this
 * formula. Nav already gates which hall tiers you can buy, so it already
 * governs how many bunks you have; having it scale the rate too meant one stat
 * doing the same job twice, and it dominated the low end (Nav 1 paid 44/hr
 * against Nav 100's 440, a 10x swing from a stat that is not on this screen).
 * Drills is the sole multiplier now.
 */
export const BUNK_BASE = 250
/**
 * How long a stint LASTS, by Stores tier: one hour up to six, and it STOPS
 * there. This is both the lock-in and the payout window — a hand is stuck in
 * the bunk for exactly this long and earns exactly this many hours of XP.
 *
 * Worth knowing what Stores does and does not do: a stint pays `rate x hours`
 * and TAKES `hours`, so XP per day is `rate x 24` no matter how long a stint
 * is — six 1-hour stints and one 6-hour stint pay identically. Stores does not
 * raise the ceiling, it lowers how often you have to come back to reach it.
 * That is why it is priced under Drills, which is the only throughput lever.
 */
const STORES_HOURS = [1, 2, 3, 4, 5, 6]

export const STORES_MAX_LEVEL = STORES_HOURS.length

export function storesCapHours(level: number): number {
  const l = Math.min(STORES_MAX_LEVEL, Math.max(1, Math.floor(level)))
  return STORES_HOURS[l - 1]
}

export function storesMaxed(level: number): boolean {
  return Math.floor(level) >= STORES_MAX_LEVEL
}

/**
 * Drill levels multiply the Nav-scaled base. Six tiers and it STOPS, matching
 * the hall and Stores — every ladder in the hall is six long, so "six of six"
 * means the same thing wherever you read it, and there is one art set per tier
 * rather than an open-ended one nobody can draw.
 */
// Exponential. The old curve stepped +0.4, +0.5, +0.6, +0.7, +0.9 while the
// price roughly doubled each tier, so value per doubloon collapsed 11x from II
// to VI and the expensive upgrades were genuinely bad buys. Each step is now
// ~1.75x the last, so a tier always buys visibly more than the one before it.
const DRILL_MULTS = [1.0, 1.75, 3.1, 5.4, 9.4, 16.4]

export const DRILL_MAX_LEVEL = DRILL_MULTS.length

export function drillMult(level: number): number {
  return DRILL_MULTS[Math.min(DRILL_MAX_LEVEL, Math.max(1, Math.floor(level))) - 1]
}

export function drillsMaxed(level: number): boolean {
  return Math.floor(level) >= DRILL_MAX_LEVEL
}

/**
 * XP per hour for ONE bunked crew. Drills is the only thing that moves it.
 *
 * Sanity: crew Lv 100 is ~1.0M XP total and a depth-20 Gauntlet run pays 3,000
 * to the whole party. 250/hr at Drills I is ~167 days to carry one crew to 100;
 * 4,100/hr at Drills VI is ~10. The ladder is worth 16x, which is the point.
 */
export function bunkRatePerHour(drillLevel: number): number {
  return Math.round(BUNK_BASE * drillMult(drillLevel))
}

/** Bunks come from the hall tier and NOTHING else. There was briefly a second
 *  ladder of bunks bought with doubloons; it competed with the hall upgrade for
 *  the same decision, so the hall is the only way to get room. Drills are the
 *  only things bought inside the hall panel. */
export function bunkCount(hallTier: number): number {
  return hallTierDef(hallTier).bunks
}

/**
 * Doubloons to reach each tier. Hand-set rather than a curve, and deliberately
 * cheap at the bottom: each step is roughly 3x the last, so the first upgrade
 * lands the day you find the feature and the last one is a real endgame
 * purchase. Both ladders top out at 1,000,000.
 */
const DRILL_COSTS = [0, 15_000, 40_000, 120_000, 350_000, 1_000_000]

export function nextDrillCost(level: number): number {
  return drillsMaxed(level) ? 0 : DRILL_COSTS[Math.max(1, Math.floor(level))]
}

/** Stores is priced under Drills because it buys convenience, not power: it
 *  does not raise XP per day, only how often you have to come back for it.
 *  0 means there is nothing left to buy. */
const STORES_COSTS = [0, 15_000, 45_000, 130_000, 380_000, 1_000_000]

export function nextStoresCost(level: number): number {
  return storesMaxed(level) ? 0 : STORES_COSTS[Math.max(1, Math.floor(level))]
}

/**
 * The hall tier needed to buy a given Drills or Stores tier: the SAME number.
 * Drills II needs Oakhewn (hall II), Drills VI needs Leviathan (hall VI).
 *
 * The hall is the building; Drills and Stores are what is inside it. Without
 * this you could pour everything into the two cheap ladders and leave the hall
 * at Driftwood, which reads backwards and skips the thing the Nav gates are
 * pacing. Now the building leads and its contents follow.
 */
export function hallTierRequiredFor(ladderLevel: number): number {
  return Math.max(1, Math.floor(ladderLevel))
}

/** True when the hall is too low to buy the next tier of a ladder. */
export function ladderHallLocked(currentLevel: number, hallTier: number): boolean {
  return hallTier < hallTierRequiredFor(currentLevel + 1)
}

/** Roman numeral for an upgrade tier, for display. Falls back to the number. */
export function tierNumeral(level: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][level - 1] ?? String(level)
}

/**
 * What a finished stint pays. Flat: the full window at the full rate. There is
 * no partial payout because there is no partial stay — a hand is locked in for
 * the whole stint, so they earn the whole stint.
 */
export function stintXP(ratePerHour: number, capHours: number): number {
  return Math.floor(ratePerHour * capHours)
}

/** Has this stint finished? The only condition under which it pays out. */
export function stintDone(since: string | Date, nowMs: number, capHours: number): boolean {
  return msUntilDone(since, nowMs, capHours) <= 0
}

/** 0..1 through the stint, for the tile's progress bar. */
export function stintProgress(since: string | Date, nowMs: number, capHours: number): number {
  const start = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (!Number.isFinite(start) || capHours <= 0) return 0
  return Math.min(1, Math.max(0, (nowMs - start) / (capHours * 3_600_000)))
}

/** Milliseconds left on this stint, or 0 if it is done. */
export function msUntilDone(since: string | Date, nowMs: number, capHours: number): number {
  const start = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, start + capHours * 3_600_000 - nowMs)
}

/**
 * A crew at the level ceiling has nothing to gain, so the picker hides them and
 * an already-bunked crew that hits 100 stops earning rather than burning XP
 * into a counter nobody reads.
 */
export function canBunk(xp: number): boolean {
  return crewLevelFromXP(xp) < CREW_MAX_LEVEL
}
