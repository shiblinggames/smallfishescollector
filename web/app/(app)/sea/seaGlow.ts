// ── A PATCH OF SEA THAT IS WORTH SOMETHING ──────────────────────────────────
//
// Hotspots and dig hints. Two systems and one object: a soft bloom lying ON the
// plane, big enough to steer toward and deliberately without an edge you could
// line a hull up with. The chart says which patches exist and what each one is
// worth; this draws them.
//
// ── ONE MODULE FOR BOTH, AND THAT IS NOT A GRAB-BAG ─────────────────────────
//
// They differ by colour and by why they are there, and in every way that
// touches the renderer they are identical: same texture, same squash, same
// pulse, same cull. Two layers would be the same forty lines twice and one of
// them would get a fix the other did not.
//
// ── SOFT, AND THE SOFTNESS IS THE POINT ─────────────────────────────────────
//
// A hard ring is a hitbox you line up with. A bloom you can see from a distance
// is something you steer toward, and the exact boundary does not matter because
// the patch is hundreds of pixels across. The rim is a HINT at an edge, never
// the edge — it is there so a patch reads as a place rather than as a smudge.
//
// ── AND IT IS ON THE CANVAS, WHERE WEATHER LIVES ────────────────────────────
//
// These were divs with radial-gradient backgrounds and CSS keyframes, laid over
// the sea the engine draws. Same reasoning as the fog: a visual on the water
// belongs on the water's own canvas. It composites with the swell instead of
// over it, it ADDS light rather than painting a coloured film on the surface,
// and it costs one sprite instead of a layout box the browser blends every
// frame. See docs/systems/ocean-hub.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

/** What the chart hands over. Everything here is world-space and per-patch:
 *  this module knows nothing about hotspots, dig sites or why any of it is
 *  lit. */
export type GlowPatch = {
  /** Stable while the patch stands, so a moved patch is a new patch. */
  key: string
  x: number
  y: number
  /** World radius. The bloom runs a little past it — see the texture. */
  r: number
  /** 0xRRGGBB. Parsed by the chart, because it holds the tables. */
  color: number
  /** How solid the middle is, 0..1. */
  fill: number
  /** How much of a hint the rim gives, 0..1. Zero draws no rim at all. */
  rim: number
  /**
   * SECONDS PER BREATH, or 0 to hold still.
   *
   * A hotspot sits on screen for ten minutes, so its pulse is slow: anything
   * quicker becomes a thing you want to look away from. A worked dig site does
   * not breathe at all, because a scar is not an invitation.
   */
  beat: number
  /** How far the breath carries, as a fraction of the radius. */
  swell: number
}

let discTex: Texture | null = null
let ringTex: Texture | null = null

/** The bloom. A long falloff with nothing resembling an edge in it, so the
 *  patch fades into the sea rather than sitting on it. */
function discTexture(PIXI: typeof import('pixi.js')): Texture {
  if (discTex) return discTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // The stops the DOM version was tuned to, read back off its gradient: solid
  // middle, a long shoulder, and gone by 80% so the sprite's own square edge is
  // never anywhere near anything visible.
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.34, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.62, 'rgba(255,255,255,0.20)')
  grad.addColorStop(0.80, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  discTex = PIXI.Texture.from(c)
  return discTex
}

/** The rim: a wide, soft band just inside the bloom's shoulder. Drawn as a
 *  gradient rather than a stroke, because a stroke is exactly the hard line
 *  this is not allowed to be. */
function ringTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.72, 'rgba(255,255,255,0)')
  grad.addColorStop(0.86, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

type Built = { p: GlowPatch; disc: Sprite; ring: Sprite | null }

export type Glow = {
  view: Container
  /** The whole set, replaced. Called when the chart's list changes, which is
   *  every fifteen seconds at most — not per frame. */
  set(list: GlowPatch[]): void
  /**
   * NO `night`, AND THAT IS DELIBERATE.
   *
   * These are ADDITIVE: a glow is light coming off the water, not paint lying
   * on it, and light does not get darker after dark. `seaLights` takes the same
   * line for the same reason. What does change at night is the sea underneath,
   * which makes a patch read brighter — which is true of a real one.
   */
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number): void
  destroy(): void
}

export function makeGlow(PIXI: typeof import('pixi.js')): Glow {
  const view: Container = new PIXI.Container()
  let built: Built[] = []

  /** Keyed, so a list that is mostly the same does not rebuild sprites the
   *  player is looking at — a patch that is re-created mid-breath jumps. */
  const byKey = new Map<string, Built>()

  function make(p: GlowPatch): Built {
    const disc: Sprite = new PIXI.Sprite(discTexture(PIXI))
    disc.anchor.set(0.5)
    disc.blendMode = 'add'
    view.addChild(disc)
    let ring: Sprite | null = null
    if (p.rim > 0) {
      ring = new PIXI.Sprite(ringTexture(PIXI))
      ring.anchor.set(0.5)
      ring.blendMode = 'add'
      view.addChild(ring)
    }
    return { p, disc, ring }
  }

  return {
    view,

    set(list) {
      const keep = new Set(list.map(p => p.key))
      for (const [k, b] of byKey) {
        if (keep.has(k)) continue
        b.disc.destroy()
        b.ring?.destroy()
        byKey.delete(k)
      }
      for (const p of list) {
        const had = byKey.get(p.key)
        // The KEY is the identity; everything else can move under it. A dig
        // hint keeps its key and changes its colour as you close on it, and
        // rebuilding the sprite for that would restart its breath.
        if (had) { had.p = p; continue }
        byKey.set(p.key, make(p))
      }
      built = [...byKey.values()]
    },

    advance(camX, camY, halfW, halfH, t) {
      for (const b of built) {
        const { p, disc, ring } = b
        // Off screen costs one comparison and nothing else. A patch is hundreds
        // of pixels across, so the margin is its own radius rather than a
        // constant.
        const on = Math.abs(p.x - camX) < halfW + p.r * 1.4
          && Math.abs(p.y - camY) < halfH + p.r * 1.4
        disc.visible = on
        if (ring) ring.visible = on
        if (!on) continue

        // The breath. Seeded off the patch's own key so two spots side by side
        // are never in step, which is what made a field of them read as a
        // regiment.
        let seed = 0
        for (let i = 0; i < p.key.length; i++) seed = (seed * 31 + p.key.charCodeAt(i)) | 0
        const ph = (seed % 1000) / 1000 * Math.PI * 2
        const wave = p.beat > 0 ? Math.sin((t / p.beat) * Math.PI * 2 + ph) : 0
        const k = 1 + wave * p.swell

        // ON THE PLANE. Flat things multiply by GROUND — the house rule, and the
        // difference between a patch of sea and a circle stuck to the glass.
        const w = p.r * 2.5 * k
        disc.position.set(p.x, p.y)
        disc.width = w
        disc.height = w * GROUND
        disc.tint = p.color
        disc.alpha = p.fill * (0.86 + wave * 0.14)

        if (ring) {
          ring.position.set(p.x, p.y)
          ring.width = w
          ring.height = w * GROUND
          ring.tint = p.color
          ring.alpha = p.rim * (0.8 + wave * 0.2)
        }
      }
    },

    destroy() {
      byKey.clear()
      built = []
      view.destroy({ children: true })
    },
  }
}
