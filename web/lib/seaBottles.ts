// WHAT THE SEA SENDS YOU.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and every one of these is pure. Derived identically on the client (to
// draw a bottle) and on the server (to check you were actually next to one), so
// there is nothing to send over the wire and nothing to forge about WHERE a
// bottle is.
//
// ── WHY BOTTLES EXIST ───────────────────────────────────────────────────────
//
// The isles are finite. Twenty seven, one payout each, and after a fortnight
// the sea has nothing left to say. Traders and hotspots refresh but they are
// utility, not discovery — you do not sail across a band hoping for a trader.
//
// A bottle is the renewable half. There is always one somewhere, the fragment
// inside is always something you have not read, and finding one costs nothing
// but noticing it. It is the sea being ALIVE rather than being a checklist.
//
// ── WHAT IS IN THEM, AND WHY NO COIN ────────────────────────────────────────
//
// Bottles carry words. Never doubloons, never gems, not even a small purse —
// and that is the load-bearing decision in this whole file. Something infinite
// that pays out is something you farm, and the moment a bottle is worth money
// the correct way to play is to sail in circles harvesting them, which is the
// opposite of the exploring this is meant to reward.
//
// So the value in a bottle is a BEARING: the location of a buried dig site,
// which pays properly and pays once. The bottle is the map, not the treasure.
// That makes an infinite supply harmless — the total coin on the chart is
// fixed by lib/seaDigs, however many bottles you open.
//
// ── HOW THEY SPAWN ──────────────────────────────────────────────────────────
//
// The same cell hash the traders use. The sea is cut into cells; a cell either
// has a bottle in this window or it does not, decided by hashing the cell and
// the window together. No spawn table, no server round trip to ask what is
// nearby, and two captains in the same water at the same moment see the same
// bottle — which matters, because otherwise "there is a bottle over there" is
// not a thing anyone could ever say to anyone else.

import { PLACES } from '@/app/(app)/sea/chart'

/**
 * Cell size for the bottle grid, in world pixels.
 *
 * Bigger than the traders' 1,500. A bottle is a small thing to spot and the
 * point is that they turn up as you travel, not that you sail through a field
 * of them: at 2,600 with the rate below, a crossing of the Deep passes maybe
 * one or two.
 */
export const BOTTLE_CELL = 2600

/**
 * What share of cells hold a bottle in a given window.
 *
 * 0.18 is deliberately low. The feeling being aimed at is "oh, there's one" —
 * which needs them to be uncommon enough that spotting one registers. Raise
 * this and the sea turns into litter.
 */
const BOTTLE_RATE = 0.18

/**
 * How long a set of bottles lasts before the tide brings different ones.
 *
 * Eleven minutes, which is deliberately not the hotspots' ten: two systems that
 * refresh on the same beat make the whole sea blink at once, and the chart
 * should never feel like it ticks.
 */
export const BOTTLE_WINDOW_MS = 11 * 60_000

/** How close you must be to fish one out. A bottle is an arm's reach thing. */
export const BOTTLE_REACH = 300

export type Bottle = {
  /** Cell and window, so the server can re-derive exactly this bottle. */
  key: string
  /** Where it sits at rest. It drifts around this — see `bottlePos`. */
  x: number
  y: number
  /** Drives the drift so no two bob in step. */
  seed: number
}

const OUTER = Math.max(...PLACES.map(p => p.outer ?? 0))
const INNER = Math.min(...PLACES.filter(p => p.inner !== undefined).map(p => p.inner!))

/** xorshift on a 32-bit seed. Same generator the rest of the chart uses. */
function hash(a: number, b: number): number {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca6b)
  h >>>= 0
  h ^= h << 13; h >>>= 0
  h ^= h >>> 17
  h ^= h << 5; h >>>= 0
  return h
}

/** Which window we are in. Exported so the map can refresh on the boundary. */
export function bottleWindow(now: number = Date.now()): number {
  return Math.floor(now / BOTTLE_WINDOW_MS)
}

/**
 * The bottle in a cell this window, or null.
 *
 * Only in FISHABLE water: bottles wash about in the bands, not in the harbour
 * approaches north of the coast and not past the edge of the surveyed chart.
 * A bottle you cannot legally sail to is a bottle that does not exist.
 */
export function bottleAt(cx: number, cy: number, win: number): Bottle | null {
  const h = hash(cx * 73856093 ^ cy * 19349663, win + 0x5bd1)
  if ((h % 1000) / 1000 >= BOTTLE_RATE) return null

  const h2 = hash(h, 0x2f1b)
  const x = cx * BOTTLE_CELL + ((h2 % 1000) / 1000) * BOTTLE_CELL
  const h3 = hash(h2, 0x77a3)
  const y = cy * BOTTLE_CELL + ((h3 % 1000) / 1000) * BOTTLE_CELL

  if (y < 400) return null                       // not in the harbour approaches
  const r = Math.hypot(x, y)
  if (r < INNER + 200 || r > OUTER - 200) return null   // inside the fishable rings

  return { key: `${cx}:${cy}:${win}`, x, y, seed: h3 }
}

/**
 * Where a bottle actually is at this instant.
 *
 * It drifts. A floating thing that holds a fixed coordinate reads as a pin
 * stuck in the water, and this one is supposed to have arrived from somewhere.
 * Two slow circles at different periods so the path never repeats visibly, at a
 * few pixels a second — enough to notice if you watch it, never enough to swim
 * away from you while you turn.
 */
export function bottlePos(b: Bottle, nowSec: number): { x: number; y: number } {
  const p = (b.seed % 1000) / 1000 * Math.PI * 2
  return {
    x: b.x + Math.sin(nowSec * 0.09 + p) * 46 + Math.sin(nowSec * 0.031 + p * 2) * 26,
    y: b.y + Math.cos(nowSec * 0.07 + p) * 30 + Math.cos(nowSec * 0.024 + p * 3) * 18,
  }
}

/** Every bottle whose cell is near a point. Cheap: nine cells at most. */
export function bottlesAround(x: number, y: number, radius: number, now: number = Date.now()): Bottle[] {
  const win = bottleWindow(now)
  const out: Bottle[] = []
  const c0 = Math.floor((x - radius) / BOTTLE_CELL), c1 = Math.floor((x + radius) / BOTTLE_CELL)
  const r0 = Math.floor((y - radius) / BOTTLE_CELL), r1 = Math.floor((y + radius) / BOTTLE_CELL)
  for (let cx = c0; cx <= c1; cx++) {
    for (let cy = r0; cy <= r1; cy++) {
      const b = bottleAt(cx, cy, win)
      if (b) out.push(b)
    }
  }
  return out
}

/** Re-derive one bottle from its key, for the server. Null if it never existed. */
export function bottleFromKey(key: string, now: number = Date.now()): Bottle | null {
  const [cxs, cys, wins] = key.split(':')
  const cx = Number(cxs), cy = Number(cys), win = Number(wins)
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(win)) return null
  // Only this window or the one just gone. A key from an hour ago is either a
  // stale tab or somebody replaying, and neither should land a bearing.
  const nowWin = bottleWindow(now)
  if (win !== nowWin && win !== nowWin - 1) return null
  return bottleAt(cx, cy, win)
}

/**
 * WHAT THE PAPER SAYS when there is no bearing to give.
 *
 * Either because every dig site is already yours, or because this one simply
 * came up empty — most bottles do, and that is what makes a bearing land.
 *
 * These are the crews who did not make it, same register as the far-water isle
 * notes: no mechanics, no campaign, nothing that knows anything about the
 * Sunken Hand. Written so any of them can be the first one somebody reads.
 */
export const FRAGMENTS: string[] = [
  'Third week without sight of land. The bosun has started naming the waves. We let him, because the alternative is silence.',
  'To whoever finds this: the water east of here is colder than it has any business being, and the fish know it before you do.',
  'We are out of salt, out of rope and nearly out of argument. Turning for home at first light, which the mate says was also true yesterday.',
  'Caught something last night that we put straight back. Nobody has said what it was and nobody is going to.',
  'The captain has been sounding the same patch for six days. She will not say what she is listening for.',
  'If you are reading this we did not make it back, and I would rather you had the paper than the sea did.',
  'Ran the whole night on a wind that came from nowhere and went nowhere. Made forty leagues and could not tell you which way.',
  'The lamp went out at the worst hour and we sat in the dark and were, for a while, extremely honest with one another.',
  'Note for the next crew: she pulls to port under full sail and there is no fixing it, only knowing it.',
  'We buried a friend at the deep edge today. The water there does not take things down so much as accept them.',
  'Nine days of flat calm. I have read this ship’s entire library, which is one book, four times.',
  'Saw a light out past the last band and put about hard. Some things you leave for a braver season.',
  'The cook swears the current runs backwards past the shelf. He is right, and none of us will admit it to his face.',
  'Half the hold is water and the other half is fish, and at this point I could not tell you which is winning.',
  'Whoever left the last bottle: we found it, we read it, and it helped. Passing the favour on.',
  'Made port with nothing to show and every one of us still aboard. Some voyages you count that as the catch.',
]

/** Pick a fragment for a bottle. Stable per bottle, so re-reading is the same. */
export function fragmentFor(b: Bottle): string {
  return FRAGMENTS[b.seed % FRAGMENTS.length]
}

/**
 * WHETHER THIS BOTTLE CARRIES A BEARING.
 *
 * About a third. Low enough that finding one is an event, high enough that
 * somebody working a band steadily will get there. The server has the last word
 * — it will not hand out a bearing for a site you already hold or have dug, and
 * once they are all yours every bottle is a fragment.
 */
export function carriesBearing(b: Bottle): boolean {
  return hash(b.seed, 0x9c11) % 100 < 34
}
