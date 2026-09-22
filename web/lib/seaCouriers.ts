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
import { BAYS, entryOf, fromBay, type Bay } from '@/app/(app)/sea/raidWaters'
import { HUB } from '@/app/(app)/sea/raidWaters'

/**
 * ── A LANE'S TIMING COMES FROM ITS LENGTH ───────────────────────────────────
 *
 * The first cut gave every lane the same nine-minute crossing, on the theory
 * that freight is not in a hurry. What that actually produced was freight that
 * did not move: the trunk lanes turned out to be three hundred pixels long, so
 * three hulls shuffled back and forth on top of each other at under one pixel
 * a second. Slow enough and "unhurried" becomes "broken".
 *
 * So the timing is derived. Pick the speed freight should travel at and let
 * each lane take as long as it takes, and a short bay chord and a long trunk
 * run both read as the same kind of ship doing the same kind of work.
 *
 * The player does 300px a second flat out. A fifth of that is unmistakably
 * slower than you without being still.
 */
const CRUISE_PX_S = 58
/** The ease at the ends peaks at 1.5x the average, so the average that lands
 *  CRUISE at mid-run is two thirds of it. */
const MEAN_PX_MS = (CRUISE_PX_S * (2 / 3)) / 1000
/** The pause at each end before she sets off again, so an arrival is a thing
 *  you can watch happen rather than a teleport. Short enough that a lane is
 *  not visibly empty while she sits. */
const HOLD_MS = 40_000

/** How far off the hub's centre a lane starts. The hub is a busy junction and
 *  nobody stacks a freight lane on top of the war-gate. */
const HUB_STANDOFF = 2600
/**
 * And how far short of the bay's own rim it stops.
 *
 * This used to stop short of the MOUTH, which is a different point entirely
 * and the reason the trunk lanes were 300px long: `mouthOf` is where a strait
 * LEAVES THE JUNCTION, 3800px out, while the bay itself is another three to
 * six thousand beyond that. Stopping 900px short of the mouth left a stub just
 * outside the hub and called it a shipping lane.
 *
 * The run now goes all the way down the strait to the bay's door, which is the
 * road freight would actually take. The axis is clear the whole way in every
 * bay, and check-couriers walks it to keep that true.
 */
const ENTRY_STANDOFF = 400

/**
 * ── WHICH SIDE OF THE ROAD SHE KEEPS ────────────────────────────────────────
 *
 * A lane is one line, and hulls run both ways along it, so an outbound ship
 * and an inbound ship pass THROUGH each other at the midpoint. Measured: the
 * closest two couriers ever came was zero pixels, which on screen is one hull
 * sitting inside another.
 *
 * Real traffic solves this the obvious way, by keeping to a side, and so does
 * this: outbound holds one side of the lane and inbound the other. It costs a
 * perpendicular offset and it is why couriers now pass each other rather than
 * merge. A hull is drawn 340px wide, so the two
 * lines have to be more than that apart or a pass still looks like a touch:
 * 230 puts 460px between passing keels. The straits are 440px to either side
 * of their axis, which leaves water outside both offset lines, and
 * check-couriers walks both of them rather than the centreline they are
 * measured from.
 */
const LANE_SEPARATION = 230

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
  /** Parked at a lane end between runs. Still on the water, still drawn. */
  held: boolean
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
 * A trunk lane stops at the bay's door, which leaves the bay itself empty: a
 * captain who sailed all the way in found the same dead water the couriers
 * were built to fix. So each bay also gets freight of its own, on a chord that
 * crosses its water.
 *
 * ── THESE FOUR NUMBERS ARE SEARCHED, NOT CHOSEN ─────────────────────────────
 *
 * Bay space puts `along` at 0 in the door and 1 at the back wall, and `across`
 * at 0 on the axis, as a fraction of the bay radius. A chord is where it
 * enters, where it leaves, and how far off the axis at each end.
 *
 * The first cut used a symmetric chord: enter at +k, leave at -k. That reads
 * tidily and it is wrong, because a chord that crosses the axis crosses it in
 * the middle of the bay, which is exactly where the campaign parks its rocks.
 * One Last Ride has all three of its isles within 260px of the axis, so NO
 * symmetric chord clears that bay at any offset. The Last Fathom only cleared
 * by threading a gap.
 *
 * So both ends move independently, and the endpoints below came out of a
 * search: every chord in the grid was walked down BOTH sides of the road
 * against the world's solids and the campaign's own isles, with 150px of
 * margin demanded on top of the boat's own clearance, and the longest clear
 * one won. Re-run scripts/check-couriers to confirm any change to them.
 */
type Chord = { a0: number; a1: number; k0: number; k1: number }
const IN_BAY: Record<string, Chord> = {
  // len 7967px
  thread: { a0: 0.15, a1: 0.85, k0: -0.40, k1: 0.40 },
  // len 6943px
  sunken_hand: { a0: 0.15, a1: 0.75, k0: 0.40, k1: -0.60 },
  // len 6974px
  the_coffers: { a0: 0.15, a1: 0.85, k0: 0.35, k1: -0.40 },
  // len 9373px
  the_last_fathom: { a0: 0.15, a1: 0.80, k0: 0.40, k1: -0.50 },
  // len 3216px, and the only shape that clears this bay at all
  one_last_ride: { a0: 0.25, a1: 0.60, k0: 0.60, k1: -0.65 },
}

/** Hulls on a trunk lane at once, spaced evenly through the cycle so a lane is
 *  never entirely empty and never a convoy. */
const PER_TRUNK = 3
/** And inside a bay, where there is less water to spread them over. */
const PER_BAY = 2

/** How long this lane takes end to end, at freight's cruising speed. */
function runFor(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(30_000, Math.hypot(b.x - a.x, b.y - a.y) / MEAN_PX_MS)
}

/** Built once: a trunk lane and a working lane for every bay. */
const LANES: Lane[] = (() => {
  const out: Lane[] = []
  for (const bay of BAYS) {
    const e = entryOf(bay)
    const ux = Math.cos(bay.bearing), uy = Math.sin(bay.bearing)
    const ta = { x: HUB.x + ux * HUB_STANDOFF, y: HUB.y + uy * HUB_STANDOFF }
    const tb = { x: e.x - ux * ENTRY_STANDOFF, y: e.y - uy * ENTRY_STANDOFF }
    out.push({ id: bay.id, bay, a: ta, b: tb, runMs: runFor(ta, tb), hulls: PER_TRUNK })

    const ch = IN_BAY[bay.id] ?? { a0: 0.2, a1: 0.8, k0: 0.35, k1: -0.35 }
    const D = bay.r * 2
    const ba = fromBay(bay, D * ch.a0, bay.r * ch.k0)
    const bb = fromBay(bay, D * ch.a1, bay.r * ch.k1)
    out.push({ id: `${bay.id}-in`, bay, a: ba, b: bb, runMs: runFor(ba, bb), hulls: PER_BAY })
  }
  return out
})()

/**
 * ── EVERY SLOT, WHETHER SHE IS ON THE WATER OR NOT ──────────────────────────
 *
 * The renderer needs a baked sprite per key, and that list was being built from
 * `couriersAt(0)` -- the couriers afloat at one frozen instant. Which slots are
 * afloat changes minute to minute, so five hulls on the water at any given time
 * had no sprite baked for them at all, and the chart drew them wrong.
 *
 * A slot exists whether or not its hull is currently between holds, so the
 * looks come from the LANES themselves and never change. Positions come and go;
 * identities do not.
 */
export function courierSlots(): { key: string; bay: string; tier: number }[] {
  const out: { key: string; bay: string; tier: number }[] = []
  for (const lane of LANES) {
    for (let s = 0; s < lane.hulls; s++) {
      out.push({ key: `${lane.id}-${s}`, bay: lane.bay.id, tier: courierTier(lane.bay.id) })
    }
  }
  return out
}

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
      const held = into > lane.runMs
      const dx = lane.b.x - lane.a.x, dy = lane.b.y - lane.a.y
      const len = Math.hypot(dx, dy) || 1
      const fwd = Math.atan2(outbound ? dy : -dy, outbound ? dx : -dx)
      let t: number, off: number, heading: number
      if (!held) {
        const k = into / lane.runMs
        // Ease the ends so she leans away and settles in rather than snapping
        // to full speed off a standing start.
        const eased = k * k * (3 - 2 * k)
        t = outbound ? eased : 1 - eased
        // Keep to your own side, so a head-on pass is a pass and not a merge.
        off = (outbound ? 1 : -1) * LANE_SEPARATION
        heading = fwd
      } else {
        // ── THE HOLD IS ON THE WATER ──────────────────────────────────
        //
        // A hull between runs used to be dropped from the list, and the
        // renderer hides anything not in the list, so every courier vanished
        // the moment she arrived and reappeared forty seconds later. That is
        // the "popping in and out". She stays: parked at the lane end.
        //
        // AND SHE COMES ABOUT, SLOWLY. Outbound runs one side of the road and
        // inbound the other, which meant a 460px sideways jump at each end
        // that the vanishing had been hiding. Over the hold she slews from
        // her arrival side to her departure side and her heading swings
        // round, so what you see is a ship turning at the end of her run
        // rather than one teleporting across the lane.
        const hk = Math.min(1, (into - lane.runMs) / HOLD_MS)
        const sm = hk * hk * (3 - 2 * hk)
        t = outbound ? 1 : 0
        off = (outbound ? 1 : -1) * LANE_SEPARATION * (1 - 2 * sm)
        heading = fwd + Math.PI * sm
      }
      const x = lane.a.x + dx * t + (-dy / len) * off
      const y = lane.a.y + dy * t + (dx / len) * off
      out.push({
        key: `${lane.id}-${s}`,
        bay: lane.bay.id,
        tier: courierTier(lane.bay.id),
        x, y, heading, t, held,
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
    const dx = lane.b.x - lane.a.x, dy = lane.b.y - lane.a.y
    const len = Math.hypot(dx, dy) || 1
    // BOTH SIDES OF THE ROAD. No courier ever sails the centreline: outbound
    // and inbound each hold their own offset, so checking the middle would be
    // checking water nobody is in.
    for (const off of [LANE_SEPARATION, -LANE_SEPARATION]) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        out.push({
          key: lane.id,
          bay: lane.bay.id,
          x: lane.a.x + dx * t + (-dy / len) * off,
          y: lane.a.y + dy * t + (dx / len) * off,
        })
      }
    }
  }
  return out
}
