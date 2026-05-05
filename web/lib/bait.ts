export interface BaitDef {
  type: string
  name: string
  description: string
  color: string
  imageUrl?: string
  waitMult: number        // multiplier on bite wait time (< 1.0 = faster)
  catchZoneBonus: number  // extra degrees added to the catch zone
  acquisition: string[]
  shopCost: number        // 0 = not for sale
  bundleSize: number      // units per shop purchase
}

export const BAITS: BaitDef[] = [
  {
    type: 'worm',
    name: 'Worms',
    description: 'Reliable all-purpose bait. Claim 20 free from your Daily Bonus.',
    color: '#a07858',
    imageUrl: '/worms.png',
    waitMult: 1.0,
    catchZoneBonus: 0,
    acquisition: ['shop', 'daily'],
    shopCost: 10,
    bundleSize: 10,
  },
  {
    type: 'minnow',
    name: 'Minnow',
    description: 'Fish bite 20% faster. A solid upgrade over worms.',
    color: '#60a5fa',
    imageUrl: '/minnow.png',
    waitMult: 0.80,
    catchZoneBonus: 0,
    acquisition: ['shop'],
    shopCost: 40,
    bundleSize: 5,
  },
  {
    type: 'night_crawler',
    name: 'Night Crawler',
    description: 'Widens your catch zone with no drawbacks. Great for tricky fish.',
    color: '#a78bfa',
    waitMult: 1.0,
    catchZoneBonus: 8,
    acquisition: ['shop'],
    shopCost: 50,
    bundleSize: 5,
  },
  {
    type: 'chum',
    name: 'Chum',
    description: 'Fish bite 40% faster. The fastest bait money can buy.',
    color: '#f0c040',
    waitMult: 0.60,
    catchZoneBonus: 0,
    acquisition: ['shop'],
    shopCost: 120,
    bundleSize: 5,
  },
  {
    type: 'anglers_formula',
    name: "Angler's Formula",
    description: 'Massively widens your catch zone. Worth every doubloon for the hardest fish.',
    color: '#fb923c',
    waitMult: 0.90,
    catchZoneBonus: 14,
    acquisition: ['shop'],
    shopCost: 250,
    bundleSize: 2,
  },
  {
    type: 'luminous',
    name: 'Luminous Lure',
    description: 'Glows in the dark. Fast bite and a wide catch zone. Earned from expeditions and bounties.',
    color: '#4ade80',
    imageUrl: '/luminouslure.png',
    waitMult: 0.75,
    catchZoneBonus: 10,
    acquisition: ['expedition', 'bounty'],
    shopCost: 0,
    bundleSize: 1,
  },
  {
    type: 'golden',
    name: 'Golden Lure',
    description: 'Irresistible to all fish. The finest lure in existence.',
    color: '#fde68a',
    imageUrl: '/goldenlure.png',
    waitMult: 0.60,
    catchZoneBonus: 16,
    acquisition: ['rare'],
    shopCost: 0,
    bundleSize: 1,
  },
]

export function getBait(type: string): BaitDef {
  return BAITS.find(b => b.type === type) ?? BAITS[0]
}
