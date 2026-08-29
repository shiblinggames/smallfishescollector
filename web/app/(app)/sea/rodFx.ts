// ── WHAT THE GOOD RODS LOOK LIKE ────────────────────────────────────────────
//
// Every glowing rod has two things, and they are both built out of THE ROD'S
// OWN SHAPE. Nothing here is a lamp parked near a rod:
//
//   1. ITS GLOW — the rod's silhouette lit up in its own colour, breathing on
//      its own timing. This is what the rods have today. In CSS it is
//      `filter: drop-shadow()` on the rod IMAGE, so the light traces the hilt,
//      the taper, the tip.
//
//   2. ITS EFFECT — what comes off that silhouette. Sparks leave the OUTLINE,
//      along its outward normal; twinkles pop anywhere down the length; the
//      YOLO rod arcs lightning across its own body. A single emitter at the tip
//      is the wrong primitive and reads as a sparkler taped to a stick.
//
// Both are per-rod, and the glow half is a PORT: the keyframes in globals.css
// are transcribed stop for stop, so a Legendary breathes on exactly the 2.0s it
// always did. It should be recognisably the same rod, because it is.
//
// ── THE RADIUS IS IN SCREEN PIXELS, NOT TEXTURE PIXELS ──────────────────────
//
// The thing that makes a ported glow come out limp. CSS resolves
// `drop-shadow(0 0 18px)` AFTER layout, so the blur is 18 pixels of SCREEN. A
// rod texture is several times its on-screen size, so blurring the texture by
// 18 and then scaling the result down by the sprite's scale delivers about four
// screen pixels — the right glow, a fifth of the right size, which reads as
// "much weaker" rather than as a bug.
//
// So the bake happens at the rod's ON-SCREEN size and the glow draws at scale 1.
// Cheaper too: the canvas is a couple of hundred pixels instead of a thousand,
// and a blurred silhouette has no fine detail to lose.
//
// ── AND CHAINED SHADOWS COMPOUND ────────────────────────────────────────────
//
// `filter: drop-shadow(A) drop-shadow(B)` does not paint two independent
// shadows: B blurs the result of A, so it sees a shape that is already bigger
// and already softer, and the halo builds density. Blurring the bare silhouette
// once gives a noticeably thinner glow. `gain` puts that density back by
// compositing the blur onto itself, which is 1-(1-a)^n and lands very close.

import type { Container, Graphics, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'

export type GlowType =
  | 'fire' | 'sparkle' | 'electric' | 'moon' | 'tech'
  | 'galaxy' | 'saber' | 'forge' | 'prismatic' | 'lockedin'

// ════════════════════════════════════════════════════════════════════════════
// PART ONE — THE GLOW, PORTED FROM globals.css
// ════════════════════════════════════════════════════════════════════════════

/** One `drop-shadow(0 0 Rpx COLOR)`. `r` is SCREEN pixels, exactly as written
 *  in the stylesheet. `a` carries the colour's own alpha, which several of the
 *  keyframes lean on (#22d3ee88 and friends). */
type Shadow = { r: number; c: number; a: number }

/** One keyframe. `t` is the CSS percentage over 100. */
type Stop = { t: number; layers: Shadow[] }

type Anim = {
  /** Seconds, straight off the `animation` shorthand. */
  dur: number
  /** CSS `linear`. Everything else here is `ease-in-out`. */
  linear?: boolean
  stops: Stop[]
}

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
  // Millionaire's and Treasure — long calm gold, ONE deliberate twinkle. The
  // narrow 46-54% window is the whole character.
  sparkle: {
    dur: 6.5,
    stops: [
      { t: 0.00, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
      { t: 0.46, layers: [{ r: 10, c: 0xffffff, a: 1 }, { r: 36, c: 0xffd560, a: 1 }] },
      { t: 0.54, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
      { t: 1.00, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
    ],
  },
  // YOLO — cyan base broken by two sharp bursts. Linear, because easing the
  // on-off windows rounds off the edges that make it lightning.
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
  // rod with a core, and the reason the engine takes more than two.
  saber: {
    dur: 2.2,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0xffffff, a: 1 }, { r: 13, c: 0xff3344, a: 1 }, { r: 26, c: 0xe00022, a: 1 }] },
      { t: 0.50, layers: [{ r: 6, c: 0xffffff, a: 1 }, { r: 19, c: 0xff5566, a: 1 }, { r: 36, c: 0xff1133, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0xffffff, a: 1 }, { r: 13, c: 0xff3344, a: 1 }, { r: 26, c: 0xe00022, a: 1 }] },
    ],
  },
  // Banked forge-coals, one flare per cycle.
  forge: {
    dur: 5.5,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
      { t: 0.48, layers: [{ r: 11, c: 0xecfdf5, a: 1 }, { r: 36, c: 0x22c55e, a: 1 }] },
      { t: 0.56, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
    ],
  },
  // Completionist — four energy strands, sweeping. Linear so the rainbow turns
  // at a constant rate instead of pausing on each colour.
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
  // The Locked-In Rod at streak 0. Faint and colour-neutral: the stylesheet's
  // own comment calls it "not yet charged".
  lockedin: {
    dur: 4.2,
    stops: [
      { t: 0.00, layers: [{ r: 1.5, c: 0xd6deeb, a: 0.35 }] },
      { t: 0.50, layers: [{ r: 3, c: 0xe2e8f4, a: 0.5 }] },
      { t: 1.00, layers: [{ r: 1.5, c: 0xd6deeb, a: 0.35 }] },
    ],
  },
}

// The Locked-In Rod's four glows. Its design is "power grows with your live
// perfect streak, one miss drops it to nothing", and the stylesheet already
// escalates all four stages on amount as well as hue — modest cyan, bigger
// gold, biggest prismatic. All four transcribed, so the canvas steps where the
// CSS steps.
const LOCKED_IN_GLOWS: Anim[] = [
  GLOWS.lockedin,
  { // stage 1 — streak 3, faster bites
    dur: 1.6,
    stops: [
      { t: 0.00, layers: [{ r: 4, c: 0x67e8f9, a: 1 }, { r: 16, c: 0x22d3ee, a: 0.53 }] },
      { t: 0.40, layers: [{ r: 8, c: 0xa5f3fc, a: 1 }, { r: 28, c: 0x06b6d4, a: 1 }] },
      { t: 1.00, layers: [{ r: 4, c: 0x67e8f9, a: 1 }, { r: 16, c: 0x22d3ee, a: 0.53 }] },
    ],
  },
  { // stage 2 — streak 5, triple haul
    dur: 1.5,
    stops: [
      { t: 0.00, layers: [{ r: 7, c: 0xffe08a, a: 1 }, { r: 26, c: 0xf0b90b, a: 0.667 }] },
      { t: 0.40, layers: [{ r: 13, c: 0xfff1b8, a: 1 }, { r: 44, c: 0xf0c040, a: 1 }] },
      { t: 1.00, layers: [{ r: 7, c: 0xffe08a, a: 1 }, { r: 26, c: 0xf0b90b, a: 0.667 }] },
    ],
  },
  { // stage 3 — streak 10, LOCKED IN
    dur: 2.0, linear: true,
    stops: [
      { t: 0.00, layers: [{ r: 11, c: 0x67e8f9, a: 1 }, { r: 40, c: 0x22d3ee, a: 0.73 }] },
      { t: 0.33, layers: [{ r: 11, c: 0xf0c040, a: 1 }, { r: 40, c: 0xf0b90b, a: 0.73 }] },
      { t: 0.66, layers: [{ r: 11, c: 0xe879f9, a: 1 }, { r: 40, c: 0xc084fc, a: 0.73 }] },
      { t: 1.00, layers: [{ r: 11, c: 0x67e8f9, a: 1 }, { r: 40, c: 0x22d3ee, a: 0.73 }] },
    ],
  },
]

/** How many times the blur is composited onto itself to reach the density a
 *  CHAIN of drop-shadows builds. See the header. */
const GAIN = 2

const glowBakes = new Map<string, Texture>()

/** Room for the blur's tail. Three standard deviations is where a gaussian
 *  stops mattering and a drop-shadow's stddev is half its radius, so 1.5r plus
 *  slack. */
const padFor = (r: number) => Math.ceil(r * 2) + 2

/**
 * The rod's silhouette, blurred, at the size it will actually be seen.
 *
 * `w`/`h` are the rod's ON-SCREEN size and `r` is the CSS radius in screen
 * pixels, which is the pairing that makes a ported glow the right width.
 */
function bakeGlow(
  PIXI: typeof import('pixi.js'),
  img: CanvasImageSource,
  key: string,
  w: number, h: number, r: number,
): Texture | null {
  const id = `${key}|${Math.round(w)}x${Math.round(h)}|${r}`
  const hit = glowBakes.get(id)
  if (hit) return hit
  if (!w || !h) return null

  const pad = padFor(r)
  const W = Math.ceil(w + pad * 2), H = Math.ceil(h + pad * 2)

  // The rod's alpha, filled flat white — white so a TINT can take this one bake
  // to any colour the timeline asks for, which is how a single canvas serves a
  // rod that cycles through four.
  const cut = document.createElement('canvas')
  cut.width = W; cut.height = H
  const cg = cut.getContext('2d')!
  cg.drawImage(img, pad, pad, w, h)
  cg.globalCompositeOperation = 'source-in'
  cg.fillStyle = '#fff'
  cg.fillRect(0, 0, W, H)

  // `filter: blur()` takes a STANDARD DEVIATION while `drop-shadow()` takes a
  // radius of twice that, so halving here is what makes an 18px shadow in the
  // stylesheet come out 18px wide on the canvas.
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const og = out.getContext('2d')!
  og.filter = `blur(${r / 2}px)`
  og.drawImage(cut, 0, 0)
  og.filter = 'none'
  for (let i = 1; i < GAIN; i++) og.drawImage(out, 0, 0)

  const t = PIXI.Texture.from(out)
  glowBakes.set(id, t)
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

// ════════════════════════════════════════════════════════════════════════════
// PART TWO — THE ROD'S SHAPE
// ════════════════════════════════════════════════════════════════════════════
//
// Where the effects come FROM. Reading the rod's alpha gives two point clouds:
// the outline, which is where sparks leave and lightning attaches, and the
// interior, for anything meant to hang around the rod rather than come off it.
//
// The outline also carries an outward NORMAL per point, from the direction the
// alpha falls away. That is what lets a spark leave the rod perpendicular to
// its own edge instead of everything drifting the same way, and it is most of
// the difference between "the rod is throwing sparks" and "there are sparks
// near a rod".

type Shape = {
  /** x, y, nx, ny per outline point, in TEXTURE pixels. */
  edge: Float32Array
  /** x, y per interior point, in TEXTURE pixels. */
  fill: Float32Array
}

const shapes = new Map<string, Shape>()

function shapeOf(img: HTMLImageElement, key: string): Shape | null {
  const hit = shapes.get(key)
  if (hit) return hit
  const w = img.naturalWidth, h = img.naturalHeight
  if (!w || !h) return null

  // Sampled down: a few thousand candidate points describe a rod perfectly
  // well, and reading a megapixel of alpha to throw most of it away is waste.
  const MAX = 220
  const s = Math.min(1, MAX / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s))
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, cw, ch)
  const data = g.getImageData(0, 0, cw, ch).data

  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= cw || y >= ch ? 0 : data[(y * cw + x) * 4 + 3] / 255
  const IN = 0.35
  // Back to texture pixels, so callers only ever deal in the rod's own space.
  const k = w / cw

  const edge: number[] = []
  const fill: number[] = []
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (at(x, y) < IN) continue
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1)
      if (l < IN || r < IN || u < IN || d < IN) {
        // Outward is the direction the alpha DROPS.
        let nx = l - r, ny = u - d
        const m = Math.hypot(nx, ny)
        if (m < 1e-4) { nx = 0; ny = -1 } else { nx /= m; ny /= m }
        edge.push(x * k, y * k, nx, ny)
      } else {
        fill.push(x * k, y * k)
      }
    }
  }
  if (!edge.length) return null
  const out: Shape = { edge: new Float32Array(edge), fill: new Float32Array(fill.length ? fill : edge.filter((_, i) => i % 4 < 2)) }
  shapes.set(key, out)
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// PART THREE — LIGHTNING
// ════════════════════════════════════════════════════════════════════════════
//
// Particles cannot be lightning. A bolt is a CONNECTED path with a bright core
// and a dim halo that exists for a moment and is gone, and drawing it as a line
// is both more honest and cheaper than pretending with fifty sprites.
//
// Built by midpoint displacement: take the two endpoints, push the middle off
// the line by a random amount, recurse on both halves with the amount halved.
// It is the standard way to get a bolt because it produces the real thing's
// signature — big deviations early, fine jitter late — rather than uniform
// noise, which reads as a wiggly wire.

type Arcs = {
  /** Seconds between strikes. */
  every: [number, number]
  life: [number, number]
  /** How far apart a bolt's ends are, in screen px along the rod. */
  span: [number, number]
  /** Sideways displacement at the first subdivision, screen px. */
  chaos: number
  width: number
  core: number
  halo: number
  /** Chance per bolt of throwing a shorter branch off its middle. */
  fork: number
}

type Bolt = { pts: number[]; forks: number[][]; age: number; ttl: number }

function jag(ax: number, ay: number, bx: number, by: number, chaos: number): number[] {
  let pts = [ax, ay, bx, by]
  for (let depth = 0, amp = chaos; depth < 5; depth++, amp *= 0.55) {
    const next: number[] = [pts[0], pts[1]]
    for (let i = 0; i < pts.length - 2; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3]
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      const dx = x2 - x1, dy = y2 - y1
      const m = Math.hypot(dx, dy) || 1
      const o = (Math.random() * 2 - 1) * amp
      next.push(mx + (-dy / m) * o, my + (dx / m) * o, x2, y2)
    }
    pts = next
  }
  return pts
}

// ════════════════════════════════════════════════════════════════════════════
// PART FOUR — THE PARTICLES
// ════════════════════════════════════════════════════════════════════════════

type Range = [number, number]

type Spec = {
  rate: number
  life: Range
  speed: Range
  /** Base direction, radians. Screen coordinates, so -PI/2 is UP. Blended with
   *  the outline's own normal by `normal`. */
  angle: number
  spread: number
  /** 0 uses `angle` alone; 1 leaves the rod perpendicular to its own edge.
   *  This is what makes sparks belong to the rod. */
  normal: number
  gravity: number
  drag: number
  size: Range
  colors: number[]
  /** Walk `colors` in order rather than sampling, so consecutive particles
   *  sweep the hue the way the keyframes do. */
  cycle?: boolean
  /** Spawn from the outline or from the body. */
  from: 'edge' | 'fill'
  swirl?: number
  /** Stretch along the direction of travel: a spark is an arc, not a dot in a
   *  hurry. */
  streak?: number
  /** Hold, then throw several at once from DIFFERENT points down the rod. */
  burst?: { every: number; count: number }
  star?: boolean
  arcs?: Arcs
}

const SPECS: Record<GlowType, Spec> = {
  // Legendary. Embers leave the whole length and rise, because heat does.
  fire: {
    rate: 34, life: [0.7, 1.5], speed: [14, 38], angle: -Math.PI / 2, spread: 0.5,
    normal: 0.45, gravity: -30, drag: 0.4, size: [2, 5.5], from: 'edge',
    colors: [0xffd28a, 0xffb066, 0xff7a2a, 0xff4a10],
  },

  // Millionaire's and Treasure. Twinkles pop ALL DOWN THE ROD, a few at a time,
  // then nothing — the stylesheet gives this one deliberate peak per cycle, and
  // a steady shower of gold reads as cheap rather than as rich. Barely moving,
  // because a twinkle is a glint on metal and not a projectile.
  sparkle: {
    rate: 0, life: [0.45, 0.95], speed: [1, 6], angle: -Math.PI / 2, spread: Math.PI,
    normal: 0.6, gravity: -2, drag: 0.2, size: [5, 13], from: 'edge', star: true,
    colors: [0xffffff, 0xfff2c0, 0xffd560, 0xf0c040],
    burst: { every: 0.5, count: 3 },
  },

  // YOLO. The rod ARCS: real bolts crawling across its own body, forking, gone
  // in a tenth of a second. The few sparks are what the strikes knock loose.
  electric: {
    rate: 10, life: [0.16, 0.4], speed: [60, 170], angle: -Math.PI / 2, spread: Math.PI,
    normal: 0.85, gravity: 0, drag: 0.08, size: [1.6, 3.4], from: 'edge', streak: 4.5,
    colors: [0xffffff, 0xc8f0ff, 0x5cc8ff, 0x3fa8ff],
    arcs: {
      every: [0.05, 0.30], life: [0.05, 0.13], span: [26, 90], chaos: 9,
      width: 1.5, core: 0xffffff, halo: 0x3fa8ff, fork: 0.55,
    },
  },

  // Moonwood. Slow motes off the rod, barely moving: catching moonlight rather
  // than radiating power.
  moon: {
    rate: 9, life: [1.6, 3.0], speed: [3, 11], angle: -Math.PI / 2, spread: 1.1,
    normal: 0.5, gravity: -4, drag: 0.6, size: [1.5, 3.5], from: 'edge',
    colors: [0xece0ff, 0xd8c8ff, 0xb89bff, 0xa78bfa],
  },

  // Carbon. A precision indicator: tiny blips along the edge, tight and quiet.
  tech: {
    rate: 11, life: [0.35, 0.8], speed: [6, 18], angle: -Math.PI / 2, spread: 0.9,
    normal: 0.7, gravity: 8, drag: 0.25, size: [1, 2.2], from: 'edge',
    colors: [0xbbf7d0, 0x86efac, 0x4ade80, 0x2fbf6e],
  },

  // Galaxy. Dust hangs AROUND the rod rather than leaving it, orbiting on a
  // fixed sign so one aura reads as one system.
  galaxy: {
    rate: 34, life: [1.2, 2.6], speed: [8, 22], angle: -Math.PI / 2, spread: Math.PI,
    normal: 0.3, gravity: 0, drag: 0.75, size: [1.4, 4.5], from: 'fill',
    swirl: 55, star: true,
    colors: [0xffffff, 0xe8dcff, 0xc9b8ff, 0x9b7cff, 0x7c5cff],
  },

  // Lightsaber. Crimson shed off the blade, falling — a blade burns the air
  // rather than lifting it.
  saber: {
    rate: 30, life: [0.4, 0.9], speed: [8, 26], angle: Math.PI / 2, spread: 1.5,
    normal: 0.55, gravity: 34, drag: 0.35, size: [1.6, 4], from: 'edge',
    colors: [0xffffff, 0xff5566, 0xff3344, 0xe00022],
  },

  // Banked coals along the length.
  forge: {
    rate: 22, life: [0.9, 1.8], speed: [8, 24], angle: -Math.PI / 2, spread: 0.7,
    normal: 0.45, gravity: -14, drag: 0.45, size: [2, 4.5], from: 'edge',
    colors: [0xecfdf5, 0xa7f3d0, 0x34d399, 0x22c55e],
  },

  // Completionist. Four strands, so consecutive sparks WALK the four colours
  // rather than sampling them: the stylesheet's sweep, spread along the rod
  // instead of across time.
  prismatic: {
    rate: 40, life: [0.8, 1.6], speed: [12, 34], angle: -Math.PI / 2, spread: Math.PI,
    normal: 0.6, gravity: -8, drag: 0.5, size: [2, 4.5], from: 'edge', cycle: true,
    colors: [0xf26d6d, 0xf2c14e, 0x57d06a, 0x5aa9f0],
  },

  // Streak 0. Deliberately almost nothing, matching a glow that is not yet
  // charged: the rod should look like it is waiting.
  lockedin: {
    rate: 4, life: [0.8, 1.6], speed: [3, 10], angle: -Math.PI / 2, spread: 1.2,
    normal: 0.5, gravity: -6, drag: 0.5, size: [1, 2.4], from: 'edge',
    colors: [0xe2e8f4, 0xd6deeb],
  },
}

// The Locked-In Rod's four effects, escalating on every axis at once — rate,
// speed, size — because swapping a colour cannot express a rod getting LOUDER
// and loud is the actual mechanic. Stage 3 gets its own lightning in all three
// stage colours: ten perfect catches is rare and fragile, and while you hold it
// the rod should be difficult to ignore.
const LOCKED_IN_SPECS: Spec[] = [
  SPECS.lockedin,
  {
    rate: 26, life: [0.6, 1.2], speed: [14, 40], angle: -Math.PI / 2, spread: 1.4,
    normal: 0.7, gravity: -18, drag: 0.4, size: [1.6, 3.6], from: 'edge',
    colors: [0xa5f3fc, 0x67e8f9, 0x22d3ee, 0x06b6d4],
  },
  {
    rate: 44, life: [0.7, 1.5], speed: [18, 54], angle: -Math.PI / 2, spread: 1.7,
    normal: 0.7, gravity: -22, drag: 0.42, size: [2, 5], from: 'edge',
    colors: [0xfff1b8, 0xffe08a, 0xf0c040, 0xf0b90b],
  },
  {
    rate: 85, life: [0.7, 1.6], speed: [24, 84], angle: -Math.PI / 2, spread: Math.PI,
    normal: 0.75, gravity: -26, drag: 0.45, size: [2, 6], from: 'edge',
    cycle: true, star: true,
    colors: [0x67e8f9, 0x22d3ee, 0xf0c040, 0xf0b90b, 0xe879f9, 0xc084fc],
    arcs: {
      every: [0.10, 0.34], life: [0.05, 0.12], span: [24, 80], chaos: 8,
      width: 1.4, core: 0xffffff, halo: 0xc084fc, fork: 0.45,
    },
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

// ════════════════════════════════════════════════════════════════════════════
// THE AURA
// ════════════════════════════════════════════════════════════════════════════

type Live = { p: Particle; vx: number; vy: number; age: number; ttl: number; size: number }

export type RodAura = {
  /** Goes BELOW the rod sprite: the glow, so the rod sits on top of its own
   *  light the way the CSS shadow does. */
  under: Container
  /** Goes ABOVE it: sparks and bolts, so the rod sits INSIDE its effect rather
   *  than in front of it. */
  over: Container
  update(dt: number): void
  /** The Locked-In Rod's live streak stage, 0..3. Ignored by every other rod. */
  setStage(stage: number): void
  /** 0 stops emission and lets the tail burn out; 1 is full. The chart turns
   *  this down for distant boats — fill rate is the one thing here that is not
   *  free. */
  setIntensity(k: number): void
  destroy(): void
}

const rand = (r: Range) => r[0] + Math.random() * (r[1] - r[0])

/**
 * Everything one rod does, built around the rod's own image.
 *
 * `rod` must already be placed: its position, scale, rotation and anchor are
 * read to put the glow exactly on top of it and to map the shape's points into
 * the same space. `image` is the bitmap behind it, which is where both the
 * silhouette and the outline come from.
 */
export function makeRodAura(
  PIXI: typeof import('pixi.js'),
  o: {
    rod: Sprite
    image: HTMLImageElement
    glowType: GlowType
    key: string
    stage?: number
  },
): RodAura {
  const { rod, image, glowType, key } = o
  const stage0 = Math.max(0, Math.min(3, o.stage ?? 0))

  let anim = glowType === 'lockedin' ? LOCKED_IN_GLOWS[stage0] : GLOWS[glowType]
  let spec = glowType === 'lockedin' ? LOCKED_IN_SPECS[stage0] : SPECS[glowType]

  const under: Container = new PIXI.Container()
  const over: Container = new PIXI.Container()

  // ── THE GLOW ──────────────────────────────────────────────────────────────
  //
  // Baked at the rod's ON-SCREEN size, so the CSS radii mean what they say.
  const texW = rod.texture.width, texH = rod.texture.height
  const scr = Math.abs(rod.scale.x)
  const screenW = texW * scr, screenH = texH * Math.abs(rod.scale.y)

  const family = glowType === 'lockedin' ? LOCKED_IN_GLOWS : [GLOWS[glowType]]
  const count = Math.max(...family.map(f => Math.max(...f.stops.map(s => s.layers.length))))
  const pairs: { tight: Sprite; wide: Sprite; lo: number; hi: number }[] = []

  for (let l = 0; l < count; l++) {
    let lo = Infinity, hi = 0
    for (const f of family) for (const s of f.stops) {
      const sh = s.layers[l]
      if (!sh) continue
      lo = Math.min(lo, sh.r); hi = Math.max(hi, sh.r)
    }
    if (!Number.isFinite(lo)) continue
    // Two bakes and a crossfade — the tightest and the widest this shadow ever
    // gets. One bake would leave a rod that breathes 4px to 32px either always
    // fat or always thin; two costs a sprite and gets the swell back.
    const tt = bakeGlow(PIXI, image, key, screenW, screenH, lo)
    const wt = bakeGlow(PIXI, image, key, screenW, screenH, hi)
    if (!tt || !wt) continue
    const mk = (t: Texture, r: number) => {
      const s: Sprite = new PIXI.Sprite(t)
      const pad = padFor(r)
      // The rod's own anchor, re-expressed in the padded texture. The rod is
      // anchored bottom-right, and a glow anchored anywhere else slides off the
      // tip as the rod turns.
      s.anchor.set((pad + rod.anchor.x * screenW) / (screenW + pad * 2),
                   (pad + rod.anchor.y * screenH) / (screenH + pad * 2))
      // Scale 1: the bake is ALREADY in screen pixels. This is the line that
      // was quietly shrinking every glow.
      s.position.set(rod.x, rod.y)
      s.rotation = rod.rotation
      // Additive, because this is LIGHT: where the core and the halo overlap
      // they get brighter, which is what makes a lit thing look lit.
      s.blendMode = 'add'
      s.alpha = 0
      return s
    }
    const tight = mk(tt, lo), wide = mk(wt, hi)
    pairs.push({ tight, wide, lo, hi })
    under.addChild(tight, wide)
  }

  const shadows: Shadow[] = Array.from({ length: count }, () => ({ r: 1, c: 0xffffff, a: 0 }))

  // ── THE SHAPE, IN THE SKIFF'S SPACE ───────────────────────────────────────
  //
  // Transformed once. The rod does not move relative to the captain, so doing
  // this per particle would be the same arithmetic sixty times a second for an
  // answer that never changes.
  const shape = shapeOf(image, key)
  const cos = Math.cos(rod.rotation), sin = Math.sin(rod.rotation)
  const ax = rod.anchor.x * texW, ay = rod.anchor.y * texH
  const toLocal = (px: number, py: number) => {
    const dx = (px - ax) * rod.scale.x, dy = (py - ay) * rod.scale.y
    return { x: rod.x + dx * cos - dy * sin, y: rod.y + dx * sin + dy * cos }
  }

  let edgePts: Float32Array = new Float32Array(0)   // x, y, nx, ny
  let fillPts: Float32Array = new Float32Array(0)   // x, y
  if (shape) {
    edgePts = new Float32Array(shape.edge.length)
    for (let i = 0; i < shape.edge.length; i += 4) {
      const p = toLocal(shape.edge[i], shape.edge[i + 1])
      const nx = shape.edge[i + 2], ny = shape.edge[i + 3]
      edgePts[i] = p.x; edgePts[i + 1] = p.y
      // The normal turns with the rod but is not scaled: it is a direction.
      edgePts[i + 2] = nx * cos - ny * sin
      edgePts[i + 3] = nx * sin + ny * cos
    }
    fillPts = new Float32Array(shape.fill.length)
    for (let i = 0; i < shape.fill.length; i += 2) {
      const p = toLocal(shape.fill[i], shape.fill[i + 1])
      fillPts[i] = p.x; fillPts[i + 1] = p.y
    }
  }

  // ── THE PARTICLES ─────────────────────────────────────────────────────────
  const layer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  layer.blendMode = 'add'
  over.addChild(layer)

  // A spec's ceiling is its steady rate plus however many bursts can be in the
  // air at once — one every 0.7s with a 0.4s life overlaps not at all, one
  // every 0.2s overlaps twice, and undercounting that makes an effect eat its
  // own oldest sparks mid-flight.
  const ceiling = (s: Spec) =>
    s.rate * s.life[1] + (s.burst ? s.burst.count * Math.ceil(s.life[1] / s.burst.every) : 0)
  const peak = glowType === 'lockedin'
    ? Math.max(...LOCKED_IN_SPECS.map(ceiling))
    : ceiling(spec)
  const CAP = Math.min(320, Math.ceil(peak * 1.4) + 8)

  const wantsStar = glowType === 'lockedin' ? LOCKED_IN_SPECS.some(s => s.star) : !!spec.star
  const ptex = wantsStar ? starDot(PIXI) : softDot(PIXI)

  const pool: Live[] = []
  for (let i = 0; i < CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: ptex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    p.scaleX = p.scaleY = 0
    layer.addParticle(p)
    pool.push({ p, vx: 0, vy: 0, age: 0, ttl: 0, size: 0 })
  }

  let next = 0, carry = 0, sinceBurst = 0, intensity = 1, colorTick = 0

  function spawn(n: number) {
    const edges = edgePts.length / 4, fills = fillPts.length / 2
    if (!edges) return
    for (let i = 0; i < n; i++) {
      const s = pool[next]
      next = (next + 1) % CAP

      // FROM A POINT ON THE ROD, not from one spot. This is the whole idea:
      // pick somewhere on the outline (or in the body) and leave from there.
      let px: number, py: number, nx = 0, ny = -1
      if (spec.from === 'fill' && fills) {
        const j = ((Math.random() * fills) | 0) * 2
        px = fillPts[j]; py = fillPts[j + 1]
      } else {
        const j = ((Math.random() * edges) | 0) * 4
        px = edgePts[j]; py = edgePts[j + 1]
        nx = edgePts[j + 2]; ny = edgePts[j + 3]
      }

      // Direction: the spec's own bias, turned toward the rod's outward normal.
      // At normal = 1 a spark leaves perpendicular to the edge it came off.
      const bx = Math.cos(spec.angle), by = Math.sin(spec.angle)
      let dx = bx + (nx - bx) * spec.normal
      let dy = by + (ny - by) * spec.normal
      const dm = Math.hypot(dx, dy) || 1
      dx /= dm; dy /= dm
      const a = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * spec.spread
      const v = rand(spec.speed)

      s.vx = Math.cos(a) * v
      s.vy = Math.sin(a) * v
      s.age = 0
      s.ttl = rand(spec.life)
      s.size = rand(spec.size)
      s.p.x = px
      s.p.y = py
      s.p.tint = spec.cycle
        ? spec.colors[colorTick++ % spec.colors.length]
        : spec.colors[(Math.random() * spec.colors.length) | 0]
      s.p.alpha = 1
    }
  }

  // ── THE BOLTS ─────────────────────────────────────────────────────────────
  const arcG: Graphics | null = spec.arcs || (glowType === 'lockedin')
    ? new PIXI.Graphics() : null
  if (arcG) { arcG.blendMode = 'add'; over.addChild(arcG) }
  const bolts: Bolt[] = []
  let nextBolt = 0

  function strike(a: Arcs) {
    const edges = edgePts.length / 4
    if (edges < 2) return
    // Two points on the rod, roughly the right distance apart, so the bolt
    // crawls ALONG the body instead of jumping from end to end.
    const i = ((Math.random() * edges) | 0) * 4
    const x1 = edgePts[i], y1 = edgePts[i + 1]
    const want = rand(a.span)
    let x2 = x1, y2 = y1, best = Infinity
    for (let t = 0; t < 12; t++) {
      const j = ((Math.random() * edges) | 0) * 4
      const d = Math.hypot(edgePts[j] - x1, edgePts[j + 1] - y1)
      const err = Math.abs(d - want)
      if (err < best) { best = err; x2 = edgePts[j]; y2 = edgePts[j + 1] }
    }
    const pts = jag(x1, y1, x2, y2, a.chaos)
    const forks: number[][] = []
    if (Math.random() < a.fork) {
      // A branch off the middle, going somewhere the main bolt is not.
      const m = (pts.length / 2 / 2 | 0) * 2
      const ang = Math.random() * Math.PI * 2
      const len = rand(a.span) * 0.45
      forks.push(jag(pts[m], pts[m + 1],
        pts[m] + Math.cos(ang) * len, pts[m + 1] + Math.sin(ang) * len, a.chaos * 0.6))
    }
    bolts.push({ pts, forks, age: 0, ttl: rand(a.life) })
  }

  function drawBolts(a: Arcs) {
    if (!arcG) return
    arcG.clear()
    for (const b of bolts) {
      // Bolts do not fade out so much as cut out; a long fade reads as a wire
      // cooling rather than as a strike ending.
      const k = 1 - Math.pow(b.age / b.ttl, 2)
      const paths = [b.pts, ...b.forks]
      for (const p of paths) {
        arcG.moveTo(p[0], p[1])
        for (let i = 2; i < p.length; i += 2) arcG.lineTo(p[i], p[i + 1])
        // The halo first and wide, then the core thin and white on top: that
        // pairing is what separates lightning from a blue line.
        arcG.stroke({ width: a.width * 4, color: a.halo, alpha: 0.28 * k })
        arcG.moveTo(p[0], p[1])
        for (let i = 2; i < p.length; i += 2) arcG.lineTo(p[i], p[i + 1])
        arcG.stroke({ width: a.width, color: a.core, alpha: k })
      }
    }
  }

  let clock = 0

  return {
    under,
    over,

    update(dt) {
      // A backgrounded tab hands back an enormous dt, and simulating it
      // honestly teleports every particle off the screen at once.
      const d = Math.min(dt, 0.05)
      clock += d

      // ── the glow breathes ──
      const phase = (clock % anim.dur) / anim.dur
      sample(anim, phase, shadows)
      for (let l = 0; l < pairs.length; l++) {
        const p = pairs[l], sh = shadows[l]
        const u = p.hi > p.lo ? Math.max(0, Math.min(1, (sh.r - p.lo) / (p.hi - p.lo))) : 1
        const a = sh.a * intensity
        p.tight.tint = sh.c; p.wide.tint = sh.c
        p.tight.alpha = a * (1 - u)
        p.wide.alpha = a * u
      }

      // ── the rod emits ──
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

      // ── the rod arcs ──
      if (arcG) {
        const a = spec.arcs
        if (!a) { if (bolts.length) { bolts.length = 0; arcG.clear() } }
        else {
          nextBolt -= d * intensity
          if (nextBolt <= 0) { strike(a); nextBolt = rand(a.every) }
          for (let i = bolts.length - 1; i >= 0; i--) {
            bolts[i].age += d
            if (bolts[i].age >= bolts[i].ttl) bolts.splice(i, 1)
          }
          drawBolts(a)
        }
      }
    },

    setStage(stage) {
      if (glowType !== 'lockedin') return
      const s = Math.max(0, Math.min(3, stage))
      if (LOCKED_IN_SPECS[s] === spec) return
      // The phase restarts on the glow, which is right: a stage-up is a new
      // state, and resuming mid-breath at a different amplitude reads as a
      // glitch. Live particles keep their old colour and burn out naturally, so
      // the cyan you already threw is still in the air while the gold starts.
      anim = LOCKED_IN_GLOWS[s]
      spec = LOCKED_IN_SPECS[s]
      clock = 0
    },

    setIntensity(k) { intensity = Math.max(0, Math.min(1, k)) },

    destroy() {
      // The bakes and the two particle canvases are shared and deliberately
      // outlive this.
      under.destroy({ children: true })
      over.destroy({ children: true })
    },
  }
}
