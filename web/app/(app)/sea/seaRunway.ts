// ── THE CHANNEL MARKERS THROUGH THE REEF ────────────────────────────────────
//
// Kong: lights along the corridor between expeditions and fishing, so it reads
// as an entrance you pass through. The first cut was two rows of flat glowing
// dots with a pulse chasing up them: too flashy, and flat on a 2.5D sea whose
// entrance is standing rock.
//
// So they are OBJECTS now: painted timber pilings with a brass lantern hung off
// each (`/sea/channel-post.png`, the house style), and only FOUR of them, a
// pair either side of the gap where the reef line is (Kong: not a runway, just
// a few lamps at the border). Stood up like everything else that stands on this chart:
// the world is squashed by GROUND, so each post is scaled back up by 1/GROUND
// and anchored at its foot. The lanterns burn steadily, with a slow, slight
// flicker each on its own phase, and a small warm pool on the water under each
// after dark. No chase, no flashing.
//
// Four posts in one container. Nothing is created per frame, and the whole
// thing is skipped while the passage is off screen.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GATE_X, GATE_HALF, NORTH_WALL } from './chart'
import { GROUND } from './islandArt'

const ART = '/sea/channel-post.png'
/** The band they stand in, for the off-screen skip. */
const Y_SOUTH = NORTH_WALL + 400
const Y_NORTH = NORTH_WALL - 500
/** The two rows of the border pair, either side of the reef line, and how
 *  far in from the rock they stand. */
const BORDER_NORTH = NORTH_WALL - 300
const BORDER_SOUTH = NORTH_WALL + 170
const INSET = 80
/** The post's drawn height in world pixels (the boat is 210 across). */
const POST_H = 170
/** Where the lantern hangs on the art, as fractions of its box. */
const LAMP_U = 0.68, LAMP_V = 0.22

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
  grd.addColorStop(0, 'rgba(255,214,150,0.9)')
  grd.addColorStop(0.35, 'rgba(255,176,90,0.35)')
  grd.addColorStop(1, 'rgba(255,150,60,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, S, S)
  return PIXI.Texture.from(c)
}

export function makeRunway(PIXI: typeof import('pixi.js')): Runway {
  const view: Container = new PIXI.Container()
  const glow = glowTexture(PIXI)
  type Post = { post: Sprite | null; halo: Sprite; pool: Sprite; x: number; y: number; phase: number }
  const posts: Post[] = []
  // A FEW, AT THE BORDER (Kong: not a runway, just a few lamps where the
  // border is). A pair either side of the gap, one just inside each shore of
  // the reef line, so the crossing itself is what is lit. North first, so the
  // nearer (southern) posts draw over the farther ones.
  const spots: { x: number; y: number }[] = []
  for (const y of [BORDER_NORTH, BORDER_SOUTH]) {
    for (const side of [-1, 1]) spots.push({ x: GATE_X + side * (GATE_HALF - INSET), y })
  }
  spots.forEach((p, k) => {
    // The pool of lamplight on the water: flat, so it lies on the plane.
    const pool = new PIXI.Sprite(glow)
    pool.anchor.set(0.5)
    pool.blendMode = 'add'
    pool.position.set(p.x, p.y)
    pool.scale.set(2.2, 2.2)
    const halo = new PIXI.Sprite(glow)
    halo.anchor.set(0.5)
    halo.blendMode = 'add'
    view.addChild(pool)
    posts.push({ post: null, halo, pool, x: p.x, y: p.y, phase: k * 1.37 })
  })
  // The posts arrive with their art; the pools and halos wait for them.
  void PIXI.Assets.load<Texture>(ART).then(tex => {
    if (view.destroyed) return
    const w = POST_H * (tex.width / tex.height)
    for (const p of posts) {
      const s = new PIXI.Sprite(tex)
      s.anchor.set(0.5, 0.96)
      s.position.set(p.x, p.y)
      s.width = w
      s.height = POST_H / GROUND
      view.addChild(s)
      // The halo round the lantern: world y is squashed, so the lantern's
      // height on the art is divided back out.
      p.halo.position.set(p.x + (LAMP_U - 0.5) * w, p.y - (0.96 - LAMP_V) * POST_H / GROUND)
      p.halo.scale.set(0.9, 0.9 / GROUND)
      view.addChild(p.halo)
      p.post = s
    }
  }).catch(() => {})

  const x0 = GATE_X - GATE_HALF, x1 = GATE_X + GATE_HALF
  let shown = true
  return {
    view,
    advance(t, camX, camY, halfW, halfH, dark) {
      const on = x1 > camX - halfW - 300 && x0 < camX + halfW + 300
        && Y_SOUTH + 300 > camY - halfH && Y_NORTH - 400 < camY + halfH
      if (on !== shown) { shown = on; view.visible = on }
      if (!on) return
      for (const p of posts) {
        // A lantern, not a sign: steady, with a slow slight flicker.
        const f = 1 + 0.06 * Math.sin(t * 2.3 + p.phase) + 0.03 * Math.sin(t * 5.1 + p.phase * 2)
        p.halo.alpha = (0.18 + 0.5 * dark) * f
        p.pool.alpha = (0.02 + 0.3 * dark) * f
      }
    },
  }
}
