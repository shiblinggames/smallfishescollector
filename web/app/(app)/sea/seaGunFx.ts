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
const SMOKE_CAP = 64
/** Spray droplets. Spray is cheap, short-lived and the thing that sells water. */
const SPRAY_CAP = 128
/** Rings on the surface. Two per impact at most, and impacts do not overlap
 *  much in a turn-based fight. */
const RING_CAP = 20
/** Muzzle flashes. Two hulls, and a flash lasts a tenth of a second. */
const FLASH_CAP = 30
/** Wreckage on the surface. A sinking throws a dozen; two wrecks never overlap
 *  in a turn-based fight, so this is one kill's worth with room to spare. */
const DEBRIS_CAP = 30
/** Slicks. One per wreck, and they outlive everything else here. */
const SLICK_CAP = 5

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

/** WRECKAGE. Thrown clear, then it FLOATS — the difference between this and a
 *  droplet is that a droplet ends when it reaches the water and a plank does
 *  not. */
type Debris = {
  p: Particle
  x: number; y: number
  vx: number; vy: number
  h: number; vh: number
  age: number; life: number
  size: number
  spin: number
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
  /**
   * A CRITICAL. One hard, fast ring travelling much further than an impact's,
   * with the spray to match — the difference between a good hit and a blow
   * the whole bay felt.
   */
  shock(x: number, y: number): void
  /**
   * SHE SLIPS IT. A hard turn throws water off her quarter: a burst of foam
   * away from the shot and a short wake behind it. `dx,dy` is the way she
   * heels, which is away from whatever she is dodging.
   */
  wake(x: number, y: number, dx: number, dy: number): void
  /**
   * A HULL GOES DOWN HERE. The water boils where she was, wreckage comes up
   * and floats, and a slick spreads and stays a while.
   */
  sink(x: number, y: number): void
  /**
   * ── A TRUE BROADSIDE ──────────────────────────────────────────────────────
   *
   * `guns` muzzles arrayed ALONG HER SIDE — perpendicular to the line of fire,
   * because that is where a broadside's guns actually are — going off in a
   * ripple rather than at once, each with its own flash and plume, and the
   * answering walk of shot splashes stitching across the target half a second
   * later. One call; the stagger is negative ages, this layer's own idiom.
   * `heavy` is the Barrage: tighter cadence, harder flashes.
   */
  volley(x: number, y: number, tx: number, ty: number, guns: number, heavy?: boolean): void
  /**
   * THE RAILGUN. A charge swelling at the muzzle, then a lance — a chain of
   * additive cores down the whole line of fire, spray kicking off the water
   * underneath it, a shock at the muzzle and a bigger one where it lands, and
   * spent energy carrying on PAST the target. Nothing arcs; that is the
   * entire point of a railgun.
   */
  railgun(x: number, y: number, tx: number, ty: number, tint: number): void
  /** The silo opens: a thrust column standing straight up off her deck. */
  nukeLaunch(x: number, y: number): void
  /**
   * AND IT COMES DOWN. White core, stacked shockwaves, a tower of water, a
   * fallout dome of slow dark smoke, wreckage, and a slick that stays. The
   * biggest single thing this layer draws, priced accordingly by the caps.
   */
  nukeBlast(x: number, y: number, tint: number): void
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
  // OIL AND WRECKAGE, both DARK, so neither can be additive — adding a dark
  // colour to water does nothing at all. The slick multiplies the sea down the
  // way a squall's shadow does; the wreckage is drawn straight.
  const slickLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  slickLayer.blendMode = 'multiply'
  const debrisLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  // Under the rings: a slick is IN the water and the foam of the sinking that
  // made it is on top.
  view.addChild(slickLayer)
  view.addChild(ringLayer)
  view.addChild(debrisLayer)
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

  const debris: Debris[] = []
  for (let i = 0; i < DEBRIS_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: st })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    p.tint = 0x4a3a2a
    debrisLayer.addParticle(p)
    debris.push({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0, spin: 0 })
  }
  let nde = 0
  const takeDebris = () => { const d = debris[nde]; nde = (nde + 1) % DEBRIS_CAP; return d }

  const slicks: Puff[] = []
  for (let i = 0; i < SLICK_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: pt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    p.tint = 0x5a5f52
    slickLayer.addParticle(p)
    slicks.push({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0, grow: 0, alpha: 0 })
  }
  let nsl = 0
  const takeSlick = () => { const s2 = slicks[nsl]; nsl = (nsl + 1) % SLICK_CAP; return s2 }

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

    shock(x, y) {
      // ONE RING, AND IT TRAVELS. An impact's biggest is 380 over eight tenths
      // of a second; this is nearly twice that in half the time, which is the
      // whole difference between a good hit and a blow the bay felt. Thin and
      // bright rather than heavy: a fast ring reads as pressure, a fat one
      // reads as more water.
      const r = takeRing()
      r.x = x; r.y = y
      r.age = 0; r.life = 0.42
      r.from = 40; r.to = 700
      r.alpha = 0.62
      r.p.tint = 0xfff0c8

      // Thrown flat and hard, all the way round. Low, because this is pressure
      // leaving along the surface rather than water being lifted.
      for (let i = 0; i < 18; i++) {
        const a2 = (i / 18) * Math.PI * 2 + Math.random() * 0.2
        const d = takeDrop()
        const out = 320 + Math.random() * 260
        d.x = x; d.y = y
        d.vx = Math.cos(a2) * out
        d.vy = Math.sin(a2) * out * GROUND
        d.h = 10
        d.vh = 60 + Math.random() * 90
        d.age = 0
        d.life = 0.42 + Math.random() * 0.3
        d.size = 10 + Math.random() * 8
        d.p.tint = 0xffe6b0
      }
    },

    wake(x, y, dx, dy) {
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len

      // THE WATER SHE THROWS COMING OVER. A fan off the quarter she heels
      // away from — foam, not spray, so it is wide and low and short-lived.
      for (let i = 0; i < 14; i++) {
        const spread = (Math.random() - 0.5) * 1.5
        const sx = ux * Math.cos(spread) - uy * Math.sin(spread)
        const sy = ux * Math.sin(spread) + uy * Math.cos(spread)
        const out = 150 + Math.random() * 190
        const d = takeDrop()
        d.x = x + ux * 40; d.y = y + uy * 40
        d.vx = sx * out
        d.vy = sy * out * GROUND
        d.h = 8
        d.vh = 70 + Math.random() * 110
        d.age = 0
        d.life = 0.36 + Math.random() * 0.28
        d.size = 11 + Math.random() * 9
        d.p.tint = 0xeaf6ff
      }

      // And the shove itself, as a low ring pushed out to the side she went.
      const r = takeRing()
      r.x = x + ux * 80; r.y = y + uy * 80
      r.age = 0; r.life = 0.62
      r.from = 40; r.to = 300
      r.alpha = 0.3
      r.p.tint = 0xdfeaf2
    },

    sink(x, y) {
      // ── THE WATER BOILS ─────────────────────────────────────────────────
      //
      // Not one big splash. A hull going down displaces water for SECONDS, in
      // bursts, as it fills and rolls — so this is a long, uneven throw of
      // foam rather than a single event. The staggered ages are what make it
      // read as a ship sinking rather than a shell landing.
      for (let i = 0; i < 26; i++) {
        const d = takeDrop()
        const a2 = Math.random() * Math.PI * 2
        const out = 40 + Math.random() * 220
        d.x = x + Math.cos(a2) * Math.random() * 120
        d.y = y + Math.sin(a2) * Math.random() * 120 * GROUND
        d.vx = Math.cos(a2) * out
        d.vy = Math.sin(a2) * out * GROUND
        d.h = 4
        d.vh = 150 + Math.random() * 320
        // NEGATIVE AGES ARE THE STAGGER. They tick up to zero before anything
        // is drawn, so one call spreads over more than a second.
        d.age = -Math.random() * 1.3
        d.life = 0.6 + Math.random() * 0.6
        d.size = 12 + Math.random() * 12
        d.p.tint = 0xeaf6ff
      }

      // THREE RINGS, WIDENING AND SLOWING. The sea closing over her.
      for (let i = 0; i < 3; i++) {
        const r = takeRing()
        r.x = x; r.y = y
        r.age = -i * 0.34
        r.life = 1.1 + i * 0.3
        r.from = 60 + i * 40
        r.to = 340 + i * 190
        r.alpha = 0.4 - i * 0.09
        r.p.tint = 0xe8f2f8
      }

      // WRECKAGE COMES UP. Thrown clear and then it floats — which is the
      // whole difference between this and spray, and the reason it has its own
      // pool and its own layer.
      for (let i = 0; i < 12; i++) {
        const d = takeDebris()
        const a2 = Math.random() * Math.PI * 2
        const out = 60 + Math.random() * 200
        d.x = x; d.y = y
        d.vx = Math.cos(a2) * out
        d.vy = Math.sin(a2) * out * GROUND
        d.h = 10
        d.vh = 160 + Math.random() * 240
        d.age = -Math.random() * 0.5
        d.life = 5.5 + Math.random() * 2.5
        d.size = 9 + Math.random() * 12
        d.spin = (Math.random() - 0.5) * 2.2
      }

      // AND WHAT SHE LEAVES. A slick that spreads and stays, so a bay you
      // fought in still says so a while after. It multiplies rather than
      // adding: oil makes water darker.
      const sl = takeSlick()
      sl.x = x; sl.y = y
      sl.h = 0; sl.vh = 0; sl.vx = 0; sl.vy = 0
      sl.age = -0.6
      sl.life = 9
      sl.size = 150
      sl.grow = 320
      sl.alpha = 0.5
    },

    volley(x, y, tx, ty, guns, heavy = false) {
      const dx = tx - x, dy = ty - y
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      // Her side: the axis the guns are mounted down.
      const px = -uy, py = ux
      const step = heavy ? 0.07 : 0.09

      for (let k = 0; k < guns; k++) {
        const lane = (k - (guns - 1) / 2) * 58
        const gx = x + ux * 90 + px * lane
        const gy = y + uy * 90 + py * lane * GROUND
        const st = k * step

        const f = takeFlash()
        f.x = gx; f.y = gy
        f.h = 34; f.vh = 0; f.vx = 0; f.vy = 0
        f.age = -st; f.life = 0.11
        f.size = heavy ? 150 : 115; f.grow = heavy ? 340 : 260
        f.alpha = 0.95
        f.p.tint = heavy ? 0xffd27a : 0xffe3a8

        for (let i = 0; i < 4; i++) {
          const sm = takeSmoke()
          const spread = (Math.random() - 0.5) * 0.5
          const sx2 = ux * Math.cos(spread) - uy * Math.sin(spread)
          const sy2 = ux * Math.sin(spread) + uy * Math.cos(spread)
          const out = 120 + Math.random() * 170
          sm.x = gx + ux * (30 + i * 22)
          sm.y = gy + uy * (30 + i * 22)
          sm.vx = sx2 * out
          sm.vy = sy2 * out * GROUND
          sm.h = 24 + Math.random() * 28
          sm.vh = 16 + Math.random() * 24
          sm.age = -st
          sm.life = 1.1 + Math.random() * 0.7
          sm.size = 60 + Math.random() * 55
          sm.grow = 150 + Math.random() * 110
          sm.alpha = 0.28 + Math.random() * 0.14
          sm.p.tint = 0xd9dee6
        }

        // THE ANSWER, half a second on: shot splashes stitching a line across
        // the target's own beam, one lane per gun, in the same order the guns
        // went. The walk is what makes it a volley rather than a loud shot:
        // the sea reports every ball.
        const ax2 = tx + px * lane * 0.8
        const ay2 = ty + py * lane * 0.8 * GROUND
        const r2 = takeRing()
        r2.x = ax2; r2.y = ay2
        r2.age = -(0.5 + k * 0.075)
        r2.life = 0.6
        r2.from = 26; r2.to = heavy ? 300 : 230
        r2.alpha = 0.34
        r2.p.tint = heavy ? 0xffd88a : 0xe8f2f8
        for (let j = 0; j < 7; j++) {
          const d = takeDrop()
          const a2 = Math.random() * Math.PI * 2
          const out2 = 90 + Math.random() * 180
          d.x = ax2; d.y = ay2
          d.vx = Math.cos(a2) * out2
          d.vy = Math.sin(a2) * out2 * GROUND
          d.h = 6
          d.vh = 160 + Math.random() * 220
          d.age = -(0.5 + k * 0.075)
          d.life = 0.45 + Math.random() * 0.4
          d.size = 9 + Math.random() * 9
          d.p.tint = heavy ? 0xffe6b0 : 0xeaf6ff
        }
      }

      // One shove for the whole battery: a broadside moves a ship.
      const r = takeRing()
      r.x = x + ux * 70; r.y = y + uy * 70
      r.age = 0; r.life = 0.9
      r.from = 50; r.to = heavy ? 320 : 260
      r.alpha = 0.26
      r.p.tint = 0xdfeaf2
    },

    railgun(x, y, tx, ty, tint) {
      const dx = tx - x, dy = ty - y
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      const mx = x + ux * 100, my = y + uy * 100
      /** When the lance actually fires; everything before it is the charge. */
      const T = 0.34

      // THE CHARGE. Three swells at the muzzle, each brighter, white going
      // over to the weapon's own colour — energy being gathered, which is
      // what makes the instant afterwards read as release.
      for (let i = 0; i < 3; i++) {
        const f = takeFlash()
        f.x = mx; f.y = my
        f.h = 36; f.vh = 0; f.vx = 0; f.vy = 0
        f.age = -i * 0.11; f.life = 0.13
        f.size = 60 + i * 40; f.grow = 60
        f.alpha = 0.5 + i * 0.2
        f.p.tint = i === 2 ? tint : 0xffffff
      }

      // THE LANCE. A chain of additive cores down the whole line, tapering
      // toward the target, all appearing on the same frame — a beam is the
      // one thing here that must NOT stagger along its length.
      const span = len + 90
      const N = 14
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        const f = takeFlash()
        f.x = mx + ux * span * t
        f.y = my + uy * span * t
        f.h = 30; f.vh = 0; f.vx = 0; f.vy = 0
        f.age = -T; f.life = 0.24
        f.size = 64 - t * 30; f.grow = -40
        f.alpha = 0.9
        f.p.tint = i % 3 === 0 ? 0xffffff : tint
      }
      // The water under it kicks: spray lifting off the surface along the
      // path, which is how a beam over the sea says how hot it is.
      for (let i = 1; i < 6; i++) {
        const t = i / 6
        for (let j = 0; j < 2; j++) {
          const d = takeDrop()
          d.x = mx + ux * span * t + (Math.random() - 0.5) * 30
          d.y = my + uy * span * t + (Math.random() - 0.5) * 30 * GROUND
          d.vx = (Math.random() - 0.5) * 90
          d.vy = (Math.random() - 0.5) * 90 * GROUND
          d.h = 4
          d.vh = 240 + Math.random() * 200
          d.age = -T - 0.02
          d.life = 0.4 + Math.random() * 0.3
          d.size = 8 + Math.random() * 7
          d.p.tint = tint
        }
      }

      // Muzzle answer and target answer, in that order of size.
      const rm = takeRing()
      rm.x = mx; rm.y = my
      rm.age = -T; rm.life = 0.4
      rm.from = 30; rm.to = 260
      rm.alpha = 0.4
      rm.p.tint = tint

      const rt2 = takeRing()
      rt2.x = tx; rt2.y = ty
      rt2.age = -T; rt2.life = 0.45
      rt2.from = 40; rt2.to = 620
      rt2.alpha = 0.6
      rt2.p.tint = 0xfff0c8

      // AND THROUGH. Spent energy carries on past the hull along the same
      // line — the signature that separates a railgun from a heavy shot.
      for (let i = 0; i < 8; i++) {
        const d = takeDrop()
        d.x = tx + ux * (60 + Math.random() * 40)
        d.y = ty + uy * (60 + Math.random() * 40) * GROUND
        d.vx = ux * (300 + Math.random() * 260)
        d.vy = uy * (300 + Math.random() * 260) * GROUND
        d.h = 12
        d.vh = 60 + Math.random() * 120
        d.age = -T - 0.04
        d.life = 0.5 + Math.random() * 0.3
        d.size = 9 + Math.random() * 8
        d.p.tint = tint
      }
    },

    nukeLaunch(x, y) {
      // The silo opens. A column of thrust smoke standing straight up off the
      // deck, dense at the base — the missile itself is the fight's to draw.
      const f = takeFlash()
      f.x = x; f.y = y
      f.h = 30; f.vh = 0; f.vx = 0; f.vy = 0
      f.age = 0; f.life = 0.14
      f.size = 120; f.grow = 200
      f.alpha = 0.8
      f.p.tint = 0xffe3a8
      for (let i = 0; i < 9; i++) {
        const sm = takeSmoke()
        sm.x = x + (Math.random() - 0.5) * 50
        sm.y = y + (Math.random() - 0.5) * 30
        sm.vx = (Math.random() - 0.5) * 60
        sm.vy = (Math.random() - 0.5) * 60 * GROUND
        sm.h = 20
        sm.vh = 180 + Math.random() * 160
        sm.age = -Math.random() * 0.18
        sm.life = 1.3 + Math.random() * 0.8
        sm.size = 60 + Math.random() * 50
        sm.grow = 120 + Math.random() * 90
        sm.alpha = 0.34 + Math.random() * 0.16
        sm.p.tint = 0xe6e9ee
      }
    },

    nukeBlast(x, y, tint) {
      // THE CORE. Two flashes: a white one that swallows the point, then the
      // weapon's own colour blooming out of it a beat later.
      const f1 = takeFlash()
      f1.x = x; f1.y = y
      f1.h = 40; f1.vh = 0; f1.vx = 0; f1.vy = 0
      f1.age = 0; f1.life = 0.3
      f1.size = 260; f1.grow = 900
      f1.alpha = 1
      f1.p.tint = 0xffffff
      const f2 = takeFlash()
      f2.x = x; f2.y = y
      f2.h = 46; f2.vh = 0; f2.vx = 0; f2.vy = 0
      f2.age = -0.08; f2.life = 0.5
      f2.size = 200; f2.grow = 520
      f2.alpha = 0.8
      f2.p.tint = tint

      // STACKED SHOCKWAVES. Three, each later, wider and fainter — one ring
      // is a hit, a train of them is a detonation.
      for (let i = 0; i < 3; i++) {
        const r = takeRing()
        r.x = x; r.y = y
        r.age = -i * 0.14
        r.life = 0.5 + i * 0.16
        r.from = 50 + i * 30
        r.to = 700 + i * 260
        r.alpha = 0.6 - i * 0.16
        r.p.tint = i === 0 ? 0xffffff : 0xfff0c8
      }

      // THE TOWER. Water stood up on end where the blast went in.
      for (let i = 0; i < 22; i++) {
        const d = takeDrop()
        const a2 = Math.random() * Math.PI * 2
        const out = 30 + Math.random() * 110
        d.x = x + Math.cos(a2) * 40 * Math.random()
        d.y = y + Math.sin(a2) * 40 * Math.random() * GROUND
        d.vx = Math.cos(a2) * out
        d.vy = Math.sin(a2) * out * GROUND
        d.h = 8
        d.vh = 420 + Math.random() * 380
        d.age = -Math.random() * 0.22
        d.life = 0.7 + Math.random() * 0.5
        d.size = 12 + Math.random() * 11
        d.p.tint = i % 4 === 0 ? tint : 0xeaf6ff
      }

      // THE DOME. Slow dark smoke rolling up and out for seconds — the part
      // of a detonation that stays in the air after the light has gone.
      for (let i = 0; i < 12; i++) {
        const sm = takeSmoke()
        const a2 = (i / 12) * Math.PI * 2
        sm.x = x + Math.cos(a2) * 40
        sm.y = y + Math.sin(a2) * 40 * GROUND
        sm.vx = Math.cos(a2) * (50 + Math.random() * 70)
        sm.vy = Math.sin(a2) * (50 + Math.random() * 70) * GROUND
        sm.h = 30 + Math.random() * 40
        sm.vh = 60 + Math.random() * 70
        sm.age = -0.2 - Math.random() * 0.7
        sm.life = 2.2 + Math.random() * 1.1
        sm.size = 110 + Math.random() * 80
        sm.grow = 190 + Math.random() * 120
        sm.alpha = 0.3 + Math.random() * 0.14
        sm.p.tint = 0x9aa0a8
      }

      // Wreckage and the slick: a detonation leaves the same evidence a
      // sinking does, just all at once.
      for (let i = 0; i < 9; i++) {
        const d = takeDebris()
        const a2 = Math.random() * Math.PI * 2
        const out = 120 + Math.random() * 260
        d.x = x; d.y = y
        d.vx = Math.cos(a2) * out
        d.vy = Math.sin(a2) * out * GROUND
        d.h = 14
        d.vh = 220 + Math.random() * 320
        d.age = -Math.random() * 0.2
        d.life = 4.5 + Math.random() * 2
        d.size = 8 + Math.random() * 11
        d.spin = (Math.random() - 0.5) * 2.6
      }
      const sl = takeSlick()
      sl.x = x; sl.y = y
      sl.h = 0; sl.vh = 0; sl.vx = 0; sl.vy = 0
      sl.age = -0.4
      sl.life = 6.5
      sl.size = 120
      sl.grow = 280
      sl.alpha = 0.42
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
        // A NEGATIVE AGE IS A DROPLET WAITING ITS TURN — see sink(), where the
        // stagger is what turns one call into a hull filling over seconds.
        if (d.age < 0) { if (d.p.alpha) d.p.alpha = 0; continue }
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

      // ── WRECKAGE ────────────────────────────────────────────────────────
      for (const d of debris) {
        if (d.age >= d.life) { if (d.p.alpha) d.p.alpha = 0; continue }
        d.age += dt
        if (d.age < 0) { if (d.p.alpha) d.p.alpha = 0; continue }
        const t = d.age / d.life
        d.x += d.vx * dt
        d.y += d.vy * dt
        if (d.h > 0) {
          d.vh -= G * dt
          d.h += d.vh * dt
          // IT LANDS AND STAYS. A droplet ends at the surface; a plank floats,
          // which is the whole point of it being wreckage.
          if (d.h <= 0) { d.h = 0; d.vh = 0 }
        } else {
          // Adrift: it keeps some way on and loses it slowly to the water.
          d.vx -= d.vx * Math.min(1, 0.8 * dt)
          d.vy -= d.vy * Math.min(1, 0.8 * dt)
        }
        d.p.x = d.x
        d.p.y = d.y - d.h / GROUND
        d.p.rotation += d.spin * dt
        d.p.scaleX = d.size / 16
        // Flattened on the water once it is floating, upright while it is in
        // the air — the same plane-and-air rule everything else here obeys.
        d.p.scaleY = (d.size / 16) * (d.h > 0 ? 1 : GROUND)
        // In hard, out over the last fifth, so it drifts a long while and then
        // is quietly gone rather than blinking out.
        d.p.alpha = lit * Math.min(1, d.age * 6) * Math.min(1, (1 - t) * 5)
      }

      // ── THE SLICK ───────────────────────────────────────────────────────
      for (const sl of slicks) {
        if (sl.age >= sl.life) { if (sl.p.alpha) sl.p.alpha = 0; continue }
        sl.age += dt
        if (sl.age < 0) { if (sl.p.alpha) sl.p.alpha = 0; continue }
        const t = sl.age / sl.life
        const size = sl.size + sl.grow * Math.min(1, t * 3)
        sl.p.x = sl.x
        sl.p.y = sl.y
        sl.p.scaleX = size / 64
        // ON the plane, like every flat thing.
        sl.p.scaleY = (size / 64) * GROUND
        // Spreads in over a second, holds, and thins out over the last third.
        sl.p.alpha = sl.alpha * Math.min(1, t * 4) * Math.min(1, (1 - t) * 3)
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
