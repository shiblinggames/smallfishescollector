// ── THE FISH COMES OUT OF THE WATER ─────────────────────────────────────────
//
// The most repeated moment in this game happened entirely inside a card. You
// stopped the needle, the dial froze, and six hundred milliseconds later a
// panel told you what you had caught. The sea was right there and nothing ever
// came out of it.
//
// So it breaks the surface: the line's end erupts, a dark shape clears the
// water on an arc, and it drops back with a second smaller splash while the
// card is still on its way. That is the whole of it, and it is the payoff the
// shoals set up — we filled the water with fish and then took them out of it
// off screen.
//
// ── IT LIVES INSIDE THE HOLD THAT ALREADY EXISTS ────────────────────────────
//
// FishingHere already freezes the dial for 620ms after the tap, 900 on a
// perfect, so the needle has visibly stopped before the answer lands. That is
// exactly the window this needs and it is why nothing here adds a millisecond
// of delay: the arc is timed to be back in the water as the card arrives, so
// the card is a caption on something you just watched rather than the first you
// hear of it.
//
// ── A SILHOUETTE, NOT THE SPECIES ───────────────────────────────────────────
//
// Tempting to show the actual fish, and wrong twice over. The plates are 140KB
// and the name does not arrive until `reelIn` answers, so it would be a fetch
// and a race in the one moment that must not stutter. And a dark shape is what
// you SEE when a fish comes up: the card is where it gets identified, and doing
// that job twice takes the reveal off the card without giving it to anywhere
// else.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

/** Droplets in the air at once, across every splash. Two catches inside a
 *  second is possible with a fast reel and neither should thin the other. */
const CAP = 150

/** How long the fish is out of the water. Comfortably inside the 620ms hold,
 *  so it is back down as the card arrives rather than fighting it. */
const ARC_MS = 520
const ARC_PERFECT_MS = 700

let dropTex: Texture | null = null
let ringTex: Texture | null = null
let fishTex: Texture | null = null

function dropTexture(PIXI: typeof import('pixi.js')): Texture {
  if (dropTex) return dropTex
  const S = 32
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  dropTex = PIXI.Texture.from(c)
  return dropTex
}

/** The ring the splash leaves ON the water. Soft on both sides, like the
 *  wake's rings, because a hard stroke scaled up turns into a dotted line. */
function ringTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.72, 'rgba(255,255,255,0)')
  grad.addColorStop(0.90, 'rgba(255,255,255,1)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

/** The shape that clears the water. The same read as the shoals' fish, drawn
 *  bigger and darker: a fat head narrowing to a tail, and nothing else, because
 *  at this size and this speed detail is mud. */
function fishTexture(PIXI: typeof import('pixi.js')): Texture {
  if (fishTex) return fishTex
  const W = 128, H = 64
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.save()
  g.translate(W * 0.42, H / 2)
  g.scale(1, 0.42)
  g.beginPath(); g.arc(0, 0, W * 0.4, 0, Math.PI * 2); g.fill()
  g.restore()
  // The tail, and a dorsal, which is the whole of what says "fish" against a
  // sky rather than "thrown object".
  g.beginPath()
  g.moveTo(W * 0.74, H / 2)
  g.lineTo(W * 0.99, H * 0.2)
  g.lineTo(W * 0.99, H * 0.8)
  g.closePath(); g.fill()
  g.beginPath()
  g.moveTo(W * 0.34, H * 0.34)
  g.quadraticCurveTo(W * 0.44, H * 0.06, W * 0.6, H * 0.36)
  g.closePath(); g.fill()
  fishTex = PIXI.Texture.from(c)
  return fishTex
}

type Drop = {
  p: Particle
  x: number; y: number
  vx: number; vy: number
  /** Height above the water, in world px. Gravity acts on THIS, not on y. */
  h: number
  vh: number
  age: number
  life: number
  size: number
}

type Burst = {
  ring: Particle
  /** Kept in the pool so the layer's shape does not change; never drawn. See
   *  the note in the frame loop about where the fish went. */
  fish: Particle
  x: number; y: number
  /** Which way the fish leaves and returns. */
  dir: number
  age: number
  /** Seconds the arc lasts. */
  life: number
  perfect: boolean
  /** Has the re-entry splash been thrown yet. */
  splashed: boolean
}

export type Splash = {
  view: Container
  /**
   * SOMETHING CAME UP HERE, in world coordinates.
   *
   * `dir` is which way the boat is facing, so the fish leaves the water heading
   * away from the hull rather than into it.
   */
  fire(x: number, y: number, dir: number, perfect: boolean): void
  advance(dt: number): void
  night(tint: number): void
  destroy(): void
}

export function makeSplash(PIXI: typeof import('pixi.js')): Splash {
  const view: Container = new PIXI.Container()

  // The ring lies ON the plane and is squashed with it; the droplets and the
  // fish are in the AIR and are not. Two containers because that squash is the
  // difference between water and everything above it.
  const ringLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  const fishLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  const dropLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  dropLayer.blendMode = 'add'
  view.addChild(ringLayer)
  view.addChild(fishLayer)
  view.addChild(dropLayer)

  const rt = ringTexture(PIXI), ft = fishTexture(PIXI), dt2 = dropTexture(PIXI)

  const drops: Drop[] = []
  for (let i = 0; i < CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: dt2 })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    dropLayer.addParticle(p)
    drops.push({ p, x: 0, y: 0, vx: 0, vy: 0, h: 0, vh: 0, age: 1, life: 1, size: 0 })
  }
  let nd = 0
  const takeDrop = () => { const d = drops[nd]; nd = (nd + 1) % CAP; return d }

  /** Two at once is the most this ever needs: a fast reel can land a second
   *  catch while the first is still in the air, and neither should cut the
   *  other off mid-arc. */
  const bursts: Burst[] = []
  for (let i = 0; i < 2; i++) {
    const ring: Particle = new PIXI.Particle({ texture: rt })
    ring.anchorX = 0.5; ring.anchorY = 0.5; ring.alpha = 0
    ringLayer.addParticle(ring)
    const fish: Particle = new PIXI.Particle({ texture: ft })
    fish.anchorX = 0.5; fish.anchorY = 0.5; fish.alpha = 0
    fishLayer.addParticle(fish)
    bursts.push({ ring, fish, x: 0, y: 0, dir: 1, age: 1, life: 1, perfect: false, splashed: true })
  }
  let nb = 0

  let tint = 0xffffff

  /** A handful of water thrown up from a point. `up` scales the whole throw, so
   *  the same call does the eruption and the smaller re-entry. */
  const throwWater = (x: number, y: number, n: number, up: number, gold: boolean) => {
    for (let i = 0; i < n; i++) {
      const d = takeDrop()
      const a = Math.random() * Math.PI * 2
      const out = (30 + Math.random() * 120) * up
      d.x = x; d.y = y
      d.vx = Math.cos(a) * out
      d.vy = Math.sin(a) * out * GROUND
      d.h = 0
      d.vh = (110 + Math.random() * 190) * up
      d.age = 0
      d.life = 0.42 + Math.random() * 0.36
      d.size = (3 + Math.random() * 6) * up
      // A perfect throws gold water. It is the same colour the dial's flash and
      // the burst ring use, so the three read as one event.
      d.p.tint = gold && Math.random() < 0.55 ? 0xfde68a : tint
    }
  }

  return {
    view,

    fire(x, y, dir, perfect) {
      const b = bursts[nb]; nb = (nb + 1) % bursts.length
      b.x = x; b.y = y; b.dir = dir >= 0 ? 1 : -1
      b.age = 0
      b.life = (perfect ? ARC_PERFECT_MS : ARC_MS) / 1000
      b.perfect = perfect
      b.splashed = false
      throwWater(x, y, perfect ? 34 : 22, perfect ? 1.25 : 1, perfect)
    },

    advance(dt) {
      const d = Math.min(dt, 0.05)

      for (const b of bursts) {
        if (b.age >= 1) { b.ring.alpha = 0; b.fish.alpha = 0; continue }
        b.age += d / b.life

        // ── THE RING ON THE WATER ── opens fast and fades, flat on the plane.
        const r = 26 + b.age * (b.perfect ? 150 : 110)
        b.ring.x = b.x
        b.ring.y = b.y
        b.ring.scaleX = (r * 2) / 128
        b.ring.scaleY = ((r * 2) / 128) * GROUND
        b.ring.tint = b.perfect ? 0xfde68a : tint
        b.ring.alpha = Math.max(0, (1 - b.age) * 0.5)

        // ── THE FISH IS NOT DRAWN HERE ANY MORE ──────────────────────
        //
        // It used to arc out of the water, over, and BACK IN, with a second
        // splash where it re-entered. Which is what a fish jumping does — and
        // it is the wrong story. You just caught it: the one thing it must not
        // look like is going back in the sea.
        //
        // So this layer keeps the part that was always right, the water
        // bursting where the line was, and the fish itself is handed to
        // components/HoldFlight, which carries it out of the burst and into the
        // Hold where the count then ticks. One motion, one ending, and the
        // ending is the hold rather than the water.
        b.fish.alpha = 0
      }

      for (const p of drops) {
        if (p.age >= 1) { p.p.alpha = 0; continue }
        p.age += d / p.life
        if (p.age >= 1) { p.p.alpha = 0; continue }
        // GRAVITY ON THE HEIGHT, not on y. y is a position on the water plane
        // and a droplet falling in world y would slide across the sea rather
        // than come down into it.
        p.vh -= 620 * d
        p.h = Math.max(0, p.h + p.vh * d)
        p.x += p.vx * d
        p.y += p.vy * d
        p.vx *= 1 - 1.4 * d
        p.vy *= 1 - 1.4 * d
        p.p.x = p.x
        p.p.y = p.y - p.h / GROUND
        const s = p.size / 32
        p.p.scaleX = s
        p.p.scaleY = s
        p.p.alpha = Math.pow(1 - p.age, 1.5)
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
