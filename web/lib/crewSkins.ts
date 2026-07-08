// Crew skins — gem-bought alternate card art for LEGENDARY crew (League-of-
// Legends style). A skin is per SPECIES (slug), not per owned copy: buy it once,
// equip it, and every copy of that legendary wears it everywhere in the game
// (roster, raid summon, profile showcase, nameplates).
//
// Storage (profiles):
//   owned_crew_skins:    string[]                    — skin ids the player owns
//   equipped_crew_skins: Record<slug, skinId>        — the equipped skin per slug
//
// Art lives in the card-arts bucket alongside the base card art; a skin just
// swaps the filename. Adding a skin = one entry here + the PNG in the bucket.

export interface CrewSkin {
  id: string          // stable id, e.g. 'dole_royaladmiral'
  slug: string        // legendary species slug (lowercase), e.g. 'dole'
  name: string        // display name, e.g. 'Royal Admiral'
  filename: string    // card-arts bucket filename, e.g. 'Dole_royaladmiral.png'
  gemCost: number
  blurb: string
  /** UI accent for the skin's frame/badge. */
  color: string
  /** The rare "chase" skin for this legendary — top price, flagged for a
   *  distinct callout in the shop. */
  chase?: boolean
}

// Ordered cheap → chase within each legendary (the grid shows them in this
// order). The two "chase" skins (Kraken Hunter, Hunter's Bane) sit at the top
// price. `chase` flags them for a distinct callout in the UI.
export const CREW_SKINS: CrewSkin[] = [
  // ── Dole ──
  { id: 'dole_frostbite',    slug: 'dole', name: 'Frostbite',      filename: 'Dole_frostbite.png',    gemCost: 1500, blurb: 'Rimed in the ice of the far cold seas.',       color: '#7dd3fc' },
  { id: 'dole_royaladmiral', slug: 'dole', name: 'Royal Admiral',  filename: 'Dole_royaladmiral.png', gemCost: 1500, blurb: 'Gold braid and a fleet at her back.',        color: '#f0c040' },
  { id: 'dole_cursedghost',  slug: 'dole', name: 'Cursed Ghost',   filename: 'Dole_cursedghost.png',  gemCost: 2500, blurb: 'A wraith dragged back from the Locker.',        color: '#a78bfa' },
  { id: 'dole_krakenhunter', slug: 'dole', name: 'Kraken Hunter',  filename: 'Dole_krakenhunter.png', gemCost: 3000, blurb: 'Scarred from a hundred dives into the deep.',  color: '#2dd4bf', chase: true },
  // ── Doby (sperm whale) ──
  { id: 'doby_warmachine',  slug: 'doby_mick', name: 'War Machine',   filename: 'Doby_warmachine.png',  gemCost: 1500, blurb: 'Ironclad and built for the kill.',           color: '#9ca3af' },
  { id: 'doby_moltenmaw',   slug: 'doby_mick', name: 'Molten Maw',    filename: 'Doby_moltenmaw.png',   gemCost: 1500, blurb: 'Breaching from a sea of fire.',               color: '#fb7185' },
  { id: 'doby_spectral',    slug: 'doby_mick', name: 'Spectral',      filename: 'Doby_spectral.png',    gemCost: 2500, blurb: 'A ghost-grey leviathan from the black deep.',   color: '#93c5fd' },
  { id: 'doby_huntersbane', slug: 'doby_mick', name: "Hunter's Bane", filename: 'Doby_huntersbane.png', gemCost: 3000, blurb: 'The whale that hunts the hunters.',           color: '#dc2626', chase: true },
  // ── Catfish (Cat) ──
  { id: 'catfish_ancient',   slug: 'catfish', name: 'Ancient',   filename: 'Catfish_ancient.png',   gemCost: 1500, blurb: 'A relic that swam the first tides.',        color: '#d4a15a' },
  { id: 'catfish_cursed',    slug: 'catfish', name: 'Cursed',    filename: 'Catfish_cursed.png',    gemCost: 2500, blurb: 'Hexed whiskers, humming with old magic.',    color: '#a78bfa' },
  { id: 'catfish_prismatic', slug: 'catfish', name: 'Prismatic', filename: 'Catfish_prismatic.png', gemCost: 2500, blurb: 'Every color of the abyss at once.',        color: '#e879f9' },
  { id: 'catfish_galaxy',    slug: 'catfish', name: 'Galaxy',    filename: 'Catfish_galaxy.png',    gemCost: 3000, blurb: 'A whole galaxy swims in her scales.',      color: '#8b7bf0', chase: true },
  // ── Mako ──
  { id: 'mako_bloodtide',  slug: 'mako', name: 'Blood Tide',  filename: 'Mako_bloodtide.png',  gemCost: 1500, blurb: 'Trailing red through the water.',        color: '#ef4444' },
  { id: 'mako_highroller', slug: 'mako', name: 'High Roller', filename: 'Mako_highroller.png', gemCost: 1500, blurb: 'Dressed to win, built to bite.',         color: '#f0c040' },
  { id: 'mako_wraithfin',  slug: 'mako', name: 'Wraithfin',   filename: 'Mako_wraithfin.png',  gemCost: 2500, blurb: 'A phantom that haunts the shallows.',    color: '#a5b4fc' },
  { id: 'mako_tempest',    slug: 'mako', name: 'Tempest',     filename: 'Mako_tempest.png',    gemCost: 3000, blurb: 'Born of storm and lightning.',         color: '#38bdf8', chase: true },
  // ── Laz (Coelacanth) ──
  { id: 'coelacanth_deadeye',    slug: 'coelacanth', name: 'Deadeye',      filename: 'Laz_deadeye.png',    gemCost: 1500, blurb: 'One cold eye on the deep, one on the kill.', color: '#67e8f9' },
  { id: 'coelacanth_goldenrelic', slug: 'coelacanth', name: 'Golden Relic', filename: 'Laz_goldenrelic.png', gemCost: 2000, blurb: 'Gilded by ages beneath the waves.', color: '#f0c040' },
  { id: 'coelacanth_undying',    slug: 'coelacanth', name: 'Undying',      filename: 'Laz_undying.png',    gemCost: 2500, blurb: 'Dragged back from the Locker, unwilling to stay dead.', color: '#86efac' },
  { id: 'coelacanth_fossil',     slug: 'coelacanth', name: 'Fossil',       filename: 'Laz_fossil.png',     gemCost: 3000, blurb: 'A living fossil, older than the tides themselves.', color: '#c8a45c', chase: true },

  // ── RARE / EPIC crews ── 2 skins each, NO chase (no animated FX). Pricing by
  //    rarity: Rare = 1000, Epic = 1250. (Legendary skins run 1500-3000.) ──
  // ── Hammerhead (Hammer) — Rare ──
  { id: 'hammerhead_shark_bloodtide', slug: 'hammerhead_shark', name: 'Blood Tide', filename: 'Hammerhead_bloodtide.png', gemCost: 1000, blurb: 'The hunt turns the water red.',        color: '#ef4444' },
  { id: 'hammerhead_shark_kingpin',   slug: 'hammerhead_shark', name: 'Kingpin',    filename: 'Hammerhead_kingpin.png',  gemCost: 1000, blurb: 'Boss of the reef. Everyone pays up.',   color: '#f0c040' },
  // ── Blobfish (Bloo) — Rare ──
  { id: 'blobfish_captain',   slug: 'blobfish', name: 'Captain',    filename: 'Blobfish_captain.png',   gemCost: 1000, blurb: 'Squishy, unbothered, and somehow in command of the whole reef.', color: '#e0a838' },
  { id: 'blobfish_partyblob', slug: 'blobfish', name: 'Party Blob', filename: 'Blobfish_partyblob.png', gemCost: 1000, blurb: 'First to the grog, last to leave the deck.',                color: '#ec4899' },
  // ── Orca (Orc) — Epic ──
  { id: 'orca_detective',   slug: 'orca', name: 'Detective',    filename: 'Orca_detective.png',   gemCost: 1250, blurb: 'Every current tells a story to a sharp eye.', color: '#a8b8d0' },
  { id: 'orca_stormchaser', slug: 'orca', name: 'Storm Chaser', filename: 'Orca_stormchaser.png', gemCost: 1250, blurb: 'Where the storm breaks, she is already there.', color: '#818cf8' },
  // ── Tiger Shark (Ty) — Epic ──
  { id: 'tiger_shark_embermaw', slug: 'tiger_shark', name: 'Embermaw', filename: 'Tiger_Shark_embermaw.png', gemCost: 1250, blurb: 'Jaws lit like coals from the deep.', color: '#fb7331' },
  { id: 'tiger_shark_warlord',  slug: 'tiger_shark', name: 'Warlord',  filename: 'Tiger_Shark_warlord.png',  gemCost: 1250, blurb: 'Battle-scarred and unbeaten.',      color: '#cf9b3e' },
  // ── Goblin Shark (Gob) — Epic ──
  { id: 'goblin_shark_bloodbaron', slug: 'goblin_shark', name: 'Blood Baron', filename: 'Goblin_Shark_bloodbaron.png', gemCost: 1250, blurb: 'Old blood, and plenty of it.',            color: '#dc2626' },
  { id: 'goblin_shark_ghastly',    slug: 'goblin_shark', name: 'Ghastly',     filename: 'Goblin_Shark_ghastly.png',    gemCost: 1250, blurb: 'A pale terror drifting up from the dark.', color: '#a7b8c4' },
  // ── Blue Whale (Big Blue) — Epic ──
  { id: 'blue_whale_bulwark',    slug: 'blue_whale', name: 'Bulwark',    filename: 'Blue_Whale_bulwark.png',    gemCost: 1250, blurb: 'The sea breaks on him and loses.',    color: '#6ba8d9' },
  { id: 'blue_whale_songkeeper', slug: 'blue_whale', name: 'Songkeeper', filename: 'Blue_Whale_songkeeper.png', gemCost: 1250, blurb: 'Keeper of the old songs of the deep.', color: '#a5b4fc' },
  // ── Humpback Whale (Humps) — Epic ──
  { id: 'humpback_whale_admiral',       slug: 'humpback_whale', name: 'Admiral',        filename: 'Humpback_admiral.png',        gemCost: 1250, blurb: 'The fleet answers to his flag.', color: '#5b7fb0' },
  { id: 'humpback_whale_goldenhelmsman', slug: 'humpback_whale', name: 'Golden Helmsman', filename: 'Humpback_goldenhelmsman.png', gemCost: 1250, blurb: 'The richest hand on the wheel.',  color: '#f0c040' },
  // ── Giant Squid (Skwid) — Epic ──
  { id: 'giant_squid_abyssal',  slug: 'giant_squid', name: 'Abyssal',  filename: 'Giant_Squid_abyssal.png',  gemCost: 1250, blurb: 'Born where no light reaches.',    color: '#3aa8a0' },
  { id: 'giant_squid_sorcerer', slug: 'giant_squid', name: 'Sorcerer', filename: 'Giant_Squid_sorcerer.png', gemCost: 1250, blurb: 'Ink and old magic in every arm.', color: '#a78bfa' },
  // ── Great White Shark (Great White) — Epic ──
  { id: 'great_white_shark_ghostrelic', slug: 'great_white_shark', name: 'Ghost Relic', filename: 'Great_White_ghostrelic.png', gemCost: 1250, blurb: 'Bleached bone and old ghosts.', color: '#a9c0cc' },
  { id: 'great_white_shark_iceborn',    slug: 'great_white_shark', name: 'Iceborn',     filename: 'Great_White_iceborn.png',    gemCost: 1250, blurb: 'Forged in the coldest deep.',  color: '#7dd3fc' },
]

const BY_ID = new Map(CREW_SKINS.map(s => [s.id, s]))
const BY_FILENAME = new Map(CREW_SKINS.map(s => [s.filename, s]))
const BY_SLUG = new Map<string, CrewSkin[]>()
for (const s of CREW_SKINS) {
  const arr = BY_SLUG.get(s.slug) ?? []
  arr.push(s)
  BY_SLUG.set(s.slug, arr)
}

export function getCrewSkin(id: string | null | undefined): CrewSkin | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** Look up a skin by its art filename (or a full art URL ending in it). Lets a
 *  render site that only has the resolved image (e.g. the raid summon) recover
 *  the skin's accent color so its glow matches. */
export function getCrewSkinByFilename(filenameOrUrl: string | null | undefined): CrewSkin | undefined {
  if (!filenameOrUrl) return undefined
  const file = filenameOrUrl.split('/').pop() ?? filenameOrUrl
  return BY_FILENAME.get(file)
}

/** Skins available for a legendary species (slug is case-insensitive). */
export function crewSkinsForSlug(slug: string): CrewSkin[] {
  return BY_SLUG.get(slug.toLowerCase()) ?? []
}

/** Drop-shadow glow for a NON-chase equipped skin, scaled by the crew's rarity:
 *  Rare (2) and Epic (3) skins get a MUCH softer, tighter glow so they read as a
 *  tasteful tint, not a legendary aura; Legendary (4) non-chase skins keep the
 *  fuller glow. Chase skins don't use this (they animate via chase-skin-glow).
 *  `big` bumps the radii for the larger portrait/poster surfaces. */
export function skinArtGlow(color: string, rarity: number, big = false): string {
  if (rarity >= 4) {
    return big
      ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 16px ${color})`
      : `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 13px ${color}bb)`
  }
  // Rare / Epic — a single soft, low-alpha shadow.
  return `drop-shadow(0 0 ${big ? 4 : 3}px ${color}55)`
}

export type EquippedCrewSkins = Record<string, string>

/** The effective card-art filename for a crew: the equipped skin's art if one is
 *  set for this slug (and it's a real skin for this slug), else the base art.
 *  Central resolver used at every crew-art build point. */
export function resolveCrewFilename(
  slug: string,
  baseFilename: string,
  equipped: EquippedCrewSkins | null | undefined,
): string {
  const skinId = equipped?.[slug.toLowerCase()]
  const skin = getCrewSkin(skinId)
  return skin && skin.slug === slug.toLowerCase() ? skin.filename : baseFilename
}
