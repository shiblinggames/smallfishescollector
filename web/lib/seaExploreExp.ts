// WHAT YOU HAVE ACTUALLY SEEN OF THE CAMPAIGN'S WATER.
//
// The expedition side's own fog. Same idea as `seaExplore` and deliberately not
// the same grid — see below — so the two are separate modules with separate
// bitfields on separate profile columns.
//
// ── WHY IT COULD NOT JUST BE A BIGGER FISHING GRID ──────────────────────────
//
// `seaExplore`'s grid starts at the reef (`FOG_Y0 = NORTH_WALL`) and runs
// SOUTH. Everything up here is north of that, so `fogIndex` has always returned
// -1 for the whole campaign and there has never been fog on it.
//
// Extending that grid northward is the obvious fix and it is a trap: a cell's
// index is `cy * W + cx` measured from the origin, so moving the origin shifts
// EVERY stored bit. Every captain's fishing chart would decode as somebody
// else's, and the only way out would be a migration over every profile row to
// re-index a mask about fog. Two grids, no migration, and the two halves of the
// game get to have different extents — which they want anyway, because the
// campaign is thirty-eight thousand pixels wide and mostly empty.
//
// ── AND IT IS SEEDED FROM WHAT YOU HAVE ALREADY BEATEN ──────────────────────
//
// A captain three chapters deep would otherwise log in to find the water they
// conquered gone dark. `seedFrom` takes the places they have cleared and lights
// those cells before the first frame, so fog arrives as something covering the
// parts they have NOT been rather than as an erasure of the parts they have.

import { HUB, HUB_R, BAYS, bayCentre } from '@/app/(app)/sea/raidWaters'
import { SEA_GATE } from '@/app/(app)/sea/chart'

/** World pixels per cell. The same size the fishing side uses: it is tuned to
 *  how much of the sea a viewport shows, and that does not change up here. */
export const XFOG_CELL = 700

/** How far around the boat clears, in cells. See seaExplore's note — a little
 *  more than you can literally see, so it reads as a chart being filled in
 *  rather than as a spotlight following the hull. */
export const XFOG_REVEAL = 1

/**
 * THE BOX, MEASURED OFF THE BAYS THEMSELVES.
 *
 * Not hand-picked numbers: the bays move when a chapter is re-laid, and a grid
 * with the old extent would quietly stop covering the new water. Padded by a
 * cell so a hull sitting on the outermost rim still has somewhere to stand.
 *
 * The SOUTH edge is the Sea Gate. South of that is the anchorage, which is
 * management — you are in it constantly and fogging it would be noise about a
 * place you have never once been unable to find.
 */
const bounds = (() => {
  let x0 = HUB.x - HUB_R, x1 = HUB.x + HUB_R
  let y0 = HUB.y - HUB_R
  for (const b of BAYS) {
    const c = bayCentre(b)
    x0 = Math.min(x0, c.x - b.r); x1 = Math.max(x1, c.x + b.r)
    y0 = Math.min(y0, c.y - b.r)
  }
  const pad = XFOG_CELL
  return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: SEA_GATE.y + pad }
})()

export const XFOG_X0 = bounds.x0
export const XFOG_Y0 = bounds.y0
export const XFOG_W = Math.ceil((bounds.x1 - bounds.x0) / XFOG_CELL)
export const XFOG_H = Math.ceil((bounds.y1 - bounds.y0) / XFOG_CELL)
export const XFOG_CELLS = XFOG_W * XFOG_H

/** Is this point on the campaign's half of the world at all? */
export function inExpWater(y: number): boolean {
  return y <= bounds.y1
}

/** Cell index for a world point, or -1 if it is off this grid. */
export function xfogIndex(x: number, y: number): number {
  const cx = Math.floor((x - XFOG_X0) / XFOG_CELL)
  const cy = Math.floor((y - XFOG_Y0) / XFOG_CELL)
  if (cx < 0 || cy < 0 || cx >= XFOG_W || cy >= XFOG_H) return -1
  return cy * XFOG_W + cx
}

/** The centre of a cell, in world pixels — for drawing it. */
export function xfogCentre(i: number): { x: number; y: number } {
  const cx = i % XFOG_W
  const cy = Math.floor(i / XFOG_W)
  return {
    x: XFOG_X0 + (cx + 0.5) * XFOG_CELL,
    y: XFOG_Y0 + (cy + 0.5) * XFOG_CELL,
  }
}

/** Every cell revealed by standing at a point. */
export function xfogReveal(x: number, y: number): number[] {
  const out: number[] = []
  for (let dy = -XFOG_REVEAL; dy <= XFOG_REVEAL; dy++) {
    for (let dx = -XFOG_REVEAL; dx <= XFOG_REVEAL; dx++) {
      const i = xfogIndex(x + dx * XFOG_CELL, y + dy * XFOG_CELL)
      if (i >= 0) out.push(i)
    }
  }
  return out
}

/** Every cell within `r` of a point — for seeding around a place you have been. */
export function xfogDisc(x: number, y: number, r: number): number[] {
  const out: number[] = []
  const n = Math.ceil(r / XFOG_CELL)
  for (let dy = -n; dy <= n; dy++) {
    for (let dx = -n; dx <= n; dx++) {
      if (Math.hypot(dx, dy) * XFOG_CELL > r) continue
      const i = xfogIndex(x + dx * XFOG_CELL, y + dy * XFOG_CELL)
      if (i >= 0) out.push(i)
    }
  }
  return out
}

// ── the bitfield ────────────────────────────────────────────────────────────
//
// Identical in shape to seaExplore's, and duplicated rather than shared on
// purpose: these functions close over XFOG_CELLS, and a "generic" version taking
// the count as an argument would be one call site away from writing a fishing
// bit into a campaign mask. Twenty lines is a cheaper safeguard than that.

export function emptyXfog(): Uint8Array {
  return new Uint8Array(Math.ceil(XFOG_CELLS / 8))
}

export function xfogHas(bits: Uint8Array, i: number): boolean {
  return i >= 0 && (bits[i >> 3] & (1 << (i & 7))) !== 0
}

export function xfogSet(bits: Uint8Array, i: number): void {
  if (i >= 0 && i < XFOG_CELLS) bits[i >> 3] |= 1 << (i & 7)
}

export function encodeXfog(bits: Uint8Array): string {
  let s = ''
  for (const b of bits) s += String.fromCharCode(b)
  return btoa(s)
}

/** A mask that no longer fits keeps whatever still lines up. The grid can move
 *  when a bay is re-laid, and the honest answer to that is not to wipe somebody
 *  or to throw on a page load over fog. */
export function decodeXfog(raw: string | null | undefined): Uint8Array {
  const bits = emptyXfog()
  if (!raw) return bits
  try {
    const s = atob(raw)
    for (let i = 0; i < Math.min(s.length, bits.length); i++) bits[i] = s.charCodeAt(i)
  } catch { /* a mask we cannot read is a mask we do not have */ }
  return bits
}

/**
 * OPEN THE WATER A CAPTAIN HAS ALREADY EARNED.
 *
 * Called once, only when the stored mask is empty, with the world positions of
 * everything they have cleared. Fog that arrives after the fact must not read
 * as having taken something away.
 */
export function seedXfog(bits: Uint8Array, been: { x: number; y: number }[]): void {
  // The junction is the door to all of it — anybody who has cleared anything
  // has crossed it, and anybody who has not is standing in it right now.
  for (const i of xfogDisc(HUB.x, HUB.y, HUB_R)) xfogSet(bits, i)
  // A wide disc rather than a single cell, because you did not arrive at a boss
  // by teleporting: you sailed the water around it.
  for (const p of been) for (const i of xfogDisc(p.x, p.y, XFOG_CELL * 2)) xfogSet(bits, i)
}
