// ── CLOUDS THAT GO PAST, AND NOTHING ELSE ───────────────────────────────────
//
// There were seven of them, always, everywhere, made of five radial gradients
// each, and every one dragged a multiplied grey shadow across the water it was
// over. Seven clouds up to 4,600 world px wide in a field two viewports across
// means one was permanently overhead and its shadow permanently on the sea. It
// did not read as weather. It read as a filter on the game -- a muddy wash that
// never lifted, which is exactly what a captain called it.
//
// It is a handful of PAINTED clouds now, drifting past now and then, with
// stretches of clear sky in between. Nothing is cast on the water at all.
//
// ── THE ART WAS ALREADY IN THE REPOSITORY ───────────────────────────────────
//
// `/clouds1.webp` is a hand-painted strip of sixteen clouds on transparent
// ground, drawn for the fishing screen's overlay. It is the house style, it is
// already downloaded by most players, and it is a far better cloud than
// anything five stacked gradients will ever produce. FRAMES below are eight of
// them, measured off the alpha channel by connected component rather than
// eyeballed, so each rectangle is one whole cloud and no part of its neighbour.
//
// ── WHAT PIXI IS DOING FOR US ───────────────────────────────────────────────
//
// ONE TEXTURE, EIGHT FRAMES. Every sprite is a window onto the same uploaded
// bitmap, so the GPU binds one texture and draws the lot in a single batch.
// Separate images would be eight uploads and eight binds for three sprites.
//
// NO BLEND MODE. The old shadow layer was `multiply`, which cannot batch with
// anything around it. Normal blending means these ride along in the same batch
// as their neighbours.
//
// MIPMAPS, via the shared `texture()` helper. A 1,144px cloud drawn at 300
// samples one pixel in four without them and crawls with tiny sparkles as it
// moves. This is the single biggest reason to use the loader everything else
// uses rather than `Texture.from`.
//
// A POOL, NOT ALLOCATION. Four sprites are made once and reused: a cloud that
// has drifted away has its `texture` swapped and is put back at the other edge.
// No sprite is created or destroyed while sailing.
//
// `scale.set`, NOT `width`/`height`. Assigning width makes Pixi divide by the
// texture's own width to derive a scale, every frame, per sprite. We know the
// scale we want; setting it directly skips the arithmetic and the property
// setter behind it.
//
// ── IT IS NOT WEATHER ───────────────────────────────────────────────────────
//
// `seaSqualls` draws weather: a squall is a PLACE, derived from lib/seaWeather,
// the same for every captain, and it rains on you. This is the fair-weather sky
// that belongs to nobody, affects nothing, and may never be gated on.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { texture } from './skiffArt'

/** The strip the frames are cut from. Already used by the fishing overlay. */
const SHEET = '/clouds1.webp'

/**
 * EIGHT CLOUDS OUT OF THE SIXTEEN ON THE SHEET, as [x, y, w, h].
 *
 * Measured by flood-filling the alpha channel and taking each component's
 * bounding box, then picking a spread: two big cumulus, some mid, a couple of
 * thin banks. Hard-coded because the sheet is a fixed asset and scanning it at
 * runtime would be a second of work to rediscover a constant.
 */
const FRAMES: readonly [number, number, number, number][] = [
  [2736, 296, 1144, 512],
  [80, 312, 1032, 360],
  [1096, 552, 1048, 328],
  [6272, 288, 712, 360],
  [3904, 664, 1360, 280],
  [4368, 280, 712, 208],
  [2176, 784, 760, 184],
  [1640, 312, 392, 152],
]

/** How many may be in the sky at once. Two, and often none: the gap between
 *  them is the point of the rewrite. */
const MAX_ALOFT = 2

/** Seconds between one leaving and the next arriving, picked in this range.
 *  Long. A cloud every twenty seconds is a busy sky; a cloud now and then is
 *  a fine day. */
const GAP = { min: 16, max: 46 }

/** How wide a cloud is drawn, in WORLD px. The warship is 340 across and an
 *  island runs to a few thousand, so this is a big object without being the
 *  sky itself. */
const WIDTH = { min: 950, max: 1900 }

/**
 * HOW MUCH OF THE CAMERA'S TRAVEL A CLOUD TAKES, per cloud.
 *
 * 1.0 is painted on the water, 0 is painted on the lens. High enough to read as
 * another distance, low enough to still belong to the piece of sea it is over.
 * Varied a little per cloud so the sky is not one rigid sheet sliding about:
 * they share a wind, not a height.
 */
const PARALLAX = { min: 0.80, max: 0.92 }

/** World px per second the wind moves them. One wind, so every cloud takes it. */
const WIND = { x: 9, y: -4 }

/** Seconds of fade at each end of a pass, so nothing pops into being. */
const FADE = 2.6

type Cloud = {
  sprite: Sprite
  /** Where it is, in WORLD px. Not a fraction of the viewport -- see advance. */
  x: number
  y: number
  w: number
  parallax: number
  /** Peak opacity for this pass. */
  alpha: number
  /** Seconds it has been up. */
  age: number
  live: boolean
}

export type Clouds = {
  /** The bodies. Goes on the STAGE, above the world: they are between the
   *  camera and the sea, and nothing on the sea can be in front of them. */
  air: Container
  advance(t: number, dt: number, camX: number, camY: number,
    zoom: number, screenW: number, screenH: number): void
  /** Darkness, 0 to 1. The sky goes navy and the clouds go with it. */
  night(dark: number): void
}

export function makeClouds(PIXI: typeof import('pixi.js')): Clouds {
  const air: Container = new PIXI.Container()
  air.eventMode = 'none'
  // Nothing in here is ever a hit target and the container is never sorted;
  // saying so lets Pixi skip both passes over it.
  air.interactiveChildren = false

  const clouds: Cloud[] = []
  let frames: Texture[] = []
  let dark = 0
  /** When the next one may arrive. Starts a little in so the first thing a
   *  captain sees on opening the chart is sky rather than a cloud. */
  let nextAt = 6

  // THE POOL, made before the art lands. The sprites exist immediately with no
  // texture and are simply invisible until there is something to show; this
  // way nothing is allocated on the frame a cloud is wanted.
  for (let i = 0; i < MAX_ALOFT + 2; i++) {
    const sprite: Sprite = new PIXI.Sprite()
    sprite.anchor.set(0.5)
    sprite.visible = false
    air.addChild(sprite)
    clouds.push({ sprite, x: 0, y: 0, w: 0, parallax: 0.86, alpha: 0, age: 0, live: false })
  }

  void texture(PIXI, SHEET).then(base => {
    // ONE BASE, EIGHT WINDOWS ONTO IT. `frame` is a rectangle in the source
    // bitmap; every sprite below shares the uploaded texture and the GPU binds
    // it once for all of them.
    frames = FRAMES.map(([x, y, w, h]) => new PIXI.Texture({
      source: base.source,
      frame: new PIXI.Rectangle(x, y, w, h),
    }))
  })

  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

  /** Put one just off the up-wind edge, in world units, and let it drift. */
  function launch(c: Cloud, camX: number, camY: number, zoom: number, screenW: number, screenH: number) {
    const tex = frames[(Math.random() * frames.length) | 0]
    if (!tex) return
    c.sprite.texture = tex
    c.w = rand(WIDTH.min, WIDTH.max)
    c.parallax = rand(PARALLAX.min, PARALLAX.max)
    c.alpha = rand(0.62, 0.9)
    c.age = 0
    c.live = true

    // Just outside the view, up-wind, in WORLD px. The apparent half-width is
    // what the screen covers divided by the zoom, widened by the parallax:
    // a cloud that moves at 0.86 of the camera has to start further out to
    // still take a moment to arrive.
    const halfW = screenW / 2 / zoom / c.parallax
    const halfH = screenH / 2 / zoom / GROUND / c.parallax
    c.x = camX - Math.sign(WIND.x || 1) * (halfW + c.w)
    c.y = camY + rand(-halfH * 0.7, halfH * 0.5)
    c.sprite.visible = true
  }

  return {
    air,
    night(d) { dark = d },

    advance(t, dt, camX, camY, zoom, screenW, screenH) {
      // AFTER DARK THE SKY IS NOT WHITE. Not switched off -- a moonlit cloud is
      // a real thing and the sea reads flat without one -- but dimmed hard and
      // cooled, so it stops being the brightest object on a night chart.
      const lit = 1 - dark * 0.72
      const aloft = clouds.reduce((n, c) => n + (c.live ? 1 : 0), 0)
      if (frames.length && aloft < MAX_ALOFT && t >= nextAt) {
        const free = clouds.find(c => !c.live)
        if (free) {
          launch(free, camX, camY, zoom, screenW, screenH)
          nextAt = t + rand(GAP.min, GAP.max)
        }
      }

      for (const c of clouds) {
        if (!c.live) continue
        c.age += dt
        // ONE WIND, IN WORLD UNITS. This is the whole fix for the zoom lurch:
        // the old field was sized in VIEWPORT units, so zooming in shrank the
        // field, which moved every cloud in it and changed the drift rate at
        // the same time. Going into fishing mode therefore fired the sky across
        // the screen. A cloud is somewhere now, and a zoom only changes how
        // much of the world fits on the glass.
        c.x += WIND.x * dt
        c.y += WIND.y * dt

        // A world point lands at `centre + zoom * (world - camera)`, squashed by
        // GROUND going up-screen. Taking a FRACTION of the camera offset is the
        // same mapping with the camera moved less, which is what something high
        // above you does when you walk underneath it. That fraction is the only
        // fake in this file.
        const sx = screenW / 2 + zoom * (c.x - camX) * c.parallax
        const sy = screenH / 2 + zoom * GROUND * (c.y - camY) * c.parallax
        const drawW = c.w * zoom
        // NOT squashed by GROUND. A cloud is not lying on the water; it is in
        // the air, and the whole point of it being up there is that it does not
        // take the plane's foreshortening.
        const drawH = drawW * (c.sprite.texture.height / c.sprite.texture.width)

        // Gone when it is a full body clear of the glass on any side. Checked
        // in SCREEN space because that is where "out of sight" means anything:
        // a fast boat can leave a cloud behind as easily as the wind can carry
        // it off.
        if (sx < -drawW * 1.2 || sx > screenW + drawW * 1.2
          || sy < -drawH * 2 || sy > screenH + drawH * 2) {
          c.live = false
          c.sprite.visible = false
          continue
        }

        c.sprite.position.set(sx, sy)
        // scale, not width/height: we know the number, so there is no reason to
        // make the setter divide by the texture size to find it again.
        c.sprite.scale.set(drawW / c.sprite.texture.width)
        // In and out on a fade, so a cloud arrives rather than appears. The
        // out-fade rides the same clock: there is no known end to a pass, so it
        // simply never gets one and the edge test above does the retiring.
        const fadeIn = Math.min(1, c.age / FADE)
        c.sprite.alpha = c.alpha * fadeIn * lit
        // Cooled with the hour rather than recoloured: white at noon, a dim
        // slate at midnight, and the tint is a single uniform rather than a
        // second texture.
        const cool = Math.round(0xff - dark * 0x62)
        c.sprite.tint = (cool << 16) | (cool << 8) | Math.round(0xff - dark * 0x3a)
      }
    },
  }
}
