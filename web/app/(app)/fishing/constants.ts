export const MAX_CASTS = 20


// ── THE FIVE WATERS ───────────────────────────────────────────────────────
// Moved out of FishingGame when the collection drawer did. Both the fishing
// page and the ocean hub name and colour these, and two tables would be two
// tables to forget to update when a zone is added.

export const ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep'] as const
export type ZoneKey = typeof ZONES[number]

export const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#60a5fa',
  open_waters: '#34d399',
  deep:        '#a78bfa',
  abyss:       '#f87171',
  ancient_deep: '#c084fc',
}

export const HABITAT_LABEL: Record<string, string> = {
  shallows:    'Shallows',
  open_waters: 'Open Waters',
  deep:        'Deep',
  abyss:       'Abyss',
  ancient_deep: 'Ancient Deep',
}

export const HABITAT_TAGLINE: Record<string, string> = {
  shallows:    'Bright water, gentle currents',
  open_waters: 'Open blue, horizon to horizon',
  deep:        'Dusk settles over deep water',
  abyss:       'Cold and dark, far from any light',
  ancient_deep: 'Before time. Beyond depth.',
}


/** A species as the collection and the catch flow see it. Declared identically
 *  and separately in FishingGame and FishingPageClient until the collection
 *  drawer moved out and needed a third copy, which is two copies too many. */
export type FishSpeciesBasic = {
  id: number; name: string
  habitat: string; bite_rarity: number; sell_value: number
  // Nullable to match the cached species table, which is where both callers
  // get their rows from. It was declared non-null in two hand-written copies of
  // this type and only ever survived because both were cast to on the way in.
  scientific_name: string | null; fun_fact: string | null
  length_min_in?: number | null; length_max_in?: number | null
}
