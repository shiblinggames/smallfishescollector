// Tide Run boats — the cosmetic ladder that gives a run something to chase
// past its own distance number.
//
// UNLOCKED BY BEST DISTANCE, which is the only currency this game has and the
// only one a standalone build could carry offline.
//
// Anchored to the BADGE LADDER, which is the game's own published statement of
// what good looks like: Tide Runner at 300m, Tide Champion at 450m, Tide Master
// at 600m. A boat lands on each of those, so the cosmetic ladder and the
// achievement ladder agree instead of quietly disagreeing about what a great
// run is.
//
// The rest are pinned to what players actually reach: across 38 captains the
// median best is 306m, the 25th percentile 224m and the 90th 467m. The genuine
// record is catman at 570m — the 813m on the board belongs to an account with
// 203 anomaly flags, and distance is client-authored (submitTideRunBest bounds
// it only at 100,000), so that figure is almost certainly forged and is
// deliberately NOT used to set anything here. Building a ladder around a cheat's
// number would price the top of it out of reach for everyone honest.
//
// So the top boat sits at 900m: half again beyond Tide Master, comfortably past
// the real record, and reachable rather than mythical.
//
// EVERY BOAT SHARES THE ORIGINAL'S PROPORTIONS, 320x237 against boatrun.png's
// 1.353, so SHIP_ASPECT and the HITBOX_INSET box it feeds are untouched and no
// boat changes how the game plays. A cosmetic that alters your hitbox is not a
// cosmetic.
//
// That took undoing something first. The source art is a recolour of the same
// boat, but it was generated on a 16:9 canvas (1376x768) and the hull came out
// stretched about 17% wide — visibly flatter side by side, and enough to have
// widened the collision box had it been adopted as-is. The processing step
// trims to content then resizes with fit:'fill' back to the original aspect,
// which is the one case where a deliberate distortion is correct: it is
// cancelling the generator's, not adding one.

export type TideRunBoat = {
  id: string
  name: string
  /** Metres of BEST distance required. 0 = owned from the start. */
  unlockAt: number
  /** Transparent PNG under public/. Null for the original, which has its own. */
  image: string | null
  /** One line, in the game's voice. */
  blurb: string
}

/** The starter, and the only boat whose art the physics were tuned against. */
export const DEFAULT_BOAT_ID = 'original'

export const TIDE_RUN_BOATS: TideRunBoat[] = [
  { id: 'original',  name: 'The Old Hull',   unlockAt: 0,   image: null,                     blurb: 'The one you started with. It has seen things.' },
  { id: 'gray',      name: 'Gunmetal',       unlockAt: 75,  image: '/tiderun/gray.png',      blurb: 'Plain, honest, and quietly fast.' },
  { id: 'seafoam',   name: 'Seafoam',        unlockAt: 150, image: '/tiderun/seafoam.png',   blurb: 'The colour of the water right behind you.' },
  { id: 'green',     name: 'Kelp',           unlockAt: 225, image: '/tiderun/green.png',     blurb: 'Painted to vanish against the shallows.' },
  // Tide Runner sits here.
  { id: 'blueberry', name: 'Blueberry',      unlockAt: 300, image: '/tiderun/blueberry.png', blurb: 'Deep water blue, for deeper water runs.' },
  { id: 'taupe',     name: 'Driftwood',      unlockAt: 375, image: '/tiderun/taupe.png',     blurb: 'Weathered by more crossings than most.' },
  // Tide Champion sits here.
  { id: 'pink',      name: 'Coral',          unlockAt: 450, image: '/tiderun/pink.png',      blurb: 'Bright enough that the beacons see you coming.' },
  { id: 'cherry',    name: 'Cherry',         unlockAt: 525, image: '/tiderun/cherry.png',    blurb: 'Racing red, and it knows it.' },
  // Past the genuine record (570m) from here on.
  { id: 'grape',     name: 'Grape',          unlockAt: 600, image: '/tiderun/grape.png',     blurb: 'Tide Master water. You are in rare company.' },
  { id: 'black',     name: 'Pitch',          unlockAt: 700, image: '/tiderun/black.png',     blurb: 'Runs the night stretch without being seen.' },
  { id: 'golden',    name: 'Gilded',         unlockAt: 800, image: '/tiderun/golden.png',    blurb: 'Heavier than it looks. Worth more than it weighs.' },
  { id: 'ghost',     name: 'The Ghost',      unlockAt: 900, image: '/tiderun/ghost.png',     blurb: 'Nobody has honestly sailed this far. Yet.' },
]

export function tideRunBoat(id: string | null | undefined): TideRunBoat {
  return TIDE_RUN_BOATS.find(b => b.id === id) ?? TIDE_RUN_BOATS[0]
}

/** Every boat this distance has earned, in ladder order. */
export function unlockedBoats(bestDistance: number): TideRunBoat[] {
  return TIDE_RUN_BOATS.filter(b => bestDistance >= b.unlockAt)
}

export function isBoatUnlocked(id: string, bestDistance: number): boolean {
  return bestDistance >= tideRunBoat(id).unlockAt
}

/** The next boat still to earn, or null once the ladder is finished. Drives the
 *  "next up" line on the wreck screen, which is what turns a death into another
 *  run rather than a stopping point. */
export function nextBoat(bestDistance: number): TideRunBoat | null {
  return TIDE_RUN_BOATS.find(b => bestDistance < b.unlockAt) ?? null
}

/** Boats earned by crossing from `before` to `after`, so a single run can
 *  announce more than one. Returns them in ladder order. */
export function boatsUnlockedBetween(before: number, after: number): TideRunBoat[] {
  return TIDE_RUN_BOATS.filter(b => b.unlockAt > before && b.unlockAt <= after)
}
