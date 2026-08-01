// THE BUNKHOUSE — the Crew Hall's training rates, costs and accrual math.
//
// The hall used to pre-level RECRUITS (hallStartXP). That only ever helped crew
// you did not own yet, so at a full roster it did nothing at all — which is why
// only 13 of 67 players had ever upgraded it. It trains the crew you HAVE now:
// a benched crew sits in a bunk and accrues crew XP continuously.
//
// Continuous, not deploy/collect: the crew stays bunked through a claim, so
// eight bunks never becomes a redeploy chore. Accrual is capped at
// BUNK_CAP_HOURS, so checking in twice a day collects everything and a week
// away costs at most one window. No FOMO, no streaks.
//
// PLAIN MODULE, deliberately not 'use server' — a 'use server' file silently
// drops every non-async export, which would strip all of this at build time.
// Both bunkActions.ts and BunkhousePanel.tsx import it, so the number the panel
// previews and the number the server grants cannot drift.

import { crewLevelFromXP, CREW_MAX_LEVEL } from './crewLevel'
import { hallTierDef } from './crewHall'

/**
 * Release gate. FALSE while the Bunkhouse is admin-only: the panel is hidden
 * for everyone else and every bunk action refuses server-side, so hiding the UI
 * is not the only thing standing between a player and a free XP faucet.
 *
 * Flip to true to open it to everyone. Nothing else needs to change — the
 * tables, columns and RPC are already live and inert for non-admins.
 */
export const BUNKHOUSE_LIVE = false

/** Can this player use the Bunkhouse at all? */
export function bunkhouseOpen(isAdmin: boolean | null | undefined): boolean {
  return BUNKHOUSE_LIVE || isAdmin === true
}

/** Flat floor on the hourly rate, before Nav scaling. */
export const BUNK_BASE = 40
/** Added to the hourly rate per Navigation level. Nav 1 = 44/hr, Nav 100 = 440/hr. */
export const BUNK_PER_NAV = 4
/**
 * Accrual stops after this many hours. The whole point of the cap: you can
 * never lose more than one window by not logging in, and there is no reason to
 * set an alarm.
 */
export const BUNK_CAP_HOURS = 12

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

/** Hall tier 1 opens 2 bunks, each tier one more, then bought bunks on top.
 *  The per-tier counts live on the tier defs so the ladder is stated once. */
export function bunkCount(hallTier: number, bought: number): number {
  return hallTierDef(hallTier).bunks + Math.max(0, Math.floor(bought))
}

const BUNK_COST_BASE = 150_000
const DRILL_COST_BASE = 100_000
const COST_GROWTH = 2.5

/** Doubloons for the NEXT bunk beyond what the hall tier grants. */
export function nextBunkCost(bought: number): number {
  return Math.round(BUNK_COST_BASE * Math.pow(COST_GROWTH, Math.max(0, Math.floor(bought))))
}

/** Doubloons to go from `level` to `level + 1`. Drill I is free. */
export function nextDrillCost(level: number): number {
  return Math.round(DRILL_COST_BASE * Math.pow(COST_GROWTH, Math.max(1, Math.floor(level)) - 1))
}

/** Roman numeral for a drill level, for display. Falls back to the number. */
export function drillName(level: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][level - 1] ?? String(level)
}

/**
 * XP owed to one bunked crew, from `since` up to `nowMs`, clamped to the cap.
 * Shared by the panel's live preview and the claim itself so the number the
 * player watches tick up is exactly the number they get.
 */
export function accruedXP(since: string | Date, nowMs: number, ratePerHour: number): number {
  const start = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (!Number.isFinite(start)) return 0
  const hours = Math.min(BUNK_CAP_HOURS, Math.max(0, (nowMs - start) / 3_600_000))
  return Math.floor(hours * ratePerHour)
}

/** Milliseconds until this bunk stops accruing, or 0 if it already has. */
export function msUntilFull(since: string | Date, nowMs: number): number {
  const start = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, start + BUNK_CAP_HOURS * 3_600_000 - nowMs)
}

/**
 * A crew at the level ceiling has nothing to gain, so the picker hides them and
 * an already-bunked crew that hits 100 stops earning rather than burning XP
 * into a counter nobody reads.
 */
export function canBunk(xp: number): boolean {
  return crewLevelFromXP(xp) < CREW_MAX_LEVEL
}
