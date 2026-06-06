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
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}
