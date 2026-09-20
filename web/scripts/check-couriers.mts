/**
 * NOBODY SAILS THROUGH STONE, PART TWO.
 *
 * `check-traders` exists because a trader once sat inside the Trawl Docks and
 * the only way anyone found out was a captain watching a boat pass through a
 * port. A courier is worse: it crosses thousands of pixels of charted water
 * instead of swinging on an anchor, so it has far more chances to clip
 * something, and the lanes run past the bay mouths where the campaign's own
 * rocks live.
 *
 * So this asserts the same two things that one does:
 *
 *   1. No point on any lane is inside a solid, with the boat's clearance.
 *   2. The lanes did not disappear. A guard that refuses every lane would
 *      pass rule 1 perfectly and leave the north exactly as empty as it was.
 */
import { laneSamples, couriersAt } from '../lib/seaCouriers'
import { solidAt, BOAT_CLEAR } from '../lib/seaSolid'

const samples = laneSamples(600)
if (samples.length === 0) {
  console.error('check-couriers: no lanes at all')
  process.exit(1)
}

const bad: string[] = []
for (const p of samples) {
  const hit = solidAt(p.x, p.y, BOAT_CLEAR)
  if (hit) bad.push(`${p.key} at (${Math.round(p.x)},${Math.round(p.y)}) is inside ${hit.what}`)
}
if (bad.length > 0) {
  console.error(`check-couriers: ${bad.length} lane points sail through stone`)
  for (const b of bad.slice(0, 8)) console.error('  ' + b)
  process.exit(1)
}

// And that the water is actually occupied: walk a full there-and-back and
// make sure every lane puts a hull on the water at some point.
const CYCLE = 2 * (9 * 60_000 + 90_000)
const base = 1_760_000_000_000
const seen = new Set<string>()
let maxAfloat = 0
for (let m = 0; m <= CYCLE; m += 15_000) {
  const now = couriersAt(base + m)
  maxAfloat = Math.max(maxAfloat, now.length)
  for (const c of now) seen.add(c.bay)
}
const lanes = new Set(samples.map(s => s.key))
for (const lane of lanes) {
  if (!seen.has(lane)) {
    console.error(`check-couriers: lane ${lane} never puts a hull on the water`)
    process.exit(1)
  }
}

console.log(`check-couriers: ${lanes.size} lanes, ${samples.length} points, none through stone. Up to ${maxAfloat} hulls afloat at once.`)
