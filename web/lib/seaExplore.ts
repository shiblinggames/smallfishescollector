// WHAT YOU HAVE ACTUALLY SEEN OF THE CHART.
//
// Plain module, NOT 'use server' — a file with that directive silently drops
// every non-async export and all of this is pure. Read by the map (to mark
// where the boat has been), by the minimap (to draw the fog) and by the server
// action that persists it, and all three have to agree about the grid.
//
// ── WHY A BITMASK AND NOT A LIST ────────────────────────────────────────────
//
// The fishable chart is 45,200 world pixels across and 24,100 deep. At a 700px
// cell that is 2,275 cells, which as a list of visited indices would grow to
// several kilobytes of JSON on a profile row that is read on every page load.
// As a bitfield it is 285 bytes, base64s to 380 characters, and never grows
// past that however much of the sea you cover.
//
// It is also idempotent under OR, which is the property that matters: two
// tabs, or a stale flush arriving late, can only ever ADD cells. There is no
// ordering to get wrong and nothing to reconcile.

import { PLACES, NORTH_WALL } from '@/app/(app)/sea/chart'

/** World pixels per fog cell. */
export const FOG_CELL = 700

/**
 * HOW FAR AROUND THE BOAT GETS REVEALED, in cells.
 *
 * 1 means the boat's own cell plus the ring around it — 2,100 pixels across.
 * The viewport shows roughly 800 to 1,600 world pixels depending on zoom, so
 * this is a little more than you can literally see, which is deliberate: fog
 * that clears exactly to the edge of the screen reads as a spotlight following
 * you around rather than as a chart you are filling in.
 */
export const FOG_REVEAL = 1

/** The outermost water. Everything past this is off the chart. */
const OUTER = Math.max(...PLACES.map(p => p.outer ?? 0))

/** Grid origin, in world pixels. The chart is symmetric in x and runs from the
 *  north wall down to the outermost band in y. */
export const FOG_X0 = -OUTER
export const FOG_Y0 = NORTH_WALL
export const FOG_W = Math.ceil((OUTER * 2) / FOG_CELL)
export const FOG_H = Math.ceil((OUTER - NORTH_WALL) / FOG_CELL)
export const FOG_CELLS = FOG_W * FOG_H

/** Cell index for a world point, or -1 if it is off the chart entirely. */
export function fogIndex(x: number, y: number): number {
  const cx = Math.floor((x - FOG_X0) / FOG_CELL)
  const cy = Math.floor((y - FOG_Y0) / FOG_CELL)
  if (cx < 0 || cy < 0 || cx >= FOG_W || cy >= FOG_H) return -1
  return cy * FOG_W + cx
}

/** The centre of a cell, in world pixels — for drawing it. */
export function fogCentre(i: number): { x: number; y: number } {
  const cx = i % FOG_W
  const cy = Math.floor(i / FOG_W)
  return {
    x: FOG_X0 + (cx + 0.5) * FOG_CELL,
    y: FOG_Y0 + (cy + 0.5) * FOG_CELL,
  }
}

/** Every cell revealed by standing at a point. */
export function fogReveal(x: number, y: number): number[] {
  const out: number[] = []
  for (let dy = -FOG_REVEAL; dy <= FOG_REVEAL; dy++) {
    for (let dx = -FOG_REVEAL; dx <= FOG_REVEAL; dx++) {
      const i = fogIndex(x + dx * FOG_CELL, y + dy * FOG_CELL)
      if (i >= 0) out.push(i)
    }
  }
  return out
}

// ── the bitfield ────────────────────────────────────────────────────────────

export function emptyFog(): Uint8Array {
  return new Uint8Array(Math.ceil(FOG_CELLS / 8))
}

export function fogHas(bits: Uint8Array, i: number): boolean {
  return i >= 0 && (bits[i >> 3] & (1 << (i & 7))) !== 0
}

export function fogSet(bits: Uint8Array, i: number): void {
  if (i >= 0 && i < FOG_CELLS) bits[i >> 3] |= 1 << (i & 7)
}

export function fogCount(bits: Uint8Array): number {
  let n = 0
  for (const b of bits) {
    let v = b
    while (v) { n += v & 1; v >>= 1 }
  }
  return n
}

/**
 * ENCODE / DECODE.
 *
 * `btoa`/`atob` rather than Buffer, because this runs on both sides — the map
 * decodes it in the browser and the action re-encodes it on the server, and
 * Buffer does not exist in one of those.
 *
 * A decode that is the wrong length is not an error worth throwing over: the
 * grid can change (a wider chart moves FOG_W) and the honest response to a mask
 * that no longer fits is to keep what still lines up rather than to wipe
 * somebody's exploration or to crash the page over fog.
 */
export function encodeFog(bits: Uint8Array): string {
  let s = ''
  for (const b of bits) s += String.fromCharCode(b)
  return btoa(s)
}

export function decodeFog(raw: string | null | undefined): Uint8Array {
  const bits = emptyFog()
  if (!raw) return bits
  try {
    const s = atob(raw)
    for (let i = 0; i < Math.min(s.length, bits.length); i++) bits[i] = s.charCodeAt(i)
  } catch { /* unreadable — start clean rather than fail the page */ }
  return bits
}

/** How much of the FISHABLE chart is uncovered, 0..1.
 *
 *  Measured against the cells that are actually water, not against the whole
 *  grid — the grid is a rectangle and the chart is a half-disc inside it, so
 *  scoring against every cell would cap a completionist at about 40% and read
 *  as a bug. */
export function fogProgress(bits: Uint8Array): { seen: number; total: number; pct: number } {
  let seen = 0
  let total = 0
  for (let i = 0; i < FOG_CELLS; i++) {
    const c = fogCentre(i)
    if (c.y <= 0) continue
    const R = Math.hypot(c.x, c.y)
    if (R > OUTER) continue
    total++
    if (fogHas(bits, i)) seen++
  }
  return { seen, total, pct: total ? seen / total : 0 }
}
