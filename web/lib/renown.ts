// Renown — post-100 progression for Fishing + Navigation (Diablo-paragon style).
//
// Once a skill hits level 100, overflow XP earns RENOWN LEVELS; each grants ONE
// point you may BANK and spend whenever on a small board of stats. Two
// independent tracks (fishing_xp / expedition_xp). Renown LEVEL is derived from
// XP (no XP column needed); only the point ALLOCATIONS persist
// (profiles.fishing_renown_alloc / nav_renown_alloc). Per-point boosts are small
// but MEANINGFUL — each point is a real, visible gain that adds up hard over a
// long grind. Tune every magnitude in the stat CATALOGS below; the effect
// resolvers read `perPoint` from there, so there is one source of truth.

import { XP_TABLE as FISHING_XP_TABLE, MAX_LEVEL as FISHING_MAX } from './fishingLevel'
import { XP_TABLE as NAV_XP_TABLE, MAX_LEVEL as NAV_MAX } from './expeditionLevel'

export type RenownSkill = 'fishing' | 'nav'

// ── Renown XP curve (front-loaded, then a flat cap) ──────────────────────────
// Past level 100, overflow XP earns Renown levels. The per-level cost RAMPS from
// cheap up to a steady cap, so hitting 100 gives a satisfying BURST of points,
// then settles into an endless steady drip (Diablo-paragon feel). Tune the three
// knobs; everything else derives. `renownXpForLevel(n)` = XP to go from Renown
// level n-1 to n.
const RENOWN_BASE_COST = 50_000    // R1 cost — the first point comes fast
const RENOWN_COST_STEP = 15_000    // +this per level while ramping
const RENOWN_COST_CAP  = 200_000   // steady endless rate once ramped (~R11 on)
// How many levels the linear ramp spans (the level whose cost first hits the cap
// is the last ramp level). = 11 for the defaults above.
const RENOWN_RAMP_LEVELS = Math.floor((RENOWN_COST_CAP - RENOWN_BASE_COST) / RENOWN_COST_STEP) + 1

const MAX_LEVEL_XP: Record<RenownSkill, number> = {
  fishing: FISHING_XP_TABLE[FISHING_MAX - 1],
  nav:     NAV_XP_TABLE[NAV_MAX - 1],
}

/** XP to go from Renown level n-1 to n (n >= 1): ramps, then flat at the cap. */
export function renownXpForLevel(n: number): number {
  if (n <= 0) return 0
  return Math.min(RENOWN_COST_CAP, RENOWN_BASE_COST + (n - 1) * RENOWN_COST_STEP)
}

/** Cumulative overflow XP (past level 100) needed to REACH Renown level n. */
function renownCumXp(n: number): number {
  if (n <= 0) return 0
  const k = Math.min(n, RENOWN_RAMP_LEVELS)
  // Arithmetic sum of the ramp: Σ_{i=1..k} (BASE + (i-1)·STEP).
  let sum = k * RENOWN_BASE_COST + RENOWN_COST_STEP * (k * (k - 1) / 2)
  if (n > RENOWN_RAMP_LEVELS) sum += (n - RENOWN_RAMP_LEVELS) * RENOWN_COST_CAP
  return sum
}

/** Renown level = how many curve steps of overflow XP you've earned past 100. */
export function renownLevel(skill: RenownSkill, xp: number): number {
  const over = xp - MAX_LEVEL_XP[skill]
  if (over <= 0) return 0
  const rampTotal = renownCumXp(RENOWN_RAMP_LEVELS)
  // Past the ramp it's a flat cap, so jump straight there.
  if (over >= rampTotal) return RENOWN_RAMP_LEVELS + Math.floor((over - rampTotal) / RENOWN_COST_CAP)
  // Inside the ramp — walk the (few) steps.
  let lvl = 0
  for (let k = 1; k <= RENOWN_RAMP_LEVELS; k++) {
    if (renownCumXp(k) <= over) lvl = k
    else break
  }
  return lvl
}

/** Progress within the current Renown level, for the mini bar. */
export function renownProgress(skill: RenownSkill, xp: number): { level: number; into: number; span: number; progress: number } {
  const over = xp - MAX_LEVEL_XP[skill]
  const level = renownLevel(skill, xp)
  if (over <= 0) return { level: 0, into: 0, span: renownXpForLevel(1), progress: 0 }
  const into = over - renownCumXp(level)
  const span = renownXpForLevel(level + 1)
  return { level, into, span, progress: span > 0 ? Math.min(1, into / span) : 1 }
}

/** Gems for one respec token, which clears ONE board back to banked points.
 *
 *  Lives here rather than beside the action that spends it: actions/renown.ts
 *  carries 'use server', and a non-async export from one of those is silently
 *  dropped, so the panel would have imported `undefined` and priced the button
 *  at NaN with nothing failing loudly. */
export const RENOWN_RESPEC_GEM_COST = 2000

// ── Stat boards ──────────────────────────────────────────────────────────────
export type RenownAlloc = Record<string, number>

export interface RenownStat {
  id: string
  name: string
  /** Short flavor line under the name (the SOURCE of the effect). */
  blurb: string
  /** The thing the number acts on, shown right after the value: '+1.5% doubloons'. */
  unit: string
  /** per-point magnitude in the stat's own unit (see the effect resolvers). */
  perPoint: number
  /** how perPoint renders: 'pct' = ×100%, 'deg' = degrees, 'flat' = raw. */
  kind: 'pct' | 'deg' | 'flat'
  color: string
}

export const FISHING_RENOWN_STATS: RenownStat[] = [
  { id: 'bounty',    name: 'Bounty',    blurb: 'When you sell your catch at market.', unit: 'doubloons',  perPoint: 0.015, kind: 'pct',  color: '#f0c040' },
  { id: 'wisdom',    name: 'Wisdom',    blurb: 'From every catch you land.',           unit: 'Fishing XP', perPoint: 0.02,  kind: 'pct',  color: '#5eead4' },
  { id: 'patience',  name: 'Patience',  blurb: 'Fish take the hook sooner.',           unit: 'bite speed', perPoint: 0.004, kind: 'pct',  color: '#60a5fa' },
  // PROVIDENCE replaced PRECISION (a wider green band, +0.3 degrees a point).
  //
  // Renown is spent by players who already finished the level curve, and by then
  // a rod, hook, line and bait stack has made the dial a formality. Precision
  // sold consistency to the only people who had already bought it. Every one of
  // the first five captains past 100 said so with their points: 47 spent between
  // them, not one on Precision.
  //
  // Crates answer the same players differently. They are the only source of pets
  // and several cosmetics, so the stat is a faucet on content rather than a
  // smaller margin for error on a thing that no longer goes wrong.
  // Priced against the Treasure Rod, the crate bonus players already know: the
  // rod is a flat 2x and TWENTY points here is a second one. 3% a point was too
  // timid to beat Bounty, which is how Precision died; 10% made ten points a
  // whole rod, and stacked on the rod and a level-IV Primeval Eye that put the
  // ceiling at 8x, roughly a chest every four casts in the Ancient Deep. Half of
  // that keeps the stat worth choosing without the top end running away.
  { id: 'providence', name: 'Providence', blurb: 'Supply crates surface more often.', unit: 'more crates', perPoint: 0.05, kind: 'pct', color: '#a78bfa' },
]

export const NAV_RENOWN_STATS: RenownStat[] = [
  { id: 'plunder', name: 'Plunder', blurb: 'From raids and the Gauntlet.', unit: 'doubloons',   perPoint: 0.015, kind: 'pct',  color: '#f0c040' },
  { id: 'might',   name: 'Might',   blurb: 'Your broadsides in every raid.', unit: 'raid damage', perPoint: 0.005, kind: 'pct',  color: '#f87171' },
  { id: 'bulwark', name: 'Bulwark', blurb: 'Extra HP on your captain.',      unit: 'hull',        perPoint: 3,     kind: 'flat', color: '#7dd3fc' },
  { id: 'command', name: 'Command', blurb: 'For your whole crew, every raid.', unit: 'crew XP',   perPoint: 0.02,  kind: 'pct',  color: '#4ade80' },
]

export function renownStats(skill: RenownSkill): RenownStat[] {
  return skill === 'fishing' ? FISHING_RENOWN_STATS : NAV_RENOWN_STATS
}

const STAT_IDS: Record<RenownSkill, Set<string>> = {
  fishing: new Set(FISHING_RENOWN_STATS.map(s => s.id)),
  nav:     new Set(NAV_RENOWN_STATS.map(s => s.id)),
}
export function isRenownStat(skill: RenownSkill, id: string): boolean {
  return STAT_IDS[skill].has(id)
}

const pts = (alloc: RenownAlloc | null | undefined, id: string) => Math.max(0, Math.floor((alloc ?? {})[id] ?? 0))

/** Points spent (only counting valid catalog stats — ignores junk keys). */
export function spentPoints(skill: RenownSkill, alloc: RenownAlloc | null | undefined): number {
  return renownStats(skill).reduce((n, s) => n + pts(alloc, s.id), 0)
}

/** Points banked and free to spend = level − spent, floored at 0. */
export function availablePoints(skill: RenownSkill, xp: number, alloc: RenownAlloc | null | undefined): number {
  return Math.max(0, renownLevel(skill, xp) - spentPoints(skill, alloc))
}

/** Format a stat's TOTAL contribution at `points` points, e.g. '+0.75%' / '+0.6°' / '+3'. */
export function formatRenownTotal(stat: RenownStat, points: number): string {
  const v = stat.perPoint * points
  if (stat.kind === 'pct')  return `+${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`
  if (stat.kind === 'deg')  return `+${v.toFixed(2).replace(/\.?0+$/, '')}°`
  return `+${v}`
}

// ── Effect resolvers (mirror aggregateShipClasses; identity when unallocated) ──
// Magnitudes are read from the stat catalogs above so the boards, the tooltips,
// and the actual gameplay effect can never drift apart — tune ONLY the catalog.
const perPointOf = (skill: RenownSkill, id: string): number =>
  renownStats(skill).find(s => s.id === id)?.perPoint ?? 0

export interface FishingRenownEffects { sellMult: number; xpMult: number; biteWaitMult: number; crateChanceMult: number }
export function fishingRenownEffects(alloc: RenownAlloc | null | undefined): FishingRenownEffects {
  return {
    sellMult: 1 + pts(alloc, 'bounty') * perPointOf('fishing', 'bounty'),
    xpMult:   1 + pts(alloc, 'wisdom') * perPointOf('fishing', 'wisdom'),
    // faster bites; the reduction from Renown alone is soft-capped at −30%
    // (the 3000ms hard floor in fishWaitMs still applies on top).
    biteWaitMult: 1 - Math.min(0.30, pts(alloc, 'patience') * perPointOf('fishing', 'patience')),
    // MULTIPLIER, not added percentage points, so it composes with the rod and
    // the Angler's Patience the way those already compose with each other, and
    // so it is worth the same proportionally in the Ancient Deep (3%) as in the
    // shallows (2%) rather than quietly being worth less where crates are best.
    // At 0.05 a point, twenty points is a second Treasure Rod. The number is
    // priced against the rod because that is the crate bonus players already
    // know, and halved from a first pass at 0.10 because the rod and a level-IV
    // Primeval Eye are both flat 2x and all three multiply.
    crateChanceMult: 1 + pts(alloc, 'providence') * perPointOf('fishing', 'providence'),
  }
}

export interface NavRenownEffects { doubloonMult: number; damageMult: number; hullFlat: number; crewXpMult: number }
export function navRenownEffects(alloc: RenownAlloc | null | undefined): NavRenownEffects {
  return {
    doubloonMult: 1 + pts(alloc, 'plunder') * perPointOf('nav', 'plunder'),
    damageMult:   1 + pts(alloc, 'might')   * perPointOf('nav', 'might'),
    hullFlat:     pts(alloc, 'bulwark')     * perPointOf('nav', 'bulwark'),
    crewXpMult:   1 + pts(alloc, 'command') * perPointOf('nav', 'command'),
  }
}
