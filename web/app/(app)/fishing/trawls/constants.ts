// Trawls — shared constants + pure reward math for crew passive fishing.
// Plain module (NOT 'use server') so the helpers + types survive the build and
// can feed both the server actions and the client panel/preview.
//
// Model (all locked with design): send ONE crew to passively fish a zone for a
// 1h hard-locked cycle; collect, then redeploy. Savvy → fishing XP, Fortune →
// doubloons. Per-slot maxed = 40% of that zone's active xp/hr and 15% of its
// active doubloons/hr; scaled by the crew's stat (floor 0.2, ref 40); each haul
// rolls a tight ±15%. One trawl per zone; up to 4 concurrent slots gated by
// BOTH fishing + Nav level.

export type TrawlZoneKey = 'shallows' | 'open_waters' | 'deep' | 'abyss' | 'ancient_deep'

export interface TrawlZone {
  key: TrawlZoneKey
  label: string
  /** Fishing level required to TRAWL here. Deliberately offset +3 above the
   *  zone's active-fishing unlock (ZONE_MIN_LEVEL) so you have to fish a new
   *  zone with your own rod for a few levels before you can automate it. */
  minLevel: number
  /** Active-fishing xp/hr in this zone — the benchmark the trawl rate scales off. */
  activeXpHr: number
  /** Active-fishing doubloons/hr (65% quick-sell estimate) — the doubloon benchmark. */
  activeDblHr: number
  /** Hard-locked cycle length in minutes. Deeper zones take longer, so their
   *  big hauls pay out at a lower EFFECTIVE xp/hr — offsetting the deep-zone
   *  reward without shrinking the haul itself. Still all roughly "hourly". */
  durationMin: number
}

// Ordered shallow → deep. Anchors per the locked balance model. minLevel is the
// zone's active-fishing unlock (1/15/30/50/75) PLUS a +3 trawl offset — you fish
// a fresh zone yourself before you can automate it. (The +3 only bites on Deep/
// Abyss/Ancient; shallows/open are moot since trawl slot 1 needs Fishing 25.)
export const TRAWL_ZONES: TrawlZone[] = [
  { key: 'shallows',     label: 'Shallows',     minLevel: 4,  activeXpHr: 2_000,  activeDblHr: 1_300, durationMin: 45 },
  { key: 'open_waters',  label: 'Open Waters',  minLevel: 18, activeXpHr: 5_000,  activeDblHr: 2_100, durationMin: 55 },
  { key: 'deep',         label: 'Deep',         minLevel: 33, activeXpHr: 11_000, activeDblHr: 2_850, durationMin: 65 },
  { key: 'abyss',        label: 'Abyss',        minLevel: 53, activeXpHr: 19_000, activeDblHr: 5_800, durationMin: 78 },
  { key: 'ancient_deep', label: 'Ancient Deep', minLevel: 78, activeXpHr: 42_000, activeDblHr: 5_400, durationMin: 120 },
]

export const TRAWL_ZONE_BY_KEY: Record<TrawlZoneKey, TrawlZone> =
  Object.fromEntries(TRAWL_ZONES.map(z => [z.key, z])) as Record<TrawlZoneKey, TrawlZone>

/** Cycle length (ms) for a zone's trawl — deeper = longer (see durationMin). */
export function trawlDurationMs(zoneKey: TrawlZoneKey): number {
  return (TRAWL_ZONE_BY_KEY[zoneKey]?.durationMin ?? 60) * 60 * 1000
}

/** Pretty cycle length, e.g. "50m" or "1h 35m". */
export function fmtTrawlDuration(zoneKey: TrawlZoneKey): string {
  const m = TRAWL_ZONE_BY_KEY[zoneKey]?.durationMin ?? 60
  return m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** You can't even trawl until Fishing 25 (slot 1). */
export const TRAWL_UNLOCK_LEVEL = 25

/** Slot ladder — each slot needs BOTH a fishing AND a Nav level (hard AND-gate),
 *  forcing investment in both core loops. Max 4 slots (5 zones — you always
 *  leave one idle, usually Shallows). */
export const TRAWL_SLOT_LADDER: { slot: number; fishing: number; nav: number }[] = [
  { slot: 1, fishing: 25, nav: 0 },
  { slot: 2, fishing: 45, nav: 20 },
  { slot: 3, fishing: 70, nav: 45 },
  { slot: 4, fishing: 90, nav: 50 },
]
export const TRAWL_MAX_SLOTS = TRAWL_SLOT_LADDER.length

/** How many concurrent trawl slots the player has unlocked. */
export function unlockedTrawlSlots(fishingLevel: number, navLevel: number): number {
  let n = 0
  for (const s of TRAWL_SLOT_LADDER) {
    if (fishingLevel >= s.fishing && navLevel >= s.nav) n++
    else break
  }
  return n
}

/** The next slot's requirement, or null if all 4 are unlocked. */
export function nextTrawlSlot(fishingLevel: number, navLevel: number): { slot: number; fishing: number; nav: number } | null {
  const have = unlockedTrawlSlots(fishingLevel, navLevel)
  return have < TRAWL_MAX_SLOTS ? TRAWL_SLOT_LADDER[have] : null
}

// ── Reward math ──────────────────────────────────────────────────────────────
export const TRAWL_XP_PCT = 0.40   // maxed crew = 40% of the zone's active xp/hr
export const TRAWL_DBL_PCT = 0.15  // maxed crew = 15% of the zone's active doubloons/hr
export const TRAWL_STAT_REF = 40   // a maxed affinity-skewed Legendary's Savvy/Fortune
export const TRAWL_FACTOR_FLOOR = 0.2
export const TRAWL_VARIANCE = 0.15 // tight ±15% per-haul swing

/** Stat → yield factor: weak crew floor at 0.2, maxed (stat ≥ 40) = 1.0. */
export function trawlStatFactor(stat: number): number {
  return Math.max(TRAWL_FACTOR_FLOOR, Math.min(1, stat / TRAWL_STAT_REF))
}

export interface TrawlHaul { xp: number; doubloons: number }

/** Expected (mean) haul for a 1h cycle — used for the panel preview. */
export function expectedTrawlHaul(zoneKey: TrawlZoneKey, savvy: number, fortune: number): TrawlHaul {
  const z = TRAWL_ZONE_BY_KEY[zoneKey]
  return {
    xp:        Math.round(z.activeXpHr  * TRAWL_XP_PCT  * trawlStatFactor(savvy)),
    doubloons: Math.round(z.activeDblHr * TRAWL_DBL_PCT * trawlStatFactor(fortune)),
  }
}

/** Actual rolled haul (independent ±15% rolls for XP vs doubloons). Server rolls
 *  with Math.random at collect; tests can pass a deterministic rng. */
export function rollTrawlHaul(
  zoneKey: TrawlZoneKey, savvy: number, fortune: number, rng: () => number = Math.random,
): TrawlHaul {
  const exp = expectedTrawlHaul(zoneKey, savvy, fortune)
  const swing = () => 1 + (rng() * 2 - 1) * TRAWL_VARIANCE
  return {
    xp:        Math.max(0, Math.round(exp.xp * swing())),
    doubloons: Math.max(0, Math.round(exp.doubloons * swing())),
  }
}

// ── State shapes (server → client) ───────────────────────────────────────────
export interface TrawlCrewView {
  id: number
  name: string
  filename: string
  savvy: number
  fortune: number
  level: number
}

export interface ActiveTrawlView {
  zone: TrawlZoneKey
  crew: TrawlCrewView
  endsAt: string       // ISO
  ready: boolean
  expectedXp: number
  expectedDoubloons: number
}

export interface TrawlState {
  fishingLevel: number
  navLevel: number
  unlockedSlots: number
  nextSlot: { slot: number; fishing: number; nav: number } | null
  /** Zones the player can trawl (fishing level), with their active-trawl (if any). */
  zones: { key: TrawlZoneKey; label: string; minLevel: number; unlocked: boolean; trawl: ActiveTrawlView | null }[]
  /** Crew free to send (alive, not at sea). */
  freeCrew: TrawlCrewView[]
}

export interface CollectTrawlResult {
  zone: TrawlZoneKey
  xpGained: number
  doubloonsGained: number
  newFishingXP: number
  oldFishingLevel: number
  newFishingLevel: number
  newDoubloons: number
  fish: string[]           // sample species names from the zone, for the haul reveal
  crewName: string
}
