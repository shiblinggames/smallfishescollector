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

/** Flat floor on the hourly rate, before Nav scaling. */
export const BUNK_BASE = 40
/** Added to the hourly rate per Navigation level. Nav 1 = 44/hr, Nav 100 = 440/hr. */
export const BUNK_PER_NAV = 4
/**
 * How long a stint LASTS, by Stores tier: one hour up to six, and it STOPS
 * there. This is both the lock-in and the payout window — a hand is stuck in
 * the bunk for exactly this long and earns exactly this many hours of XP.
 *
 * Capped, unlike Drills, because of what Stores actually does. A stint pays
 * `rate x hours` and TAKES `hours`, so XP per day is `rate x 24` no matter how
 * long a stint is: six 1-hour stints and one 6-hour stint pay identically.
 * Stores does not raise the ceiling, it lowers how often you have to come back
 * to reach it. That is worth paying for, but it is not an endgame sink, so it
 * is a short finite ladder and Drills stays the uncapped one.
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
 * Drill levels multiply the Nav-scaled base. Hand-set for the first five so the
 * early buys feel distinct, then a flat 1.28x per level forever — the ladder is
 * uncapped on purpose, it is the endgame doubloon sink.
 */
const DRILL_MULTS = [1.0, 1.4, 1.9, 2.5, 3.2]
const DRILL_MULT_GROWTH = 1.28

export function drillMult(level: number): number {
  const l = Math.max(1, Math.floor(level))
  if (l <= DRILL_MULTS.length) return DRILL_MULTS[l - 1]
  return DRILL_MULTS[DRILL_MULTS.length - 1] * Math.pow(DRILL_MULT_GROWTH, l - DRILL_MULTS.length)
}

/**
 * XP per hour for ONE bunked crew. Nav is the trainer quality (a famous captain
 * attracts better drillmasters), Drills are what you buy.
 *
 * Sanity: crew Lv 100 is ~1.0M XP total and a depth-20 Gauntlet run pays 3,000
 * to the whole party. Maxed out this is ~1,400/hr, so a bunk alone takes about
 * five weeks to carry one crew to 100. Active play stays the fast path.
 */
export function bunkRatePerHour(navLevel: number, drillLevel: number): number {
  return Math.round((BUNK_BASE + Math.max(0, navLevel) * BUNK_PER_NAV) * drillMult(drillLevel))
}

/** Bunks come from the hall tier and NOTHING else. There was briefly a second
 *  ladder of bunks bought with doubloons; it competed with the hall upgrade for
 *  the same decision, so the hall is the only way to get room. Drills are the
 *  only things bought inside the hall panel. */
export function bunkCount(hallTier: number): number {
  return hallTierDef(hallTier).bunks
}

const DRILL_COST_BASE = 100_000
const COST_GROWTH = 2.5

/** Doubloons to go from `level` to `level + 1`. Drill I is free. */
export function nextDrillCost(level: number): number {
  return Math.round(DRILL_COST_BASE * Math.pow(COST_GROWTH, Math.max(1, Math.floor(level)) - 1))
}

/**
 * Doubloons to reach each Stores tier. Hand-set rather than a curve: the ladder
 * is only five steps long and it buys convenience, not power, so it is priced
 * well under Drills. 0 means there is nothing left to buy.
 */
const STORES_COSTS = [0, 40_000, 90_000, 200_000, 450_000, 1_000_000]

export function nextStoresCost(level: number): number {
  return storesMaxed(level) ? 0 : STORES_COSTS[Math.max(1, Math.floor(level))]
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
