// ── FAIR-WEATHER CLOUD, AND WHAT IT DOES TO THE WATER ───────────────────────
//
// The last of the depth work, and the only piece of it that is about HEIGHT.
//
// Tier one gave the plane a receding surface and air in front of the far water.
// Tier two made things smaller as they go away. Both of those are cues about
// DISTANCE ACROSS the plane, and a chart can have every one of them and still
// read as a single sheet — because nothing in it was ever anywhere but on that
// sheet. Parallax is the cue that says there is a somewhere else to be.
//
// ── TWO LAYERS, BECAUSE THEY ARE TWO DIFFERENT FACTS ────────────────────────
//
// THE SHADOW is ON the water. It is a real place on the plane, it moves exactly
// as the plane moves, and it is squashed by GROUND like every other flat thing
// on this chart. A shadow that parallaxed would be a shadow floating off the
// thing it is cast on.
//
// THE CLOUD is ABOVE it, between the camera and the sea, and THAT is what
// parallaxes: it is drawn in screen space and slid at a fraction of the
// camera's own travel, which is exactly what something high up does when you
// move underneath it. That fraction is the whole illusion, and it is the only
// place in this file where anything is faked.
//
// The two are tied together: each cloud's shadow is its own body, offset along
// the light. Untie them and you have a grey blob wandering the sea with nothing
// making it.
//
// ── IT IS NOT WEATHER ───────────────────────────────────────────────────────
//
// `seaSqualls` draws weather: a squall is a PLACE, derived from lib/seaWeather,
// the same for every captain, and it rains on you. This is not that. This is
// the fair-weather cloud that is always somewhere overhead, belongs to nobody,
// affects nothing, and exists so that the sky is a thing the sea is under.
// Nothing here is persisted, seeded or synchronised, and nothing may ever gate
// on it.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

/** How many are in the sky at once. Enough that one is usually somewhere near,
 *  few enough that the sea is not overcast — this is a fine day with clouds in
 *  it, not a grey afternoon. */
const COUNT = 7

/** The box they live in, as a multiple of the viewport. Wider than the screen
 *  so one is always drifting on rather than popping in at the edge. */
const FIELD = 2.2

/**
 * HOW MUCH OF THE CAMERA'S TRAVEL THE CLOUD LAYER TAKES.
 *
 * 1.0 is on the water. 0 is painted on the lens. 0.86 is high enough to read as
 * a different distance and low enough that a cloud still belongs to the piece
 * of sea it is over — below about 0.7 they detach and slide about like a
 * scratched slide, which is the failure this number exists to avoid.
 */
const PARALLAX = 0.86

/** Where the sun is, as a fraction of a cloud's own width. The shadow lands
 *  down-light of the body; on this chart the light comes from up-screen, so
 *  the shadow falls toward the viewer. */
const SUN = { x: 0.10, y: 0.34 }

/** World px per second the whole sky drifts. Slow: a cloud crossing the screen
 *  in ten seconds is a bird. */
const DRIFT = { x: 7, y: -3 }

type Cloud = {
  body: Sprite
  shade: Sprite
  /** Its place in the drifting field, in world units. */
  x: number
  y: number
  r: number
  /** Its own opacity, so the sky is not seven copies of one cloud. */
  a: number
}

export type Clouds = {
  /** The shadows. Goes in the WORLD container, under the boats, over the
   *  water — they are on the plane and belong with everything else on it. */
  water: Container
  /** The bodies. Goes on the STAGE, above the world: they are between the
   *  camera and the sea and nothing on the sea can be in front of them. */
  air: Container
  advance(t: number, camX: number, camY: number, halfW: number, halfH: number,
    zoom: number, screenW: number, screenH: number): void
  /** Darkness, 0 to 1. Clouds are lit by the sun; after dark there is no sun
   *  and a shadow with nothing casting it is a stain. */
  night(dark: number): void
}

let puffTex: Texture | null = null

/**
 * ONE PUFF, BUILT FROM FIVE. A single radial blob is a smoke ring; a cloud is
 * lumpy, and the lumps are most of what makes it read as one at a glance. Drawn
 * once and shared — seven sprites of the same texture, at different sizes and
 * rotations, is a sky.
 */
function puffTexture(PIXI: typeof import('pixi.js')): Texture {
  if (puffTex) return puffTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const lumps: [number, number, number][] = [
    [0.42, 0.54, 0.30],
    [0.60, 0.48, 0.24],
    [0.30, 0.50, 0.20],
    [0.52, 0.62, 0.22],
    [0.70, 0.58, 0.16],
  ]
  for (const [lx, ly, lr] of lumps) {
    const grad = g.createRadialGradient(lx * S, ly * S, 0, lx * S, ly * S, lr * S)
    grad.addColorStop(0.0, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.55)')
    // A LONG SKIRT, like the squall's. A cloud has no edge either.
    grad.addColorStop(1.0, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
  }
  puffTex = PIXI.Texture.from(c)
  return puffTex
}

export function makeClouds(PIXI: typeof import('pixi.js')): Clouds {
  const water: Container = new PIXI.Container()
  const air: Container = new PIXI.Container()
  // SUBTRACTED, NOT WASHED ON. Same reason the squall's shadow multiplies: a
  // grey wash over dark water lifts it toward grey, and a cloud shadow makes
  // water DARKER, not flatter.
  water.blendMode = 'multiply'
  water.eventMode = 'none'
  air.eventMode = 'none'

  const tex = puffTexture(PIXI)
  const clouds: Cloud[] = []
  let dark = 0

  for (let i = 0; i < COUNT; i++) {
    const body: Sprite = new PIXI.Sprite(tex)
    body.anchor.set(0.5)
    body.tint = 0xf2f6fb
    air.addChild(body)

    const shade: Sprite = new PIXI.Sprite(tex)
    shade.anchor.set(0.5)
    // The colour a cloud shadow actually is on water: a cool grey, not black.
    shade.tint = 0x8fa4bd
    water.addChild(shade)

    clouds.push({
      body, shade,
      // Scattered on a hash of the index rather than Math.random, so the sky
      // is the same sky on a reload — a cloud field that reshuffles itself
      // every time the page loads is a cloud field nobody can learn.
      x: ((i * 2654435761) % 1000) / 1000,
      y: ((i * 40503) % 1000) / 1000,
      r: 900 + (((i * 2246822519) % 1000) / 1000) * 1400,
      a: 0.26 + (((i * 3266489917) % 1000) / 1000) * 0.24,
    })
  }

  return {
    water,
    air,
    night(d) { dark = d },
    advance(t, camX, camY, halfW, halfH, zoom, screenW, screenH) {
      // AFTER DARK THERE IS NO SUN, so there is nothing casting anything. Not
      // switched off — faded, or the last cloud of the day would vanish on a
      // frame. A little is left at night: a moon casts too, faintly.
      const lit = 1 - dark * 0.82
      if (lit <= 0.02) {
        water.visible = false
        air.visible = false
        return
      }
      water.visible = true
      air.visible = true

      const fw = halfW * 2 * FIELD
      const fh = halfH * 2 * FIELD

      for (const c of clouds) {
        // ── WHERE IT IS, in a field that wraps around the camera ──
        //
        // The same trick the shoals use: the field is anchored on the camera
        // and each cloud sits at a fixed fraction of it, so sailing never runs
        // out of sky and nothing has to be respawned. The drift is added to the
        // fraction, so the whole sky moves as one body — clouds on a fair day
        // travel together, because there is one wind.
        const fx = (c.x + (t * DRIFT.x) / fw) % 1
        const fy = (c.y + (t * DRIFT.y) / fh) % 1
        const wx = camX + ((fx + 1) % 1 - 0.5) * fw
        const wy = camY + ((fy + 1) % 1 - 0.5) * fh

        // ── THE SHADOW: on the plane, at 1:1, offset down-light ──
        c.shade.x = wx + c.r * SUN.x
        c.shade.y = wy + c.r * SUN.y
        c.shade.width = c.r * 2
        c.shade.height = c.r * 2
        c.shade.alpha = c.a * lit

        // ── THE BODY: in screen space, at a fraction of the travel ──
        //
        // This is the parallax and the only fake in the file. A world point is
        // `centre + zoom * (wx - camX, GROUND * (wy - camY))`; taking a
        // FRACTION of the camera offset is the same mapping with the camera
        // moved less, which is what a thing high above you does when you walk
        // under it.
        c.body.x = screenW / 2 + zoom * (wx - camX) * PARALLAX
        c.body.y = screenH / 2 + zoom * GROUND * (wy - camY) * PARALLAX
        // NOT squashed by GROUND. A cloud is not lying on the water; it is a
        // thing in the air seen from below the level it is at, and the whole
        // point of it being up there is that it does not take the plane's
        // foreshortening.
        c.body.width = c.r * 2 * zoom
        c.body.height = c.r * 2 * zoom
        // Fainter than its own shadow. Looking through thin cloud at a dark sea
        // is mostly sea, and a body as solid as the shade it casts reads as
        // fog on the lens.
        c.body.alpha = c.a * 0.42 * lit
      }
    },
  }
}
