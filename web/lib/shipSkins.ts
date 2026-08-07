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
  // ── THE SUNKEN HAND ───────────────────────────────────────────────────────
  // Three hulls taken off Finn's own ship. PLACEHOLDER ART: all three point at
  // enemy_finnship.png and are told apart by FILTER, which is the house pattern
  // for one sprite serving several variants. Drop real art in imageByTier when
  // it exists; nothing else needs to change.
  {
    id: 'sunken_hand_hull',
    name: 'Sunken Hand Hull',
    description: "His own colours, crimson and unhurried. The ship that was waiting at the end of every line you ever cast.",
    filter: 'none',
    color: '#a33b4a',
    source: 'The Sunken Hand',
    requiresShipTier: 4,
    imageByTier: { 4: '/enemy_finnship.png', 5: '/enemy_finnship.png', 6: '/enemy_finnship.png' },
  },
  {
    id: 'drowned_giant_hull',
    name: 'Tundra Hull',
    description: 'Rimed white and cold to the touch, cut for water that closes behind you. Nothing that sails it has ever been in a hurry.',
    // Real art, so no filter. The old grayscale tint existed only to fake a
    // second skin out of Finn's sprite.
    filter: 'none',
    color: '#bcd8e4',
    source: 'The Sunken Hand',
    requiresShipTier: 4,
    imageByTier: { 4: '/tundrahull.png', 5: '/tundrahull.png', 6: '/tundrahull.png' },
  },
  {
    id: 'last_cast_hull',
    name: 'Volcanic Hull',
    description: 'Black glass and a seam of fire that never quite goes out. It steams where the sea touches it.',
    filter: 'none',
    color: '#e05a2b',
    source: 'The Sunken Hand',
    requiresShipTier: 4,
    imageByTier: { 4: '/volcanichull.png', 5: '/volcanichull.png', 6: '/volcanichull.png' },
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

  {
    // Don's Gauntlet NORMAL chase — the Man-o-War skin from the deepest Don's
    // chest, the ghost fleet's answer to the Golden Gauntlet Hull. Man-o-War only.
    id: 'galaxy_hull',
    name: 'Galaxy Hull',
    description: 'Plating drowned so deep it drank the stars. The whole night sky runs in her hull — only the Man-o-War carries the sky itself.',
    filter: 'none',
    color: '#9d7bff',
    source: "Rare drop · Don's Gauntlet deepest chest",
    requiresShipTier: MANOWAR_SHIP_TIER,
    imageByTier: {
      6: '/galaxyhull.png',
    },
  },
  {
    // Don's Gauntlet NORMAL chase — the ghost-fleet Man-o-War skin, dropped one
    // chest tier below the Galaxy Hull (a second, slightly-earlier normal chase).
    id: 'dons_ghost_hull',
    name: "Don's Ghost Hull",
    description: 'The cold green of the drowned court, run up on a hull that should be at the bottom. The Don sails on. So do you.',
    filter: 'none',
    color: '#3fbf82',
    source: "Rare drop · Don's Gauntlet",
    requiresShipTier: MANOWAR_SHIP_TIER,
    imageByTier: {
      6: '/donsghosthull.png',
    },
  },

  // The capstone of the bounty-point ladder: 1,200 points, roughly three
  // months of clearing a full Chapter IV board. Bought nowhere, dropped by
  // nothing, and Man-o-War only like the other prestige hulls.
  //
  // FILTER FOR NOW, ART PENDING. A tint means it works the day someone earns
  // it rather than 404-ing on a sprite that does not exist yet; when the
  // bespoke hull lands it drops into imageByTier: { 6: '/corsairhull.png' }
  // beside this and the filter can go to 'none'.
  {
    id: 'corsair_hull',
    name: 'Corsair Hull',
    description: 'Paid for one order at a time, over a season of them. The harbourmaster knows your colours now, and so does everyone who reads his board.',
    filter: 'hue-rotate(-24deg) saturate(1.32) brightness(0.94)',
    color: '#b4463a',
    source: 'Bounty milestone · 1,200 points',
    requiresShipTier: MANOWAR_SHIP_TIER,
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
