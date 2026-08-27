// WHAT YOU CANNOT SAIL THROUGH.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Traders were placed by hashing a cell and taking a uniformly random point in
// it, then given a slow circular patrol around that anchor. Three guards kept
// them somewhere reachable — inside the outer ring, south of the reef, off the
// Mainland's doorstep — and every one of them is about the EDGES of the world.
// Nothing tested the things standing in the middle of it. So traders were
// moored inside islands, and their patrols carried them straight across ports:
// a captain watched one sail through the Trawl Docks.
//
// The chart already knew where all of this was. It was just that only Finn
// asked. This is that knowledge, in one place, for anyone who has to put a boat
// down somewhere.
//
// ── ON FINN ─────────────────────────────────────────────────────────────────
//
// seaFinn.ts keeps its OWN list and deliberately does not use this one. His
// clearances are hail circles, not hulls: he must not stand where his prompt
// would fight a port's or an isle's, because the action bar shows one thing at
// a time, so his radii are much larger than anything physical. They are also
// load-bearing in a way these are not — his position is a pure function of how
// many times you have met him, so changing a radius MOVES HIM for every captain
// mid-story. Two lists is the right answer here; scripts/check-finn.mts and
// scripts/check-traders.mts hold each honest separately.

import { PLACES, LANDMARKS } from '@/app/(app)/sea/chart'
import { ISLES } from '@/lib/seaIsles'

export type Solid = {
  x: number
  y: number
  /** Physical extent in world pixels. Not a mooring ring and not a hail
   *  circle — the rock itself. */
  r: number
  /** For the checker's failure messages, which are useless without it. */
  what: string
}

/**
 * How much water a hull needs around it.
 *
 * A boat is drawn as a sprite, not a point, so clearing a shore by one pixel
 * still puts half a bowsprit in it. Roughly half a hull at chart scale.
 */
export const BOAT_CLEAR = 60

/**
 * Everything solid on the chart, built once at module load.
 *
 * Bands are skipped. A band is not an obstacle, it is the water itself, and
 * `p.inner !== undefined` is the same test scripts/place-isles.mts uses to tell
 * one from the other.
 */
export const SOLIDS: Solid[] = (() => {
  const out: Solid[] = []
  for (const p of PLACES) {
    if (p.inner !== undefined) continue
    out.push({ x: p.x, y: p.y, r: p.r, what: `port ${p.id}` })
  }
  for (const i of ISLES) out.push({ x: i.x, y: i.y, r: i.r, what: `isle ${i.id}` })
  // Landmarks are scenery with no prompt of their own, so all that matters is
  // that a hull is not drawn inside one. `size` is the drawn radius.
  for (const l of LANDMARKS) out.push({ x: l.x, y: l.y, r: l.size, what: 'landmark' })
  return out
})()

/** Is this point clear of every solid thing, with `pad` to spare? */
export function clearOfSolids(x: number, y: number, pad = 0): boolean {
  for (const s of SOLIDS) {
    if (Math.hypot(s.x - x, s.y - y) < s.r + pad) return false
  }
  return true
}

/** What this point is inside, or null. The checker reports it; nothing else
 *  needs it, but a failure that cannot name the rock is a failure you have to
 *  go and find by hand. */
export function solidAt(x: number, y: number, pad = 0): Solid | null {
  for (const s of SOLIDS) {
    if (Math.hypot(s.x - x, s.y - y) < s.r + pad) return s
  }
  return null
}
