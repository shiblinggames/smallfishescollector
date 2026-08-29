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
  /** The clock's second axis: 0 at noon and midnight, 1 with the sun on the
   *  horizon. See seaClock. */
  uWarm: number
}

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
uniform float uWarm;

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
  vec2 w = world * 0.0016;

  // Two octaves, the second dragged around by the first. One drifts across the
  // swell and the other along it, so the pattern never repeats visibly.
  float d1 = vnoise(w + vec2(uTime * 0.020, uTime * -0.013));
  float d2 = vnoise(w * 2.7 + vec2(d1 * 1.6 - uTime * 0.031, d1 * -1.2));
  float swell = (d1 * 0.65 + d2 * 0.35) - 0.5;

  // Brightness only. Hue is the zone blend's business and nothing here may
  // touch it.
  float shade = 1.0 + swell * 0.20 * uSwell;
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

  // ── GLINTS ────────────────────────────────────────────────────────
  vec2 gv = vec2(uLight.y, -uLight.x);
  float sparkle = vnoise(w * 9.0 + gv * 2.0 + vec2(uTime * 0.10, uTime * 0.06));
  // THE GLARE PATH WIDENS AS THE SUN DROPS. A high sun scatters a few points
  // of light; a low one lays a road of them across the water. So the threshold
  // opens with warmth and the specks recruit their neighbours.
  float lo = mix(0.86, 0.66, uWarm);
  sparkle = smoothstep(lo, 0.995, sparkle) * smoothstep(0.30, 0.75, d1);
  // Weighted to the horizon like the warmth is, because that is where a low
  // sun's reflection actually is.
  float road = mix(1.0, 1.0 + horizon * 1.6, uWarm);
  // The road is the colour of the sun making it, not white.
  vec3 glintCol = mix(vec3(1.0), vec3(1.0, 0.62, 0.28), uWarm);
  col += sparkle * glintCol * 0.16 * road * uSwell * (1.0 - uDark);

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
      uWarm: { value: initial.uWarm, type: 'f32' },
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
    return {
      sprite,
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
