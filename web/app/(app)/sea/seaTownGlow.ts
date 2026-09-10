// ── THE LAMPS REACH THE WATER ───────────────────────────────────────────────
//
// A town already lights up after dark: a run of lamps around its promenade, up
// on the island's TOP FACE with the buildings they stand among. That is right
// as far as it goes and it stops at the beach — a lit harbour beside water
// throws light ONTO the water, and the sea off a town at night was as black as
// the sea off an empty rock.
//
// So this is those same lamps carried past the shore. One pool for the whole
// town rather than one per lamp, because light that has crossed a beach and
// spread over open water has long since stopped being separate lamps.
//
// ── AND IT IS NOT A REFLECTION ──────────────────────────────────────────────
//
// Worth being precise about, because the obvious ask is "should the buildings
// reflect" and the answer is no. A reflection in a horizontal mirror puts the
// image at the same place, the same distance under the surface — so a building
// standing INLAND has its image beneath the ISLAND, not beneath the water, and
// the land is opaque. There is nothing to see. Only what meets the waterline
// reflects: the cliff does, the rocks do, the hulls do.
//
// This is the opposite thing. Not the town's image in the sea, the town's LIGHT
// on it — which needs no line of sight past the land, is a big soft shape
// rather than a small hard one, and is what you actually notice from a boat.
//
// ── WHERE IT SITS IN THE LIST ───────────────────────────────────────────────
//
// UNDER THE LAND. The pool is centred off the near shore but it is a circle, so
// part of it falls on the island — and light that spills over the beach and
// across the fields behind it is a lamp floating in the air. Drawn below the
// island sprites, the land simply covers that half, and what is left is the
// half on the water, with the coastline as its own edge. Free, exact, and it
// follows whatever shape the island happens to be.

import type { Container, Sprite, Texture } from 'pixi.js'
import type { GpuTown } from './seaTown'
import { swellAt } from './seaSwell'

/** How far south of the island's middle the pool sits, as a share of its box.
 *  Far enough that most of it is past the near shore. */
const OFF = 0.46
/** And how wide, same units. Generous: lamplight on water has no edge. */
const SPREAD = 1.35

/** The warm of a lit window, and how strong the pool gets at midnight. */
const LAMP = 0xffb057
const PEAK = 0.34

let poolTex: Texture | null = null

/**
 * A round falloff, and a slow one.
 *
 * The obvious gradient is bright in the middle and gone at the rim, which draws
 * a disc. Light on water has no rim — it thins out until you cannot say where
 * it stopped — so most of this texture's range is spent on the last third.
 */
function poolTexture(PIXI: typeof import('pixi.js')): Texture {
  if (poolTex) return poolTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.22, 'rgba(255,255,255,0.52)')
  grad.addColorStop(0.48, 'rgba(255,255,255,0.22)')
  grad.addColorStop(0.74, 'rgba(255,255,255,0.07)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  poolTex = PIXI.Texture.from(c)
  return poolTex
}

export type TownGlow = {
  view: Container
  /** The hour. 0 at noon, 1 in the middle of the night. */
  night(dark: number): void
  /** One frame: the shimmer. */
  advance(t: number): void
  destroy(): void
}

export function makeTownGlow(
  PIXI: typeof import('pixi.js'),
  towns: GpuTown[],
): TownGlow {
  const view: Container = new PIXI.Container()
  // LIGHT ADDS. Every other warm thing on this water does the same, and a pool
  // of lamplight that covered the sea instead of brightening it would be a
  // stain.
  view.blendMode = 'add'

  const tex = poolTexture(PIXI)
  const pools: { s: Sprite; x: number; y: number; d: number }[] = []

  for (const t of towns) {
    // A locked island is not lit. Nobody is home, which is the same reason its
    // chimneys are cold.
    if (t.locked || t.buildings.length === 0) continue
    const d = t.r * 2
    const s: Sprite = new PIXI.Sprite(tex)
    s.anchor.set(0.5)
    s.tint = LAMP
    s.alpha = 0
    s.width = d * SPREAD
    // ROUND IN THE WORLD, so the plane's own squash is what makes it an
    // ellipse. Writing an ellipse here would square with the squash and come
    // out flatter than the ground it is lying on.
    s.height = d * SPREAD
    s.position.set(t.x, t.y + d * OFF)
    view.addChild(s)
    pools.push({ s, x: t.x, y: t.y + d * OFF, d })
  }

  let dark = 0

  return {
    view,

    night(n) { dark = Math.max(0, Math.min(1, n)) },

    advance(t) {
      for (let i = 0; i < pools.length; i++) {
        const p = pools[i]
        if (dark <= 0.01) { p.s.alpha = 0; continue }
        // THE SWELL BREATHES IT. Light on moving water does not hold still —
        // the surface tilts under it and the pool gathers and spreads. Read off
        // the same field the hulls float on, at the pool's own position, so a
        // crest passing a harbour passes through its lamplight too.
        const w = swellAt(p.x, p.y, t) / 5.5
        p.s.alpha = dark * PEAK * (1 + w * 0.16)
        const k = 1 + w * 0.045
        p.s.width = p.d * SPREAD * k
        p.s.height = p.d * SPREAD * k
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
