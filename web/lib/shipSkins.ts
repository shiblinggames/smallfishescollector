export interface ShipSkinDef {
  id: string
  name: string
  description: string
  filter: string
  color: string
  source: string
  /** Optional image override keyed by ship tier number. When the player
   *  has this skin equipped, render sites use the URL from this map
   *  for the player's current tier instead of the default ship sprite.
   *  CSS filter stays available alongside it for skins that want to
   *  ALSO tint the swapped image. */
  imageByTier?: Record<number, string>
}

export const SHIP_SKINS: ShipSkinDef[] = [
  {
    // Chapter 1 shared trophy skin. Drops from BOTH Pete's and Krust's
    // raids (lower weight on Pete, higher on Krust). Swaps the player's
    // ship sprite to the matching chapter-1 enemy hull at their current
    // tier — "you wear the colors of the gang you just sunk."
    id: 'finndicate_hull',
    name: 'Finndicate Hull',
    description: "Paint your ship in the colors of the gang you just sank. Cuts a different silhouette on the water — and a louder one.",
    filter: 'none',
    color: '#7a5a3a',
    source: "Barnacle Pete's + Krust's Raids",
    imageByTier: {
      0: '/enemychapter1rowboat_v2.png',
      1: '/enemychapter1dinghy_v2.png',
      2: '/enemychapter1sloop_v2.png',
      3: '/enemychapter1schooner_v2.png',
      4: '/enemychapter1brigantine_v2.png',
      5: '/enemychapter1galleon_v2.png',
      6: '/enemychapter1man-o-war_v2.png',
    },
  },
  {
    // Chapter 2 shared trophy skin. Drops from BOTH the Cartographer
    // (raid 3) and the still-unbuilt raid 4 (which will share this
    // chapter's enemy art). Same swap-the-sprite mechanic as the
    // chapter 1 Finndicate Hull, painted in the chapter 2 palette.
    id: 'chartmaker_hull',
    name: 'Chartmaker Hull',
    description: "Take the Cartographer's colors for your own. The mist that hid his chart line now drifts off your hull.",
    filter: 'none',
    color: '#6a7888',
    source: "The Cartographer's Survey + Raid 4",
    imageByTier: {
      0: '/enemychapter2rowboat_v2.png',
      1: '/enemychapter2dinghy_v2.png',
      2: '/enemychapter2sloop_v2.png',
      3: '/enemychapter2schooner_v2.png',
      4: '/enemychapter2brigantine_v2.png',
      5: '/enemychapter2galleon_v2.png',
      6: '/enemychapter2man-o-war_v2.png',
    },
  },
  {
    // Chapter 3 shared trophy skin. Drops from BOTH the Harbour Fleet (raid 5)
    // and the Quartermaster (raid 6). Same swap-the-sprite mechanic, painted in
    // the black-market colours of the Coffers.
    id: 'coffers_hull',
    name: 'Coffers Hull',
    description: "Fly the black-market colours of the Coffers. The hull that ran contraband past the harbour guns is yours now.",
    filter: 'none',
    color: '#9a8752',
    source: 'The Harbour Fleet + The Quartermaster',
    imageByTier: {
      0: '/enemychapter3rowboat.png',
      1: '/enemychapter3dinghy.png',
      2: '/enemychapter3sloop.png',
      3: '/enemychapter3schooner.png',
      4: '/enemychapter3brigantine.png',
      5: '/enemychapter3galleon.png',
      6: '/enemychapter3man-o-war.png',
    },
  },
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}
