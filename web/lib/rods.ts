export interface RodDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  rarityBonus: number  // shifts rarity distribution toward rares (0 = no effect)
  biteIntervalMs: number
}

export const RODS: RodDef[] = [
  {
    tier: 0, name: 'Bamboo Rod', cost: 0,
    description: 'A simple bamboo pole. Gets the job done in the shallows.',
    color: '#a07858', rarityBonus: 0.00, biteIntervalMs: 3800,
  },
  {
    tier: 1, name: 'Fiberglass Rod', cost: 500,
    description: 'A step up. Slightly better odds of landing something interesting.',
    color: '#9ca3af', rarityBonus: 0.10, biteIntervalMs: 3200,
  },
  {
    tier: 2, name: 'Graphite Rod', cost: 1500,
    description: 'Lightweight and sensitive. Noticeably better rare fish odds.',
    color: '#60a5fa', rarityBonus: 0.20, biteIntervalMs: 2600,
  },
  {
    tier: 3, name: 'Carbon Rod', cost: 4000,
    description: 'Precision-engineered. Rare fish bite significantly more often.',
    color: '#4ade80', rarityBonus: 0.35, biteIntervalMs: 2000,
  },
  {
    tier: 4, name: 'Legendary Rod', cost: 12000,
    description: 'Forged from the mast of a sunken galleon. The rarest fish cannot resist.',
    color: '#ff6b35', rarityBonus: 0.50, biteIntervalMs: 1400,
  },
]

export function getRod(tier: number): RodDef {
  return RODS[Math.min(Math.max(tier, 0), RODS.length - 1)]
}
