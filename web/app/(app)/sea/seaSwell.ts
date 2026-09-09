// ── THE SWELL EVERYTHING FLOATING READS ─────────────────────────────────────
//
// Every hull bobbed on sin(t * 1.7) * 3.4 + sin(t * 2.6 + 1.1) * 2.1 — a
// free-running function of TIME ALONE, with a random phase per boat. So two
// boats side by side heaved in opposite directions, and the canvas NPCs did not
// bob at all: the player heaved and everyone else sat perfectly still. This is
// the field they read instead. A hull's height is a fact about WHERE IT IS, so
// a crest travels through a group of them.
//
// ── IT DOES NOT DRAW ANYTHING, AND THAT IS THE SECOND VERSION OF THIS FILE ──
//
// The first one also fed the water shader, on the reasoning that a boat ought
// to ride a wave you can SEE. The reasoning is right; the execution was not. A
// sum of pure sine trains is, mathematically, a striped pattern — three of them
// at three bearings is a plaid. It shipped and it drew exactly that: full
// screen zebra stripes over the whole sea, worse than the flatness it was meant
// to fix. Spreading the bearings, breaking the phases and narrowing the
// specular each only rearranged the stripes, because the periodicity was never
// in the tuning, it was in the choice of function.
//
// The shader already draws waves out of ridged and value noise, and noise has
// no periodicity to give itself away. That is the whole difference. If the
// drawn sea is ever to agree with what the boats are doing, this field has to
// be WARPED BY NOISE first so its crests meander and terminate — a phase-locked
// sine has infinite straight crests by definition and no amount of lighting
// hides it.
//
// So the shader went back to what it was, and this drives things that FLOAT.
// The hull motion was the uncontroversial half: boats near each other rise
// together, which is what a sea does and what a per-boat clock never can.
//
// ── AND SINES ARE STILL RIGHT FOR THIS JOB ──────────────────────────────────
//
// Transliterating the shader's own noise so the CPU could sample the exact
// drawn field does not work either. It is built on
// fract(sin(dot(p, k)) * 43758.5453123), a hash whose whole output lives in the
// bits a float32 multiply throws away. The GPU computes it at 32 bits with a
// hardware sine and JavaScript at 64 with a different one; they do not round
// differently, they disagree completely. For a height under a boat, where
// nothing is drawn and only the agreement between neighbours matters, summed
// trains are exactly right.

/** The prevailing wind, as seaWater and seaGrass have it. */
export const WIND_X = 0.8231
export const WIND_Y = 0.5679

/**
 * A train: how long the wave is in world pixels, how high it lifts a hull, how
 * fast it travels in lengths per second, how far its bearing is turned off the
 * prevailing wind in radians, and where it sits in its cycle at the origin.
 *
 * `amp` is in the same units the old bob was — screen pixels before the zoom —
 * so nothing downstream had to be rescaled.
 *
 * THE PHASES MATTER even with nothing drawn. Without them every train crosses
 * zero at the same point, which puts a stationary node in the sea at the world
 * origin and gives the whole field a centre. These are arbitrary and
 * deliberately unrelated to each other.
 */
export type SwellWave = {
  len: number
  amp: number
  speed: number
  skew: number
  phase: number
}

/**
 * ── NOTHING SHORTER THAN THE BOAT ───────────────────────────────────────────
 *
 * There were five trains and the shortest two were 205 and 112 world pixels.
 * They were chosen when this field still fed the shader, where the job was to
 * fit six to ten crests on a screen. Nothing draws it now, and against a HULL
 * they were doing real harm.
 *
 * Two reasons, and the second is the one that was reported.
 *
 * A hull does not feel a wave shorter than itself. It bridges it: bow on one
 * crest, stern on the next, and the boat barely moves. A skiff here is about a
 * hundred and fifty pixels long, so a 112px train is a wave it should ignore
 * completely and a 205px one is a wave it should barely notice.
 *
 * And a hull's motion is at the ENCOUNTER frequency, not the wave's. Standing
 * still you meet a train at its own period; at a three hundred pixel a second
 * cruise you meet a 112px train nearly three times a second. That is not a
 * heave, it is a judder, and it is exactly what "constantly bobbing up and
 * down" is. The old time-only bob never had this problem because it did not
 * know where the boat was — which was its whole fault, and also, accidentally,
 * why it was smooth.
 *
 * So: three trains, none shorter than 395, and the total amplitude back to 5.55
 * where the old pair peaked. At cruise the fastest of them is met well under
 * once a second.
 *
 * Speeds still follow the lengths the way deep water does, as roughly the
 * square root of wavelength, so the long swell overtakes the short instead of
 * the whole field marching in lockstep.
 */
export const SWELL: SwellWave[] = [
  { len: 1500, amp: 3.0, speed: 0.34, skew: 0, phase: 0 },
  { len: 760, amp: 1.7, speed: 0.50, skew: 0.38, phase: 0.61 },
  { len: 395, amp: 0.85, speed: 0.66, skew: -0.812, phase: 2.13 },
]

/** Each train's unit bearing, precomputed. */
const DIRS = SWELL.map(w => {
  const c = Math.cos(w.skew), s = Math.sin(w.skew)
  return { x: WIND_X * c - WIND_Y * s, y: WIND_X * s + WIND_Y * c }
})

const TAU = Math.PI * 2

/**
 * HOW HIGH THE WATER IS AT A POINT, in bob units.
 *
 * `t` is seconds. Cheap on purpose: five sines, no allocation, no branching —
 * it is called once per hull per frame and there can be a couple of dozen hulls
 * on screen.
 */
export function swellAt(x: number, y: number, t: number): number {
  let h = 0
  for (let i = 0; i < SWELL.length; i++) {
    const w = SWELL[i], d = DIRS[i]
    h += w.amp * Math.sin(((x * d.x + y * d.y) / w.len - t * w.speed) * TAU + w.phase)
  }
  return h
}

/**
 * HOW FAR A HULL LEANS, IN DEGREES, sitting where it is sitting.
 *
 * The lean is the surface's slope: a boat on the face of a wave rolls down it,
 * and rights itself over the crest. This is the whole of what was missing from
 * a chart where the only roll was `sin(t) * gust` — a term multiplied by the
 * WEATHER, so in ordinary water the hull held one fixed angle and never moved.
 * A boat at a constant lean is a boat on rails.
 *
 * Measured against the field rather than guessed, and re-measured after the two
 * short trains came out: the slope they carried was the highest in the set and
 * also the fastest-changing, so losing them takes the twitch out of the roll as
 * well as out of the heave.
 *
 * Small on purpose. A hull that rolls a long way does not look like a boat in a
 * swell, it looks like a boat in trouble — what makes this read at all is that
 * it never stops and never repeats, not that it is large.
 */
export function swellHeel(x: number, y: number, t: number): number {
  const g = swellSlope(x, y, t) * 110
  return Math.max(-5, Math.min(5, g))
}

/**
 * WHICH WAY THE WATER IS TILTED, along the x axis, at a point.
 *
 * A hull sitting on the face of a wave leans down it, and that lean is the
 * derivative of the height along the boat's beam. Returned in bob units per
 * world pixel; the caller decides how much of a heel that is worth, because how
 * far a hull rolls is about the hull and not about the sea.
 *
 * `swellHeel` above turns it into degrees; this stays separate because how far
 * a hull rolls is about the hull, and a bigger ship on the same water should
 * not roll as far as a skiff.
 */
export function swellSlope(x: number, y: number, t: number): number {
  let g = 0
  for (let i = 0; i < SWELL.length; i++) {
    const w = SWELL[i], d = DIRS[i]
    g += w.amp * (TAU / w.len) * d.x
      * Math.cos(((x * d.x + y * d.y) / w.len - t * w.speed) * TAU + w.phase)
  }
  return g
}
