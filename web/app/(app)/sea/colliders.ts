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
export const ART_COLLIDERS: Record<string, ArtCollider> = {}

/** Keyed by port id. Fractions of the port's own r. */
export const PORT_COLLIDERS: Record<string, PortCollider> = {}
