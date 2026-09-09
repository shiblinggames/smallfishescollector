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
 * Sized for HOW A BOAT MOVES, not for how many crests fit on a screen. That was
 * the drawn version's problem and it is not this one's.
 *
 * The long trains carry it — 3.4 and 1.9 against 1.15, 0.62 and 0.3 — so a hull
 * does a slow three-second heave with a little chop on top rather than
 * juddering. Speeds follow the lengths the way deep water does, as roughly the
 * square root of wavelength, so the long swell overtakes the chop instead of
 * the whole field marching in lockstep.
 */
export const SWELL: SwellWave[] = [
  { len: 1500, amp: 3.4, speed: 0.34, skew: 0, phase: 0 },
  { len: 760, amp: 1.9, speed: 0.50, skew: 0.38, phase: 0.61 },
  { len: 395, amp: 1.15, speed: 0.66, skew: -0.812, phase: 2.13 },
  { len: 205, amp: 0.62, speed: 0.88, skew: -1.615, phase: 4.02 },
  { len: 112, amp: 0.3, speed: 1.12, skew: -0.281, phase: 5.47 },
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
 * The constant is measured against the field rather than guessed. Sampled over
 * forty thousand points, 110 gives a typical roll of about 1.9 degrees with
 * peaks near four, and the clamp catches the 0.3% of moments when every train
 * lines up at once.
 *
 * Small on purpose, even so. A hull that rolls a long way does not look like a
 * boat in a swell, it looks like a boat in trouble — the reason this reads at
 * all is that it never stops and never repeats, not that it is large.
 */
export function swellHeel(x: number, y: number, t: number): number {
  const g = swellSlope(x, y, t) * 110
  return Math.max(-6, Math.min(6, g))
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
