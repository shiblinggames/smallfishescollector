// ── THE CHART TELLING YOU SOMETHING, ON THE WATER ───────────────────────────
//
// Two transient effects that both exist to say "here" rather than to be part of
// the sea:
//
//   THE HEADING is a run of gold chevrons laid from the boat toward the stop
//   the campaign wants next, after a clear. It runs for a few seconds and goes.
//
//   THE PORTAL BEAM is the column of light standing on the way-home ring while
//   it charges. It is up for as long as the charge is.
//
// ── WHY THEY SHARE A FILE ───────────────────────────────────────────────────
//
// Because they share the one thing that is hard about both: they STAND UP off
// the plane. Everything else on this water is flat and multiplies by GROUND; a
// chevron pointing along a bearing and a column of light rising off a ring are
// the two things out here that have to be counter-squashed and then turned by
// the angle you actually SEE rather than the one the world holds.
//
// Getting that wrong is not subtle. A chevron drawn at the world bearing points
// somewhere the stop is not, and on a north-south run it is out by tens of
// degrees.
//
// ── AND THEY ARE ON THE CANVAS ──────────────────────────────────────────────
//
// Both were DOM: framer-motion for the beam, CSS keyframes for the chevrons.
// A visual on the water belongs on the water's own canvas — see the rule in
// docs/systems/ocean-hub. The beam in particular was four nested divs with a
// mask-image and a repeating-linear-gradient scrolling inside a clip, which is
// a lot of compositor for one column of light.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

/** How many chevrons a run can have, how far apart, and how long before it
 *  fades. Kept from the DOM version to the number: a captain who has watched
 *  these should not notice the day they moved. */
const MARKS = 7
const GAP = 320
/** The first one sits clear of the hull that is drawing it. */
const LEAD = 420
export const HEADING_MS = 7600

let chevTex: Texture | null = null
let beamTex: Texture | null = null
let poolTex: Texture | null = null
let streakTex: Texture | null = null
let moteTex: Texture | null = null
let ribbonTex: Texture | null = null

/** How many bands run up the column, and how many motes come off the ring. */
const STREAKS = 4
const MOTES = 14

/** A chevron, drawn once. Thick, round-capped, and with its own soft halo baked
 *  in — a gold arrow on open water needs to survive being small. */
function chevTexture(PIXI: typeof import('pixi.js')): Texture {
  if (chevTex) return chevTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  g.strokeStyle = '#f0c040'
  g.lineWidth = S * 0.14
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.shadowColor = 'rgba(240,192,64,0.75)'
  g.shadowBlur = S * 0.16
  g.beginPath()
  g.moveTo(S * 0.36, S * 0.22)
  g.lineTo(S * 0.68, S * 0.5)
  g.lineTo(S * 0.36, S * 0.78)
  g.stroke()
  chevTex = PIXI.Texture.from(c)
  return chevTex
}

/**
 * THE COLUMN. Bright at both edges and thin in the middle, which is what makes
 * a flat sprite read as a cylinder: you are seeing more of it where you look
 * through its wall edge-on. Faded to nothing at the top so it has no end.
 */
function beamTexture(PIXI: typeof import('pixi.js')): Texture {
  if (beamTex) return beamTex
  const W = 128, H = 256
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const across = g.createLinearGradient(0, 0, W, 0)
  across.addColorStop(0, 'rgba(255,255,255,0)')
  across.addColorStop(0.06, 'rgba(255,255,255,0.36)')
  across.addColorStop(0.26, 'rgba(255,255,255,0.10)')
  across.addColorStop(0.5, 'rgba(255,255,255,0.055)')
  across.addColorStop(0.74, 'rgba(255,255,255,0.10)')
  across.addColorStop(0.94, 'rgba(255,255,255,0.36)')
  across.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = across
  g.fillRect(0, 0, W, H)
  // And gone by the top. A column with a cut-off end is a rectangle.
  const up = g.createLinearGradient(0, H, 0, 0)
  up.addColorStop(0, 'rgba(0,0,0,1)')
  up.addColorStop(0.42, 'rgba(0,0,0,1)')
  up.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = up
  g.fillRect(0, 0, W, H)
  beamTex = PIXI.Texture.from(c)
  return beamTex
}

/**
 * ── ONE BAND OF LIGHT RUNNING UP THE COLUMN ─────────────────────────────────
 *
 * The DOM beam had these and the first Pixi pass dropped them, which took the
 * MOTION out of it: a column that only breathes is a lamp, and this is supposed
 * to be something being drawn up out of the sea.
 *
 * Four of these ride the beam, each rising on its own loop and fading out near
 * the top. Separate sprites rather than a scrolling tiled texture, because a
 * tile would repeat the column's vertical fade with it and the beam would grow
 * a hard seam every time the pattern wrapped.
 */
function streakTexture(PIXI: typeof import('pixi.js')): Texture {
  if (streakTex) return streakTex
  const W = 64, H = 64
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  // Soft at both ends and across, so a band has no edge anywhere. It is light
  // in a column of light, not a bar laid over one.
  const up = g.createLinearGradient(0, 0, 0, H)
  up.addColorStop(0, 'rgba(255,255,255,0)')
  up.addColorStop(0.5, 'rgba(255,255,255,1)')
  up.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = up
  g.fillRect(0, 0, W, H)
  const across = g.createLinearGradient(0, 0, W, 0)
  across.addColorStop(0, 'rgba(0,0,0,0)')
  across.addColorStop(0.25, 'rgba(0,0,0,1)')
  across.addColorStop(0.75, 'rgba(0,0,0,1)')
  across.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = across
  g.fillRect(0, 0, W, H)
  streakTex = PIXI.Texture.from(c)
  return streakTex
}

/**
 * ── THE ROAD UNDER THE ARROWS ───────────────────────────────────────────────
 *
 * A soft lozenge of light, stretched along the bearing and laid under each
 * chevron. Seven arrows on open water read as seven arrows; the same seven over
 * a run of light read as a ROUTE, which is the thing being described.
 *
 * It lies ON the plane while the chevrons stand up off it, so the road is
 * foreshortened and the signs on it are not — which is exactly right, and is
 * why it could not simply be part of the chevron's own texture.
 */
function ribbonTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ribbonTex) return ribbonTex
  const W = 128, H = 64
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2)
  grad.addColorStop(0, 'rgba(240,192,64,0.85)')
  grad.addColorStop(0.42, 'rgba(240,192,64,0.34)')
  grad.addColorStop(1, 'rgba(240,192,64,0)')
  g.fillStyle = grad
  // Squashed on the short axis on the way in, so the sprite can be scaled
  // evenly and still come out as a streak rather than a disc.
  g.save()
  g.translate(W / 2, H / 2)
  g.scale(1, 0.5)
  g.translate(-W / 2, -H / 2)
  g.fillRect(0, 0, W, H)
  g.restore()
  ribbonTex = PIXI.Texture.from(c)
  return ribbonTex
}

/** A mote: a soft point of light, for the ones that come off the ring. */
function moteTexture(PIXI: typeof import('pixi.js')): Texture {
  if (moteTex) return moteTex
  const S = 32
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  moteTex = PIXI.Texture.from(c)
  return moteTex
}

/** The pool it stands in: a flat ring of light on the ring itself. */
function poolTexture(PIXI: typeof import('pixi.js')): Texture {
  if (poolTex) return poolTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0)')
  grad.addColorStop(0.68, 'rgba(255,255,255,0.30)')
  grad.addColorStop(0.84, 'rgba(255,255,255,0.16)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  poolTex = PIXI.Texture.from(c)
  return poolTex
}

export type GuideFx = {
  view: Container
  /** Lay a run of chevrons from here to there. `null` clears it. The chart
   *  passes a KEY so a second heading to the same place still restarts. */
  heading(h: { key: number; from: { x: number; y: number }; to: { x: number; y: number } } | null): void
  /** The way-home column, or null while nothing is charging. */
  beam(b: { x: number; y: number; r: number; color: number } | null): void
  advance(t: number, dt: number): void
  destroy(): void
}

export function makeGuideFx(PIXI: typeof import('pixi.js')): GuideFx {
  const view: Container = new PIXI.Container()

  // ── THE HEADING ───────────────────────────────────────────────────────────
  // THE ROAD FIRST, so every arrow sits on it rather than beside it.
  const ribbons: Sprite[] = []
  for (let i = 0; i < MARKS; i++) {
    const s: Sprite = new PIXI.Sprite(ribbonTexture(PIXI))
    s.anchor.set(0.5)
    s.blendMode = 'add'
    s.visible = false
    view.addChild(s)
    ribbons.push(s)
  }
  const chevs: Sprite[] = []
  for (let i = 0; i < MARKS; i++) {
    const s: Sprite = new PIXI.Sprite(chevTexture(PIXI))
    s.anchor.set(0.5)
    s.visible = false
    view.addChild(s)
    chevs.push(s)
  }
  let run: { key: number; x: number; y: number; ux: number; uy: number; a: number; n: number } | null = null
  let runAge = 0

  // ── THE BEAM ──────────────────────────────────────────────────────────────
  const pool: Sprite = new PIXI.Sprite(poolTexture(PIXI))
  pool.anchor.set(0.5)
  pool.blendMode = 'add'
  pool.visible = false
  view.addChild(pool)
  const beam: Sprite = new PIXI.Sprite(beamTexture(PIXI))
  // Anchored at its FOOT, because it stands on the ring rather than hanging
  // over it.
  beam.anchor.set(0.5, 1)
  beam.blendMode = 'add'
  beam.visible = false
  view.addChild(beam)
  // A NARROW CORE inside the wide column. Two widths is what stops a beam
  // reading as a flat panel: the bright middle is the thing itself and the
  // wide one is the light it is throwing.
  const core: Sprite = new PIXI.Sprite(beamTexture(PIXI))
  core.anchor.set(0.5, 1)
  core.blendMode = 'add'
  core.visible = false
  view.addChild(core)
  const streaks: Sprite[] = []
  for (let i = 0; i < STREAKS; i++) {
    const s: Sprite = new PIXI.Sprite(streakTexture(PIXI))
    s.anchor.set(0.5, 0.5)
    s.blendMode = 'add'
    s.visible = false
    view.addChild(s)
    streaks.push(s)
  }
  const motes: Sprite[] = []
  for (let i = 0; i < MOTES; i++) {
    const s: Sprite = new PIXI.Sprite(moteTexture(PIXI))
    s.anchor.set(0.5)
    s.blendMode = 'add'
    s.visible = false
    view.addChild(s)
    motes.push(s)
  }
  let lit: { x: number; y: number; r: number; color: number } | null = null
  /** 0..1, so it rises when it lights and settles rather than snapping in. */
  let up = 0

  return {
    view,

    heading(h) {
      if (!h) { run = null; return }
      const dx = h.to.x - h.from.x
      const dy = h.to.y - h.from.y
      const len = Math.hypot(dx, dy)
      if (len < 1) { run = null; return }
      const ux = dx / len, uy = dy / len
      run = {
        key: h.key,
        x: h.from.x, y: h.from.y, ux, uy,
        // THE ANGLE IS A SCREEN ANGLE. The plane is squashed by GROUND, so a
        // bearing of 45 degrees in the world does not point at 45 on the glass.
        // Each mark stands up off the plane and then turns by the angle you can
        // actually see.
        a: Math.atan2(uy * GROUND, ux),
        // Never run the line past the thing it points at: on a short hop that
        // would be arrows sailing off beyond the hull you are being sent to.
        n: Math.max(2, Math.min(MARKS, Math.floor(len / GAP) - 1)),
      }
      runAge = 0
    },

    beam(b) { lit = b },

    advance(t, dt) {
      // ── THE HEADING ────────────────────────────────────────────────────
      if (run) {
        runAge += dt
        const life = runAge / (HEADING_MS / 1000)
        if (life >= 1) run = null
      }
      for (let i = 0; i < MARKS; i++) {
        const s = chevs[i]
        const rb = ribbons[i]
        if (!run || i >= run.n) { s.visible = false; rb.visible = false; continue }
        const d = LEAD + i * GAP
        // The run, one after another, so the line reads as travelling outward
        // rather than blinking. Same 1.9s and same 0.13s stagger the CSS had.
        const wave = Math.sin(((t + i * 0.13) / 1.9) * Math.PI * 2)
        const fade = Math.max(0, 1 - runAge / (HEADING_MS / 1000))
        // And it drifts along its own bearing as it pulses, which is what makes
        // seven of them read as one gesture.
        const nudge = wave * 26
        const x = run.x + run.ux * (d + nudge)
        const y = run.y + run.uy * (d + nudge)

        // ── THE ROAD ──────────────────────────────────────────────────
        // LYING ON THE PLANE, so it takes the squash the arrow above it is
        // busy undoing. Rotated by the WORLD bearing rather than the screen
        // one, because a flat thing turns in the plane it is lying in.
        rb.visible = true
        rb.position.set(x, y)
        rb.rotation = Math.atan2(run.uy, run.ux)
        rb.width = GAP * 1.15
        rb.height = 128
        rb.scale.y *= GROUND
        rb.alpha = fade * (0.3 + wave * 0.16)

        s.visible = true
        s.position.set(x, y)
        s.rotation = run.a
        // COUNTER-SQUASHED. A chevron is a sign standing on the water, not a
        // shape lying on it, so it divides by GROUND where a flat thing would
        // multiply. Done on the sprite's own height because it is already
        // rotated — scaling the container would shear it.
        s.width = 150
        s.height = 150 / GROUND
        s.alpha = fade * (0.55 + wave * 0.35)
      }

      // ── THE BEAM ───────────────────────────────────────────────────────
      const want = lit ? 1 : 0
      up += (want - up) * Math.min(1, dt * (lit ? 4.2 : 6))
      if (up < 0.01 && !lit) {
        pool.visible = false; beam.visible = false; core.visible = false
        for (const s of streaks) s.visible = false
        for (const s of motes) s.visible = false
        return
      }
      if (!lit) {
        // Fading out. Everything keeps its last geometry and only dims, so a
        // beam that is going out does not also jump.
        pool.alpha = up * 0.9
        beam.alpha = up
        core.alpha = up
        for (const s of streaks) s.alpha *= 0.86
        for (const s of motes) s.alpha *= 0.86
        return
      }
      const W = lit.r * 2
      pool.visible = true
      pool.position.set(lit.x, lit.y)
      pool.width = W * 1.15
      // The pool lies ON the ring, so it takes the squash.
      pool.height = W * 1.15 * GROUND
      pool.tint = lit.color
      pool.alpha = up * (0.75 + Math.sin(t * 1.7) * 0.14)

      // STANDS UP. 470 world pixels of column, divided by GROUND so it rises at
      // true height inside a squashed world — the same trick the chevrons use
      // and the same one every building on this chart uses.
      const H = (470 / GROUND) * up
      beam.visible = true
      beam.position.set(lit.x, lit.y)
      beam.width = W * 0.92
      beam.height = H
      beam.tint = lit.color
      beam.alpha = up * (0.8 + Math.sin(t * 2.3) * 0.12)

      core.visible = true
      core.position.set(lit.x, lit.y)
      core.width = W * 0.3
      core.height = H * 0.94
      // Toward white at the centre. A core in the same hue as the halo is just
      // the halo again; light that bright has burnt most of its colour out.
      core.tint = 0xffffff
      core.alpha = up * (0.34 + Math.sin(t * 3.1 + 1.2) * 0.1)

      // ── THE BANDS RUNNING UP IT ────────────────────────────────────────
      //
      // Each on its own loop, offset by a fixed share so they are evenly spread
      // however long the column is. Fading in off the ring and out again before
      // the top, so nothing ever arrives at an end.
      for (let i = 0; i < STREAKS; i++) {
        const s = streaks[i]
        const f = ((t * 0.42 + i / STREAKS) % 1)
        s.visible = true
        s.position.set(lit.x, lit.y - f * H)
        s.width = W * 0.72
        s.height = H * 0.2
        s.tint = lit.color
        // In fast, out slow: a band leaving the water is the moment worth
        // seeing, and one dissolving near the top should not compete with it.
        s.alpha = up * 0.5 * Math.min(1, f * 6) * (1 - f) * (1 - f)
      }

      // ── AND WHAT COMES OFF THE RING ────────────────────────────────────
      //
      // Motes rising out of the pool, each from its own point on the rim. The
      // beam is the portal WORKING and this is the part that says so: a column
      // alone is architecture, and things leaving the water are an event.
      for (let i = 0; i < MOTES; i++) {
        const s = motes[i]
        const ph = i * 0.7391
        const f = ((t * 0.3 + ph) % 1)
        const ang = ph * Math.PI * 2 + Math.sin(t * 0.11 + ph) * 0.6
        const rad = lit.r * (0.42 + (i % 5) * 0.13)
        s.visible = true
        s.position.set(
          lit.x + Math.cos(ang) * rad,
          // Rising: the lateral offset takes the plane's squash, the CLIMB does
          // not — a mote goes up through the air, not along the water.
          lit.y + Math.sin(ang) * rad * GROUND - f * (300 / GROUND),
        )
        const size = 16 + (i % 4) * 7
        s.width = size
        s.height = size
        s.tint = lit.color
        // Up and out. Brightest just off the surface and gone by the top.
        s.alpha = up * 0.85 * Math.min(1, f * 5) * (1 - f)
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
