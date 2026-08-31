// ── BIRDS WORKING OVER A PATCH ──────────────────────────────────────────────
//
// The signal every fisherman actually uses, and the half of "you can see the
// fish" that works from a distance.
//
// The shoals under the surface (seaShoals) are dim on purpose, because a fish
// seen through water is a suggestion of a fish. That is right up close and
// useless at a range: a hotspot is somewhere you should be able to decide to
// sail to from most of a screen away, and the only thing telling you where one
// was is a badge that appears once you are already in it.
//
// Birds solve it the way they solve it at sea. They are above the water rather
// than under it, so they are bright and sharp where everything below them is
// dim; they are in the AIR, so nothing occludes them; and a knot of them
// circling one patch of open ocean means one thing and has meant it for as long
// as people have fished.
//
// ── NOT OVER EVERY HOTSPOT, AND THE OMISSION IS THE INFORMATION ─────────────
//
// A shoal and a flotsam patch are surface things: fish near the top, and scraps
// floating on it. Gulls belong over both. A TRENCH is the one that is about
// depth, and it gets nothing, which quietly teaches the most useful thing on
// this chart: birds mean fish near the surface. A trench you have to find the
// way you always did.
//
// ── THEY ARE IN THE AIR, WHICH THE PROJECTION HAS TO BE TOLD ────────────────
//
// The chart is an orthographic tilt: the world container is scaled by GROUND on
// the vertical, so a world-space offset upward comes out squashed. Altitude is
// therefore divided by GROUND before it is applied, exactly the way every label
// and every standing building on this chart is counter-squashed, so a bird
// eighty pixels up is eighty SCREEN pixels up.
//
// And each one drops a shadow on the water below it. That is the entire reason
// the altitude reads at all: without it a gull is a bird-shaped mark lying on
// the sea.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { hotspotsAt, type Hotspot } from '@/lib/seaHotspots'

/** Birds per patch. Enough to read as a commotion from across the water, few
 *  enough that arriving does not feel like sailing into a flock. */
const PER_SPOT = 7
/** Patches drawn at once. HOTSPOT_COUNT is three, and this never needs to
 *  exceed it; sized here so the pool is fixed whatever that becomes. */
const SPOTS = 3
const COUNT = PER_SPOT * SPOTS

/** How high they work, in SCREEN pixels. Divided by GROUND on the way in. */
const ALT_LO = 46
const ALT_HI = 104

let gullTex: Texture | null = null
let shadowTex: Texture | null = null

/**
 * A GULL FROM UNDERNEATH: two swept wings and a body between them. Drawn rather
 * than painted because at this size a plate is four grey pixels, and because
 * the shape has to stay legible while it flaps, which is a vertical squash of
 * the same silhouette.
 */
function gullTexture(PIXI: typeof import('pixi.js')): Texture {
  if (gullTex) return gullTex
  const W = 64, H = 32
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.strokeStyle = '#ffffff'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = 4.6
  // One stroke, both wings: up from the left tip, down to the body, up to the
  // right tip. A gull seen from below is a shallow M and nothing else.
  g.beginPath()
  g.moveTo(W * 0.08, H * 0.34)
  g.quadraticCurveTo(W * 0.28, H * 0.14, W * 0.42, H * 0.56)
  g.quadraticCurveTo(W * 0.5, H * 0.68, W * 0.58, H * 0.56)
  g.quadraticCurveTo(W * 0.72, H * 0.14, W * 0.92, H * 0.34)
  g.stroke()
  gullTex = PIXI.Texture.from(c)
  return gullTex
}

/** The soft dark ellipse under one. Flat on the plane, like every other shadow
 *  and every berth ring on this chart. */
function shadowTexture(PIXI: typeof import('pixi.js')): Texture {
  if (shadowTex) return shadowTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(0,0,0,0.9)')
  grad.addColorStop(0.6, 'rgba(0,0,0,0.35)')
  grad.addColorStop(1.0, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  shadowTex = PIXI.Texture.from(c)
  return shadowTex
}

type Gull = {
  bird: Particle
  shade: Particle
  /** Which of the drawn patches it belongs to. */
  slot: number
  /** Its own orbit: radius as a fraction of the patch, phase, rate, altitude. */
  rad: number
  ph: number
  rate: number
  alt: number
  /** Wing timing, so a flock does not beat as one. */
  flap: number
  size: number
}

export type Gulls = {
  view: Container
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number, dt: number): void
  night(tint: number): void
  destroy(): void
}

export function makeGulls(PIXI: typeof import('pixi.js')): Gulls {
  const view: Container = new PIXI.Container()
  // Shadows FIRST, so a bird is never behind its own shadow.
  const shadeLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  const birdLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  view.addChild(shadeLayer)
  view.addChild(birdLayer)

  const gt = gullTexture(PIXI)
  const st = shadowTexture(PIXI)

  const gulls: Gull[] = []
  for (let i = 0; i < COUNT; i++) {
    const bird: Particle = new PIXI.Particle({ texture: gt })
    bird.anchorX = 0.5; bird.anchorY = 0.5; bird.alpha = 0
    birdLayer.addParticle(bird)
    const shade: Particle = new PIXI.Particle({ texture: st })
    shade.anchorX = 0.5; shade.anchorY = 0.5; shade.alpha = 0
    shadeLayer.addParticle(shade)
    gulls.push({
      bird, shade, slot: Math.floor(i / PER_SPOT),
      // Spread across the patch rather than ringed round its edge: a flock
      // works a body of water, it does not orbit a point.
      rad: 0.25 + Math.random() * 0.85,
      ph: Math.random() * Math.PI * 2,
      // Mixed directions. Every bird turning the same way is a carousel.
      rate: (0.22 + Math.random() * 0.3) * (Math.random() < 0.5 ? -1 : 1),
      alt: ALT_LO + Math.random() * (ALT_HI - ALT_LO),
      flap: 5 + Math.random() * 4,
      size: 0.42 + Math.random() * 0.3,
    })
  }

  let tint = 0xffffff
  let spots: Hotspot[] = []
  let spotsAt = 0
  /** Eased per slot, so a patch expiring lets its birds fade off rather than
   *  deleting them mid-air. */
  const lit = new Array<number>(SPOTS).fill(0)

  return {
    view,

    advance(camX, camY, halfW, halfH, t, dt) {
      const d = Math.min(dt, 0.05)
      const now = Date.now()
      if (now - spotsAt > 4000) {
        spotsAt = now
        // Surface patches only. See the header: a trench gets no birds, and
        // that absence is the most useful thing on this chart.
        spots = hotspotsAt(now).filter(s => s.kind === 'shoal' || s.kind === 'flotsam')
      }

      for (let k = 0; k < SPOTS; k++) {
        const s = spots[k]
        // OFF SCREEN IS OFF. A patch on the far side of the chart costs nothing
        // but the distance test: seven birds and seven shadows each.
        const near = !!s
          && Math.abs(s.x - camX) < halfW + s.r * 2.5
          && Math.abs(s.y - camY) < halfH + s.r * 2.5
        lit[k] += ((near ? 1 : 0) - lit[k]) * Math.min(1, d * 2.2)
      }

      for (const g of gulls) {
        const s = spots[g.slot]
        const on = lit[g.slot]
        if (!s || on < 0.01) { g.bird.alpha = 0; g.shade.alpha = 0; continue }

        g.ph += g.rate * d
        const rr = s.r * g.rad
        const x = s.x + Math.cos(g.ph) * rr
        // The orbit itself is flattened, because a circle on this plane is an
        // ellipse and a bird's circuit is on the plane like everything else.
        const yOnWater = s.y + Math.sin(g.ph) * rr * 0.72

        // ── THE SHADOW, on the water, directly under it ──
        g.shade.x = x
        g.shade.y = yOnWater
        const sk = (g.size * 22 * (1 - (g.alt - ALT_LO) / (ALT_HI - ALT_LO) * 0.35)) / 64
        g.shade.scaleX = sk
        g.shade.scaleY = sk * GROUND
        // Higher is fainter and wider, which is the only cue for how high.
        g.shade.alpha = on * (0.2 - (g.alt - ALT_LO) / (ALT_HI - ALT_LO) * 0.09)

        // ── AND THE BIRD, above it ──
        // Divided by GROUND so the world's vertical squash cancels: eighty
        // world px up would read as forty-six on screen, and altitude is a
        // screen fact.
        g.bird.x = x
        g.bird.y = yOnWater - g.alt / GROUND
        // Facing the way it is going, and banking slightly into the turn.
        const heading = Math.cos(g.ph + Math.PI / 2) * (g.rate > 0 ? 1 : -1)
        const k = g.size
        g.bird.scaleX = k * (heading >= 0 ? 1 : -1)
        // THE FLAP is a vertical squash of the same silhouette, which is what
        // a gull's wingbeat looks like from underneath. Never all the way flat:
        // a wing edge-on for a frame reads as the bird vanishing.
        g.bird.scaleY = k * (0.52 + 0.48 * Math.abs(Math.sin(t * g.flap + g.ph * 3)))
        g.bird.rotation = Math.sin(g.ph) * 0.16
        g.bird.tint = tint
        g.bird.alpha = on * 0.85
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
