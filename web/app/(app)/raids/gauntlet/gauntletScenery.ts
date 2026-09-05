// ── THE SCENERY OF A DESCENT ────────────────────────────────────────────────
//
// What makes a gauntlet's water THAT gauntlet's water. The weather layer says
// how bad it is here; this says WHERE here is. Davy's Locker is a drowned
// wreck-field lit from above through cold water, the Don's is a sunken court
// lit gold through green, and hardcore is neither: it is lit from BELOW, in
// red, by something that is awake.
//
// ── WHAT IT DRAWS, BOTTOM TO TOP ────────────────────────────────────────────
//
//   THE DEEP      a slow pulse of light at the foot of the arena — the thing
//                 under you. At a boss depth it OPENS: an eye, the run's own
//                 colour, that watches the fight from under the water.
//   SILHOUETTES   two tiling bands of dark shapes drifting at different
//                 speeds: masts and kelp and a whale's ribs for Davy, pillars
//                 and arches and a fallen crown for the Don, spires and bone
//                 for hardcore. Parallax is the cheapest possible depth cue,
//                 and a tiling sprite is the cheapest possible parallax.
//   SHAFTS        light coming down through the water in slow sweeping
//                 columns — or up, in hardcore, because there the light has
//                 a source and it is not the sun.
//   MOTES         what floats here: wisps, gold dust, embers.
//   VIGNETTE      the edges of the room, darker as you fall.
//   BEATS         one-shot ceremonies the run fires — a boon surfacing, a
//                 curse taking hold, a shrine waking, a kill, a death — so
//                 the screens between fights happen ON the water rather
//                 than replacing it.
//
// Every pool is fixed and recycled. Nothing allocates after construction.

import type { Container, Particle, ParticleContainer, Sprite, Texture, TilingSprite } from 'pixi.js'

export type SceneVariant = 'davy' | 'don'

/** Which screen of the run the arena is under. Drives the grade and the beats. */
export type Mood =
  | 'fall' | 'fight' | 'between' | 'boon' | 'curse' | 'shrine' | 'merchant'
  | 'contract' | 'mark' | 'fallen' | 'dead' | 'reward'

export type Scene = {
  variant: SceneVariant
  hardcore: boolean
  boss: boolean
  /** The Don himself, at his milestone depths. */
  apex: boolean
  /** 0 at the surface, 1 at the deepest anyone reaches. */
  deep: number
  mood: Mood
  /** The run's own colour, shared with the weather. */
  key: number
  /** The deepest water stop, for tinting the silhouettes into the sea. */
  deepColor: number
}

export type BeatKind =
  | 'boon' | 'legendary' | 'curse' | 'shrine' | 'merchant' | 'contract'
  | 'victory' | 'death' | 'chest' | 'mark'

export type Scenery = {
  /** Under the hulls, over the water: the deep, the silhouettes, the shafts. */
  far: Container
  /** Over everything: motes, vignette, the beats. */
  near: Container
  set(s: Scene): void
  beat(kind: BeatKind, tint?: number): void
  /** How much darker the water should be drawn for the current mood, 0..1. */
  grade(): number
  advance(dt: number, t: number, W: number, H: number, heavy: number, fall: number): void
  destroy(): void
}

const MOTE_N = 140
const BURST_N = 64
const SHAFT_N = 6

// ── TEXTURES ─────────────────────────────────────────────────────────────────
//
// Cached at module scope and read through `live()` only: a gauntlet visit
// builds and destroys more than one Pixi Application, and a texture whose
// source went down with an earlier renderer must be rebuilt, not reused.
function live(t: Texture | null): Texture | null {
  return t && !t.destroyed && !t.source.destroyed ? t : null
}
const cache: Record<string, Texture | null> = {}
function cached(key: string, make: () => HTMLCanvasElement, PIXI: typeof import('pixi.js')): Texture {
  const hit = live(cache[key] ?? null)
  if (hit) return hit
  return (cache[key] = PIXI.Texture.from(make()))
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return { c, g: c.getContext('2d')! }
}

/** Deterministic, so the same wreck-field is on the water every visit. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dot(PIXI: typeof import('pixi.js')) {
  return cached('dot', () => {
    const S = 32
    const { c, g } = canvas(S, S)
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad; g.fillRect(0, 0, S, S)
    return c
  }, PIXI)
}

function glow(PIXI: typeof import('pixi.js')) {
  return cached('glow', () => {
    const S = 256
    const { c, g } = canvas(S, S)
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grad.addColorStop(0, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad; g.fillRect(0, 0, S, S)
    return c
  }, PIXI)
}

/** A column of light: soft at both sides, fading along its length. */
function shaft(PIXI: typeof import('pixi.js')) {
  return cached('shaft', () => {
    const W = 64, H = 512
    const { c, g } = canvas(W, H)
    const across = g.createLinearGradient(0, 0, W, 0)
    across.addColorStop(0, 'rgba(255,255,255,0)')
    across.addColorStop(0.5, 'rgba(255,255,255,1)')
    across.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = across; g.fillRect(0, 0, W, H)
    g.globalCompositeOperation = 'destination-in'
    const along = g.createLinearGradient(0, 0, 0, H)
    along.addColorStop(0, 'rgba(255,255,255,1)')
    along.addColorStop(0.55, 'rgba(255,255,255,0.45)')
    along.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = along; g.fillRect(0, 0, W, H)
    return c
  }, PIXI)
}

function ring(PIXI: typeof import('pixi.js')) {
  return cached('ring', () => {
    const S = 256
    const { c, g } = canvas(S, S)
    g.strokeStyle = '#fff'; g.lineWidth = 10
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2); g.stroke()
    const out = canvas(S, S)
    out.g.filter = 'blur(3px)'; out.g.drawImage(c, 0, 0)
    return out.c
  }, PIXI)
}

/** One edge of the vignette: dark at the top, clear at the bottom. */
function edge(PIXI: typeof import('pixi.js')) {
  return cached('edge', () => {
    const W = 64, H = 256
    const { c, g } = canvas(W, H)
    const grad = g.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad; g.fillRect(0, 0, W, H)
    return c
  }, PIXI)
}

/** The pupil of the thing under the water: a dark slit with a soft rim. */
function pupil(PIXI: typeof import('pixi.js')) {
  return cached('pupil', () => {
    const S = 256
    const { c, g } = canvas(S, S)
    g.fillStyle = '#000'
    g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.11, S * 0.42, 0, 0, Math.PI * 2); g.fill()
    const out = canvas(S, S)
    out.g.filter = 'blur(4px)'; out.g.drawImage(c, 0, 0)
    return out.c
  }, PIXI)
}

/**
 * THE SILHOUETTES, one wide transparent band per world. Drawn as flat black
 * and tinted into the sea's deepest stop at draw time, so they read as things
 * in the water rather than things pasted over it.
 */
function silhouettes(PIXI: typeof import('pixi.js'), world: 'davy' | 'don' | 'hardcore') {
  return cached('sil:' + world, () => {
    const W = 2048, H = 512
    const { c, g } = canvas(W, H)
    const r = rng(world === 'davy' ? 7 : world === 'don' ? 19 : 41)
    g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineCap = 'round'
    const floor = H * 0.98

    if (world === 'davy') {
      // Masts of a drowned fleet, leaning, with their yards still on.
      for (let i = 0; i < 9; i++) {
        const x = 90 + r() * (W - 180)
        const h = 200 + r() * 240
        const lean = (r() - 0.5) * 0.5
        g.save(); g.translate(x, floor); g.rotate(lean)
        g.lineWidth = 6 + r() * 6
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h); g.stroke()
        for (let y = -h * 0.35; y > -h * 0.95; y -= h * 0.28) {
          const yw = 40 + r() * 60
          g.lineWidth = 4
          g.beginPath(); g.moveTo(-yw, y); g.lineTo(yw, y - 6); g.stroke()
        }
        g.restore()
      }
      // A whale's ribs, arcing out of the silt.
      const rx = 300 + r() * (W - 600)
      for (let i = 0; i < 7; i++) {
        const rr = 90 + i * 22
        g.lineWidth = 7
        g.beginPath(); g.arc(rx + i * 26, floor, rr, Math.PI * 1.05, Math.PI * 1.95); g.stroke()
      }
      // Kelp, tall and slack.
      for (let i = 0; i < 14; i++) {
        const x = r() * W, h = 160 + r() * 260, w = 6 + r() * 8
        g.lineWidth = w
        g.beginPath(); g.moveTo(x, floor)
        for (let k = 1; k <= 6; k++) g.lineTo(x + Math.sin(k * 1.3 + i) * 22, floor - (h / 6) * k)
        g.stroke()
      }
    } else if (world === 'don') {
      // A sunken court: pillars with capitals, two broken arches, a crown.
      for (let i = 0; i < 11; i++) {
        const x = 60 + r() * (W - 120), h = 180 + r() * 250, w = 22 + r() * 20
        const lean = (r() - 0.5) * 0.14
        g.save(); g.translate(x, floor); g.rotate(lean)
        g.fillRect(-w / 2, -h, w, h)
        g.fillRect(-w * 0.9, -h - 14, w * 1.8, 14)
        g.fillRect(-w * 0.8, -12, w * 1.6, 12)
        g.restore()
      }
      for (let i = 0; i < 2; i++) {
        const x = 400 + r() * (W - 800), rr = 120 + r() * 80
        g.lineWidth = 26
        g.beginPath(); g.arc(x, floor - rr * 0.6, rr, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
      }
      const cx = 200 + r() * (W - 400)
      g.lineWidth = 12
      g.beginPath(); g.ellipse(cx, floor - 60, 70, 24, -0.4, 0, Math.PI * 2); g.stroke()
      for (let k = 0; k < 5; k++) {
        const a = -0.4 + (k / 4) * 0.9
        g.beginPath(); g.moveTo(cx + Math.cos(a) * 60, floor - 60 + Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * 60 - 8, floor - 60 + Math.sin(a) * 20 - 46 - k * 6); g.stroke()
      }
    } else {
      // Spires and bone: nothing here was built.
      for (let i = 0; i < 13; i++) {
        const x = 40 + r() * (W - 80), h = 200 + r() * 300, w = 30 + r() * 60
        g.beginPath(); g.moveTo(x - w / 2, floor); g.lineTo(x + (r() - 0.5) * 30, floor - h); g.lineTo(x + w / 2, floor); g.closePath(); g.fill()
      }
      const rx = 300 + r() * (W - 600)
      for (let i = 0; i < 9; i++) {
        g.lineWidth = 9
        g.beginPath(); g.arc(rx + i * 34, floor + 30, 120 + i * 18, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
      }
      // A skull, mostly buried.
      const sx = 150 + r() * (W - 300)
      g.beginPath(); g.arc(sx, floor + 40, 150, Math.PI, Math.PI * 2); g.fill()
      g.globalCompositeOperation = 'destination-out'
      g.beginPath(); g.ellipse(sx - 55, floor - 40, 34, 44, 0, 0, Math.PI * 2); g.fill()
      g.beginPath(); g.ellipse(sx + 55, floor - 40, 34, 44, 0, 0, Math.PI * 2); g.fill()
      g.globalCompositeOperation = 'source-over'
    }
    const out = canvas(W, H)
    out.g.filter = 'blur(2px)'; out.g.drawImage(c, 0, 0)
    return out.c
  }, PIXI)
}

// ── THE GRADE ────────────────────────────────────────────────────────────────
//
// What each screen of the run does to the light. One number for the water and
// one multiplier for the shafts, so a curse is a darker room with the light
// gone, and a boon is the same room with the light turned up.
const GRADE: Record<Mood, { dark: number; shafts: number; motes: number }> = {
  fall: { dark: 0.10, shafts: 0.6, motes: 1.0 },
  fight: { dark: 0.00, shafts: 1.0, motes: 1.0 },
  between: { dark: 0.06, shafts: 1.15, motes: 1.2 },
  boon: { dark: 0.04, shafts: 1.7, motes: 1.6 },
  curse: { dark: 0.30, shafts: 0.25, motes: 0.5 },
  shrine: { dark: 0.16, shafts: 0.8, motes: 1.3 },
  merchant: { dark: 0.12, shafts: 0.9, motes: 1.1 },
  contract: { dark: 0.14, shafts: 0.8, motes: 1.0 },
  mark: { dark: 0.12, shafts: 0.9, motes: 1.0 },
  fallen: { dark: 0.02, shafts: 1.5, motes: 1.4 },
  dead: { dark: 0.48, shafts: 0.1, motes: 0.3 },
  reward: { dark: 0.02, shafts: 1.6, motes: 1.5 },
}

const MOOD_TINT: Partial<Record<Mood, number>> = {
  boon: 0xf5c453, curse: 0xff3b3b, shrine: 0xb794f6, merchant: 0x3fbf82,
  contract: 0x3fbf82, mark: 0xe0b26a, dead: 0xb01818, reward: 0xffd66b,
}

export function makeScenery(PIXI: typeof import('pixi.js')): Scenery {
  const far: Container = new PIXI.Container()
  const near: Container = new PIXI.Container()
  far.eventMode = 'none'; near.eventMode = 'none'

  const dotT = dot(PIXI), glowT = glow(PIXI), shaftT = shaft(PIXI), ringT = ring(PIXI), edgeT = edge(PIXI), pupilT = pupil(PIXI)

  let scene: Scene = { variant: 'davy', hardcore: false, boss: false, apex: false, deep: 0, mood: 'fight', key: 0x9cf0ff, deepColor: 0x04121a }
  let world: 'davy' | 'don' | 'hardcore' = 'davy'

  // ── THE DEEP ───────────────────────────────────────────────────────
  const deepGlow: Sprite = new PIXI.Sprite(glowT)
  deepGlow.anchor.set(0.5); deepGlow.blendMode = 'add'; deepGlow.alpha = 0
  far.addChild(deepGlow)
  // The eye: an iris of light with a slit through it, under a lid that opens.
  const eye: Container = new PIXI.Container()
  const iris: Sprite = new PIXI.Sprite(glowT)
  iris.anchor.set(0.5); iris.blendMode = 'add'
  const irisRing: Sprite = new PIXI.Sprite(ringT)
  irisRing.anchor.set(0.5); irisRing.blendMode = 'add'
  const slit: Sprite = new PIXI.Sprite(pupilT)
  slit.anchor.set(0.5)
  eye.addChild(iris, irisRing, slit)
  eye.alpha = 0
  far.addChild(eye)
  let lid = 0 // 0 shut, 1 open

  // ── THE SILHOUETTES ────────────────────────────────────────────────
  const mkBand = (alpha: number): TilingSprite => {
    const s: TilingSprite = new PIXI.TilingSprite({ texture: silhouettes(PIXI, world), width: 10, height: 10 })
    s.alpha = alpha
    far.addChild(s)
    return s
  }
  const bandFar = mkBand(0.32)
  const bandNear = mkBand(0.55)

  // ── THE SHAFTS ─────────────────────────────────────────────────────
  const shafts: { s: Sprite; x: number; w: number; v: number; ph: number }[] = []
  for (let i = 0; i < SHAFT_N; i++) {
    const s: Sprite = new PIXI.Sprite(shaftT)
    s.anchor.set(0.5, 0); s.blendMode = 'add'; s.alpha = 0
    far.addChild(s)
    shafts.push({ s, x: Math.random(), w: 60 + Math.random() * 120, v: (Math.random() - 0.5) * 0.02, ph: Math.random() * 6.28 })
  }

  // ── THE MOTES ──────────────────────────────────────────────────────
  const moteLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  moteLayer.blendMode = 'add'
  near.addChild(moteLayer)
  type Mote = { p: Particle; x: number; y: number; vx: number; vy: number; s: number; ph: number }
  const motes: Mote[] = []
  for (let i = 0; i < MOTE_N; i++) {
    const p: Particle = new PIXI.Particle({ texture: dotT })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    moteLayer.addParticle(p)
    motes.push({ p, x: 0, y: 0, vx: 0, vy: 0, s: 1, ph: Math.random() * 6.28 })
  }

  // ── THE VIGNETTE ───────────────────────────────────────────────────
  const edges: Sprite[] = []
  for (let i = 0; i < 4; i++) {
    const s: Sprite = new PIXI.Sprite(edgeT)
    s.tint = 0x000000
    near.addChild(s)
    edges.push(s)
  }

  // ── THE BEATS ──────────────────────────────────────────────────────
  const wash: Sprite = new PIXI.Sprite(PIXI.Texture.WHITE)
  wash.alpha = 0; wash.blendMode = 'add'
  const washBelow: Sprite = new PIXI.Sprite(edgeT)
  washBelow.alpha = 0; washBelow.blendMode = 'add'
  washBelow.anchor.set(0, 1); washBelow.scale.y = -1
  const pulse: Sprite = new PIXI.Sprite(ringT)
  pulse.anchor.set(0.5); pulse.alpha = 0; pulse.blendMode = 'add'
  const burstLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  burstLayer.blendMode = 'add'
  near.addChild(washBelow, wash, pulse, burstLayer)
  type Spark = { p: Particle; x: number; y: number; vx: number; vy: number; life: number; age: number; s: number }
  const sparks: Spark[] = []
  for (let i = 0; i < BURST_N; i++) {
    const p: Particle = new PIXI.Particle({ texture: dotT })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    burstLayer.addParticle(p)
    sparks.push({ p, x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 9, s: 1 })
  }
  let beatKind: BeatKind | null = null
  let beatLeft = 0, beatLen = 1
  let beatTint = 0xffffff
  let flare = 0 // extra light on the shafts, decays

  let seeded = false
  let gradeDark = 0

  function retint() {
    const deepTint = scene.deepColor
    bandFar.tint = deepTint; bandNear.tint = deepTint
    deepGlow.tint = scene.key
    iris.tint = scene.key; irisRing.tint = scene.key
    for (const sh of shafts) sh.s.tint = scene.hardcore ? 0xff5a4a : scene.key
    const moteTint = scene.hardcore ? 0xff8a4a : scene.variant === 'don' ? 0xffd88a : 0xbfffff
    for (const m of motes) m.p.tint = moteTint
    const edgeTint = scene.hardcore ? 0x1a0206 : scene.variant === 'don' ? 0x02100a : 0x02080e
    for (const e of edges) e.tint = edgeTint
  }
  retint()

  return {
    far, near,

    set(s) {
      const prev = scene
      scene = s
      const w: typeof world = s.hardcore ? 'hardcore' : s.variant
      if (w !== world) {
        world = w
        const tex = silhouettes(PIXI, world)
        bandFar.texture = tex; bandNear.texture = tex
      }
      if (prev.key !== s.key || prev.deepColor !== s.deepColor || prev.hardcore !== s.hardcore || prev.variant !== s.variant) retint()

      // A mood change IS a beat. The screens do not have to know how to ask.
      if (prev.mood !== s.mood) {
        const kind: BeatKind | null =
          s.mood === 'boon' ? 'boon' : s.mood === 'curse' ? 'curse' : s.mood === 'shrine' ? 'shrine'
          : s.mood === 'merchant' ? 'merchant' : s.mood === 'contract' ? 'contract' : s.mood === 'mark' ? 'mark'
          : s.mood === 'dead' ? 'death' : s.mood === 'reward' ? 'chest'
          : s.mood === 'fallen' ? 'victory'
          : (s.mood === 'between' && prev.mood === 'fight') ? 'victory' : null
        if (kind) this.beat(kind)
      }
    },

    beat(kind, tint) {
      beatKind = kind
      beatTint = tint ?? (kind === 'legendary' ? 0xffe9a8 : kind === 'victory' ? scene.key : MOOD_TINT[kind === 'chest' ? 'reward' : kind === 'death' ? 'dead' : kind] ?? scene.key)
      beatLen = kind === 'death' ? 2.6 : kind === 'legendary' ? 1.8 : kind === 'curse' ? 1.4 : 1.1
      beatLeft = beatLen
      flare = kind === 'curse' || kind === 'death' ? 0 : kind === 'legendary' ? 3 : 1.6
      pulse.tint = beatTint; wash.tint = beatTint; washBelow.tint = beatTint
      for (const sp of sparks) { sp.p.tint = beatTint; sp.age = 9 }
      // Sparks: up from the deep for a curse or a death, out of the middle for
      // anything good.
      const below = kind === 'curse' || kind === 'death'
      const n = kind === 'legendary' ? BURST_N : kind === 'mark' || kind === 'contract' ? 24 : 40
      for (let i = 0; i < n; i++) {
        const sp = sparks[i]
        sp.age = 0
        sp.life = 0.9 + Math.random() * 0.9
        sp.s = 3 + Math.random() * 6
        const a = below ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2
        const v = below ? 160 + Math.random() * 260 : 90 + Math.random() * 220
        sp.vx = Math.cos(a) * v; sp.vy = Math.sin(a) * v - (below ? 0 : 60)
        sp.x = NaN // placed on the first advance, where W and H are known
      }
    },

    grade() { return gradeDark },

    advance(dt, t, W, H, heavy, fall) {
      const g = GRADE[scene.mood]
      gradeDark += (g.dark - gradeDark) * Math.min(1, dt * 2.5)
      if (!seeded && W > 1) {
        seeded = true
        for (const m of motes) { m.x = Math.random() * W; m.y = Math.random() * H }
      }
      const deep = scene.deep
      const hc = scene.hardcore

      // ── THE DEEP ─────────────────────────────────────────────────
      deepGlow.x = W * 0.5; deepGlow.y = H * 0.96
      const dg = Math.max(W, H) * (1.1 + 0.2 * Math.sin(t * 0.5))
      deepGlow.width = dg; deepGlow.height = dg * 0.55
      deepGlow.alpha = (hc ? 0.16 : 0.07) + deep * 0.08 + (scene.boss ? 0.06 : 0) + flare * 0.02

      // THE EYE opens at a boss depth and shuts when the boss is gone.
      const wantLid = scene.boss ? 1 : 0
      lid += (wantLid - lid) * Math.min(1, dt * 0.7)
      eye.alpha = lid * (0.55 + 0.1 * Math.sin(t * 1.3))
      if (eye.alpha > 0.005) {
        const R = Math.min(W, H) * 0.42
        eye.x = W * 0.5 + Math.sin(t * 0.23) * W * 0.06
        eye.y = H * 0.84
        iris.width = R * 2.6; iris.height = R * 1.1
        irisRing.width = R * 1.5; irisRing.height = R * 0.62 * lid
        slit.width = R * 0.9; slit.height = R * 0.62 * lid
        slit.x = Math.sin(t * 0.37) * R * 0.18
        slit.alpha = 0.9
        // The Don's eye is a crown's worth of gold; Davy's is cold; hardcore's is red.
        const c = scene.apex ? 0xffd970 : hc ? 0xff4a3a : scene.key
        iris.tint = c; irisRing.tint = c
      }

      // ── THE SILHOUETTES ──────────────────────────────────────────
      // Two bands, the far one smaller and slower. They sit on the horizon
      // band of the frame and breathe with the swell so they read as IN the
      // water. During a fall they tear upward, like everything else.
      const rise = fall * fall * 260
      const hFar = H * 0.30, hNear = H * 0.42
      bandFar.width = W; bandFar.height = hFar
      bandFar.y = H * 0.22 + Math.sin(t * 0.6) * 3 - rise * 0.5
      bandFar.tileScale.set(hFar / 512 * 0.9)
      bandFar.tilePosition.x -= dt * (6 + 14 * heavy)
      bandNear.width = W; bandNear.height = hNear
      bandNear.y = H * 0.16 + Math.sin(t * 0.5 + 1) * 5 - rise
      bandNear.tileScale.set(hNear / 512)
      bandNear.tilePosition.x -= dt * (14 + 30 * heavy)
      bandFar.alpha = 0.26 + deep * 0.12
      bandNear.alpha = 0.46 + deep * 0.14

      // ── THE SHAFTS ───────────────────────────────────────────────
      flare = Math.max(0, flare - dt * 1.4)
      const shaftBase = (hc ? 0.05 : 0.07) * g.shafts * (1 + flare) * (1 - deep * 0.35)
      for (let i = 0; i < shafts.length; i++) {
        const sh = shafts[i]
        sh.x += sh.v * dt
        if (sh.x < -0.1) sh.x += 1.2
        if (sh.x > 1.1) sh.x -= 1.2
        const breathe = 0.6 + 0.4 * Math.sin(t * 0.35 + sh.ph)
        sh.s.x = W * sh.x
        sh.s.width = sh.w * (1 + flare * 0.4)
        sh.s.height = H * 1.15
        if (hc) { sh.s.y = H; sh.s.rotation = Math.PI + Math.sin(t * 0.2 + sh.ph) * 0.12 }
        else { sh.s.y = -H * 0.05; sh.s.rotation = Math.sin(t * 0.2 + sh.ph) * 0.14 + 0.18 }
        sh.s.alpha = shaftBase * breathe
      }

      // ── THE MOTES ────────────────────────────────────────────────
      const nM = Math.round(MOTE_N * Math.min(1, (0.5 + deep * 0.5) * g.motes))
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        if (i >= nM) { if (m.p.alpha) m.p.alpha = 0; continue }
        if (hc) { m.vy = -(30 + 40 * heavy); m.vx = Math.sin(t * 1.1 + m.ph) * 18 }
        else if (scene.variant === 'don') { m.vy = -8 + Math.sin(t * 0.7 + m.ph) * 6; m.vx = 10 + Math.cos(t * 0.5 + m.ph) * 8 }
        else { m.vy = -14 - 10 * heavy; m.vx = -12 + Math.sin(t * 0.8 + m.ph) * 14 }
        m.x += m.vx * dt; m.y += (m.vy - rise * 0.6) * dt
        if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W }
        if (m.y > H + 20) { m.y = -20; m.x = Math.random() * W }
        if (m.x < -20) m.x = W + 20
        if (m.x > W + 20) m.x = -20
        m.p.x = m.x; m.p.y = m.y
        const s = (scene.variant === 'don' && !hc ? 2 + 1.5 * Math.sin(t * 3 + m.ph) : 2.5 + (i % 5)) * (1 + flare * 0.3)
        m.p.scaleX = s / 32; m.p.scaleY = s / 32
        const tw = scene.variant === 'don' && !hc ? Math.max(0, Math.sin(t * 2.2 + m.ph * 3)) : 0.6 + 0.4 * Math.sin(t * 1.4 + m.ph)
        m.p.alpha = (hc ? 0.5 : 0.34) * tw * (0.6 + 0.4 * g.motes)
      }

      // ── THE VIGNETTE ─────────────────────────────────────────────
      const va = 0.35 + deep * 0.35 + gradeDark * 0.6
      const ve = Math.max(W, H) * 0.34
      // top, bottom, left, right
      edges[0].x = 0; edges[0].y = 0; edges[0].rotation = 0; edges[0].width = W; edges[0].height = ve * 0.7
      edges[1].x = W; edges[1].y = H; edges[1].rotation = Math.PI; edges[1].width = W; edges[1].height = ve
      edges[2].x = 0; edges[2].y = H; edges[2].rotation = -Math.PI / 2; edges[2].width = H; edges[2].height = ve * 0.8
      edges[3].x = W; edges[3].y = 0; edges[3].rotation = Math.PI / 2; edges[3].width = H; edges[3].height = ve * 0.8
      for (const e of edges) e.alpha = va

      // ── THE BEATS ────────────────────────────────────────────────
      if (beatLeft > 0) {
        beatLeft -= dt
        const u = 1 - beatLeft / beatLen
        const env = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 0.88)
        const below = beatKind === 'curse' || beatKind === 'death'
        if (below) {
          washBelow.x = 0; washBelow.y = H; washBelow.width = W; washBelow.height = H * 0.9
          washBelow.alpha = env * (beatKind === 'death' ? 0.5 : 0.36)
          wash.alpha = 0
        } else {
          wash.width = W; wash.height = H
          wash.alpha = env * (beatKind === 'legendary' ? 0.34 : 0.14)
          washBelow.alpha = 0
        }
        const cx = W * 0.5, cy = below ? H * 0.9 : H * 0.5
        const pr = Math.min(W, H) * (0.2 + u * 2.2)
        pulse.x = cx; pulse.y = cy
        pulse.width = pr; pulse.height = pr * (below ? 0.5 : 0.7)
        pulse.alpha = (1 - u) * (beatKind === 'legendary' ? 0.8 : 0.5)
        for (const sp of sparks) {
          if (sp.age >= sp.life) { if (sp.p.alpha) sp.p.alpha = 0; continue }
          if (Number.isNaN(sp.x)) { sp.x = cx + (Math.random() - 0.5) * W * 0.3; sp.y = cy }
          sp.age += dt
          sp.vy += (below ? -40 : 120) * dt
          sp.x += sp.vx * dt; sp.y += sp.vy * dt
          sp.p.x = sp.x; sp.p.y = sp.y
          const k = 1 - sp.age / sp.life
          sp.p.scaleX = (sp.s * k) / 32; sp.p.scaleY = (sp.s * k) / 32
          sp.p.alpha = k
        }
      } else if (pulse.alpha || wash.alpha || washBelow.alpha) {
        pulse.alpha = 0; wash.alpha = 0; washBelow.alpha = 0
        for (const sp of sparks) sp.p.alpha = 0
      }
    },

    destroy() { far.destroy({ children: true }); near.destroy({ children: true }) },
  }
}
