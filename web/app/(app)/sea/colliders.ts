// WHAT A HULL ACTUALLY HITS, drawn by hand.
//
// The chart's default is one circle per object — a port is r*0.72, a landmark
// is size*0.42 — and a circle is the largest thing that fits inside an
// irregular silhouette. That gap is every complaint of the form "I bounced off
// empty water" (the circle pokes past the paint on the narrow axis) and "I
// sailed through the jetty" (the circle stops short on the long axis). The
// horizontal docks are the worst case: a 624-wide deck inside one circle is
// wrong at both ends at once.
//
// An entry here replaces the default with UP TO FOUR circles, placed on
// /sea/boundary against the actual art. Circles, not polygons, because the
// frame loop resolves circles — push out along the normal, keep the sliding
// component — and four of them trace a jetty or a headland close enough that
// nobody can tell the difference from the deck of a boat.
//
// ── UNITS ────────────────────────────────────────────────────────────────
// SeaMark art (landmarks, docks): `ax, ay` are fractions of the SPRITE — x
// across, y down from its top — and `ar` is a fraction of its drawn width.
// The runtime converts through the art's aspect and the ground squash, so
// what you circle on the bench is what the hull hits on the water. `aspect`
// is height/width of the art file, measured by the bench when the entry is
// drawn; the runtime cannot measure it without loading the image.
//
// Ports: `ax, ay` are plain world fractions of the port's radius, both axes,
// relative to its centre — the coastline polygon lives in that same box.

/**
 * Two primitives, because the art is mostly isometric and a circle is the
 * wrong first shape for an isometric footprint:
 *
 *   · CIRCLE — for the round things. { ax, ay, ar }.
 *   · CAPSULE — a segment with a radius, the stadium shape. { ax, ay, bx, by,
 *     ar }. Laid along a deck, a slab or a hull it IS the footprint, one of it
 *     replacing three circles on anything long — and the frame loop's resolve
 *     is the same push-out, off the closest point of a segment instead of a
 *     centre. Three extra arithmetic ops per test.
 */
export type ColliderShape =
  | { kind: 'circle'; ax: number; ay: number; ar: number }
  | { kind: 'capsule'; ax: number; ay: number; bx: number; by: number; ar: number }

export type ArtCollider = { aspect: number; shapes: ColliderShape[] }
export type PortCollider = { shapes: ColliderShape[] }

/** Keyed by art basename (markKind). Empty entries fall back to the default
 *  single circle, so this table only ever needs the shapes a circle gets
 *  wrong. Filled from /sea/boundary. */
export const ART_COLLIDERS: Record<string, ArtCollider> = {
  // Drawn by hand on /sea/boundary, 2026-08-28 — one capsule laid along each
  // footprint. Aspects are MEASURED off the art files, not taken from the
  // harvest: the browser was serving cached pre-regen dock plates while the
  // docks were tuned, so those two harvested aspects (0.404/0.401) described
  // art that no longer exists. The dock capsules themselves are near-right on
  // the new plates but were drawn against the old — worth a retouch pass.
  smack:    { aspect: 0.906, shapes: [{ kind: 'capsule', ax: 0.205, ay: 0.6, bx: 0.771, by: 0.826, ar: 0.1 }] },
  buoy:     { aspect: 1,     shapes: [{ kind: 'capsule', ax: 0.313, ay: 0.765, bx: 0.649, by: 0.851, ar: 0.1 }] },
  islet:    { aspect: 1,     shapes: [{ kind: 'capsule', ax: 0.213, ay: 0.712, bx: 0.843, by: 0.709, ar: 0.1 }] },
  wreck:    { aspect: 1,     shapes: [{ kind: 'capsule', ax: 0.257, ay: 0.834, bx: 0.757, by: 0.834, ar: 0.1 }] },
  rig:      { aspect: 1,     shapes: [{ kind: 'capsule', ax: 0.21,  ay: 0.726, bx: 0.71,  by: 0.726, ar: 0.1 }] },
  bones:    { aspect: 1,     shapes: [{ kind: 'capsule', ax: 0.159, ay: 0.632, bx: 0.829, by: 0.641, ar: 0.1 }] },
  monolith: { aspect: 1,     shapes: [{ kind: 'capsule', ax: 0.362, ay: 0.814, bx: 0.632, by: 0.819, ar: 0.1 }] },
  'rock-gate-w':  { aspect: 1.092, shapes: [{ kind: 'capsule', ax: 0.147, ay: 0.866, bx: 0.877, by: 0.861, ar: 0.1 }] },
  'rock-gate-e':  { aspect: 1.249, shapes: [{ kind: 'capsule', ax: 0.108, ay: 0.872, bx: 0.889, by: 0.863, ar: 0.121 }] },
}

// Hand-pasted from the bench, so it gets the same module-load guard the
// waterlines have: a malformed shape fails the build loudly.
for (const [k, c] of Object.entries(ART_COLLIDERS)) {
  if (!(c.aspect > 0.1 && c.aspect < 4)) throw new Error(`ART_COLLIDERS['${k}']: implausible aspect`)
  for (const sh of c.shapes) {
    const xs = sh.kind === 'capsule' ? [sh.ax, sh.bx] : [sh.ax]
    const ys = sh.kind === 'capsule' ? [sh.ay, sh.by] : [sh.ay]
    for (const v of [...xs, ...ys]) {
      if (v < -0.5 || v > 1.5) throw new Error(`ART_COLLIDERS['${k}']: point far outside the sprite`)
    }
    if (!(sh.ar > 0 && sh.ar < 1)) throw new Error(`ART_COLLIDERS['${k}']: implausible radius`)
  }
}

/** Keyed by port id. Fractions of the port's own r. */
export const PORT_COLLIDERS: Record<string, PortCollider> = {}

/** Keyed by isle id, same units as ports — fractions of the isle's own r,
 *  centre-origin, drawn over its true seeded coastline on the bench. */
export const ISLE_COLLIDERS: Record<string, PortCollider> = {}
