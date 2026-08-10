// Real-money gem packs.
//
// PRICED AGAINST WHAT PLAYERS ACTUALLY EARN, not against a feeling. An active
// day pays about 185 gems, the average balance sits near 1,800 and the richest
// captain holds around 17,000. So the ladder is set so the middle pack is worth
// roughly a week of play, which is the point where buying reads as a shortcut
// rather than as the only way through. Nothing here is unobtainable by playing:
// every gem sink in the game is still reachable on earned gems alone, which is
// the line this stays on the right side of.
//
// The bonus curve is the standard shape for a reason — it makes the larger
// packs better value per gem, so a player who has decided to spend is not
// punished for spending once instead of five times.
//
// Prices are in CENTS and are the single source of truth for both Stripe (web)
// and, later, App Store Connect. When the iOS products are created their
// identifiers must map back to these ids, so a purchase on either platform
// grants the same thing.

export type GemPack = {
  /** Stable id. Used as Stripe metadata and as the App Store product suffix. */
  id: string
  gems: number
  priceCents: number
  /** Shown on the card. Null on the base pack, which is the baseline. */
  bonusPct: number | null
  /** Short name, in the game's voice rather than "Pack 3". */
  name: string
  /** One line of what this is, plainly. */
  blurb: string
  /** Marks the value pick. Exactly one, or none. */
  best?: boolean
}

export const GEM_PACKS: GemPack[] = [
  {
    id: 'pouch',
    gems: 250,
    priceCents: 199,
    bonusPct: null,
    name: 'Pouch of Gems',
    blurb: 'A day or two of good fortune.',
  },
  {
    id: 'purse',
    gems: 700,
    priceCents: 499,
    bonusPct: 12,
    name: 'Purse of Gems',
    blurb: 'Enough for a reroll or three.',
  },
  {
    id: 'chest',
    gems: 1600,
    priceCents: 999,
    bonusPct: 28,
    name: 'Chest of Gems',
    blurb: 'About a week of play, in one go.',
    best: true,
  },
  {
    id: 'hoard',
    gems: 3600,
    priceCents: 1999,
    bonusPct: 44,
    name: 'Hoard of Gems',
    blurb: 'A legendary skin and change.',
  },
  {
    id: 'trove',
    gems: 10000,
    priceCents: 4999,
    bonusPct: 60,
    name: "Leviathan's Trove",
    blurb: 'The deep gives up everything at once.',
  },
]

export function gemPack(id: string): GemPack | null {
  return GEM_PACKS.find(p => p.id === id) ?? null
}

/** Price as a display string. One place, so the card and the button agree. */
export function packPrice(p: GemPack): string {
  return `$${(p.priceCents / 100).toFixed(2)}`
}

/** Gems per dollar, for the "best value" comparison on the cards. */
export function gemsPerDollar(p: GemPack): number {
  return Math.round(p.gems / (p.priceCents / 100))
}
