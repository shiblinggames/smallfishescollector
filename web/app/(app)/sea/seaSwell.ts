// ── ONE SWELL, READ BY THE WATER AND BY EVERYTHING FLOATING ON IT ───────────
//
// The sea has always had a swell and the boats have never known about it. The
// water shader draws a travelling field of crests stretched along the wind;
// every hull on the chart bobbed on `sin(t * 1.7) * 3.4 + sin(t * 2.6 + 1.1)`,
// a free-running function of TIME ALONE with a per-boat phase offset. So the
// waves went past underneath and nothing rose on them, and two boats floating
// side by side heaved in opposite directions because their offsets differed.
//
// This is the field both sides read. A hull's height is now a fact about WHERE
// IT IS, which is what makes a crest travel through a group of boats instead of
// each one keeping its own time.
//
// ── WHY IT IS SINES AND NOT THE SHADER'S OWN NOISE ──────────────────────────
//
// The obvious move is to transliterate `vnoise` out of seaWater and sample the
// exact field being drawn. It does not work, and the reason is worth keeping.
// That noise is built on `fract(sin(dot(p, k)) * 43758.5453123)` — a hash whose
// entire output lives in the bits that a float32 multiply THROWS AWAY. The GPU
// computes it at 32 bits with a hardware sine; JavaScript computes at 64 with a
// different one. The two do not merely round differently, they disagree
// completely, and there is no amount of Math.fround that fixes it.
//
// So the shared field is ANALYTIC: three directional sine trains, which is both
// exactly reproducible on either side of the fence and what a real swell is —
// a few long trains from a few bearings, summed. The noise stays where it is,
// on the GPU, doing what it is good at, which is texture.
//
// ── AND THE GLSL COMES OUT OF THIS FILE ─────────────────────────────────────
//
// `swellGlsl()` writes the shader's copy from the same numbers the TypeScript
// runs on. Not a comment asking the next person to keep two lists in step: the
// literals exist once and the shader is generated from them. Change a
// wavelength here and both sides move together or neither does.

/** The prevailing wind, as seaWater and seaGrass have it. */
export const WIND_X = 0.8231
export const WIND_Y = 0.5679

/**
 * A train: how long the wave is in world pixels, how high it lifts a hull, how
 * fast it travels in lengths per second, and how far its bearing is turned off
 * the prevailing wind in radians.
 *
 * `amp` is in the same units the old bob was — screen pixels before the zoom —
 * so nothing downstream had to be rescaled. The three of them sum to about
 * seven, against the old pair's five and a half: a shade more heave, and it is
 * now heave rather than jitter.
 *
 * THE SKEWS ARE NOT MULTIPLES OF EACH OTHER, and neither are the lengths. Three
 * trains on related bearings and related periods produce a pattern that repeats
 * on a short cycle, and a sea that visibly repeats is a machine.
 */
export type SwellWave = { len: number; amp: number; speed: number; skew: number }

export const SWELL: SwellWave[] = [
  // The long heave. Low and slow and by far the widest: this is the one that
  // carries a group of boats up together.
  { len: 1450, amp: 4.2, speed: 0.42, skew: 0 },
  // A shorter train crossing it, off the wind by about thirty degrees.
  { len: 620, amp: 2.1, speed: 0.63, skew: 0.55 },
  // Chop, the other way, quick and small.
  { len: 300, amp: 0.9, speed: 0.85, skew: -0.35 },
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
 * `t` is seconds. Cheap on purpose: three sines, no allocation, no branching —
 * it is called once per hull per frame and there can be a couple of dozen
 * hulls.
 */
export function swellAt(x: number, y: number, t: number): number {
  let h = 0
  for (let i = 0; i < SWELL.length; i++) {
    const w = SWELL[i], d = DIRS[i]
    h += w.amp * Math.sin(((x * d.x + y * d.y) / w.len - t * w.speed) * TAU)
  }
  return h
}

/**
 * WHICH WAY THE WATER IS TILTED, along the x axis, at a point.
 *
 * A hull sitting on the face of a wave leans down it, and that lean is the
 * derivative of the height along the boat's beam. Returned in bob units per
 * world pixel; the caller decides how much of a heel that is worth, because
 * how far a hull rolls is about the hull and not about the sea.
 */
export function swellSlope(x: number, y: number, t: number): number {
  let g = 0
  for (let i = 0; i < SWELL.length; i++) {
    const w = SWELL[i], d = DIRS[i]
    g += w.amp * (TAU / w.len) * d.x
      * Math.cos(((x * d.x + y * d.y) / w.len - t * w.speed) * TAU)
  }
  return g
}

/**
 * THE SAME FIELD, AS GLSL, generated rather than copied.
 *
 * Returns the body of `float swellHeight(vec2 world, float time)` with this
 * file's numbers baked in. The shader adds it as a shading term so the crests
 * that lift the boats are crests you can see — without it the hulls ride a
 * wave that is not drawn, which is a different bug wearing the same clothes.
 *
 * Amplitudes are handed over as a FRACTION of the sum, not in bob units: on the
 * water it is a shade of light and dark, and how dark is the shader's business.
 *
 * ── AND THE GRADIENT MATTERS MORE THAN THE HEIGHT ───────────────────────────
 *
 * `swellGradGlsl` writes the derivative, and it is the one that makes water
 * look like water. Shading a surface by its HEIGHT gives you light where it is
 * high and dark where it is low — smooth bands, corduroy, which is exactly what
 * the first cut of this looked like. A surface is seen through its NORMAL: each
 * crest gets a face turned toward the light and a face turned away, and that
 * pair is what the eye reads as a wave.
 *
 * Free here, because an analytic field has an analytic derivative. It is the
 * same three terms with cos for sin and a factor of 2*pi/wavelength.
 */
export function swellGradGlsl(): string {
  const total = SWELL.reduce((n, w) => n + w.amp, 0)
  const terms = SWELL.map((w, i) => {
    const d = DIRS[i]
    const k = (w.amp / total) * (TAU / w.len)
    return `  g += ${k.toExponential(5)} * vec2(${d.x.toFixed(6)}, ${d.y.toFixed(6)})`
      + ` * cos((dot(world, vec2(${d.x.toFixed(6)}, ${d.y.toFixed(6)}))`
      + ` / ${w.len.toFixed(1)} - time * ${w.speed.toFixed(4)}) * 6.2831853);`
  })
  return `vec2 swellGrad(vec2 world, float time) {\n  vec2 g = vec2(0.0);\n${terms.join('\n')}\n  return g;\n}`
}

export function swellGlsl(): string {
  const total = SWELL.reduce((n, w) => n + w.amp, 0)
  const terms = SWELL.map((w, i) => {
    const d = DIRS[i]
    return `  h += ${(w.amp / total).toFixed(5)} * sin((dot(world, vec2(${d.x.toFixed(6)}, ${d.y.toFixed(6)}))`
      + ` / ${w.len.toFixed(1)} - time * ${w.speed.toFixed(4)}) * 6.2831853);`
  })
  return `float swellHeight(vec2 world, float time) {\n  float h = 0.0;\n${terms.join('\n')}\n  return h;\n}`
}
