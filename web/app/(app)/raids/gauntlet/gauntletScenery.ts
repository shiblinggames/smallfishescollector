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
//   THE FIELD     what is lying on the bottom. Davy's is a drowned
//                 wreck-field: hulks over on their bilges, open ribs, a
//                 leaning mast, and the spoil heaps between them. It is the
//                 only thing in the whole gauntlet with geometry, and it is
//                 what the shafts have to sweep ACROSS for the light to read
//                 as light rather than as a gradient.
//   THE DEEP      a slow pulse of light at the foot of the arena — the thing
//                 under you. At a boss depth it OPENS: an eye, the run's own
//                 colour, that watches the fight from under the water.
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

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'

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
/** How many pieces of wreck are on the bottom. Sixteen is enough to reach
 *  across a wide screen with the far ones thinning out, and few enough that
 *  the whole field is sixteen sprite writes a frame. */
const FIELD_N = 16

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

/**
 * ── WHAT IS LYING ON THE BOTTOM ─────────────────────────────────────────────
 *
 * Four pieces of a drowned wreck-field, drawn white and tinted into the deep
 * water by whoever hosts them. Between them they make a floor: a hull over on
 * her bilge with her stern bitten out, the open ribs of another, a mast still
 * standing in its own heap, and the spoil that everything is sitting in.
 *
 * THEY ARE DELIBERATELY CRUDE. These are seen through a water column at a
 * third to a half of their nearest size and at alpha 0.5 at best. Detail at
 * that distance is mud; what reads is the outline, and the outline has to be
 * unmistakable at a glance — a dome, a ribcage, a diagonal, a lump.
 *
 * EVERY ONE FADES OUT AT THE TOP, and that is not decoration. A shape with a
 * hard upper edge is a cutout stuck on the picture. The thing that says "this
 * is under water" is that its outline stops being certain the further it gets
 * from the floor, because that is more water between it and you. The whole
 * plate is blurred for the same reason before the fade goes on.
 */
const FIELD_W = 512, FIELD_H = 256

function wreck(PIXI: typeof import('pixi.js'), kind: number): Texture {
  return cached('wreck' + kind, () => {
    const W = FIELD_W, H = FIELD_H
    const { c, g } = canvas(W, H)
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'
    g.lineCap = 'round'; g.lineJoin = 'round'

    if (kind === 0) {
      // ── A HULL OVER ON HER BILGE ──────────────────────────────────
      // A long dome, which is what the underside of a ship lying over looks
      // like from any distance at all. Her stern is bitten out, because an
      // unbroken hull on the seabed reads as a whale.
      g.beginPath(); g.ellipse(W * 0.5, H * 1.02, W * 0.4, H * 0.55, 0, Math.PI, 0); g.fill()
      g.globalCompositeOperation = 'destination-out'
      g.beginPath(); g.ellipse(W * 0.84, H * 0.46, W * 0.11, H * 0.42, 0.3, 0, Math.PI * 2); g.fill()
      g.globalCompositeOperation = 'source-over'
      // The keel, a ridge along the top of her.
      g.lineWidth = 7
      g.beginPath(); g.moveTo(W * 0.18, H * 0.62); g.quadraticCurveTo(W * 0.46, H * 0.40, W * 0.7, H * 0.52); g.stroke()
    } else if (kind === 1) {
      // ── THE OPEN RIBS OF ANOTHER ──────────────────────────────────
      // Her planking is long gone. The keel is in the silt and the frames
      // stand off it, tallest amidships, leaning the way she went down.
      g.lineWidth = 9
      g.beginPath(); g.moveTo(W * 0.13, H * 0.95); g.lineTo(W * 0.87, H * 0.9); g.stroke()
      g.lineWidth = 7
      for (let k = 0; k <= 6; k++) {
        const u = k / 6
        const x = W * (0.17 + u * 0.66)
        const h = H * (0.26 + Math.sin(u * Math.PI) * 0.5)
        const lean = (u - 0.35) * W * 0.13
        g.beginPath()
        g.moveTo(x, H * 0.93)
        g.quadraticCurveTo(x + lean * 0.5, H * 0.93 - h * 0.62, x + lean, H * 0.93 - h)
        g.stroke()
      }
    } else if (kind === 2) {
      // ── A MAST STILL STANDING ─────────────────────────────────────
      // The one vertical in the field, and the reason it is here: everything
      // else on this floor is horizontal, and a room with no uprights has no
      // height. It leans, carries one yard and one line still hanging off it,
      // and stands in its own heap so it is not a stick planted in nothing.
      g.beginPath(); g.ellipse(W * 0.34, H * 1.03, W * 0.16, H * 0.16, 0, Math.PI, 0); g.fill()
      g.lineWidth = 11
      g.beginPath(); g.moveTo(W * 0.34, H * 0.97); g.lineTo(W * 0.52, H * 0.08); g.stroke()
      // The yard crosses her, both sides. Hung off one side it reads as a
      // branch, and the cross is the whole reason this shape says "ship".
      g.lineWidth = 7
      g.beginPath(); g.moveTo(W * 0.24, H * 0.63); g.lineTo(W * 0.68, H * 0.49); g.stroke()
      g.lineWidth = 4
      g.beginPath(); g.moveTo(W * 0.6, H * 0.53); g.quadraticCurveTo(W * 0.67, H * 0.78, W * 0.57, H * 0.96); g.stroke()
    } else {
      // ── THE SPOIL EVERYTHING SITS IN ──────────────────────────────
      // The commonest piece, and the humblest. Without it the wrecks are
      // objects floating at various heights; with it they are things resting
      // on a bottom.
      for (const m of [[0.26, 0.23, 0.2], [0.55, 0.29, 0.29], [0.81, 0.19, 0.15]]) {
        g.beginPath(); g.ellipse(W * m[0], H * 1.03, W * m[1], H * m[2], 0, Math.PI, 0); g.fill()
      }
    }

    // Murk, then the dissolve. In that order: blurring after the fade would
    // smear the transparency back up into a haze with an edge of its own.
    const out = canvas(W, H)
    out.g.filter = 'blur(3px)'
    out.g.drawImage(c, 0, 0)
    out.g.filter = 'none'
    out.g.globalCompositeOperation = 'destination-in'
    const fade = out.g.createLinearGradient(0, 0, 0, H)
    fade.addColorStop(0, 'rgba(255,255,255,0.1)')
    fade.addColorStop(0.5, 'rgba(255,255,255,0.66)')
    fade.addColorStop(1, 'rgba(255,255,255,1)')
    out.g.fillStyle = fade
    out.g.fillRect(0, 0, W, H)
    return out.c
  }, PIXI)
}

/** A colour taken down, channel by channel. Never toward black as a colour:
 *  toward a darker version of ITSELF, which is the whole reason the wreckage
 *  does not read as a hole cut in the sea. */
function shade(c: number, k: number): number {
  return (Math.round(((c >> 16) & 255) * k) << 16)
    | (Math.round(((c >> 8) & 255) * k) << 8)
    | Math.round((c & 255) * k)
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

  // ── THE FLOOR OF THE LOCKER ────────────────────────────────────────
  //
  // FIRST, so everything else is in the water in FRONT of it. That ordering is
  // the whole atmospheric trick: the deep's glow and the shafts are additive
  // and land on top, which is exactly what a water column between you and a
  // distant thing does — it washes it out and it takes its colour. Drawn over
  // the light instead, the same shapes would be cardboard held up to a lamp.
  //
  // ── AND IT DOES NOT DRIFT ──────────────────────────────────────────
  //
  // There were two tiling bands of dark shapes scrolling across here once, and
  // they were cut on sight, correctly: things sliding sideways past a static
  // camera is a side-scroller backdrop, and it told you the room was a
  // painting on a roller. A floor is FIXED. The only things that move it are
  // the current, which is a lean of under a degree, and a fall — where it
  // streams up past you and the near pieces go faster than the far, because
  // that is the one moment when you are genuinely moving through the room.
  const fieldLayer: Container = new PIXI.Container()
  far.addChild(fieldLayer)
  type Piece = {
    s: Sprite
    /** Across the frame, 0..1. Fixed for the life of the field. */
    u: number
    /** 0 nearest — low, big, dark. 1 farthest — high, small, nearly gone. */
    d: number
    /** How wide it is in units of the SHORT side, at the nearest depth. */
    w: number
    /** Its own phase in the current. */
    ph: number
    /** Half of them face the other way. A field of identically-handed wrecks
     *  reads as a repeated stamp, which is what it is. */
    flip: number
  }
  const field: Piece[] = []
  {
    // Deterministic: the same wreck-field is on the bottom every visit, so it
    // is a place you come back to rather than a shuffle.
    const r = rng(0x5ea1ed)
    const wreckT = [wreck(PIXI, 0), wreck(PIXI, 1), wreck(PIXI, 2), wreck(PIXI, 3)]
    /** Spoil is commonest because it is the ground; the mast is rarest because
     *  one upright reads as a landmark and four read as a fence. */
    const PICK = [3, 3, 3, 1, 1, 0, 0, 2]
    const WIDE = [0.44, 0.34, 0.3, 0.4]
    for (let i = 0; i < FIELD_N; i++) {
      const kind = PICK[Math.floor(r() * PICK.length)]
      const sp: Sprite = new PIXI.Sprite(wreckT[kind])
      sp.anchor.set(0.5, 1)
      field.push({
        s: sp, u: (i + r() * 0.85) / FIELD_N,
        // Square-rooted, so the far half of the range gets most of the pieces
        // and the field THINS OUT into the murk instead of being a row of
        // things at one distance.
        d: Math.sqrt(r()),
        w: WIDE[kind] * (0.78 + r() * 0.55),
        ph: r() * 6.28,
        flip: r() < 0.5 ? -1 : 1,
      })
    }
    // FARTHEST FIRST. They are added in draw order, so a near hulk is never
    // stacked behind something half its size and twice its distance.
    field.sort((a, b) => b.d - a.d)
    for (const p of field) fieldLayer.addChild(p.s)
  }

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

  // NO SILHOUETTES. Two tiling bands of dark shapes (masts, kelp, ribs) used
  // to drift across the water here. They read as black things moving over
  // the screen and were cut on sight; the light, the motes and the eye say
  // "where" well enough without them.

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
    deepGlow.tint = scene.key
    iris.tint = scene.key; irisRing.tint = scene.key
    for (const sh of shafts) sh.s.tint = scene.hardcore ? 0xff5a4a : scene.key
    const moteTint = scene.hardcore ? 0xff8a4a : scene.variant === 'don' ? 0xffd88a : 0xbfffff
    for (const m of motes) m.p.tint = moteTint
    const edgeTint = scene.hardcore ? 0x1a0206 : scene.variant === 'don' ? 0x02100a : 0x02080e
    for (const e of edges) e.tint = edgeTint
    // THE WRECKAGE IS THE DEEP WATER, TAKEN DOWN. Not black: a black
    // silhouette on a coloured sea is a hole cut in the picture, and that is
    // precisely how the first attempt at scenery here read. The same hue,
    // darker, at half alpha, is something a long way off in murk.
    const wreckTint = shade(scene.deepColor, 0.8)
    for (const p of field) p.s.tint = wreckTint
  }
  retint()

  return {
    far, near,

    set(s) {
      const prev = scene
      scene = s
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
      beatLen = kind === 'death' ? 2.6 : kind === 'legendary' ? 1.8 : kind === 'curse' ? 1.2 : 0.9
      beatLeft = beatLen
      flare = kind === 'curse' || kind === 'death' ? 0 : kind === 'legendary' ? 1.8 : 0.5
      pulse.tint = beatTint; wash.tint = beatTint; washBelow.tint = beatTint
      for (const sp of sparks) { sp.p.tint = beatTint; sp.age = 9 }
      // Sparks: up from the deep for a curse or a death, out of the middle for
      // anything good.
      const below = kind === 'curse' || kind === 'death'
      // A ROUTINE BEAT IS A GLIMMER, NOT A BURST. Forty sparks and a ring
      // across the whole arena fired on every single screen of a dive: boon,
      // curse, shrine, merchant, contract, mark, chest, the win. Something that
      // happens twenty times a run cannot be an event. The count, the ring and
      // the wash below all step down for the ordinary ones and stay for the two
      // that are genuinely rare: a legendary pull and your own death.
      const loudKind = kind === 'legendary' || kind === 'death'
      const n = kind === 'legendary' ? BURST_N : loudKind ? 26 : 12
      for (let i = 0; i < n; i++) {
        const sp = sparks[i]
        sp.age = 0
        sp.life = 0.9 + Math.random() * 0.9
        sp.s = 3 + Math.random() * 6
        const a = below ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2
        const v = (below ? 160 + Math.random() * 260 : 90 + Math.random() * 220) * (loudKind ? 1 : 0.6)
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
      // IN THE OPEN WATER, not at the foot of the frame. The bottom third of
      // a fight is the log and the guns, so anything drawn there is drawn for
      // nobody. The deep pools under the engagement itself, between the hulls.
      deepGlow.x = W * 0.5; deepGlow.y = H * 0.5
      const dg = Math.max(W, H) * (1.0 + 0.16 * Math.sin(t * 0.5))
      deepGlow.width = dg; deepGlow.height = dg * 0.6
      deepGlow.alpha = (hc ? 0.16 : 0.07) + deep * 0.08 + (scene.boss ? 0.06 : 0) + flare * 0.02

      // THE EYE opens at a boss depth and shuts when the boss is gone.
      const wantLid = scene.boss ? 1 : 0
      lid += (wantLid - lid) * Math.min(1, dt * 0.7)
      eye.alpha = lid * (0.62 + 0.1 * Math.sin(t * 1.3))
      if (eye.alpha > 0.005) {
        // The eye watches from UNDER the fight, between the two hulls, where
        // the water is open and both ships are in its gaze. Big enough that
        // its rim reaches past them: the fight happens inside it.
        const R = Math.min(W, H) * 0.5
        eye.x = W * 0.5 + Math.sin(t * 0.23) * W * 0.05
        eye.y = H * 0.47
        iris.width = R * 2.6; iris.height = R * 1.1
        irisRing.width = R * 1.5; irisRing.height = R * 0.62 * lid
        slit.width = R * 0.9; slit.height = R * 0.62 * lid
        slit.x = Math.sin(t * 0.37) * R * 0.18
        slit.alpha = 0.9
        // The Don's eye is a crown's worth of gold; Davy's is cold; hardcore's is red.
        const c = scene.apex ? 0xffd970 : hc ? 0xff4a3a : scene.key
        iris.tint = c; irisRing.tint = c
      }

      // During a fall everything tears upward, like the weather's rise.
      const rise = fall * fall * 260

      // ── THE FLOOR ────────────────────────────────────────────────
      //
      // Placed between two lines of the frame rather than on a horizon: the
      // near pieces sit at 0.61 of the height and the far ones at 0.27, and
      // everything in between reads as distance because it is smaller, higher
      // and fainter all at once.
      //
      // BOTH ENDS OF THE FRAME ARE SPOKEN FOR and neither is this. The bottom
      // third of a fight is the log and the guns, and in the hub it is the
      // moorings and the helm; the top is the HUD. The field lives in the band
      // between them, which is the band that had nothing in it at all.
      const fieldOn = scene.variant === 'davy' ? 1 : 0
      const U = Math.min(W, H)
      for (const p of field) {
        if (!fieldOn) { if (p.s.alpha) p.s.alpha = 0; continue }
        const k = 1 - p.d
        const wide = U * p.w * (0.4 + 0.6 * k)
        p.s.width = wide
        p.s.height = wide * (FIELD_H / FIELD_W)
        // The width setter writes a positive scale, so the handedness has to
        // go back on after it, every frame.
        p.s.scale.x = Math.abs(p.s.scale.x) * p.flip
        p.s.x = W * (-0.06 + p.u * 1.12)
        // The fall is parallax: the near ones tear up past you and the far
        // ones barely move, which is the only cue in the whole descent that
        // says how fast you are going down.
        p.s.y = H * (0.27 + 0.34 * k) - rise * (0.3 + 0.7 * k)
        // A lean, not a drift. Under a degree, anchored at the foot, so the
        // tops of the masts and ribs breathe with the current and nothing
        // ever leaves the spot it is standing on.
        p.s.rotation = Math.sin(t * 0.17 + p.ph) * 0.014 * k
        // Fainter with distance, fainter as the water gets deeper and murkier,
        // and fainter still under a curse — the room goes with the light.
        p.s.alpha = (0.1 + 0.42 * k) * (1 - gradeDark * 0.7) * (1 - deep * 0.28)
      }

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
        const loud = beatKind === 'legendary' || beatKind === 'death'
        if (below) {
          washBelow.x = 0; washBelow.y = H; washBelow.width = W; washBelow.height = H * 0.9
          washBelow.alpha = env * (beatKind === 'death' ? 0.26 : 0.14)
          wash.alpha = 0
        } else {
          wash.width = W; wash.height = H
          wash.alpha = env * (beatKind === 'legendary' ? 0.16 : 0.05)
          washBelow.alpha = 0
        }
        const cx = W * 0.5, cy = below ? H * 0.9 : H * 0.5
        // AND IT NO LONGER LEAVES THE SCREEN. The ring grew to 2.4x the short
        // side, so what you saw was a wall of light sweeping past you rather
        // than a halo opening on the water. It stays inside the arena now.
        const pr = Math.min(W, H) * (0.25 + u * (loud ? 1.4 : 0.85))
        pulse.x = cx; pulse.y = cy
        pulse.width = pr; pulse.height = pr * (below ? 0.5 : 0.7)
        pulse.alpha = (1 - u) * (beatKind === 'legendary' ? 0.28 : loud ? 0.2 : 0.12)
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
