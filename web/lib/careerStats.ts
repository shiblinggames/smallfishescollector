// Derived "career" stats surfaced on the profile tabs. These are deliberately
// NOT the leaderboard metrics (species, streaks, rarest catch, packs) — they're
// flavorful career totals. Computed server-side in each profile page.tsx.

export interface CareerStats {
  /** Lifetime fishing casts (profiles.fishing_casts). */
  fishingCasts: number
  /** Display name of the zone the player has caught the most in. */
  homeWaters: string
  /** Total prestige cycles across all zones (sum of prestige_levels). */
  prestige: number
  /** Doubloons hauled home across all completed voyages. */
  plunder: number
  /** Crew lost across all voyages. */
  crewLost: number
  /** Raid duels won against Finn (profiles.finn_wins). */
  finnWins: number
}

// Short forms so they fit a one-line stat tile without truncating.
const HOME_WATERS_LABEL: Record<string, string> = {
  shallows: 'Shallows',
  open_waters: 'Open Sea',
  deep: 'The Deep',
  abyss: 'Abyss',
  ancient_deep: 'Ancient',
}

/** Pick the zone with the most catches, mapped to a display label. */
export function computeHomeWaters(
  catches: { fish_id: number; catch_count: number | null }[],
  habitatByFishId: Map<number, string>,
): string {
  const byZone: Record<string, number> = {}
  for (const row of catches) {
    const hab = habitatByFishId.get(row.fish_id)
    if (!hab) continue
    byZone[hab] = (byZone[hab] ?? 0) + (row.catch_count ?? 1)
  }
  const top = Object.entries(byZone).sort((a, b) => b[1] - a[1])[0]
  return top ? (HOME_WATERS_LABEL[top[0]] ?? '—') : '—'
}

export function sumPrestige(prestigeLevels: unknown): number {
  if (!prestigeLevels || typeof prestigeLevels !== 'object') return 0
  return Object.values(prestigeLevels as Record<string, unknown>)
    .reduce<number>((s, n) => s + (Number(n) || 0), 0)
}

export function voyageTotals(
  rows: { total_doubloons: number | null; crew_lost: unknown[] | null }[],
): { plunder: number; crewLost: number } {
  let plunder = 0
  let crewLost = 0
  for (const r of rows) {
    plunder += r.total_doubloons ?? 0
    crewLost += Array.isArray(r.crew_lost) ? r.crew_lost.length : 0
  }
  return { plunder, crewLost }
}
