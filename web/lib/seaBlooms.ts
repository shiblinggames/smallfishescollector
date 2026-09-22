// ── BIOLUMINESCENCE, AS PLACES ──────────────────────────────────────────────
//
// The first cut lit every wake past the Deep's inner edge, which made the
// glow a property of a band: the whole outer sea, all night, every hull. Kong:
// "should just be areas of bioluminescence, not the whole outer edge." Right,
// and it is also how the real thing behaves. A bloom is a patch of water,
// somewhere, and finding one is the point.
//
// So these are places, the same shape the fog banks and the squalls take:
// authored, fixed, and derived from nothing. Every captain finds the same
// bloom in the same water. Nothing is rolled and nothing is stored.
//
// They sit in the Deep and the Abyss, well off the lanes to the ports, and
// they were probed against the chart's solids so none of them overlaps an
// island or a port. Change one and run the probe again.
//
// A bloom is a soft disc: full strength inside a third of its radius, gone at
// the edge. The wake reads it (a hull inside one glows as it moves, and rings
// glow when it stops) and the water shader reads it (a faint field on the
// surface at night, so a bloom can be seen from a little way off and sailed
// to rather than only discovered by accident).
export type Bloom = { key: string; x: number; y: number; r: number }

//
// PROBED, 2026-09-22: a polar scan of each band for centres whose whole disc
// clears every solid, then six picked by hand for spread. The first guess
// by eye put all six on landmarks, which is the usual result of guessing.
export const BLOOMS: Bloom[] = [
  // The Deep, three around the band.
  { key: 'deep-e',  x:  8269, y:  3010, r: 1100 },
  { key: 'deep-s',  x:  -732, y:  8368, r: 1100 },
  { key: 'deep-sw', x: -5500, y:  6900, r: 1000 },
  // The Abyss, further out and bigger, because the water is darker there.
  { key: 'abyss-e', x: 10739, y:  6200, r: 1400 },
  { key: 'abyss-s', x:   300, y: 14400, r: 1400 },
  { key: 'abyss-w', x: -11085, y: 6400, r: 1400 },
]

/** How much bloom is under this point, 0 to 1. The strongest wins rather
 *  than summing, so two neighbours do not make a brighter one. */
export function bloomAt(x: number, y: number): number {
  let best = 0
  for (const b of BLOOMS) {
    const d = Math.hypot(x - b.x, y - b.y)
    if (d >= b.r) continue
    const k = 1 - Math.max(0, (d - b.r * 0.33) / (b.r * 0.67))
    const e = k * k * (3 - 2 * k)
    if (e > best) best = e
  }
  return best
}

/** The blooms within reach of a camera, for the shader's four slots. */
export function bloomsAround(x: number, y: number, halfW: number, halfH: number): Bloom[] {
  return BLOOMS.filter(b =>
    Math.abs(b.x - x) < halfW + b.r && Math.abs(b.y - y) < halfH + b.r)
}
