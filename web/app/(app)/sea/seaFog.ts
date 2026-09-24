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
  XFOG_CELL, XFOG_W, XFOG_H, XFOG_X0, XFOG_Y0, XFOG_CELLS, XFOG_CLEAR, XFOG_SOFT,
} from '@/lib/seaExploreExp'

/**
 * ── THE BANK IS DRAWN FINER THAN IT IS REMEMBERED ───────────────────────────
 *
 * The memory is a bit per seven-hundred-pixel cell and the picture of it was
 * one texel per cell, stretched. That was always going to be square-ish: the
 * clearing round the hull is a couple of thousand pixels across, so it fell on
 * two or three texels a side, and the GPU's bilinear blend between so few
 * samples is a rounded square with straight runs between the sample points.
 * "Still splotchy" is that shape, plus the per-cell colour jitter coming out
 * of the stretch as a quilt.
 *
 * So the field is kept at SUB texels per cell for drawing. The part of it
 * near the hull is computed straight from her distance, per texel, every
 * frame, so the front is genuinely round and moves by the pixels she moved.
 * Everywhere else a texel takes its cell's value, which is how a remembered
 * cell, a seeded chapter and the fallback's ease all still show up. The noise
 * stays at cell scale and is looked up, not recomputed, so the extra texels
 * cost a multiply and four byte writes each.
 *
 * FOUR: 175px texels. Two still shows corners on the clearing; eight is
 * 108,000 texels a frame for a difference nobody sees over water.
 */
const SUB = 4
const FW = XFOG_W * SUB
const FH = XFOG_H * SUB
const FCELL = XFOG_CELL / SUB

/** Cover at a world point, the same curve xfogCover applies to a cell centre.
 *  Duplicated rather than imported because that one takes a cell index. */
function coverAt(px: number, py: number, hx: number, hy: number): number {
  const d = Math.hypot(px - hx, py - hy)
  if (d <= XFOG_CLEAR) return 0
  if (d >= XFOG_SOFT) return 1
  const t = (d - XFOG_CLEAR) / (XFOG_SOFT - XFOG_CLEAR)
  return t * t * (3 - 2 * t)
}

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

/**
 * AND HOW MANY DRIFT BEHIND THEM.
 *
 * A second bank, further off and slower. Two layers moving at different rates
 * is the whole of what makes weather read as having depth rather than as one
 * sheet of it — the same parallax the clouds use over the sky.
 */
const FAR_PUFFS = 34

/**
 * ── SMOOTH NOISE, WITHOUT A TEXTURE ─────────────────────────────────────────
 *
 * Value noise on a lattice, bilinear between the corners. Sampled 1,696 times a
 * frame, which is nothing, and it is done in JS rather than as a scrolling
 * texture because the bank is only fifty-three texels wide: a tiling sprite
 * over the top of it would need a mask to stay inside the fog, and this needs
 * nothing at all.
 *
 * WHAT IT BUYS: a fog bank that is not one flat grey field. The interior rolls,
 * slowly, in patches bigger than a cell, and the front thins and thickens as it
 * passes. Without it the shape is exactly right and the surface is dead.
 */
function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  // Smoothstep on the fraction, or the lattice shows as diamonds.
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}
/** Two octaves. Three is not worth the multiply at this scale. */
function fbm(x: number, y: number): number {
  return noise2(x, y) * 0.65 + noise2(x * 2.3 + 5.2, y * 2.3 + 1.3) * 0.35
}

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
  /** `hx,hy` is the HULL in world space, not the camera: the front is cut
   *  round her, and a fight frames the engagement rather than the captain. */
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number, hx: number, hy: number): void
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
  const buf = new Uint8Array(FW * FH * 4)
  const src = new PIXI.BufferImageSource({
    resource: buf,
    width: FW,
    height: FH,
    scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload',
  })
  /** The fine field. Starts fully fogged and ONLY EVER LIFTS, by the same rule
   *  the cell field lives under: the minimum of what it had, its cell, and
   *  the hull's own reach. */
  const fine = new Float32Array(FW * FH).fill(1)
  /** Per-cell roll and jitter, computed once a frame at cell scale and read
   *  by the sixteen texels under each. */
  const cellK = new Float32Array(XFOG_CELLS)
  const cellLift = new Float32Array(XFOG_CELLS)
  const cellN = new Float32Array(XFOG_CELLS)
  for (let i = 0; i < XFOG_CELLS; i++) cellN[i] = ((i * 2654435761) % 17) / 17
  const bank: Sprite = new PIXI.Sprite(new PIXI.Texture({ source: src }))
  bank.position.set(XFOG_X0, XFOG_Y0)
  bank.width = XFOG_W * XFOG_CELL
  bank.height = XFOG_H * XFOG_CELL
  view.addChild(bank)

  // ── THE BOIL, IN TWO LAYERS ───────────────────────────────────────────────
  //
  // FAR first and under: bigger, slower, dimmer, and drawn BEFORE the bank so
  // it reads as the body of the bank rolling rather than as something in front
  // of it. NEAR after and over: smaller, quicker, brighter, the part of the
  // front that is actually breaking up.
  //
  // Two rates is the whole of the depth. One layer of puffs is a fringe; two
  // moving against each other is weather, and it is the same parallax the
  // clouds use over the sky.
  const farLayer: Container = new PIXI.Container()
  view.addChildAt(farLayer, 0)
  const puffLayer: Container = new PIXI.Container()
  view.addChild(puffLayer)
  const puffs: Sprite[] = []
  const far: Sprite[] = []
  /**
   * ── A PUFF DOES NOT TELEPORT ────────────────────────────────────────────
   *
   * Which cell each one is riding, and how far it has faded in. The frontier
   * list is rebuilt on a slow tick and CULLED TO THE CAMERA, so cells drop off
   * its front and back as you sail: assigning puffs by their position in that
   * list handed every one of them a different cell every time it was rebuilt,
   * and a soft blob most of a screen wide reappearing somewhere else is the
   * single most visible thing this layer can do wrong. It is the "and it
   * appears as well" in the report.
   *
   * So a puff keeps its cell. When the cell it wants changes, it fades OUT
   * where it is, and only then takes the new one and fades back in. Nothing
   * ever jumps; the front breathes.
   */
  const cellOf: number[][] = [new Array(PUFFS).fill(-1), new Array(FAR_PUFFS).fill(-1)]
  const fade: number[][] = [new Array(PUFFS).fill(0), new Array(FAR_PUFFS).fill(0)]
  /** For the fades. `advance` is given the clock, not the step. */
  let lastT = -1
  /** When the roll was last computed, and where the hull was at the last
   *  upload: see THE ROLL and UPLOAD THE BANK. */
  let rollAt = -1
  let upX = Infinity, upY = Infinity
  let rolled = false
  for (let i = 0; i < PUFFS; i++) {
    const s: Sprite = new PIXI.Sprite(puffTexture(PIXI))
    s.anchor.set(0.5)
    s.visible = false
    puffLayer.addChild(s)
    puffs.push(s)
  }
  for (let i = 0; i < FAR_PUFFS; i++) {
    const s: Sprite = new PIXI.Sprite(puffTexture(PIXI))
    s.anchor.set(0.5)
    s.visible = false
    farLayer.addChild(s)
    far.push(s)
  }

  /** Frontier cells, rebuilt on a slow cadence rather than every frame: which
   *  cells are on the edge changes when you sail into one, not sixty times a
   *  second. */
  let edge: number[] = []
  /** The same cells as a set, for the puffs: "is my cell still an edge" is a
   *  membership question, and answering it by position in the list is what
   *  made every puff move whenever any cell did. */
  const edgeSet = new Set<number>()
  /** Cells a puff is already riding, per layer, so two never take the same one. */
  const claimed: Set<number>[] = [new Set(), new Set()]
  let edgeAt = -1

  let tint = 0xffffff

  return {
    view,

    bind(a) { alpha = a },

    advance(camX, camY, halfW, halfH, t, hx, hy) {
      if (!alpha) return
      // ── NOTHING TO DO WHEN THE BANK IS OFF SCREEN ────────────────────────
      // The fishing sea, the harbour, anywhere the view does not touch the
      // fogged campaign: all of the below ran there every frame (27k sines,
      // 27k texels, a 108KB upload) for a texture nobody could see.
      const m = XFOG_CELL * 2
      if (camX + halfW < XFOG_X0 - m || camX - halfW > XFOG_X0 + XFOG_W * XFOG_CELL + m
        || camY + halfH < XFOG_Y0 - m || camY - halfH > XFOG_Y0 + XFOG_H * XFOG_CELL + m) {
        upX = Infinity
        return
      }

      // ── THE ROLL, AT CELL SCALE ──────────────────────────────────────────
      //
      // TWO DRIFTS AT TWO RATES, so the interior never settles into a pattern.
      // Slow: this is a bank a mile across, not steam off a cup. Computed once
      // per cell (1,696 of them) and read by the texels under it: the noise is
      // the expensive part and it has no business being finer than a cell,
      // because a patch of thick fog is bigger than a cell, not smaller.
      // TEN TIMES A SECOND. The roll moves 0.035 lattice units a second; a
      // frame of it is invisible, and it was 1,696 cells of noise per frame.
      rolled = t - rollAt >= 0.1 || rollAt < 0
      const ax = t * 0.035, ay = t * 0.021
      const bx = -t * 0.017, by = t * 0.012
      if (rolled) rollAt = t
      if (rolled) for (let i = 0; i < XFOG_CELLS; i++) {
        if (alpha[i] <= 0) { cellK[i] = 0; continue }
        const cx = i % XFOG_W, cy = (i / XFOG_W) | 0
        // AND THE ROLL. Lattice a third of a cell, so a patch of thick is
        // several cells across and survives the upscale as a shape rather than
        // as noise. 0.78..1 rather than 0..1: fog thins, it does not vanish.
        const roll = 0.78 + 0.22 * (
          fbm(cx * 0.34 + ax, cy * 0.34 + ay) * 0.6
          + fbm(cx * 0.13 + bx, cy * 0.13 + by) * 0.4)
        cellK[i] = 0.96 * roll
        // Colour is lifted where the fog is thick, so a bank has a lit side
        // rather than being one value with holes in it.
        cellLift[i] = 1 + (roll - 0.89) * 0.5
      }

      // ── THE FRONT, CUT ROUND THE HULL ────────────────────────────────────
      //
      // Only the texels she could be lightening: a window of XFOG_SOFT around
      // her, about 700 texels. Each takes the minimum of what it already had
      // and her reach, so the edge is a circle that moves by whatever she
      // moved this frame, at texel resolution rather than cell resolution.
      const reach = Math.ceil(XFOG_SOFT / FCELL)
      const hcx = Math.floor((hx - XFOG_X0) / FCELL), hcy = Math.floor((hy - XFOG_Y0) / FCELL)
      for (let ty = Math.max(0, hcy - reach); ty <= Math.min(FH - 1, hcy + reach); ty++) {
        const py = XFOG_Y0 + (ty + 0.5) * FCELL
        for (let tx = Math.max(0, hcx - reach); tx <= Math.min(FW - 1, hcx + reach); tx++) {
          const j = ty * FW + tx
          const want = coverAt(XFOG_X0 + (tx + 0.5) * FCELL, py, hx, hy)
          if (want < fine[j]) fine[j] = want
        }
      }

      // ── UPLOAD THE BANK ──────────────────────────────────────────────────
      //
      // Every frame, 27,000 texels: a min, a multiply and four byte writes
      // each, which is still less than the water shader spends on one column.
      // Premultiplied on upload, so the colour is scaled by its own alpha here:
      // an unpremultiplied buffer through a premultiplying source gives dark
      // fringes at the front, which on a fog edge is the one artefact that
      // looks like a bug.
      //
      // A texel can never be foggier than its CELL. That is how a remembered
      // cell, a seeded chapter and the fallback's ease all reach this layer:
      // the cell field only ever lifts, and the texel follows it down.
      // Only when something changed: the roll ticked, or the hull moved a
      // quarter texel (her front is cut at texel resolution).
      const moved = Math.abs(hx - upX) > FCELL * 0.25 || Math.abs(hy - upY) > FCELL * 0.25
      if (rolled || moved) {
      upX = hx; upY = hy
      for (let ty = 0; ty < FH; ty++) {
        const cy = (ty / SUB) | 0
        for (let tx = 0; tx < FW; tx++) {
          const i = cy * XFOG_W + ((tx / SUB) | 0)
          const j = ty * FW + tx
          const ca = alpha[i]
          if (ca < fine[j]) fine[j] = ca
          const a = fine[j]
          const o = j * 4
          if (a <= 0.002) { buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0; buf[o + 3] = 0; continue }
          const k = a * cellK[i]
          const lift = cellLift[i]
          // Jitter is kept, but at a quarter of what it was: at cell scale it
          // was tooth on a wall; stretched, it was the quilt.
          const n = cellN[i] * 0.25
          buf[o] = (PAPER.r + n * 7) * k * lift
          buf[o + 1] = (PAPER.g + n * 8) * k * lift
          buf[o + 2] = (PAPER.b + n * 9) * k * lift
          buf[o + 3] = 255 * k
        }
      }
      src.update()
      }

      // ── AND THE EDGE THAT MOVES ──────────────────────────────────────────
      //
      // A cell is FRONTIER if it is fogged and at least one neighbour is not.
      // That is the line the puffs ride: fog in open water needs no detail
      // because there is nothing to compare it against, and the interior is
      // solid anyway.
      if (t - edgeAt > 0.4) {
        edgeAt = t
        edge = []
        edgeSet.clear()
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
          edgeSet.add(i)
        }
      }

      // ── AND THE TWO LAYERS THAT RIDE IT ──────────────────────────────────
      //
      // `k` is what separates them: the far bank moves at two thirds the rate,
      // is half again as big and half as bright. Everything else is the same
      // arithmetic, because they are the same object at two distances.
      const a0 = alpha
      const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT))
      lastT = t
      const ride = (pool: Sprite[], rate: number, size: number, lit: number, seed: number) => {
        const held = cellOf[seed], fd = fade[seed], mine = claimed[seed]
        // ── A PUFF KEEPS ITS CELL UNTIL THE CELL STOPS BEING AN EDGE ─────
        //
        // This is the whole of "it pops in and out". Puffs used to be dealt
        // cells by their index into the frontier list, and that list is
        // rebuilt as you sail: one cell joining at the front shifted every
        // puff's slot by one, and every one of them faded out and came back
        // somewhere else. Nothing teleported any more; everything churned.
        //
        // Now the only question a puff asks is whether the cell it is on is
        // still frontier and still on screen. While it is, it stays. When it
        // is not, it fades out where it is and only then takes the nearest
        // unclaimed edge cell, so the front gains and loses puffs one at a
        // time at the places that actually changed.
        for (let p = 0; p < pool.length; p++) {
          const s = pool[p]
          const cur = held[p]
          const keep = cur >= 0 && edgeSet.has(cur)
          if (keep) {
            fd[p] = Math.min(1, fd[p] + dt * 1.1)
          } else {
            fd[p] -= dt * 1.6
            if (fd[p] <= 0) {
              fd[p] = 0
              if (cur >= 0) { mine.delete(cur); held[p] = -1 }
              // The nearest unclaimed edge cell to where it faded, or to the
              // camera when it has never been anywhere. Neither layer takes a
              // cell the other is on: a far puff exactly behind a near one is
              // a brighter puff, not a deeper bank.
              let best = -1, bestD = Infinity
              const fx = cur >= 0 ? XFOG_X0 + ((cur % XFOG_W) + 0.5) * XFOG_CELL : camX
              const fy = cur >= 0 ? XFOG_Y0 + (((cur / XFOG_W) | 0) + 0.5) * XFOG_CELL : camY
              for (let e = 0; e < edge.length; e++) {
                const c = edge[e]
                if (mine.has(c) || claimed[1 - seed].has(c)) continue
                const ex = XFOG_X0 + ((c % XFOG_W) + 0.5) * XFOG_CELL - fx
                const ey = XFOG_Y0 + (((c / XFOG_W) | 0) + 0.5) * XFOG_CELL - fy
                const d = ex * ex + ey * ey
                if (d < bestD) { bestD = d; best = c }
              }
              if (best >= 0) { held[p] = best; mine.add(best) }
            }
          }
          const i = held[p]
          if (i < 0 || fd[p] <= 0) { s.visible = false; continue }
          const cx = i % XFOG_W, cy = (i / XFOG_W) | 0
          // ── AND IT SITS ON THE FOG'S SIDE OF THE LINE ──────────────────
          //
          // A puff is two and a half cells across and it was centred on a
          // frontier cell, so most of a thousand pixels of it hung over water
          // that had already been cleared: fog lying on open sea, wandering
          // about as it drifted. Pushed back up the alpha gradient — which
          // points into the bank — it hugs the front from the fogged side,
          // which is where a fog bank's own edge actually is.
          const gx = (cx < XFOG_W - 1 ? a0[i + 1] : a0[i]) - (cx > 0 ? a0[i - 1] : a0[i])
          const gy = (cy < XFOG_H - 1 ? a0[i + XFOG_W] : a0[i]) - (cy > 0 ? a0[i - XFOG_W] : a0[i])
          const gl = Math.hypot(gx, gy) || 1
          const bias = XFOG_CELL * 0.55
          // Two irrational-ish rates per puff so no two are ever in step and
          // the pattern never closes. Seeded off the CELL, not the pool slot,
          // so a puff does not jump phase when the frontier is rebuilt under it.
          const ph = (i % 97) * 0.647 + seed * 1.9
          const drift = Math.sin(t * 0.21 * rate + ph) * XFOG_CELL * 0.42
          const sway = Math.cos(t * 0.17 * rate + ph * 1.3) * XFOG_CELL * 0.34
          s.visible = true
          s.position.set(
            XFOG_X0 + (cx + 0.5) * XFOG_CELL + drift + (gx / gl) * bias,
            XFOG_Y0 + (cy + 0.5) * XFOG_CELL + sway + (gy / gl) * bias,
          )
          // Breathing, and never quite the same size twice.
          const grow = 1 + Math.sin(t * 0.13 * rate + ph * 0.7) * 0.16
          const w = XFOG_CELL * size * grow
          s.width = w
          // Squashed onto the plane like every other flat thing out here: fog
          // lies ON the water, and a round puff would be standing up out of it.
          s.height = w * 0.58
          // TURNING, slowly. A blob that only slides is a blob; one that also
          // rotates has an inside. It is a radial gradient so the rotation is
          // invisible on its own — what it does is stop the OVERLAP of two
          // puffs from being a fixed shape.
          s.rotation = ph + t * 0.04 * rate
          s.alpha = a0[i] * lit * fd[p] * (1 + Math.sin(t * 0.19 * rate + ph * 1.7) * 0.3)
          s.tint = tint
        }
      }
      // A touch smaller than they were. Sitting on the fog's side of the front
      // rather than astride it, a puff no longer needs to be wide enough to
      // cover the line it was centred on.
      ride(puffs, 1, 2.1, 0.5, 0)
      ride(far, 0.62, 3.0, 0.26, 1)
    },

    night(t) {
      tint = t
      bank.tint = t
    },

    destroy() { view.destroy({ children: true }) },
  }
}
