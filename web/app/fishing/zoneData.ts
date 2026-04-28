export const ZONE_RARITY_RATES: Record<string, Record<number, number>> = {
  shallows:    { 1: 55, 2: 25, 3: 12, 4: 7, 5: 1 },
  open_waters: { 1: 53, 2: 26, 3: 14, 4: 6, 5: 1 },
  deep:        { 1: 50, 2: 28, 3: 15, 4: 6, 5: 1 },
  abyss:       { 1: 46, 2: 26, 3: 18, 4: 8, 5: 2 },
}

// Minimum fishing level required to access each zone
export const ZONE_MIN_LEVEL: Record<string, number> = {
  shallows:    1,
  open_waters: 15,
  deep:        30,
  abyss:       50,
}
