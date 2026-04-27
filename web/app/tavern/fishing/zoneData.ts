export const ZONE_RARITY_RATES: Record<string, Record<number, number>> = {
  shallows:    { 1: 55, 2: 25, 3: 12, 4: 7, 5: 1 },
  open_waters: { 1: 53, 2: 26, 3: 14, 4: 6, 5: 1 },
  deep:        { 1: 50, 2: 28, 3: 15, 4: 6, 5: 1 },
  abyss:       { 1: 46, 2: 26, 3: 18, 4: 8, 5: 2 },
}

// Minimum rod tier required to access each zone
export const ZONE_MIN_ROD: Record<string, number> = {
  shallows:    0,
  open_waters: 1,
  deep:        2,
  abyss:       3,
}

// Rod name the player needs to unlock each locked zone
export const ZONE_UNLOCK_ROD: Record<string, string> = {
  open_waters: 'Fiberglass Rod',
  deep:        'Graphite Rod',
  abyss:       'Carbon Rod',
}
