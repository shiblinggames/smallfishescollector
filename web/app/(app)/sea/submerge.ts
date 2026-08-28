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
  // A moored boat. Barely under — a hull floats, it does not wade.
  smack:    { keep: 0.26, pts: [[0, 87], [100, 87]] },
  // A float on a chain, riding low.
  buoy:     { keep: 0.30, pts: [[0, 66], [100, 66]] },
  // Aground and going nowhere. Half of it is under.
  wreck:    { keep: 0.26, pts: [[0, 62], [100, 62]] },
  // On legs, in deep water — you see the legs go down and lose them.
  rig:      { keep: 0.22, pts: [[0, 80], [100, 80]] },
  // A rib cage in the shallows, part buried.
  bones:    { keep: 0.24, pts: [[0, 74], [100, 74]] },
  // Carved stone, standing in it.
  monolith: { keep: 0.20, pts: [[0, 78], [100, 78]] },
  // A rock cluster breaking the surface.
  islet:    { keep: 0.24, pts: [[0, 76], [100, 76]] },

  // The two berths, side-on now: a horizontal deck on a row of piles, so the
  // waterline is a flat cut through the piles — the V existed for the old
  // isometric plates' near corner and retired with them. First guesses;
  // /sea/waterline is where they get drawn properly.
  'dock-raids':   { keep: 0.30, pts: [[0, 74], [100, 74]] },
  'dock-voyages': { keep: 0.30, pts: [[0, 72], [100, 72]] },

  // ── THE REEF ─────────────────────────────────────────────────────────
  // Each painted with a dark wet band at its foot; the waterline sits just
  // above where that band starts, so the paint and the mask agree.
  'rock-spire':   { keep: 0.20, pts: [[0, 82], [100, 82]] },
  'rock-dome':    { keep: 0.22, pts: [[0, 78], [100, 78]] },
  'rock-split':   { keep: 0.20, pts: [[0, 80], [100, 80]] },
  'rock-slab':    { keep: 0.28, pts: [[0, 68], [100, 68]] },
  'rock-crag':    { keep: 0.21, pts: [[0, 80], [100, 80]] },
  'rock-cobbles': { keep: 0.24, pts: [[0, 74], [100, 74]] },
  'rock-gate-w':  { keep: 0.18, pts: [[0, 86], [100, 86]] },
  'rock-gate-e':  { keep: 0.18, pts: [[0, 86], [100, 86]] },
}

/** The art each kind is painted in, for the bench's picker. The chart derives
 *  kind from the art's basename (markKind), so this is the same mapping run
 *  the other way. */
export const SUBMERGE_ART: Record<string, string> = Object.fromEntries(
  Object.keys(SUBMERGE).map(k => [k, `/sea/${k}.png`]))
