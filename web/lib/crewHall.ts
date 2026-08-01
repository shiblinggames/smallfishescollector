// Crew Hall upgrade ladder — Darkest Dungeon-style building progression.
// The hall itself levels up (paid in doubloons, profiles.crew_hall_tier).
//
// WHAT A TIER BUYS: bunks. The hall used to raise the LEVEL NEW RECRUITS
// ARRIVED AT (hallStartXP), which was its only mechanical effect and its fatal
// flaw — it could only ever help crew you did not own yet, so at a full roster
// the whole 200k ladder did nothing. Only 13 of 67 players ever bought a tier.
//
// It now opens bunks in the hall itself (lib/crewBunks.ts), where benched crew
// train passively. Same prices, same art progression, but the value lands on
// the crew you already have and keeps landing forever. Recruits arrive at Lv 1
// for everyone.
//
// Cost ladder is exponential (×3 steps, ~200k total) — deliberately the
// same lifetime investment as the endgame ship (22k→80k→200k), so the
// hall is the parallel long-term doubloon sink for crew-focused players.
//
// Each tier also carries a visual THEME for the recruit board region —
// the hall should visibly improve as it's upgraded (weathered driftwood
// → oak → brass → gold → radiant). Consumed by CrewClient's recruit tab
// panel + the upgrade modal.

export type CrewHallTierNum = 1 | 2 | 3 | 4 | 5 | 6

export type CrewHallTierDef = {
  tier: CrewHallTierNum
  name: string
  /** Bunks this tier opens in the hall. The ONLY source of bunks — there
   *  is no way to buy one separately, so upgrading the hall is the only way to
   *  train more crew at once. */
  bunks: number
  /** Doubloon cost to UPGRADE TO this tier (0 for the base tier). */
  cost: number
  /** Theme accent for the recruit-board region + upgrade UI. */
  accent: string
  /**
   * Opaque base the hero paints on. Every accent here is warm gold or brown,
   * and the hero used to sit them on a navy `rgba(14,19,28,0.97)` shared with
   * the rest of the page - gold over navy is what read as a muddy yellow wash.
   * The base carries the tier as much as the accent does: driftwood is nearly
   * colourless, the Hall of Legends is rich.
   */
  base: string
  /** Short flavor line shown on the hall panel + upgrade modal. */
  flavor: string
  /** Soft outer glow on the board region — only the top tiers earn one. */
  glow?: string
}

export const CREW_HALL_TIERS: Record<CrewHallTierNum, CrewHallTierDef> = {
  1: {
    tier: 1, name: 'Driftwood Hall', bunks: 1, cost: 0,
    accent: '#97836a',
    base: '#16130f',
    flavor: 'Salvaged planks, a leaky roof, and one bunk in the corner.',
  },
  2: {
    tier: 2, name: 'Oakhewn Hall', bunks: 2, cost: 5_000,
    accent: '#b3814a',
    base: '#1a130c',
    flavor: 'Solid oak beams and room to drill. Word spreads.',
  },
  3: {
    tier: 3, name: 'Brassbound Hall', bunks: 3, cost: 15_000,
    accent: '#d9a83a',
    base: '#1e170c',
    flavor: 'Brass fittings, a proper bar, and bunks that see real use.',
  },
  4: {
    tier: 4, name: 'Gilded Hall', bunks: 4, cost: 45_000,
    accent: '#f0c040',
    base: '#231a0b',
    flavor: 'Gold leaf on the rafters, and drillmasters who know their trade.',
    glow: 'rgba(240,192,64,0.10)',
  },
  5: {
    tier: 5, name: 'Hall of Legends', bunks: 5, cost: 135_000,
    accent: '#ffd966',
    base: '#281f0d',
    flavor: 'Names sung in every port. Every hand who bunks here leaves it sharper.',
    glow: 'rgba(255,217,102,0.16)',
  },
  6: {
    tier: 6, name: 'Leviathan Hall', bunks: 6, cost: 405_000,
    accent: '#fff0c4',
    base: '#332715',
    flavor: 'Rafters cut from something that used to swim. Six bunks, and a queue for them.',
    glow: 'rgba(255,240,196,0.20)',
  },
}

export const CREW_HALL_MAX_TIER: CrewHallTierNum = 6

export function clampHallTier(t: number | null | undefined): CrewHallTierNum {
  const n = Math.max(1, Math.min(CREW_HALL_MAX_TIER, Math.floor(t ?? 1)))
  return n as CrewHallTierNum
}

export function hallTierDef(t: number | null | undefined): CrewHallTierDef {
  return CREW_HALL_TIERS[clampHallTier(t)]
}

/** The tier above the given one, or null when the hall is maxed. */
export function nextHallTier(t: number | null | undefined): CrewHallTierDef | null {
  const cur = clampHallTier(t)
  return cur >= CREW_HALL_MAX_TIER ? null : CREW_HALL_TIERS[(cur + 1) as CrewHallTierNum]
}
