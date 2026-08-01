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
// Cost ladder is exponential, ~3x a step, ending at 1,000,000 — the same
// shape and the same ceiling as Drills and Stores, so all three ladders in
// the hall pace together instead of the building lurching 7x at the top.
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
  /**
   * Navigation level needed to buy this tier. Same reason gear buys are level
   * gated (lib/gearGating): without it, casino and voyage gold lets a low-Nav
   * captain jump straight to six bunks. Nav is the ONLY brake on the hall now
   * that it is out of the training rate (see BUNK_BASE): one stat gates how
   * big the hall can get, Drills alone decides how fast it trains.
   */
  minNav: number
  /** Theme accent for the recruit-board region + upgrade UI. */
  accent: string
  /** Short flavor line shown on the hall panel + upgrade modal. */
  flavor: string
  /** Soft outer glow on the board region — only the top tiers earn one. */
  glow?: string
}

export const CREW_HALL_TIERS: Record<CrewHallTierNum, CrewHallTierDef> = {
  1: {
    tier: 1, name: 'Driftwood Hall', bunks: 1, cost: 0, minNav: 1,
    accent: '#97836a',
    flavor: 'Salvaged planks, a leaky roof, and one bunk in the corner.',
  },
  2: {
    tier: 2, name: 'Oakhewn Hall', bunks: 2, cost: 12_000, minNav: 8,
    accent: '#b3814a',
    flavor: 'Solid oak beams and room to drill. Word spreads.',
  },
  3: {
    tier: 3, name: 'Brassbound Hall', bunks: 3, cost: 36_000, minNav: 20,
    accent: '#d9a83a',
    flavor: 'Brass fittings, a proper bar, and bunks that see real use.',
  },
  4: {
    tier: 4, name: 'Gilded Hall', bunks: 4, cost: 110_000, minNav: 35,
    accent: '#f0c040',
    flavor: 'Gold leaf on the rafters, and drillmasters who know their trade.',
    glow: 'rgba(240,192,64,0.10)',
  },
  5: {
    tier: 5, name: 'Hall of Legends', bunks: 5, cost: 330_000, minNav: 55,
    accent: '#ffd966',
    flavor: 'Names sung in every port. Every hand who bunks here leaves it sharper.',
    glow: 'rgba(255,217,102,0.16)',
  },
  6: {
    tier: 6, name: 'Leviathan Hall', bunks: 6, cost: 1_000_000, minNav: 75,
    accent: '#fff0c4',
    // The sixth bunk is not just a sixth bunk (see LEVIATHAN_SLOT in
    // crewBunks), so the flavor points at the deep rather than the count.
    flavor: 'Rafters cut from something that used to swim. The deepest bunk still remembers it.',
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

/** The tier above the given one, or null when the hall is maxed. Deliberately
 *  ignores the Nav gate: the next tier is still shown when it is out of reach,
 *  with the requirement on it, so the ladder is legible before you can climb
 *  it. Use `canUpgradeHall` for whether it can actually be bought. */
export function nextHallTier(t: number | null | undefined): CrewHallTierDef | null {
  const cur = clampHallTier(t)
  return cur >= CREW_HALL_MAX_TIER ? null : CREW_HALL_TIERS[(cur + 1) as CrewHallTierNum]
}

/** Why this upgrade cannot be bought yet, or null if it can. One source of
 *  truth for the button, the confirm sheet and the server action. */
export function hallUpgradeBlocker(
  tier: number | null | undefined,
  navLevel: number,
  doubloons: number,
): 'maxed' | 'nav' | 'doubloons' | null {
  const next = nextHallTier(tier)
  if (!next) return 'maxed'
  if (navLevel < next.minNav) return 'nav'
  if (doubloons < next.cost) return 'doubloons'
  return null
}
