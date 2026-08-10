// Tide Run boats — the cosmetic ladder that gives a run something to chase
// past its own distance number.
//
// UNLOCKED BY BEST DISTANCE, which is the only currency this game has and the
// only one a standalone build could carry offline. Thresholds are pinned to
// what players actually reach rather than to round numbers: across 38 captains
// the median best is 306m, the 25th percentile 224m, the 90th 467m and the
// all-time record 813m. So the first boat lands before most players' first
// serious run, the middle of the ladder sits where the median already is, and
// the last two are past anything anyone has ever done.
//
// THE ART DOES NOT DRIVE THE HITBOX. Every boat here is 320x202 (aspect 1.58)
// while the original is 1.35, and the collision box is derived from SHIP_ASPECT
// via HITBOX_INSET. Sizing the box off the art would have made every new boat
// ~17% wider to hit, quietly making the game harder for anyone who unlocked
// one. The box stays exactly as it was and the art is drawn around it, so a
// wider hull overhangs slightly — collision that is more forgiving than it
// looks, which is the right direction for a runner and the standard trick.

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
  { id: 'original',  name: 'The Old Hull',   unlockAt: 0,    image: null,                       blurb: 'The one you started with. It has seen things.' },
  { id: 'gray',      name: 'Gunmetal',       unlockAt: 100,  image: '/tiderun/gray.png',        blurb: 'Plain, honest, and quietly fast.' },
  { id: 'seafoam',   name: 'Seafoam',        unlockAt: 200,  image: '/tiderun/seafoam.png',     blurb: 'The colour of the water right behind you.' },
  { id: 'green',     name: 'Kelp',           unlockAt: 300,  image: '/tiderun/green.png',       blurb: 'Painted to vanish against the shallows.' },
  { id: 'blueberry', name: 'Blueberry',      unlockAt: 400,  image: '/tiderun/blueberry.png',   blurb: 'Deep water blue, for deeper water runs.' },
  { id: 'taupe',     name: 'Driftwood',      unlockAt: 500,  image: '/tiderun/taupe.png',       blurb: 'Weathered by more crossings than most.' },
  { id: 'pink',      name: 'Coral',          unlockAt: 650,  image: '/tiderun/pink.png',        blurb: 'Bright enough that the beacons see you coming.' },
  { id: 'cherry',    name: 'Cherry',         unlockAt: 800,  image: '/tiderun/cherry.png',      blurb: 'Racing red, and it knows it.' },
  { id: 'grape',     name: 'Grape',          unlockAt: 1000, image: '/tiderun/grape.png',       blurb: 'Past a thousand metres, you pick your own colours.' },
  { id: 'black',     name: 'Pitch',          unlockAt: 1300, image: '/tiderun/black.png',       blurb: 'Runs the night stretch without being seen.' },
  { id: 'golden',    name: 'Gilded',         unlockAt: 1600, image: '/tiderun/golden.png',      blurb: 'Heavier than it looks. Worth more than it weighs.' },
  { id: 'ghost',     name: 'The Ghost',      unlockAt: 2000, image: '/tiderun/ghost.png',       blurb: 'Nobody has sailed this far. Yet.' },
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
