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
  /** The painting's height over its width. The DOM name plate needs it to
   *  find the plate's foot without loading the file: the label hangs below
   *  the PICTURE, not below the island's box, which the picture outgrows. */
  aspect: number
}

/** The one shape every plate shares until a specific one earns a different
 *  number: drawn a quarter wider than the island's diameter, which is what the
 *  bake's land used to cover; Kong: "the islands are too big", so it is the
 *  diameter itself now. Anchored a little below the middle. */
// 0.42, NOT 0.56. The anchor row is where the island's POSITION lands on the
// painting, and everything placed on an island is placed against that
// position: a building at 67% of the box expects to stand on the top face.
// At 0.56 the plate hung too high, its top face ended a sixth of a radius
// below the centre, and the Crew Hall and the Forge stood on the cliff.
// Kong: "shifted up more on the island." The anchor is the middle of the
// painted top face now, which is what the island's centre always meant.
const P = (art: string, aspect: number, width = 1.0, water = 0.42): Plate => ({ art, width, water, aspect })

/** One painting per band, shared by that band's isles. They are far enough
 *  apart that a template repeats without reading as one; the band's water
 *  colour does most of the telling anyway. */
const ISLE: Record<string, Plate> = {
  shallows: P('/sea/isle-shallows.webp', 0.652),
  open_waters: P('/sea/isle-open.webp', 0.557),
  deep: P('/sea/isle-deep.webp', 0.560),
  abyss: P('/sea/isle-abyss.webp', 0.561),
  ancient_deep: P('/sea/isle-ancient.webp', 0.603),
}

/** One painting per campaign bay, shared by that bay's rocks. */
const BAY: Record<string, Plate> = {
  thread: P('/sea/bay-thread.webp', 0.530),
  sunken_hand: P('/sea/bay-hand.webp', 0.503),
  the_coffers: P('/sea/bay-coffers.webp', 0.626),
  the_last_fathom: P('/sea/bay-fathom.webp', 0.562),
  one_last_ride: P('/sea/bay-ride.webp', 0.650),
}

/**
 * ── AND NO TWO NEIGHBOURS ALIKE ─────────────────────────────────────────────
 *
 * Kong: the expedition zones felt samey. Every rock in a bay was the one
 * painting, eight to fifteen identical islands a chapter. Each bay now has
 * four in its own stone (2026-09-23, Kie.ai, prompts/bay-*-N.json in the
 * nano-banana skill), each a different silhouette with its own props: nets
 * and tide pools in the Thread, jawbones and ribcages in the Gullet, fallen
 * columns and a buried chest in the Coffers, basalt columns and an anchor in
 * the Fathom, scorched rock and a wreck at the end. Dealt round the bay's
 * rocks in order, so neighbours differ. Coasts come off each painting: re-run
 * scripts/plate-coast.mts after changing a deal.
 */
const BAY_SET: Record<string, Plate[]> = {
  thread: [BAY.thread, P('/sea/bay-thread-2.webp', 0.573), P('/sea/bay-thread-3.webp', 0.519), P('/sea/bay-thread-4.webp', 0.479)],
  sunken_hand: [BAY.sunken_hand, P('/sea/bay-hand-2.webp', 0.597), P('/sea/bay-hand-3.webp', 0.602), P('/sea/bay-hand-4.webp', 0.565)],
  the_coffers: [BAY.the_coffers, P('/sea/bay-coffers-2.webp', 0.612), P('/sea/bay-coffers-3.webp', 0.682), P('/sea/bay-coffers-4.webp', 0.678)],
  the_last_fathom: [BAY.the_last_fathom, P('/sea/bay-fathom-2.webp', 0.595), P('/sea/bay-fathom-3.webp', 0.599), P('/sea/bay-fathom-4.webp', 0.538)],
  one_last_ride: [BAY.one_last_ride, P('/sea/bay-ride-2.webp', 0.615), P('/sea/bay-ride-3.webp', 0.723)],
}
const deal = (bay: string, ids: string[]) => ids.map((id, i) => [id, BAY_SET[bay][i % BAY_SET[bay].length]] as const)

export const PLATES: Record<string, Plate> = {
  // ── THE PORTS. Ground only; what stands on each is composited as before.
  // The Trawl Harbor and Cormorant Rock were the two prototypes, 2026-09-22;
  // the rest came through the same prompt the next pass.
  mainland: P('/sea/port-mainland.webp', 0.676),
  home: P('/sea/port-home.webp', 0.562),
  trawl_docks: P('/sea/port-tally-house.webp', 0.596),
  crew_hall: P('/sea/port-crew-hall.webp', 0.606),
  posting_house: P('/sea/port-posting-house.webp', 0.562),
  forge_isle: P('/sea/port-forge.webp', 0.671),
  gunwharf: P('/sea/port-gunwharf.webp', 0.658),
  charterhouse: P('/sea/port-charterhouse.webp', 0.642),
  trawl_fleet: P('/sea/port-trawl-harbor.webp', 0.505),
  shipyard: P('/sea/port-shipyard.webp', 0.604),

  // ── THE FISHING ISLES, by band. Cormorant Rock keeps the first prototype.
  'shallows-0': P('/sea/isle-plate-1.webp', 0.534),
  'shallows-1': ISLE.shallows,
  'shallows-2': ISLE.shallows,
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`open_waters-${i}`, ISLE.open_waters])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`deep-${i}`, ISLE.deep])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`abyss-${i}`, ISLE.abyss])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`ancient_deep-${i}`, ISLE.ancient_deep])),

  // ── THE CAMPAIGN'S ROCKS, by bay. Kong: the north should use the new
  // islands too. One template per chapter's water, painted in that bay's own
  // stone: rope-fouled sea rock on the coast, bone in the Gullet, worn gold
  // sandstone in the Coffers, wet black rock in the Fathom, violet basalt at
  // the end. The rock a chapter has not reached yet is drawn greyed and dim
  // (see the locked tint in the renderer), which is what the bake did.
  ...Object.fromEntries(deal('thread', [
    'thread-tangle', 'thread-ledger', 'thread-bilge', 'thread-toll', 'thread-purse',
    'thread-wax', 'thread-watch', 'thread-choice',
  ])),
  ...Object.fromEntries(deal('sunken_hand', [
    'hand-knuckle', 'hand-chart', 'hand-last', 'hand-sounding', 'hand-heading', 'hand-cipher',
    'hand-bones', 'hand-scrip', 'hand-debt', 'hand-closing', 'hand-choice',
  ])),
  ...Object.fromEntries(deal('the_coffers', [
    'cof-gatepost-n', 'cof-gatepost-s', 'cof-wall-n', 'cof-wall-s', 'cof-tally', 'cof-fork',
    'cof-lens', 'cof-counting', 'cof-keeper', 'cof-turn', 'cof-strongbox', 'cof-vault',
    'cof-ledger', 'cof-end', 'cof-choice',
  ])),
  ...Object.fromEntries(deal('the_last_fathom', [
    'fath-deepwatch', 'fath-locks', 'fath-muster', 'fath-bar', 'fath-berth', 'fath-crooked',
    'fath-gates', 'fath-court', 'fath-last', 'fath-hail', 'fath-quiet', 'fath-armory',
  ])),
  ...Object.fromEntries(deal('one_last_ride', ['ride-whetstone', 'ride-quiet', 'ride-spoils'])),
}

export function plateFor(id: string): Plate | null {
  return PLATES[id] ?? null
}
