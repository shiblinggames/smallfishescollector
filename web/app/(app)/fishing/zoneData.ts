export const ZONE_RARITY_RATES: Record<string, Record<number, number>> = {
  shallows:    { 1: 55, 2: 25, 3: 12, 4: 7, 5: 1 },
  open_waters: { 1: 53, 2: 26, 3: 14, 4: 6, 5: 1 },
  deep:        { 1: 50, 2: 28, 3: 15, 4: 6, 5: 1 },
  abyss:       { 1: 46, 2: 26, 3: 18, 4: 8, 5: 2 },
  // Ancient Deep — three tiers split across boss-fish (trophies, tier 5)
  // and the 12 regulars added 2026-06-09 (tier 3 + tier 4). The lower
  // tiers dominate the bite pool so the zone reads as "regular catches
  // most of the time, trophies are the rare prize chase" instead of
  // every cast being a coin-flip on a boss. Once trophies are caught
  // they filter out of the tier-5 pool, leaving the rates to renormalise
  // automatically across the remaining tiers.
  ancient_deep: { 3: 50, 4: 40, 5: 10 },
}

// Minimum fishing level required to access each zone
export const ZONE_MIN_LEVEL: Record<string, number> = {
  shallows:    1,
  open_waters: 15,
  deep:        30,
  abyss:       50,
  ancient_deep: 75,
}

import { CRATE_PET_CHANCE } from '@/lib/pets'

// Base bite-wait band per zone (ms): [fastest common, slowest rare]. The actual
// wait interpolates within by catch_score and is cut by bait + fishing level +
// rod. Shared by castLine (fishWaitMs) and the zone-selector Details readout.
export const ZONE_WAIT_BASE: Record<string, [number, number]> = {
  shallows:     [3000,  12000],
  open_waters:  [5000,  20000],
  deep:         [8000,  35000],
  abyss:        [12000, 45000],
  ancient_deep: [45000, 120000],
}

// Chance of hooking a crate on a cast (before rod crateChanceMult). Ancient Deep
// has none. Mirrors castLine.
export const BASE_CRATE_CHANCE = 0.02

// Per-zone crate-tier distribution (relative weights). Better crates deeper.
export const ZONE_CRATE_TIERS: Record<string, Record<'wooden' | 'metal' | 'gold' | 'diamond', number>> = {
  shallows:    { wooden: 80, metal: 10, gold: 7,  diamond: 3  },
  open_waters: { wooden: 60, metal: 20, gold: 12, diamond: 8  },
  deep:        { wooden: 35, metal: 30, gold: 20, diamond: 15 },
  abyss:       { wooden: 15, metal: 25, gold: 35, diamond: 25 },
}

/** Diamond-crate share (0-1) for a zone — the headline "crate quality" read. */
export function zoneDiamondShare(zone: string): number {
  const d = ZONE_CRATE_TIERS[zone]
  if (!d) return 0
  return d.diamond / (d.wooden + d.metal + d.gold + d.diamond)
}

/** Effective chance (0-1) that a single crate opened in this zone holds a pet,
 *  weighting each tier's pet odds by how often it drops here. */
export function zonePetPerCrate(zone: string): number {
  const d = ZONE_CRATE_TIERS[zone]
  if (!d) return 0
  const total = d.wooden + d.metal + d.gold + d.diamond
  return (
    d.wooden * CRATE_PET_CHANCE.wooden +
    d.metal * CRATE_PET_CHANCE.metal +
    d.gold * CRATE_PET_CHANCE.gold +
    d.diamond * CRATE_PET_CHANCE.diamond
  ) / total
}
