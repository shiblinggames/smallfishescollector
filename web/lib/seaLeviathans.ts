// ── SOMETHING IS DOWN THERE ─────────────────────────────────────────────────
//
// Large shapes moving under the expedition side, seen as shadows and never as
// creatures. They rise until they are almost readable, hold, and sound again.
//
// ── WHY THIS IS SCENERY AND STAYS SCENERY ───────────────────────────────────
//
// It pays nothing, drops nothing, can be neither hunted nor avoided, and no
// server ever hears about it. That is the entire design, not a stage it is at.
// The moment a shadow is worth something it becomes a thing to farm, the water
// becomes a spawn timer, and a captain crossing to a raid starts steering by a
// number instead of looking at the sea. The fishing half already has a system
// for "this patch of water is worth being in" (hotspots) and it is sized
// against a server that takes position on trust; a second one out here would
// double that exposure to buy an effect that works better for free.
//
// What it IS for: the expedition sea is enormous, deliberately emptier than the
// fishing grounds, and the crossings are long. A shadow the length of six
// warships passing beneath you on the way to a boss is the cheapest possible
// answer to "this ocean is bigger than you and you are a long way out".
//
// ── DERIVED, NEVER STORED ───────────────────────────────────────────────────
//
// A hash of (window, slot), exactly like the traders, the bottles, the squalls
// and the tempests. No rows, no cron, everybody sees the same shapes in the
// same water, and a reload puts them back where they were.

import { EXP_ORIGIN, EXP_EDGE, RAID_EDGE } from '@/app/(app)/sea/chart'

/**
 * How long a set holds before the deep turns over. Nine minutes: not the
 * squalls' fourteen, not the hotspots' ten, not the bottles' eleven. Systems
 * that share a beat make the whole sea blink at once, and the chart should
 * never feel like it ticks.
 */
export const LEVIATHAN_WINDOW_MS = 9 * 60_000

/**
 * How many are under the expedition sea at once.
 *
 * EIGHT, AND THE NUMBER IS ARITHMETIC RATHER THAN TASTE. The raid water is a
 * disc twenty thousand across and a viewport is about three by two, so a
 * handful of shapes spread over the whole of it is not rare, it is never: at
 * three, simulating the actual run from the sea gate out to each bay put a
 * shadow on one crossing in six. The crossings are also SHORT — half a minute
 * at speed — so there is not much time for one to wander into view.
 *
 * Eight, in the ring people actually sail (see the radius below), lands nearer
 * one crossing in two. That is the mark being aimed at: often enough that the
 * deep is populated, rare enough that it is still worth looking up for.
 */
export const LEVIATHAN_COUNT = 8

export type Leviathan = {
  key: string
  /** Where it was when the window opened. It has been swimming since. */
  x: number
  y: number
  /** World px per second, as a vector. Slow. A thing this size does not dart. */
  vx: number
  vy: number
  /** Nose to tail, in world pixels. A warship is about 210 for scale. */
  len: number
  /** Which silhouette it wears. */
  kind: 'whale' | 'serpent' | 'ray'
  /** Seconds for one rise-and-sound. Each has its own, so two in view are
   *  never breathing together. */
  period: number
  /** Where in that cycle it started, 0..1. */
  phase: number
  endsAt: number
}

function hash(a: number, b: number): number {
  let h = (a * 0x27d4eb2d) ^ (b * 0x165667b1) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}
const unit = (h: number) => (h % 100000) / 100000

/** Which window we are in. Epoch ms, and the guard is the one the squalls
 *  learned the hard way — see squallWindow. */
export function leviathanWindow(now: number = Date.now()): number {
  if (process.env.NODE_ENV !== 'production' && now < 1e12) {
    throw new Error(
      `leviathanWindow needs epoch ms, got ${now}. This is almost certainly a `
      + 'requestAnimationFrame timestamp, which is milliseconds since page load.')
  }
  return Math.floor(now / LEVIATHAN_WINDOW_MS)
}

/** The shapes under the expedition sea this window. */
export function leviathansAt(now: number = Date.now()): Leviathan[] {
  const win = leviathanWindow(now)
  const out: Leviathan[] = []
  for (let i = 0; i < LEVIATHAN_COUNT; i++) {
    const h = hash(win, i * 0x6d2b + 0x9f13)
    // Not every slot, every window. A sea with something in it every time you
    // look is an aquarium.
    if (unit(h) > 0.72) continue
    const h2 = hash(h, 0x3b7d)
    const h3 = hash(h2, 0x51a9)
    const h4 = hash(h3, 0x2e6f)
    const h5 = hash(h4, 0x74c3)

    // ── IN THE WATER PEOPLE ACTUALLY CROSS ─────────────────────────────
    //
    // NORTH HALF ONLY, and by construction rather than by rejection. A full
    // circle of headings puts half of them south of the harbour, in the
    // fishing sea, where they were then thrown away — so half the population
    // simply never existed and the count on the tin was a lie by a factor of
    // two. Sines below the axis are the northern half of the disc.
    const ang = Math.PI + unit(h2) * Math.PI
    // And the OUTER third is left empty. The far rim is the back of the
    // furthest bay and nobody crosses it; spreading these evenly over the
    // whole disc spends most of them on water no hull ever sees.
    const rad = EXP_EDGE + 1200 + unit(h3) * (RAID_EDGE * 0.62 - EXP_EDGE - 1200)
    const x = EXP_ORIGIN.x + Math.cos(ang) * rad
    const y = EXP_ORIGIN.y + Math.sin(ang) * rad

    const kindRoll = unit(h4)
    const kind: Leviathan['kind'] = kindRoll < 0.45 ? 'whale' : kindRoll < 0.78 ? 'serpent' : 'ray'
    // Four to nine warship lengths. Big enough that the first thought is not
    // "a fish" — which is the difference between this and the shoals.
    const len = 900 + unit(h5) * 1000
    const speed = 14 + unit(hash(h5, 0x1f4d)) * 20
    const dir = unit(hash(h5, 0x62b7)) * Math.PI * 2
    out.push({
      key: `L${win}:${i}`,
      x, y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      len,
      kind,
      // A long breath. Up for a few seconds out of every half minute or so, so
      // most of the time there is nothing there at all.
      period: 26 + unit(hash(h5, 0x8a11)) * 22,
      phase: unit(hash(h5, 0x33c9)),
      endsAt: (win + 1) * LEVIATHAN_WINDOW_MS,
    })
  }
  return out
}

/** Where one is now, and which way it is pointing. Penned into the raid water
 *  the way a tempest is, so nothing swims off the surveyed sea. */
export function leviathanPos(l: Leviathan, now: number = Date.now()):
{ x: number; y: number; rot: number } {
  const into = (now - (l.endsAt - LEVIATHAN_WINDOW_MS)) / 1000
  let x = l.x + l.vx * into
  let y = l.y + l.vy * into
  const keep = RAID_EDGE - l.len
  const dx = x - EXP_ORIGIN.x, dy = y - EXP_ORIGIN.y
  const r = Math.hypot(dx, dy)
  if (r > keep) {
    x = EXP_ORIGIN.x + (dx / r) * keep
    y = EXP_ORIGIN.y + (dy / r) * keep
  }
  y = Math.min(EXP_ORIGIN.y - 700, y)
  return { x, y, rot: Math.atan2(l.vy, l.vx) }
}

/**
 * HOW FAR UP IT IS, 0 gone and 1 nearly at the surface.
 *
 * A long trough and a short crest: it is down and invisible for most of the
 * cycle, comes up over several seconds, holds, and sinks again. Nothing snaps,
 * because a shadow that blinks on is a sprite and a shadow that swells is an
 * animal.
 */
export function leviathanRise(l: Leviathan, now: number = Date.now()): number {
  const t = ((now / 1000) / l.period + l.phase) % 1
  // Up between 0.26 and 0.66 of the cycle, easing at both ends: a little over
  // a third of its life at or near the surface, and the rest of it gone.
  if (t < 0.26 || t > 0.66) return 0
  const u = (t - 0.26) / 0.4
  return Math.sin(u * Math.PI) ** 0.7
}
