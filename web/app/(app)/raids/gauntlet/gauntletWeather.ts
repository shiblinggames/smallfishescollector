// ── THE WEATHER OF A DESCENT ────────────────────────────────────────────────
//
// What the gauntlet's arena does that the open sea does not: it gets worse as
// you fall. One dial, `heavy` — depth, plus Pressure if terms are signed, plus
// whatever a boss adds — and everything below reads it.
//
// The chart's own squall layer is not reused, and the reason is structural
// rather than taste: it spawns squalls into WORLD CELLS around a moving camera,
// so in an arena whose camera never moves it would either sit on one cell
// forever or produce nothing at all. This is the same idea rebuilt for a fixed
// frame, which is a different problem.
//
// ── WHAT IT DRAWS ───────────────────────────────────────────────────────────
//
//   RAIN      angled streaks, denser and faster with the dial. In the air,
//             over everything, because rain is between you and the fight.
//   THE RISE  bubbles and torn weed going UP past the camera. This is the one
//             that says DESCENT rather than storm: things rise past a thing
//             that is sinking, and nothing else on screen can say that.
//   CHOP      pale streaks tearing across the surface, low and fast.
//   THE BOLT  a hard flash of the run's own colour with a fork in it. Rare and
//             short at the top of a dive, frequent and violent at the bottom.
//   THE MAW   at a boss depth only: a slow spiral turning over the whole
//             arena, so the last fight of a stretch is fought inside something.
//
// Every pool is fixed and recycled. Nothing here allocates after construction,
// because this runs sixty times a second under a fight that is already asking
// for the frame.

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'

const RAIN_N = 200
const RISE_N = 90
const CHOP_N = 26

let dotTex: Texture | null = null
let lineTex: Texture | null = null
let spiralTex: Texture | null = null
let glowTex: Texture | null = null

function dot(PIXI: typeof import('pixi.js')): Texture {
  if (dotTex) return dotTex
  const S = 32
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return (dotTex = PIXI.Texture.from(c))
}

/** A soft vertical streak, for rain and for chop. Drawn once and stretched. */
function line(PIXI: typeof import('pixi.js')): Texture {
  if (lineTex) return lineTex
  const W = 8, H = 64
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.95)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(W / 2 - 1, 0, 2, H)
  g.filter = 'blur(1.5px)'
  g.drawImage(c, 0, 0)
  return (lineTex = PIXI.Texture.from(c))
}

function glow(PIXI: typeof import('pixi.js')): Texture {
  if (glowTex) return glowTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.28)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return (glowTex = PIXI.Texture.from(c))
}

/** The maw: a broad slow spiral, white, for a boss depth to turn overhead. */
function spiral(PIXI: typeof import('pixi.js')): Texture {
  if (spiralTex) return spiralTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2, cy = S / 2
  g.lineCap = 'round'
  for (let a = 0; a < 4; a++) {
    const off = (a / 4) * Math.PI * 2
    let px = 0, py = 0
    for (let i = 0; i <= 150; i++) {
      const t = i / 150
      const th = off + t * Math.PI * 2 * 1.5
      const r = 10 + Math.pow(t, 0.9) * (S / 2 - 14)
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r
      if (i > 0) {
        g.strokeStyle = 'rgba(255,255,255,' + (0.1 + 0.5 * Math.sin(t * Math.PI)).toFixed(3) + ')'
        g.lineWidth = 20 * (0.3 + t)
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke()
      }
      px = x; py = y
    }
  }
  const out = document.createElement('canvas')
  out.width = S; out.height = S
  const og = out.getContext('2d')!
  og.filter = 'blur(6px)'
  og.drawImage(c, 0, 0)
  return (spiralTex = PIXI.Texture.from(out))
}

export type WeatherTheme = {
  /** The run's own colour: the bolt, the bubbles, the maw all take it. */
  key: number
  /** The rain and chop, which are water rather than magic. */
  pale: number
}

export type Weather = {
  /** On the water, under the hulls: chop and the maw. */
  water: Container
  /** In the air, over everything: rain, the rise, the bolt. */
  air: Container
  /**
   * `heavy` 0..1 is how bad it is here. `boss` turns the maw on. `fall` is
   * pushed to 1 by a descent and decays, and while it is up the rise tears
   * past hard — which is the whole trick of making a cut read as a drop.
   */
  advance(dt: number, t: number, W: number, H: number, heavy: number, boss: boolean, fall: number): void
  theme(t: WeatherTheme): void
  destroy(): void
}

export function makeWeather(PIXI: typeof import('pixi.js')): Weather {
  const water: Container = new PIXI.Container()
  const air: Container = new PIXI.Container()
  water.eventMode = 'none'
  air.eventMode = 'none'

  const dotT = dot(PIXI), lineT = line(PIXI), glowT = glow(PIXI), spiralT = spiral(PIXI)
  let th: WeatherTheme = { key: 0x8fe9ff, pale: 0xcfe6f0 }

  // ── THE MAW, on the water ───────────────────────────────────────────
  const maw: Sprite = new PIXI.Sprite(spiralT)
  maw.anchor.set(0.5)
  maw.alpha = 0
  maw.blendMode = 'add'
  water.addChild(maw)

  const chopLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  chopLayer.blendMode = 'add'
  water.addChild(chopLayer)
  type Streak = { p: Particle; x: number; y: number; vx: number; life: number; age: number; len: number }
  const chop: Streak[] = []
  for (let i = 0; i < CHOP_N; i++) {
    const p: Particle = new PIXI.Particle({ texture: lineT })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    p.rotation = Math.PI / 2
    p.tint = th.pale
    chopLayer.addParticle(p)
    chop.push({ p, x: 0, y: 0, vx: 0, life: 1, age: 1, len: 40 })
  }

  // ── THE RAIN and THE RISE, in the air ───────────────────────────────
  const rainLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  rainLayer.blendMode = 'add'
  const riseLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  riseLayer.blendMode = 'add'
  air.addChild(riseLayer, rainLayer)

  type Drop = { p: Particle; x: number; y: number; v: number; len: number; a: number }
  const rain: Drop[] = []
  for (let i = 0; i < RAIN_N; i++) {
    const p: Particle = new PIXI.Particle({ texture: lineT })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    p.tint = th.pale
    rainLayer.addParticle(p)
    rain.push({ p, x: 0, y: 0, v: 900, len: 30, a: 0.4 })
  }

  type Bubble = { p: Particle; x: number; y: number; v: number; size: number; wob: number; a: number }
  const rise: Bubble[] = []
  for (let i = 0; i < RISE_N; i++) {
    const p: Particle = new PIXI.Particle({ texture: dotT })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    p.tint = th.key
    riseLayer.addParticle(p)
    rise.push({ p, x: 0, y: 0, v: 90, size: 5, wob: Math.random() * 6.28, a: 0.4 })
  }

  // ── THE BOLT ────────────────────────────────────────────────────────
  const flash: Sprite = new PIXI.Sprite(PIXI.Texture.WHITE)
  flash.alpha = 0
  flash.blendMode = 'add'
  air.addChild(flash)
  const forks: Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const s: Sprite = new PIXI.Sprite(glowT)
    s.anchor.set(0.5, 0)
    s.alpha = 0
    s.blendMode = 'add'
    air.addChild(s)
    forks.push(s)
  }
  let boltLeft = 0
  let nextBolt = 3 + Math.random() * 4

  let seeded = false

  return {
    water,
    air,
    theme(next) {
      th = next
      for (const d of rain) d.p.tint = next.pale
      for (const c of chop) c.p.tint = next.pale
      for (const b of rise) b.p.tint = next.key
      maw.tint = next.key
      flash.tint = next.key
      for (const f of forks) f.tint = next.key
    },

    advance(dt, t, W, H, heavy, boss, fall) {
      // First frame with a real viewport: scatter everything so nothing walks
      // on from an edge in a visible line.
      if (!seeded && W > 1) {
        seeded = true
        for (const d of rain) { d.x = Math.random() * W; d.y = Math.random() * H }
        for (const b of rise) { b.x = Math.random() * W; b.y = Math.random() * H }
      }

      // ── THE RAIN ─────────────────────────────────────────────────
      // Angled, and the angle steepens with the weather. Only as many drops
      // as the dial asks for: the rest are parked at zero alpha and cost a
      // loop iteration, which is the cheapest possible way to have a density
      // control.
      const nRain = Math.round(RAIN_N * Math.min(1, heavy * 1.15))
      const drift = 90 + 220 * heavy
      for (let i = 0; i < rain.length; i++) {
        const d = rain[i]
        if (i >= nRain) { if (d.p.alpha) d.p.alpha = 0; continue }
        d.v = 800 + 900 * heavy
        d.y += d.v * dt
        d.x += drift * dt
        if (d.y > H + 40) { d.y = -40 - Math.random() * 120; d.x = Math.random() * (W + 200) - 100 }
        if (d.x > W + 60) d.x -= W + 120
        d.p.x = d.x; d.p.y = d.y
        d.p.rotation = Math.atan2(d.v, drift) - Math.PI / 2
        d.p.scaleX = (0.6 + 0.5 * heavy) / 8 * 4
        d.p.scaleY = (26 + 48 * heavy) / 64
        d.p.alpha = (0.16 + 0.3 * heavy) * (0.6 + 0.4 * Math.random())
      }

      // ── THE RISE ─────────────────────────────────────────────────
      // Things going UP past a thing going DOWN. During a fall they tear.
      const rush = 1 + fall * 7
      const nRise = Math.round(RISE_N * Math.min(1, 0.35 + heavy))
      for (let i = 0; i < rise.length; i++) {
        const b = rise[i]
        if (i >= nRise) { if (b.p.alpha) b.p.alpha = 0; continue }
        b.y -= (60 + 130 * heavy) * rush * dt
        if (b.y < -30) {
          b.y = H + 20 + Math.random() * 120
          b.x = Math.random() * W
          b.size = 3 + Math.random() * 7
          b.wob = Math.random() * 6.28
        }
        b.p.x = b.x + Math.sin(t * 1.7 + b.wob) * (6 + 10 * fall)
        b.p.y = b.y
        const s = b.size * (1 + fall * 0.6)
        b.p.scaleX = s / 32; b.p.scaleY = (s * (1 + fall * 2.2)) / 32
        b.p.alpha = (0.2 + 0.4 * heavy) * (0.5 + 0.5 * fall)
      }

      // ── THE CHOP ─────────────────────────────────────────────────
      const nChop = Math.round(CHOP_N * heavy)
      for (let i = 0; i < chop.length; i++) {
        const c = chop[i]
        if (i >= nChop) { if (c.p.alpha) c.p.alpha = 0; continue }
        c.age += dt
        if (c.age >= c.life) {
          c.age = 0
          c.life = 0.5 + Math.random() * 0.8
          c.x = -60
          c.y = H * (0.28 + Math.random() * 0.62)
          c.vx = 260 + Math.random() * 520 * (0.4 + heavy)
          c.len = 40 + Math.random() * 120 * (0.5 + heavy)
        }
        c.x += c.vx * dt
        c.p.x = c.x; c.p.y = c.y
        c.p.scaleX = 2 / 8
        c.p.scaleY = c.len / 64
        c.p.alpha = Math.sin((c.age / c.life) * Math.PI) * 0.22 * (0.4 + heavy)
      }

      // ── THE MAW ──────────────────────────────────────────────────
      if (boss) {
        maw.x = W * 0.5
        maw.y = H * 0.40
        const d = Math.max(W, H) * 1.9
        maw.width = d; maw.height = d * 0.5
        maw.rotation += dt * 0.16
        maw.alpha = 0.10 + 0.06 * Math.sin(t * 0.7)
      } else if (maw.alpha) {
        maw.alpha = Math.max(0, maw.alpha - dt)
      }

      // ── THE BOLT ─────────────────────────────────────────────────
      // Rare and soft at the top of a dive; at the bottom, and over a boss,
      // it is most of the light in the room.
      nextBolt -= dt * (0.25 + heavy * 1.5 + (boss ? 0.8 : 0))
      if (nextBolt <= 0 && heavy > 0.12) {
        boltLeft = 0.34
        nextBolt = 2.2 + Math.random() * 5 * (1 - heavy * 0.6)
        for (const f of forks) {
          f.x = W * (0.12 + Math.random() * 0.76)
          f.y = -20
          f.width = 30 + Math.random() * 70
          f.height = H * (0.5 + Math.random() * 0.6)
        }
      }
      if (boltLeft > 0) {
        boltLeft -= dt
        const u = 1 - boltLeft / 0.34
        // Two beats: the strike, then the answer. A single ramp reads as a
        // fade; a stutter reads as lightning.
        const env = u < 0.1 ? u / 0.1
          : u < 0.3 ? 0.25 + 0.75 * Math.max(0, 1 - (u - 0.1) / 0.2)
          : Math.max(0, 1 - (u - 0.3) / 0.7) * 0.5
        flash.width = W; flash.height = H
        flash.alpha = env * (0.12 + 0.16 * heavy)
        for (let i = 0; i < forks.length; i++) forks[i].alpha = env * (0.5 - i * 0.14)
      } else if (flash.alpha) {
        flash.alpha = 0
        for (const f of forks) f.alpha = 0
      }
    },

    destroy() { water.destroy({ children: true }); air.destroy({ children: true }) },
  }
}
