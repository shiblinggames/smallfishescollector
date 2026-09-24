// ── NIGHT WITH SOMETHING IN IT ──────────────────────────────────────────────
//
// The day/night cycle is a TINT. Every sprite on the chart is multiplied toward
// a cold blue as the hour turns, which is a perfectly good way to say the sun
// has gone and a completely useless way to say it is night. A tint darkens; it
// does not light anything, so the sea after dark reads as the same sea with the
// brightness down.
//
// What makes night night is that a few things start EMITTING while everything
// else stops. Three of them here, and each answers a different question.
//
//   THE LANTERN — yours, hung at the bow. Answers "can I see", and it is the
//   one that makes the dark feel like somewhere you are rather than a filter
//   over the screen. It was a flat disc with a rim centred on the hull, and
//   Kong called it what it was: an oval round the whole boat image, not a
//   light on a boat. So it has a SOURCE now: an edgeless spill of warmth on
//   the water off her bow, brightest at the lamp and falling away, which
//   swaps ends when she comes about. (Dancing glints on top were tried and
//   cut the same day: far too distracting.)
//
//   THE OTHER BOATS — a lamp on every trader, regular and friend out there.
//   Answers "is anyone about", and it is the reason to look at the sea at night:
//   a light on the water is visible a great deal further than a hull.
//
//   THE DEEP LIGHTS UP — cold specks in the Abyss and the Ancient Deep, and
//   only after dark. Answers "where am I", and it does the thing the band
//   colours can only hint at in daylight: the far water is not just darker, it
//   is wrong.
//
// ── ADDITIVE, AND ON THE WATER ──────────────────────────────────────────────
//
// Light ADDS; it does not cover. A pool painted over the sea would hide the
// swell inside it, which is the opposite of what a lamp does to water, and it
// is the same reasoning the berths' harbour lights already carry.
//
// And every pool lies FLAT: squashed by GROUND like the berth rings, the wake
// rings and the island shadows, because it is a shape the water makes.
//
// ── IT COSTS NOTHING BY DAY ─────────────────────────────────────────────────
//
// Everything here multiplies by darkness, and at zero every sprite is alpha 0
// and the whole layer is skipped. Noon pays for one visibility test.

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { PLACES } from './chart'

/** Warm, and deliberately not the gold the UI spends: this is a flame in a
 *  glass box, not a currency. Same family as the berths' harbour amber. */
const LAMP = 0xffc07a
/** What the deep glows. Cold, green-cyan, and nothing else on this chart is
 *  this colour — which is the point of using it for the water that is wrong. */
const BIOLUM = 0x5ff0d0

/** Specks alive in the deep. Recycled around the camera like the drift and the
 *  shoals, so this is a per-viewport budget rather than a world population. */
const MOTES = 190

/** Which bands glow after dark, and how hard. Keyed on the same PLACES ids the
 *  zones use, so it cannot drift from where the water actually gets deep. */
const GLOW_BAND: Record<string, number> = {
  abyss: 0.6,
  ancient_deep: 1,
}

let hazeTex: Texture | null = null
let moteTex: Texture | null = null

/** Light with NO edge: a gaussian all the way out, so there is no rim for the
 *  eye to find and call an oval. */
function hazeTexture(PIXI: typeof import('pixi.js')): Texture {
  if (hazeTex) return hazeTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2)
    const r2 = dx * dx + dy * dy
    // exp(-r2 * 4.5) is ~1% at the edge; the last ramp takes it to exactly 0.
    const a = r2 >= 1 ? 0 : Math.exp(-r2 * 4.5) * (1 - r2)
    const o = (y * S + x) * 4
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
    img.data[o + 3] = Math.round(a * 255)
  }
  g.putImageData(img, 0, 0)
  hazeTex = PIXI.Texture.from(c)
  return hazeTex
}

function moteTexture(PIXI: typeof import('pixi.js')): Texture {
  if (moteTex) return moteTex
  const S = 32
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  moteTex = PIXI.Texture.from(c)
  return moteTex
}

type Mote = {
  p: Particle
  x: number; y: number
  ph: number
  rate: number
  size: number
  /** Eased brightness, so a speck crossing out of a glowing band fades rather
   *  than switching off on a ring. */
  lit: number
}

export type Lights = {
  /** Lamps and the deep, in the WORLD: they have world positions and the
   *  camera does not follow them. */
  world: Container
  /** Your own lantern, on the STAGE: the camera follows the hull, so relative
   *  to the screen she never moves and only the sea does. */
  screen: Container
  /**
   * Where every other boat on the water is, in world coordinates. Handed in
   * whole from the same poll the hulls are drawn from, so a lamp can never be
   * lit where there is no boat.
   */
  lamps(at: { x: number; y: number }[]): void
  /** `facing` is the hull's on-screen mirror, 1 when her bow is to the left. */
  advance(camX: number, camY: number, halfW: number, halfH: number, cx: number, cy: number, t: number, dt: number, facing?: number): void
  /** How far into the night, 0 to 1. Everything here reads it and at zero the
   *  whole layer is invisible and skipped. */
  night(dark: number): void
  /** How much lantern the captain has bought, 0.34 to 1. See lanternGlow. */
  lantern(glow: number): void
  destroy(): void
}

export function makeLights(PIXI: typeof import('pixi.js')): Lights {
  const world: Container = new PIXI.Container()
  const screen: Container = new PIXI.Container()
  // LIGHT ADDS. A pool painted over the sea would hide the swell inside it,
  // which is the opposite of what a lamp does to water.
  world.blendMode = 'add'
  screen.blendMode = 'add'


  const ht = hazeTexture(PIXI)

  // ── YOURS ──
  const lantern: Sprite = new PIXI.Sprite(ht)
  lantern.anchor.set(0.5)
  lantern.tint = LAMP
  lantern.alpha = 0
  screen.addChild(lantern)

  // ── THEIRS ── a fixed pool of pools, hidden when unused.
  const CREW_LAMPS = 24
  const crewLamps: Sprite[] = []
  for (let i = 0; i < CREW_LAMPS; i++) {
    const s: Sprite = new PIXI.Sprite(ht)
    s.anchor.set(0.5)
    s.tint = LAMP
    s.alpha = 0
    world.addChild(s)
    crewLamps.push(s)
  }

  // ── AND THE DEEP ──
  const moteLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  world.addChild(moteLayer)
  const mt = moteTexture(PIXI)
  const motes: Mote[] = []
  for (let i = 0; i < MOTES; i++) {
    const p: Particle = new PIXI.Particle({ texture: mt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    p.tint = BIOLUM
    moteLayer.addParticle(p)
    motes.push({
      p, x: 0, y: 0,
      ph: Math.random() * Math.PI * 2,
      // Each blinks on its own slow period. A field pulsing together is a
      // string of fairy lights; out of phase it is something alive.
      rate: 0.35 + Math.random() * 0.9,
      size: 2 + Math.random() * 5,
      lit: 0,
    })
  }

  const bands = PLACES.filter(p => p.inner !== undefined)
  const glowAt = (x: number, y: number): number => {
    if (y < 300) return 0
    const r = Math.hypot(x, y)
    for (const b of bands) {
      if (r >= (b.inner ?? 0) && r <= (b.outer ?? 0)) return GLOW_BAND[b.id] ?? 0
    }
    return 0
  }

  let dark = 0
  /** Full until told otherwise: a chart that has not yet heard the tier should
   *  draw the light everyone had before this was a ladder, not the dimmest. */
  let glow = 1
  let boats: { x: number; y: number }[] = []
  let seeded = false
  /** The bow's side, eased, so coming about slides the light along her
   *  rather than jumping it from one end to the other. */
  let bowSide = 1

  return {
    world, screen,

    lamps(at) { boats = at },

    advance(camX, camY, halfW, halfH, cx, cy, t, dt, facing = 1) {
      const d = Math.min(dt, 0.05)
      // NOON PAYS FOR ONE TEST. Nothing below runs while the sun is up.
      const on = dark > 0.02
      world.visible = on
      screen.visible = on
      if (!on) return

      // ── YOUR LANTERN ── at the bow, breathing very slightly, because a
      // flame in a glass box on a moving boat is never quite steady.
      const flick = 0.94 + Math.sin(t * 3.1) * 0.03 + Math.sin(t * 5.7) * 0.03
      bowSide += (facing - bowSide) * Math.min(1, d * 7)
      // ── AND IT IS A LADDER ────────────────────────────────────────
      //
      // `glow` is 0.34 at the first rung and 1 at the last (lib/shipyard).
      // BOTH THE REACH AND THE BRIGHTNESS: light falls off with distance, so
      // a weaker lamp is smaller AND fainter, which is what reads as a lamp.
      const lr = (132 + dark * 46) * glow
      // The spill sits forward of the bow, not round the hull: its middle is
      // off her nose and the stern end of her is mostly outside it, so the
      // eye reads a lamp throwing light onto the water ahead. Bow is to the
      // LEFT when facing is 1 (the art's own pose).
      lantern.position.set(cx - bowSide * lr * 0.52, cy + 10)
      lantern.width = lr * 1.9
      lantern.height = lr * 1.9 * GROUND
      lantern.alpha = dark * 0.42 * glow * flick

      // ── EVERY OTHER BOAT ── smaller, and it is the one thing out here that
      // is worth steering toward on sight.
      for (let i = 0; i < crewLamps.length; i++) {
        const b = boats[i]
        const s = crewLamps[i]
        if (!b) { s.alpha = 0; continue }
        // Off screen is off: a lamp on the far side of the chart is two writes
        // and a draw for nothing.
        if (Math.abs(b.x - camX) > halfW + 300 || Math.abs(b.y - camY) > halfH + 300) {
          s.alpha = 0
          continue
        }
        s.position.set(b.x, b.y + 4)
        // Edgeless too, for the same reason yours is.
        const rr = 96 + Math.sin(t * 2.3 + i) * 3
        s.width = rr * 2
        s.height = rr * 2 * GROUND
        s.alpha = dark * 0.36
      }

      // ── AND THE DEEP ──
      if (!seeded) {
        seeded = true
        for (const m of motes) {
          m.x = camX + (Math.random() * 2 - 1) * halfW * 1.3
          m.y = camY + (Math.random() * 2 - 1) * halfH * 1.3
        }
      }
      const ex = halfW * 1.3, ey = halfH * 1.3
      for (const m of motes) {
        // A slow rise, the way anything neutrally buoyant behaves in water that
        // is barely moving. Wrapped around the camera, and only ever moved
        // while it is off screen.
        m.y -= 5 * d
        m.x += Math.sin(t * 0.3 + m.ph) * 3 * d
        if (m.x < camX - ex) m.x = camX + ex
        else if (m.x > camX + ex) m.x = camX - ex
        if (m.y < camY - ey) m.y = camY + ey
        else if (m.y > camY + ey) m.y = camY - ey

        const want = glowAt(m.x, m.y)
        m.lit += (want - m.lit) * Math.min(1, d * 1.4)
        if (m.lit < 0.01) { m.p.alpha = 0; continue }
        m.p.x = m.x
        m.p.y = m.y
        const k = m.size / 32
        m.p.scaleX = k
        m.p.scaleY = k
        // Each on its own period. Never all the way out, so the field reads as
        // breathing rather than as blinking.
        m.p.alpha = dark * m.lit * (0.22 + 0.5 * (0.5 + 0.5 * Math.sin(t * m.rate + m.ph)))
      }
    },

    night(next) { dark = next },

    lantern(next) { glow = next },

    destroy() {
      world.destroy({ children: true })
      screen.destroy({ children: true })
    },
  }
}
