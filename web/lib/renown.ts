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

// ── Stat boards ──────────────────────────────────────────────────────────────
export type RenownAlloc = Record<string, number>

export interface RenownStat {
  id: string
  name: string
  blurb: string
  /** per-point magnitude in the stat's own unit (see the effect resolvers). */
  perPoint: number
  /** how perPoint renders: 'pct' = ×100%, 'deg' = degrees, 'flat' = raw. */
  kind: 'pct' | 'deg' | 'flat'
  color: string
}

export const FISHING_RENOWN_STATS: RenownStat[] = [
  { id: 'bounty',    name: 'Bounty',    blurb: 'Every fish you sell fetches a better price at market.',       perPoint: 0.005, kind: 'pct',  color: '#f0c040' },
  { id: 'wisdom',    name: 'Wisdom',    blurb: 'Land more Fishing XP from every catch you make.',              perPoint: 0.005, kind: 'pct',  color: '#5eead4' },
  { id: 'patience',  name: 'Patience',  blurb: 'Fish come to the hook faster, so you cast more often.',        perPoint: 0.004, kind: 'pct',  color: '#60a5fa' },
  { id: 'precision', name: 'Precision', blurb: 'Widens the catch zone on the dial for easier perfect reels.',  perPoint: 0.30,  kind: 'deg',  color: '#a78bfa' },
]

export const NAV_RENOWN_STATS: RenownStat[] = [
  { id: 'plunder', name: 'Plunder', blurb: 'Haul more doubloons from raids and the Gauntlet.',   perPoint: 0.005, kind: 'pct',  color: '#f0c040' },
  { id: 'might',   name: 'Might',   blurb: 'Your broadsides hit harder in every raid.',           perPoint: 0.003, kind: 'pct',  color: '#f87171' },
  { id: 'bulwark', name: 'Bulwark', blurb: 'Reinforces your captain with extra hull HP.',         perPoint: 2,     kind: 'flat', color: '#7dd3fc' },
  { id: 'command', name: 'Command', blurb: 'Your whole crew earns more XP from every raid.',       perPoint: 0.005, kind: 'pct',  color: '#4ade80' },
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

export interface FishingRenownEffects { sellMult: number; xpMult: number; biteWaitMult: number; catchZoneBonus: number }
export function fishingRenownEffects(alloc: RenownAlloc | null | undefined): FishingRenownEffects {
  return {
    sellMult: 1 + pts(alloc, 'bounty') * perPointOf('fishing', 'bounty'),
    xpMult:   1 + pts(alloc, 'wisdom') * perPointOf('fishing', 'wisdom'),
    // faster bites; the reduction from Renown alone is soft-capped at −30%
    // (the 3000ms hard floor in fishWaitMs still applies on top).
    biteWaitMult: 1 - Math.min(0.30, pts(alloc, 'patience') * perPointOf('fishing', 'patience')),
    catchZoneBonus: pts(alloc, 'precision') * perPointOf('fishing', 'precision'),
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
