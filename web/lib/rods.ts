export type Habitat = 'shallows' | 'open_waters' | 'deep' | 'abyss'

export interface RodDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  habitats: Habitat[]
  // Flat bonus added to the 1–50 base roll in Phase 1
  rollBonus: number
  // Bite animation duration (ms) — better rods feel snappier
  biteIntervalMs: number
}

export const RODS: RodDef[] = [
  {
    tier: 0, name: 'Bamboo Rod', cost: 0,
    description: 'A simple bamboo pole. Reaches the shallows just fine.',
    color: '#a07858', habitats: ['shallows'], rollBonus: 0, biteIntervalMs: 3800,
  },
  {
    tier: 1, name: 'Fiberglass Rod', cost: 500,
    description: 'A step up. Open waters are now within reach.',
    color: '#9ca3af', habitats: ['shallows', 'open_waters'], rollBonus: 5, biteIntervalMs: 3200,
  },
  {
    tier: 2, name: 'Graphite Rod', cost: 1500,
    description: 'Lightweight and sensitive. The deep beckons.',
    color: '#60a5fa', habitats: ['shallows', 'open_waters', 'deep'], rollBonus: 10, biteIntervalMs: 2600,
  },
  {
    tier: 3, name: 'Carbon Rod', cost: 4000,
    description: 'Precision-engineered. Every depth is accessible.',
    color: '#4ade80', habitats: ['shallows', 'open_waters', 'deep', 'abyss'], rollBonus: 15, biteIntervalMs: 2000,
  },
  {
    tier: 4, name: 'Legendary Rod', cost: 12000,
    description: 'Forged from the mast of a sunken galleon. Fish fear it.',
    color: '#ff6b35', habitats: ['shallows', 'open_waters', 'deep', 'abyss'], rollBonus: 25, biteIntervalMs: 1400,
  },
]

export function getRod(tier: number): RodDef {
  return RODS[Math.min(Math.max(tier, 0), RODS.length - 1)]
}
