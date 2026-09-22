// ── PAINTED ISLANDS ─────────────────────────────────────────────────────────
//
// Everything on the water is hand-painted except the islands. The ships, the
// buildings, the raid rocks, the landmarks and the homestead's house are all
// plates an artist made; the eleven ports and twenty-seven fishing isles were
// built procedurally in islandArt: five concentric colour bands, a grey
// texture laid over them, a radial highlight, a rim light and a stroke, with a
// mesh of waving tufts on top. That stack was tuned many times and still read
// as a sticker under a drawing, because a gradient has no hand in it. Kong:
// "islands and the grass still look weird."
//
// So an island can be a PLATE: a painted PNG of the ground, cut at its
// waterline, keyed to alpha, and drawn in place of the bake. The buildings
// composite onto it exactly as they did onto the bake, because they are placed
// as a fraction of the island's box and never knew what was under them.
//
// An island with no entry here keeps the bake, so the chart is never half
// painted by accident: a plate lands per island, and the bake stands until it
// does.
//
// ── THE SHAPE COMES OFF THE ART ─────────────────────────────────────────────
//
// The shore foam, the colliders, the berth and the building band all read the
// island's coastline, and the coastline used to be a seeded polygon. A painted
// island has its own outline, so `scripts/plate-coast.mts` walks the plate's
// alpha and writes the coast it finds into lib/plateCoasts, which `coastline`
// prefers when it has one. Move or resize a plate here and run it again, or
// the foam will run round a shore the picture does not have.

export type Plate = {
  /** The painted ground, under /public. */
  art: string
  /** How wide the plate draws, as a multiple of the island's diameter (2r).
   *  The bake's land ran about three quarters of the box; a plate usually
   *  wants a little more because the painting includes the beach. */
  width: number
  /** Where the water crosses the painting, as a fraction of its height from
   *  the top. The plate is anchored here, so this row lands on the island's
   *  position and the land stands above it. */
  water: number
}

/** The one shape every plate shares until a specific one earns a different
 *  number: drawn a quarter wider than the island's diameter, which is what the
 *  bake's land used to cover; Kong: "the islands are too big", so it is the
 *  diameter itself now. Anchored a little below the middle. */
const P = (art: string, width = 1.0, water = 0.56): Plate => ({ art, width, water })

/** One painting per band, shared by that band's isles. They are far enough
 *  apart that a template repeats without reading as one; the band's water
 *  colour does most of the telling anyway. */
const ISLE: Record<string, string> = {
  shallows: '/sea/isle-shallows.png',
  open_waters: '/sea/isle-open.png',
  deep: '/sea/isle-deep.png',
  abyss: '/sea/isle-abyss.png',
  ancient_deep: '/sea/isle-ancient.png',
}

export const PLATES: Record<string, Plate> = {
  // ── THE PORTS. Ground only; what stands on each is composited as before.
  // The Trawl Harbor and Cormorant Rock were the two prototypes, 2026-09-22;
  // the rest came through the same prompt the next pass.
  mainland: P('/sea/port-mainland.png'),
  home: P('/sea/port-home.png'),
  trawl_docks: P('/sea/port-tally-house.png'),
  crew_hall: P('/sea/port-crew-hall.png'),
  posting_house: P('/sea/port-posting-house.png'),
  forge_isle: P('/sea/port-forge.png'),
  gunwharf: P('/sea/port-gunwharf.png'),
  charterhouse: P('/sea/port-charterhouse.png'),
  trawl_fleet: P('/sea/port-trawl-harbor.png'),
  shipyard: P('/sea/port-shipyard.png'),

  // ── THE FISHING ISLES, by band. Cormorant Rock keeps the first prototype.
  'shallows-0': P('/sea/isle-plate-1.png'),
  'shallows-1': P(ISLE.shallows),
  'shallows-2': P(ISLE.shallows),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`open_waters-${i}`, P(ISLE.open_waters)])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`deep-${i}`, P(ISLE.deep)])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`abyss-${i}`, P(ISLE.abyss)])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`ancient_deep-${i}`, P(ISLE.ancient_deep)])),
}

export function plateFor(id: string): Plate | null {
  return PLATES[id] ?? null
}
