// Renown — post-100 progression for Fishing + Navigation (Diablo-paragon style).
//
// Once a skill hits level 100, overflow XP earns RENOWN LEVELS; each grants ONE
// point you may BANK and spend whenever on a small board of stats. Two
// independent tracks (fishing_xp / expedition_xp). Renown LEVEL is derived from
// XP (no XP column needed); only the point ALLOCATIONS persist
// (profiles.fishing_renown_alloc / nav_renown_alloc). Per-point boosts are TINY
// on purpose — they only matter in aggregate over a long grind, so post-100
// stays meaningful without trivialising anything. Tune every number here.

import { XP_TABLE as FISHING_XP_TABLE, MAX_LEVEL as FISHING_MAX } from './fishingLevel'
import { XP_TABLE as NAV_XP_TABLE, MAX_LEVEL as NAV_MAX } from './expeditionLevel'

export type RenownSkill = 'fishing' | 'nav'

/** Flat XP between Renown levels (≈ the game's hardest single level). */
export const RENOWN_XP_COST = 200_000

const MAX_LEVEL_XP: Record<RenownSkill, number> = {
  fishing: FISHING_XP_TABLE[FISHING_MAX - 1],
  nav:     NAV_XP_TABLE[NAV_MAX - 1],
}

/** Renown level = whole RENOWN_XP_COST chunks of XP earned PAST level 100. */
export function renownLevel(skill: RenownSkill, xp: number): number {
  const base = MAX_LEVEL_XP[skill]
  if (xp <= base) return 0
  return Math.floor((xp - base) / RENOWN_XP_COST)
}

/** Progress within the current Renown level, for the mini bar. */
export function renownProgress(skill: RenownSkill, xp: number): { level: number; into: number; span: number; progress: number } {
  const base = MAX_LEVEL_XP[skill]
  const level = renownLevel(skill, xp)
  if (xp <= base) return { level: 0, into: 0, span: RENOWN_XP_COST, progress: 0 }
  const into = xp - base - level * RENOWN_XP_COST
  return { level, into, span: RENOWN_XP_COST, progress: Math.min(1, into / RENOWN_XP_COST) }
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
  { id: 'bounty',    name: 'Bounty',    blurb: 'Sell your catch for a little more.', perPoint: 0.0025, kind: 'pct',  color: '#f0c040' },
  { id: 'wisdom',    name: 'Wisdom',    blurb: 'Earn a little more Fishing XP.',      perPoint: 0.0025, kind: 'pct',  color: '#5eead4' },
  { id: 'patience',  name: 'Patience',  blurb: 'Fish bite a hair faster.',            perPoint: 0.0015, kind: 'pct',  color: '#60a5fa' },
  { id: 'precision', name: 'Precision', blurb: 'A slightly wider catch window.',       perPoint: 0.15,   kind: 'deg',  color: '#a78bfa' },
]

export const NAV_RENOWN_STATS: RenownStat[] = [
  { id: 'plunder', name: 'Plunder', blurb: 'More doubloons from raids and the Gauntlet.', perPoint: 0.0025, kind: 'pct',  color: '#f0c040' },
  { id: 'might',   name: 'Might',   blurb: 'Deal a touch more damage in raids.',           perPoint: 0.0015, kind: 'pct',  color: '#f87171' },
  { id: 'bulwark', name: 'Bulwark', blurb: 'A little more hull for your captain.',         perPoint: 1,      kind: 'flat', color: '#7dd3fc' },
  { id: 'command', name: 'Command', blurb: 'Your crew earns a little more XP.',            perPoint: 0.0025, kind: 'pct',  color: '#4ade80' },
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
export interface FishingRenownEffects { sellMult: number; xpMult: number; biteWaitMult: number; catchZoneBonus: number }
export function fishingRenownEffects(alloc: RenownAlloc | null | undefined): FishingRenownEffects {
  return {
    sellMult: 1 + pts(alloc, 'bounty') * 0.0025,
    xpMult:   1 + pts(alloc, 'wisdom') * 0.0025,
    // faster bites; the reduction from Renown alone is soft-capped at −30%
    // (the 3000ms hard floor in fishWaitMs still applies on top).
    biteWaitMult: 1 - Math.min(0.30, pts(alloc, 'patience') * 0.0015),
    catchZoneBonus: pts(alloc, 'precision') * 0.15,
  }
}

export interface NavRenownEffects { doubloonMult: number; damageMult: number; hullFlat: number; crewXpMult: number }
export function navRenownEffects(alloc: RenownAlloc | null | undefined): NavRenownEffects {
  return {
    doubloonMult: 1 + pts(alloc, 'plunder') * 0.0025,
    damageMult:   1 + pts(alloc, 'might')   * 0.0015,
    hullFlat:     pts(alloc, 'bulwark')     * 1,
    crewXpMult:   1 + pts(alloc, 'command') * 0.0025,
  }
}
