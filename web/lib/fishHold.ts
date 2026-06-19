export interface FishHoldTier {
  tier: number
  name: string
  capacity: number
  cost: number
}

export const FISH_HOLD_TIERS: FishHoldTier[] = [
  { tier: 0, name: 'Small Crate',    capacity: 15,  cost: 0       },
  { tier: 1, name: 'Medium Crate',   capacity: 25,  cost: 500     },
  { tier: 2, name: 'Large Crate',    capacity: 40,  cost: 2_000   },
  { tier: 3, name: 'Cargo Hold',     capacity: 70,  cost: 8_000   },
  { tier: 4, name: 'Deep Hold',      capacity: 120, cost: 20_000  },
  { tier: 5, name: 'Grand Hold',     capacity: 180, cost: 50_000  },
  { tier: 6, name: 'Titan Hold',     capacity: 250, cost: 100_000 },
  { tier: 7, name: 'Leviathan Hold', capacity: 350, cost: 250_000 },
  { tier: 8, name: 'Kraken Hold',    capacity: 500, cost: 600_000 },
]

export function getFishHold(tier: number): FishHoldTier {
  return FISH_HOLD_TIERS[Math.min(Math.max(tier, 0), FISH_HOLD_TIERS.length - 1)]
}
