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
}

const VERT = `
in vec2 aPosition;
out vec2 vUv;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUv = aPosition;
}
`

const FRAG = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;

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

void main() {
  // ── THE GRADIENT THE CSS DREW, exactly ────────────────────────────
  // radial-gradient(ellipse 130% 104% at 50% -10%, shallow 0, mid 24%,
  //                 deep 60%, deep*0.62 100%)
  vec2 g = (vUv - vec2(0.5, -0.10)) / vec2(1.30, 1.04);
  float t = clamp(length(g), 0.0, 1.0);

  vec3 col;
  if (t < 0.24)      col = mix(uShallow, uMid,  t / 0.24);
  else if (t < 0.60) col = mix(uMid,     uDeep, (t - 0.24) / 0.36);
  else               col = mix(uDeep, uDeep * 0.62, (t - 0.60) / 0.40);

  // ── THE SURFACE, in world units ───────────────────────────────────
  // Screen to world, undoing the squash on y so a wave is as long across the
  // plane as it is along it.
  vec2 px = (vUv - 0.5) * uRes;
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

  // Away from the light is where a trough darkens.
  float facing = dot(normalize(vec2(swell, swell * 0.6) + vec2(0.0001)), normalize(uLight));
  shade += facing * 0.035 * uSwell;

  col *= shade;

  // ── GLINTS ────────────────────────────────────────────────────────
  // Stretched across the light so they lie along the swell, thresholded hard
  // so they wink rather than slide, and gone entirely after dark.
  vec2 gv = vec2(uLight.y, -uLight.x);
  vec2 gw = w * 9.0 + gv * 2.0;
  float sparkle = vnoise(gw + vec2(uTime * 0.10, uTime * 0.06));
  sparkle = smoothstep(0.86, 0.995, sparkle) * smoothstep(0.30, 0.75, d1);
  col += sparkle * 0.16 * uSwell * (1.0 - uDark);

  fragColor = vec4(col, 1.0);
}
`

/**
 * A full-screen quad running the water. Returns the mesh and a setter, so the
 * frame loop can feed it without this module knowing anything about the chart.
 *
 * Built defensively: if the shader will not compile on this device, the caller
 * gets null and keeps whatever water it already had. A sea that does not
 * animate is a disappointment; a sea that does not draw is a bug.
 */
export async function makeWater(PIXI: typeof import('pixi.js'), initial: WaterUniforms) {
  try {
    const geometry = new PIXI.Geometry({
      attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1] },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    })
    const shader = PIXI.Shader.from({
      gl: { vertex: VERT, fragment: FRAG },
      resources: {
        waterUniforms: {
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
        },
      },
    })
    const mesh = new PIXI.Mesh({ geometry, shader })
    const u = shader.resources.waterUniforms.uniforms as Record<string, unknown>
    return {
      mesh,
      /** Stretch the quad over the whole drawing surface. */
      size(w: number, h: number) {
        mesh.scale.set(w, h)
        ;(u.uRes as Float32Array).set([w, h])
      },
      set(next: Partial<WaterUniforms>) {
        for (const [k, v] of Object.entries(next)) {
          if (v instanceof Float32Array) (u[k] as Float32Array).set(v)
          else u[k] = v
        }
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
