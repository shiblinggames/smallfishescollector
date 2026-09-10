// ── GRASS THAT IS GRASS, AND THAT MOVES ─────────────────────────────────────
//
// The islands' green was a gradient band with a texture laid over it. It reads
// as a colour, not as a surface, and it is the last thing on the water that is
// completely still — the sea swells, the surf breaks, the fog rolls, the smoke
// lifts off the chimneys, and the meadow they all sit around does not move a
// pixel.
//
// This is a few thousand TUFTS per island, in one mesh, bending in a wind that
// crosses the whole chart.
//
// ── AND NOT ONE LINE OF GLSL ────────────────────────────────────────────────
//
// The obvious build is a vertex shader: hand the GPU a tuft per instance and
// bend it in the vertex stage. shoreFoam next door is the argument against, and
// it is worth reading before anyone "improves" this — two attempts at the surf
// were shader work, both of them drew foam in the middle of the open ocean, and
// the note in that file says plainly that hand-written shader plumbing is what
// broke them. It scrolls a UV buffer on the CPU instead and has never been
// wrong since.
//
// So: the same trick. The top two vertices of every tuft are rewritten each
// frame and the buffer is uploaded, which is what `advance` does.
//
// ── THE WIND IS A FIELD, NOT A PER-TUFT SUM ─────────────────────────────────
//
// The naive version gives every tuft its own sine of its own position and time.
// That is a sine per tuft per frame — call it ten thousand a frame with four
// islands on screen — and worse, it is the arithmetic in the wrong place: what
// you want is not ten thousand independent wobbles but ONE wind, crossing the
// water, that everything standing in it leans away from together. Grass that
// each blade decides for itself reads as static, not as weather.
//
// So the wind is a small table, sampled along the prevailing bearing, rebuilt
// once a frame — a couple of hundred sines total, however many tufts are on
// screen. A tuft's index into it is fixed at build time (it is a projection of
// where the tuft stands, and the tuft does not move), so the whole per-frame
// cost per tuft is two array reads and two float writes. The gust travels
// because the TABLE travels.
//
// Two tables at different wavelengths, read at different indices, because one
// is a wave and two is weather. The long one is the gust front crossing the
// island; the short one is the chop on top of it, and it is what stops a
// hillside from moving like a single sheet.

import { GRASS, BUILDABLE } from '@/lib/islandShape'

/** The prevailing wind, as seaWater has it. Same bearing, so the grass leans
 *  the way the swell runs and the two agree about the weather. */
const WIND_X = 0.8231
const WIND_Y = 0.5679

/** A tuft, in screen pixels. Fixed rather than a share of the island: grass is
 *  grass, and a 1000px island does not grow bigger grass than a 420px one. */
// WIDE AND LOW. The first cut was 11 by 14 — taller than it was wide, with
// seven thin blades in it — and at chart size that is a reed, not a tuft. A
// meadow of them read as marsh grass scattered on a lawn. A clump is wider than
// it is tall, and covering the ground is most of what makes grass read as
// grass rather than as decoration standing on it.
const TUFT_W = 15
const TUFT_H = 9
/** How much of its own height a tuft's tip travels at full gust. Past about a
 *  third it stops reading as bending and starts reading as sliding. */
const BEND = 0.34

/** Roughly how far apart tufts stand. Straight into the count, squared. */
const SPACING = 11
/** However big the island, this many at the most. */
const MAX_TUFTS = 1800

/** The wind tables: entries, and the world distance each one spans. */
const FIELD = 128
const LONG_WAVE = 940
const SHORT_WAVE = 310

export type Grass = {
  mesh: import('pixi.js').Mesh<import('pixi.js').MeshGeometry>
  /** Leans everything into the wind at `time`. Called once a frame. */
  advance(time: number): void
  destroy(): void
}

/** The atlas: this many different tufts, laid out in a grid. */
export const TUFT_COLS = 4
export const TUFT_ROWS = 2
export const TUFT_KINDS = TUFT_COLS * TUFT_ROWS

/**
 * ── EIGHT TUFTS, NOT ONE ────────────────────────────────────────────────────
 *
 * The first plate was a single tuft, and a meadow was that one picture stamped
 * fourteen hundred times. Worse, it was stamped in ONE COLOUR: a MeshSimple
 * carries position and UV and nothing else, so a single mesh tint means every
 * blade of grass on an island is pixel-identical to every other. That is not a
 * field, it is a wallpaper, and no amount of reshaping one tuft fixes it —
 * because the fault was never the tuft, it was that there is only one.
 *
 * UVs are the one per-quad channel a MeshSimple has, so the variety has to live
 * in the texture and be SELECTED by them. Eight cells, and each tuft picks one.
 *
 * They differ in three ways on purpose, because differing in one is still a
 * pattern:
 *
 *   SHAPE — seven blades to fourteen, narrow and upright through wide and
 *   spilling, so a clump can be a spray or a mat.
 *
 *   HEIGHT — some barely clear the ground. A meadow that is all one height is
 *   mown, and the short ones are what make the tall ones read as tall.
 *
 *   AND TONE — each cell is drawn at its own brightness, from a little over
 *   half up to full. The mesh tint MULTIPLIES, so a dim cell comes out as a
 *   darker green of the same family: the per-tuft colour variation that the
 *   vertex format cannot carry, smuggled in through the one channel it can.
 *
 * Greyscale still, so an island's palette decides what green it all is.
 */
export function makeGrassTexture(PIXI: typeof import('pixi.js')) {
  const CELL = 64
  const cv = document.createElement('canvas')
  cv.width = CELL * TUFT_COLS
  cv.height = CELL * TUFT_ROWS
  const g = cv.getContext('2d')!

  // A cheap fixed hash, so the plate is the same every session.
  let h = 0x9e3779b1
  const rnd = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x165667b1) >>> 0
    return (h % 10000) / 10000
  }

  for (let cell = 0; cell < TUFT_KINDS; cell++) {
    const ox = (cell % TUFT_COLS) * CELL
    const oy = Math.floor(cell / TUFT_COLS) * CELL

    // Every cell its own build. Spread deliberately rather than randomly: eight
    // rolls of the same dice would land on eight similar tufts about as often
    // as not, and this is the one thing that must not happen here.
    const t = cell / (TUFT_KINDS - 1)
    const blades = 7 + Math.round(rnd() * 7)
    const spread = 0.52 + t * 0.5 + (rnd() - 0.5) * 0.12
    const tall = 0.34 + (1 - t) * 0.46 + rnd() * 0.24
    const tone = 0.56 + ((cell * 5) % TUFT_KINDS) / (TUFT_KINDS - 1) * 0.44

    for (let i = 0; i < blades; i++) {
      const rootX = ox + CELL * (0.5 + (i / Math.max(1, blades - 1) - 0.5) * spread
        + (rnd() - 0.5) * 0.05)
      const height = CELL * tall * (0.62 + rnd() * 0.62)
      // Leaning outward from the middle of the clump, and clamped inside the
      // cell: a blade that crosses into its neighbour's square would be sampled
      // by whichever tuft draws that cell, which is a stray leaf appearing in
      // the middle of an unrelated clump.
      const lean = ((rootX - ox) / CELL - 0.5) * CELL * 0.9 + (rnd() - 0.5) * CELL * 0.14
      const half = CELL * (0.032 + rnd() * 0.028)
      const tipX = Math.max(ox + 3, Math.min(ox + CELL - 3, rootX + lean))
      const tipY = oy + CELL - height

      const grad = g.createLinearGradient(0, oy + CELL, 0, tipY)
      const root = (0.40 + rnd() * 0.14) * tone
      grad.addColorStop(0, `rgba(255,255,255,${root.toFixed(3)})`)
      grad.addColorStop(0.55, `rgba(255,255,255,${(0.84 * tone).toFixed(3)})`)
      grad.addColorStop(1, `rgba(255,255,255,${tone.toFixed(3)})`)
      g.fillStyle = grad
      g.beginPath()
      g.moveTo(rootX - half, oy + CELL)
      g.quadraticCurveTo(rootX - half * 0.7 + lean * 0.35, oy + CELL - height * 0.55, tipX, tipY)
      g.quadraticCurveTo(rootX + half * 0.7 + lean * 0.35, oy + CELL - height * 0.55, rootX + half, oy + CELL)
      g.closePath()
      g.fill()
    }
  }

  const source = new PIXI.CanvasSource({ resource: cv })
  source.scaleMode = 'linear'
  return new PIXI.Texture({ source })
}

/** Value noise on a lattice, for clumping. Grass grows in patches; scatter that
 *  is evenly random over an area reads as a stipple, which is a texture, which
 *  is what this exists to stop being. */
function clump(x: number, y: number, seed: number): number {
  const hash = (i: number, j: number) => {
    let n = Math.imul(i * 374761393 + j * 668265263 + seed, 1274126177)
    n = (n ^ (n >>> 13)) >>> 0
    return (n % 1000) / 1000
  }
  const i = Math.floor(x), j = Math.floor(y)
  const fx = x - i, fy = y - j
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), e = hash(i + 1, j + 1)
  return (a + (b - a) * sx) + ((c + (e - c) * sy) - (a + (b - a) * sx)) * sy
}

/**
 * A meadow for one island.
 *
 * `rs` is that island's 160 coastline radii in percent of its box, `d` the box,
 * and `liftOf` gives the top face's height above the plane at a bearing — the
 * tufts stand ON the raised face, not on the water plane, or they sink into the
 * cliff exactly the way the buildings used to.
 *
 * `tint` is the island's own green. See grassTint in islandArt.
 */
export function makeGrass(
  PIXI: typeof import('pixi.js'),
  rs: number[],
  d: number,
  tint: number,
  texture: import('pixi.js').Texture,
  liftOf: (angle: number) => number,
  seed: number,
): Grass | null {
  const n = rs.length
  const meanR = (rs.reduce((t, r) => t + r, 0) / n / 100) * d
  const green = meanR * GRASS
  const area = Math.PI * green * green
  const want = Math.min(MAX_TUFTS, Math.round(area / (SPACING * SPACING)))
  if (want < 24) return null

  let meanLift = 0
  for (let i = 0; i < n; i++) meanLift += liftOf((Math.PI * 2 * i) / n)
  meanLift /= n

  let h = (seed ^ 0x2545f491) >>> 0
  const rnd = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x165667b1) >>> 0
    return (h % 100000) / 100000
  }

  type Tuft = {
    x: number; y: number; hw: number; ht: number
    kL: number; kS: number; sway: number
    /** Which of the eight it is, and whether it is mirrored. */
    cell: number; flip: boolean
    /** A standing lean, so a clump is not perfectly upright before the wind
     *  touches it. Carried here because `advance` rewrites the tips. */
    tilt: number
  }
  const tufts: Tuft[] = []

  // Rejection sampling over the box. Cheaper than it sounds — the grass fills
  // most of the disc — and it is the only way to honour a coastline that is not
  // a circle without building a polygon rasteriser.
  const reach = meanR * BUILDABLE
  for (let tries = 0; tries < want * 6 && tufts.length < want; tries++) {
    const px = (rnd() * 2 - 1) * reach
    const py = (rnd() * 2 - 1) * reach
    const r = Math.hypot(px, py)
    if (r < 1) continue
    const a = Math.atan2(py, px)
    const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * n) % n
    const coast = (rs[i] / 100) * d
    const edgeGreen = coast * GRASS
    const edgeScrub = coast * BUILDABLE
    if (r > edgeScrub) continue

    // Thins out through the scrub and stops before the sand. A hard edge on a
    // meadow is a lawn.
    const thin = r <= edgeGreen ? 1 : 1 - (r - edgeGreen) / Math.max(1, edgeScrub - edgeGreen)
    // And clumps, at roughly one patch per five tufts.
    const patch = clump(px / (SPACING * 5), py / (SPACING * 5), seed)
    if (rnd() > thin * thin * (0.35 + patch * 0.9)) continue

    // ON THE RAISED FACE. At the coast that is this bearing's own lift; toward
    // the middle every bearing meets, so it settles to the mean. Without this
    // the grass grows on the water plane and the cliff stands in front of it.
    const lift = meanLift + (liftOf(a) - meanLift) * Math.min(1, r / Math.max(1, edgeGreen))

    const scale = 0.78 + rnd() * 0.5
    tufts.push({
      x: px,
      y: py - lift,
      hw: (TUFT_W * scale) / 2,
      ht: TUFT_H * scale,
      // Where this tuft stands along the wind, as a table index. Fixed: the
      // gust travels because the table travels, not because the tuft moves.
      kL: Math.floor(((px * WIND_X + py * WIND_Y) / LONG_WAVE) * FIELD),
      kS: Math.floor(((px * WIND_X + py * WIND_Y) / SHORT_WAVE) * FIELD),
      sway: 0.7 + rnd() * 0.6,
      cell: Math.floor(rnd() * TUFT_KINDS) % TUFT_KINDS,
      // Mirrored on half of them, which doubles eight tufts into sixteen for
      // the price of swapping two numbers.
      flip: rnd() < 0.5,
      // AND NOT ALL UPRIGHT. Grass that has grown in a prevailing wind leans
      // before the wind gets to it, and a field of perfectly vertical clumps is
      // the other half of what reads as stamped.
      tilt: (rnd() - 0.5) * TUFT_H * 0.42,
    })
  }
  if (tufts.length < 24) return null

  // PAINTER'S ORDER, the same rule the rocks and the marks follow: a tuft whose
  // root is further south stands in front. One mesh draws in index order, so
  // this is the only chance to say so.
  tufts.sort((p, q) => p.y - q.y)

  const count = tufts.length
  const verts = new Float32Array(count * 8)
  const uvs = new Float32Array(count * 8)
  const idx = new Uint32Array(count * 6)
  for (let t = 0; t < count; t++) {
    const { x, y, hw, ht } = tufts[t]
    const v = t * 8
    verts[v] = x - hw; verts[v + 1] = y            // root left
    verts[v + 2] = x + hw; verts[v + 3] = y        // root right
    verts[v + 4] = x + hw; verts[v + 5] = y - ht   // tip right
    verts[v + 6] = x - hw; verts[v + 7] = y - ht   // tip left
    // THE CELL, AND THE MIRROR. Half a texel in from each edge: at linear
    // filtering a UV sitting exactly on a cell boundary samples its neighbour,
    // which puts a sliver of the next tuft down the side of this one.
    const cx = tufts[t].cell % TUFT_COLS, cy = Math.floor(tufts[t].cell / TUFT_COLS)
    const inset = 0.5 / (64 * TUFT_COLS)
    let u0 = cx / TUFT_COLS + inset, u1 = (cx + 1) / TUFT_COLS - inset
    if (tufts[t].flip) { const sw = u0; u0 = u1; u1 = sw }
    const v0 = cy / TUFT_ROWS + inset, v1 = (cy + 1) / TUFT_ROWS - inset
    uvs[v] = u0; uvs[v + 1] = v1
    uvs[v + 2] = u1; uvs[v + 3] = v1
    uvs[v + 4] = u1; uvs[v + 5] = v0
    uvs[v + 6] = u0; uvs[v + 7] = v0
    const b = t * 4, e = t * 6
    idx[e] = b; idx[e + 1] = b + 1; idx[e + 2] = b + 2
    idx[e + 3] = b; idx[e + 4] = b + 2; idx[e + 5] = b + 3
  }

  const mesh = new PIXI.MeshSimple({ texture, vertices: verts, uvs, indices: idx })
  mesh.tint = tint
  // ── AND IT DOES NOT RE-UPLOAD ITSELF ─────────────────────────────
  //
  // MeshSimple sets `autoUpdate = true` in its constructor and hangs an
  // onRender off it that calls `getBuffer('aPosition').update()` EVERY FRAME —
  // which marks the whole vertex buffer dirty and ships it to the GPU again,
  // for every meadow that renders, whether or not anything in it moved.
  //
  // That is eleven thousand floats per island per frame, against the surf's few
  // hundred, which is why shoreFoam gets away with leaving it on and this does
  // not. The cull below decides when a meadow's grass actually moves; this
  // stops the renderer from overruling it.
  mesh.autoUpdate = false

  const buf = mesh.geometry.getBuffer('aPosition')
  const long = new Float32Array(FIELD)
  const short = new Float32Array(FIELD)

  return {
    mesh,
    advance(time) {
      // ── THE WIND, ONCE, FOR EVERY TUFT ON THIS ISLAND ──────────
      //
      // Periodic in the index so a tuft reading `k % FIELD` sees a continuous
      // travelling wave and not a seam. 256 sines whatever the tuft count.
      for (let k = 0; k < FIELD; k++) {
        const p = (Math.PI * 2 * k) / FIELD
        long[k] = Math.sin(p - time * 1.15)
        short[k] = Math.sin(p - time * 2.7)
      }
      // A gust that comes and goes. Grass in a steady wind is a flag.
      const gust = 0.55 + 0.45 * Math.sin(time * 0.37) * Math.sin(time * 0.21 + 1.7)

      const data = buf.data as Float32Array
      for (let t = 0; t < count; t++) {
        const tu = tufts[t]
        const w = long[((tu.kL % FIELD) + FIELD) % FIELD]
          + short[((tu.kS % FIELD) + FIELD) % FIELD] * 0.38
        const bend = tu.tilt + w * tu.sway * gust * BEND * tu.ht
        const v = t * 8
        // Roots stay put. Only the tips travel — which is the difference
        // between grass bending and grass sliding.
        data[v + 4] = tu.x + tu.hw + bend
        data[v + 6] = tu.x - tu.hw + bend
        // And it shortens as it leans, because a blade does not stretch.
        const drop = tu.ht * (1 - Math.sqrt(Math.max(0, 1 - Math.min(0.9, (bend / tu.ht) ** 2))))
        data[v + 5] = tu.y - tu.ht + drop
        data[v + 7] = data[v + 5]
      }
      buf.update()
    },
    destroy() {
      mesh.destroy()
    },
  }
}
