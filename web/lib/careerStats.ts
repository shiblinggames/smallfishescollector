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
  /** Biggest single hit landed in a raid (profiles.highest_raid_damage). */
  highestRaidDamage: number
}

/** Shape returned by the career_stats(uid) SQL function. */
export interface CareerAggregates {
  fishSold: number
  voyageLoot: number
  raidsCompleted: number
}
