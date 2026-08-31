// ── WEATHER, DRAWN ──────────────────────────────────────────────────────────
//
// A squall is a place (see lib/seaWeather for why it is a place and not an
// event). This draws it: darker water under it, rain falling through it, and a
// ragged edge where it meets the clear sea.
//
// ── THREE LAYERS, AND THE ORDER IS THE WHOLE ILLUSION ───────────────────────
//
//   THE SHADOW lies ON the water, squashed by GROUND like every other flat
//   thing on this chart. It is what a cloud does to the sea and it is the part
//   you see first, from a long way off, before any rain is legible.
//
//   THE RAIN falls THROUGH the air above it, so it is not squashed at all. A
//   rain streak that took the plane's foreshortening would be lying down on the
//   water, which is the one thing rain never does.
//
//   THE DIMPLES are where each drop lands: small, brief rings on the surface,
//   squashed again because they are back on the plane. Rain without them is a
//   screen effect; rain with them is rain hitting something.
//
// ── AND IT IS DARK, NOT GREY ────────────────────────────────────────────────
//
// The shadow subtracts light rather than adding a grey wash. A wash over the
// sea flattens the swell and the palette underneath it and every band starts
// looking like the same slate; multiplying the water down keeps the Shallows
// green and the Abyss black and simply puts a cloud over both.

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { squallsAt, squallPos, type Squall } from '@/lib/seaWeather'

/** Drops in the air at once, shared across every squall on screen. */
const DROPS = 260
/** Rings on the water at once. Fewer than drops: not every drop needs its
 *  landing drawn for the surface to read as being rained on. */
const DIMPLES = 90

/** How far a drop falls before it lands, in SCREEN px. Rain is in the air, so
 *  this is divided by GROUND on the way in like every other altitude. */
const FALL = 210

let shadowTex: Texture | null = null
let dropTex: Texture | null = null
let ringTex: Texture | null = null

function shadowTexture(PIXI: typeof import('pixi.js')): Texture {
  if (shadowTex) return shadowTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,1)')
  grad.addColorStop(0.46, 'rgba(255,255,255,0.92)')
  // A LONG, SOFT SKIRT. A squall does not have an edge; it has a mile of
  // getting worse. Most of this texture is the falloff.
  grad.addColorStop(0.78, 'rgba(255,255,255,0.34)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  shadowTex = PIXI.Texture.from(c)
  return shadowTex
}

function dropTexture(PIXI: typeof import('pixi.js')): Texture {
  if (dropTex) return dropTex
  const W = 8, H = 48
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0.0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0.9)')
  g.fillStyle = grad
  g.fillRect(W * 0.34, 0, W * 0.32, H)
  dropTex = PIXI.Texture.from(c)
  return dropTex
}

function ringTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 32
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.62, 'rgba(255,255,255,0)')
  grad.addColorStop(0.86, 'rgba(255,255,255,0.9)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

type Drop = { p: Particle; x: number; y: number; h: number; vh: number; len: number }
type Dimple = { p: Particle; x: number; y: number; age: number; life: number; size: number }

export type Squalls = {
  /** The shadow and the dimples: on the water, under the boats. */
  water: Container
  /** The rain: in the air, over everything. */
  air: Container
  advance(camX: number, camY: number, halfW: number, halfH: number, dt: number): void
  night(tint: number): void
  destroy(): void
}

export function makeSqualls(PIXI: typeof import('pixi.js')): Squalls {
  const water: Container = new PIXI.Container()
  const air: Container = new PIXI.Container()

  const shadowLayer: Container = new PIXI.Container()
  // MULTIPLY, not a grey wash. A wash flattens the palette under it and every
  // band starts looking like the same slate; multiplying keeps the Shallows
  // green and the Abyss black and puts a cloud over both.
  shadowLayer.blendMode = 'multiply'
  water.addChild(shadowLayer)

  const dimpleLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  water.addChild(dimpleLayer)

  const dropLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  air.addChild(dropLayer)

  const st = shadowTexture(PIXI), dt2 = dropTexture(PIXI), rt = ringTexture(PIXI)

  const SLOTS = 3
  const shadows: Sprite[] = []
  for (let i = 0; i < SLOTS; i++) {
    const s: Sprite = new PIXI.Sprite(st)
    s.anchor.set(0.5)
    // The colour a cloud actually leaves: a cool grey that takes light out
    // without tinting what is left.
    s.tint = 0x59677a
    s.alpha = 0
    shadowLayer.addChild(s)
    shadows.push(s)
  }

  const drops: Drop[] = []
  for (let i = 0; i < DROPS; i++) {
    const p: Particle = new PIXI.Particle({ texture: dt2 })
    p.anchorX = 0.5; p.anchorY = 1; p.alpha = 0
    dropLayer.addParticle(p)
    drops.push({ p, x: 0, y: 0, h: -1, vh: 0, len: 1 })
  }
  const dimples: Dimple[] = []
  for (let i = 0; i < DIMPLES; i++) {
    const p: Particle = new PIXI.Particle({ texture: rt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    dimpleLayer.addParticle(p)
    dimples.push({ p, x: 0, y: 0, age: 1, life: 1, size: 0 })
  }
  let nd = 0
  const takeDimple = () => { const d = dimples[nd]; nd = (nd + 1) % DIMPLES; return d }

  let tint = 0xffffff
  let cache: Squall[] = []
  let cachedAt = 0

  return {
    water, air,

    advance(camX, camY, halfW, halfH, dt) {
      const d = Math.min(dt, 0.05)
      const now = Date.now()
      // The set changes every fourteen minutes and deriving it is a hash, but
      // there is no reason to run it sixty times a second.
      if (now - cachedAt > 4000) { cachedAt = now; cache = squallsAt(now) }

      // Where each squall is right now, and which of them are worth drawing.
      const live: { at: { x: number; y: number }; s: Squall; near: boolean }[] = []
      for (let i = 0; i < SLOTS; i++) {
        const s = cache[i]
        if (!s) { if (shadows[i]) shadows[i].alpha = 0; continue }
        const at = squallPos(s, now)
        const near = Math.abs(at.x - camX) < halfW + s.r * 1.2
          && Math.abs(at.y - camY) < halfH + s.r * 1.2
        live.push({ at, s, near })

        const sh = shadows[i]
        sh.visible = near
        if (!near) { sh.alpha = 0; continue }
        sh.position.set(at.x, at.y)
        sh.width = s.r * 2.1
        // Flat on the plane, like every shadow and every ring on this chart.
        sh.height = s.r * 2.1 * GROUND
        sh.alpha = 0.34 + s.power * 0.3
      }

      const onScreen = live.filter(l => l.near)

      // ── THE RAIN ──
      // Drops are only ever spawned inside a squall that is on screen, and
      // they are recycled the moment they land, so a chart with no weather on
      // it draws nothing and costs one loop.
      for (const drop of drops) {
        if (drop.h < 0) {
          if (!onScreen.length) { drop.p.alpha = 0; continue }
          const pick = onScreen[(Math.random() * onScreen.length) | 0]
          // Anywhere in the disc, distributed by area rather than by radius —
          // sqrt, or the rain crowds the middle and leaves the rim dry.
          const a = Math.random() * Math.PI * 2
          const rr = Math.sqrt(Math.random()) * pick.s.r * 0.98
          drop.x = pick.at.x + Math.cos(a) * rr
          drop.y = pick.at.y + Math.sin(a) * rr * 0.85
          drop.h = FALL * (0.7 + Math.random() * 0.5)
          drop.vh = 620 + Math.random() * 420
          drop.len = 0.5 + Math.random() * 0.75
          continue
        }
        drop.h -= drop.vh * d
        if (drop.h <= 0) {
          drop.h = -1
          drop.p.alpha = 0
          // AND IT LANDS. The ring is what makes this rain ON something.
          const dp = takeDimple()
          dp.x = drop.x; dp.y = drop.y
          dp.age = 0
          dp.life = 0.34 + Math.random() * 0.2
          dp.size = 5 + Math.random() * 7
          continue
        }
        drop.p.x = drop.x
        // In the AIR: the height is screen-space, so it is divided by GROUND
        // on the way in. Rain that took the plane's squash would be lying down.
        drop.p.y = drop.y - drop.h / GROUND
        drop.p.scaleX = 0.7
        drop.p.scaleY = drop.len
        drop.p.tint = tint
        drop.p.alpha = 0.34
      }

      for (const dp of dimples) {
        if (dp.age >= 1) { dp.p.alpha = 0; continue }
        dp.age += d / dp.life
        if (dp.age >= 1) { dp.p.alpha = 0; continue }
        dp.p.x = dp.x
        dp.p.y = dp.y
        const k = (dp.size * (0.5 + dp.age * 1.9)) / 32
        dp.p.scaleX = k
        dp.p.scaleY = k * GROUND
        dp.p.tint = tint
        dp.p.alpha = (1 - dp.age) * 0.3
      }
    },

    night(next) { tint = next },

    destroy() {
      water.destroy({ children: true })
      air.destroy({ children: true })
    },
  }
}
