export interface BaitDef {
  type: string
  name: string
  description: string
  color: string
  imageUrl?: string
  waitMult: number        // multiplier on bite wait time (< 1.0 = faster)
  catchZoneBonus: number  // extra degrees added to the catch zone
  acquisition: string[]
  shopCost: number        // 0 = not for sale. Per-unit shop price; a bundle of
                          // bundleSize costs shopCost * bundleSize.
  bundleSize: number      // units per shop purchase
  /** Buyable with Fathoms in the Gauntlet's Permanent Upgrades shop. 0/undefined =
   *  not Fathoms-buyable. fathomCost is the price for one fathomBundle of units. */
  fathomCost?: number
  fathomBundle?: number
  /** A short, deliberately-vague flavour line shown under the lure in both
   *  shops. Hints (without spelling out) that the premium lures are what draw
   *  the Ancient Deep's prehistoric trophies. Golden's reads stronger than
   *  Luminous's — Golden has the better trophy odds. */
  hint?: string
}

/** Baits you can buy for Fathoms (the premium lures, otherwise expedition/rare only). */
export const FATHOM_BAITS = () => BAITS.filter(b => (b.fathomCost ?? 0) > 0)

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
    description: 'Fish bite 10% faster.',
    color: '#60a5fa',
    imageUrl: '/minnow.png',
    waitMult: 0.90,
    catchZoneBonus: 0,
    acquisition: ['shop'],
    shopCost: 30,
    bundleSize: 10,
  },
  {
    type: 'night_crawler',
    name: 'Night Crawler',
    description: 'Fish bite 15% faster. Widens your catch zone by 4° — a bigger catch zone means more room to land the needle.',
    color: '#a78bfa',
    imageUrl: '/nightcrawler.png',
    waitMult: 0.85,
    catchZoneBonus: 4,
    acquisition: ['shop'],
    shopCost: 50,
    bundleSize: 10,
  },
  {
    type: 'chum',
    name: 'Chum',
    description: 'Fish bite 25% faster.',
    color: '#f0c040',
    imageUrl: '/chum.png',
    waitMult: 0.75,
    catchZoneBonus: 0,
    acquisition: ['shop'],
    shopCost: 100,
    bundleSize: 10,
  },
  {
    type: 'anglers_formula',
    name: "Angler's Formula",
    description: "Fish bite 35% faster. Widens your catch zone by 8° — a bigger catch zone means more room to land the needle.",
    color: '#fb923c',
    imageUrl: '/anglersformula.png',
    waitMult: 0.65,
    catchZoneBonus: 8,
    acquisition: ['shop'],
    shopCost: 180,
    bundleSize: 10,
  },
  {
    type: 'luminous',
    name: 'Luminous Lure',
    description: 'Fish bite 40% faster and the catch zone widens by 10°. Earned from expeditions and bounties, or bought with Fathoms in the Locker. Something ancient stirs when it glows.',
    color: '#4ade80',
    imageUrl: '/luminouslure.png',
    waitMult: 0.60,
    catchZoneBonus: 10,
    acquisition: ['expedition', 'bounty', 'fathoms'],
    shopCost: 0,
    bundleSize: 1,
    fathomCost: 12,
    fathomBundle: 5,
    hint: 'Something ancient stirs when it glows.',
  },
  {
    type: 'golden',
    name: 'Golden Lure',
    description: 'Fish bite 45% faster. Widens your catch zone by 10°. The finest lure in existence — a rare drop, or bought with Fathoms in the Locker. The oldest things in the deep rise for its shine.',
    color: '#fde68a',
    imageUrl: '/goldenlure.png',
    waitMult: 0.55,
    catchZoneBonus: 10,
    acquisition: ['rare', 'fathoms'],
    shopCost: 0,
    bundleSize: 1,
    fathomCost: 20,
    fathomBundle: 5,
    hint: 'The oldest things in the deep rise for its shine.',
  },
]

export function getBait(type: string): BaitDef {
  return BAITS.find(b => b.type === type) ?? BAITS[0]
}
