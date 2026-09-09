// ── SOMEBODY LIVES HERE ─────────────────────────────────────────────────────
//
// The towns were the deadest thing on the chart. Every other surface moves —
// the sea swells, the surf breaks, the grass leans, the fog rolls, the birds
// cross — and the places people actually live in were flat plates that had not
// changed a pixel since they were baked.
//
// Chimney smoke is the cheapest possible fix and by some distance the most
// effective. A house with smoke coming out of it is inhabited; the same house
// without is scenery. It costs one particle layer for the whole chart.
//
// ── IT RISES ON THE SCREEN AND DRIFTS ON THE PLANE ──────────────────────────
//
// Those are two different axes and getting them confused is the whole trick of
// smoke on a squashed plane. A puff going UP is going up the SCREEN, so its
// world offset is divided by GROUND like everything else with height. A puff
// blowing DOWNWIND is travelling across the water, so it moves in plain world
// coordinates along the same WIND the grass leans into and the swell runs with.
//
// Do both in world units and the smoke leans over at 58% of the angle it
// should. Do both in screen units and it stops belonging to the island it is
// coming off.
//
// ── AND IT IS NOT ADDITIVE ──────────────────────────────────────────────────
//
// Nearly every other particle layer on this chart lightens what is under it,
// because nearly every other one is made of light: spray, glints, sparks, foam.
// Smoke is the exception. It is a cloud of solid specks that OCCLUDE, and an
// additive plume over a dark sea glows like a flare. Normal blending, and the
// darker tints have to be able to darken.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { WIND_X, WIND_Y } from './seaSwell'

/** Puffs in the air at once across every chimney on the chart. */
const CAP = 150

/** How long one puff lasts, and how far apart they leave the pot. A slow, wide
 *  drift: a thin fast stream reads as steam under pressure, and these are
 *  hearths. */
const LIFE_MIN = 3.6
const LIFE_VAR = 1.9
const EVERY = 0.62

/** Screen pixels a second upward, and world pixels a second downwind. The ratio
 *  is what sets the lean of the plume. */
const RISE = 15
const DRIFT = 11

let puffTex: Texture | null = null

/**
 * A puff: soft all the way out, and DIM IN THE MIDDLE rather than bright.
 *
 * A radial gradient from opaque white is how every other particle here is made,
 * and it is wrong for smoke — a bright core reads as a light source. This one
 * peaks a little way out from the centre and stays under half alpha, so a puff
 * is a thickening of the air rather than a ball.
 */
function puffTexture(PIXI: typeof import('pixi.js')): Texture {
  if (puffTex) return puffTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,0.44)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.50)')
  grad.addColorStop(0.72, 'rgba(255,255,255,0.20)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  puffTex = PIXI.Texture.from(c)
  return puffTex
}

/** A pot on a roof, in WORLD pixels. `heat` scales how fast and how dark it
 *  smokes — a forge is not a kitchen. */
export type Chimney = { x: number; y: number; heat: number; tint: number }

export type Smoke = {
  view: Container
  /** One frame. `camX`/`camY` and the half-extents cull the EMITTERS: a chimney
   *  off the edge of the screen makes no puffs, which is most of the chart most
   *  of the time. Puffs already in the air keep moving wherever they are, so
   *  nothing snaps when a town comes into view. */
  advance(dt: number, camX: number, camY: number, halfW: number, halfH: number): void
  destroy(): void
}

type Puff = {
  p: Particle
  x: number; y: number
  /** How far it has risen, in SCREEN pixels. Converted on the way out. */
  up: number
  age: number; life: number
  seed: number
  size: number
}

export function makeSmoke(
  PIXI: typeof import('pixi.js'),
  chimneys: Chimney[],
): Smoke {
  const view: Container = new PIXI.Container()
  const layer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  view.addChild(layer)

  const tex = puffTexture(PIXI)
  const puffs: Puff[] = []
  for (let i = 0; i < CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    layer.addParticle(p)
    puffs.push({ p, x: 0, y: 0, up: 0, age: 1, life: 1, seed: 0, size: 0 })
  }
  let next = 0
  const take = () => { const q = puffs[next]; next = (next + 1) % CAP; return q }

  // Each pot keeps its own clock, started somewhere different, or every chimney
  // on the chart puffs on the same beat.
  const clocks = chimneys.map((_, i) => ((i * 0.61803) % 1) * EVERY)

  return {
    view,

    advance(dt, camX, camY, halfW, halfH) {
      for (let i = 0; i < chimneys.length; i++) {
        const ch = chimneys[i]
        if (Math.abs(ch.x - camX) > halfW + 400) continue
        if (Math.abs(ch.y - camY) > halfH + 400) continue
        clocks[i] -= dt * ch.heat
        if (clocks[i] > 0) continue
        clocks[i] += EVERY
        const q = take()
        q.x = ch.x + (Math.random() - 0.5) * 5
        q.y = ch.y
        q.up = 0
        q.age = 0
        q.life = LIFE_MIN + Math.random() * LIFE_VAR
        q.seed = Math.random() * 6.28
        q.size = 0.26 + Math.random() * 0.16
        q.p.tint = ch.tint
      }

      for (let k = 0; k < CAP; k++) {
        const q = puffs[k]
        if (q.age >= q.life) { q.p.alpha = 0; continue }
        q.age += dt
        const u = q.age / q.life

        // UP THE SCREEN, and it slows as it goes: a plume loses its push a few
        // roof-heights off the pot and after that it is only being carried.
        q.up += RISE * (1 - u * 0.55) * dt
        // AND ACROSS THE WATER, gathering pace as it leaves the shelter of the
        // roof it came off.
        q.x += WIND_X * DRIFT * (0.35 + u) * dt
        q.y += WIND_Y * DRIFT * (0.35 + u) * dt
        // A slow wander, so a plume is not a ruled line. Cheap: one sine on a
        // per-puff phase rather than any kind of noise.
        const wob = Math.sin(q.seed + q.age * 0.9) * 5 * u

        q.p.x = q.x + wob
        // The rise is the only part that has to be un-squashed. See the header.
        q.p.y = q.y - q.up / GROUND

        // Spreads as it goes, the way anything diffusing does.
        const s = q.size * (1 + u * 2.6)
        q.p.scaleX = s
        q.p.scaleY = s
        // In fast, out slow. Smoke does not appear at full strength and it
        // does not stop being there all at once either.
        q.p.alpha = Math.min(1, u * 7) * (1 - u) * (1 - u)
      }
    },

    destroy() {
      view.destroy({ children: true })
    },
  }
}
