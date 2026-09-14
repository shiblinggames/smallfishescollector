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
import { texture as loadTexture } from './skiffArt'
import { FX_SHEET, FX_FRAMES, type FxName } from './fxSheet'

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
const SHARD_CAP = 64
/** Slicks. One per wreck, and they outlive everything else here. */
const SLICK_CAP = 5
/** The painted set, which only exists once the sheet has landed (see below).
 *  Columns of water, fireballs, stars and coals. */
const SPLASH_CAP = 14
const FIRE_CAP = 8
const STAR_CAP = 32
const EMBER_CAP = 48
/** Lances. Three bars per railgun shot; two shots never overlap. */
const BEAM_CAP = 8

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

/**
 * A SPLINTER. Drawn white so a tint can carry it, and drawn as an actual
 * shape rather than a blur: a tapered sliver, wide at the broken end and
 * coming to a point, with the grain of the timber down it.
 *
 * The reason this exists at all: a hit on a hull used to throw the same soft
 * round particle the SPRAY uses, in every direction, which is water. Water
 * coming off a wooden ship you have just put a cannonball through is the wrong
 * sentence. Round is water; angular is wreckage; the two must not share a
 * texture, because at this size the silhouette is the only thing carrying the
 * difference.
 */
let shardTex: Texture | null = null
function shardTexture(PIXI: typeof import('pixi.js')): Texture {
  if (shardTex) return shardTex
  const W = 8, H = 32
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(W * 0.5, 0)          // the point
  g.lineTo(W, H * 0.72)
  g.lineTo(W * 0.62, H)         // the broken end, ragged
  g.lineTo(W * 0.24, H * 0.93)
  g.lineTo(0, H * 0.66)
  g.closePath()
  g.fill()
  // The grain: one darker line down it, so a splinter spinning end over end
  // shows a face rather than reading as a flat lozenge.
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = 'rgba(0,0,0,0.34)'
  g.fillRect(W * 0.42, H * 0.12, 1, H * 0.78)
  g.globalCompositeOperation = 'source-over'
  shardTex = PIXI.Texture.from(c)
  return shardTex
}

let beamTex: Texture | null = null
/**
 * THE LANCE. A bar with a peaked profile across it and soft ends: the one
 * thing here drawn LONG. It exists because a puff stretched twenty times along
 * one axis is bright in the middle and dark at both ends, which is a lozenge,
 * and a chain of puffs is a string of beads; neither is a beam.
 */
function beamTexture(PIXI: typeof import('pixi.js')): Texture {
  if (beamTex) return beamTex
  const W = 256, H = 32
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const v = g.createLinearGradient(0, 0, 0, H)
  v.addColorStop(0.0, 'rgba(255,255,255,0)')
  v.addColorStop(0.3, 'rgba(255,255,255,0.35)')
  v.addColorStop(0.5, 'rgba(255,255,255,1)')
  v.addColorStop(0.7, 'rgba(255,255,255,0.35)')
  v.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  // Soft at the muzzle end, and a longer fade past the target: spent energy.
  g.globalCompositeOperation = 'destination-in'
  const h = g.createLinearGradient(0, 0, W, 0)
  h.addColorStop(0.00, 'rgba(255,255,255,0)')
  h.addColorStop(0.06, 'rgba(255,255,255,1)')
  h.addColorStop(0.86, 'rgba(255,255,255,1)')
  h.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = h
  g.fillRect(0, 0, W, H)
  beamTex = PIXI.Texture.from(c)
  return beamTex
}

type Beam = {
  p: Particle
  x: number; y: number
  angle: number; len: number; w: number
  age: number; life: number
  alpha: number
}

type Puff = {
  p: Particle
  x: number; y: number
  vx: number; vy: number
  h: number; vh: number
  age: number; life: number
  size: number; grow: number
  alpha: number
  /** The texture's own size, so `size` means the same on-screen pixels
   *  whichever pool the puff came from: 64 for a dot, more for a painting. */
  div: number
  /** Radians per second. A round dot never needed one; a painting does. */
  spin: number
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
  div: number
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
  /** Everything that lies ON the water. Goes UNDER the hulls. */
  view: Container
  /**
   * WHAT HAPPENS ABOVE THE HULLS. A fireball centred on a hull that is drawn
   * under the hull is a fireball nobody sees, which is exactly what happened
   * the first day the painted set shipped. Flash, fire, star, coals, painted
   * smoke and the lance all live here; the host adds it above the ships.
   */
  over: Container
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
  const over: Container = new PIXI.Container()
  over.eventMode = 'none'

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
  // THE FLASHES GET THEIR OWN. They used to share the spray's container, which
  // draws from ONE texture source: a bloom and a droplet in the same batch is
  // whichever texture was registered first, drawn twice.
  const flashLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  flashLayer.blendMode = 'add'
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
  // SPLINTERS GET THEIR OWN, and not only because a ParticleContainer batches
  // one texture: they fire on every single hit, and sharing the wreckage pool
  // would have a busy exchange of fire recycling away the planks floating off
  // a ship that actually sank.
  const shardLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  // Under the rings: a slick is IN the water and the foam of the sinking that
  // made it is on top.
  view.addChild(slickLayer)
  view.addChild(ringLayer)
  view.addChild(debrisLayer)
  view.addChild(shardLayer)
  view.addChild(smokeLayer)
  view.addChild(sprayLayer)
  // Above the hulls: the flash, and the lance, which is the one thing here
  // that turns, so its container pays for rotation.
  const beamLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  beamLayer.blendMode = 'add'
  over.addChild(flashLayer)
  over.addChild(beamLayer)

  const pt = puffTexture(PIXI), rt = ringTexture(PIXI), st = sparkTexture(PIXI)
  const sht = shardTexture(PIXI), bt = beamTexture(PIXI)

  /** A ring buffer over a pool: the oldest is always the one recycled. */
  const ring = <T>(list: T[]) => { let n = 0; return () => { const v = list[n]; n = (n + 1) % list.length; return v } }
  const puff = (p: Particle, div: number): Puff =>
    ({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0, grow: 0, alpha: 0, div, spin: 0 })
  const wreck = (p: Particle, div: number): Debris =>
    ({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0, spin: 0, div })
  const fill = <T>(list: T[], n: number, tex: Texture, layer: ParticleContainer, make: (p: Particle) => T, tint?: number) => {
    for (let i = 0; i < n; i++) {
      const p: Particle = new PIXI.Particle({ texture: tex })
      p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
      if (tint !== undefined) p.tint = tint
      layer.addParticle(p); list.push(make(p))
    }
  }

  const smoke: Puff[] = []; fill(smoke, SMOKE_CAP, pt, smokeLayer, p => puff(p, 64))
  const flashes: Puff[] = []; fill(flashes, FLASH_CAP, pt, flashLayer, p => puff(p, 64))
  const drops: Drop[] = []
  fill(drops, SPRAY_CAP, st, sprayLayer, p => ({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0 }))
  const rings: Ring[] = []
  fill(rings, RING_CAP, rt, ringLayer, p => ({ p, x: 0, y: 0, age: 1, life: 1, from: 0, to: 0, alpha: 0 }))
  const debris: Debris[] = []; fill(debris, DEBRIS_CAP, st, debrisLayer, p => wreck(p, 16), 0x4a3a2a)
  // Splinters: same fields as wreckage, but they never float — a sliver hits
  // the water and is gone.
  const shards: Debris[] = []; fill(shards, SHARD_CAP, sht, shardLayer, p => wreck(p, 32))
  const slicks: Puff[] = []; fill(slicks, SLICK_CAP, pt, slickLayer, p => puff(p, 64), 0x5a5f52)
  // A lance is anchored at the MUZZLE and drawn out along its angle.
  const beams: Beam[] = []
  fill(beams, BEAM_CAP, bt, beamLayer, p => { p.anchorX = 0; return { p, x: 0, y: 0, angle: 0, len: 0, w: 0, age: 1, life: 1, alpha: 0 } })
  const tSmoke = ring(smoke), tFlash = ring(flashes), takeDrop = ring(drops), takeRing = ring(rings)
  const takeDebris = ring(debris), takeShard = ring(shards), takeSlick = ring(slicks), takeBeam = ring(beams)

  // ── THE PAINTED SET ──────────────────────────────────────────────────────
  //
  // Everything above is a gradient on a canvas: a soft dot, a soft ring. They
  // were tuned with care and they still read as dots and rings. The sheet
  // (fxSheet.ts) holds PAINTED smoke, a muzzle flash, a column of water, a
  // fireball, a star and embers — and it is a fetch. So the painted pools are
  // built the moment it lands and the guns draw from them from that frame on;
  // until then, and if it never comes, the dots draw as they always did.
  // Nothing below waits on it.
  //
  // Two containers, because a ParticleContainer draws from ONE source and
  // these are the only particles here that come off the sheet: `paint` for
  // the solid things (smoke, water) and `paintAdd` for the things that ARE
  // light.
  let fx: Record<FxName, Texture> | null = null
  let dead = false
  const pSmoke: Puff[] = [], pFlash: Puff[] = [], pSplash: Puff[] = [], pFire: Puff[] = [], pStar: Puff[] = []
  const embers: Debris[] = []
  const tPSmoke = ring(pSmoke), tPFlash = ring(pFlash), tSplash = ring(pSplash)
  const tFire = ring(pFire), tStar = ring(pStar), tEmber = ring(embers)
  void loadTexture(PIXI, FX_SHEET).then(base => {
    if (dead) return
    const cut = (n: FxName) => {
      const [x, y, w, h] = FX_FRAMES[n]
      return new PIXI.Texture({ source: base.source, frame: new PIXI.Rectangle(x, y, w, h) })
    }
    const all = {} as Record<FxName, Texture>
    for (const n of Object.keys(FX_FRAMES) as FxName[]) all[n] = cut(n)
    const paint: ParticleContainer = new PIXI.ParticleContainer({
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
    })
    const paintAdd: ParticleContainer = new PIXI.ParticleContainer({
      dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
    })
    paintAdd.blendMode = 'add'
    // The divisors are each painting's size against its cell, tuned so the
    // numbers the emitters already use land at about the size the dots did.
    // The splash is anchored at its FOOT: it stands on the water, not through it.
    fill(pSplash, SPLASH_CAP, all.splash, paint, p => { p.anchorY = 0.96; return puff(p, 128) })
    fill(pSmoke, SMOKE_CAP, all.smoke, paint, p => puff(p, 150))
    fill(pFlash, FLASH_CAP, all.flash, paintAdd, p => puff(p, 200))
    fill(pFire, FIRE_CAP, all.fireball, paintAdd, p => puff(p, 128))
    fill(pStar, STAR_CAP, all.spark, paintAdd, p => puff(p, 150))
    fill(embers, EMBER_CAP, all.ember, paintAdd, p => wreck(p, 128))
    // Both above the hulls: painted smoke and water under the flash, painted
    // light over everything.
    over.addChildAt(paint, 0)
    over.addChild(paintAdd)
    fx = all
  }).catch(() => { /* the dots keep drawing */ })

  /** Smoke and flashes come off the sheet once it is here. A painted puff
   *  also gets a random face and a slow turn, which a round dot never needed. */
  const takeSmoke = () => {
    if (!fx) return tSmoke()
    const s = tPSmoke()
    s.p.rotation = Math.random() * Math.PI * 2
    s.spin = (Math.random() - 0.5) * 0.7
    return s
  }
  const takeFlash = () => {
    if (!fx) return tFlash()
    const f = tPFlash()
    f.p.rotation = Math.random() * Math.PI * 2
    return f
  }
  /** WATER STOOD UP. A column at `x,y`, `size` tall, up in the first third
   *  and falling back for the rest. Nothing without the sheet: the drops that
   *  always went with a shot into the sea are still thrown around it. */
  const splash = (x: number, y: number, size: number, life: number, delay: number) => {
    if (!fx) return
    const s = tSplash()
    s.x = x; s.y = y; s.h = 0; s.vh = 0; s.vx = 0; s.vy = 0
    s.age = -delay; s.life = life; s.size = size; s.grow = 0; s.alpha = 0.95
    // Mirrored half the time, so a walk of them is not one painting six times.
    s.spin = Math.random() < 0.5 ? 1 : -1
    return s
  }
  /** FIRE. Falls back to the bloom the dots drew, so a detonation without
   *  the sheet is still a detonation. */
  const fireball = (x: number, y: number, size: number, life: number, delay: number, tint = 0xffffff) => {
    const f = fx ? tFire() : tFlash()
    f.x = x; f.y = y; f.h = 20; f.vh = 40; f.vx = 0; f.vy = 0
    f.age = -delay; f.life = life; f.size = size; f.grow = size * 0.6; f.alpha = 1
    f.p.tint = tint
    if (fx) { f.p.rotation = Math.random() * Math.PI * 2; f.spin = (Math.random() - 0.5) * 1.2 }
    return f
  }
  /** THE STAR. A hard point of light that takes a tint cleanly, which the
   *  flash (painted orange) does not: the railgun's cores, a crit's strike. */
  const star = (x: number, y: number, size: number, life: number, delay: number, tint: number) => {
    const f = fx ? tStar() : tFlash()
    f.x = x; f.y = y; f.h = 24; f.vh = 0; f.vx = 0; f.vy = 0
    f.age = -delay; f.life = life; f.size = size; f.grow = size * 0.5; f.alpha = 1
    f.p.tint = tint
    if (fx) f.p.rotation = Math.random() * Math.PI * 2
    return f
  }
  /** EMBERS off a strike: thrown like splinters, except they are light. */
  const ember = (x: number, y: number, n: number, out: number, up: number, delay = 0) => {
    if (!fx) return
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const o = out * (0.4 + Math.random() * 0.8)
      const d = tEmber()
      d.x = x; d.y = y
      d.vx = Math.cos(a) * o; d.vy = Math.sin(a) * o * GROUND
      d.h = 10; d.vh = up * (0.6 + Math.random() * 0.8)
      d.age = -delay - Math.random() * 0.05; d.life = 0.55 + Math.random() * 0.5
      d.size = 16 + Math.random() * 14
      d.spin = (Math.random() - 0.5) * 14
      d.p.rotation = Math.random() * Math.PI * 2
    }
  }

  let dark = 0

  /** Gravity on HEIGHT, in world px per second squared. Not on y: y is a place
   *  on the sea and height is how far above it a thing is. */
  const G = 900

  // ── THE STEPS ────────────────────────────────────────────────────────────
  // One per kind of thing, each run over the dot pool and the painted pool
  // alike; `div` is what makes a size mean the same in both. Every one of
  // them treats a NEGATIVE AGE as a particle waiting its turn, held invisible
  // and unmoved — the stagger idiom this whole layer runs on.
  const stepSmoke = (list: Puff[], dt: number, lit: number) => {
    for (const s of list) {
      if (s.age >= s.life) { if (s.p.alpha) s.p.alpha = 0; continue }
      s.age += dt
      if (s.age < 0) { if (s.p.alpha) s.p.alpha = 0; continue }
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
      s.p.scaleX = size / s.div
      s.p.scaleY = size / s.div
      s.p.rotation += s.spin * dt
      // In fast, out slow: a puff arrives at once and then thins.
      s.p.alpha = s.alpha * lit * Math.min(1, t * 8) * (1 - t) * (1 - t)
    }
  }
  const stepFlash = (list: Puff[], dt: number) => {
    for (const f of list) {
      if (f.age >= f.life) { if (f.p.alpha) f.p.alpha = 0; continue }
      f.age += dt
      if (f.age < 0) { if (f.p.alpha) f.p.alpha = 0; continue }
      const t = f.age / f.life
      const size = f.size + f.grow * t
      f.p.x = f.x
      f.p.y = f.y - f.h / GROUND
      f.p.scaleX = size / f.div
      f.p.scaleY = size / f.div
      f.p.alpha = f.alpha * (1 - t) * (1 - t)
    }
  }
  const stepFire = (list: Puff[], dt: number) => {
    for (const f of list) {
      if (f.age >= f.life) { if (f.p.alpha) f.p.alpha = 0; continue }
      f.age += dt
      if (f.age < 0) { if (f.p.alpha) f.p.alpha = 0; continue }
      const t = f.age / f.life
      f.h += f.vh * dt
      // Swells in the first fifth, then only drifts wider while it fades: a
      // fireball is one hot instant and then a cloud.
      const size = f.size * (0.5 + 0.5 * Math.min(1, t * 5)) + f.grow * t
      f.p.x = f.x
      f.p.y = f.y - f.h / GROUND
      f.p.scaleX = size / f.div
      f.p.scaleY = size / f.div
      f.p.rotation += f.spin * dt
      f.p.alpha = f.alpha * Math.min(1, t * 10) * (1 - t)
    }
  }
  const stepBeams = (dt: number) => {
    for (const b of beams) {
      if (b.age >= b.life) { if (b.p.alpha) b.p.alpha = 0; continue }
      b.age += dt
      if (b.age < 0) { if (b.p.alpha) b.p.alpha = 0; continue }
      const t = b.age / b.life
      b.p.x = b.x
      b.p.y = b.y - 30 / GROUND
      b.p.rotation = b.angle
      b.p.scaleX = b.len / 256
      // Full width the frame it fires and thinning as it dies: a beam does
      // not swell, it cuts and is gone.
      b.p.scaleY = (b.w / 32) * (1 - 0.6 * t)
      b.p.alpha = b.alpha * Math.min(1, b.age * 40) * (1 - t) * (1 - t)
    }
  }
  const stepSplash = (list: Puff[], dt: number, lit: number) => {
    for (const s of list) {
      if (s.age >= s.life) { if (s.p.alpha) s.p.alpha = 0; continue }
      s.age += dt
      if (s.age < 0) { if (s.p.alpha) s.p.alpha = 0; continue }
      const t = s.age / s.life
      // Up fast, then it hangs and falls back: tall at a third, wider and
      // shorter by the end, which is water losing to gravity. `spin` here is
      // only the mirror, ±1.
      const rise = Math.min(1, t * 3)
      const k = s.size / s.div
      s.p.x = s.x
      s.p.y = s.y
      s.p.scaleX = k * (0.55 + 0.45 * rise + 0.25 * t) * s.spin
      s.p.scaleY = k * (0.3 + 0.7 * rise) * (1 - 0.35 * Math.max(0, t - 0.4))
      s.p.alpha = s.alpha * lit * Math.min(1, t * 8) * Math.min(1, (1 - t) * 2)
    }
  }
  const stepDrops = (dt: number, lit: number) => {
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
  }
  // ── WRECKAGE ──────────────────────────────────────────────────────────
  const stepDebris = (dt: number, lit: number) => {
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
      d.p.scaleX = d.size / d.div
      // Flattened on the water once it is floating, upright while it is in
      // the air — the same plane-and-air rule everything else here obeys.
      d.p.scaleY = (d.size / d.div) * (d.h > 0 ? 1 : GROUND)
      // In hard, out over the last fifth, so it drifts a long while and then
      // is quietly gone rather than blinking out.
      d.p.alpha = lit * Math.min(1, d.age * 6) * Math.min(1, (1 - t) * 5)
    }
  }
  // ── THE SPLINTERS, AND THE COALS ──────────────────────────────────────
  // Wreckage floats; a sliver does not. Same arc as everything else in the
  // air, and the moment it reaches the water it is finished. An ember is the
  // same thing on fire: it is not dimmed by the night, and the water puts it
  // out.
  const stepShards = (list: Debris[], dt: number, lit: number) => {
    for (const d of list) {
      if (d.age >= d.life) { if (d.p.alpha) d.p.alpha = 0; continue }
      d.age += dt
      if (d.age < 0) { if (d.p.alpha) d.p.alpha = 0; continue }
      const t = d.age / d.life
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vh -= G * dt
      d.h += d.vh * dt
      if (d.h < 0) d.h = 0
      d.p.x = d.x
      d.p.y = d.y - d.h / GROUND
      d.p.rotation += d.spin * dt
      d.p.scaleX = d.size / d.div
      d.p.scaleY = d.size / d.div
      // Out fast at the end, and out FASTER once it is in the water.
      d.p.alpha = lit * Math.min(1, d.age * 14) * Math.min(1, (1 - t) * 3.2) * (d.h > 0 ? 1 : 0.35)
    }
  }
  // ── THE SLICK ─────────────────────────────────────────────────────────
  const stepSlicks = (dt: number) => {
    for (const sl of slicks) {
      if (sl.age >= sl.life) { if (sl.p.alpha) sl.p.alpha = 0; continue }
      sl.age += dt
      if (sl.age < 0) { if (sl.p.alpha) sl.p.alpha = 0; continue }
      const t = sl.age / sl.life
      const size = sl.size + sl.grow * Math.min(1, t * 3)
      sl.p.x = sl.x
      sl.p.y = sl.y
      sl.p.scaleX = size / sl.div
      // ON the plane, like every flat thing.
      sl.p.scaleY = (size / sl.div) * GROUND
      // Spreads in over a second, holds, and thins out over the last third.
      sl.p.alpha = sl.alpha * Math.min(1, t * 4) * Math.min(1, (1 - t) * 3)
    }
  }
  const stepRings = (dt: number, lit: number) => {
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
  }

  return {
    view,
    over,
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

      // ── A MISS IS WATER. A HIT IS NOT. ────────────────────────────────
      //
      // Both used to be the same thing: soft round spray particles thrown in
      // every direction. That is right for a shot going into the sea and
      // exactly wrong for one going into a ship, and it is why a hit read as
      // orbs floating off a hull rather than as a hull being broken. A miss
      // still throws its column. A hit throws the ship.
      if (wet) {
        // The column itself, painted, with the drops thrown around its foot.
        splash(x, y, 170, 0.75, 0)
        for (let i = 0; i < 14; i++) {
          const d = takeDrop()
          const a = Math.random() * Math.PI * 2
          const out = 30 + Math.random() * 90
          d.x = x; d.y = y
          d.vx = Math.cos(a) * out
          d.vy = Math.sin(a) * out * GROUND
          d.h = 6
          d.vh = 300 + Math.random() * 260
          d.age = 0
          d.life = 0.5 + Math.random() * 0.5
          d.size = 12 + Math.random() * 9
          d.p.tint = 0xeaf6ff
        }
        return
      }

      // THE STRIKE ITSELF. One short hot flash where the shot went in, before
      // anything comes back out of the hole — the light of the blow, not a
      // particle.
      const f = takeFlash()
      f.x = x; f.y = y
      f.vx = 0; f.vy = 0
      f.h = 10; f.vh = 0
      f.age = 0
      f.life = heavy ? 0.2 : 0.14
      f.size = heavy ? 92 : 58
      f.grow = heavy ? 60 : 30
      f.alpha = heavy ? 0.85 : 0.6
      f.p.tint = heavy ? 0xffe0a0 : 0xffd28a

      // A CRIT BURNS: the strike is a fireball with a star at its heart. A
      // hit is the flash and a few coals coming out of the hole.
      if (heavy) {
        fireball(x, y, 120, 0.55, 0.02)
        star(x, y, 170, 0.3, 0, 0xfff0c8)
      }
      ember(x, y, heavy ? 10 : 4, heavy ? 220 : 140, heavy ? 260 : 190)

      // SPLINTERS. Thrown out of the wound and DOWN, tumbling, in the colours
      // of broken timber with a few still hot from the strike. Sprayed into a
      // fan rather than a full circle: wreckage comes off the face that was
      // hit, and a ring of it in every direction reads as an explosion in mid
      // air rather than a hull opening up.
      const nSh = heavy ? 16 : 9
      for (let i = 0; i < nSh; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
        const out = (heavy ? 150 : 100) + Math.random() * (heavy ? 260 : 180)
        const d = takeShard()
        d.x = x; d.y = y
        d.vx = Math.cos(a) * out
        d.vy = Math.sin(a) * out * GROUND * 0.5
        d.h = 8
        d.vh = (heavy ? 150 : 105) + Math.random() * 170
        d.age = 0
        d.life = 0.5 + Math.random() * 0.45
        d.size = (heavy ? 15 : 12) + Math.random() * 10
        d.spin = (Math.random() - 0.5) * 22
        // Mostly timber; one in four still glowing off the strike.
        d.p.tint = Math.random() < 0.26
          ? (heavy ? 0xffc46a : 0xe0a05a)
          : (Math.random() < 0.5 ? 0x6b4a2f : 0x8a6440)
      }

      // AND THE POWDER SMOKE off the hole, a beat behind the splinters, so the
      // wound goes on saying something after the noise has stopped.
      for (let i = 0; i < (heavy ? 3 : 2); i++) {
        const p = takeSmoke()
        p.x = x + (Math.random() - 0.5) * 26
        p.y = y + (Math.random() - 0.5) * 12
        p.vx = (Math.random() - 0.5) * 40
        p.vy = (Math.random() - 0.5) * 18
        p.h = 14 + Math.random() * 18
        p.vh = 26 + Math.random() * 30
        p.age = -0.04 * i
        p.life = 0.7 + Math.random() * 0.5
        p.size = (heavy ? 44 : 32) + Math.random() * 22
        p.grow = 60
        p.alpha = heavy ? 0.4 : 0.3
        p.p.tint = 0x3b3f45
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
      star(x, y, 260, 0.36, 0, 0xfff0c8)

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

      // AND SHE STANDS THE WATER UP as she goes, three times, each smaller;
      // and once, as the sea reaches the magazine, she burns.
      splash(x, y, 190, 0.8, 0.05)
      splash(x + 30, y + 10, 140, 0.7, 0.55)
      splash(x - 36, y - 8, 110, 0.65, 1.0)
      fireball(x, y, 150, 0.7, 0.3)
      ember(x, y, 12, 180, 300, 0.3)

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
        splash(ax2, ay2, heavy ? 120 : 95, 0.6, 0.5 + k * 0.075)
        for (let j = 0; j < 4; j++) {
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
      // Soft blooms, not the painted star: a star is a spark, and a railgun
      // charging is a swell of light with no edge at all.
      for (let i = 0; i < 3; i++) {
        const f = tFlash()
        f.x = mx; f.y = my
        f.h = 36; f.vh = 0; f.vx = 0; f.vy = 0
        f.age = -i * 0.11; f.life = 0.13
        f.size = 60 + i * 40; f.grow = 60
        f.alpha = 0.5 + i * 0.2
        f.p.tint = i === 2 ? tint : 0xffffff
      }

      // THE LANCE. Three bars on one line, all on the same frame: wide and
      // faint in the weapon's colour, a tighter brighter one inside it, and a
      // white core, from the muzzle to well past the target. A beam is the
      // one thing here that must NOT stagger along its length, and the one
      // thing drawn LONG — it is a bar, not a chain of anything.
      const span = len + 90
      const ang = Math.atan2(dy, dx)
      const lance = (w: number, alpha: number, life: number, t: number) => {
        const b = takeBeam()
        b.x = mx; b.y = my; b.angle = ang; b.len = span; b.w = w
        b.age = -T; b.life = life; b.alpha = alpha
        b.p.tint = t
      }
      lance(130, 0.30, 0.36, tint)
      lance(50, 0.75, 0.32, tint)
      lance(16, 1.0, 0.28, 0xffffff)
      // And where it lands: one hot bloom on the hull, white going to the
      // weapon's colour as it fades.
      const fh = tFlash()
      fh.x = tx; fh.y = ty
      fh.h = 30; fh.vh = 0; fh.vx = 0; fh.vy = 0
      fh.age = -T; fh.life = 0.3
      fh.size = 120; fh.grow = 220
      fh.alpha = 0.9
      fh.p.tint = 0xffffff
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
      // ...then the fire itself, the weapon's own colour as a star at its
      // heart, the sea stood on end under it, and coals thrown wide.
      fireball(x, y, 340, 0.95, 0.06)
      star(x, y, 420, 0.4, 0.03, tint)
      splash(x, y, 360, 1.05, 0.08)
      ember(x, y, 18, 320, 420, 0.06)

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
      // brighter at night, so only the smoke and the water dim. Fire, stars and
      // coals are light too.
      const lit = 1 - dark * 0.45
      stepSmoke(smoke, dt, lit); stepSmoke(pSmoke, dt, lit)
      stepFlash(flashes, dt); stepFlash(pFlash, dt); stepFlash(pStar, dt)
      stepFire(pFire, dt)
      stepBeams(dt)
      stepSplash(pSplash, dt, lit)
      stepDrops(dt, lit)
      stepDebris(dt, lit)
      stepShards(shards, dt, lit); stepShards(embers, dt, 1)
      stepSlicks(dt)
      stepRings(dt, lit)
    },

    destroy() {
      dead = true
      view.destroy({ children: true })
      over.destroy({ children: true })
    },
  }
}
