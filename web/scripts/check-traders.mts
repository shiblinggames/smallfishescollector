/**
 * NOBODY SAILS THROUGH STONE.
 *
 * Trader positions are derived — hash a cell and a day, take a point, give it a
 * slow patrol — so nobody will ever open a file and see a bad one. What happens
 * instead is that somebody adds an island, and from that day on a trader is
 * moored inside it, and the only way anyone finds out is a captain watching a
 * boat sail through a port. Which is exactly how this one was found: through
 * the Trawl Docks.
 *
 * The placement guards that existed were all about the EDGES of the world — the
 * outer ring, the reef, the Mainland's doorstep. Nothing tested the things
 * standing in the middle of it.
 *
 * So this asserts two things:
 *
 *   1. No trader's PATROL — not just its anchor — ever enters a solid. The
 *      anchor clearing a rock is worthless if the swing carries the hull back
 *      into it, and that is the failure that was actually reported.
 *   2. The guard did not empty the sea. A clearance test that refuses every
 *      cell would pass rule 1 perfectly and leave nobody to trade with.
 */
import { tradersAround, CELL, type Trader } from '../lib/seaTraders'
import { OUTER_EDGE, RESIDENTS } from '../app/(app)/sea/chart'
import { solidAt, BOAT_CLEAR, SOLIDS } from '../lib/seaSolid'

/** How many points around each patrol to test. The patrol is an ellipse, so a
 *  handful of samples can step straight over a small rock. */
const ARC_SAMPLES = 180

/** Sampled across days AND across the clock, because the blockade runners only
 *  exist at night and are generated on their own path — the one that missed
 *  every guard the day traders had. */
const DAYS = 6
const CLOCK_STEP_MIN = 4
const CLOCK_SPAN_MIN = 200

const seen = new Map<string, Trader>()
const base = 1_760_000_000_000

for (let d = 0; d < DAYS; d++) {
  for (let m = 0; m < CLOCK_SPAN_MIN; m += CLOCK_STEP_MIN) {
    for (const t of tradersAround(0, 0, OUTER_EDGE, d, base + m * 60_000)) {
      seen.set(t.key, t)
    }
  }
}

let worst = Infinity
let worstWhat = ''
const bad: string[] = []

const check = (t: Trader, label: string) => {
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const a = (i / ARC_SAMPLES) * Math.PI * 2
    const px = t.x + Math.cos(a) * t.driftR
    const py = t.y + Math.sin(a) * t.driftR * 0.6
    const hit = solidAt(px, py, BOAT_CLEAR)
    if (hit) { bad.push(`${label} patrols into ${hit.what}`); return }
    // How close the whole population ever gets, for the report.
    for (const s of SOLIDS) {
      const gap = Math.hypot(s.x - px, s.y - py) - s.r
      if (gap < worst) { worst = gap; worstWhat = s.what }
    }
  }
}

for (const t of seen.values()) check(t, `trader ${t.key}`)
for (const r of RESIDENTS) {
  const hit = solidAt(r.x, r.y, 0)
  if (hit) bad.push(`resident buyer at ${r.x},${r.y} stands in ${hit.what}`)
}

const uniq = [...new Set(bad)]
if (uniq.length) {
  console.error(`check-traders: ${uniq.length} boat(s) sailing through solid ground.\n`)
  for (const b of uniq.slice(0, 20)) console.error('  ' + b)
  process.exit(1)
}

// RULE 2. A clearance test that refuses everything passes rule 1 perfectly.
if (seen.size < 200) {
  console.error(`check-traders: only ${seen.size} traders across ${DAYS} days — the guard has emptied the sea.`)
  process.exit(1)
}

console.log(`check-traders: ${seen.size} traders over ${DAYS} days, none sailing through ${SOLIDS.length} solid things.`)
console.log(`  Cell ${CELL}px · closest any hull comes to shore ${Math.round(worst)}px (${worstWhat})`)
