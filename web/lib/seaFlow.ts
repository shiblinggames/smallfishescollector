// ── WHAT THE WATER DOES TO YOU ──────────────────────────────────────────────
//
// Kong: make sailing more fun, with little things that speed you up or slow
// you down. Two of them live in the water and are here, as data and pure
// functions the chart's frame loop asks each frame (the third, full-sail
// momentum, is a property of how you steer and lives in SeaMap):
//
//   CURRENTS  Lanes of moving water that carry the hull along them. Ride one
//             and you go faster; sail against it and you are slowed; cross it
//             and you are set sideways. RING currents run round each band, so
//             working your way along a zone is quicker, and a pair of RADIAL
//             ones run out toward the Abyss and back in toward home. Fixed, so
//             they are something a captain learns and routes by.
//
//   KELP      A few weed beds, mostly in the Open Waters, that drag the hull to
//             about 60% while it is in them. Steer round or push through.
//
// All of it is on the fishing side only, and none of it pays anything: it is
// how the sea feels, not a reward table. Rendered by app/(app)/sea/seaFlowGfx.

import { PLACES } from '@/app/(app)/sea/chart'
import { ISLES } from './seaIsles'
import { clearOfSolids } from './seaSolid'

export type CurrentLane = {
  id: string
  /** The lane's centreline, in the direction the water runs. */
  pts: { x: number; y: number }[]
  /** Half the lane's width, in world px. */
  half: number
}

export type KelpBed = { x: number; y: number; r: number; seed: number }

/**
 * ── LANES MEANDER ──────────────────────────────────────────────────────────
 *
 * A current is not drawn with a compass. Every lane wanders a little either
 * side of its arc or ray, on two slow sines seeded by the lane, so the water
 * reads as a river in the sea rather than a ruled line (Kong: make them look
 * better). The physics uses the same wandering line, so what you see is where
 * the push is. Points every ~400px so the bends are smooth.
 */
function wander(seed: number, along: number): number {
  return Math.sin(along / 2600 + seed) * 170 + Math.sin(along / 1100 + seed * 2.3) * 60
}

/** A polyline along an arc round the Mainland, from angle a0 to a1 (radians,
 *  screen convention: 0 east, PI/2 south), in the order the water runs. */
function arc(r: number, a0: number, a1: number, seed: number): { x: number; y: number }[] {
  const n = Math.max(12, Math.ceil((Math.abs(a1 - a0) * r) / 400))
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    const rr = r + wander(seed, Math.abs(a - a0) * r)
    return { x: Math.round(Math.cos(a) * rr), y: Math.round(Math.sin(a) * rr) }
  })
}

/** A radial line at angle a, from radius r0 to r1, wandering either side. */
function ray(a: number, r0: number, r1: number, seed: number): { x: number; y: number }[] {
  const n = Math.max(8, Math.ceil(Math.abs(r1 - r0) / 400))
  return Array.from({ length: n + 1 }, (_, i) => {
    const r = r0 + ((r1 - r0) * i) / n
    const off = wander(seed, Math.abs(r - r0))
    return {
      x: Math.round(Math.cos(a) * r - Math.sin(a) * off),
      y: Math.round(Math.sin(a) * r + Math.cos(a) * off),
    }
  })
}

/**
 * THE LANES. Band middles (chart.ts): Open Waters 5,350, the Deep 8,900, the
 * Abyss 13,450. Neighbouring rings run opposite ways, so a captain working
 * across the sea can pick the ring that is going their way.
 */
export const CURRENTS: CurrentLane[] = [
  { id: 'ring-open', pts: arc(5300, 0.35, 2.8, 1.1), half: 300 },
  { id: 'ring-deep', pts: arc(8900, 2.8, 0.35, 2.7), half: 320 },
  { id: 'ring-abyss', pts: arc(13400, 0.4, 2.75, 4.2), half: 340 },
  { id: 'outbound', pts: ray(1.05, 3200, 15500, 0.6), half: 260 },
  { id: 'inbound', pts: ray(2.09, 15500, 3200, 3.3), half: 260 },
]

/** How hard a current carries you at its centre, as a share of the base
 *  sailing speed. Raised from 0.4 (Kong: it did not feel like catching one). */
export const CURRENT_PUSH = 0.55

/** How hard kelp holds you: the share of your speed you keep inside a bed. */
export const KELP_KEEP = 0.6

function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) {
  const vx = b.x - a.x, vy = b.y - a.y
  const L2 = vx * vx + vy * vy || 1
  const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / L2))
  const cx = a.x + vx * t, cy = a.y + vy * t
  const L = Math.sqrt(L2)
  return { d: Math.hypot(px - cx, py - cy), ux: vx / L, uy: vy / L, t }
}

/** Every lane's bounding box, padded by its width, for a cheap first test. */
const BOXES = CURRENTS.map(l => {
  const xs = l.pts.map(p => p.x), ys = l.pts.map(p => p.y)
  return { x0: Math.min(...xs) - l.half, x1: Math.max(...xs) + l.half, y0: Math.min(...ys) - l.half, y1: Math.max(...ys) + l.half }
})

/**
 * THE WATER'S PULL AT A POINT: a direction and a strength 0..1, soft at the
 * lane's edges and fading over its first and last stretch so a lane does not
 * start or stop on a line. Multiply by CURRENT_PUSH and the base speed to get
 * px per second. Zero almost everywhere.
 *
 * ── WHERE TWO LANES CROSS ──────────────────────────────────────────────────
 * The two radials cut through all three rings. Taking simply the stronger
 * lane at each point made a seam down the diagonal of every crossing where
 * the winner flipped frame to frame: a drifting hull zigzagged along it (100+
 * flips in a few seconds, simulated) and was then hijacked off its ring
 * (Kong: weird where two currents meet). So the lane you are IN is sticky:
 * pass `prefer` (the `id` this returned last frame) and it keeps carrying you
 * through a crossing until the other lane is more than twice as strong. The
 * 2x band is the hysteresis; there is no seam to flip on.
 */
export function currentAt(x: number, y: number, prefer?: string | null): { ux: number; uy: number; k: number; id: string | null } {
  let best = { ux: 0, uy: 0, k: 0, id: null as string | null }
  let kept: typeof best | null = null
  for (let li = 0; li < CURRENTS.length; li++) {
    const b = BOXES[li]
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
    const lane = CURRENTS[li]
    const n = lane.pts.length - 1
    let mine = { ux: 0, uy: 0, k: 0, id: lane.id as string | null }
    for (let i = 0; i < n; i++) {
      const s = segDist(x, y, lane.pts[i], lane.pts[i + 1])
      if (s.d >= lane.half) continue
      const across = 1 - s.d / lane.half
      const edge = across * across * (3 - 2 * across)
      // Along the whole lane, 0..1, for the fade at either end.
      const along = (i + s.t) / n
      const ends = Math.min(1, along / 0.12, (1 - along) / 0.12)
      const k = edge * Math.max(0, ends)
      if (k > mine.k) mine = { ux: s.ux, uy: s.uy, k, id: lane.id }
    }
    if (mine.k <= 0) continue
    if (lane.id === prefer) kept = mine
    if (mine.k > best.k) best = mine
  }
  if (kept && kept.k * 2 >= best.k) return kept
  return best
}

/** How strongly any lane OTHER than `id` runs at a point, 0..1. For the
 *  drawing: an edge's foam has no business inside another lane's water. */
export function otherLaneK(x: number, y: number, id: string): number {
  let k = 0
  for (let li = 0; li < CURRENTS.length; li++) {
    const lane = CURRENTS[li]
    if (lane.id === id) continue
    const b = BOXES[li]
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
    for (let i = 0; i < lane.pts.length - 1; i++) {
      const s = segDist(x, y, lane.pts[i], lane.pts[i + 1])
      if (s.d < lane.half) k = Math.max(k, 1 - s.d / lane.half)
    }
  }
  return k
}

/**
 * THE BEDS, placed once and the same for everybody: a seeded walk that keeps
 * well clear of the Mainland's approach, every port and isle, every current
 * lane and every solid rock.
 *
 * SPARSE, AND SMALL NEAR HOME (Kong: too common, especially the big ones in
 * the Shallows). It was fourteen anywhere from the Shallows out, and four of
 * them big ones in a band that is the smallest water on the chart and the one
 * every trip crosses. Now eight: at most two in the Shallows and both small,
 * the other six in the Open Waters, which is where the big ones belong, and
 * well spaced so a bed is a thing you come across rather than a texture.
 */
const KELP_QUOTA: { inner: number; outer: number; n: number; rMin: number; rMax: number }[] = [
  { inner: 2300, outer: 3500, n: 2, rMin: 120, rMax: 160 },   // the Shallows (1400-3800)
  { inner: 4200, outer: 6600, n: 6, rMin: 170, rMax: 280 },   // the Open Waters (3800-6900)
]
export const KELP: KelpBed[] = (() => {
  let s = 0x5eed1e
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  const out: KelpBed[] = []
  for (const q of KELP_QUOTA) {
    let got = 0
    for (let tries = 0; tries < 4000 && got < q.n; tries++) {
      const a = 0.12 + rnd() * (Math.PI - 0.24)
      const rad = q.inner + rnd() * (q.outer - q.inner)
      const x = Math.round(Math.cos(a) * rad), y = Math.round(Math.sin(a) * rad)
      const r = Math.round(q.rMin + rnd() * (q.rMax - q.rMin))
      if (y < 500) continue
      if (PLACES.some(p => p.kind === 'port' && Math.hypot(p.x - x, p.y - y) < p.r * 1.48 + r + 500)) continue
      if (ISLES.some(i => Math.hypot(i.x - x, i.y - y) < i.r * 1.48 + r + 300)) continue
      if (CURRENTS.some(l => l.pts.slice(1).some((p, i) => segDist(x, y, l.pts[i], p).d < l.half + r + 250))) continue
      if (!clearOfSolids(x, y, r + 120)) continue
      if (out.some(k => Math.hypot(k.x - x, k.y - y) < k.r + r + 2200)) continue
      out.push({ x, y, r, seed: out.length })
      got++
    }
  }
  return out
})()

/** How deep in a kelp bed a point is, 0 outside to 1 in the thick of it. */
export function kelpAt(x: number, y: number): number {
  let best = 0
  for (const k of KELP) {
    const d = Math.hypot(k.x - x, k.y - y)
    if (d >= k.r) continue
    const t = 1 - d / k.r
    best = Math.max(best, Math.min(1, t * 2.2))
  }
  return best
}
