// ── THE SHADOWS UNDER THE EXPEDITION SEA ────────────────────────────────────
//
// Something very large passes beneath you on the long crossings north of the
// sortie. It is never drawn as a creature: it is a darkening in the shape of
// one, rising until you could almost name it and sounding again.
//
// ── IT MULTIPLIES. IT DOES NOT PAINT. ───────────────────────────────────────
//
// The house rule for anything this chart draws ON the water, and this is the
// clearest case of it there will ever be: a dark sprite laid over the sea
// replaces the water, so every wave, glint and caustic inside the silhouette
// would simply stop — which is exactly what a decal looks like and the precise
// opposite of a shape seen THROUGH water. Multiplied, the surface goes on
// running across its back, and that is the whole illusion. See the note in
// seaPortalWell, and the maelstroms, which had to learn this the hard way.
//
// ── AND IT IS SOFT AT EVERY EDGE ────────────────────────────────────────────
//
// Nothing down there has an outline. The silhouettes are drawn with heavy blur
// and no hard rim, and they never reach full strength — a shape you can trace
// is a thing at the surface, and this one is fathoms down.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { leviathansAt, leviathanPos, leviathanRise, type Leviathan } from '@/lib/seaLeviathans'

const TEX = 512

const cache: Partial<Record<Leviathan['kind'], Texture>> = {}

/**
 * A SILHOUETTE, DRAWN WHITE so a tint can carry it, nose to the right, on a
 * square plate it is free to be long inside. Blurred hard: this is a body seen
 * through a lot of water and the blur is most of what says so.
 */
function shape(PIXI: typeof import('pixi.js'), kind: Leviathan['kind']): Texture {
  const hit = cache[kind]
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const g = c.getContext('2d')!
  const M = TEX / 2
  g.fillStyle = '#ffffff'
  // Softness scales with the plate, so the blur is the same fraction of the
  // body whatever size it is drawn at.
  g.filter = 'blur(14px)'

  if (kind === 'whale') {
    // A long body, thickest a third back, with a broad tail fluke.
    g.beginPath()
    g.moveTo(TEX * 0.94, M)
    g.bezierCurveTo(TEX * 0.72, M - 62, TEX * 0.44, M - 74, TEX * 0.24, M - 34)
    g.lineTo(TEX * 0.13, M - 52)          // the fluke, upper lobe
    g.lineTo(TEX * 0.17, M)
    g.lineTo(TEX * 0.13, M + 52)          // and the lower
    g.lineTo(TEX * 0.24, M + 34)
    g.bezierCurveTo(TEX * 0.44, M + 74, TEX * 0.72, M + 62, TEX * 0.94, M)
    g.closePath()
    g.fill()
    // Pectorals, set low and swept back.
    g.beginPath()
    g.ellipse(TEX * 0.58, M + 62, 54, 17, -0.42, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.ellipse(TEX * 0.58, M - 62, 54, 17, 0.42, 0, Math.PI * 2)
    g.fill()
  } else if (kind === 'serpent') {
    // A body in a shallow S. Drawn as a tapering stroke rather than a fill,
    // because that is what a serpent is: a line with thickness.
    g.strokeStyle = '#ffffff'
    g.lineCap = 'round'
    const pts: [number, number][] = [
      [TEX * 0.95, M + 6], [TEX * 0.78, M - 40], [TEX * 0.60, M + 34],
      [TEX * 0.42, M - 30], [TEX * 0.24, M + 26], [TEX * 0.10, M - 4],
    ]
    for (let i = 0; i + 1 < pts.length; i++) {
      g.lineWidth = 62 - i * 9          // thick at the head, thin at the tail
      g.beginPath()
      g.moveTo(pts[i][0], pts[i][1])
      g.quadraticCurveTo(
        (pts[i][0] + pts[i + 1][0]) / 2, pts[i][1],
        pts[i + 1][0], pts[i + 1][1])
      g.stroke()
    }
    // The head, a shade broader than the neck.
    g.beginPath()
    g.ellipse(TEX * 0.95, M + 6, 48, 34, 0, 0, Math.PI * 2)
    g.fill()
  } else {
    // A ray: mostly width, with a long whip of a tail.
    g.beginPath()
    g.moveTo(TEX * 0.86, M)
    g.bezierCurveTo(TEX * 0.70, M - 150, TEX * 0.34, M - 130, TEX * 0.22, M - 16)
    g.bezierCurveTo(TEX * 0.34, M + 130, TEX * 0.70, M + 150, TEX * 0.86, M)
    g.closePath()
    g.fill()
    g.strokeStyle = '#ffffff'
    g.lineWidth = 15
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(TEX * 0.24, M)
    g.quadraticCurveTo(TEX * 0.14, M + 10, TEX * 0.04, M - 6)
    g.stroke()
  }
  g.filter = 'none'
  const t = PIXI.Texture.from(c)
  cache[kind] = t
  return t
}

export type Leviathans = {
  view: Container
  advance(camX: number, camY: number, halfW: number, halfH: number): void
  /** Darkness 0..1. A shadow in the dark is nearly nothing — there is no light
   *  left for it to take away. */
  night(dark: number): void
  destroy(): void
}

export function makeLeviathans(PIXI: typeof import('pixi.js')): Leviathans {
  const view: Container = new PIXI.Container()
  view.eventMode = 'none'
  // THE WHOLE LAYER MULTIPLIES. Set once, here, rather than per sprite: it is
  // a property of what this layer IS, and a sprite that ever forgot it would
  // be the one that reads as a sticker.
  view.blendMode = 'multiply'

  const SLOTS = 4
  const bodies: Sprite[] = []
  for (let i = 0; i < SLOTS; i++) {
    const s: Sprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
    s.anchor.set(0.5)
    s.alpha = 0
    s.visible = false
    view.addChild(s)
    bodies.push(s)
  }

  let dark = 0
  let cached: Leviathan[] = []
  let cachedAt = 0

  return {
    view,

    advance(camX, camY, halfW, halfH) {
      const now = Date.now()
      // The set turns over every nine minutes and deriving it is a hash. Once
      // every four seconds is far more often than it can change.
      if (now - cachedAt > 4000) { cachedAt = now; cached = leviathansAt(now) }

      for (let i = 0; i < SLOTS; i++) {
        const l = cached[i]
        const s = bodies[i]
        if (!l) { if (s.visible) { s.visible = false; s.alpha = 0 } continue }

        const rise = leviathanRise(l, now)
        if (rise <= 0.002) { if (s.visible) { s.visible = false; s.alpha = 0 } continue }

        const at = leviathanPos(l, now)
        // Culled on its own length, not on a radius: these are long things and
        // one crossing the corner of the screen should still be drawn.
        const reach = l.len * 0.8
        if (Math.abs(at.x - camX) > halfW + reach || Math.abs(at.y - camY) > halfH + reach) {
          if (s.visible) { s.visible = false; s.alpha = 0 }
          continue
        }

        if (s.texture === PIXI.Texture.EMPTY) s.texture = shape(PIXI, l.kind)
        s.visible = true
        s.position.set(at.x, at.y)
        s.rotation = at.rot
        // Sized off the plate's own proportion, and FLATTENED by GROUND like
        // everything else lying on this plane. It swells a little as it rises,
        // which is the cheapest possible depth cue and the only one available
        // to a flat chart: a thing nearer the surface is a thing nearer you.
        const w = l.len * (0.82 + rise * 0.18)
        s.width = w
        s.height = w * GROUND
        // NEVER FULL. Two thirds at the top of a rise, and pulled down hard
        // after dark: a shadow is light taken away, and at night there is
        // hardly any there to take.
        s.alpha = rise * 0.62 * (1 - dark * 0.72)
        // The colour it multiplies BY. Not black — a black multiply is a hole,
        // and this is a body between you and the deep. A cold blue-grey keeps
        // the water's own hue and only takes the light out of it.
        s.tint = 0x5a6f80
      }
    },

    night(d) { dark = d },

    destroy() { view.destroy({ children: true }) },
  }
}
