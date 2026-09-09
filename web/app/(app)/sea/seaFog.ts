// ── THE FOG OF WAR, AS WEATHER ──────────────────────────────────────────────
//
// Water nobody has sailed, drawn on the same canvas as the sea it is sitting
// on. Two layers, and the split is the whole thing:
//
//   THE BANK is the explored mask itself, one texel per cell, uploaded to a
//   53×32 texture and stretched across the campaign's water. The GPU's own
//   bilinear filter turns a checkerboard of set and unset bits into a soft
//   front with a seven-hundred-pixel gradient across every edge — for one
//   sprite, one draw call, and a texture smaller than this comment.
//
//   THE BOIL is a few dozen soft puffs drifting along that front. The bank
//   alone is a shape that is exactly right and completely dead: a fog edge that
//   holds still is a stencil. These wander, breathe and fade on their own
//   phases, so the boundary is never twice the same and never geometric.
//
// ── WHY IT IS HERE AND NOT A DIV ────────────────────────────────────────────
//
// The first pass was a DOM canvas laid over this one. It worked and it was the
// wrong instinct twice over: it made a layout box thirty-seven thousand pixels
// wide inside a layer whose transform changes every frame, and it meant the
// game's renderer was drawing the sea while something else drew the weather on
// top of it. Fog belongs on the water, and the water is here.
//
// ── AND THE MARKS ARE HIDDEN, NOT COVERED ───────────────────────────────────
//
// The reason the div was reached for: encounter marks, isles and quest glyphs
// are DOM elements ABOVE this canvas, so fog drawn here cannot paint over them.
//
// It turns out not to matter, and the reason is worth writing down. Everything
// the campaign has not reached is ALREADY absent from the document — `shown()`
// in SeaMap has gated the marks, the isles, their collision and their proximity
// since the progressive reveal shipped, so there is nothing under the fog to
// cover. What does survive both is the one thing that should: your NEXT stop,
// which is drawn the moment the chain reaches it whether or not you have sailed
// that water. Hiding it would take away the only mark on the chart whose entire
// job is to say which way to go, and the compass and the heading are pointing
// at it anyway.
//
// So: fog hides TERRAIN, which is this canvas's. `shown()` hides MARKS, which
// is the document's. Two mechanisms, two subjects, no overlap.
//
// ── IT IS DARK, NOT GREY ────────────────────────────────────────────────────
//
// Same reasoning the squall's shadow is written down with: a flat grey wash
// over the sea flattens the swell and the palette under it. This is nearly
// opaque where it is thick, so what shows through at the edge is the water's
// own colour going quiet rather than a slate rectangle fading in.

import type { Container, Sprite, Texture } from 'pixi.js'
import {
  XFOG_CELL, XFOG_W, XFOG_H, XFOG_X0, XFOG_Y0, XFOG_CELLS,
} from '@/lib/seaExploreExp'

/** Blank paper, not a hole. The same three numbers the minimap has used for
 *  unexplored water since it shipped — a captain has already learned what this
 *  colour means on the other half of the game. */
const PAPER = { r: 25, g: 32, b: 41 }

/**
 * HOW MANY PUFFS RIDE THE EDGE.
 *
 * They are placed on the frontier cells nearest the camera and recycled every
 * frame, so this is a budget rather than a count of anything. Sixty is enough
 * that a screen-width of front is never bare and few enough that the whole
 * layer is one ParticleContainer's worth of work.
 */
const PUFFS = 60

let puffTex: Texture | null = null

/** A soft round blob with no edge at all. Everything ragged about the fog comes
 *  from overlapping several of these, never from the shape of one. */
function puffTexture(PIXI: typeof import('pixi.js')): Texture {
  if (puffTex) return puffTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // A long, shallow falloff. A sharp one gives a puff a visible rim and a
  // hundred visible rims is a bubble bath, not a fog bank.
  grad.addColorStop(0, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.30)')
  grad.addColorStop(0.78, 'rgba(255,255,255,0.08)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  puffTex = PIXI.Texture.from(c)
  return puffTex
}

export type Fog = {
  /** On the water, under the hulls. */
  view: Container
  /**
   * The alpha buffer, straight from the chart. Read every frame rather than
   * pushed on change: it is 1,696 floats and the loop is already walking them
   * to ease the fade, so handing over the array once is cheaper than an event
   * and cannot go stale.
   */
  bind(alpha: Float32Array): void
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number): void
  /** The hour. Fog is water vapour and it goes the colour of the light. */
  night(tint: number): void
  destroy(): void
}

export function makeFog(PIXI: typeof import('pixi.js')): Fog {
  const view: Container = new PIXI.Container()
  let alpha: Float32Array | null = null

  // ── THE BANK ──────────────────────────────────────────────────────────────
  //
  // One texel per cell. `scaleMode: 'linear'` is not a default worth relying on
  // silently: with 'nearest' this is a grid of seven-hundred-pixel squares and
  // the entire design is gone.
  const buf = new Uint8Array(XFOG_W * XFOG_H * 4)
  const src = new PIXI.BufferImageSource({
    resource: buf,
    width: XFOG_W,
    height: XFOG_H,
    scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload',
  })
  const bank: Sprite = new PIXI.Sprite(new PIXI.Texture({ source: src }))
  bank.position.set(XFOG_X0, XFOG_Y0)
  bank.width = XFOG_W * XFOG_CELL
  bank.height = XFOG_H * XFOG_CELL
  view.addChild(bank)

  // ── THE BOIL ──────────────────────────────────────────────────────────────
  const puffLayer: Container = new PIXI.Container()
  view.addChild(puffLayer)
  const puffs: Sprite[] = []
  for (let i = 0; i < PUFFS; i++) {
    const s: Sprite = new PIXI.Sprite(puffTexture(PIXI))
    s.anchor.set(0.5)
    s.visible = false
    puffLayer.addChild(s)
    puffs.push(s)
  }

  /** Frontier cells, rebuilt on a slow cadence rather than every frame: which
   *  cells are on the edge changes when you sail into one, not sixty times a
   *  second. */
  let edge: number[] = []
  let edgeAt = -1

  let tint = 0xffffff

  return {
    view,

    bind(a) { alpha = a },

    advance(camX, camY, halfW, halfH, t) {
      if (!alpha) return

      // ── UPLOAD THE BANK ──────────────────────────────────────────────────
      //
      // Every frame, and it is 1,696 texels: less work than the string
      // concatenation that writes the world transform. Premultiplied on upload,
      // so the colour is scaled by its own alpha here — an unpremultiplied
      // buffer through a premultiplying source gives dark fringes at the front,
      // which on a fog edge is the one artefact that looks like a bug.
      for (let i = 0; i < XFOG_CELLS; i++) {
        const a = alpha[i]
        const o = i * 4
        if (a <= 0) { buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0; buf[o + 3] = 0; continue }
        // Deterministic per-cell jitter, so a wall of it has some tooth. The
        // same hash the minimap uses, so the two halves of the chart are
        // recognisably one idea.
        const n = ((i * 2654435761) % 17) / 17
        const k = a * 0.96
        buf[o] = (PAPER.r + n * 7) * k
        buf[o + 1] = (PAPER.g + n * 8) * k
        buf[o + 2] = (PAPER.b + n * 9) * k
        buf[o + 3] = 255 * k
      }
      src.update()

      // ── AND THE EDGE THAT MOVES ──────────────────────────────────────────
      //
      // A cell is FRONTIER if it is fogged and at least one neighbour is not.
      // That is the line the puffs ride: fog in open water needs no detail
      // because there is nothing to compare it against, and the interior is
      // solid anyway.
      if (t - edgeAt > 0.4) {
        edgeAt = t
        edge = []
        for (let i = 0; i < XFOG_CELLS; i++) {
          if (alpha[i] < 0.35) continue
          const cx = i % XFOG_W, cy = (i / XFOG_W) | 0
          const open =
            (cx > 0 && alpha[i - 1] < 0.35) ||
            (cx < XFOG_W - 1 && alpha[i + 1] < 0.35) ||
            (cy > 0 && alpha[i - XFOG_W] < 0.35) ||
            (cy < XFOG_H - 1 && alpha[i + XFOG_W] < 0.35)
          if (!open) continue
          // Only what is on screen. The frontier round a whole campaign is
          // hundreds of cells and sixty puffs spread over all of it would be
          // one puff every four thousand pixels, which is not weather.
          const wx = XFOG_X0 + (cx + 0.5) * XFOG_CELL
          const wy = XFOG_Y0 + (cy + 0.5) * XFOG_CELL
          if (Math.abs(wx - camX) > halfW + XFOG_CELL * 2) continue
          if (Math.abs(wy - camY) > halfH + XFOG_CELL * 2) continue
          edge.push(i)
        }
      }

      for (let p = 0; p < PUFFS; p++) {
        const s = puffs[p]
        if (p >= edge.length) { s.visible = false; continue }
        const i = edge[p]
        const cx = i % XFOG_W, cy = (i / XFOG_W) | 0
        // Two irrational-ish rates per puff so no two are ever in step and the
        // pattern never closes. Seeded off the CELL, not the pool slot, so a
        // puff does not jump phase when the frontier is rebuilt under it.
        const ph = (i % 97) * 0.647
        const drift = Math.sin(t * 0.21 + ph) * XFOG_CELL * 0.42
        const sway = Math.cos(t * 0.17 + ph * 1.3) * XFOG_CELL * 0.34
        s.visible = true
        s.position.set(
          XFOG_X0 + (cx + 0.5) * XFOG_CELL + drift,
          XFOG_Y0 + (cy + 0.5) * XFOG_CELL + sway,
        )
        // Breathing, and never quite the same size twice.
        const grow = 1 + Math.sin(t * 0.13 + ph * 0.7) * 0.16
        s.width = XFOG_CELL * 2.5 * grow
        // Squashed onto the plane like every other flat thing out here: fog
        // lies ON the water, and a round puff would be standing up out of it.
        s.height = XFOG_CELL * 2.5 * grow * 0.58
        s.alpha = alpha[i] * (0.5 + Math.sin(t * 0.19 + ph * 1.7) * 0.16)
        s.tint = tint
      }
    },

    night(t) {
      tint = t
      bank.tint = t
    },

    destroy() { view.destroy({ children: true }) },
  }
}
