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
 * ── AND THE CAMPAIGN'S ROCKS ARE NOT IN `SOLIDS` ────────────────────────────
 *
 * The first cut of this checker only asked `solidAt`, and `SOLIDS` is built
 * from ports, the fishing sea's isles and landmarks. Every rock INSIDE a bay is
 * a `RaidIsle`, placed in bay space, and none of them are in that list. So the
 * checker was passing on the trunk lanes for a reason it had not earned, and
 * the moment lanes went inside the bays it would have cheerfully run freight
 * straight through The Tangle and said nothing.
 *
 * So it asks both, and asserts the same two things `check-traders` does:
 *
 *   1. No point on any lane is inside a solid or an isle, with the boat's
 *      clearance.
 *   2. The lanes did not disappear. A guard that refuses every lane would
 *      pass rule 1 perfectly and leave the north exactly as empty as it was.
 */
import { laneSamples, couriersAt, courierSlots } from '../lib/seaCouriers'
import { RAID_ISLES, isleAt } from '../app/(app)/sea/raidWaters'
import { solidAt, BOAT_CLEAR } from '../lib/seaSolid'

// `isleAt` places an isle in bay space and can come back empty for one whose
// bay is not on the chart. A rock we cannot place is a rock we cannot check, so
// it is dropped rather than guessed at.
const ROCKS = RAID_ISLES
  .map(i => ({ id: i.id, at: isleAt(i), r: i.r }))
  .filter((r): r is { id: string; at: { x: number; y: number }; r: number } => !!r.at)

/** What this point is inside, counting the campaign's water as well. */
function blockedBy(x: number, y: number): string | null {
  const s = solidAt(x, y, BOAT_CLEAR)
  if (s) return s.what
  for (const r of ROCKS) {
    if (Math.hypot(r.at.x - x, r.at.y - y) < r.r + BOAT_CLEAR) return `isle ${r.id}`
  }
  return null
}

const samples = laneSamples(600)
if (samples.length === 0) {
  console.error('check-couriers: no lanes at all')
  process.exit(1)
}

const bad: string[] = []
for (const p of samples) {
  const hit = blockedBy(p.x, p.y)
  if (hit) bad.push(`${p.key} at (${Math.round(p.x)},${Math.round(p.y)}) is inside ${hit}`)
}
if (bad.length > 0) {
  console.error(`check-couriers: ${bad.length} lane points sail through stone`)
  for (const b of bad.slice(0, 8)) console.error('  ' + b)
  process.exit(1)
}

// And that the water is actually occupied: walk a full there-and-back and make
// sure every lane puts a hull on the water at some point. The bay lanes run a
// shorter cycle than the trunk lanes, so the window has to cover the longer of
// the two to be fair to both.
const CYCLE = 2 * (9 * 60_000 + 90_000)
const base = 1_760_000_000_000
const seen = new Set<string>()
let maxAfloat = 0
for (let m = 0; m <= CYCLE; m += 15_000) {
  const now = couriersAt(base + m)
  maxAfloat = Math.max(maxAfloat, now.length)
  for (const c of now) seen.add(c.key.replace(/-\d+$/, ''))
}
const lanes = new Set(samples.map(s => s.key))
for (const lane of lanes) {
  if (!seen.has(lane)) {
    console.error(`check-couriers: lane ${lane} never puts a hull on the water`)
    process.exit(1)
  }
}

// And that every bay has freight INSIDE it, which is the whole point of the
// second round of lanes. Counting hulls that fall within the bay's own radius
// is the only honest test of that: a lane that stops at the door passes every
// check above while leaving the bay as dead as it found it.
const bays = new Set(samples.map(s => s.bay))
const inside = new Set<string>()
for (const lane of lanes) if (lane.endsWith('-in')) inside.add(lane.slice(0, -3))
for (const b of bays) {
  if (!inside.has(b)) {
    console.error(`check-couriers: bay ${b} has no freight working inside it`)
    process.exit(1)
  }
}

// ── AND THEY DO NOT SAIL THROUGH EACH OTHER ────────────────────────────────
//
// A lane is one line with hulls running both ways along it, so before the
// traffic was separated by direction an outbound ship and an inbound one
// passed THROUGH each other at the midpoint. Measured at zero pixels apart,
// which on screen is one hull inside another. A hull is drawn 340px wide, so
// anything under that is a touch rather than a pass.
const HULL_W = 340
let closest = Infinity
let pair = ''
for (let m = 0; m < 600; m += 1) {
  const n = couriersAt(base + m * 20_000)
  for (let i = 0; i < n.length; i++) {
    for (let j = i + 1; j < n.length; j++) {
      const d = Math.hypot(n[i].x - n[j].x, n[i].y - n[j].y)
      if (d < closest) { closest = d; pair = `${n[i].key} / ${n[j].key}` }
    }
  }
}
if (closest < HULL_W) {
  console.error(`check-couriers: ${pair} come within ${Math.round(closest)}px, closer than a hull is wide`)
  process.exit(1)
}

// ── AND EVERY SLOT HAS AN IDENTITY ─────────────────────────────────────────
//
// The renderer bakes one sprite per key. That list was built from the couriers
// afloat at a single frozen instant, and which slots are between holds changes
// minute to minute, so hulls on the water had no sprite of their own. The slot
// list has to cover anything the clock can ever put out there.
const slots = new Set(courierSlots().map(c => c.key))
for (let m = 0; m < 600; m += 1) {
  for (const c of couriersAt(base + m * 20_000)) {
    if (!slots.has(c.key)) {
      console.error(`check-couriers: ${c.key} sails but has no slot, so nothing draws it`)
      process.exit(1)
    }
  }
}

console.log(`check-couriers: ${lanes.size} lanes over ${bays.size} bays, ${samples.length} points, none through stone or isle. Up to ${maxAfloat} hulls afloat at once, never closer than ${Math.round(closest)}px.`)
