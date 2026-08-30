// WHERE EVERY OBJECT MEETS THE WATER.
//
// One entry per art basename. `keep` is how much of the underwater part you
// can still make out through the surface; `pts` is THE WATERLINE ITSELF, drawn
// as a polyline — pairs of [x%, y%] across the sprite, left to right.
//
// A polyline, because a waterline is a drawing, not a number. This started as
// one flat `line` per sprite, grew a centre-apex `v` when the isometric docks
// needed it, and was still wrong for anything asymmetric — a hull dips at the
// bow, a jetty's low corner is wherever the artist put it. Five points can say
// all of that; the old shapes are just special cases (a flat line is two
// points, the docks' V is three).
//
// TUNED ON /sea/waterline, which renders through the same component the chart
// does and prints this table back out. Placing these by reading numbers is
// hopeless for the same reason it was for the shipyard's callouts: the only
// honest way is to look at it.

export type Submerge = { keep: number; pts: [number, number][] }

export const SUBMERGE: Record<string, Submerge> = {
  // Drawn by hand on /sea/waterline, 2026-08-28. Every line below is where the
  // water actually crosses that painting, not where a formula guessed it.
  smack:    { keep: 0.26, pts: [[0, 62], [23.9, 81.5], [50, 90.7], [73.5, 93.2], [100, 92.7]] },
  buoy:     { keep: 0.3,  pts: [[0, 74.3], [25.5, 91], [51.6, 95.5], [74, 94.1], [100, 77.6]] },
  wreck:    { keep: 0.26, pts: [[0, 90.8], [31.2, 89.9], [100, 91]] },
  rig:      { keep: 0.22, pts: [[0, 64.7], [45.5, 84.4], [100, 60]] },
  bones:    { keep: 0.24, pts: [[0, 67.7], [100, 80.2]] },
  monolith: { keep: 0.2,  pts: [[0, 71.5], [59.4, 79.5], [100, 80]] },
  islet:    { keep: 0.24, pts: [[0, 72.7], [32.6, 79.3], [69.3, 80], [100, 64.4]] },


  'rock-spire':   { keep: 0.2,  pts: [[0, 82], [46, 83.7], [100, 82]] },
  'rock-dome':    { keep: 0.22, pts: [[0, 78], [45.9, 82.6], [100, 78]] },
  'rock-split':   { keep: 0.2,  pts: [[0, 76.4], [54.8, 86.5], [100, 80]] },
  'rock-slab':    { keep: 0.28, pts: [[0, 72.4], [47.3, 87.3], [83.3, 75.3], [100, 54.2]] },
  'rock-crag':    { keep: 0.21, pts: [[0, 80.5], [25.5, 85.5], [61.5, 91.7], [100, 77.1]] },
  'rock-cobbles': { keep: 0.24, pts: [[0, 74], [16.7, 79.8], [33.4, 64.6], [55.8, 64.3], [60.5, 78.5], [85.2, 81.9], [100, 72.7]] },
  'rock-gate-w':  { keep: 0.18, pts: [[0, 86], [53.5, 89.2], [100, 81.9]] },
  'rock-gate-e':  { keep: 0.18, pts: [[0, 85.5], [36.1, 89.9], [57.1, 90.8], [100, 84]] },
}

/** The art each kind is painted in, for the bench's picker. The chart derives
 *  kind from the art's basename (markKind), so this is the same mapping run
 *  the other way. */
export const SUBMERGE_ART: Record<string, string> = Object.fromEntries(
  Object.keys(SUBMERGE).map(k => [k, `/sea/${k}.png`]))

// The table is hand-pasted from the bench, so it gets the same module-load
// guard the portal's tiers have: a malformed line fails the build loudly
// instead of clipping a sprite into nonsense on the water.
for (const [k, sub] of Object.entries(SUBMERGE)) {
  const pts = sub.pts
  if (pts.length < 2 || pts[0][0] !== 0 || pts[pts.length - 1][0] !== 100) {
    throw new Error(`SUBMERGE['${k}']: waterline must run edge to edge`)
  }
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (y < 0 || y > 100) throw new Error(`SUBMERGE['${k}']: y out of range at point ${i}`)
    if (i > 0 && x <= pts[i - 1][0]) throw new Error(`SUBMERGE['${k}']: points must increase in x`)
  }
}
