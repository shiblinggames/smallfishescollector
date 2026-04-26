import type { Habitat } from './rods'

export interface BaitDef {
  type: string
  name: string
  description: string
  color: string
  // Which habitats this bait attracts fish from
  habitats: Habitat[]
  // Multiplier on hook chance roll
  hookChanceBonus: number
  // How to acquire: 'shop' | 'expedition' | 'bounty' | 'daily' | 'rare'
  acquisition: string[]
  // Doubloon cost if sold in shop (0 = not for sale)
  shopCost: number
}

export const BAITS: BaitDef[] = [
  {
    type: 'worm',
    name: 'Worm',
    description: 'Attracts common shallows fish. Reliable and cheap.',
    color: '#a07858',
    habitats: ['shallows'],
    hookChanceBonus: 1.0,
    acquisition: ['shop', 'daily'],
    shopCost: 10,
  },
  {
    type: 'minnow',
    name: 'Minnow',
    description: 'Pulls in open water species. A solid mid-range bait.',
    color: '#60a5fa',
    habitats: ['open_waters'],
    hookChanceBonus: 1.1,
    acquisition: ['shop'],
    shopCost: 40,
  },
  {
    type: 'squid',
    name: 'Squid',
    description: 'Draws deep-water predators up from below.',
    color: '#4ade80',
    habitats: ['deep'],
    hookChanceBonus: 1.1,
    acquisition: ['shop'],
    shopCost: 120,
  },
  {
    type: 'chum',
    name: 'Chum',
    description: 'Attracts fish from any depth. No guarantees on what bites.',
    color: '#f0c040',
    habitats: ['shallows', 'open_waters', 'deep', 'abyss'],
    hookChanceBonus: 1.15,
    acquisition: ['shop'],
    shopCost: 200,
  },
  {
    type: 'luminous',
    name: 'Luminous Lure',
    description: 'Glows in the dark. Lures creatures from the abyss.',
    color: '#a78bfa',
    habitats: ['abyss'],
    hookChanceBonus: 1.25,
    acquisition: ['expedition', 'bounty'],
    shopCost: 0,
  },
  {
    type: 'golden',
    name: 'Golden Lure',
    description: 'Irresistible to rare species across all depths.',
    color: '#ff6b35',
    habitats: ['shallows', 'open_waters', 'deep', 'abyss'],
    hookChanceBonus: 1.5,
    acquisition: ['rare'],
    shopCost: 0,
  },
]

export function getBait(type: string): BaitDef {
  return BAITS.find(b => b.type === type) ?? BAITS[0]
}
