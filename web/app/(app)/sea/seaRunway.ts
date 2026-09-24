// ── THE RUNWAY THROUGH THE REEF ─────────────────────────────────────────────
//
// Kong: add lights along the corridor between expeditions and fishing, so it
// reads as an entrance you pass through, like a runway.
//
// Two rows of small lamps on the water, one down each edge of the gap in the
// reef (chart GATE_X / GATE_HALF), running from the fishing side through the
// passage to the anchorage. Each lamp burns low all the time; a brighter pulse
// chases up the rows toward the arch every couple of seconds, the way approach
// lights lead a pilot in. Brighter after dark, when it matters most, and still
// visible by day.
//
// Twenty-odd sprites in one container, additive, drawn with the chart's own
// radial glow baked once. Nothing is created per frame; the advance is a loop
// of alpha and scale writes, and it skips entirely while the passage is off
// screen.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GATE_X, GATE_HALF, NORTH_WALL } from './chart'
import { GROUND } from './islandArt'

/** Where the rows run, in world y: well out on the fishing side, through the
 *  reef and into the anchorage. */
const Y_SOUTH = NORTH_WALL + 760
const Y_NORTH = NORTH_WALL - 640
/** Lamps per row, and how far in from the rock they sit. */
const COUNT = 12
const INSET = 70
/** One chase up the rows, in seconds, then a rest. */
const CHASE_S = 1.4
const PERIOD_S = 2.6

export type Runway = {
  view: Container
  advance(t: number, camX: number, camY: number, halfW: number, halfH: number, dark: number): void
}

function glowTexture(PIXI: typeof import('pixi.js')): Texture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grd.addColorStop(0, 'rgba(255,248,225,1)')
  grd.addColorStop(0.18, 'rgba(255,214,140,0.95)')
  grd.addColorStop(0.45, 'rgba(255,170,70,0.35)')
  grd.addColorStop(1, 'rgba(255,150,40,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, S, S)
  return PIXI.Texture.from(c)
}

export function makeRunway(PIXI: typeof import('pixi.js')): Runway {
  const view: Container = new PIXI.Container()
  const tex = glowTexture(PIXI)
  type Lamp = { core: Sprite; halo: Sprite; u: number }
  const lamps: Lamp[] = []
  for (const side of [-1, 1]) {
    const x = GATE_X + side * (GATE_HALF - INSET)
    for (let i = 0; i < COUNT; i++) {
      const u = i / (COUNT - 1)
      const y = Y_SOUTH + (Y_NORTH - Y_SOUTH) * u
      const halo = new PIXI.Sprite(tex)
      halo.anchor.set(0.5)
      halo.blendMode = 'add'
      halo.position.set(x, y)
      const core = new PIXI.Sprite(tex)
      core.anchor.set(0.5)
      core.blendMode = 'add'
      core.position.set(x, y)
      view.addChild(halo, core)
      lamps.push({ core, halo, u })
    }
  }
  const x0 = GATE_X - GATE_HALF, x1 = GATE_X + GATE_HALF
  let shown = true

  return {
    view,
    advance(t, camX, camY, halfW, halfH, dark) {
      // Off screen: nothing to do, and the container is hidden once rather
      // than twenty-four sprites being written every frame.
      const on = x1 > camX - halfW - 200 && x0 < camX + halfW + 200
        && Y_SOUTH + 200 > camY - halfH && Y_NORTH - 200 < camY + halfH
      if (on !== shown) { shown = on; view.visible = on }
      if (!on) return
      // Brighter after dark; still there by day.
      const base = 0.28 + 0.4 * dark
      const phase = (t % PERIOD_S) / CHASE_S
      for (const l of lamps) {
        // The pulse: a short bump travelling from the south end to the north.
        const d = phase - l.u
        const pulse = d > 0 && d < 0.22 ? Math.sin((d / 0.22) * Math.PI) : 0
        const a = Math.min(1, base + pulse * (0.55 + 0.3 * dark))
        const s = 1 + pulse * 0.5
        // Round on the water: the world is squashed on y, so the sprite is
        // stood back up by 1/GROUND.
        l.core.alpha = a
        l.core.scale.set(0.34 * s, (0.34 * s) / GROUND)
        l.halo.alpha = a * 0.45
        l.halo.scale.set(1.3 * s, (1.3 * s) / GROUND)
      }
    },
  }
}
