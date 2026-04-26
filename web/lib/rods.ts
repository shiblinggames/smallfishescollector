export type Habitat = 'shallows' | 'open_waters' | 'deep' | 'abyss'

export interface RodDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  castsPerDay: number
  // Habitats this rod can reach
  habitats: Habitat[]
  // Multiplier on base hook chance (e.g. 1.2 = 20% better hook chance)
  hookChanceBonus: number
  // Seconds between bite checks (lower = faster bites)
  biteIntervalMs: number
}

export const RODS: RodDef[] = [
  {
    tier: 0,
    name: 'Bamboo Rod',
    cost: 0,
    description: 'A simple bamboo pole. Reaches the shallows just fine.',
    color: '#a07858',
    castsPerDay: 15,
    habitats: ['shallows'],
    hookChanceBonus: 1.0,
    biteIntervalMs: 4000,
  },
  {
    tier: 1,
    name: 'Fiberglass Rod',
    cost: 500,
    description: 'A step up. Open waters are now within reach.',
    color: '#9ca3af',
    castsPerDay: 20,
    habitats: ['shallows', 'open_waters'],
    hookChanceBonus: 1.1,
    biteIntervalMs: 3500,
  },
  {
    tier: 2,
    name: 'Graphite Rod',
    cost: 1500,
    description: 'Lightweight and sensitive. The deep beckons.',
    color: '#60a5fa',
    castsPerDay: 25,
    habitats: ['shallows', 'open_waters', 'deep'],
    hookChanceBonus: 1.2,
    biteIntervalMs: 3000,
  },
  {
    tier: 3,
    name: 'Carbon Rod',
    cost: 4000,
    description: 'Precision-engineered. Every depth is accessible.',
    color: '#4ade80',
    castsPerDay: 30,
    habitats: ['shallows', 'open_waters', 'deep', 'abyss'],
    hookChanceBonus: 1.35,
    biteIntervalMs: 2500,
  },
  {
    tier: 4,
    name: 'Legendary Rod',
    cost: 12000,
    description: 'Forged from the mast of a sunken galleon. Fish fear it.',
    color: '#ff6b35',
    castsPerDay: 40,
    habitats: ['shallows', 'open_waters', 'deep', 'abyss'],
    hookChanceBonus: 1.6,
    biteIntervalMs: 1800,
  },
]

export function getRod(tier: number): RodDef {
  return RODS[Math.min(Math.max(tier, 0), RODS.length - 1)]
}
