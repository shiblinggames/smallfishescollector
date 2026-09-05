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
// ── AND EVERY HULL ON THE WATER, NOT JUST YOURS ─────────────────────────────
//
// The same disturbance belongs to everyone out there, and it is one system
// rather than two because a hull is always doing ONE of these: moving, and
// therefore leaving a wake, or sitting still, and therefore sitting in rings of
// its own displacement. Sources are laid every frame and the module works out
// which of the two each of them is doing, so a trader that drifts to a halt
// stops trailing and starts rippling without anybody deciding when.
//
// The rings follow the stylesheet's own reasoning about weight: fast thin rings
// travelling a long way is the clearest way to say LIGHT, and a heavy hull
// wants the opposite - slow, close and dark. `heave` is that dial. The heavy
// hull's TROUGH and COLLAR are not here yet; they belong to the Warship, and
// the Warship is still a DOM sprite.
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

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

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

/** A thin outlined ellipse: the ring a hull pushes out while it sits. Drawn as
 *  a ring rather than a disc because the water is DISPLACED, not lit — a filled
 *  blob at the waterline reads as a puddle of light under the boat. */
let ringTex: Texture | null = null

function ringTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // Soft on both edges. A hard 1px stroke aliases into a dotted line the moment
  // it is scaled up, and these spend their whole life being scaled up.
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.74, 'rgba(255,255,255,0)')
  grad.addColorStop(0.86, 'rgba(255,255,255,1)')
  grad.addColorStop(0.97, 'rgba(255,255,255,0)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

/** A soft filled dish. The water a heavy hull is standing IN, as opposed to the
 *  rings it pushes out — drawn dark and tinted at use, because this one is the
 *  absence of light rather than any colour of its own. */
let dishTex: Texture | null = null

function dishTexture(PIXI: typeof import('pixi.js')): Texture {
  if (dishTex) return dishTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.44)')
  grad.addColorStop(0.52, 'rgba(255,255,255,0.26)')
  grad.addColorStop(0.78, 'rgba(255,255,255,0)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  dishTex = PIXI.Texture.from(c)
  return dishTex
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

/** Below this she is at rest and rings rather than trails. World px/sec, and
 *  the same 26 the DOM gate uses so the two renderers change over at the same
 *  moment. */
const UNDER_WAY = 26

/** One ring every this many seconds, at heave 0. The stylesheet runs three
 *  rings over a 4.6s cycle, which is one every 1.53. */
const RING_EVERY = 1.53
/** How long one ring lives, at heave 0. */
const RING_LIFE = 4.6

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
  /** The crest off the stem. Thrown forward and out rather than trailing, and
   *  it is the single thing that reads as a SHIP rather than a boat. */
  bow: boolean
  /** How heavy the hull that made it was. Carried on the mark, like the style,
   *  because a Man-o-War's water is still settling long after she has gone and
   *  should not be redrawn as a sloop's the moment she is. */
  heave: number
  tint: number
  /** THE MARK REMEMBERS ITS OWN HULL. Several boats are on this water at once
   *  and a shared `style` would redraw every mark in whatever the last hull to
   *  emit happened to be — an Ethereal sailing past would recolour a plain
   *  trader's whole wake behind them. */
  st: Style
}

/** One hull meeting the water. */
export type Contact = {
  /** Stable per hull. Cadence and speed are tracked against it, so a trader
   *  that leaves the list and comes back starts a fresh trail rather than one
   *  stitched to wherever they were an hour ago. */
  id: string
  /** The CUTWATER, in world coordinates — where she parts the water, not where
   *  her sprite is centred. */
  x: number
  y: number
  /** Heading, radians. */
  ang: number
  /** Where she SITS, as opposed to where she cuts. Rings come from here — a
   *  hull at rest is standing in water it displaced, and that is under the
   *  middle of it rather than off the bow. Defaults to the cutwater. */
  cx?: number
  cy?: number
  /** The hull's own size, and how heavily it sits. `heave` 0 is a rowing boat
   *  and 1 is a Man-o-War: slower rings, closer, darker. */
  scale: number
  heave?: number
  kind: WakeKind
  /**
   * How hard she is driving, 0..1. OPTIONAL, and left out for everyone but the
   * player: the chart knows her velocity exactly, and for everybody else the
   * honest measure is how far they actually moved since the last frame, which
   * this module can see and the caller would have to compute.
   */
  force?: number
}

export type Wake = {
  view: Container
  /**
   * Every hull on the water, this frame.
   *
   * Called every frame with the WHOLE list. A hull that stops appearing has
   * left; its marks stay and age out, because they are water and the water does
   * not know it was abandoned.
   */
  lay(list: Contact[]): void
  advance(dt: number): void
  night(tint: number): void
  destroy(): void
}

export function makeWake(PIXI: typeof import('pixi.js')): Wake {
  // One container per blend mode is the honest way to do this: a wake is either
  // light or paint and the two cannot share a batch. They are swapped by
  // visibility rather than rebuilt, since a hull change mid-sail has to leave
  // the old marks alone.
  const view: Container = new PIXI.Container()

  // ── WHAT A HEAVY HULL IS STANDING IN ──────────────────────────────────────
  //
  // Under everything else, because it is the water beneath the ship rather than
  // anything happening on top of it. Sprites and not particles: the trough and
  // the collar are ALWAYS THERE while she is at rest, breathing, where a ring
  // is a thing that gets born and dies.
  //
  // Only ever built for a hull with weight. Every trader on the chart is in the
  // same fishing boat, so this map has one entry in it in practice — but it is
  // keyed per hull rather than assumed, because an NPC warship would otherwise
  // be a rewrite instead of a row.
  const heavyLayer: Container = new PIXI.Container()
  view.addChild(heavyLayer)
  const heavy = new Map<string, { trough: Sprite; collar: Sprite }>()

  const add: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  add.blendMode = 'add'
  const paint: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  view.addChild(paint, add)

  /** What each hull was doing last frame. Speed is measured here rather than
   *  asked for, because the only caller that knows its own velocity is the
   *  player and everyone else would have to be given a differentiator. */
  const alive = new Set<string>()
  const seen = new Map<string, {
    x: number; y: number; speed: number; primed: boolean
    since: number; ringSince: number
  }>()

  // Sized for the LONGEST life at the fastest cadence, plus the churn and the
  // bow wave riding with it. The longest life is not a style's own number any
  // more: a Man-o-War stretches it by 1.9, so a pool sized on the raw 2400 is
  // a third of what her wake needs and she would spend her whole voyage
  // recycling marks that are still on screen — the exact bug the note on
  // WAKE_PAIRS describes from the DOM version, which is what happens when a
  // pool is sized against a number that later grew a multiplier.
  const CAP = Math.ceil((2400 * 1.9) / EVERY) * 4 + 120
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
      age: 1, life: 1, wobble: 0, drift: 0, churn: false, bow: false, heave: 0,
      tint: 0xffffff, st: STYLES.plain,
    })
    ;(pool[i] as Mark & { alt: Particle }).alt = q
  }

  // ── THE RINGS ─────────────────────────────────────────────────────────────
  // A hull at rest is not doing nothing: it is standing in water it has pushed
  // out of the way. Far fewer of these than marks — three at a time per hull,
  // over a long cycle.
  const rings: {
    p: Particle; x: number; y: number; age: number; life: number
    scale: number; heave: number; tint: number
  }[] = []
  // THREE RINGS EACH, over a cycle, for everybody on screen at once. A quiet
  // corner of the chart holds a couple of dozen captains and a busy one more,
  // and a ring that gets recycled early snaps out of existence mid-sweep.
  const RING_CAP = 240
  const ringLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  // Under the marks: a boat that starts moving should have its wake laid over
  // the rings it was sitting in a moment ago.
  view.addChildAt(ringLayer, 0)
  for (let i = 0; i < RING_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: ringTexture(PIXI) })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    p.scaleX = p.scaleY = 0
    ringLayer.addParticle(p)
    rings.push({ p, x: 0, y: 0, age: 1, life: 1, scale: 1, heave: 0, tint: 0xffffff })
  }
  let ringNext = 0

  let next = 0
  let clock = 0
  let tint = 0xffffff

  const take = (): Mark & { alt: Particle } => {
    const m = pool[next] as Mark & { alt: Particle }
    next = (next + 1) % CAP
    return m
  }

  function emit(
    m: Mark & { alt: Particle },
    s: Contact, style: Style, force: number, side: number,
    churn: boolean, bow = false,
  ) {
    m.st = style
    m.bow = bow
    m.heave = s.heave ?? 0
    m.x = s.x
    m.y = s.y
    m.ang = s.ang
    m.side = side
    m.force = force
    m.scale = s.scale
    m.age = 0
    // HEAVY WATER SETTLES SLOWLY. A ship of the line leaves a disturbance that
    // is still there long after a rowing boat's has gone flat, which is most of
    // what makes a big hull feel big from behind.
    m.life = (style.life / 1000) * (1 + (s.heave ?? 0) * 0.9)
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
    if (bow) {
      // ── THE CREST OFF THE STEM ──────────────────────────────────
      //
      // Thrown FORWARD and outward rather than trailing, which is the whole
      // difference: everything else here is water the hull has left behind,
      // and this is water it is currently shouldering out of the way. It is
      // also the thing a big ship has and a small one barely does, so it is
      // the clearest read on the ladder at a glance.
      //
      // Short-lived and bright. A bow wave that lingers is a wake; the crest
      // itself only exists where the hull is, and it is renewed every cadence
      // because the hull keeps being somewhere.
      m.ang = s.ang + side * (0.42 + 0.16 * (s.heave ?? 0))
      m.side = 0
      m.life *= 0.34
      m.wobble = (Math.random() * 2 - 1) * 0.08
      const out = (10 + Math.random() * 14) * s.scale
      m.x += Math.cos(m.ang) * out
      m.y += Math.sin(m.ang) * out
    }

    const light = style.blend === 'add'
    const live = light ? m.p : m.alt
    const dead = light ? m.alt : m.p
    live.texture = textureFor(PIXI, style.shape)
    dead.alpha = 0
    dead.scaleX = dead.scaleY = 0
  }

  /** One ring, pushed out from a hull that is standing still. */
  function ring(s: Contact, style: Style, heave: number) {
    const r = rings[ringNext]
    ringNext = (ringNext + 1) % RING_CAP
    r.x = s.cx ?? s.x
    r.y = s.cy ?? s.y
    r.age = 0
    // Bigger displacement really does mean a longer wavelength, so slowing
    // these down with weight is the physics as well as the feeling.
    r.life = RING_LIFE * (1 + heave * 0.8)
    r.scale = s.scale
    r.heave = heave
    r.tint = style.colors[0]
  }

  let pending: Contact[] = []

  return {
    view,

    lay(list) { pending = list },

    advance(dt) {
      const d = Math.min(dt, 0.05)
      clock += d
      const t = clock

      // ── WHAT EVERY HULL IS DOING ──────────────────────────────────
      // One Set for the lifetime of the layer, cleared per frame. This ran
      // sixty times a second and allocated a fresh Set every time; the
      // collector was being handed the same empty set to sweep up all day.
      alive.clear()
      for (const s of pending) {
        alive.add(s.id)
        let st = seen.get(s.id)
        if (!st) {
          st = { x: s.x, y: s.y, speed: 0, primed: false, since: 0, ringSince: 1e9 }
          seen.set(s.id, st)
        }
        // MEASURED, not asked for. The player knows her own velocity and hands
        // it over; nobody else does, and how far they actually moved since the
        // last frame is the same answer arrived at honestly.
        const moved = Math.hypot(s.x - st.x, s.y - st.y) / Math.max(d, 1e-4)
        st.speed = st.primed ? st.speed + (moved - st.speed) * Math.min(1, d * 8) : 0
        st.x = s.x; st.y = s.y; st.primed = true

        const style = STYLES[s.kind] ?? STYLES.plain
        const heave = s.heave ?? 0
        // The player's own force is exact; everybody else's comes off the
        // measurement above, against the same speed the DOM gate used.
        const force = s.force ?? Math.min(1, st.speed / 210)
        const underWay = s.force != null ? s.force > 0.02 : st.speed > UNDER_WAY

        if (underWay) {
          st.since += d * 1000
          // A hull that has been sitting still starts its next ring promptly
          // when it stops, rather than up to a cycle and a half later.
          st.ringSince = 1e9
          while (st.since >= EVERY) {
            st.since -= EVERY
            emit(take(), s, style, force, -1, false)
            emit(take(), s, style, force, 1, false)
            // The stern boils in proportion to how hard she is driving, and to
            // how much of her there is to drive. Three times the hull shoves
            // three times the water, and the churn is where that shows.
            const boil = style.churn * force * (1 + (s.heave ?? 0) * 1.8)
            if (Math.random() < boil) emit(take(), s, style, force, 0, true)
            if (boil > 1 && Math.random() < boil - 1) emit(take(), s, style, force, 0, true)
            // THE STEM, both sides. Only once she is properly under way — a
            // hull idling forward does not throw a crest — and scaled hard by
            // weight, because this is the part a Man-o-War has and a sloop
            // only hints at.
            if (force > 0.45) {
              emit(take(), s, style, force, -1, false, true)
              emit(take(), s, style, force, 1, false, true)
            }
          }
        } else {
          st.since = 0
          st.ringSince += d
          const every = RING_EVERY * (1 + heave * 0.8)
          if (st.ringSince >= every) {
            st.ringSince = 0
            ring(s, style, heave)
          }
        }

        // ── AND THE DISH SHE SITS IN ──────────────────────────────────
        //
        // A rowing boat rings and that is the whole of it. A ship of the line
        // does something else entirely: the water around it is pressed DOWN,
        // and the surface stands up against the hull where it parts. Three thin
        // rings racing outward is a pebble in a pond however big you draw it,
        // which is the note the stylesheet makes and the reason a Man-o-War
        // needed its own treatment rather than a scaled-up ripple.
        //
        // Weight is the dial: at 0 nothing here exists at all.
        if (heave > 0.02) {
          let h = heavy.get(s.id)
          if (!h) {
            const trough: Sprite = new PIXI.Sprite(dishTexture(PIXI))
            trough.anchor.set(0.5)
            trough.tint = 0x040c14
            const collar: Sprite = new PIXI.Sprite(ringTexture(PIXI))
            collar.anchor.set(0.5)
            collar.tint = 0xe2f4fa
            collar.blendMode = 'add'
            heavyLayer.addChild(trough, collar)
            h = { trough, collar }
            heavy.set(s.id, h)
          }
          const cx = s.cx ?? s.x
          const cy = s.cy ?? s.y
          // She stops standing in a hole the moment she is moving through one.
          const settled = 1 - Math.min(1, force * 1.6)

          // THE TROUGH — wider than the beam, because displaced water does not
          // stop at the plank. Breathing slower the heavier she is, which is
          // the physics as much as the feeling: more displacement is a longer
          // wavelength.
          const bt = 1 + 0.055 * (0.5 + 0.5 * Math.sin(t / (6 + heave * 2.5) * Math.PI * 2))
          h.trough.position.set(cx, cy)
          h.trough.width = 150 * s.scale * bt
          h.trough.height = (46 / GROUND) * s.scale * bt
          h.trough.alpha = (0.62 + heave * 0.38) * settled

          // THE COLLAR — a bright rim tight against the waterline, where the
          // hull actually parts the surface.
          const bc = 0.5 + 0.5 * Math.sin(t / (4.4 + heave * 2) * Math.PI * 2)
          h.collar.position.set(cx, cy)
          const ck = 1 + 0.03 * bc
          h.collar.width = 112 * s.scale * ck
          h.collar.height = (26 / GROUND) * s.scale * ck
          h.collar.alpha = (0.32 + bc * 0.28) * settled
        }
      }
      // Anyone who has left. Their marks and rings are already on the water and
      // stay there: it is water, and it does not know it was abandoned. The
      // trough goes with them, though — it is not a mark left behind, it is the
      // dish a hull is sitting in, and there is no hull.
      for (const [id, h] of heavy) {
        if (alive.has(id)) continue
        h.trough.destroy(); h.collar.destroy()
        heavy.delete(id)
      }
      // Deleting during a Map's own iteration is safe and allocates nothing;
      // spreading the keys first built a throwaway array a frame.
      for (const id of seen.keys()) if (!alive.has(id)) seen.delete(id)

      // ── THE RINGS ─────────────────────────────────────────────────
      for (const r of rings) {
        if (r.age >= r.life) continue
        r.age += d
        if (r.age >= r.life) { r.p.alpha = 0; r.p.scaleX = r.p.scaleY = 0; continue }
        const age = r.age / r.life
        // 0.42 to 2.2 of the beam for a light hull; a heavy one starts at 0.92,
        // hugging the waterline, and travels about half as far.
        const from = 0.42 + heaveMix(r.heave, 0, 0.5)
        const to = 2.2 - heaveMix(r.heave, 0, 1.05)
        const k = (from + (to - from) * age) * r.scale
        r.p.x = r.x
        r.p.y = r.y
        // 104 x 30, the beam the stylesheet opens from — but those are SCREEN
        // numbers. `.sea-ripple` lives outside the world layer, so its 30 is
        // the ellipse a viewer already sees; this mesh is INSIDE the world and
        // gets the plane's squash applied on top. Written as 30 it drew at 17
        // and the rings came out as slots. Divided back out, they land at the
        // height the stylesheet always meant.
        r.p.scaleX = (104 * k) / 256
        r.p.scaleY = (30 / GROUND * k) / 256
        // In fast, out slow: 0 at the start, up by a seventh of the way
        // through, gone by the end.
        const rise = Math.min(1, age / 0.14)
        r.p.alpha = rise * Math.pow(1 - age, 1.4) * 0.34 * (1 - r.heave * 0.35)
        r.p.tint = tint === 0xffffff ? r.tint : mix(r.tint, tint)
      }

      for (const raw of pool) {
        const m = raw as Mark & { alt: Particle }
        if (m.age >= m.life) continue
        m.age += d
        const light = m.st.blend === 'add'
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
        const out = m.bow
          ? 0
          : m.churn
          ? 14 * m.scale * age * m.drift
          : SPREAD * m.st.spread * Math.sqrt(m.scale) * (1 + m.heave * 0.55)
            * m.force * m.drift * (1 - Math.pow(1 - age, 2.2))
        p.x = m.x + -Math.sin(ang) * m.side * out
        p.y = m.y + Math.cos(ang) * m.side * out

        // Brightest at the hull and gone quickly after, rather than fading in a
        // straight line — foam behaves that way, and a linear fade is the main
        // reason a wake reads as a row of identical dots.
        const fade = Math.pow(1 - age, m.churn ? 2.4 : m.bow ? 1.2 : 1.7)
        p.alpha = fade * m.st.alpha * DENSITY * (0.45 + m.force * 0.55)
          * (m.churn ? 2.2 : m.bow ? 3.4 : 1)
        p.tint = tint === 0xffffff ? m.tint : mix(m.tint, tint)

        // Stretched ALONG the heading and thin across it: a streak of disturbed
        // water, not a ring. Growing mostly across as it settles, because that
        // is the axis the water is spreading along.
        // A crest is LONG and thin and barely spreads: it is a standing edge of
        // water, not something dispersing.
        const along = m.bow
          ? (0.7 + age * 0.5) * m.scale * (1 + m.heave)
          : (0.55 + age * 0.7) * m.scale * (m.churn ? 0.5 : 1)
        const across = m.bow
          ? (0.22 + age * 0.3) * m.scale
          : (0.3 + age * 1.5) * m.scale * (m.churn ? 0.7 : 1)
        p.rotation = ang
        p.scaleX = (m.st.along * along) / 128
        p.scaleY = (m.st.across * across) / 64
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}

/** Interpolate a weight-dependent number: `at 0` for a rowing boat, `at 1` for
 *  a Man-o-War. Named because `a + (b - a) * h` three times in a row reads as
 *  arithmetic rather than as weight. */
const heaveMix = (h: number, a: number, b: number) => a + (b - a) * h

/** The hour, applied to a mark's own colour. Foam takes the light it is given;
 *  it does not have a colour of its own to keep. */
function mix(c: number, t: number): number {
  const r = ((((c >> 16) & 0xff) * ((t >> 16) & 0xff)) / 255) | 0
  const g = ((((c >> 8) & 0xff) * ((t >> 8) & 0xff)) / 255) | 0
  const b = (((c & 0xff) * (t & 0xff)) / 255) | 0
  return (r << 16) | (g << 8) | b
}
