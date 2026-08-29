// ── WHAT A HULL LEAVES BEHIND ───────────────────────────────────────────────
//
// The DOM wake is 44 divs, and every idea in it is right: marks laid in PAIRS
// so there is a V, turned to the heading they were laid at, sliding outward on
// an ease-out so the water leaves the hull fast and then settles, laid in WORLD
// space so each stays where the hull left it. None of that changes here.
//
// What changes is that 44 was never a choice, it was a budget. A wake wants to
// be a continuous disturbance and 22 pairs over nearly two seconds is one mark
// every 95ms, which at speed is a mark every forty pixels — so you see the
// marks. Particles cost a fraction of a composited div, so the same trail is
// laid three times as often and stops being dots.
//
// Two things that budget also ruled out, and which are most of why it read as
// cheap:
//
//   TURBULENCE. Every mark spread by exactly the same eased curve, so the two
//   lines were mathematically perfect. Real disturbed water is ragged at the
//   edges; a per-mark wobble in angle and spread is what stops the V looking
//   like it was drawn with a compass.
//
//   CHURN. A hull does not only push water aside, it BOILS it at the stern.
//   That is the bright, short-lived, disorderly part right behind the boat, and
//   without it the V starts from nothing and reads as two lines rather than as
//   something a boat is doing.
//
// ── AND EVERY HULL KEEPS ITS OWN CHARACTER ──────────────────────────────────
//
// The stylesheet gives six hulls a wake of their own and each one is a real
// idea: gold has a bright core, ember is hot spots breaking up rather than a
// clean trail, frost is a narrow hard CRACK that deliberately does not look
// like foam, void goes DARKER than the sea because a black hull leaving a white
// streak reads as a mistake, ash is shapeless smoke dispersing, spirit is the
// longest and the only one that leaves light behind it. All six are rows below,
// with the shapes redrawn rather than approximated.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'

export type WakeKind = 'plain' | 'gold' | 'ember' | 'frost' | 'void' | 'ash' | 'spirit'

type Shape = 'streak' | 'ember' | 'crack' | 'smoke'

type Style = {
  shape: Shape
  /** Sampled per mark. */
  colors: number[]
  /** Foam and smoke sit ON the water; embers and spirit-light come OUT of it.
   *  Void is the one that must be normal, since adding darkness adds nothing. */
  blend: 'add' | 'normal'
  /** Peak alpha for one mark, before age and force. */
  alpha: number
  /** Base size in world px, along the heading and across it. */
  along: number
  across: number
  /** Milliseconds. Embers do not last; spirit-light does. */
  life: number
  /** Multiplier on the V's width. */
  spread: number
  /** How much disorder rides behind the hull, 0 for none. */
  churn: number
}

// The numbers come off .sea-wake and its variants: the sizes are the CSS
// width/height, the colours are the gradient stops, and the lives are tuned
// against the 1900ms the DOM pool was sized for.
const STYLES: Record<WakeKind, Style> = {
  plain: {
    shape: 'streak', blend: 'normal', colors: [0xecfaff, 0xe2f4fa],
    alpha: 0.42, along: 76, across: 26, life: 1900, spread: 1, churn: 1,
  },
  // Golden — a bright core inside a warm trail.
  gold: {
    shape: 'streak', blend: 'add', colors: [0xfff8d6, 0xffecb2, 0xf0c040],
    alpha: 0.34, along: 88, across: 21, life: 1900, spread: 1, churn: 0.9,
  },
  // Fire — embers dropping off the hull and going out. Short, and the shape
  // breaks up on purpose rather than trailing cleanly.
  ember: {
    shape: 'ember', blend: 'add', colors: [0xffeec4, 0xffbe6e, 0xff9628, 0xff5a14],
    alpha: 0.5, along: 64, across: 30, life: 1150, spread: 0.85, churn: 1.4,
  },
  // Ice — a crack rather than a swell. The one that does not look like foam.
  frost: {
    shape: 'crack', blend: 'normal', colors: [0xf0fdff, 0xb0ecfc, 0x78cee8],
    alpha: 0.5, along: 96, across: 14, life: 2100, spread: 0.8, churn: 0.4,
  },
  // Jet Black — a hole dragged along rather than water pushed aside.
  void: {
    shape: 'smoke', blend: 'normal', colors: [0x0a0c12, 0x0e1018, 0x96a0b8],
    alpha: 0.34, along: 104, across: 38, life: 2000, spread: 1.05, churn: 0.7,
  },
  // Charcoal and Abyssal — smoke on the water, dispersing rather than
  // dissolving, and deliberately the least defined of the set.
  ash: {
    shape: 'smoke', blend: 'normal', colors: [0xdedee6, 0x8c8c98, 0x60606c],
    alpha: 0.28, along: 92, across: 34, life: 2300, spread: 1.1, churn: 0.8,
  },
  // Ethereal — the longest, and the only one that keeps light behind it.
  spirit: {
    shape: 'streak', blend: 'add', colors: [0xfcfaff, 0xd6c6ff, 0xa892ff],
    alpha: 0.34, along: 112, across: 26, life: 2400, spread: 1, churn: 1.1,
  },
}

// ── THE SHAPES ──────────────────────────────────────────────────────────────
//
// Drawn white so one canvas per shape serves every hull that uses it; the
// colour is a tint, which is free.

const shapeTex = new Map<Shape, Texture>()

function textureFor(PIXI: typeof import('pixi.js'), shape: Shape): Texture {
  const hit = shapeTex.get(shape)
  if (hit) return hit
  const W = 128, H = 64
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!

  const ell = (cx: number, cy: number, rx: number, ry: number, stops: [number, number][]) => {
    g.save()
    g.translate(cx, cy)
    g.scale(rx, ry)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`)
    g.fillStyle = grad
    g.beginPath()
    g.arc(0, 0, 1, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  if (shape === 'streak') {
    // radial-gradient(ellipse 62% 100% at 38% 50%): denser down the middle than
    // at the ends, so the near edge reads as foam and the tail dissolves.
    ell(W * 0.38, H / 2, W * 0.62, H / 2, [[0, 0.72], [0.46, 0.34], [0.76, 0]])
  } else if (shape === 'ember') {
    // Three hot spots at different sizes rather than one smooth gradient.
    ell(W * 0.38, H / 2, W * 0.62, H / 2, [[0, 0.26], [0.74, 0]])
    ell(W * 0.26, H * 0.44, W * 0.17, H * 0.34, [[0, 0.92], [1, 0]])
    ell(W * 0.52, H * 0.62, W * 0.15, H * 0.30, [[0, 0.62], [1, 0]])
    ell(W * 0.74, H * 0.40, W * 0.13, H * 0.26, [[0, 0.40], [1, 0]])
  } else if (shape === 'crack') {
    // Narrow and hard-edged: a line with a bright head, not a swell.
    const lin = g.createLinearGradient(0, 0, W, 0)
    lin.addColorStop(0, 'rgba(255,255,255,0.92)')
    lin.addColorStop(0.34, 'rgba(255,255,255,0.5)')
    lin.addColorStop(0.82, 'rgba(255,255,255,0)')
    g.fillStyle = lin
    g.fillRect(0, H * 0.42, W, H * 0.16)
    ell(W * 0.22, H / 2, W * 0.14, H * 0.4, [[0, 0.7], [0.72, 0]])
  } else {
    // Broad, low-contrast and shapeless. Two overlapping soft blobs, offset so
    // it never quite resolves into an ellipse.
    ell(W * 0.30, H * 0.44, W * 0.46, H * 0.55, [[0, 0.42], [0.72, 0]])
    ell(W * 0.58, H * 0.58, W * 0.54, H * 0.62, [[0, 0.30], [0.76, 0]])
  }

  const t = PIXI.Texture.from(c)
  shapeTex.set(shape, t)
  return t
}

// ── THE TRAIL ───────────────────────────────────────────────────────────────

/** How often a pair is laid, ms. A third of the DOM's 95, which is what turns a
 *  row of marks into a disturbance. Peak alpha is divided by the same factor so
 *  three times the marks is the same amount of foam. */
const EVERY = 32
const DENSITY = EVERY / 95

/** How far a mark slides off the centreline over its life, in world px. This
 *  number IS the V's angle: too little and the two lines read as one thick one,
 *  too much and the boat looks like it is dragging a net. */
const SPREAD = 62

type Mark = {
  p: Particle
  x: number
  y: number
  ang: number
  side: number
  force: number
  scale: number
  age: number
  life: number
  /** Per-mark disorder. Real disturbed water is ragged at the edges, and
   *  without these two the V is drawn with a compass. */
  wobble: number
  drift: number
  /** Churn sits behind the hull and boils; it does not join the V. */
  churn: boolean
  tint: number
}

export type Wake = {
  view: Container
  /**
   * Where the hull is parting the water, and how hard.
   *
   * `x`/`y` are the cutwater in world coordinates, `ang` the heading in
   * radians, `force` 0..1, `scale` the hull's own size. Called every frame; the
   * cadence is this module's business.
   */
  lay(s: { x: number; y: number; ang: number; force: number; scale: number } | null): void
  advance(dt: number): void
  /** Swap the hull's wake. Marks already on the water keep the old one and age
   *  out, which is right: they were left by the boat that was there. */
  setKind(kind: WakeKind): void
  night(tint: number): void
  destroy(): void
}

export function makeWake(PIXI: typeof import('pixi.js')): Wake {
  // One container per blend mode is the honest way to do this: a wake is either
  // light or paint and the two cannot share a batch. They are swapped by
  // visibility rather than rebuilt, since a hull change mid-sail has to leave
  // the old marks alone.
  const view: Container = new PIXI.Container()
  const add: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  add.blendMode = 'add'
  const paint: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  view.addChild(paint, add)

  let kind: WakeKind = 'plain'
  let style: Style = STYLES.plain

  // Sized for the longest life at the fastest cadence, plus the churn that
  // rides with it. Recycled forever after that.
  const CAP = Math.ceil(2400 / EVERY) * 2 + 90
  const pool: Mark[] = []
  const mk = (into: ParticleContainer, tex: Texture) => {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    p.scaleX = p.scaleY = 0
    into.addParticle(p)
    return p
  }
  // ONE POOL, retextured on use. A mark takes whichever shape its style asks
  // for at the moment it is laid; swapping a particle's texture is free, while
  // allocating one mid-sail is not, and a hull change should not cost a
  // stutter. The alternative is a pool per shape, which is
  // four times the particles for a boat that only ever has one wake at a time.
  for (let i = 0; i < CAP; i++) {
    const p = mk(add, textureFor(PIXI, 'streak'))
    const q = mk(paint, textureFor(PIXI, 'streak'))
    // Two particles per slot, one in each blend container; the unused one sits
    // at alpha 0. Cheaper than moving a particle between containers, which
    // re-uploads both static buffers.
    pool.push({
      p, x: 0, y: 0, ang: 0, side: 1, force: 0, scale: 1,
      age: 1, life: 1, wobble: 0, drift: 0, churn: false, tint: 0xffffff,
    })
    ;(pool[i] as Mark & { alt: Particle }).alt = q
  }

  let next = 0
  let since = 0
  let tint = 0xffffff
  let at: { x: number; y: number; ang: number; force: number; scale: number } | null = null

  const take = (): Mark & { alt: Particle } => {
    const m = pool[next] as Mark & { alt: Particle }
    next = (next + 1) % CAP
    return m
  }

  function emit(m: Mark & { alt: Particle }, s: NonNullable<typeof at>, side: number, churn: boolean) {
    m.x = s.x
    m.y = s.y
    m.ang = s.ang
    m.side = side
    m.force = s.force
    m.scale = s.scale
    m.age = 0
    m.life = style.life / 1000
    m.churn = churn
    // Angle wobble and spread variation, per mark.
    m.wobble = (Math.random() * 2 - 1) * (churn ? 0.5 : 0.16)
    m.drift = 0.75 + Math.random() * 0.5
    m.tint = style.colors[(Math.random() * style.colors.length) | 0]

    // BARELY OFF THE CENTRELINE at the bow. At the stern a pair wants a gap,
    // because that is where a hull's width is; at the bow they want to nearly
    // touch, since the apex is a POINT and two lines that start apart read as a
    // channel rather than as water being split.
    const ux = Math.cos(s.ang), uy = Math.sin(s.ang)
    const off = churn ? (Math.random() * 2 - 1) * 9 * s.scale : side * 3 * s.scale
    m.x += -uy * off
    m.y += ux * off
    if (churn) {
      // Behind the cutwater rather than at it.
      const back = (6 + Math.random() * 26) * s.scale
      m.x -= ux * back
      m.y -= uy * back
      m.life *= 0.4
    }

    const light = style.blend === 'add'
    const live = light ? m.p : m.alt
    const dead = light ? m.alt : m.p
    live.texture = textureFor(PIXI, style.shape)
    dead.alpha = 0
    dead.scaleX = dead.scaleY = 0
  }

  return {
    view,

    lay(s) { at = s },

    advance(dt) {
      const d = Math.min(dt, 0.05)
      if (at && at.force > 0.02) {
        since += d * 1000
        while (since >= EVERY) {
          since -= EVERY
          emit(take(), at, -1, false)
          emit(take(), at, 1, false)
          // The stern boils in proportion to how hard she is driving.
          if (Math.random() < style.churn * at.force) emit(take(), at, 0, true)
        }
      } else {
        since = 0
      }

      const light = style.blend === 'add'
      for (const raw of pool) {
        const m = raw as Mark & { alt: Particle }
        if (m.age >= m.life) continue
        m.age += d
        const p = light ? m.p : m.alt
        if (m.age >= m.life) { p.alpha = 0; p.scaleX = p.scaleY = 0; continue }
        const age = m.age / m.life

        // ── THE V ──
        // Perpendicular to the heading it was laid at, sliding outward as it
        // ages. Eased rather than linear: the water leaves the hull fast and
        // then settles, so most of the spread happens early and the far end is
        // nearly parallel — which is what stops the V reading as two rulers.
        // THE V WIDENS WITH THE HULL, but by the ROOT of it: a Man-o-War's V is
        // visibly broader without the boat looking like it is dragging a net.
        const ang = m.ang + m.wobble * age
        const out = m.churn
          ? 14 * m.scale * age * m.drift
          : SPREAD * style.spread * Math.sqrt(m.scale) * m.force * m.drift
            * (1 - Math.pow(1 - age, 2.2))
        p.x = m.x + -Math.sin(ang) * m.side * out
        p.y = m.y + Math.cos(ang) * m.side * out

        // Brightest at the hull and gone quickly after, rather than fading in a
        // straight line — foam behaves that way, and a linear fade is the main
        // reason a wake reads as a row of identical dots.
        const fade = Math.pow(1 - age, m.churn ? 2.4 : 1.7)
        p.alpha = fade * style.alpha * DENSITY * (0.45 + m.force * 0.55)
          * (m.churn ? 2.2 : 1)
        p.tint = tint === 0xffffff ? m.tint : mix(m.tint, tint)

        // Stretched ALONG the heading and thin across it: a streak of disturbed
        // water, not a ring. Growing mostly across as it settles, because that
        // is the axis the water is spreading along.
        const along = (0.55 + age * 0.7) * m.scale * (m.churn ? 0.5 : 1)
        const across = (0.3 + age * 1.5) * m.scale * (m.churn ? 0.7 : 1)
        p.rotation = ang
        p.scaleX = (style.along * along) / 128
        p.scaleY = (style.across * across) / 64
      }
    },

    setKind(k) {
      if (k === kind) return
      kind = k
      style = STYLES[k] ?? STYLES.plain
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}

/** The hour, applied to a mark's own colour. Foam takes the light it is given;
 *  it does not have a colour of its own to keep. */
function mix(c: number, t: number): number {
  const r = ((((c >> 16) & 0xff) * ((t >> 16) & 0xff)) / 255) | 0
  const g = ((((c >> 8) & 0xff) * ((t >> 8) & 0xff)) / 255) | 0
  const b = (((c & 0xff) * (t & 0xff)) / 255) | 0
  return (r << 16) | (g << 8) | b
}
