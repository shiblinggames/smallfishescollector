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
  { id: 'dole_frostbite',    slug: 'dole', name: 'Frostbite',      filename: 'Dole_frostbite.png',    gemCost: 1250, blurb: 'Rimed in the ice of the far cold seas.',       color: '#7dd3fc' },
  { id: 'dole_royaladmiral', slug: 'dole', name: 'Royal Admiral',  filename: 'Dole_royaladmiral.png', gemCost: 1500, blurb: 'Gold braid and a fleet at her back.',        color: '#f0c040' },
  { id: 'dole_cursedghost',  slug: 'dole', name: 'Cursed Ghost',   filename: 'Dole_cursedghost.png',  gemCost: 2500, blurb: 'A wraith dragged back from the Locker.',        color: '#a78bfa' },
  { id: 'dole_krakenhunter', slug: 'dole', name: 'Kraken Hunter',  filename: 'Dole_krakenhunter.png', gemCost: 3000, blurb: 'Scarred from a hundred dives into the deep.',  color: '#2dd4bf', chase: true },
  // ── Doby (sperm whale) ──
  { id: 'doby_warmachine',  slug: 'doby_mick', name: 'War Machine',   filename: 'Doby_warmachine.png',  gemCost: 1250, blurb: 'Ironclad and built for the kill.',           color: '#9ca3af' },
  { id: 'doby_moltenmaw',   slug: 'doby_mick', name: 'Molten Maw',    filename: 'Doby_moltenmaw.png',   gemCost: 1500, blurb: 'Breaching from a sea of fire.',               color: '#fb7185' },
  { id: 'doby_spectral',    slug: 'doby_mick', name: 'Spectral',      filename: 'Doby_spectral.png',    gemCost: 2500, blurb: 'A ghost-grey leviathan from the black deep.',   color: '#93c5fd' },
  { id: 'doby_huntersbane', slug: 'doby_mick', name: "Hunter's Bane", filename: 'Doby_huntersbane.png', gemCost: 3000, blurb: 'The whale that hunts the hunters.',           color: '#f0c040', chase: true },
  // ── Catfish (Cat) ──
  { id: 'catfish_ancient',   slug: 'catfish', name: 'Ancient',   filename: 'Catfish_ancient.png',   gemCost: 1500, blurb: 'A relic that swam the first tides.',        color: '#d4a15a' },
  { id: 'catfish_cursed',    slug: 'catfish', name: 'Cursed',    filename: 'Catfish_cursed.png',    gemCost: 2500, blurb: 'Hexed whiskers, humming with old magic.',    color: '#a78bfa' },
  { id: 'catfish_prismatic', slug: 'catfish', name: 'Prismatic', filename: 'Catfish_prismatic.png', gemCost: 2500, blurb: 'Every color of the abyss at once.',        color: '#e879f9' },
  { id: 'catfish_galaxy',    slug: 'catfish', name: 'Galaxy',    filename: 'Catfish_galaxy.png',    gemCost: 3000, blurb: 'A whole galaxy swims in her scales.',      color: '#8b7bf0', chase: true },
  // ── Mako ──
  { id: 'mako_bloodtide',  slug: 'mako', name: 'Blood Tide',  filename: 'Mako_bloodtide.png',  gemCost: 1250, blurb: 'Trailing red through the water.',        color: '#ef4444' },
  { id: 'mako_highroller', slug: 'mako', name: 'High Roller', filename: 'Mako_highroller.png', gemCost: 1500, blurb: 'Dressed to win, built to bite.',         color: '#f0c040' },
  { id: 'mako_wraithfin',  slug: 'mako', name: 'Wraithfin',   filename: 'Mako_wraithfin.png',  gemCost: 2500, blurb: 'A phantom that haunts the shallows.',    color: '#a5b4fc' },
  { id: 'mako_tempest',    slug: 'mako', name: 'Tempest',     filename: 'Mako_tempest.png',    gemCost: 3000, blurb: 'Born of storm and lightning.',         color: '#38bdf8', chase: true },
  // ── Laz (Coelacanth) ──
  { id: 'coelacanth_deadeye',    slug: 'coelacanth', name: 'Deadeye',      filename: 'Laz_deadeye.png',    gemCost: 1250, blurb: 'One cold eye on the deep, one on the kill.', color: '#67e8f9' },
  { id: 'coelacanth_goldenrelic', slug: 'coelacanth', name: 'Golden Relic', filename: 'Laz_goldenrelic.png', gemCost: 2000, blurb: 'Gilded by ages beneath the waves.', color: '#f0c040' },
  { id: 'coelacanth_undying',    slug: 'coelacanth', name: 'Undying',      filename: 'Laz_undying.png',    gemCost: 2500, blurb: 'Dragged back from the Locker, unwilling to stay dead.', color: '#86efac' },
  { id: 'coelacanth_fossil',     slug: 'coelacanth', name: 'Fossil',       filename: 'Laz_fossil.png',     gemCost: 3000, blurb: 'A living fossil, older than the tides themselves.', color: '#34d399', chase: true },
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
