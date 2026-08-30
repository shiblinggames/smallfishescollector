// ── THE WAY THERE ───────────────────────────────────────────────────────────
//
// A line of lights on the water running from the hull to wherever the captain
// has been told to go, flowing in that direction.
//
// It exists because "take her back to the Mainland" is not a direction. The
// chart is twenty thousand pixels across, most of it looks like the rest of it,
// and a captain ninety seconds into their first session has no idea which way
// anything is. Naming the place tells them WHAT; this tells them WHICH WAY, and
// without it the first instruction the game gives is one it has not equipped
// them to follow.
//
// ── WHY IT FLOWS, AND WHY THAT IS THE WHOLE DESIGN ──────────────────────────
//
// A static dotted line is a line on a map: it says a route exists. Lights that
// TRAVEL along it say which end is the destination — the same information an
// arrow carries, without an arrow's problem of having to point somewhere on a
// screen the destination is usually not on. Sail the wrong way and the lights
// stream past you the wrong way, which corrects the mistake without a word.
//
// ── AND IT STOPS SHORT AT BOTH ENDS ─────────────────────────────────────────
//
// It never touches the hull and never reaches the island. Under the boat it
// would read as something she is dragging; arriving at the island it would read
// as a border drawn round it. A gap at both ends leaves it unmistakably a
// route, which is the only thing it is.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'

/** Lights on the line. Enough to read as a path rather than as three dots, few
 *  enough that it never becomes a wall between the captain and the sea. */
const DOTS = 26

/** World px between them. The line is resampled to whatever the distance is,
 *  so this is only the target spacing — a long haul gets the same count spread
 *  further apart rather than a hundred more lights. */
const GAP = 90

/** How fast they travel, as a fraction of the whole run per second. Slow: this
 *  is a current, not a conveyor belt. */
const FLOW = 0.16

let dotTex: Texture | null = null

function light(PIXI: typeof import('pixi.js')): Texture {
  if (dotTex) return dotTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,1)')
  grad.addColorStop(0.30, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  dotTex = PIXI.Texture.from(c)
  return dotTex
}

/** The tour's own colour, so a light on the water is recognisably the same
 *  voice as the card that put it there. */
const GUIDE = 0x7fd6c0

export type SeaPath = {
  view: Container
  /**
   * Both ends in world coordinates, or null to put it away. `radius` draws a
   * ring at the far end — somewhere to sail INTO rather than a direction to
   * sail in, which is the difference between "south" and "there".
   */
  set(
    from: { x: number; y: number } | null,
    to: { x: number; y: number } | null,
    radius?: number,
  ): void
  advance(t: number): void
  destroy(): void
}

export function makePath(PIXI: typeof import('pixi.js')): SeaPath {
  // A PLAIN container holding both halves. The lights are particles and the
  // ring is a sprite, and a ParticleContainer takes particles ONLY — putting a
  // Sprite in one is not a thing that draws.
  const view: Container = new PIXI.Container()
  view.visible = false

  const dotLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  // Light on water, like everything else out here that is not a solid thing.
  dotLayer.blendMode = 'add'
  view.addChild(dotLayer)

  const tex = light(PIXI)
  const dots: Particle[] = []
  for (let i = 0; i < DOTS; i++) {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    p.tint = GUIDE
    dotLayer.addParticle(p)
    dots.push(p)
  }

  // ── AND THE PLACE ITSELF ──────────────────────────────────────────────────
  //
  // A ring on the water at the far end. The lights say which way; this says
  // where it stops, and gives the captain something to be INSIDE rather than a
  // heading to hold forever. Flat on the plane, like everything else lying on
  // the water.
  const ringTex = (() => {
    const S = 256
    const c = document.createElement('canvas')
    c.width = c.height = S
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grad.addColorStop(0.00, 'rgba(255,255,255,0.10)')
    grad.addColorStop(0.62, 'rgba(255,255,255,0.13)')
    grad.addColorStop(0.86, 'rgba(255,255,255,0.85)')
    grad.addColorStop(0.98, 'rgba(255,255,255,0)')
    grad.addColorStop(1.00, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
    return PIXI.Texture.from(c)
  })()
  const mark: import('pixi.js').Sprite = new PIXI.Sprite(ringTex)
  mark.anchor.set(0.5)
  mark.tint = GUIDE
  mark.blendMode = 'add'
  mark.visible = false
  view.addChild(mark)

  let a: { x: number; y: number } | null = null
  let b: { x: number; y: number } | null = null
  let rad = 0

  return {
    view,

    set(from, to, radius = 0) {
      a = from
      b = to
      rad = radius
      view.visible = !!(from && to)
      mark.visible = !!(to && radius > 0)
    },

    advance(t) {
      if (!a || !b) return

      if (rad > 0) {
        // Breathing, and it never goes out — the ring is the destination, so it
        // is still the answer when the captain is standing in it.
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.5)
        mark.visible = true
        mark.position.set(b.x, b.y)
        const k = (rad * 2 * (1 + pulse * 0.05)) / 256
        mark.width = 256 * k
        // Flat on the water, so it is an ellipse for the same reason the
        // berths and the island shadows are.
        mark.height = 256 * k * 0.58
        mark.alpha = 0.24 + pulse * 0.16
      } else {
        mark.visible = false
      }
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      // Arrived: the lights have done their job and a stack of them on top of
      // the destination is clutter. The RING stays — it is where they are meant
      // to be, and it should still be saying so once they are there.
      if (len < Math.max(320, rad)) {
        for (const p of dots) p.alpha = 0
        return
      }

      const ux = dx / len, uy = dy / len
      // CLEAR OF BOTH ENDS. Never under the hull, never on the island.
      const head = 170
      const tail = 240
      const run = Math.max(1, len - head - tail)
      // As many as the run wants, up to the pool. A short hop gets a few
      // lights; a long haul gets all of them, spread wider.
      const n = Math.max(2, Math.min(DOTS, Math.round(run / GAP)))
      const flow = (t * FLOW) % 1

      for (let i = 0; i < DOTS; i++) {
        const p = dots[i]
        if (i >= n) { p.alpha = 0; p.scaleX = p.scaleY = 0; continue }
        // Each light travels the whole run and wraps, so the line reads as
        // moving rather than as blinking in place.
        const f = ((i / n) + flow) % 1
        const d = head + f * run
        p.x = a.x + ux * d
        p.y = a.y + uy * d
        // Fading in as it leaves and out as it arrives, so nothing pops into
        // existence beside the boat or vanishes at the island.
        const edge = Math.min(1, Math.min(f, 1 - f) / 0.16)
        const size = 13 + 7 * Math.sin(f * Math.PI)
        const k = size / 64
        p.scaleX = k
        p.scaleY = k
        p.alpha = 0.5 * edge
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
