// Collection-completion logic that survives PRESTIGE. Prestiging a zone deletes
// its non-golden fish_collection rows, so a player who's caught everything can
// read as "incomplete" on the live table. Two prestige-proof signals fix that:
//   1. lifetime_species — every fish_id ever caught (see prestige_system memory).
//   2. Prestige ≥1 in all four regular zones — you must CLEAR a zone to prestige
//      it, so all-four-prestiged proves you landed every non-ancient species,
//      even for legacy players whose wipe predates the lifetime_species backfill.
// Ancient Deep is never prestige-able and its catches are never wiped, so the
// ancient species stay a genuine, separate requirement for the full set.

/** The four regular zones that can be prestiged (Ancient Deep can't). */
export const PRESTIGE_ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const

/** Prestige ≥1 in every regular zone → every non-ancient zone was completed. */
export function hasPrestigedAllZones(prestige: Record<string, number> | null | undefined): boolean {
  const p = prestige ?? {}
  return PRESTIGE_ZONES.every(z => (p[z] ?? 0) >= 1)
}

/** The set of species ids a player can PROVE they've caught, immune to prestige
 *  wipes: their lifetime set + current collection + Ancient trophies, and — if
 *  they've prestiged all four regular zones — every non-ancient species. */
export function provenCaughtSpecies(
  allSpecies: { id: number; habitat: string }[],
  opts: { lifetime?: number[] | null; liveIds?: number[] | null; ancientCatches?: number[] | null; prestige?: Record<string, number> | null },
): Set<number> {
  const caught = new Set<number>([...(opts.lifetime ?? []), ...(opts.liveIds ?? []), ...(opts.ancientCatches ?? [])])
  if (hasPrestigedAllZones(opts.prestige)) {
    for (const s of allSpecies) if (s.habitat !== 'ancient_deep') caught.add(s.id)
  }
  return caught
}
