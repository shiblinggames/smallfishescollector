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
  /** Minimum ship tier required to EQUIP this skin. Late-game prestige skins
   *  are painted for one specific hull, so they only fit that tier or above —
   *  e.g. 6 = Man-o-War only. Undefined = equippable on any ship. As the game
   *  approaches its endgame, more skins will be Man-o-War-only via this gate. */
  requiresShipTier?: number
}

/** The Man-o-War is the top hull (ship tier 6). */
export const MANOWAR_SHIP_TIER = 6

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
    // Chapter 3 shared trophy skin. Drops from BOTH the Harbor Fleet (raid 5)
    // and the Quartermaster (raid 6). Same swap-the-sprite mechanic, painted in
    // the black-market colours of the Coffers.
    id: 'coffers_hull',
    name: 'Coffers Hull',
    description: "Fly the black-market colours of the Coffers. The hull that ran contraband past the harbor guns is yours now.",
    filter: 'none',
    color: '#9a8752',
    source: 'The Harbor Fleet + The Quartermaster',
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
  {
    // Man-o-War-only prestige skin — the first of the late-game tier-gated
    // hulls. A RARE drop from the Davy Jones' Locker chest (the top Gauntlet
    // chest, depth 18+). Painted for the Man-o-War alone, so it can't be
    // equipped on any smaller hull (requiresShipTier).
    id: 'golden_gauntlet_hull',
    name: 'Golden Gauntlet Hull',
    description: "Gilded plating hauled up from Davy Jones' Locker itself. Only the Man-o-War is grand enough to carry it.",
    filter: 'none',
    color: '#f0c040',
    source: "Rare drop · Davy Jones' Locker chest",
    requiresShipTier: MANOWAR_SHIP_TIER,
    imageByTier: {
      6: '/goldengauntlethull.png',
    },
  },

  // ── Drowned Fleet — Hardcore Gauntlet ── REMOVED 2026-07-08: the hull skins
  // aren't ready (placeholder tints, no bespoke art), so they're pulled from the
  // game for now. HARDCORE_UNLOCKS in lib/gauntlet is emptied to match. Re-add
  // the defs + repopulate HARDCORE_UNLOCKS when real art lands.
]

export function getShipSkin(id: string): ShipSkinDef | undefined {
  return SHIP_SKINS.find(s => s.id === id)
}

/** Whether a ship of the given tier can equip this skin (respects its
 *  requiresShipTier gate). Undefined tier gate = any hull. */
export function canEquipShipSkin(skin: ShipSkinDef, shipTier: number): boolean {
  return skin.requiresShipTier == null || shipTier >= skin.requiresShipTier
}
