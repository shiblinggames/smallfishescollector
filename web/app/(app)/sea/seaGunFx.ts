// ── WHAT THE GUNS DO TO THE WATER ───────────────────────────────────────────
//
// The fight happens on the chart now, between the two hulls that are actually
// floating there — and until this file, the sea took no notice of it. A
// broadside was a number and a log line over water that stayed glassy.
//
// So: a hull fires and the muzzle flashes, smoke rolls off her side and leans
// away downwind, and the shot lands somewhere. A hit puts a ring and a burst of
// spray on the surface; a miss throws a column of water where it went in. None
// of it decides anything — the fight has already resolved by the time any of
// this is asked for — which is exactly why it is safe to drop a frame of it or
// unmount it mid-flight.
//
// ── ON THE SEA'S OWN CANVAS, AND WHY THAT IS NEWLY ALLOWED ──────────────────
//
// `components/DialFx` records that a Pixi effects layer for raids took the
// chart down: a browser allows few live WebGL contexts and evicts the oldest,
// which was the sea. That reasoning was about a SECOND context, opened by a
// raid on its own page. There is no second context here. The fight is an
// overlay ON the chart, so this draws into the sea's existing renderer through
// the same handle the wake and the splash use — one context, nothing evicted.
//
// IF A RAID EVER GETS ITS OWN PAGE-LEVEL FX LAYER AGAIN, that rule comes back.
//
// ── PLANE AND AIR ───────────────────────────────────────────────────────────
//
// The house convention, same as seaSplash: a thing LYING ON the water is
// squashed by GROUND, and a thing in the AIR at height h is lifted by h/GROUND
// because the container it sits in is already squashed. Rings are on the water.
// Flash, smoke and spray are above it. Getting that backwards is what makes an
// effect look painted onto the sea rather than happening in it.
//
// ── EVERYTHING IS POOLED ────────────────────────────────────────────────────
//
// Every particle is allocated once and reused off a ring buffer. A fight is the
// worst moment in the game to be allocating: the aim bar is being tracked by
// eye on the same thread, and it is the first thing to show a collection.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

/** Smoke puffs alive at once. A broadside throws six or seven; this is enough
 *  for three overlapping volleys before the oldest is recycled. */
const SMOKE_CAP = 28
/** Spray droplets. Spray is cheap, short-lived and the thing that sells water. */
const SPRAY_CAP = 64
/** Rings on the surface. Two per impact at most, and impacts do not overlap
 *  much in a turn-based fight. */
const RING_CAP = 10
/** Muzzle flashes. Two hulls, and a flash lasts a tenth of a second. */
const FLASH_CAP = 6

let puffTex: Texture | null = null
let ringTex: Texture | null = null
let sparkTex: Texture | null = null

/** A soft round blob. Smoke, and the flash's bloom. */
function puffTexture(PIXI: typeof import('pixi.js')): Texture {
  if (puffTex) return puffTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  // A LONG SKIRT. Smoke has no edge, and a hard one reads as a sticker.
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  puffTex = PIXI.Texture.from(c)
  return puffTex
}

/** The ring an impact leaves ON the water. Soft on both sides, like the wake's:
 *  a hard stroke scaled up turns into a dotted line. */
function ringTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.70, 'rgba(255,255,255,0)')
  grad.addColorStop(0.88, 'rgba(255,255,255,1)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

/** A droplet. Tiny and bright; it only ever appears in groups. */
function sparkTexture(PIXI: typeof import('pixi.js')): Texture {
  if (sparkTex) return sparkTex
  const S = 16
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  sparkTex = PIXI.Texture.from(c)
  return sparkTex
}

type Puff = {
  p: Particle
  x: number; y: number
  vx: number; vy: number
  h: number; vh: number
  age: number; life: number
  size: number; grow: number
  alpha: number
}

type Drop = {
  p: Particle
  x: number; y: number
  vx: number; vy: number
  h: number; vh: number
  age: number; life: number
  size: number
}

type Ring = {
  p: Particle
  x: number; y: number
  age: number; life: number
  from: number; to: number
  alpha: number
}

export type ImpactKind = 'hit' | 'crit' | 'miss'

export type GunFx = {
  view: Container
  /**
   * A HULL FIRES. `x,y` is where she is; `tx,ty` is what she is shooting at,
   * which is all the smoke needs to know to roll off the right side of her.
   */
  fire(x: number, y: number, tx: number, ty: number): void
  /** A SHOT ARRIVES. `kind` sets the weight of it. */
  impact(x: number, y: number, kind: ImpactKind): void
  advance(dt: number): void
  /** Darkness 0..1. Smoke and spray are lit by the same sun everything else is. */
  night(dark: number): void
  destroy(): void
}

export function makeGunFx(PIXI: typeof import('pixi.js')): GunFx {
  const view: Container = new PIXI.Container()
  view.eventMode = 'none'

  // Three layers, and the order is the picture: rings are IN the water, spray
  // and smoke are above it. Rings first so a droplet can fall in front of the
  // ring its own impact made.
  const ringLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  const smokeLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  const sprayLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  // SPRAY IS LIT, SMOKE IS NOT. Water throwing back the sun is brighter than
  // what is behind it; powder smoke is a solid thing that hides what is behind
  // it, and adding it would make a broadside look like a firework.
  sprayLayer.blendMode = 'add'
  view.addChild(ringLayer)
  view.addChild(smokeLayer)
  view.addChild(sprayLayer)

  const pt = puffTexture(PIXI), rt = ringTexture(PIXI), st = sparkTexture(PIXI)

  const smoke: Puff[] = []
  for (let i = 0; i < SMOKE_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: pt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    smokeLayer.addParticle(p)
    smoke.push({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0, grow: 0, alpha: 0 })
  }
  let ns = 0
  const takeSmoke = () => { const s = smoke[ns]; ns = (ns + 1) % SMOKE_CAP; return s }

  const flashes: Puff[] = []
  for (let i = 0; i < FLASH_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: pt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    sprayLayer.addParticle(p)
    flashes.push({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0, grow: 0, alpha: 0 })
  }
  let nf = 0
  const takeFlash = () => { const f = flashes[nf]; nf = (nf + 1) % FLASH_CAP; return f }

  const drops: Drop[] = []
  for (let i = 0; i < SPRAY_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: st })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    sprayLayer.addParticle(p)
    drops.push({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0 })
  }
  let nd = 0
  const takeDrop = () => { const d = drops[nd]; nd = (nd + 1) % SPRAY_CAP; return d }

  const rings: Ring[] = []
  for (let i = 0; i < RING_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: rt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    ringLayer.addParticle(p)
    rings.push({ p, x: 0, y: 0, age: 1, life: 1, from: 0, to: 0, alpha: 0 })
  }
  let nr = 0
  const takeRing = () => { const r = rings[nr]; nr = (nr + 1) % RING_CAP; return r }

  let dark = 0

  /** Gravity on HEIGHT, in world px per second squared. Not on y: y is a place
   *  on the sea and height is how far above it a thing is. */
  const G = 900

  return {
    view,
    night(d) { dark = d },

    fire(x, y, tx, ty) {
      // Which way the guns are pointing, as a unit vector on the plane. The
      // smoke leaves along it and the flash sits a little way down it, off her
      // side rather than in the middle of her deck.
      const dx = tx - x, dy = ty - y
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len

      // THE FLASH. One bloom, gone in a tenth of a second, sitting at the gun
      // line and a little above the water.
      const f = takeFlash()
      f.x = x + ux * 90; f.y = y + uy * 90
      f.h = 34; f.vh = 0; f.vx = 0; f.vy = 0
      f.age = 0; f.life = 0.11
      f.size = 150; f.grow = 320
      f.alpha = 0.95
      f.p.tint = 0xffe3a8

      // THE SMOKE. Six puffs leaving along the gun line, spreading as they go
      // and rising slowly. Powder smoke hangs — these live over a second, which
      // is long enough to still be there when the shot lands.
      for (let i = 0; i < 6; i++) {
        const s = takeSmoke()
        const spread = (Math.random() - 0.5) * 0.5
        const sx = ux * Math.cos(spread) - uy * Math.sin(spread)
        const sy = ux * Math.sin(spread) + uy * Math.cos(spread)
        const out = 120 + Math.random() * 190
        s.x = x + ux * (60 + i * 26)
        s.y = y + uy * (60 + i * 26)
        s.vx = sx * out
        s.vy = sy * out * GROUND
        s.h = 26 + Math.random() * 30
        s.vh = 18 + Math.random() * 26
        s.age = 0
        s.life = 1.1 + Math.random() * 0.7
        s.size = 70 + Math.random() * 60
        s.grow = 170 + Math.random() * 120
        s.alpha = 0.30 + Math.random() * 0.16
        s.p.tint = 0xd9dee6
      }

      // AND THE WATER SHE SHOVES ASIDE. A broadside moves a ship; one soft ring
      // under her says so without touching the hull's own animation.
      const r = takeRing()
      r.x = x + ux * 70; r.y = y + uy * 70
      r.age = 0; r.life = 0.85
      r.from = 40; r.to = 210
      r.alpha = 0.22
      r.p.tint = 0xdfeaf2
    },

    impact(x, y, kind) {
      const heavy = kind === 'crit'
      const wet = kind === 'miss'

      // THE RING. A miss puts the biggest one on the water — all of that shot's
      // energy went into the sea. A crit is a hard, fast ring; a hit is modest,
      // because most of it went into a hull.
      const r = takeRing()
      r.x = x; r.y = y
      r.age = 0
      r.life = wet ? 1.05 : heavy ? 0.8 : 0.66
      r.from = 30
      r.to = wet ? 420 : heavy ? 380 : 240
      r.alpha = wet ? 0.42 : heavy ? 0.5 : 0.3
      r.p.tint = heavy ? 0xffd88a : 0xe8f2f8

      // A crit gets a second, later, wider one. Two rings read as a bigger
      // event than one ring drawn twice as large.
      if (heavy) {
        const r2 = takeRing()
        r2.x = x; r2.y = y
        r2.age = -0.09
        r2.life = 0.9
        r2.from = 40; r2.to = 540
        r2.alpha = 0.26
        r2.p.tint = 0xffd88a
      }

      // THE SPRAY. A miss throws a column — mostly up, barely outward, which is
      // what a shot going into water looks like. A hit sprays sideways off the
      // hull it struck.
      const n = wet ? 22 : heavy ? 20 : 12
      for (let i = 0; i < n; i++) {
        const d = takeDrop()
        const a = Math.random() * Math.PI * 2
        const out = wet
          ? 30 + Math.random() * 90
          : 120 + Math.random() * 230
        d.x = x; d.y = y
        d.vx = Math.cos(a) * out
        d.vy = Math.sin(a) * out * GROUND
        d.h = 6
        d.vh = wet
          ? 300 + Math.random() * 260
          : 130 + Math.random() * 210
        d.age = 0
        d.life = 0.5 + Math.random() * 0.5
        d.size = (wet ? 12 : 9) + Math.random() * 9
        d.p.tint = heavy ? 0xffe6b0 : 0xeaf6ff
      }
    },

    advance(dt) {
      // Lit by the same sun as everything else. Not switched off after dark —
      // a muzzle flash is its OWN light and is the one thing out here that gets
      // brighter at night, so only the smoke and the spray dim.
      const lit = 1 - dark * 0.45

      for (const s of smoke) {
        if (s.age >= s.life) { if (s.p.alpha) s.p.alpha = 0; continue }
        s.age += dt
        const t = s.age / s.life
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.h += s.vh * dt
        // Smoke slows as it spreads. It is losing to the air, not falling.
        s.vx -= s.vx * Math.min(1, 1.5 * dt)
        s.vy -= s.vy * Math.min(1, 1.5 * dt)
        const size = s.size + s.grow * t
        s.p.x = s.x
        s.p.y = s.y - s.h / GROUND
        s.p.scaleX = size / 64
        s.p.scaleY = size / 64
        // In fast, out slow: a puff arrives at once and then thins.
        s.p.alpha = s.alpha * lit * Math.min(1, t * 8) * (1 - t) * (1 - t)
      }

      for (const f of flashes) {
        if (f.age >= f.life) { if (f.p.alpha) f.p.alpha = 0; continue }
        f.age += dt
        const t = f.age / f.life
        const size = f.size + f.grow * t
        f.p.x = f.x
        f.p.y = f.y - f.h / GROUND
        f.p.scaleX = size / 64
        f.p.scaleY = size / 64
        f.p.alpha = f.alpha * (1 - t) * (1 - t)
      }

      for (const d of drops) {
        if (d.age >= d.life) { if (d.p.alpha) d.p.alpha = 0; continue }
        d.age += dt
        const t = d.age / d.life
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.vh -= G * dt
        d.h += d.vh * dt
        // BACK IN THE WATER AND DONE. A droplet that fell through the surface
        // and kept going would trail off below the sea.
        if (d.h <= 0) { d.age = d.life; d.p.alpha = 0; continue }
        d.p.x = d.x
        d.p.y = d.y - d.h / GROUND
        d.p.scaleX = d.size / 16
        d.p.scaleY = d.size / 16
        d.p.alpha = lit * (1 - t)
      }

      for (const r of rings) {
        // A negative age is a ring waiting its turn — see the crit's second.
        if (r.age >= r.life) { if (r.p.alpha) r.p.alpha = 0; continue }
        r.age += dt
        if (r.age < 0) continue
        const t = r.age / r.life
        // Fast then slow, like water actually spreading.
        const e = 1 - (1 - t) * (1 - t)
        const rad = r.from + (r.to - r.from) * e
        r.p.x = r.x
        r.p.y = r.y
        r.p.scaleX = (rad * 2) / 128
        // ON THE PLANE. This is the line between a ring lying on the sea and a
        // hoop standing up out of it.
        r.p.scaleY = ((rad * 2) / 128) * GROUND
        r.p.alpha = r.alpha * lit * (1 - t)
      }
    },

    destroy() {
      view.destroy({ children: true })
    },
  }
}
