export interface RodDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  rarityBonus: number      // shifts rarity distribution toward rares (0 = no effect, only Legendary)
  biteIntervalMs: number   // time between bite opportunities (lower = faster)
  catchZoneBonus: number   // degrees added to catch zone (higher = easier to land)
}

export const RODS: RodDef[] = [
  {
    tier: 0, name: 'Bamboo Rod', cost: 0,
    description: 'A simple bamboo pole. Gets the job done.',
    color: '#a07858', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 0,
  },
  {
    tier: 1, name: 'Driftwood Staff', cost: 400,
    description: 'Heavy and slow, but the wide tip gives you a much more forgiving catch window.',
    color: '#b8956a', rarityBonus: 0, biteIntervalMs: 4500, catchZoneBonus: 8,
  },
  {
    tier: 2, name: 'Fiberglass Rod', cost: 600,
    description: 'Lighter than bamboo. Fish bite noticeably faster.',
    color: '#9ca3af', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
  },
  {
    tier: 3, name: 'Reef Rod', cost: 1000,
    description: 'Balanced offshore rod. Decent speed with a slightly wider catch zone.',
    color: '#34d399', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 5,
  },
  {
    tier: 4, name: 'Telescoping Rod', cost: 1500,
    description: 'Precision-balanced for speed. Fish bite quickly, no frills.',
    color: '#60a5fa', rarityBonus: 0, biteIntervalMs: 2400, catchZoneBonus: 0,
  },
  {
    tier: 5, name: 'Moonwood Staff', cost: 2000,
    description: 'Carved from moonlit driftwood. Slow bites, but the catch window is enormous.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 4000, catchZoneBonus: 12,
  },
  {
    tier: 6, name: 'Graphite Rod', cost: 2500,
    description: 'Lightweight and stiff. Bites come fast.',
    color: '#64748b', rarityBonus: 0, biteIntervalMs: 2200, catchZoneBonus: 0,
  },
  {
    tier: 7, name: "Navigator's Rod", cost: 3200,
    description: 'A well-balanced deep-sea rod. Good speed and a wider-than-average catch window.',
    color: '#38bdf8', rarityBonus: 0, biteIntervalMs: 2800, catchZoneBonus: 7,
  },
  {
    tier: 8, name: 'Carbon Rod', cost: 5000,
    description: 'Precision-engineered carbon blank. Very fast bites.',
    color: '#4ade80', rarityBonus: 0, biteIntervalMs: 1800, catchZoneBonus: 0,
  },
  {
    tier: 9, name: 'Deep Diver', cost: 6500,
    description: 'Built for the abyss. Slower cadence, but the widest catch window money can buy.',
    color: '#22d3ee', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 14,
  },
  {
    tier: 10, name: 'Legendary Rod', cost: 12000,
    description: 'Forged from the mast of a sunken galleon. The rarest fish cannot resist.',
    color: '#ff6b35', rarityBonus: 0.50, biteIntervalMs: 1400, catchZoneBonus: 0,
  },
]

export function getRod(tier: number): RodDef {
  return RODS[Math.min(Math.max(tier, 0), RODS.length - 1)]
}
