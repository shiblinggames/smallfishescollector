// ── THE AURA ENGINE ─────────────────────────────────────────────────────────
//
// Draws what a piece of equipped gear does, built out of THE GEAR'S OWN SHAPE.
// Nothing here is a lamp parked next to a thing:
//
//   1. ITS GLOW — the part's silhouette lit up in its own colour, breathing on
//      its own timing. In CSS this is `filter: drop-shadow()` on the part's
//      IMAGE, so the light traces the hilt, the taper, the gunwale.
//
//   2. ITS EFFECT — what comes off that silhouette. Sparks leave the OUTLINE
//      along its outward normal; twinkles pop anywhere on it; the YOLO rod arcs
//      lightning across its own body. A single emitter at one point is the
//      wrong primitive and reads as a sparkler taped to a stick.
//
// The rows live in auraSpecs.ts. This file knows how to draw them and nothing
// about which rod is which.
//
// ── THE RADIUS IS IN SCREEN PIXELS, NOT TEXTURE PIXELS ──────────────────────
//
// The thing that makes a ported glow come out limp. CSS resolves
// `drop-shadow(0 0 18px)` AFTER layout, so the blur is 18 pixels of SCREEN. A
// source texture is several times its on-screen size, so blurring the texture
// by 18 and then scaling the result down by the sprite's scale delivers about
// four screen pixels — the right glow, a fifth of the right size, which reads
// as "much weaker" rather than as a bug.
//
// So the bake happens at the part's ON-SCREEN size and the glow draws at
// scale 1. Cheaper too: the canvas is a couple of hundred pixels instead of a
// thousand, and a blurred silhouette has no fine detail to lose.
//
// ── AND CHAINED SHADOWS COMPOUND ────────────────────────────────────────────
//
// `filter: drop-shadow(A) drop-shadow(B)` does not paint two independent
// shadows: B blurs the result of A, so it sees a shape that is already bigger
// and already softer, and the halo builds density. Blurring the bare silhouette
// once gives a noticeably thinner glow. `GAIN` puts that density back by
// compositing the blur onto itself, which is 1-(1-a)^n and lands very close.

import type { Container, Graphics, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'
import {
  effect as effectRow, LOCKED_IN_STAGES,
  type Arcs, type Anim, type Effect, type EffectName, type Range, type Shadow, type Spec,
} from './auraSpecs'

export type { EffectName } from './auraSpecs'
export { rodEffect, hookEffect, hullEffect } from './auraSpecs'

/** How many times the blur is composited onto itself to reach the density a
 *  CHAIN of drop-shadows builds. See the header. */
const GAIN = 2

const glowBakes = new Map<string, Texture>()

/** Room for the blur's tail. Three standard deviations is where a gaussian
 *  stops mattering and a drop-shadow's stddev is half its radius, so 1.5r plus
 *  slack. */
const padFor = (r: number) => Math.ceil(r * 2) + 2

/**
 * The part's blurred silhouette, plus the padding around it.
 *
 * Exported because a drop SHADOW is the same operation as a drop shadow used as
 * a glow: blur the alpha, paint it flat, put it behind. The captain's own
 * `drop-shadow(0 12px 18px ...)` is one of these, tinted black and offset, and
 * writing a second blur for it would be two things to keep in agreement.
 */
export function bakeSilhouette(
  PIXI: typeof import('pixi.js'),
  img: CanvasImageSource,
  key: string,
  w: number, h: number, r: number,
): { texture: Texture; pad: number } | null {
  const t = bakeGlow(PIXI, img, key, w, h, r)
  return t ? { texture: t, pad: padFor(r) } : null
}

/**
 * The part's silhouette, blurred, at the size it will actually be seen.
 *
 * `w`/`h` are the part's ON-SCREEN size and `r` is the CSS radius in screen
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

  // The part's alpha, filled flat white — white so a TINT can take this one
  // bake to any colour the timeline asks for, which is how a single canvas
  // serves a rod that cycles through four.
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

// ── THE PART'S SHAPE ────────────────────────────────────────────────────────
//
// Where the effects come FROM. Reading the alpha gives two point clouds: the
// outline, which is where sparks leave and lightning attaches, and the
// interior, for anything meant to hang around the part rather than come off it.
//
// The outline also carries an outward NORMAL per point, from the direction the
// alpha falls away. That is what lets a spark leave perpendicular to the edge
// it came off instead of everything drifting the same way, and it is most of
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

  // Sampled down: a few thousand candidate points describe a shape perfectly
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
  // Back to texture pixels, so callers only ever deal in the part's own space.
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
  // A shape thin enough to be all outline (a hook, a line) has no interior;
  // falling back to the outline is better than an effect that emits nothing.
  const interior = fill.length ? new Float32Array(fill) : null
  const out: Shape = {
    edge: new Float32Array(edge),
    fill: interior ?? new Float32Array(edge.filter((_, i) => i % 4 < 2)),
  }
  shapes.set(key, out)
  return out
}

// ── LIGHTNING ───────────────────────────────────────────────────────────────
//
// Particles cannot be lightning. A bolt is a CONNECTED path with a bright core
// and a dim halo that exists for a moment and is gone, and drawing it as a line
// is both more honest and cheaper than pretending with fifty sprites.
//
// Built by midpoint displacement: take the two endpoints, push the middle off
// the line by a random amount, recurse on both halves with the amount halved.
// It is the standard construction because it produces the real thing's
// signature — big deviations early, fine jitter late — rather than uniform
// noise, which reads as a wiggly wire.

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

export type Aura = {
  /** Goes BELOW the part: the glow, so the part sits on top of its own light
   *  the way the CSS shadow does. */
  under: Container
  /** Goes ABOVE it: sparks and bolts, so the part sits INSIDE its effect rather
   *  than in front of it. */
  over: Container
  update(dt: number): void
  /** Follow the part into a new pose. Rest, wait and cast are three different
   *  PICTURES at three different angles and sizes, so the silhouette to blur
   *  and the outline to throw sparks off both change — an aura that does not
   *  follow ends up glowing at where the part used to be. Cheap on a pose it
   *  has seen before: the bakes and the point cloud are cached per image. */
  setPose(image: HTMLImageElement, key: string): void
  /** The Locked-In Rod's live streak stage, 0..3. Ignored by everything else. */
  setStage(stage: number): void
  /** 0 stops emission and lets the tail burn out; 1 is full. The chart turns
   *  this down for distant boats — fill rate is the one thing here that is not
   *  free. */
  setIntensity(k: number): void
  destroy(): void
}

const rand = (r: Range) => r[0] + Math.random() * (r[1] - r[0])

/**
 * Everything one piece of gear does, built around its own image.
 *
 * `part` must already be placed: its position, scale, rotation and anchor are
 * read to put the glow exactly on top of it and to map the shape's points into
 * the same space. `image` is the bitmap behind it, which is where both the
 * silhouette and the outline come from.
 */
export function makeAura(
  PIXI: typeof import('pixi.js'),
  o: {
    part: Sprite
    image: HTMLImageElement
    name: EffectName
    key: string
    /** Only the Locked-In Rod has stages; everything else ignores this. */
    staged?: boolean
    stage?: number
  },
): Aura {
  const { part, image, name, key } = o
  const staged = !!o.staged
  const stage0 = Math.max(0, Math.min(3, o.stage ?? 0))

  let row: Effect = staged ? LOCKED_IN_STAGES[stage0] : effectRow(name)
  let anim: Anim = row.glow
  let spec: Spec = row.spec

  const under: Container = new PIXI.Container()
  const over: Container = new PIXI.Container()

  // A STANDING TINT ON THE PART ITSELF. Charcoal's whole identity is a constant
  // brightness(0.58) baked into every keyframe so the sprite reads as deep
  // charcoal rather than plain grey; that is not an animation, it is what the
  // hull looks like.
  if (row.darken) part.tint = row.darken

  // ── HOW WIDE EACH SHADOW EVER GETS ────────────────────────────────────────
  //
  // Measured across the WHOLE family rather than the current stage, because the
  // Locked-In Rod can reach stage 3 mid-cast and that is not the moment to
  // start blurring canvases.
  const family: Effect[] = staged ? LOCKED_IN_STAGES : [row]
  const count = Math.max(...family.map(f => Math.max(...f.glow.stops.map(s => s.layers.length))))
  const pairs: { tight: Sprite; wide: Sprite; lo: number; hi: number }[] = []

  for (let l = 0; l < count; l++) {
    let lo = Infinity, hi = 0
    for (const f of family) for (const s of f.glow.stops) {
      const sh = s.layers[l]
      if (!sh) continue
      lo = Math.min(lo, sh.r); hi = Math.max(hi, sh.r)
    }
    if (!Number.isFinite(lo)) continue
    // Two sprites and a crossfade — the tightest and the widest this shadow
    // ever gets. One bake would leave a rod that breathes 4px to 32px either
    // always fat or always thin; two costs a sprite and gets the swell back.
    // They start empty and are filled by the pose.
    const tight: Sprite = new PIXI.Sprite()
    const wide: Sprite = new PIXI.Sprite()
    for (const s of [tight, wide]) {
      // Light by default: where a core and a halo overlap they get brighter,
      // which is what makes a lit thing look lit rather than stickered. Smoke
      // is the exception — adding a dark colour to a scene brightens nothing,
      // so an additive ash aura is an invisible one.
      s.blendMode = row.glowBlend ?? 'add'
      s.alpha = 0
      s.visible = false
      under.addChild(s)
    }
    pairs.push({ tight, wide, lo, hi })
  }

  const shadows: Shadow[] = Array.from({ length: count }, () => ({ r: 1, c: 0xffffff, a: 0 }))

  let edgePts: Float32Array = new Float32Array(0)   // x, y, nx, ny
  let fillPts: Float32Array = new Float32Array(0)   // x, y
  let baseY = part.y

  /**
   * Point the whole aura at one pose of the part.
   *
   * Rest, wait and cast are three different pictures at three different angles
   * and sizes, so BOTH halves have to be redone: a different silhouette to
   * blur, and a different outline to throw sparks off. Everything expensive in
   * here is cached by image, so the second time through a pose is arithmetic.
   *
   * Reads the part sprite's CURRENT state, so the caller's only obligation is
   * to place the part before calling.
   */
  function applyPose(img: HTMLImageElement, k: string) {
    const texW = part.texture.width, texH = part.texture.height
    // Baked at the part's ON-SCREEN size, so the CSS radii mean what they say.
    const screenW = texW * Math.abs(part.scale.x)
    const screenH = texH * Math.abs(part.scale.y)
    baseY = part.y

    for (const p of pairs) {
      const set = (s: Sprite, t: Texture | null, r: number) => {
        if (!t) { s.visible = false; return }
        s.visible = true
        s.texture = t
        const pad = padFor(r)
        // The part's own anchor, re-expressed in the padded texture. A rod is
        // anchored bottom-right, and a glow anchored anywhere else slides off
        // the tip as the rod turns — which it does, hard, on the cast.
        s.anchor.set((pad + part.anchor.x * screenW) / (screenW + pad * 2),
                     (pad + part.anchor.y * screenH) / (screenH + pad * 2))
        // Scale 1: the bake is ALREADY in screen pixels. This is the line that
        // was quietly shrinking every glow.
        s.scale.set(1, 1)
        s.position.set(part.x, part.y)
        s.rotation = part.rotation
      }
      set(p.tight, bakeGlow(PIXI, img, k, screenW, screenH, p.lo), p.lo)
      set(p.wide, bakeGlow(PIXI, img, k, screenW, screenH, p.hi), p.hi)
    }

    // ── THE SHAPE, IN THE SKIFF'S SPACE ─────────────────────────────────────
    //
    // Transformed once per pose. The part does not move relative to the captain
    // between poses, so doing this per particle would be the same arithmetic
    // sixty times a second for an answer that does not change.
    const shape = shapeOf(img, k)
    if (!shape) { edgePts = new Float32Array(0); fillPts = new Float32Array(0); return }
    const cos = Math.cos(part.rotation), sin = Math.sin(part.rotation)
    const ax = part.anchor.x * texW, ay = part.anchor.y * texH
    const toLocal = (px: number, py: number) => {
      const dx = (px - ax) * part.scale.x, dy = (py - ay) * part.scale.y
      return { x: part.x + dx * cos - dy * sin, y: part.y + dx * sin + dy * cos }
    }

    edgePts = new Float32Array(shape.edge.length)
    for (let i = 0; i < shape.edge.length; i += 4) {
      const p = toLocal(shape.edge[i], shape.edge[i + 1])
      const nx = shape.edge[i + 2], ny = shape.edge[i + 3]
      edgePts[i] = p.x; edgePts[i + 1] = p.y
      // The normal turns with the part but is not scaled: it is a direction.
      edgePts[i + 2] = nx * cos - ny * sin
      edgePts[i + 3] = nx * sin + ny * cos
    }
    fillPts = new Float32Array(shape.fill.length)
    for (let i = 0; i < shape.fill.length; i += 2) {
      const p = toLocal(shape.fill[i], shape.fill[i + 1])
      fillPts[i] = p.x; fillPts[i + 1] = p.y
    }
  }

  applyPose(image, key)

  // ── THE PARTICLES ─────────────────────────────────────────────────────────
  const layer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  layer.blendMode = spec.blend ?? 'add'
  over.addChild(layer)

  // A spec's ceiling is its steady rate plus however many bursts can be in the
  // air at once — one every 0.7s with a 0.4s life overlaps not at all, one
  // every 0.2s overlaps twice, and undercounting that makes an effect eat its
  // own oldest sparks mid-flight.
  const ceiling = (s: Spec) =>
    s.rate * s.life[1] + (s.burst ? s.burst.count * Math.ceil(s.life[1] / s.burst.every) : 0)
  const peak = staged ? Math.max(...LOCKED_IN_STAGES.map(f => ceiling(f.spec))) : ceiling(spec)
  const CAP = Math.min(320, Math.ceil(peak * 1.4) + 8)

  const wantsStar = staged ? LOCKED_IN_STAGES.some(f => f.spec.star) : !!spec.star
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

      // FROM A POINT ON THE PART, not from one spot. This is the whole idea:
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

      // Direction: the spec's own bias, turned toward the outward normal. At
      // normal = 1 a spark leaves perpendicular to the edge it came off.
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
  const canArc = staged ? LOCKED_IN_STAGES.some(f => f.spec.arcs) : !!spec.arcs
  const arcG: Graphics | null = canArc ? new PIXI.Graphics() : null
  if (arcG) { arcG.blendMode = 'add'; over.addChild(arcG) }
  const bolts: Bolt[] = []
  let nextBolt = 0

  function strike(a: Arcs) {
    const edges = edgePts.length / 4
    if (edges < 2) return
    // Two points on the part, roughly the right distance apart, so the bolt
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
      for (const p of [b.pts, ...b.forks]) {
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

      // ── the hull rides ──
      // Ethereal lifts on its own timing in CSS, via a second animation on the
      // same element. The glow rides with it, or the light stays behind.
      if (row.bob) {
        const dy = -row.bob.px * (0.5 - 0.5 * Math.cos((clock / row.bob.dur) * Math.PI * 2))
        part.y = baseY + dy
        for (const p of pairs) { p.tight.y = baseY + dy; p.wide.y = baseY + dy }
      }

      // ── the part emits ──
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

      // ── the part arcs ──
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

    setPose(img, k) {
      applyPose(img, k)
      // Bolts are attached to points on the OLD outline, so they would hang in
      // the air pointing at a part that has moved. A strike lasts a tenth of a
      // second; dropping them is what a cut looks like anyway.
      if (bolts.length) { bolts.length = 0; arcG?.clear() }
    },

    setStage(stage) {
      if (!staged) return
      const s = Math.max(0, Math.min(3, stage))
      if (LOCKED_IN_STAGES[s] === row) return
      // The phase restarts, which is right: a stage-up is a new state, and
      // resuming mid-breath at a different amplitude reads as a glitch. Live
      // particles keep their old colour and burn out naturally, so the cyan you
      // already threw is still in the air while the gold starts coming.
      row = LOCKED_IN_STAGES[s]
      anim = row.glow
      spec = row.spec
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
