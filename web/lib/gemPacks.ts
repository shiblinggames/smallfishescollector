// ── REAL-MONEY GEM PACKS ────────────────────────────────────────────────────
//
// PRICED AGAINST WHAT PLAYERS ACTUALLY EARN, not against a feeling. An active
// day pays about 185 gems, so the middle pack is about a fortnight of play,
// which is the point where buying reads as a shortcut rather than as the only
// way through. Nothing here is unobtainable by playing: every gem sink in the
// game is still reachable on earned gems alone, which is the line this stays
// on the right side of.
//
// ── MADE GENEROUS ON PURPOSE (2026-09-16) ───────────────────────────────────
//
// "I don't want this game to give off an icky feeling of taking advantage of
// people." The first ladder had the two tells of one that does: a $49.99 tier
// whose only job is to catch the one player in a hundred who will pay it, and
// a bonus curve steep enough (up to +60%) that every smaller purchase felt
// like the wrong one. Both are gone.
//
//   The base rate is about 400 a dollar: 800 for $1.99, where it was 250.
//   The ladder STOPS AT $19.99. There is no whale tier and there will not be.
//   The bonus is GENTLE. +10, +19, +24 to the Hoard's ten thousand: a bigger
//   pack is a little better, never so much better that the small one is a
//   trap. Set from the top down: the Hoard was fixed at ten thousand first
//   and the rest brought into line under it.
//
// The escalation that remains exists so a player who has decided to spend is
// not punished for spending once instead of four times. That is the whole of
// what a bonus curve is for, and it is all this one does.
//
// AND NO PACK IS EVER DESCRIBED AS TIME SAVED. "About a week of play" is a
// sentence that tells a player the game is a wait they can pay to skip, which
// is the icky feeling in one line. The earn rate above is for PRICING this
// file; it never reaches a card. A blurb says what the gems buy, full stop.
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
    gems: 800,
    priceCents: 199,
    bonusPct: null,
    name: 'Pouch of Gems',
    blurb: 'A little extra in the purse.',
  },
  {
    id: 'purse',
    gems: 2200,
    priceCents: 499,
    bonusPct: 10,
    name: 'Purse of Gems',
    blurb: 'A skin for somebody in the crew, and change.',
  },
  {
    id: 'chest',
    gems: 4800,
    priceCents: 999,
    bonusPct: 19,
    name: 'Chest of Gems',
    blurb: 'A few skins, or a legendary and a respec.',
  },
  {
    id: 'hoard',
    gems: 10000,
    priceCents: 1999,
    bonusPct: 24,
    name: 'Hoard of Gems',
    blurb: 'Three legendary skins, and change.',
    best: true,
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
