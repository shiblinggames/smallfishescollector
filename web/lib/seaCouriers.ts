// ── THE FINNDICATE'S FREIGHT, ACTUALLY ON THE WATER ─────────────────────────
//
// The whole campaign is about cargo moving through these seas, and until now
// you never saw a cargo ship that was not a boss. The northern half of the
// chart had no wandering life in it at all: traders are refused north of the
// reef by a hard rule in seaTraders, every buried dig sits south, and the
// regulars are anchored in the fishing sea. What was up there was furniture,
// and all of it existed to be a campaign stop or a wall around one.
//
// So: couriers. Hulls running freight between the hub and the bay mouths, and
// working inside the bays themselves, visible from a long way off, going
// somewhere.
//
// ── POSITION IS A FUNCTION OF THE CLOCK, NOT A SIMULATION ───────────────────
//
// The same shape `seaWeather` uses for squalls, and for the same three
// reasons. Every captain sees the same courier in the same place at the same
// moment, because nothing is rolled per client. There is no state to store and
// nothing to sync. And a courier costs a little arithmetic on demand rather
// than an entity being ticked.
//
// A trader is NOT this: it swings a 90-280px patrol around a fixed anchor,
// which reads as a merchant waiting to be hailed and is right for one. Copying
// that northward would have given us stationary ships in empty water, which is
// decoration rather than life. These travel.
//
// ── THE LANES ARE AUTHORED, AND THAT IS THE POINT ───────────────────────────
//
// A hull crossing thousands of pixels has far more chance of clipping an
// island than one bobbing on an anchor, and `check-traders` exists because
// exactly that bug shipped once. A lane drawn by hand can be verified once and
// stays correct; see `scripts/check-couriers.mts`, which walks every courier
// over a full window and asserts none of them touches stone.
import { BAYS, mouthOf, fromBay, type Bay } from '@/app/(app)/sea/raidWaters'
import { HUB } from '@/app/(app)/sea/raidWaters'

/** How long one crossing takes, end to end. Slow: freight is not in a hurry,
 *  and a hull that crosses the screen quickly reads as a chase. */
const RUN_MS = 9 * 60_000
/** A bay run is a fraction of a trunk crossing, so a hull working inside the
 *  bay covers its shorter lane at about the same speed rather than crawling. */
const BAY_RUN_MS = 4 * 60_000
/** And the pause at each end before it sets off again, so an arrival is a
 *  thing you can watch happen rather than a teleport. */
const HOLD_MS = 90_000

/** How far off the hub's centre a lane starts. The hub is a busy junction and
 *  nobody stacks a freight lane on top of the war-gate. */
const HUB_STANDOFF = 2600
/** And how far short of the bay's mouth it stops. The strait itself is the
 *  campaign's water; couriers work the approach, not the road. */
const MOUTH_STANDOFF = 900

/**
 * ── WHOSE FREIGHT IS THIS ───────────────────────────────────────────────────
 *
 * A courier belongs to the chapter whose water it works, and it has to look
 * like it.
 *
 * The first cut fed each bay's BOSS id to `hullPaint`, which hashes an id onto
 * one of ten paints. Ten paints and five bays put Chapter I and Chapter III on
 * the identical red, which is the exact failure the idea was meant to prevent.
 * The second problem was worse: the sea's fleet renderer takes a `ShipLook`
 * and has no notion of hull paint at all (that is a filter in RaidCombat), so
 * a colour would have been dead data.
 *
 * So a courier belongs to its bay by sailing THAT BAY'S OWN CLASS of hull, and
 * it names the class by TIER rather than by an art path. The tier is what the
 * rest of the sea already keys off: it is how `shipFromFriend` finds the art
 * and the flip, and how `shipLift` works out how much of the swell that hull
 * takes. Hard-coding a path instead got both of those wrong at once. Every one
 * of these four hulls is drawn flipped, so a literal `flip: false` had every
 * courier on the chart pointing backwards.
 *
 * The classes escalate by chapter on purpose: sloop on the coast, schooner and
 * brigantine through the Gullet, galleons in the Coffers and past it. Freight
 * riding the same ladder says "deeper water, bigger cargo" with no copy at all.
 */
const BAY_TIER: Record<string, number> = {
  thread: 2,          // Sloop, Ch I, Pete's coasters
  sunken_hand: 3,     // Schooner, Ch II, Krust's and Spet's runs
  the_coffers: 4,     // Brigantine, Ch III, the market's own freight
  the_last_fathom: 5, // Galleon, Ch IV, the Don's water
  one_last_ride: 5,
}

/** The class of hull this bay's freight sails. */
export function courierTier(bay: string): number {
  return BAY_TIER[bay] ?? BAY_TIER.thread
}

export type Courier = {
  /** Stable per lane + slot, so a hull keeps its identity across frames. */
  key: string
  /** Which chapter's freight this is. */
  bay: string
  x: number
  y: number
  /** Heading in radians, for pointing the hull. */
  heading: number
  /** 0 at one end of the lane, 1 at the other. */
  t: number
  /** Outbound is loaded and low in the water; inbound is riding high. */
  laden: boolean
  /** The ship tier whose hull she sails. See courierTier. */
  tier: number
}

type Lane = {
  id: string
  bay: Bay
  a: { x: number; y: number }
  b: { x: number; y: number }
  runMs: number
  /** How many hulls work this lane at once. */
  hulls: number
}

/**
 * ── THE IN-BAY LANES ────────────────────────────────────────────────────────
 *
 * The trunk lanes stop 900px short of each mouth, which left every bay itself
 * empty: a captain who sailed all the way in found the same dead water the
 * couriers were built to fix. So each bay also gets freight of its own, on a
 * chord that runs from near the door across to the far side.
 *
 * `k` is how far off the bay's axis that chord sits, as a fraction of the bay
 * radius, and it is NOT a taste number. It was probed: every candidate chord
 * was walked against both the world's solids and the campaign's own rocks, and
 * these are the offsets that came back clear. The Last Fathom needs a wider one
 * than the rest because Crooked Light is parked where the others' lane runs.
 *
 * Bay space puts `along` at 0 in the door and `2r` at the back wall, so the
 * chord below enters a quarter of the way in and stops short of the back.
 */
const IN_BAY_K: Record<string, number> = {
  thread: 0.35,
  sunken_hand: 0.35,
  the_coffers: 0.35,
  the_last_fathom: 0.45, // Crooked Light sits on the 0.35 line
  one_last_ride: 0.35,
}

/** Hulls on a trunk lane at once, spaced evenly through the cycle so a lane is
 *  never entirely empty and never a convoy. */
const PER_TRUNK = 3
/** And inside a bay, where there is less water to spread them over. */
const PER_BAY = 2

/** Built once: a trunk lane and a working lane for every bay. */
const LANES: Lane[] = (() => {
  const out: Lane[] = []
  for (const bay of BAYS) {
    const m = mouthOf(bay)
    const dx = m.x - HUB.x, dy = m.y - HUB.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    out.push({
      id: bay.id,
      bay,
      a: { x: HUB.x + ux * HUB_STANDOFF, y: HUB.y + uy * HUB_STANDOFF },
      b: { x: m.x - ux * MOUTH_STANDOFF, y: m.y - uy * MOUTH_STANDOFF },
      runMs: RUN_MS,
      hulls: PER_TRUNK,
    })
    const k = IN_BAY_K[bay.id] ?? 0.35
    const D = bay.r * 2
    out.push({
      id: `${bay.id}-in`,
      bay,
      a: fromBay(bay, D * 0.25, bay.r * k),
      b: fromBay(bay, D * 0.80, -bay.r * k),
      runMs: BAY_RUN_MS,
      hulls: PER_BAY,
    })
  }
  return out
})()

/**
 * Every courier on the water right now. Derived: hand it the clock and it
 * hands back positions, with no reference to who is asking.
 */
export function couriersAt(now: number = Date.now()): Courier[] {
  const out: Courier[] = []
  for (let li = 0; li < LANES.length; li++) {
    const lane = LANES[li]
    const cycle = lane.runMs + HOLD_MS
    for (let s = 0; s < lane.hulls; s++) {
      // Each slot is offset through the cycle, and each lane is offset again
      // so the whole chart does not sail in lockstep.
      const offset = (s / lane.hulls + li * 0.37) * cycle
      const phase = ((now + offset) % (cycle * 2) + cycle * 2) % (cycle * 2)
      // A full there-and-back is two cycles: out, hold, back, hold.
      const outbound = phase < cycle
      const into = outbound ? phase : phase - cycle
      if (into > lane.runMs) continue      // holding at one end, not on the water
      const k = into / lane.runMs
      // Ease the ends so she leans away and settles in rather than snapping
      // to full speed off a standing start.
      const eased = k * k * (3 - 2 * k)
      const t = outbound ? eased : 1 - eased
      const x = lane.a.x + (lane.b.x - lane.a.x) * t
      const y = lane.a.y + (lane.b.y - lane.a.y) * t
      const dx = lane.b.x - lane.a.x, dy = lane.b.y - lane.a.y
      const heading = Math.atan2(outbound ? dy : -dy, outbound ? dx : -dx)
      out.push({
        key: `${lane.id}-${s}`,
        bay: lane.bay.id,
        tier: courierTier(lane.bay.id),
        x, y, heading, t,
        // Outbound from the hub is the empty run; the freight comes BACK.
        // Everything the Finndicate takes is moving toward the middle.
        laden: !outbound,
      })
    }
  }
  return out
}

/** The couriers worth drawing for a camera at (x, y) with this half-extent. */
export function couriersAround(x: number, y: number, halfW: number, halfH: number, now: number = Date.now()): Courier[] {
  const pad = 700
  return couriersAt(now).filter(c =>
    Math.abs(c.x - x) < halfW + pad && Math.abs(c.y - y) < halfH + pad)
}

/** Every point a courier ever occupies on a lane, for the build check. */
export function laneSamples(steps = 400): { key: string; bay: string; x: number; y: number }[] {
  const out: { key: string; bay: string; x: number; y: number }[] = []
  for (const lane of LANES) {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      out.push({
        key: lane.id,
        bay: lane.bay.id,
        x: lane.a.x + (lane.b.x - lane.a.x) * t,
        y: lane.a.y + (lane.b.y - lane.a.y) * t,
      })
    }
  }
  return out
}
