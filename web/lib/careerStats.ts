// Derived "career" stats surfaced on the profile tabs. Deliberately NOT the
// leaderboard metrics (species, streaks, rarest catch, packs) — these are
// flavorful career totals. The aggregate ones come from the `career_stats(uid)`
// Postgres function; the rest are plain profiles columns.

export interface CareerStats {
  /** Lifetime fishing casts (profiles.fishing_casts). */
  fishingCasts: number
  /** Lifetime perfect catches (profiles.total_perfects). */
  perfects: number
  /** Total doubloons earned selling fish (sum of sale transactions). */
  fishSold: number
  /** Raids completed (raid_completions count). */
  raidsCompleted: number
  /** Doubloons hauled home across all completed voyages. */
  voyageLoot: number
  /** Fastest raid clear in ms (raid_completions min), or null if none. */
  fastestRaidMs: number | null
}

/** Shape returned by the career_stats(uid) SQL function. */
export interface CareerAggregates {
  fishSold: number
  voyageLoot: number
  raidsCompleted: number
  fastestRaidMs: number | null
}

export function formatRaidTime(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}
