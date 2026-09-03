// ── A BOUNDARY THE SEA DRAWS ITSELF ─────────────────────────────────────────
//
// A bay's route walls were a line of rock sprites laid end to end, every two
// hundred and seventy pixels, for thirty-seven thousand pixels of coast. Four
// pieces of art repeating down the whole thing — which is exactly what it looks
// like, and no amount of jitter on the offsets fixes a thing whose problem is
// that you can see the same stone eleven times.
//
// So the wall stops being made of objects and becomes something the WATER is
// doing: a shoal. Pale, shallow, breaking — the read every sailor already has
// for "there is no water for you here", and the one boundary that can run for
// forty thousand pixels without repeating, because it is a gradient rather
// than a picture.
//
// ── THE WALL IS UNCHANGED ───────────────────────────────────────────────────
//
// Nothing here is collision. The wall is a segment in `WALLS` and the crossing
// test has always read that rather than the rock beside it — the stone was
// scenery standing on a line, and this is different scenery on the same line.
// A hull is stopped by exactly the geometry it was stopped by before.
//
// ── AND IT IS TWO SPRITES A WALL, NOT A HUNDRED ─────────────────────────────
//
// Seventeen walls in a bay came to some seven hundred rocks and shingle. This
// is thirty-four sprites for the same seventeen walls, which is worth saying
// out loud on a chart that has been running out of memory on a phone.

import type { Container, Sprite, Texture } from 'pixi.js'

/** How wide the broken water is, in world px. Wide enough to read as a shoal
 *  rather than as a drawn line, narrow enough that the channel it edges is
 *  still obviously the channel. */
const BAND = 300

let surfTex: Texture | null = null

/**
 * THE BAND, ACROSS ITS WIDTH. Deep water at both edges, shallows coming up,
 * and a bright break along the middle where it is shallowest.
 *
 * Soft at both ends on purpose: a hard edge is a drawn line, and the whole
 * point of this is that the sea shelves rather than stopping.
 */
function surfTexture(PIXI: typeof import('pixi.js')): Texture {
  if (surfTex) return surfTex
  const W = 8, H = 128
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.22, 'rgba(255,255,255,0.16)')
  grad.addColorStop(0.42, 'rgba(255,255,255,0.52)')
  grad.addColorStop(0.50, 'rgba(255,255,255,0.92)')
  grad.addColorStop(0.58, 'rgba(255,255,255,0.52)')
  grad.addColorStop(0.78, 'rgba(255,255,255,0.16)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  surfTex = PIXI.Texture.from(c)
  return surfTex
}

export type SurfLine = {
  ax: number; ay: number; bx: number; by: number
  /** The pale stop of whatever water this bay is, so a shoal belongs to the sea
   *  it is in rather than being the same white everywhere. */
  tint: number
}

export type Surf = {
  view: Container
  /** Rebuild the whole set. Called when the list changes — a gate coming down
   *  removes a line — and not otherwise. */
  set(lines: SurfLine[]): void
  advance(t: number): void
  night(dark: number): void
  destroy(): void
}

export function makeSurf(PIXI: typeof import('pixi.js')): Surf {
  const view: Container = new PIXI.Container()
  view.eventMode = 'none'
  const tex = surfTexture(PIXI)

  type Line = { a: Sprite; b: Sprite; phase: number }
  let lines: Line[] = []
  let dark = 0

  return {
    view,
    night(d) { dark = d },

    set(specs) {
      view.removeChildren()
      lines = specs.map((s, i) => {
        const dx = s.bx - s.ax, dy = s.by - s.ay
        const len = Math.hypot(dx, dy) || 1
        const mk = (h: number, alpha: number): Sprite => {
          const sp: Sprite = new PIXI.Sprite(tex)
          sp.anchor.set(0.5)
          sp.x = (s.ax + s.bx) / 2
          sp.y = (s.ay + s.by) / 2
          // IN WORLD SPACE, ROTATED IN WORLD SPACE. The container this sits in
          // is already squashed by GROUND, so a band rotated here comes out
          // sheared exactly the way a flat thing on this plane should — which
          // is why the rotation is NOT corrected for the squash. Correcting it
          // would stand the shoal up out of the water.
          sp.rotation = Math.atan2(dy, dx)
          sp.width = len
          sp.height = h
          sp.tint = s.tint
          sp.alpha = alpha
          view.addChild(sp)
          return sp
        }
        // TWO BANDS, one wide and dim and one narrow and bright, breathing out
        // of step. That is what stops it being a painted stripe: the crest
        // moves against the shallows behind it, so the edge of the water is
        // doing something even when nothing else is.
        return {
          a: mk(BAND, 0.5),
          b: mk(BAND * 0.42, 0.6),
          // Phased on the line's own index, so a bay full of them never
          // breathes together — the same rule the hulls' bob follows.
          phase: (i * 2.39996) % (Math.PI * 2),
        }
      })
    },

    advance(t) {
      // A shoal breaks at night too; it is white water, not a light. Dimmed
      // with the hour like everything else, and never off.
      const lit = 1 - dark * 0.55
      for (const l of lines) {
        const s = Math.sin(t * 0.6 + l.phase)
        const s2 = Math.sin(t * 0.9 + l.phase * 1.7)
        l.a.alpha = (0.34 + 0.10 * s) * lit
        l.b.alpha = (0.42 + 0.16 * s2) * lit
        // The crest wanders across the band rather than sitting on its centre,
        // which is the difference between surf and a hairline.
        l.b.height = BAND * (0.36 + 0.10 * s2)
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
