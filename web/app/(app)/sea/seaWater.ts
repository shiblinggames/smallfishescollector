// ── THE WATER, AS WATER ─────────────────────────────────────────────────────
//
// The chart's sea is a CSS radial gradient with two mottled tiles sliding over
// it. That reads well and costs nothing, but everything on it moves as one
// rigid sheet, because CSS can slide a bitmap and cannot deform one. Nothing
// undulates, nothing catches the light, and the surface is the same surface
// whichever way the sun is.
//
// This is the same colour with a surface on it.
//
// ── IT DOES NOT DECIDE THE COLOUR ───────────────────────────────────────────
//
// `seaAt` blends five zone palettes by distance and pulls the whole thing 78%
// toward cold blue-black at night, and it is the reason the chart has no
// visible zone edges anywhere. That work is not repeated here and not replaced:
// the three stops arrive as uniforms already blended, and the shader's entire
// job is to disturb them. Hand it the same three colours the CSS had and, with
// the swell at zero, it paints the same gradient — same ellipse, same 130% by
// 104%, same centre at 50% / -10%, same stops at 0, 24, 60 and 100%.
//
// ── WHAT IT ADDS ────────────────────────────────────────────────────────────
//
// SWELL: two octaves of value noise, the second warped by the first, sampled in
// WORLD space so the sea moves past the hull rather than with the screen. It
// modulates brightness only — never hue — so no amount of motion can drift the
// water away from the colour the zone blend chose.
//
// GLINTS: the cue that actually sells a liquid. High-frequency noise, hard
// thresholded so specks wink in and out rather than sliding about, and stretched
// ACROSS the light so they lie along the swell the way real glare does.
//
// LIGHT: one direction, one warmth. The glints face it and the swell shades away
// from it, so when the day/night clock turns the light down the sea goes calm
// and unlit rather than merely darker. That is the thing a flat gradient could
// never do and the reason this exists at all.

import { PLACES } from './chart'

export type WaterUniforms = {
  /** Seconds. The only thing that animates. */
  uTime: number
  /** Where the camera is in world units, and how far in it is. Sampling in
   *  world space is what stops the swell from being stuck to the screen. */
  uCam: Float32Array
  uZoom: number
  /** The drawing surface, in CSS pixels. */
  uRes: Float32Array
  /** The three stops out of `seaAt`, already blended for this position and this
   *  hour. Shallow, middle, deep. */
  uShallow: Float32Array
  uMid: Float32Array
  uDeep: Float32Array
  /** 0 at noon, 1 at the middle of the night. Calms the sea and kills the
   *  glints as it climbs. */
  uDark: number
  /** Where the light comes from, in screen space. Matches the buildings' key:
   *  upper left. */
  uLight: Float32Array
  /** How much surface there is at all. 0 is the old flat gradient exactly. */
  uSwell: number
  /** How hard the camera is travelling, 0..1. See the note in the fragment
   *  shader: fine detail crossing the whole screen at speed is what makes
   *  sailing unpleasant, and this is the knob that takes it away. */
  uRush: number
  /** The clock's second axis: 0 at noon and midnight, 1 with the sun on the
   *  horizon. See seaClock. */
  uWarm: number
}

/**
 * WHERE THE SHELF RUNS, in world pixels: the inner edge of the first fishable
 * band and the outer edge of the last. Derived from PLACES so the depth the
 * shader draws and the bands the game runs on are the same fact.
 */
const SHELF_IN = Math.min(...PLACES.filter(p => p.inner !== undefined).map(p => p.inner!))
const SHELF_OUT = Math.max(...PLACES.map(p => p.outer ?? 0))

// ── THE SHADERS ─────────────────────────────────────────────────────────────
//
// A FILTER ON A FULL-SCREEN SPRITE, not a hand-written Mesh shader. The first
// attempt was a Mesh with its own vertex program declaring uProjectionMatrix,
// uWorldTransformMatrix and uTransformMatrix as bare uniforms. It COMPILED and
// drew nothing: in Pixi 8 a mesh's matrices arrive through uniform groups the
// pipeline binds, so those names sat at zero, the quad collapsed, and the only
// thing on screen was the renderer's clear colour. A shader that compiles and
// draws nothing is the worst kind, because every readout says it is fine.
//
// The filter path has none of that risk. Pixi supplies the vertex program's
// uniforms itself — uInputSize, uOutputFrame, uOutputTexture — and this vertex
// source is its own, taken from the library rather than from memory. All this
// file provides is the fragment.

const VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`

const FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform float uTime;
uniform vec2  uCam;
uniform float uZoom;
uniform vec2  uRes;
uniform vec3  uShallow;
uniform vec3  uMid;
uniform vec3  uDeep;
uniform float uDark;
uniform vec2  uLight;
uniform float uSwell;
uniform float uRush;
uniform float uWarm;
// Where the fishable sea starts and stops, in world pixels. Uploaded from
// PLACES rather than written here, so the shelf can never disagree with the
// bands it is a picture of.
uniform vec2  uShelf;

// The plane's foreshortening. Sampling noise without it makes the swell look
// like it is standing up out of the water rather than lying on it.
const float GROUND = 0.58;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main(void) {
  vec2 uv = vTextureCoord;

  // ── THE GRADIENT THE CSS DREW, exactly ────────────────────────────
  // radial-gradient(ellipse 130% 104% at 50% -10%, shallow 0, mid 24%,
  //                 deep 60%, deep*0.62 100%)
  vec2 g = (uv - vec2(0.5, -0.10)) / vec2(1.30, 1.04);
  float t = clamp(length(g), 0.0, 1.0);

  vec3 col;
  if (t < 0.24)      col = mix(uShallow, uMid,  t / 0.24);
  else if (t < 0.60) col = mix(uMid,     uDeep, (t - 0.24) / 0.36);
  else               col = mix(uDeep, uDeep * 0.62, (t - 0.60) / 0.40);

  // ── GOLDEN HOUR ───────────────────────────────────────────────────
  //
  // A low sun lands on the far water and barely reaches the near, because you
  // are looking ALONG it rather than down at it. So the warmth is weighted to
  // the top of the gradient, the horizon end where the ramp is near zero, and
  // falls away toward the bottom of the screen where the sea is under you.
  //
  // Toward amber, not away from blue: it is added as light rather than taken
  // out as saturation, so the deep water goes bronze instead of grey.
  float horizon = 1.0 - smoothstep(0.0, 0.72, t);
  // A SECOND, TIGHTER BAND right at the top. A sunset is not one colour, it is
  // a stack: fire where the sun is going down, gold above and around it, and
  // the water's own colour underneath. One amber wash across the lot reads as
  // a filter over a photograph; the stack reads as an evening.
  float ember = 1.0 - smoothstep(0.0, 0.30, t);
  vec3 gold = vec3(1.00, 0.56, 0.20);
  vec3 fire = vec3(0.98, 0.26, 0.11);
  vec3 warmCol = mix(gold, fire, ember * 0.85);

  // STRONG, and it has to be. At the peak of golden hour the clock is halfway
  // through dusk, so seaAt has ALREADY pulled this palette 39% toward cold
  // blue-black before a single warm pixel is added. A gentle tint on top of
  // that is a grey sea with a hint of yellow. This has to out-argue the night
  // that is already in the colour, which is why it replaces most of it rather
  // than blending politely with it.
  col = mix(col, col * 0.34 + warmCol * 0.92, uWarm * horizon * 0.88);
  // And a little of it everywhere, so the whole sea agrees about the hour.
  col = mix(col, col * 0.78 + gold * 0.30, uWarm * 0.38);

  // ── THE SURFACE, in world units ───────────────────────────────────
  // Screen to world, undoing the squash on y so a wave is as long across the
  // plane as it is along it.
  vec2 px = (uv - 0.5) * uRes;
  vec2 world = uCam + vec2(px.x, px.y / GROUND) / uZoom;

  // ── AND IT RECEDES ────────────────────────────────────────────────
  //
  // GROUND tilts this plane and nothing else about the picture knew. An
  // orthographic squash turns circles into ellipses and stops there: every
  // wave, near or far, was the same size on screen, which is exactly what a
  // flat wall looks like.
  //
  // A receding surface does two things and this does both. Its texture
  // COMPRESSES with distance — the same swell subtends less as it goes away —
  // and it FLATTENS, because at a shallow angle you see the tops of waves
  // rather than their faces.
  //
  // uv.y is 0 at the top of the view and 1 at the bottom, and up-screen is
  // genuinely further off however you are pointed: the plane recedes upward
  // whatever heading you sail, which is the whole meaning of the squash. So
  // this is honest depth rather than a gradient painted on.
  float depth = 1.0 - uv.y;
  // Squared, so the near half of the screen is almost untouched and the
  // compression arrives where the eye expects it. Linear made the whole sea
  // look like it was being sucked upward.
  float recede = depth * depth;
  // ── COMPRESSED AROUND THE CAMERA, NOT AROUND THE WORLD ORIGIN ─────
  //
  // THIS IS WHERE THE WHITE HORIZONTAL LINES CAME FROM, and the fix is the
  // subtraction. It used to be world * k, with k a function of the screen ROW.
  // So the sample point moved between one row and the next by world * dk — and
  // world is an ABSOLUTE chart coordinate, ten or twenty thousand pixels out.
  //
  // Run the numbers and the artefact is exactly what was on screen. Across one
  // row of a thousand-pixel view, dk is about 5e-6; times a world coordinate of
  // 12,000 that is 0.06 of a noise unit PER ROW, so the field slides a whole
  // feature every seventeen rows. That is a horizontal stripe every seventeen
  // pixels, drifting with the map because the sample is in world space, and
  // getting WORSE the further from the origin you sail. Golden hour is where it
  // showed because the glint threshold drops then and the field goes from
  // scattered specks to broad connected blobs — big enough for the striping to
  // join up into what looks like rays.
  //
  // Compressing the OFFSET from the camera instead leaves the same picture —
  // the near water is untouched, the far water tightens — but the row-to-row
  // step is now proportional to distance from the camera, which is a screen's
  // worth rather than a chart's. About 0.007 a row: one feature every hundred
  // and forty rows, which is no edge at all. And it no longer depends on where
  // on the chart you are.
  vec2 w = (world - uCam) * (0.0016 * (1.0 + recede * 1.5)) + uCam * 0.0016;

  // Two octaves, the second dragged around by the first. One drifts across the
  // swell and the other along it, so the pattern never repeats visibly.
  float d1 = vnoise(w + vec2(uTime * 0.020, uTime * -0.013));
  float d2 = vnoise(w * 2.7 + vec2(d1 * 1.6 - uTime * 0.031, d1 * -1.2));
  // ── THE FINE OCTAVE STANDS DOWN AT SPEED ─────────────────────────
  //
  // A short exposure of something moving fast is BLURRED, and blur is exactly
  // the loss of high frequencies. A shader cannot blur cheaply, but it can
  // simply turn the high-frequency term down, which is perceptually most of the
  // same thing and costs one multiply. The big swell is kept whole: it is low
  // frequency, so it crosses the screen slowly in visual terms and reads as the
  // sea heaving rather than as detail rushing past.
  // 0.85, not 0.55. The high-frequency term is what the eye tries to track and
  // cannot, and at a cruise this was still leaving three quarters of it up. See
  // the note on uRush's curve in SeaIslandsGPU.
  // 0.21, down from 0.35. The whole high-frequency field is at 60% of what it
  // was even standing still — see the note on the amplitudes below.
  float fine = 0.21 * (1.0 - 0.85 * uRush);
  float swell = (d1 * (1.0 - fine) + d2 * fine) - 0.5;

  // ── THE SHELF ─────────────────────────────────────────────────────
  //
  // The colour of the water already changes with the band, but it changes ALL
  // AT ONCE: seaAt blends the palette for wherever the CAMERA is and hands the
  // whole screen one answer, so crossing from the Deep into the Abyss is the
  // entire view shifting together. The sea had no depth ACROSS it.
  //
  // This is the same fact drawn per pixel. Distance from the origin, against
  // the real inner and outer radii of the fishable sea, so the far side of the
  // screen is genuinely deeper than the near side and sailing out is something
  // you can watch happen rather than something you read off a band name.
  //
  // BRIGHTNESS ONLY. Hue is the zone blend's business and this may not touch
  // it — the same law the swell obeys three lines down. Deep water is not a
  // different colour here, it is less lit, which is also what deep water is.
  float shelf = smoothstep(uShelf.x, uShelf.y, length(world));

  // Brightness only. Hue is the zone blend's business and nothing here may
  // touch it.
  // THE SWELL LIES DOWN AS IT GOES AWAY. Same reason the texture compresses:
  // at a shallow angle a wave presents its top, not its face, so the far water
  // is calmer-looking without being any calmer.
  float shade = 1.0 + swell * 0.20 * uSwell * (1.0 - recede * 0.55);
  // Gentle: at the far edge the water gives up about a seventh of its light.
  // Any more and the Ancient Deep goes black on its own, which the palette is
  // already responsible for saying — and at 0.22 this was taking a fifth out of
  // the far half of every screen, which is a lot of the reason the sea read as
  // washed out even after the palettes were richer.
  shade *= 1.0 - shelf * 0.14;
  float facing = dot(normalize(vec2(swell, swell * 0.6) + vec2(0.0001)), normalize(uLight));
  shade += facing * 0.035 * uSwell;
  col *= shade;

  // ── THE SHORE IS NOT DRAWN HERE ──────────────────────────────────
  //
  // It was, twice, and both times it landed in open water. A screen-space
  // shader has to reconstruct world position from the camera, the ground
  // squash, the zoom and an actually-uploaded uniform before it can measure a
  // distance to anything — and every one of those was a chance to put the surf
  // somewhere the coast is not.
  //
  // It is a ring of triangles parented to each island now: see shoreFoam. It
  // moves with the island because it is AT the island, the same way the
  // contact shadow is, and no camera enters into it.

  // ── CAUSTICS ──────────────────────────────────────────────────────
  //
  // The bright filaments light makes on a shallow bottom. RIDGED noise, not
  // ordinary noise: 1 - abs(2n-1) folds the field at its midpoint so what was a
  // smooth hill becomes a crease, and creases are what a caustic is. Two
  // octaves crossing at different rates so the web moves without repeating.
  //
  // SHALLOW WATER ONLY, and that is the whole point of having them. They are
  // strongest at the coast and gone by the Deep, which makes the shelf above
  // legible in a second way: the near water is not just brighter, it is
  // patterned, and the far water is plain.
  //
  // And they need the sun. A caustic is refracted sunlight, so it goes out
  // with the light rather than lingering into the night, and it stands down at
  // speed with everything else fine-grained.
  float caust = 0.0;
  if (shelf < 0.62 && uDark < 0.9) {
    vec2 cw = w * 3.1;
    float c1 = vnoise(cw + vec2(uTime * 0.035, uTime * 0.021));
    float c2 = vnoise(cw * 1.7 - vec2(uTime * 0.026, uTime * -0.033));
    float ridged = (1.0 - abs(c1 * 2.0 - 1.0)) * (1.0 - abs(c2 * 2.0 - 1.0));
    caust = pow(ridged, 3.4)
      * (1.0 - smoothstep(0.10, 0.62, shelf))
      * (1.0 - uDark)
      // 0.85, not 0.92. Caustics are the one fine detail that is worth keeping
      // some of under way: they are LOW contrast and they say where the shelf
      // is, so losing nearly all of them at speed took the shallows' whole
      // character out of the water you were actually crossing.
      * (1.0 - 0.85 * uRush);
    col += caust * vec3(0.72, 0.92, 0.86) * 0.18 * uSwell;
  }

  // ── THE MOON'S PATH ───────────────────────────────────────────────
  //
  // At night the light stops scattering off every wave and lays a single road
  // across the water instead, and the sea outside it goes flat. The glints
  // below already do the sun's version of this; this is the one that only
  // exists after dark, and it is most of why a night sea reads as a night sea
  // rather than as a dim day.
  //
  // Measured along the light's own axis, so it points wherever the clock says
  // the light is coming from and turns with it through the night.
  float across = abs(dot(normalize(vec2(px.x, px.y / GROUND)), vec2(uLight.y, -uLight.x)));
  float road = (1.0 - smoothstep(0.0, 0.34, across));
  // Broken by the swell, because a reflection on moving water is not a stripe,
  // it is a column of separate bright pieces.
  float broken = smoothstep(0.42, 0.86, d1) * (0.55 + 0.45 * smoothstep(0.4, 0.9, d2));
  // 0.13, DOWN FROM 0.24. The road was reading as a lit strip laid ON the sea
  // rather than a reflection in it — bright enough that the eye went to it and
  // stayed, which is the opposite of what a night sea should do to attention.
  // Halved, and it still does the job it is here for: the water outside it goes
  // flat and the night stops reading as a dim day.
  col += road * broken * vec3(0.62, 0.74, 0.95) * 0.13 * uDark * uSwell * (1.0 - 0.88 * uRush);

  // ── GLINTS ────────────────────────────────────────────────────────
  vec2 gv = vec2(uLight.y, -uLight.x);
  // 6.0, NOT 9.0. At 9 a glint cell is about seventy world pixels across, so
  // at a cruise the whole screen is crossed by several of them a second — a
  // high-contrast, high-frequency field strobing past, which is the single
  // most nauseating thing a moving background can do. Wider cells cross less
  // often and read as the same water.
  float sparkle = vnoise(w * 6.0 + gv * 2.0 + vec2(uTime * 0.10, uTime * 0.06));
  // THE GLARE PATH WIDENS AS THE SUN DROPS. A high sun scatters a few points
  // of light; a low one lays a road of them across the water. So the threshold
  // opens with warmth and the specks recruit their neighbours.
  float lo = mix(0.86, 0.66, uWarm);
  sparkle = smoothstep(lo, 0.995, sparkle) * smoothstep(0.30, 0.75, d1);
  // Weighted to the horizon like the warmth is, because that is where a low
  // sun's reflection actually is.
  float sunRoad = mix(1.0, 1.0 + horizon * 1.6, uWarm);
  // The road is the colour of the sun making it, not white.
  vec3 glintCol = mix(vec3(1.0), vec3(1.0, 0.62, 0.28), uWarm);
  // AND THEY FADE AS SHE DRIVES. Glare is the highest-contrast thing on the
  // water and the most expensive to sweep past; under way it gives up most of
  // itself, and comes back the moment you slow down and look.
  // ── THE GLINTS ARE THE STROBE ─────────────────────────────────────
  //
  // A glint cell is about 104 world pixels across, so at a 300px/s cruise
  // roughly two and a half of them sweep the screen every second, full width,
  // bright white. A 0.7 coefficient still left 60% of that up at cruise, and
  // it is the single strongest optical-flow signal the chart produces — the
  // foam field is sparse by comparison and was the thing that got blamed.
  //
  // 0.96 takes them almost entirely out at speed and leaves them untouched at
  // rest, which is when they are worth having: a glint is light catching a wave
  // you are sitting on, not scenery you are overtaking.
  // ── AND THE WHOLE FIELD IS QUIETER AT REST ────────────────────────
  //
  // Glints 0.16 to 0.096, caustics 0.30 to 0.18, the fine chop 0.35 to 0.21 —
  // 60% of each, together, so the relationship between them is unchanged and
  // the water is the same water with the contrast down.
  //
  // The speed damping above was the fix for sailing. This is the other half of
  // the same complaint: it was too busy STILL, which is most of what a fishing
  // session is. A sea you are staring at for two minutes waiting on a bite has
  // a much lower budget for glitter than one you are crossing.
  //
  // ── 0.88, AND NOT THE 0.80 THAT WAS ASKED FOR ─────────────────────────────
  //
  // The note above is a scar: glints at speed were reported as nauseating, and
  // 0.96 is where that stopped. Going to 0.80 would leave five times as much of
  // them at a cruise as today, which is most of the way back to the number that
  // caused the complaint. 0.88 leaves three times as much — the water under way
  // stops being dead without going back to strobing — and the at-rest amount is
  // untouched on purpose, because the last two notes on this sea have both been
  // that it is too busy when you are sitting still.
  col += sparkle * glintCol * 0.096 * sunRoad * uSwell * (1.0 - uDark) * (1.0 - 0.88 * uRush);

  // ── AND THE LAST THING: BREAK THE BANDS ───────────────────────────
  //
  // The evening was drawing horizontal lines across the water, and they were
  // not lines. They are CONTOURS: an eight-bit channel can only hold 256 steps,
  // and golden hour ramps a very strong colour across most of the screen: the
  // horizon term falls over 0.72 of the gradient and the mix under it replaces
  // two thirds of the pixel. Spread that few steps over that many pixels and
  // the eye finds the boundary between one step and the next and joins it up
  // into a line. It shows here and nowhere else because nothing else on this
  // chart ramps that hard over that much sea.
  //
  // The fix is not a smoother curve — the curve is already smooth, and the
  // screen is what cannot say so. Dither: a sub-step of noise per pixel, so
  // the boundary between two steps is scattered across a band of pixels
  // instead of falling on one line. TWO hashes rather than one, which makes
  // the noise triangular rather than flat and is the standard trick: it costs a
  // second hash and cancels the faint texture a single uniform hash leaves
  // behind.
  //
  // Half a step either way. Enough to destroy a contour, far too little to see.
  float d0 = hash(gl_FragCoord.xy);
  float d1 = hash(gl_FragCoord.xy + vec2(17.31, 91.7));
  col += (d0 + d1 - 1.0) / 255.0;

  // ── AND BREAK THE BANDS ───────────────────────────────────────────
  //
  // Separate from the stripes above, and worth having anyway. An eight-bit
  // channel holds 256 steps, and golden hour ramps a very strong colour across
  // most of the screen: the horizon term falls over 0.72 of the gradient and
  // the mix under it replaces two thirds of the pixel. Spread that few steps
  // over that many pixels and the eye finds the boundary between one step and
  // the next and joins it into a contour.
  //
  // The curve is already smooth; the screen is what cannot say so. So: a
  // sub-step of noise per pixel, which scatters each boundary across a band of
  // pixels instead of letting it fall on one line. Two hashes rather than one
  // makes the noise triangular rather than flat, which is the standard trick —
  // it costs a second hash and cancels the faint texture a single uniform hash
  // leaves behind. Half a step either way: enough to destroy a contour, far too
  // little to see.
  float d0 = hash(gl_FragCoord.xy);
  float dd1 = hash(gl_FragCoord.xy + vec2(17.31, 91.7));
  col += (d0 + dd1 - 1.0) / 255.0;

  finalColor = vec4(col, 1.0);
}
`

// GLSL LIVES IN A TEMPLATE LITERAL, so a backtick inside it ends the string and
// turns the rest of the shader into TypeScript - with the errors pointing at
// shader source, which reads like a shader problem and is not one. This has
// happened twice. Checked rather than trusted, because it is silent until the
// compiler gets confused about something unrelated.
if (VERT.includes(String.fromCharCode(96)) || FRAG.includes(String.fromCharCode(96))) {
  throw new Error('seaWater: a backtick in the shader source would truncate it')
}

/**
 * The water, as a full-screen sprite wearing a filter.
 *
 * Returns the sprite to add to the stage and a setter for the frame loop, so
 * this module never needs to know anything about the chart.
 *
 * Built defensively: if the shader will not build on this device the caller
 * gets null and keeps whatever water it already had. A sea that does not
 * animate is a disappointment; a sea that does not draw is a bug.
 */
export async function makeWater(PIXI: typeof import('pixi.js'), initial: WaterUniforms) {
  try {
    const uniforms = new PIXI.UniformGroup({
      uTime: { value: initial.uTime, type: 'f32' },
      uCam: { value: initial.uCam, type: 'vec2<f32>' },
      uZoom: { value: initial.uZoom, type: 'f32' },
      uRes: { value: initial.uRes, type: 'vec2<f32>' },
      uShallow: { value: initial.uShallow, type: 'vec3<f32>' },
      uMid: { value: initial.uMid, type: 'vec3<f32>' },
      uDeep: { value: initial.uDeep, type: 'vec3<f32>' },
      uDark: { value: initial.uDark, type: 'f32' },
      uLight: { value: initial.uLight, type: 'vec2<f32>' },
      uSwell: { value: initial.uSwell, type: 'f32' },
      uRush: { value: initial.uRush, type: 'f32' },
      uWarm: { value: initial.uWarm, type: 'f32' },
      // Read off PLACES, so the shelf is a picture of the real bands rather
      // than of two numbers somebody typed into a shader.
      uShelf: { value: new Float32Array([SHELF_IN, SHELF_OUT]), type: 'vec2<f32>' },
    })

    const filter = new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'sea-water' }),
      resources: { waterUniforms: uniforms },
    })

    // A plain white rectangle for the filter to run over. Its only job is to
    // give the filter an area; not one of its pixels survives the fragment.
    const sprite = new PIXI.Sprite(PIXI.Texture.WHITE)
    sprite.filters = [filter]

    const u = uniforms.uniforms as Record<string, unknown>
    const cam = u.uCam as Float32Array
    return {
      sprite,

      /**
       * THE PER-FRAME PATH, and it is separate from `set` on purpose.
       *
       * `set` walks an object with Object.entries and accepts Float32Arrays,
       * which is right for the handful of calls that change a palette — and
       * wrong sixty times a second. Every frame it was allocating an options
       * object, a Float32Array for the camera, an entries array, and a pair
       * array per key: call it ten allocations a frame, six hundred a second,
       * all of them garbage. None of it showed as a frame time; it shows as the
       * collector deciding to run in the middle of a turn.
       *
       * This writes the six numbers that actually move, straight into the
       * uniform buffer, and allocates nothing.
       */
      frame(time: number, camX: number, camY: number, zoom: number,
            dark: number, warm: number, rush: number) {
        u.uTime = time
        cam[0] = camX
        cam[1] = camY
        u.uZoom = zoom
        u.uDark = dark
        u.uWarm = warm
        u.uRush = rush
        // Writing THROUGH the array does not move the group's dirty id — see
        // the note in `set`, which is the bug that anchored the surf to the
        // viewport for an afternoon.
        uniforms.update()
      },

      size(w: number, h: number) {
        sprite.width = w
        sprite.height = h
        ;(u.uRes as Float32Array).set([w, h])
        uniforms.update()
      },
      set(next: Partial<WaterUniforms>) {
        for (const [k, v] of Object.entries(next)) {
          if (v instanceof Float32Array) (u[k] as Float32Array).set(v)
          else u[k] = v
        }
        // AND SAY SO. A UniformGroup uploads when its dirty id moves, and
        // writing THROUGH a Float32Array does not move it: the array is the
        // same object it always was, so nothing looks changed and the old
        // values stay on the GPU.
        //
        // That is why the surf drifted with the screen. `uCam` was written
        // every frame and uploaded once, so the shader kept reconstructing
        // world position from the camera the page started at — which makes
        // world space and screen space the same thing, and anchors the foam to
        // the viewport instead of to the coast it is supposed to be breaking on.
        uniforms.update()
      },
    }
  } catch {
    return null
  }
}

/** Hex to the 0..1 triple the shader wants. */
export function rgb3(hex: string): Float32Array {
  const n = parseInt(hex.replace('#', ''), 16)
  return new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255])
}

/**
 * ── THE GLOBAL LIGHT ────────────────────────────────────────────────────────
 *
 * One number, one tint, everything on the chart. `dark` is the clock's own 0 to
 * 1, and this is the multiply that goes on every sprite standing in it.
 *
 * IT DIMS AND IT COOLS, and it cools harder than it dims. Colour is the first
 * thing to go at low light and the last thing anybody notices going, which is
 * exactly why it sells: a sea at night is not a grey sea, it is a blue one you
 * cannot quite read. The blue channel is held up while red is pulled down.
 *
 * A tint rather than a filter, and the difference is not cosmetic. A CSS filter
 * on the world layer is what killed the renderer: it made the compositor
 * rasterise a surface the size of the chart's ink overflow. `sprite.tint` is a
 * multiply the GPU does per pixel as it draws, with no buffer at all.
 */
export function nightTint(dark: number, warm = 0): number {
  const k = Math.max(0, Math.min(1, dark))
  const w = Math.max(0, Math.min(1, warm))
  // Night: dim, and cool harder than it dims.
  let r = 1 - k * 0.48
  let g = 1 - k * 0.44
  let b = 1 - k * 0.34
  // Golden hour: the same light that is leaving turns amber on the way out, so
  // the land goes warm as it goes dark rather than simply grey. Red is held up
  // and blue pulled down, which is the opposite of what night does — and doing
  // both at once, in the order they actually happen, is what makes an evening
  // read as an evening instead of as a dimmer.
  r *= 1 + w * 0.42
  g *= 1 - w * 0.04
  b *= 1 - w * 0.34
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(255 * v)))
  return (c(r) << 16) | (c(g) << 8) | c(b)
}

/**
 * The night shift `seaAt` applies to the water palette, so the shader can be
 * handed colours that already know what hour it is.
 *
 * Duplicated deliberately in one direction only: `seaAt` remains the authority
 * on the chart and this exists for the bench, which has no camera position to
 * blend a zone from. Same constant, same 78%.
 */
export function nightShift(rgb: Float32Array, dark: number): Float32Array {
  const NIGHT = [6 / 255, 11 / 255, 22 / 255]
  const k = Math.max(0, Math.min(1, dark)) * 0.78
  return new Float32Array([
    rgb[0] * (1 - k) + NIGHT[0] * k,
    rgb[1] * (1 - k) + NIGHT[1] * k,
    rgb[2] * (1 - k) + NIGHT[2] * k,
  ])
}
