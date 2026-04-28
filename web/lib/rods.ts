export interface RodDef {
  tier: number
  name: string
  cost: number
  earnedOnly?: boolean       // if true, cannot be purchased — claimed via special action
  description: string
  color: string
  rarityBonus: number      // shifts rarity distribution toward rares (0 = no effect)
  biteIntervalMs: number   // time between bite opportunities (lower = faster)
  catchZoneBonus: number   // degrees added to catch zone
  doubleCatchChance: number  // chance to catch 2 fish on a successful catch (0–1)
  retryOnMissChance: number  // chance to retry the dial on miss or snag (0–1)
  snagImmune: boolean        // if true, snag zones count as miss — no extra bait lost
  perfectZoneBonus: number   // degrees added to the perfect zone (base is 5°)
}

export const RODS: RodDef[] = [
  {
    tier: 0, name: 'Bamboo Rod', cost: 0,
    description: 'A simple bamboo pole. Gets the job done.',
    color: '#a07858', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 1, name: 'Driftwood Staff', cost: 1500,
    description: 'Heavy and slow, but the wide tip gives you a much more forgiving catch window.',
    color: '#b8956a', rarityBonus: 0, biteIntervalMs: 4500, catchZoneBonus: 10,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 2, name: 'Fiberglass Rod', cost: 2500,
    description: 'Lighter than bamboo. Fish bite noticeably faster.',
    color: '#9ca3af', rarityBonus: 0, biteIntervalMs: 2800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 3, name: 'Reef Guard', cost: 8000,
    description: "The red zones don't scare this rod. Snags cost no extra bait — just a miss.",
    color: '#34d399', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: true, perfectZoneBonus: 0,
  },
  {
    tier: 4, name: 'Telescoping Rod', cost: 8000,
    description: 'Precision-balanced for speed. Fish bite quickly.',
    color: '#60a5fa', rarityBonus: 0, biteIntervalMs: 2400, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 5, name: 'Moonwood Staff', cost: 14000,
    description: 'Carved from driftwood blessed by a full moon. The perfect zone is a little more forgiving.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 2,
  },
  {
    tier: 6, name: 'Graphite Rod', cost: 22000,
    description: 'Lightweight and stiff. Bites come very fast.',
    color: '#64748b', rarityBonus: 0, biteIntervalMs: 2000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 7, name: "Navigator's Rod", cost: 35000,
    description: 'A well-balanced deep-sea rod. Good speed and a wider catch zone.',
    color: '#38bdf8', rarityBonus: 0, biteIntervalMs: 2800, catchZoneBonus: 8,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 8, name: 'Carbon Rod', cost: 60000,
    description: 'Precision-engineered. Bites come blazingly fast.',
    color: '#4ade80', rarityBonus: 0, biteIntervalMs: 1600, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 9, name: 'Deep Diver', cost: 90000,
    description: 'Built for the abyss. The widest catch window money can buy.',
    color: '#22d3ee', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 16,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 10, name: 'Legendary Rod', cost: 200000,
    description: 'Forged from the mast of a sunken galleon. The rarest fish cannot resist.',
    color: '#ff6b35', rarityBonus: 0.50, biteIntervalMs: 1400, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 11, name: 'Twin-Strike', cost: 45000,
    description: 'Two hooks on one line. When luck strikes, they both bite.',
    color: '#fbbf24', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0.25, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 12, name: 'Second Wind', cost: 28000,
    description: "Stubborn rod. When you miss, sometimes it refuses to let go.",
    color: '#fb923c', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0.25, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 13, name: "Millionaire's Rod", cost: 175000,
    description: 'Hand-rolled in gold leaf. Every catch brings two.',
    color: '#f0c040', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 1.0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
  },
  {
    tier: 14, name: 'Completionist Rod', cost: 0, earnedOnly: true,
    description: 'Forged from the soul of every species in the sea. Every advantage, no compromises.',
    color: '#e8c84a', rarityBonus: 0.50, biteIntervalMs: 1000, catchZoneBonus: 16,
    doubleCatchChance: 1.0, retryOnMissChance: 0.50, snagImmune: true, perfectZoneBonus: 5,
  },
]

export function getRod(tier: number): RodDef {
  return RODS.find(r => r.tier === tier) ?? RODS[0]
}
