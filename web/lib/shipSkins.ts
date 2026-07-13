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
    // the black-market colors of the Coffers.
    id: 'coffers_hull',
    name: 'Coffers Hull',
    description: "Fly the black-market colors of the Coffers. The hull that ran contraband past the harbor guns is yours now.",
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
    // Chapter 4 shared trophy skin. Drops from BOTH The Blockade (raid 7) and The
    // Throne (raid 8), the same way the Coffers Hull drops from raids 5 and 6.
    //
    // TIER-GATED AT THE BRIGANTINE (4), and unusually so: the Chapter 4 enemy fleet
    // was only ever painted in three hulls (brigantine, galleon, man-o-war) because
    // those are the only ships Don's escort sails. That means there is no rowboat or
    // sloop art to fall back on. It is safe: by the Last Fathom nobody is still
    // sailing anything under a brigantine, and requiresShipTier stops the skin being
    // equipped onto a hull it has no sprite for.
    id: 'last_fathom_hull',
    name: 'Last Fathom Hull',
    description: "The cold slate of the don's own escort, run out past the last sounding on any chart. Nothing that flies these colors expects to come back up.",
    filter: 'none',
    color: '#5c7a9c',
    source: 'The Blockade + The Throne',
    requiresShipTier: 4,
    imageByTier: {
      4: '/enemychapter4brigantine.png',
      5: '/enemychapter4galleon.png',
      6: '/enemychapter4man-o-war.png',
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
  {
    // Man-o-War-only prestige skin dropped ONLY from HARDCORE Gauntlet chests —
    // crimson-drowned plating to pair with the run that risks the whole crew.
    id: 'bad_blood_hull',
    name: 'Bad Blood Hull',
    description: 'Iron gone red with everything the deep has taken. Only the Man-o-War carries this much bad blood — and only the drowned earn it.',
    filter: 'none',
    color: '#c0303a',
    source: 'Hardcore drop · Davy Jones’ Locker chest',
    requiresShipTier: MANOWAR_SHIP_TIER,
    imageByTier: {
      6: '/badbloodhull.png',
    },
  },
  {
    // The PRESSURE-exclusive hull. Not bought, not forged, not earned by depth alone:
    // it only ever rolls on a hardcore cash-out that was carrying real weight (25+
    // Pressure, banked from depth 30+). Nobody can be wearing this without having
    // signed Davy's terms and lived. See pressureSkinDropChance in lib/gauntletTerms.
    id: 'pitch_black_hull',
    name: 'Pitch Black Hull',
    description: 'Not painted black. Drowned black. She carries no colors but the bone on her sails, and no captain flies her without having signed for it.',
    filter: 'none',
    color: '#e8e4dc',
    source: "Pressure drop · Davy's Terms",
    requiresShipTier: MANOWAR_SHIP_TIER,
    imageByTier: {
      6: '/pitchblackhull.png',
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
