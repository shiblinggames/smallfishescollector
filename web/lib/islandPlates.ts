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

export const PLATES: Record<string, Plate> = {
  // THE PROTOTYPES, 2026-09-22. One port and one isle, to judge the approach
  // on the water before the rest are painted.
  trawl_fleet: { art: '/sea/port-trawl-harbor.png', width: 1.25, water: 0.56 },
  'shallows-0': { art: '/sea/isle-plate-1.png', width: 1.25, water: 0.56 },
}

export function plateFor(id: string): Plate | null {
  return PLATES[id] ?? null
}
