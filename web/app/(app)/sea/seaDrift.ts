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

/** How many flecks are alive at once. Sized so a viewport holds a SCATTERING
 *  rather than a crowd: the eye wants a few things to track, not confetti, and
 *  a dense field of small bright things crossing the whole screen at speed is
 *  the thing that makes people feel sick. Fewer, bigger and dimmer reads as
 *  more water rather than less. */
const COUNT = 140

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
  /**
   * HAS THE PLAYER ASKED THE SYSTEM FOR LESS MOVEMENT.
   *
   * Read once at build rather than per frame — it is a display preference, and
   * somebody who changes it mid-session gets it on the next chart load, which
   * is the same deal every other setting here offers.
   *
   * This is the honest place to answer it. A full-screen field of bright specks
   * travelling at five hundred pixels a second is the single most motion-sick
   * thing the chart does, and the OS switch for exactly that complaint already
   * exists on every platform this runs on.
   */
  const osReduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  // THE OS SWITCH ONLY. There was an in-game "Sea motion" toggle beside it and
  // it is gone: the speed curve and the shader's own damping do the work now,
  // and a settings row that duplicates what the defaults already do is a choice
  // nobody needs to make.
  const reduced = osReduced

  const view: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
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
      // Bigger and dimmer than they were. What causes the treadmill feeling is
      // high-frequency detail travelling fast across the whole field of view;
      // the cure is lower frequency and lower contrast, not a slower speed —
      // the speed IS the information.
      size: 6 + Math.random() * 12,
      base: 0.07 + Math.random() * 0.16,
      rate: 0.25 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    }
    view.addParticle(p)
    flecks.push(f)
  }

  let seeded = false
  let tint = 0xffffff
  // The camera's own speed, smoothed. Derived here rather than passed in
  // because it is only ever used for this and the chart already has enough to
  // hand over every frame.
  let lastCamX = 0, lastCamY = 0, camSpeed = 0, primed = false

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

      // ── HOW FAST THE WATER IS GOING PAST ──────────────────────────
      const vx = primed ? (camX - lastCamX) / Math.max(d, 1e-4) : 0
      const vy = primed ? (camY - lastCamY) / Math.max(d, 1e-4) : 0
      lastCamX = camX; lastCamY = camY; primed = true
      // Smoothed hard: the raw frame-to-frame delta is noisy enough that
      // streaks would flicker in and out at a steady cruise.
      camSpeed += (Math.hypot(vx, vy) - camSpeed) * Math.min(1, d * 6)

      // ── AND WHAT THAT DOES TO THEM ────────────────────────────────
      //
      // Anything you pass at speed SMEARS. That is not a stylistic choice, it
      // is what a short exposure of a moving thing looks like, and it is the
      // difference between water going by and a wall of dots strobing across
      // the screen. Streaking them along the direction of travel and taking
      // some of their brightness away as they stretch turns the treadmill back
      // into motion — a still frame at speed looks blurred, which is right,
      // and the eye stops trying to track individual specks.
      const smear = 1 + Math.min(3.4, camSpeed / 210)
      const streakAng = camSpeed > 12 ? Math.atan2(vy, vx) : 0
      // ── AND MOSTLY THEY GET OUT OF THE WAY ────────────────────────
      //
      // This was `1 / (1 + camSpeed / 620)`, which at a base 300px/s cruise
      // still left them at 67% and at full sail 54% — two thirds of the field,
      // smeared three times its own length, crossing the whole screen. Reported
      // as nauseating over time, which is exactly the failure the note at the
      // top of this file warns about and then did not price steeply enough.
      //
      // The curve is the argument. Flecks exist so there is something to TRACK
      // when you are slow enough to track it; at speed nothing is trackable and
      // the wake, the swell and the islands are already carrying the motion, so
      // the flecks are contributing nothing but strobe. Falling off as a power
      // rather than a ratio keeps them whole while manoeuvring and takes them
      // to a fifth at full sail.
      //
      //   0   60  120  200  300  420  525 px/s
      //   1.0 .91 .76  .58  .41  .28  .21
      const busy = reduced
        // REDUCED MOTION IS NOT A DIMMER. Somebody who has asked the OS for
        // less movement is not asking for the same field slightly fainter; the
        // whole point of these is that they stream past. Gone the moment the
        // boat is properly under way.
        ? 1 / (1 + Math.pow(camSpeed / 90, 2))
        : 1 / (1 + Math.pow(camSpeed / 240, 1.7))

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
        f.p.rotation = streakAng
        f.p.scaleX = k * smear
        f.p.scaleY = k
        // Dimmer as it stretches: the same light spread over more of the
        // screen. Without this the smear reads as MORE foam at speed, which is
        // the opposite of what a blur does.
        f.p.alpha = f.base * busy * (0.45 + 0.55 * Math.sin(t * f.rate + f.phase))
        f.p.tint = tint
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
