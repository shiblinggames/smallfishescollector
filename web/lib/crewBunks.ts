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
 * Release gate. PUBLIC since 2026-08-01.
 *
 * Kept as a flag rather than deleted: it is the one switch that takes the whole
 * feature back to admin-only if the economy needs a second look, and every bunk
 * action checks it server-side rather than trusting a hidden button.
 */
export const HALL_BUNKS_LIVE = true

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
 * THE LEVIATHAN BUNK.
 *
 * The sixth bunk, opened only by the top hall, does something the other five
 * do not: every stint that finishes there DRAWS a whole new trait and offers
 * it beside the one the hand already carries.
 *
 * Offers, not applies, and now the code actually does that. Two earlier shapes
 * both failed for the same reason -- neither asked the captain anything. First
 * it kept whatever beat the old trait on a flat stat sum, so "better" was
 * identical for every hand in the game and every crew converged. Then it merged
 * per-stat with Math.max, which could only ever raise a number: nothing was
 * ever at risk, so Divine stopped being a chase and became a countdown a
 * Legendary finished in about fourteen rolls.
 *
 * The draw is flat and whole now (lib/crewTraits): 28 authored traits, one of
 * them Divine, every hand drawing from the same table whatever its rarity --
 * base stats already carry rarity, so weighting this too would count it twice.
 * Most draws land WORSE than what the hand carries, which is what makes the
 * claim a decision. Declining costs the draw, never the trait.
 *
 * It is also the only table that reaches 4, which is why Divine and Blighted
 * can come from nowhere else.
 *
 * Stint length is chooseable HERE and nowhere else, because this is the only
 * bunk where it trades anything: one draw per stay, so a shorter stint is more
 * draws for the same XP a day.
 */
export const LEVIATHAN_SLOT = 5

/**
 * The Leviathan bunk's colour, shared by the bunk tile and the claim reveal so
 * the special slot and its payoff are visibly the same thing. Deliberately
 * outside the hall's palette (driftwood grey up to pale gold) and not gold,
 * which already means "collect me".
 */
export const LEVIATHAN_COLOR = '#3fd6c4'

export function isLeviathanSlot(slot: number | null | undefined): boolean {
  return slot === LEVIATHAN_SLOT
}

/**
 * A trait as one number: the sum of its three stats.
 *
 * Kept for sorting and display ONLY. It deliberately does not decide anything
 * any more: judging an offer on this is exactly what made every hand chase the
 * same trait, since it cannot tell a Fortune-hungry voyage hand from a raider.
 */
export function traitScore(t: { power: number; dodge: number; fortune: number }): number {
  return t.power + t.dodge + t.fortune
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

/**
 * Milliseconds left on this stint. 0 when done, and never more than the stint
 * itself.
 *
 * THE UPPER CLAMP IS NOT COSMETIC. `since` is stamped by Postgres now(), while
 * this runs against the browser's Date.now(). A client clock even a millisecond
 * behind the database makes the subtraction return slightly MORE than the full
 * stint, and the display ceils to the next minute -- so a fresh 1-hour stint
 * read "1h 1m left". Reported, and it looks like the game shorted you a minute
 * before you started.
 *
 * There is no legitimate reading in which more time remains than the whole
 * stint, so clamp it. stintProgress directly below already clamps 0..1 for the
 * same reason; this end simply never got the same treatment.
 */
export function msUntilDone(since: string | Date, nowMs: number, capHours: number): number {
  const start = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (!Number.isFinite(start)) return 0
  const full = capHours * 3_600_000
  return Math.min(full, Math.max(0, start + full - nowMs))
}

/**
 * Can this hand take THIS bunk?
 *
 * An ordinary bunk pays XP, so a hand at the level ceiling has nothing to gain
 * and is turned away — and one already bunked who hits 100 stops earning rather
 * than burning XP into a counter nobody reads.
 *
 * THE LEVIATHAN BUNK IS DIFFERENT and the rule has to know it. It pays a trait
 * RE-CUT, and a maxed hand is exactly who wants one: they are finished
 * levelling, so the trait is the only thing about them still worth improving.
 * Gating the deepest bunk on "can still learn" locked the chase away from the
 * only players in a position to run it — 11 maxed crew across 2 captains, shut
 * out of the one bunk built for them.
 *
 * `slot` is optional so existing level-only callers (the settle path, which is
 * asking about XP, not admission) keep their meaning.
 */
export function canBunk(xp: number, slot?: number | null): boolean {
  if (isLeviathanSlot(slot)) return true
  return crewLevelFromXP(xp) < CREW_MAX_LEVEL
}
