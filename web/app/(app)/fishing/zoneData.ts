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
import type { CrateTier } from '@/lib/crateLoot'

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

/** Ancient Chest spawn chance per cast in the Ancient Deep. Its own number,
 *  not BASE_CRATE_CHANCE, because the two zones run on completely different
 *  clocks: a bite in the Ancient Deep takes 45-120 SECONDS against the Abyss's
 *  12-45, so roughly 45 casts an hour against ~144. At 3% that is a chest
 *  about every 33 casts, call it 45 minutes of fishing, which reads as rare
 *  while still being the best pet source in the game per hour. Raising this
 *  is the lever if it feels too thin. */
export const ANCIENT_CRATE_CHANCE = 0.03

// Per-zone crate-tier distribution (relative weights). Better crates deeper.
export const ZONE_CRATE_TIERS: Record<string, Partial<Record<CrateTier, number>>> = {
  shallows:    { wooden: 80, metal: 10, gold: 7,  diamond: 3  },
  open_waters: { wooden: 60, metal: 20, gold: 12, diamond: 8  },
  deep:        { wooden: 35, metal: 30, gold: 20, diamond: 15 },
  abyss:       { wooden: 15, metal: 25, gold: 35, diamond: 25 },
  // The Ancient Deep is all-or-nothing: no wooden, no metal, no gold, no
  // diamond. If a container surfaces down here it is an Ancient Chest.
  ancient_deep:{ ancient: 100 },
}

/** Total weight in a zone's tier table, so the helpers below never divide by a
 *  hardcoded four-tier sum. */
function tierTotal(d: Partial<Record<CrateTier, number>>): number {
  return (Object.values(d) as number[]).reduce((s, w) => s + w, 0)
}

/** Chance per cast that this zone yields a crate at all. */
export function zoneCrateChance(zone: string): number {
  return zone === 'ancient_deep' ? ANCIENT_CRATE_CHANCE : BASE_CRATE_CHANCE
}

/** Diamond-crate share (0-1) for a zone — the headline "crate quality" read. */
export function zoneDiamondShare(zone: string): number {
  const d = ZONE_CRATE_TIERS[zone]
  if (!d) return 0
  const total = tierTotal(d)
  return total ? (d.diamond ?? 0) / total : 0
}

/** Effective chance (0-1) that a single crate opened in this zone holds a pet,
 *  weighting each tier's pet odds by how often it drops here. */
export function zonePetPerCrate(zone: string): number {
  const d = ZONE_CRATE_TIERS[zone]
  if (!d) return 0
  const total = tierTotal(d)
  if (!total) return 0
  // Driven off the table rather than four hardcoded terms, so adding a tier
  // cannot silently drop out of this number the way it would have before.
  return (Object.entries(d) as [CrateTier, number][])
    .reduce((sum, [tier, w]) => sum + w * CRATE_PET_CHANCE[tier], 0) / total
}

// ── Zone art ─────────────────────────────────────────────────────────────────
// The zone's painted scene. Same plate the fishing screen, the zone selector
// cards and the profile backgrounds all use, so a zone's look is one entry
// rather than a map copied into each surface.
export const ZONE_BG: Record<string, string> = {
  shallows:    '/shallows.jpg',
  open_waters: '/openwaters.jpg',
  deep:        '/deep.jpg',
  abyss:       '/abyss.jpg',
  ancient_deep: '/ancient.jpg',
}
