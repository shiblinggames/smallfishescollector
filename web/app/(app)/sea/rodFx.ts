// ── WHAT THE GOOD RODS LOOK LIKE ────────────────────────────────────────────
//
// Every glowing rod has TWO things, and they are not the same thing:
//
//   1. ITS GLOW — the rod's own silhouette lit up in its own colour, breathing
//      on its own timing. This is what the rods have today, and it is the part
//      that identifies the rod. In CSS it is `filter: drop-shadow()` applied to
//      the rod IMAGE, so the light traces the shape of the rod: the hilt, the
//      taper, the tip. Not a lamp near the rod. The rod itself, glowing.
//
//   2. ITS EFFECT — what it throws off into the air. This is new, and it is
//      what a sprite renderer can do that a compositor cannot.
//
// Both are per-rod and both are below. The glow is a PORT: the keyframes in
// globals.css are transcribed stop for stop, so a Legendary breathes on exactly
// the 2.0s it always did and a Lightsaber still layers a white core inside two
// crimsons. It should be recognisably the same rod, because it is.
//
// ── HOW A SILHOUETTE GLOW IS DONE WITHOUT A FILTER ──────────────────────────
//
// A CSS drop-shadow is a gaussian blur of the element's ALPHA, painted in a
// flat colour, composited behind it. So: take the rod's own alpha, fill it
// white, blur it, and put it behind the rod tinted. The blur is baked ONCE per
// rod per radius — it never changes shape, only colour and brightness — and
// tinting a baked texture is free. That is the whole trick, and it is the same
// reason islands are baked: the expensive part is not per-frame.
//
// A per-frame Filter would also work and would cost a render target per rod per
// frame. On a chart that can hold a fleet, it is not close.
//
// ── ONE ENGINE, MANY ROWS ───────────────────────────────────────────────────
//
// Both halves are data. A new rod is a glow timeline and an effect row, not new
// code — ten hand-written effects drift into ten different ideas of what a
// particle is, and the eleventh takes a day.

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'

export type GlowType =
  | 'fire' | 'sparkle' | 'electric' | 'moon' | 'tech'
  | 'galaxy' | 'saber' | 'forge' | 'prismatic' | 'lockedin'

// ════════════════════════════════════════════════════════════════════════════
// PART ONE — THE GLOW
// ════════════════════════════════════════════════════════════════════════════

/** One `drop-shadow(0 0 Rpx COLOR)`. `a` carries the colour's own alpha, which
 *  several of the keyframes lean on (#22d3ee88 and friends). */
type Shadow = { r: number; c: number; a: number }

/** One keyframe. `t` is the CSS percentage over 100. */
type Stop = { t: number; layers: Shadow[] }

type Anim = {
  /** Seconds, straight off the `animation` shorthand. */
  dur: number
  /** CSS `linear` timing. Everything else here is `ease-in-out`. */
  linear?: boolean
  stops: Stop[]
}

// ── THE TIMELINES, TRANSCRIBED FROM globals.css ─────────────────────────────
//
// Stop for stop, radius for radius, colour for colour. If one of these ever
// disagrees with the stylesheet, the stylesheet is right and this is a bug.

const GLOWS: Record<GlowType, Anim> = {
  // Legendary — warm orange-red at two radii, breathing like radiating heat.
  fire: {
    dur: 2.0,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0xffb066, a: 1 }, { r: 18, c: 0xff4a10, a: 1 }] },
      { t: 0.35, layers: [{ r: 8, c: 0xffd28a, a: 1 }, { r: 32, c: 0xff3a00, a: 1 }] },
      { t: 0.65, layers: [{ r: 6, c: 0xffbf66, a: 1 }, { r: 26, c: 0xd83000, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0xffb066, a: 1 }, { r: 18, c: 0xff4a10, a: 1 }] },
    ],
  },

  // Millionaire's and Treasure — a long calm gold with ONE deliberate
  // white-gold twinkle. The narrow 46-54% window is the whole character.
  sparkle: {
    dur: 6.5,
    stops: [
      { t: 0.00, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
      { t: 0.46, layers: [{ r: 10, c: 0xffffff, a: 1 }, { r: 36, c: 0xffd560, a: 1 }] },
      { t: 0.54, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
      { t: 1.00, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
    ],
  },

  // YOLO — a cyan base broken by two sharp lightning bursts. Linear, because
  // easing the on-off windows would round off the edges that make it lightning.
  electric: {
    dur: 5.5, linear: true,
    stops: [
      { t: 0.00, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
      { t: 0.28, layers: [{ r: 12, c: 0xffffff, a: 1 }, { r: 44, c: 0x5cc8ff, a: 1 }] },
      { t: 0.33, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
      { t: 0.72, layers: [{ r: 10, c: 0xffffff, a: 1 }, { r: 38, c: 0x4dc8ff, a: 1 }] },
      { t: 0.77, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
      { t: 1.00, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
    ],
  },

  // Moonwood — catching moonlight rather than radiating power.
  moon: {
    dur: 6.0,
    stops: [
      { t: 0.00, layers: [{ r: 2, c: 0xd8c8ff, a: 1 }, { r: 8, c: 0xa78bfa, a: 1 }] },
      { t: 0.50, layers: [{ r: 6, c: 0xece0ff, a: 1 }, { r: 18, c: 0xb89bff, a: 1 }] },
      { t: 1.00, layers: [{ r: 2, c: 0xd8c8ff, a: 1 }, { r: 8, c: 0xa78bfa, a: 1 }] },
    ],
  },

  // Carbon — a precision indicator, not an aura. Tight radii, low contrast.
  tech: {
    dur: 2.8,
    stops: [
      { t: 0.00, layers: [{ r: 1.5, c: 0x86efac, a: 1 }, { r: 5, c: 0x4ade80, a: 1 }] },
      { t: 0.50, layers: [{ r: 3, c: 0xbbf7d0, a: 1 }, { r: 12, c: 0x2fbf6e, a: 1 }] },
      { t: 1.00, layers: [{ r: 1.5, c: 0x86efac, a: 1 }, { r: 5, c: 0x4ade80, a: 1 }] },
    ],
  },

  // Galaxy — deep violet with two starlight twinkles across the void.
  galaxy: {
    dur: 6.5,
    stops: [
      { t: 0.00, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
      { t: 0.30, layers: [{ r: 11, c: 0xffffff, a: 1 }, { r: 40, c: 0x9b7cff, a: 1 }] },
      { t: 0.36, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
      { t: 0.68, layers: [{ r: 9, c: 0xe8dcff, a: 1 }, { r: 34, c: 0x8a6cff, a: 1 }] },
      { t: 0.74, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
      { t: 1.00, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
    ],
  },

  // Lightsaber — THREE layers: a white-hot core inside two crimsons. The only
  // rod with a core, and the reason the engine supports more than two.
  saber: {
    dur: 2.2,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0xffffff, a: 1 }, { r: 13, c: 0xff3344, a: 1 }, { r: 26, c: 0xe00022, a: 1 }] },
      { t: 0.50, layers: [{ r: 6, c: 0xffffff, a: 1 }, { r: 19, c: 0xff5566, a: 1 }, { r: 36, c: 0xff1133, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0xffffff, a: 1 }, { r: 13, c: 0xff3344, a: 1 }, { r: 26, c: 0xe00022, a: 1 }] },
    ],
  },

  // Completionist's forge — banked coals, one flare per cycle.
  forge: {
    dur: 5.5,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
      { t: 0.48, layers: [{ r: 11, c: 0xecfdf5, a: 1 }, { r: 36, c: 0x22c55e, a: 1 }] },
      { t: 0.56, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
    ],
  },

  // Completionist — the four energy strands, sweeping. Linear so the rainbow
  // turns at a constant rate instead of pausing on each colour.
  prismatic: {
    dur: 4.2, linear: true,
    stops: [
      { t: 0.00, layers: [{ r: 5, c: 0xf26d6d, a: 1 }, { r: 18, c: 0xf2c14e, a: 0.667 }] },
      { t: 0.25, layers: [{ r: 5, c: 0xf2c14e, a: 1 }, { r: 18, c: 0x57d06a, a: 0.667 }] },
      { t: 0.50, layers: [{ r: 5, c: 0x57d06a, a: 1 }, { r: 18, c: 0x5aa9f0, a: 0.667 }] },
      { t: 0.75, layers: [{ r: 5, c: 0x5aa9f0, a: 1 }, { r: 18, c: 0xf26d6d, a: 0.667 }] },
      { t: 1.00, layers: [{ r: 5, c: 0xf26d6d, a: 1 }, { r: 18, c: 0xf2c14e, a: 0.667 }] },
    ],
  },

  // The Locked-In Rod at streak 0. Faint, colour-neutral, deliberately weak:
  // the stylesheet's own comment calls it "not yet charged".
  lockedin: {
    dur: 4.2,
    stops: [
      { t: 0.00, layers: [{ r: 1.5, c: 0xd6deeb, a: 0.35 }] },
      { t: 0.50, layers: [{ r: 3, c: 0xe2e8f4, a: 0.5 }] },
      { t: 1.00, layers: [{ r: 1.5, c: 0xd6deeb, a: 0.35 }] },
    ],
  },
}

// ── THE LOCKED-IN ROD'S FOUR GLOWS ──────────────────────────────────────────
//
// Its design is "power grows with your live perfect streak, one miss drops it
// to nothing". The stylesheet already escalates all four stages on amount as
// well as hue — modest cyan, bigger gold, biggest prismatic — and all four are
// transcribed here so the canvas version steps exactly where the CSS one does.
const LOCKED_IN_GLOWS: Anim[] = [
  GLOWS.lockedin,
  // Stage 1 — streak 3, faster bites. Cyan, quick.
  {
    dur: 1.6,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0x67e8f9, a: 1 }, { r: 16, c: 0x22d3ee, a: 0.53 }] },
      { t: 0.40, layers: [{ r: 8, c: 0xa5f3fc, a: 1 }, { r: 28, c: 0x06b6d4, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0x67e8f9, a: 1 }, { r: 16, c: 0x22d3ee, a: 0.53 }] },
    ],
  },
  // Stage 2 — streak 5, triple haul. Gold, bigger.
  {
    dur: 1.5,
    stops: [
      { t: 0.00, layers: [{ r: 7, c: 0xffe08a, a: 1 }, { r: 26, c: 0xf0b90b, a: 0.667 }] },
      { t: 0.40, layers: [{ r: 13, c: 0xfff1b8, a: 1 }, { r: 44, c: 0xf0c040, a: 1 }] },
      { t: 1.00, layers: [{ r: 7, c: 0xffe08a, a: 1 }, { r: 26, c: 0xf0b90b, a: 0.667 }] },
    ],
  },
  // Stage 3 — streak 10, LOCKED IN. The prismatic frenzy, linear and constant.
  {
    dur: 2.0, linear: true,
    stops: [
      { t: 0.00, layers: [{ r: 11, c: 0x67e8f9, a: 1 }, { r: 40, c: 0x22d3ee, a: 0.73 }] },
      { t: 0.33, layers: [{ r: 11, c: 0xf0c040, a: 1 }, { r: 40, c: 0xf0b90b, a: 0.73 }] },
      { t: 0.66, layers: [{ r: 11, c: 0xe879f9, a: 1 }, { r: 40, c: 0xc084fc, a: 0.73 }] },
      { t: 1.00, layers: [{ r: 11, c: 0x67e8f9, a: 1 }, { r: 40, c: 0x22d3ee, a: 0.73 }] },
    ],
  },
]

// ── BAKING A SILHOUETTE ─────────────────────────────────────────────────────

/** Keyed by texture and radius: one rod's 18px blur is one canvas for the whole
 *  chart, however many captains are carrying that rod. */
const glowBakes = new Map<string, Texture>()

/** Padding around the baked silhouette so the blur has somewhere to go. Three
 *  standard deviations is where a gaussian stops mattering, and a drop-shadow's
 *  stddev is half its radius — so 1.5r, rounded up with a little slack. */
const padFor = (r: number) => Math.ceil(r * 2) + 2

function bakeSilhouette(
  PIXI: typeof import('pixi.js'),
  tex: Texture,
  r: number,
): Texture | null {
  const key = `${tex.uid}|${r}`
  const hit = glowBakes.get(key)
  if (hit) return hit

  // The rod arrived as an <img>, which is what we need to draw from. Anything
  // else (a render texture, an atlas frame) has no business being a rod.
  const src = tex.source?.resource as CanvasImageSource | undefined
  if (!src) return null

  const w = tex.width, h = tex.height
  if (!w || !h) return null
  const pad = padFor(r)
  const W = Math.ceil(w + pad * 2), H = Math.ceil(h + pad * 2)

  // Step one: the rod's alpha, filled flat white. White so a TINT can take this
  // silhouette to any colour the timeline asks for, which is the whole reason
  // one bake serves a rod that cycles four colours.
  const cut = document.createElement('canvas')
  cut.width = W; cut.height = H
  const cg = cut.getContext('2d')!
  cg.drawImage(src, pad, pad, w, h)
  cg.globalCompositeOperation = 'source-in'
  cg.fillStyle = '#fff'
  cg.fillRect(0, 0, W, H)

  // Step two: blur it. `filter: blur(N)` takes a STANDARD DEVIATION, while
  // `drop-shadow(0 0 N)` takes a radius of twice that — so halving here is what
  // makes an 18px shadow in the stylesheet come out 18px wide on the canvas.
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const og = out.getContext('2d')!
  og.filter = `blur(${r / 2}px)`
  og.drawImage(cut, 0, 0)

  const t = PIXI.Texture.from(out)
  glowBakes.set(key, t)
  return t
}

// ── SAMPLING A TIMELINE ─────────────────────────────────────────────────────

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

const mixChannel = (a: number, b: number, k: number, shift: number) => {
  const ca = (a >> shift) & 0xff, cb = (b >> shift) & 0xff
  return (ca + (cb - ca) * k) & 0xff
}
const mixColor = (a: number, b: number, k: number) =>
  (mixChannel(a, b, k, 16) << 16) | (mixChannel(a, b, k, 8) << 8) | mixChannel(a, b, k, 0)

function sample(anim: Anim, phase: number, into: Shadow[]) {
  const stops = anim.stops
  let i = 0
  while (i < stops.length - 2 && stops[i + 1].t < phase) i++
  const a = stops[i], b = stops[i + 1] ?? a
  const span = b.t - a.t
  const raw = span > 0 ? (phase - a.t) / span : 0
  const k = anim.linear ? raw : easeInOut(Math.max(0, Math.min(1, raw)))
  for (let l = 0; l < into.length; l++) {
    const la = a.layers[l], lb = b.layers[l] ?? la
    if (!la) { into[l].a = 0; continue }
    into[l].r = la.r + (lb.r - la.r) * k
    into[l].c = mixColor(la.c, lb.c, k)
    into[l].a = la.a + (lb.a - la.a) * k
  }
}

export type RodGlow = {
  /** Add these to the rod's parent BELOW the rod, then leave them alone —
   *  they are already aligned to it. */
  layers: Sprite[]
  update(dt: number): void
  /** The Locked-In Rod's live streak stage, 0..3. Ignored by every other rod. */
  setStage(stage: number): void
  setIntensity(k: number): void
  destroy(): void
}

/**
 * The rod's own silhouette, glowing.
 *
 * Reads the placed rod sprite and matches it exactly: same position, same
 * scale, same rotation, and an anchor recomputed into the padded texture's
 * space so the two shapes sit on top of each other whatever the rod's own
 * anchor happens to be. That last part is the one that goes wrong silently —
 * the rod is anchored bottom-right, and a glow anchored anywhere else drifts
 * off the tip as the rod rotates.
 */
export function makeRodGlow(
  PIXI: typeof import('pixi.js'),
  rod: Sprite,
  glowType: GlowType,
  opts?: { stage?: number },
): RodGlow {
  const family = glowType === 'lockedin' ? LOCKED_IN_GLOWS : [GLOWS[glowType]]
  let anim = glowType === 'lockedin'
    ? LOCKED_IN_GLOWS[Math.max(0, Math.min(3, opts?.stage ?? 0))]
    : GLOWS[glowType]

  // How many shadows the loudest form of this rod uses, and how wide each one
  // ever gets. Baked for the WHOLE family rather than the current stage,
  // because the Locked-In Rod can reach stage 3 mid-cast and that is not the
  // moment to be blurring canvases.
  const count = Math.max(...family.map(f => Math.max(...f.stops.map(s => s.layers.length))))
  const spans: { lo: number; hi: number }[] = []
  for (let l = 0; l < count; l++) {
    let lo = Infinity, hi = 0
    for (const f of family) for (const s of f.stops) {
      const sh = s.layers[l]
      if (!sh) continue
      lo = Math.min(lo, sh.r); hi = Math.max(hi, sh.r)
    }
    spans.push({ lo: Number.isFinite(lo) ? lo : 1, hi: hi || 1 })
  }

  // Two bakes per shadow — the tightest and the widest it ever gets — and the
  // timeline crossfades between them. A single bake would make a rod that
  // breathes 4px to 32px either always fat or always thin; two and a crossfade
  // costs one extra sprite and gets the swell back.
  const layers: Sprite[] = []
  const pairs: { tight: Sprite; wide: Sprite; lo: number; hi: number }[] = []
  for (let l = 0; l < count; l++) {
    const { lo, hi } = spans[l]
    const tt = bakeSilhouette(PIXI, rod.texture, lo)
    const wt = bakeSilhouette(PIXI, rod.texture, hi)
    if (!tt || !wt) continue
    const mk = (t: Texture, r: number) => {
      const s: Sprite = new PIXI.Sprite(t)
      const w = rod.texture.width, h = rod.texture.height
      const pad = padFor(r)
      // The rod's anchor point, re-expressed in the padded texture. Same
      // position and same scale then put the two shapes exactly on top of each
      // other, at any rotation.
      s.anchor.set((pad + rod.anchor.x * w) / (w + pad * 2),
                   (pad + rod.anchor.y * h) / (h + pad * 2))
      s.scale.set(rod.scale.x, rod.scale.y)
      s.position.set(rod.x, rod.y)
      s.rotation = rod.rotation
      // Additive, because this is LIGHT. Where the core and the bloom overlap
      // they should get brighter, which is what makes a lit thing look lit
      // rather than stickered.
      s.blendMode = 'add'
      s.alpha = 0
      return s
    }
    const tight = mk(tt, lo), wide = mk(wt, hi)
    pairs.push({ tight, wide, lo, hi })
    layers.push(tight, wide)
  }

  const live: Shadow[] = Array.from({ length: count }, () => ({ r: 1, c: 0xffffff, a: 0 }))
  let clock = 0
  let intensity = 1

  return {
    layers,

    update(dt) {
      clock += Math.min(dt, 0.05)
      const phase = (clock % anim.dur) / anim.dur
      sample(anim, phase, live)
      for (let l = 0; l < pairs.length; l++) {
        const p = pairs[l], sh = live[l]
        const u = p.hi > p.lo ? Math.max(0, Math.min(1, (sh.r - p.lo) / (p.hi - p.lo))) : 1
        const a = sh.a * intensity
        p.tight.tint = sh.c; p.wide.tint = sh.c
        p.tight.alpha = a * (1 - u)
        p.wide.alpha = a * u
      }
    },

    setStage(stage) {
      if (glowType !== 'lockedin') return
      const next = LOCKED_IN_GLOWS[Math.max(0, Math.min(3, stage))]
      if (next === anim) return
      anim = next
      // The phase restarts, which is right: a stage-up is a new state, and
      // resuming mid-breath at a different amplitude reads as a glitch.
      clock = 0
    },

    setIntensity(k) { intensity = Math.max(0, Math.min(1, k)) },

    destroy() {
      // The bakes are shared and deliberately outlive this.
      for (const s of layers) s.destroy()
    },
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PART TWO — THE EFFECT
// ════════════════════════════════════════════════════════════════════════════
//
// What the rod throws off, as opposed to how it is lit. This half has no CSS
// ancestor because the DOM could not have done it: a drop-shadow is one blur,
// and there is no version of it that throws anything.
//
// The behaviour is the design work. Embers rise, because heat does. A saber
// sheds downward, because a blade burns the air rather than lifting it. Galaxy
// dust orbits on a fixed sign so one aura reads as one system rather than as
// chaos. Electric holds its fire and bursts, because lightning that arrives on
// a schedule is a hose.
//
// IT NEVER ALLOCATES. The pool is sized once for the loudest thing the emitter
// can become and recycled forever; a dead particle is parked at alpha 0 and
// reused, because adding a child re-uploads the whole static buffer and a rod
// that garbage-collects mid-cast is worse than no rod. Two canvases serve every
// effect on the chart, and the colour is a TINT — which is why a fleet can each
// be on fire in their own colour inside one draw call.

/** A range the emitter samples uniformly. Written as a pair because every one
 *  of these wants jitter: particles that agree with each other read as a
 *  machine rather than as fire. */
type Range = [number, number]

type Spec = {
  /** Particles per second. The biggest knob on how loud a rod is. */
  rate: number
  life: Range
  speed: Range
  /** Emission direction, radians. Screen coordinates, so -PI/2 is UP. */
  angle: number
  /** Half-width of the emission cone; PI is any direction. */
  spread: number
  /** px/sec². Positive falls; embers use a negative one and rise. */
  gravity: number
  /** Per-second velocity retention: 0.02 stops almost at once, 0.9 coasts. */
  drag: number
  size: Range
  colors: number[]
  /** Walk `colors` in order rather than sampling, so consecutive particles
   *  sweep the hue the way the keyframes do. */
  cycle?: boolean
  /** Spawn radius around the tip. A rod is a line, not a point, and sparks that
   *  all come from one pixel look like a leak. */
  scatter?: number
  /** Tangential acceleration, px/sec². Galaxy dust orbits instead of flying. */
  swirl?: number
  /** Stretch along the direction of travel: a spark is an arc, not a dot in a
   *  hurry. */
  streak?: number
  /** Hold, then burst. What makes lightning read as lightning. */
  burst?: { every: number; count: number }
  /** Twinkles use the 4-point star; everything else uses the soft dot. */
  star?: boolean
}

const SPECS: Record<GlowType, Spec> = {
  fire: {
    rate: 26, life: [0.7, 1.5], speed: [12, 34], angle: -Math.PI / 2, spread: 0.5,
    gravity: -26, drag: 0.4, size: [2, 5.5], scatter: 7,
    colors: [0xffd28a, 0xffb066, 0xff7a2a, 0xff4a10],
  },
  sparkle: {
    rate: 0, life: [0.5, 1.1], speed: [6, 20], angle: -Math.PI / 2, spread: Math.PI,
    gravity: 4, drag: 0.3, size: [3, 8], scatter: 16, star: true,
    colors: [0xffffff, 0xfff2c0, 0xffd560, 0xf0c040],
    burst: { every: 1.1, count: 3 },
  },
  electric: {
    rate: 4, life: [0.16, 0.4], speed: [70, 200], angle: -Math.PI / 2, spread: Math.PI,
    gravity: 0, drag: 0.08, size: [1.6, 3.4], scatter: 5, streak: 4.5,
    colors: [0xffffff, 0xc8f0ff, 0x5cc8ff, 0x3fa8ff],
    burst: { every: 0.72, count: 7 },
  },
  moon: {
    rate: 7, life: [1.6, 3.0], speed: [3, 11], angle: -Math.PI / 2, spread: 1.1,
    gravity: -4, drag: 0.6, size: [1.5, 3.5], scatter: 10,
    colors: [0xece0ff, 0xd8c8ff, 0xb89bff, 0xa78bfa],
  },
  tech: {
    rate: 9, life: [0.35, 0.8], speed: [8, 22], angle: -Math.PI / 2, spread: 0.9,
    gravity: 10, drag: 0.25, size: [1, 2.2], scatter: 4,
    colors: [0xbbf7d0, 0x86efac, 0x4ade80, 0x2fbf6e],
  },
  galaxy: {
    rate: 30, life: [1.2, 2.6], speed: [10, 26], angle: -Math.PI / 2, spread: Math.PI,
    gravity: 0, drag: 0.75, size: [1.4, 4], scatter: 13, swirl: 55, star: true,
    colors: [0xffffff, 0xe8dcff, 0xc9b8ff, 0x9b7cff, 0x7c5cff],
  },
  saber: {
    rate: 22, life: [0.4, 0.9], speed: [10, 30], angle: Math.PI / 2, spread: 1.5,
    gravity: 34, drag: 0.35, size: [1.6, 4], scatter: 8,
    colors: [0xffffff, 0xff5566, 0xff3344, 0xe00022],
  },
  forge: {
    rate: 18, life: [0.9, 1.8], speed: [8, 24], angle: -Math.PI / 2, spread: 0.7,
    gravity: -14, drag: 0.45, size: [2, 4.5], scatter: 9,
    colors: [0xecfdf5, 0xa7f3d0, 0x34d399, 0x22c55e],
  },
  prismatic: {
    rate: 34, life: [0.8, 1.6], speed: [14, 40], angle: -Math.PI / 2, spread: Math.PI,
    gravity: -8, drag: 0.5, size: [2, 4.5], scatter: 10, cycle: true,
    colors: [0xf26d6d, 0xf2c14e, 0x57d06a, 0x5aa9f0],
  },
  // Streak 0. Deliberately almost nothing, matching a glow that is not yet
  // charged: the rod should look like it is waiting.
  lockedin: {
    rate: 3, life: [0.8, 1.6], speed: [4, 12], angle: -Math.PI / 2, spread: 1.2,
    gravity: -6, drag: 0.5, size: [1, 2.4], scatter: 6,
    colors: [0xe2e8f4, 0xd6deeb],
  },
}

// The Locked-In Rod's four effects. Its glow escalates on amount as well as
// hue, and so does this: rate, speed and size all climb together, because
// swapping a colour cannot express a rod getting LOUDER and loud is the actual
// mechanic. Stage 3 is meant to be slightly too much — ten perfect catches is
// rare, it is fragile, and the next miss takes it all.
const LOCKED_IN_SPECS: Spec[] = [
  SPECS.lockedin,
  {
    rate: 20, life: [0.6, 1.2], speed: [16, 44], angle: -Math.PI / 2, spread: 1.4,
    gravity: -18, drag: 0.4, size: [1.6, 3.6], scatter: 8,
    colors: [0xa5f3fc, 0x67e8f9, 0x22d3ee, 0x06b6d4],
  },
  {
    rate: 34, life: [0.7, 1.5], speed: [20, 58], angle: -Math.PI / 2, spread: 1.7,
    gravity: -22, drag: 0.42, size: [2, 5], scatter: 10,
    colors: [0xfff1b8, 0xffe08a, 0xf0c040, 0xf0b90b],
  },
  {
    rate: 70, life: [0.7, 1.6], speed: [26, 90], angle: -Math.PI / 2, spread: Math.PI,
    gravity: -26, drag: 0.45, size: [2, 6], scatter: 12, cycle: true, star: true,
    colors: [0x67e8f9, 0x22d3ee, 0xf0c040, 0xf0b90b, 0xe879f9, 0xc084fc],
  },
]

// ── TEXTURES, MADE ONCE FOR THE WHOLE CHART ─────────────────────────────────

let dotTex: Texture | null = null
let starTex: Texture | null = null

function softDot(PIXI: typeof import('pixi.js')): Texture {
  if (dotTex) return dotTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // Weighted to the centre so a particle has a hot core and a soft falloff. A
  // linear ramp reads as a grey blob and no amount of tinting rescues it.
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  dotTex = PIXI.Texture.from(c)
  return dotTex
}

function starDot(PIXI: typeof import('pixi.js')): Texture {
  if (starTex) return starTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // Four tapered points over a small core: the shape an eye reads as "twinkle".
  // Drawn rather than blurred, because a blurred cross loses its points.
  g.translate(S / 2, S / 2)
  g.fillStyle = '#fff'
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.moveTo(0, -S / 2)
    g.quadraticCurveTo(3.5, -6, 0, 0)
    g.quadraticCurveTo(-3.5, -6, 0, -S / 2)
    g.fill()
    g.rotate(Math.PI / 2)
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 10)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = core
  g.beginPath()
  g.arc(0, 0, 10, 0, Math.PI * 2)
  g.fill()
  starTex = PIXI.Texture.from(c)
  return starTex
}

type Live = { p: Particle; vx: number; vy: number; age: number; ttl: number; size: number }

export type RodFx = {
  /** Hang this at the rod's tip. It draws in its own local space. */
  view: Container
  update(dt: number): void
  setStage(stage: number): void
  /** 0 stops emission and lets the tail burn out; 1 is full. The chart turns
   *  this down for distant boats — a captain three screens away does not need
   *  sixty embers, and fill rate is the one thing here that is not free. */
  setIntensity(k: number): void
  destroy(): void
}

const rand = (r: Range) => r[0] + Math.random() * (r[1] - r[0])

export function makeRodFx(
  PIXI: typeof import('pixi.js'),
  glowType: GlowType,
  opts?: { stage?: number },
): RodFx {
  let spec = glowType === 'lockedin'
    ? LOCKED_IN_SPECS[Math.max(0, Math.min(3, opts?.stage ?? 0))]
    : SPECS[glowType]

  const view: Container = new PIXI.Container()
  const layer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  layer.blendMode = 'add'
  view.addChild(layer)

  // A spec's ceiling is its steady rate plus however many bursts can be in the
  // air at once — one every 0.7s with a 0.4s life overlaps not at all, one
  // every 0.2s overlaps twice, and undercounting that makes an effect eat its
  // own oldest sparks mid-flight.
  const ceiling = (s: Spec) =>
    s.rate * s.life[1] + (s.burst ? s.burst.count * Math.ceil(s.life[1] / s.burst.every) : 0)
  const peak = glowType === 'lockedin'
    ? Math.max(...LOCKED_IN_SPECS.map(ceiling))
    : ceiling(spec)
  const CAP = Math.min(280, Math.ceil(peak * 1.4) + 8)

  const wantsStar = glowType === 'lockedin' ? LOCKED_IN_SPECS.some(s => s.star) : !!spec.star
  const tex = wantsStar ? starDot(PIXI) : softDot(PIXI)

  const pool: Live[] = []
  for (let i = 0; i < CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    p.scaleX = p.scaleY = 0
    layer.addParticle(p)
    pool.push({ p, vx: 0, vy: 0, age: 0, ttl: 0, size: 0 })
  }

  let next = 0, carry = 0, sinceBurst = 0, intensity = 1, colorTick = 0

  function spawn(n: number) {
    for (let i = 0; i < n; i++) {
      const s = pool[next]
      next = (next + 1) % CAP
      const a = spec.angle + (Math.random() * 2 - 1) * spec.spread
      const v = rand(spec.speed)
      s.vx = Math.cos(a) * v
      s.vy = Math.sin(a) * v
      s.age = 0
      s.ttl = rand(spec.life)
      s.size = rand(spec.size)
      const r = (spec.scatter ?? 0) * Math.sqrt(Math.random())
      const ra = Math.random() * Math.PI * 2
      s.p.x = Math.cos(ra) * r
      s.p.y = Math.sin(ra) * r
      s.p.tint = spec.cycle
        ? spec.colors[colorTick++ % spec.colors.length]
        : spec.colors[(Math.random() * spec.colors.length) | 0]
      s.p.alpha = 1
    }
  }

  return {
    view,

    update(dt) {
      // A backgrounded tab hands back an enormous dt, and simulating it
      // honestly teleports every particle off the screen at once.
      const d = Math.min(dt, 0.05)

      if (intensity > 0) {
        if (spec.burst) {
          sinceBurst += d
          if (sinceBurst >= spec.burst.every) {
            sinceBurst = 0
            spawn(Math.max(1, Math.round(spec.burst.count * intensity)))
          }
        }
        carry += spec.rate * intensity * d
        const n = Math.floor(carry)
        if (n > 0) { carry -= n; spawn(n) }
      }

      for (const s of pool) {
        if (s.age >= s.ttl) continue
        s.age += d
        if (s.age >= s.ttl) { s.p.alpha = 0; s.p.scaleX = s.p.scaleY = 0; continue }

        if (spec.swirl) {
          // Push perpendicular to the current heading and the path curves. Both
          // components come off the SAME heading — feeding the updated vx into
          // vy's term turns the orbit into a spiral that winds itself up.
          const vx = s.vx, vy = s.vy
          const m = Math.hypot(vx, vy) || 1
          s.vx += (-vy / m) * spec.swirl * d
          s.vy += (vx / m) * spec.swirl * d
        }
        s.vy += spec.gravity * d
        const keep = Math.pow(spec.drag, d)
        s.vx *= keep
        s.vy *= keep
        s.p.x += s.vx * d
        s.p.y += s.vy * d

        const t = s.age / s.ttl
        // Fast in, slow out. A particle that fades linearly reads as a dimmer
        // switch; this one arrives, then lets go.
        s.p.alpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88
        const k = (s.size * (1 - t * 0.55)) / 64
        if (spec.streak) {
          s.p.rotation = Math.atan2(s.vy, s.vx)
          s.p.scaleX = k * spec.streak
          s.p.scaleY = k
        } else {
          s.p.scaleX = s.p.scaleY = k
        }
      }
    },

    setStage(stage) {
      if (glowType !== 'lockedin') return
      const s = LOCKED_IN_SPECS[Math.max(0, Math.min(3, stage))]
      // Live particles keep their old colour and burn out naturally, which is
      // what a stage-up should look like: the cyan you already threw is still
      // in the air while the gold starts coming.
      if (s !== spec) spec = s
    },

    setIntensity(k) { intensity = Math.max(0, Math.min(1, k)) },

    destroy() { view.destroy({ children: true }) },
  }
}
