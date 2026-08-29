// ── THINGS ON THE WATER THAT YOU SAIL PAST ──────────────────────────────────
//
// The chart's sense of motion came from three repeating mottle tiles scrolling
// under the camera, and a repeating tile is close to the worst thing you can
// move if you want motion to READ. It is self-similar: every tile looks like
// the last one, so there is nothing to fix your eye on and nothing to measure
// your progress against. Slide it at any speed and the honest impression is
// that the texture is sliding, not that you are travelling — which is exactly
// "the ocean scrolls with me".
//
// What sells travel is DISCRETE FEATURES YOU PASS. One fleck of foam that
// appears ahead, grows, goes by and is gone behind you says more about speed
// than any amount of moving texture, because you can track it. That is all this
// is: a field of small bright things at fixed positions in the world.
//
// ── THEY DO NOT MOVE WITH YOU, WHICH IS THE ENTIRE POINT ────────────────────
//
// Each fleck has a world position and keeps it. The camera moves; they do not.
// They are children of the world container, so the same transform that carries
// the islands carries them, and their motion on screen is exactly the motion of
// the sea past the hull — because it IS the sea past the hull.
//
// The only trick is coverage. A field big enough to cover the chart would be
// hundreds of thousands of flecks, nearly all off screen. So a fixed few
// hundred are WRAPPED around the camera: when one falls off the left, it is
// re-placed off the right, a whole viewport away. It changes world position,
// but only ever while nobody can see it, and the wrap is a modulo rather than a
// respawn so the field stays evenly spread instead of clumping at the edges.
//
// ── AND THEY DRIFT, SLIGHTLY ────────────────────────────────────────────────
//
// A dead-still field reads as snow on a screen. A slow common current with a
// little per-fleck variation reads as water. The drift is deliberately far
// slower than the boat: it should be invisible while sailing and only obvious
// when you stop, which is what a current looks like.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'

/** How many flecks are alive at once. Sized so a viewport holds a scattering
 *  rather than a crowd: the eye wants a few things to track, not confetti. */
const COUNT = 260

/** World px per second of the common current. Slower than the slowest useful
 *  sailing speed by an order of magnitude, on purpose. */
const CURRENT_X = 6
const CURRENT_Y = 2.5

let flecc: Texture | null = null

function fleckTexture(PIXI: typeof import('pixi.js')): Texture {
  if (flecc) return flecc
  const S = 32
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // A short soft dash rather than a dot. Foam on open water is torn into
  // streaks by the surface it is sitting on, and a field of perfect circles
  // reads as bubbles in a fizzy drink.
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.save()
  g.translate(S / 2, S / 2)
  g.scale(1, 0.42)
  g.translate(-S / 2, -S / 2)
  g.fillRect(0, 0, S, S)
  g.restore()
  flecc = PIXI.Texture.from(c)
  return flecc
}

type Fleck = {
  p: Particle
  x: number
  y: number
  /** Per-fleck slice of the current, so they do not travel as a sheet. */
  vx: number
  vy: number
  size: number
  base: number
  /** Twinkle rate and offset. Water catches the light unevenly and the
   *  unevenness is most of what makes it look wet. */
  rate: number
  phase: number
}

export type Drift = {
  view: Container
  /**
   * `halfW`/`halfH` are the half-viewport in WORLD units — the same numbers the
   * landmark cull uses, which already account for the plane's squash.
   */
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number, dt: number): void
  /** The hour, as a tint: foam goes the colour of whatever light is left. */
  night(tint: number): void
  destroy(): void
}

export function makeDrift(PIXI: typeof import('pixi.js')): Drift {
  const view: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  // Foam is brighter than the water under it and never darker, so it adds.
  view.blendMode = 'add'

  const tex = fleckTexture(PIXI)
  const flecks: Fleck[] = []
  for (let i = 0; i < COUNT; i++) {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    // Seeded across a unit square and spread over the viewport on the first
    // advance, so there is never a frame where they are all at the origin.
    const f: Fleck = {
      p,
      x: Math.random(), y: Math.random(),
      vx: CURRENT_X * (0.6 + Math.random() * 0.8),
      vy: CURRENT_Y * (0.6 + Math.random() * 0.8),
      size: 3 + Math.random() * 7,
      base: 0.10 + Math.random() * 0.30,
      rate: 0.25 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }
    view.addParticle(p)
    flecks.push(f)
  }

  let seeded = false
  let tint = 0xffffff

  return {
    view,

    advance(camX, camY, halfW, halfH, t, dt) {
      const w = halfW * 2, h = halfH * 2
      if (!seeded) {
        seeded = true
        for (const f of flecks) {
          f.x = camX - halfW + f.x * w
          f.y = camY - halfH + f.y * h
        }
      }
      const d = Math.min(dt, 0.05)
      for (const f of flecks) {
        f.x += f.vx * d
        f.y += f.vy * d
        // WRAPPED, NOT RESPAWNED. A modulo keeps the field evenly spread; a
        // respawn at the trailing edge piles them into a line there.
        let dx = f.x - camX
        let dy = f.y - camY
        dx = ((dx + halfW) % w + w) % w - halfW
        dy = ((dy + halfH) % h + h) % h - halfH
        f.x = camX + dx
        f.y = camY + dy

        f.p.x = f.x
        f.p.y = f.y
        const k = f.size / 32
        f.p.scaleX = k
        // Squashed against the plane's own squash, so a fleck lying on the
        // water is as foreshortened as the water is.
        f.p.scaleY = k
        f.p.alpha = f.base * (0.45 + 0.55 * Math.sin(t * f.rate + f.phase))
        f.p.tint = tint
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
