export interface ShipSkinDef {
  id: string
  name: string
  description: string
  filter: string
  color: string
  source: string
  /** Optional image override keyed by ship tier number. When the player
   *  has this skin equipped, render sites should use the URL from this
   *  map for the player's current tier instead of the default ship
   *  sprite. CSS filter stays available for skins that want to ALSO
   *  tint the swapped image. Filter-only skins (corsair_black,
   *  verdigris_hull) omit this and keep working unchanged. */
  imageByTier?: Record<number, string>
}

export const SHIP_SKINS: ShipSkinDef[] = [
  {
    id: 'corsair_black',
    name: 'Corsair Black',
    description: "The hull of a ship that's never sailed under honest colours.",
    // Recolor approach: light sepia → red hue-rotate gives the dark
    // hull a rusty/blood undertone instead of a flat silhouette, then
    // brightness/contrast crush it back toward black. The red glow
    // still halos the ship at night. Previously the filter went all
    // the way to silhouette (brightness 0.5 + saturate 0.2) so the
    // ship was effectively a black cutout with only the glow giving
    // it identity — players asked for the hull itself to read as a
    // distinct paint job.
    filter: 'sepia(0.55) hue-rotate(-25deg) saturate(1.6) brightness(0.42) contrast(1.25) drop-shadow(0 0 6px rgba(200,20,20,0.4))',
    color: '#9ca3af',
    source: "Barnacle Pete's Raid",
  },
  {
    id: 'verdigris_hull',
    name: 'Verdigris Hull',
    description: 'A hull rotted a deep, ominous green by years buried in Krust\'s cold cargo holds.',
    // Sepia → hue-rotate is the canonical "recolor a PNG via CSS"
    // trick: sepia(1) flattens the ship to a tan palette, hue-rotate
    // spins that tan to verdigris green, saturate gives it richness,
    // brightness keeps it slightly dark/oxidized. Shading on the hull
    // (masts, sails, hull plating) survives because we're tinting,
    // not silhouette-ing. Old filter (brightness 0.5 + saturate 0.2)
    // just turned the ship black with a green glow halo — same
    // complaint as Corsair Black.
    filter: 'sepia(1) hue-rotate(78deg) saturate(2.6) brightness(0.78) contrast(1.05) drop-shadow(0 0 6px rgba(60,165,110,0.45))',
    color: '#43a884',
    source: "Krust's Consignment",
  },
  {
    // Chapter 1 shared trophy skin. Drops from BOTH Pete's and Krust's
    // raids (lower weight on Pete, higher on Krust). Unlike the earlier
    // filter-based skins, this one swaps the player's ship sprite to
    // the matching chapter-1 enemy hull at the player's current tier —
    // "you wear the colors of the gang you just sunk." Replaces
    // corsair_black + verdigris_hull as new loot; the old skins stay
    // in this file as functional defs so anyone who already owned one
    // can still equip it.
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
