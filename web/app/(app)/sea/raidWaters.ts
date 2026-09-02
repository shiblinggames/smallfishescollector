// ── THE CAMPAIGN'S WATER ────────────────────────────────────────────────────
//
// Five basins north of the sortie, one per chapter, each walled in rock with a
// strait at either end. Sail into the first, fight your way to its boss, and the
// strait north opens.
//
// ── WHY NOT RINGS LIKE THE FISHING GROUNDS ──────────────────────────────────
//
// The first draft of this mirrored the fishing bands: concentric rings out from
// one origin, deeper the further you go. It was wrong, and the reason is worth
// keeping because it is a rule about shape rather than about this feature.
//
// Concentric rings from one origin SAY "pick any heading and go as far as you
// dare". They are direction-agnostic by construction — that is precisely why
// they are right for fishing, where the whole offer is that the sea is open and
// you choose how far out to work. Wrapping a LINEAR campaign in that shape says
// the opposite of what the campaign is, and it would have given every chapter a
// vast arc of empty water with one boss somewhere in it.
//
// A basin says something else: this is a place, it has edges, and there is one
// way on. That is linear at the scale of the campaign and open at the scale of
// an afternoon, which is the combination the design actually wants.
//
// ── THE ANCHORAGE IS THE SAME OBJECT ────────────────────────────────────────
//
// None of this is a new idiom. chart.ts on the anchorage rim: "IT IS WALLED, all
// the way round... That is what makes it a harbour rather than a disc: the
// boundary was an invisible line you slid along, and now it is a shore with one
// gap in it, exactly like the reef that let you in."
//
// So a basin is an anchorage with two gaps instead of one, in the same rock, on
// the same rules, and the player already knows how to read it: they have sailed
// through the arch and out of the sortie to get here.
//
// ── PLACED, NOT DERIVED ─────────────────────────────────────────────────────
//
// The table below is hand-authored. A formula would produce five identical
// circles evenly spaced, which is the sameness the rings were rejected for — and
// the chapters are not the same as each other. The route bends west and back so
// no two straits line up, and the radii differ so a basin can be a channel or an
// open field depending on what is fought in it.
//
// Consecutive basins are placed so their rims OVERLAP BY ABOUT 200px. That
// overlap is the strait: the gap in both walls falls where the two shores meet,
// so a strait is a real place on the chart rather than a corridor drawn between
// two distant circles.
//
// 200 AND NOT "WHATEVER FALLS OUT". The first pass landed on overlaps of 17 to
// 119, and 17 is a knife-edge — moving that basin 900px in tuning separated the
// two rims entirely and left a strait spanning open water. The check catches it,
// but a table where ordinary tuning breaks the chain is a table nobody can tune.
// Every pair now has room to be nudged a few hundred pixels in any direction
// before anything has to be reconsidered.

import { SORTIE } from './chart'
import { RAID_CHAPTERS } from '@/lib/raidMap'

export type Basin = {
  /** Matches a RAID_CHAPTERS id, so the campaign and the water cannot drift. */
  id: string
  chapter: number
  name: string
  /** Centre and wall radius, world px. */
  x: number
  y: number
  r: number
  /**
   * How wide the strait OUT of this basin is, measured along the rim.
   *
   * Per basin rather than one constant, because a mouth reads differently
   * depending on how fast you meet it: the sortie is 620 because you arrive at
   * it head-on at speed, the reef arch is 430 because you line up for it.
   */
  gateHalf: number
  /** The sea's colour here. Three stops, deep to pale, like every water. */
  sea: [string, string, string]
}

/**
 * NORTH, AND BENDING.
 *
 * A straight line of basins would put every strait on one bearing and turn the
 * campaign into a corridor you hold W through. The route swings east, back west
 * past the middle, and straightens for the coda — so each strait has to be
 * found, and the shape of the run is something you learn rather than something
 * you hold a key for.
 *
 * The colours darken northward and drift from the anchorage's grey-green toward
 * the near-black of deep water, which is the one thing the fishing rings had
 * exactly right: the sea should tell you how far in you are without a label.
 */
export const BASINS: Basin[] = [
  {
    id: 'thread', chapter: 1, name: 'The Loose Thread',
    // Just past the sortie: its southern rim sits 400px north of the mouth, so
    // the first crossing is a short run rather than an errand.
    x: 0, y: -8900, r: 1900, gateHalf: 520,
    sea: ['#12242c', '#26454e', '#5c7f84'],
  },
  {
    id: 'sunken_hand', chapter: 2, name: 'A Bigger Fish',
    // East, and tighter. The Gullet is fought in here and a cramped basin is
    // the right room for it.
    x: 2000, y: -11770, r: 1800, gateHalf: 470,
    sea: ['#0f1f2a', '#20404e', '#4e7480'],
  },
  {
    id: 'the_coffers', chapter: 3, name: 'The Coffers',
    // Back to the centre line and wider: a fleet action wants open water.
    x: 0, y: -14640, r: 1900, gateHalf: 500,
    sea: ['#0c1a26', '#1b3648', '#456b7c'],
  },
  {
    id: 'the_last_fathom', chapter: 4, name: 'The Last Fathom',
    // West, and dark. The deepest water there is, per the chapter's own line.
    x: -2200, y: -17360, r: 1800, gateHalf: 460,
    sea: ['#08131d', '#152b3c', '#385a6e'],
  },
  {
    id: 'one_last_ride', chapter: 5, name: 'One Last Ride',
    // Dead centre and smallest. A coda is not a chapter: there is one thing in
    // here and nowhere to wander to, which is the point of it.
    x: 0, y: -19820, r: 1700, gateHalf: 440,
    sea: ['#050d16', '#101f2e', '#2c4a5e'],
  },
]

export const BASIN_BY_ID: Record<string, Basin> =
  Object.fromEntries(BASINS.map(b => [b.id, b]))

/**
 * HOW FAR THE CAMPAIGN'S WATER REACHES, derived rather than declared.
 *
 * `RAID_EDGE` used to be a number picked in advance, and at 13,000 it was too
 * small to hold this — five basins and their straits do not fit in 9,400px of
 * water when the anchorage alone is 3,600 across. Deriving it from the table
 * means the sail limit can never be smaller than the world it is supposed to
 * contain, which is the failure a hand-set constant invites every time the last
 * basin moves.
 *
 * Measured from EXP_ORIGIN, because that is the centre the sail radius is
 * measured from once you are past the sortie.
 */
export function raidReach(originY: number): number {
  return Math.max(...BASINS.map(b =>
    Math.hypot(b.x, b.y - originY) + b.r)) + 900
}

/** Is this point inside a basin's wall? */
export function inBasin(x: number, y: number, b: Basin): boolean {
  return Math.hypot(x - b.x, y - b.y) < b.r
}

/** Which basin is this point in, if any. */
export function basinAt(x: number, y: number): Basin | null {
  return BASINS.find(b => inBasin(x, y, b)) ?? null
}

/**
 * THE STRAIT BETWEEN TWO BASINS, as a point and a bearing.
 *
 * Not stored. Two circles that touch meet in exactly one place, and that place
 * is where the gap in both walls belongs — so it is computed from the pair. A
 * hand-written coordinate here would be a third copy of a fact the two centres
 * already state, and the one most likely to be left behind when a basin moves.
 *
 * Returns null for the last basin, which has no strait out.
 */
export function straitAfter(b: Basin): { x: number; y: number; bearing: number } | null {
  const i = BASINS.indexOf(b)
  const next = BASINS[i + 1]
  if (!next) return null
  const dx = next.x - b.x, dy = next.y - b.y
  const d = Math.hypot(dx, dy) || 1
  const bearing = Math.atan2(dy, dx)
  // Midway along the overlap, so the gap is centred on the shared water rather
  // than on either wall.
  const at = (d + b.r - next.r) / 2
  return { x: b.x + (dx / d) * at, y: b.y + (dy / d) * at, bearing }
}

/** The strait INTO a basin — the previous basin's strait out. The first basin's
 *  way in is the sortie itself, which chart.ts already owns. */
export function straitBefore(b: Basin): { x: number; y: number; bearing: number } | null {
  const i = BASINS.indexOf(b)
  return i <= 0 ? null : straitAfter(BASINS[i - 1])
}

/**
 * WHAT OPENS THE WAY NORTH.
 *
 * The strait out of a basin is shut until that chapter is cleared, and "cleared"
 * is the chapter's own `lastNodeId` — the same fact `/expeditions` reads. Two
 * surfaces, one source, so a captain who finished a chapter on the node map
 * finds the water already open when they sail out to it.
 */
export function opensStrait(b: Basin): string | null {
  return RAID_CHAPTERS.find(c => c.id === b.id)?.lastNodeId ?? null
}

/** The first basin's mouth is the sortie. Kept as a function so the caller does
 *  not have to know that, and so it can move. */
export function basinEntry(): { x: number; y: number } {
  return { x: SORTIE.x, y: SORTIE.y }
}
