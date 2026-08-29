// ── WHAT IS BUILT ON THE ISLANDS ────────────────────────────────────────────
//
// The last large thing standing in the DOM inside the world layer, and the one
// with the most to lose by staying there.
//
// ── WHY IT HAD TO MOVE ──────────────────────────────────────────────────────
//
// Not cost, though the cost is real: every building is a composited element
// carrying an animated `filter`, and there are dozens across the chart. The
// reason is AGREEMENT. The islands are on the canvas and the buildings standing
// on them were not, so two different renderers were being handed the same
// camera and asked to land on the same pixel every frame. SeaIslandsGPU carries
// a long note about that being the one thing that must not drift, and it is
// only true for as long as nobody makes a mistake. A tavern that shares a
// display list with the island it stands on cannot slide off it.
//
// ── THE TRANSFORM IS THE WHOLE JOB ──────────────────────────────────────────
//
// A building is placed as a percentage of its ISLAND'S BOX — a square of the
// island's diameter, centred on the island — and then:
//
//   translate(-50%, -100%)   anchored at its FEET, so it grows upward out of
//                            the ground rather than out of its own middle
//   scaleY(1 / GROUND)       counter-squash, so it STANDS UP off a plane that
//                            is otherwise foreshortened
//   transform-origin: bottom center
//
// All three say the same thing: a building has height, and the ground does not.
// The anchor lands at the feet, the y scale undoes the plane, and the paint
// order runs back to front so a house further down the island overlaps the one
// behind it the way a hillside town does.
//
// ── AND THE TOWN LIGHTS UP ──────────────────────────────────────────────────
//
// The hour takes the whole world down. This is the one thing that comes UP, and
// it is what turns a dimmer into nightfall: a warm pool over the buildings that
// is nothing at noon and full by the middle of the night. It sits UNDER them on
// purpose — light painted over a building washes the art out; behind it, it
// reads as windows throwing light onto the ground they stand on.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { texture } from './skiffArt'

export type GpuBuilding = {
  /** Percent of the island's box. */
  x: number
  y: number
  /** Fraction of the island's DIAMETER. */
  scale: number
  art: string
}

export type GpuTown = {
  id: string
  x: number
  y: number
  r: number
  locked: boolean
  buildings: GpuBuilding[]
}

/** A dark, desaturated grey for a place you cannot land at yet. The DOM says
 *  `grayscale(0.9) brightness(0.5)`; a tint cannot desaturate, so this is the
 *  brightness half of it and the closest a multiply gets to the rest. If a
 *  locked island ever needs to read as properly colourless it wants a shader,
 *  not a darker number here. */
const LOCKED = 0x4a4a52

/** Harbour-window amber, and the alphas the DOM pitched for what survives the
 *  night grade. Nothing survives a grade here — the tint IS the grade — so
 *  these are what they look like. */
const GLOW = 0xffb060

let glowTex: Texture | null = null

function glowTexture(PIXI: typeof import('pixi.js')): Texture {
  if (glowTex) return glowTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.66)')
  grad.addColorStop(0.42, 'rgba(255,255,255,0.32)')
  grad.addColorStop(0.72, 'rgba(255,255,255,0)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  glowTex = PIXI.Texture.from(c)
  return glowTex
}

type Built = {
  spec: GpuTown
  node: Container
  sprites: Sprite[]
  glow: Sprite | null
}

export type Towns = {
  view: Container
  /** The hour: a tint for the buildings, and how far up the town's own lights
   *  have come. */
  night(tint: number, dark: number): void
  /** Hide whatever is not on screen. A town off the edge of the view costs
   *  nothing to have, which is most of the point of moving it here. */
  cull(camX: number, camY: number, halfW: number, halfH: number): void
  destroy(): void
}

export async function makeTowns(
  PIXI: typeof import('pixi.js'),
  towns: GpuTown[],
): Promise<Towns> {
  const view: Container = new PIXI.Container()
  const built: Built[] = []

  for (const spec of towns) {
    const node: Container = new PIXI.Container()
    node.position.set(spec.x, spec.y)
    view.addChild(node)

    const d = spec.r * 2
    let glow: Sprite | null = null

    // UNDER THE BUILDINGS, and added first for exactly that reason.
    if (spec.buildings.length) {
      const s: Sprite = new PIXI.Sprite(glowTexture(PIXI))
      s.anchor.set(0.5)
      // 78% by 52% of the box, centred a little below the middle — the same
      // ellipse the DOM draws, and left lying ON the plane rather than
      // counter-squashed, because it is light on the ground.
      s.width = d * 0.78
      s.height = d * 0.52
      s.y = -spec.r + d * 0.52
      s.tint = GLOW
      s.alpha = 0
      s.blendMode = 'add'
      node.addChild(s)
      glow = s
    }

    const sprites: Sprite[] = []
    // BACK TO FRONT, in the order the chart lists them. Paint order is the
    // display list's order here, exactly as it was document order before, so
    // the two renderers agree without anybody sorting anything.
    for (const b of spec.buildings) {
      let tex: Texture
      try {
        tex = await texture(PIXI, b.art)
      } catch {
        // One building that will not decode must not cost the island.
        continue
      }
      const s: Sprite = new PIXI.Sprite(tex)
      // At its FEET.
      s.anchor.set(0.5, 1)
      const w = d * b.scale
      const k = w / tex.width
      // Counter-squashed on y so it stands up off the plane.
      s.scale.set(k, k / GROUND)
      // The percentage is of the island's BOX, whose top-left is one radius up
      // and to the left of the island's centre — which is where this node is.
      s.position.set(-spec.r + (b.x / 100) * d, -spec.r + (b.y / 100) * d)
      s.tint = spec.locked ? LOCKED : 0xffffff
      node.addChild(s)
      sprites.push(s)
    }

    built.push({ spec, node, sprites, glow })
  }

  return {
    view,

    night(tint, dark) {
      for (const b of built) {
        if (!b.spec.locked) for (const s of b.sprites) s.tint = tint
        // Nothing at noon, full by the middle of the night.
        if (b.glow) b.glow.alpha = dark
      }
    },

    cull(camX, camY, halfW, halfH) {
      for (const b of built) {
        // Generous on y: a building is anchored at its feet and stands well
        // above them, so culling on the island's centre alone pops the tall
        // ones at the top of the screen.
        b.node.visible = Math.abs(b.spec.x - camX) < halfW + b.spec.r * 1.5
          && Math.abs(b.spec.y - camY) < halfH + b.spec.r * 3
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
