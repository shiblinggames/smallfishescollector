// ── THE PORTAL, AS A PLACE ON THE WATER ─────────────────────────────────────
//
// It was a painted neon sigil: a glowing runic circle, cyan through purple, one
// plate per tier, escalating to a glyph-dense magenta masterwork. Against a
// chart drawn in soft gouache with warm brown ink, on a sea whose whole palette
// is muted blue-green, it read as something from a different game entirely — an
// arcane monument dropped onto a pirate map.
//
// The chart already has a vocabulary for "this water is special", and it is the
// BERTH: a pool, a soft rim, and lights running the ring. No hard edges, no
// paint, nothing vertical, all procedural, all lying flat on the plane. That is
// what a place on this water looks like, so that is what the portal is built
// from now. See seaBerth for the original of every part below.
//
// ── SAME GRAMMAR, OPPOSITE MEANING ──────────────────────────────────────────
//
// If it borrowed the berth's language unchanged it would read as a mooring, and
// captains would try to dock in it. So every part is INVERTED:
//
//   THE WELL — a berth LIGHTS the water because a harbour is lit. This DARKENS
//   it. The pool inside is deeper than the sea around it and tinted toward the
//   band it can reach, so what you see is water that goes further down than the
//   water beside it. That is the whole idea and it is the part doing the work.
//
//   THE RIM — the same soft boundary, in the destination band's colour rather
//   than harbour amber. Cool where a berth is warm.
//
//   THE DRAW — a berth's lights run AROUND the ring toward the dock mouth,
//   answering "which way in". A portal has no mouth; you cross it from any
//   side. So its lights fall INWARD, from the rim toward the centre, and what
//   you read is not a direction of approach but water being pulled down.
//
// ── AND THE TIER IS THE DEPTH ───────────────────────────────────────────────
//
// The upgrade used to be a different painting. It is the same well getting
// deeper and colder: the band's own accent, darker and more saturated as the
// reach extends, with more of the inward fall. Nothing new to draw, ever, and a
// tier 5 portal is legible as tier 5 from across the chart without a label.

import type { Container, Sprite, Texture } from 'pixi.js'

/** The plane's squash. Flat on the water, like everything else that lies on it. */
const GROUND = 0.58

/**
 * ── WHAT EACH TIER ADDS ─────────────────────────────────────────────────────
 *
 * The reach is bought in five steps and the water has to look like it. Every
 * addition below is something WATER does, because the moment one of them is
 * something magic does, the neon sigil is back in a different costume.
 *
 *   1  the well, the rim, a slow inward drift
 *   2  more of it, falling faster
 *   3  RIPPLES — rings drawn inward across the surface, so the sea itself is
 *      visibly being pulled rather than just being dark
 *   4  the LIP breaks into foam, and SPRAY starts coming off it. First tier
 *      with anything above the plane, which is what makes it feel violent
 *   5  a LIGHT far down in it, seen up through the dark, and the whole thing
 *      turning. The payoff rung, and it should look like one
 */
const FALLS = 18
const RIPPLES = 3
const SPRAY = 16

let wellTex: Texture | null = null
let ringTex: Texture | null = null
let moteTex: Texture | null = null
let lipTex: Texture | null = null

/**
 * THE WELL ITSELF. Dark in the middle, clear at the edge — the exact opposite
 * of the berth's pool, which is bright in the middle and soft at the edge.
 *
 * Weighted toward the centre rather than flat across it: a harbour's light is
 * scattered evenly by the whole surface, but a hole has a BOTTOM, and the thing
 * that says so is that it gets darker the further in you look.
 */
function well(PIXI: typeof import('pixi.js')): Texture {
  if (wellTex) return wellTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,1)')
  grad.addColorStop(0.42, 'rgba(255,255,255,0.74)')
  grad.addColorStop(0.74, 'rgba(255,255,255,0.34)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  wellTex = PIXI.Texture.from(c)
  return wellTex
}

/** The boundary. Soft on both sides, because it is scaled up to island size and
 *  a hard stroke becomes a dotted line the moment it is. */
function ring(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
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

/** One speck of water on its way down. */
function mote(PIXI: typeof import('pixi.js')): Texture {
  if (moteTex) return moteTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.34, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  moteTex = PIXI.Texture.from(c)
  return moteTex
}

/** A hard, thin band. The soft rim reads as a boundary; this reads as the LIP,
 *  where the water actually tips over and breaks. Two different jobs, so two
 *  different textures rather than one alpha turned up. */
function lip(PIXI: typeof import('pixi.js')): Texture {
  if (lipTex) return lipTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.000, 'rgba(255,255,255,0)')
  grad.addColorStop(0.935, 'rgba(255,255,255,0)')
  grad.addColorStop(0.962, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.978, 'rgba(255,255,255,1)')
  grad.addColorStop(0.992, 'rgba(255,255,255,0.4)')
  grad.addColorStop(1.000, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  lipTex = PIXI.Texture.from(c)
  return lipTex
}

export type PortalWellSpec = {
  x: number
  y: number
  r: number
  /** The destination band's colour, from PORTAL_TIERS. */
  accent: number
  /** 1..5. Deepens the well and quickens the fall. */
  tier: number
}

export type PortalWell = {
  view: Container
  /** True while the captain is inside the ring. The well answers by opening. */
  setActive(on: boolean): void
  /** Swap tier without rebuilding: buying one should deepen the water you are
   *  floating in, not pop a new object into it. */
  setSpec(spec: PortalWellSpec): void
  advance(t: number, dt: number, camX: number, camY: number, halfW: number, halfH: number): void
  night(tint: number): void
  destroy(): void
}

export function makePortalWell(
  PIXI: typeof import('pixi.js'),
  initial: PortalWellSpec,
): PortalWell {
  let spec = initial

  const view: Container = new PIXI.Container()
  view.position.set(spec.x, spec.y)
  view.scale.set(1, GROUND)

  /**
   * THE ONE PLACE THIS DIVERGES FROM THE BERTH'S TECHNIQUE.
   *
   * A berth is `blendMode: 'add'` — light on water adds, it does not cover, so
   * the swell still moves inside it. Adding cannot DARKEN anything, and the
   * whole point here is a hole. So the well is drawn `multiply`, which darkens
   * the sea beneath it while still letting every wave, glint and caustic show
   * through. Painting flat colour over the water would kill the surface and
   * leave a disc sitting on top of it, which is exactly the decal problem the
   * berth's note warns about.
   *
   * The rim and the motes still ADD, because those are light. Two blend modes
   * means two containers; there is no way to have one child of an added layer
   * multiply.
   */
  const dark: Container = new PIXI.Container()
  dark.blendMode = 'multiply'
  view.addChild(dark)

  const light: Container = new PIXI.Container()
  light.blendMode = 'add'
  view.addChild(light)

  const wellS: Sprite = new PIXI.Sprite(well(PIXI))
  wellS.anchor.set(0.5)
  dark.addChild(wellS)

  const rimS: Sprite = new PIXI.Sprite(ring(PIXI))
  rimS.anchor.set(0.5)
  light.addChild(rimS)

  /** Each mote falls from the rim to the centre on its own phase, so the
   *  current is continuous rather than a pulse everything joins. */
  const motes: Sprite[] = []
  const phase: number[] = []
  const lane: number[] = []
  for (let i = 0; i < FALLS; i++) {
    const s: Sprite = new PIXI.Sprite(mote(PIXI))
    s.anchor.set(0.5)
    light.addChild(s)
    motes.push(s)
    // An irrational stride, so no two motes ever fall together and the ring
    // never resolves into spokes.
    phase.push((i * 0.6180339887) % 1)
    lane.push((i / FALLS) * Math.PI * 2)
  }

  /** ── TIER 3: THE SURFACE BEING PULLED ──────────────────────────────
   *  Rings drawn INWARD and shrinking. Water falling into a hole makes rings
   *  that travel toward it, not away, and getting that backwards is the
   *  difference between a drain and a splash. */
  const ripples: Sprite[] = []
  const ripPhase: number[] = []
  for (let i = 0; i < RIPPLES; i++) {
    const s: Sprite = new PIXI.Sprite(ring(PIXI))
    s.anchor.set(0.5)
    light.addChild(s)
    ripples.push(s)
    ripPhase.push(i / RIPPLES)
  }

  /** ── TIER 4: THE LIP BREAKS ────────────────────────────────────────
   *  Where the water tips over the edge it stops being a surface and starts
   *  being foam. A hard thin band, shimmering on two out-of-step sines so it
   *  never reads as a drawn circle. */
  const lipS: Sprite = new PIXI.Sprite(lip(PIXI))
  lipS.anchor.set(0.5)
  light.addChild(lipS)

  /** ── TIER 5: SOMETHING DOWN THERE ──────────────────────────────────
   *  Light coming UP through the dark water, which is the one thing that can
   *  make a hole feel like it has a far end. Added over the multiply on
   *  purpose: light scattering up out of deep water is exactly what you see
   *  from above, and it is why this reads as depth rather than as a lamp
   *  sitting on the surface. */
  const coreS: Sprite = new PIXI.Sprite(well(PIXI))
  coreS.anchor.set(0.5)
  light.addChild(coreS)

  /**
   * ── TIER 4+: SPRAY, AND THE ONLY THING HERE THAT LEAVES THE WATER ──
   *
   * In its own container carrying the INVERSE of the plane's squash, so the
   * composite is 1:1 and a speck thrown 40px up goes 40 pixels up the screen
   * rather than 23. Everything else in this file lies flat and must not do
   * this; the spray is airborne and must.
   */
  const air: Container = new PIXI.Container()
  air.blendMode = 'add'
  air.scale.set(1, 1 / GROUND)
  view.addChild(air)

  const spray: Sprite[] = []
  const sprayPhase: number[] = []
  const sprayLane: number[] = []
  const sprayLift: number[] = []
  for (let i = 0; i < SPRAY; i++) {
    const s: Sprite = new PIXI.Sprite(mote(PIXI))
    s.anchor.set(0.5)
    air.addChild(s)
    spray.push(s)
    sprayPhase.push((i * 0.6180339887) % 1)
    sprayLane.push((i / SPRAY) * Math.PI * 2 + (i % 3) * 0.4)
    // Each speck gets its own throw, so the fringe is ragged rather than a
    // fountain of identical arcs.
    sprayLift.push(0.55 + ((i * 0.381966) % 1) * 0.9)
  }

  let on = 0
  let want = 0
  let tint = 0xffffff

  const shade = (c: number) => {
    if (tint === 0xffffff) return c
    const r = ((((c >> 16) & 0xff) * ((tint >> 16) & 0xff)) / 255) | 0
    const g = ((((c >> 8) & 0xff) * ((tint >> 8) & 0xff)) / 255) | 0
    const b = (((c & 0xff) * (tint & 0xff)) / 255) | 0
    return (r << 16) | (g << 8) | b
  }

  /** Toward white by `k`. Foam and spray are water in air, which is nearly
   *  white whatever sea it came off; the band's colour only leans into them. */
  const mixToWhite = (c: number, k: number) => {
    const m = (ch: number) => Math.round(ch + (255 - ch) * k)
    return (m((c >> 16) & 0xff) << 16) | (m((c >> 8) & 0xff) << 8) | m(c & 0xff)
  }

  /** The multiply tint, which is what a hole in the water is made of.
   *
   *  A multiply of pure accent would stain the sea that colour; what is wanted
   *  is the sea's own colour taken DOWN, with a lean toward the band. So the
   *  accent is mixed most of the way to white and the depth does the darkening:
   *  at tier 1 the well is barely there, at tier 5 it is a hole with a colour. */
  const wellTint = () => {
    const depth = 0.16 + (spec.tier - 1) * 0.085 + on * 0.1
    const mix = (ch: number) => Math.round(255 - (255 - ch) * depth)
    return shade(
      (mix((spec.accent >> 16) & 0xff) << 16)
      | (mix((spec.accent >> 8) & 0xff) << 8)
      | mix(spec.accent & 0xff),
    )
  }

  return {
    view,

    setActive(next) { want = next ? 1 : 0 },

    setSpec(next) {
      spec = next
      view.position.set(spec.x, spec.y)
    },

    advance(t, dt, camX, camY, halfW, halfH) {
      const d = Math.min(dt, 0.05)
      const seen = Math.abs(spec.x - camX) < halfW + spec.r * 1.6
        && Math.abs(spec.y - camY) < halfH + spec.r * 1.6
      view.visible = seen
      if (!seen) return

      on += (want - on) * Math.min(1, d * 3.4)

      // ── THE WELL ──
      // Breathing slowly, for the reason the berth's pool breathes: a constant
      // one reads as a decal. Slower than a harbour's, because this is not
      // lamplight on chop, it is something the sea is doing.
      const breath = 0.5 + 0.5 * Math.sin(t * 0.38)
      const size = spec.r * (1.86 + on * 0.1) * (0.985 + breath * 0.015)
      wellS.width = size
      wellS.height = size
      wellS.tint = wellTint()

      // ── THE RIM ──
      // The band's own colour, and it TIGHTENS as you enter, exactly as a berth
      // does. That gesture is worth keeping unchanged: it is the chart saying
      // "I have you", and it should mean the same thing wherever it happens.
      rimS.alpha = 0.16 + on * 0.30
      rimS.tint = shade(spec.accent)
      const tighten = 2.1 - on * 0.06
      rimS.width = spec.r * tighten
      rimS.height = spec.r * tighten

      // ── THE DRAW ──
      // Inward, not around. Each mote runs the rim to the centre and restarts,
      // fading as it goes so it is water thinning into the dark rather than a
      // dot arriving somewhere. Deeper tiers fall faster.
      const speed = 0.13 + spec.tier * 0.021 + on * 0.06
      for (let i = 0; i < motes.length; i++) {
        phase[i] = (phase[i] + d * speed) % 1
        const p = phase[i]
        // Eased, so it accelerates into the middle the way falling water does.
        const rr = spec.r * (1 - p * p)
        // A slight curl, so the fall spirals rather than spoking straight in.
        const a = lane[i] + p * 0.9
        const s = motes[i]
        s.position.set(Math.cos(a) * rr, Math.sin(a) * rr)
        // Small and getting smaller. Nothing arrives.
        const k = Math.max(6, spec.r * 0.055) * (1 - p * 0.75)
        s.width = s.height = k
        // Fades at BOTH ends: it appears out of the rim rather than switching on
        // there, and thins to nothing before the centre rather than piling up.
        s.alpha = (0.18 + on * 0.24) * Math.min(1, p * 6) * (1 - p) * (0.6 + spec.tier * 0.09)
        s.tint = shade(spec.accent)
      }

      // ── TIER 3: THE RIPPLES ──
      // Inward and shrinking. Fade in off the rim and out before the middle,
      // so they are the surface being drawn down rather than rings arriving
      // somewhere.
      const rippling = spec.tier >= 3
      for (let i = 0; i < ripples.length; i++) {
        const s = ripples[i]
        s.visible = rippling
        if (!rippling) continue
        ripPhase[i] = (ripPhase[i] + d * (0.16 + spec.tier * 0.014)) % 1
        const q = ripPhase[i]
        const rr = spec.r * (1.9 - q * 1.55)
        s.width = rr
        s.height = rr
        s.alpha = (0.07 + on * 0.07) * Math.sin(q * Math.PI)
        s.tint = shade(spec.accent)
      }

      // ── TIER 4: THE LIP ──
      // Two out-of-step sines on the shimmer, because a band pulsing on one is
      // a band pulsing, and foam does not do that.
      const breaking = spec.tier >= 4
      lipS.visible = breaking
      if (breaking) {
        const shimmer = 0.62 + 0.22 * Math.sin(t * 2.3) + 0.16 * Math.sin(t * 3.7 + 1.1)
        lipS.alpha = (0.2 + on * 0.2) * shimmer * (spec.tier >= 5 ? 1.25 : 1)
        // Nearly white with the band's colour only leaning into it. Foam is
        // foam whatever water it comes off.
        lipS.tint = shade(mixToWhite(spec.accent, 0.62))
        const lw = spec.r * (2.0 + Math.sin(t * 0.9) * 0.012)
        lipS.width = lw
        lipS.height = lw
      }

      // ── TIER 5: THE LIGHT DOWN THERE ──
      // Slow, and never steady: two periods again, and a long one so it swells
      // over several seconds rather than blinking.
      const deep = spec.tier >= 5
      coreS.visible = deep
      if (deep) {
        const pulse = 0.55 + 0.3 * Math.sin(t * 0.72) + 0.15 * Math.sin(t * 1.31)
        const cw = spec.r * (0.5 + pulse * 0.16)
        coreS.width = cw
        coreS.height = cw
        coreS.alpha = (0.16 + on * 0.2) * pulse
        coreS.tint = shade(mixToWhite(spec.accent, 0.3))
      }

      // ── TIER 4+: THE SPRAY ──
      // Thrown off the lip and falling back. The only thing here that leaves
      // the water, and the only reason the well reads as violent rather than
      // merely deep.
      const count = breaking ? (spec.tier >= 5 ? SPRAY : Math.round(SPRAY * 0.5)) : 0
      for (let i = 0; i < spray.length; i++) {
        const s = spray[i]
        s.visible = i < count
        if (i >= count) continue
        sprayPhase[i] = (sprayPhase[i] + d * (0.42 + spec.tier * 0.03)) % 1
        const q = sprayPhase[i]
        // A throw: up fast, over, and down. Parabolic in q, so it hangs at the
        // top the way thrown water does.
        const lift = Math.max(0, 4 * q * (1 - q)) * sprayLift[i] * spec.r * 0.42
        // Drifting inward as it falls, because it came off a lip that is
        // pouring inward.
        const rr = spec.r * (1.0 - q * 0.22)
        const a = sprayLane[i] + q * 0.35
        s.position.set(Math.cos(a) * rr, Math.sin(a) * rr * GROUND - lift)
        const k = Math.max(4, spec.r * 0.032) * (1 - q * 0.4)
        s.width = s.height = k
        // Out at both ends, so nothing pops into being at the lip or lands hard.
        s.alpha = (0.4 + on * 0.3) * Math.sin(q * Math.PI)
        s.tint = shade(mixToWhite(spec.accent, 0.5))
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
