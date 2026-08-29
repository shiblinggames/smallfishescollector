// ── A PLACE TO PUT THE BOAT ─────────────────────────────────────────────────
//
// A berth is a dashed circle with three lamps on it, which says "this area is
// special" and nothing else. It reads as a MAP ANNOTATION drawn over the water
// rather than as somewhere on the water you would tie up.
//
// What makes a real berth read is that the water inside it is different. It is
// lit, because a harbour is lit; it is calmer, because that is what a harbour
// is FOR; and it tells you where the entrance is. None of those were affordable
// as DOM: a lit pool is a blurred gradient the size of an island, and a moving
// one re-rasterises every frame.
//
// Three parts, and each answers a different question:
//
//   THE POOL — lantern light lying on the water. Answers "is this different
//   water", and it is the one doing most of the work. Warm, because every other
//   light on this chart is the sun or the moon and a harbour is neither.
//
//   THE RIM — where it stops. Answers "how close do I have to be". Tightens and
//   brightens when you are inside it, which is the whole feedback loop: the
//   berth tells you that it has you.
//
//   THE APPROACH — lights running around the ring toward the mouth. Answers
//   "which way in", which a symmetric circle cannot, and it is the part that
//   turns a marked area into somewhere you park. Runway lights, essentially,
//   and for the same reason.

import type { Container, Sprite, Texture } from 'pixi.js'

export type BerthSpec = {
  id: string
  /** Centre of the berth, in world coordinates. */
  x: number
  y: number
  r: number
  /** Which way the dock is, in radians. The approach lights run toward it. */
  bearing: number
}

/** The plane's squash. A berth lies flat ON the water, so it is an ellipse for
 *  the same reason every other flat thing here is. */
const GROUND = 0.58

/** How many lights run the ring. Enough to read as a chase rather than as
 *  individual lamps blinking. */
const LIGHTS = 14

let poolTex: Texture | null = null
let ringTex: Texture | null = null
let lampTex: Texture | null = null

function pool(PIXI: typeof import('pixi.js')): Texture {
  if (poolTex) return poolTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // Flat in the middle and soft at the edge. A plain radial falloff reads as a
  // spotlight aimed down at the water; harbour light is scattered by the whole
  // surface, so the middle is even and only the boundary is soft.
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.62)')
  grad.addColorStop(0.82, 'rgba(255,255,255,0.24)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  poolTex = PIXI.Texture.from(c)
  return poolTex
}

function ring(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // Soft on both sides: these are scaled up to island size and a hard stroke
  // turns into a dotted line the moment it is.
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.90, 'rgba(255,255,255,0)')
  grad.addColorStop(0.955, 'rgba(255,255,255,1)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

function lamp(PIXI: typeof import('pixi.js')): Texture {
  if (lampTex) return lampTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  lampTex = PIXI.Texture.from(c)
  return lampTex
}

/** Harbour amber. Deliberately not the gold the UI uses for currency: this is
 *  lamplight on water, not a value being displayed. */
const WARM = 0xffc478
const COOL = 0xbcd8e6

type Built = {
  spec: BerthSpec
  view: Container
  poolS: Sprite
  rimS: Sprite
  lamps: Sprite[]
  /** Eased rather than switched, so arriving is a berth waking up rather than a
   *  light being flicked on. */
  lit: number
}

export type Berths = {
  view: Container
  /** Which berth the captain is standing in, if any. */
  setActive(id: string | null): void
  advance(t: number, dt: number): void
  night(tint: number): void
  destroy(): void
}

export function makeBerths(
  PIXI: typeof import('pixi.js'),
  specs: BerthSpec[],
): Berths {
  const view: Container = new PIXI.Container()
  // Light on water adds; it does not cover. A berth painted over the sea would
  // hide the swell inside it, which is the opposite of "the water here is
  // different" — you want to still see it moving, just lit.
  view.blendMode = 'add'

  const built: Built[] = []
  for (const spec of specs) {
    const node: Container = new PIXI.Container()
    node.position.set(spec.x, spec.y)
    // Flat on the water.
    node.scale.set(1, GROUND)

    const poolS: Sprite = new PIXI.Sprite(pool(PIXI))
    poolS.anchor.set(0.5)
    poolS.width = spec.r * 2
    poolS.height = spec.r * 2
    poolS.tint = WARM
    poolS.alpha = 0
    node.addChild(poolS)

    const rimS: Sprite = new PIXI.Sprite(ring(PIXI))
    rimS.anchor.set(0.5)
    rimS.width = spec.r * 2.1
    rimS.height = spec.r * 2.1
    rimS.tint = COOL
    rimS.alpha = 0
    node.addChild(rimS)

    const lamps: Sprite[] = []
    for (let i = 0; i < LIGHTS; i++) {
      const a = (i / LIGHTS) * Math.PI * 2
      const s: Sprite = new PIXI.Sprite(lamp(PIXI))
      s.anchor.set(0.5)
      s.width = s.height = Math.max(14, spec.r * 0.13)
      s.position.set(Math.cos(a) * spec.r, Math.sin(a) * spec.r)
      s.tint = WARM
      s.alpha = 0
      node.addChild(s)
      lamps.push(s)
    }

    view.addChild(node)
    built.push({ spec, view: node, poolS, rimS, lamps, lit: 0 })
  }

  let active: string | null = null
  let tint = 0xffffff

  const shade = (c: number) => {
    if (tint === 0xffffff) return c
    const r = ((((c >> 16) & 0xff) * ((tint >> 16) & 0xff)) / 255) | 0
    const g = ((((c >> 8) & 0xff) * ((tint >> 8) & 0xff)) / 255) | 0
    const b = (((c & 0xff) * (tint & 0xff)) / 255) | 0
    return (r << 16) | (g << 8) | b
  }

  return {
    view,

    setActive(id) { active = id },

    advance(t, dt) {
      const d = Math.min(dt, 0.05)
      for (const b of built) {
        const want = b.spec.id === active ? 1 : 0
        // About a third of a second either way. Fast enough to feel like a
        // response to arriving, slow enough not to snap.
        b.lit += (want - b.lit) * Math.min(1, d * 3.4)
        const lit = b.lit

        // ── THE POOL ──
        // Breathing on a long, slow period: lamplight on moving water is never
        // quite steady, and a constant one reads as a decal.
        const breath = 0.5 + 0.5 * Math.sin(t * 0.55 + b.spec.x * 0.01)
        b.poolS.alpha = (0.055 + lit * 0.14) * (0.82 + breath * 0.18)
        b.poolS.tint = shade(WARM)

        // ── THE RIM ──
        // Cool while it is only a boundary, warm once it has you: the edge
        // stops being information and becomes part of the harbour.
        b.rimS.alpha = 0.12 + lit * 0.30
        b.rimS.tint = shade(lit > 0.5 ? WARM : COOL)
        // Drawn in a touch as you enter, so arriving reads as the berth closing
        // around you rather than as a colour change.
        const tighten = 2.1 - lit * 0.06
        b.rimS.width = b.spec.r * tighten
        b.rimS.height = b.spec.r * tighten

        // ── THE APPROACH ──
        // A brightness wave running around the ring toward the dock. Each lamp
        // is lit by how near the wave is to it, so what you see is a pulse
        // travelling the direction you should come in from — the one thing a
        // symmetric circle cannot say on its own.
        const head = b.spec.bearing + t * 1.15
        for (let i = 0; i < b.lamps.length; i++) {
          const a = (i / b.lamps.length) * Math.PI * 2
          // Shortest way round, so the wave does not stall at the seam.
          let gap = (a - head) % (Math.PI * 2)
          if (gap < 0) gap += Math.PI * 2
          if (gap > Math.PI) gap = Math.PI * 2 - gap
          const near = Math.max(0, 1 - gap / 0.9)
          const s = b.lamps[i]
          s.alpha = (0.10 + lit * 0.22) + near * near * (0.34 + lit * 0.46)
          s.tint = shade(WARM)
        }
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
