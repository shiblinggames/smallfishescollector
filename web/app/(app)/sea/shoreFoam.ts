// ── SURF, TIED TO THE ISLAND IT BREAKS ON ───────────────────────────────────
//
// Two attempts at this were full-screen shader work: compute the pixel's world
// position, measure it against the nearest coasts, band the result. Both drew
// foam somewhere in the open ocean, because a screen-space shader has to get
// the camera, the ground squash, the zoom and the uniform upload all exactly
// right before it can even be wrong in an interesting way — and any one of
// those being off puts the surf in the middle of the sea.
//
// This is a ring of TRIANGLES built from the island's own coastline, parented
// to the island. It moves with the island because it IS at the island; there is
// no camera in it at all, the same way the contact shadow has no camera in it.
// That property is worth more here than any amount of shader elegance.
//
// ── AND NO CUSTOM SHADER ────────────────────────────────────────────────────
//
// It uses Pixi's own mesh shader with a plain texture. The bands travel by
// scrolling the UVs, which is a few hundred floats per island per frame and
// needs nothing from GLSL. Given that hand-written shader plumbing is what
// broke both previous attempts, "no shader" is a feature.
//
// The geometry is the same 160 radii `coastline` gives the chart and the build
// check, so the surf breaks on the actual coast rather than on a circle through
// it — which was the other half of what looked wrong.
//
// ── IT IS NOT A RING ────────────────────────────────────────────────────────
//
// The first cut was: one smooth strip, the same width all the way round, lit
// additively. Kong: "looks cheap", and "it shouldn't wrap around the island
// exactly the same way — it doesn't give the 2.5D feel if it's just the same
// outer ring." Both right, and they are the same fault. A band of constant
// width at constant brightness round a closed shape is an OUTLINE, and an
// outline is the one thing that says "flat".
//
// Three things fix it, and all three are in the geometry rather than the
// paint:
//
//   THE NEAR SHORE BREAKS, THE FAR SHORE DOES NOT. The plane recedes upward,
//   so the south side of an island faces the viewer and the north side is
//   behind its own rise. Surf you can see is on the beach that faces you: the
//   band is full on the south, thin on the flanks and nearly gone on the
//   north. That asymmetry is most of what reads as depth.
//
//   BREAKERS, NOT A BAND. The width also swells and pinches round the coast,
//   off a seeded low-frequency curve that DRIFTS, so the surf is a run of
//   separate breakers rolling slowly along the shore with clear water between
//   them, rather than a rim.
//
//   PAINT, NOT LIGHT. The strip was additive, which made it a glow. Foam is
//   white water; it is drawn normally, torn by noise so the crests are ragged,
//   and it takes the night tint like everything else on the water.
//
// Two layers, because one line of breakers is a decoration and two at
// different rhythms is surf: the main run at the beach, and a thinner, faster
// line a little further out where the swell first trips.
import type { Container, Mesh, MeshGeometry, Texture } from 'pixi.js'
import { GRASS } from '@/lib/islandShape'

/** How far out from the waterline the foam reaches at its fullest, as a share
 *  of the island's own radius at that bearing. */
const BAND = 0.22
/** How fast the crests run shorewards. UV units a second. */
const SPEED = 0.11
/** How many times the foam texture repeats around a coast. */
const AROUND = 6
/** How fast the breakers drift along the coast, in coast-turns a second. */
const DRIFT = 0.012
/**
 * ── AND IT WASHES ONSHORE ───────────────────────────────────────────────────
 *
 * Kong: can the water wash up onto the island? The surf's inner edge sat
 * exactly on the waterline and the whole thing drew UNDER the island, so
 * nothing could cross onto the beach. The swash is a second pair of meshes
 * drawn OVER the island (in the land layer, under the buildings): a thin
 * translucent sheet with a torn white leading edge that runs up the beach and
 * slides back, and behind it a dark band that lingers and fades, which is the
 * sand staying wet after the water has gone. Only on the shore that faces
 * you, like the breakers, and it travels along the beach rather than hitting
 * the whole coast at once.
 */
/** How far up the beach the swash reaches, as a share of the coast radius. */
const RUNUP = 0.11
/** One run up and back, in seconds. */
const SWASH_PERIOD = 7.5
/** How long the sand stays wet after the water leaves, in seconds to fade. */
const WET_FADE = 5.5

/** Value noise on a small lattice, for tearing the crests. */
function lattice(seed: number, w: number, h: number): (x: number, y: number) => number {
  const g: number[] = []
  let s = seed >>> 0 || 1
  for (let i = 0; i < w * h; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g.push(s / 4294967296) }
  const at = (x: number, y: number) => g[((y % h) + h) % h * w + ((x % w) + w) % w]
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const fx = x - x0, fy = y - y0
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy
  }
}

/**
 * The foam strip for the LANDMARK laps (see makeLap): a soft band, transparent
 * at both edges, tiling vertically. Kept exactly as it was; the islands moved
 * on to makeSurfTexture below.
 */
export function makeFoamTexture(PIXI: typeof import('pixi.js')) {
  const h = 128
  const cv = document.createElement('canvas')
  cv.width = 4
  cv.height = h
  const g = cv.getContext('2d')!
  const img = g.createImageData(4, h)
  for (let y = 0; y < h; y++) {
    const v = y / h
    const a1 = Math.exp(-Math.pow((v - 0.22) / 0.10, 2))
    const a2 = Math.exp(-Math.pow((v - 0.62) / 0.07, 2)) * 0.55
    const a = Math.min(1, a1 + a2)
    for (let x = 0; x < 4; x++) {
      const p = (y * 4 + x) * 4
      img.data[p] = 235
      img.data[p + 1] = 246
      img.data[p + 2] = 250
      img.data[p + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const source = new PIXI.CanvasSource({ resource: cv })
  source.addressMode = 'repeat'
  source.scaleMode = 'linear'
  return new PIXI.Texture({ source })
}

/**
 * The surf strip for the islands. u runs along the coast, v across the band
 * from the waterline (0) outward (1). A milky wash right at the beach, a torn
 * main crest just off it, and a lighter second crest further out; all three
 * broken along u by noise so no crest is a clean line.
 */
export function makeSurfTexture(PIXI: typeof import('pixi.js')) {
  const w = 128, h = 256
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const img = g.createImageData(w, h)
  const n1 = lattice(7, 16, 32)
  const n2 = lattice(19, 32, 64)
  for (let y = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++) {
      const u = x / w
      // Tear: two octaves, tiling in u because the lattice wraps.
      const tear = 0.45 + 0.55 * (0.6 * n1(u * 16, v * 32) + 0.4 * n2(u * 32, v * 64))
      // The crest lines wobble in v by the same noise so they are not straight.
      const wob = (n1(u * 16 + 7, 3) - 0.5) * 0.10
      const wash = Math.max(0, 1 - v / 0.26) * 0.55
      const c1 = Math.exp(-Math.pow((v - 0.20 - wob) / 0.075, 2))
      const c2 = Math.exp(-Math.pow((v - 0.58 - wob * 1.4) / 0.05, 2)) * 0.6
      let a = Math.min(1, wash + c1 + c2) * tear
      // Hard-ish edge on the crest tops so foam reads as lumps, not mist.
      a = a < 0.12 ? 0 : a
      const p = (y * w + x) * 4
      img.data[p] = 240
      img.data[p + 1] = 248
      img.data[p + 2] = 252
      img.data[p + 3] = Math.round(Math.min(1, a) * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const source = new PIXI.CanvasSource({ resource: cv })
  source.addressMode = 'repeat'
  source.scaleMode = 'linear'
  return new PIXI.Texture({ source })
}

/** The swash sheet and the wet-sand band, one texture each, shared by every
 *  island. Built on first use per renderer. */
const swashTex = new WeakMap<object, { sheet: Texture; wet: Texture }>()
function swashTextures(PIXI: typeof import('pixi.js')): { sheet: Texture; wet: Texture } {
  const hit = swashTex.get(PIXI)
  if (hit) return hit
  const make = (paint: (v: number, u: number) => [number, number]) => {
    const w = 64, h = 128
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const g = cv.getContext('2d')!
    const img = g.createImageData(w, h)
    const n = lattice(31, 16, 16)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [lum, a] = paint(y / h, x / w)
      const tear = 0.55 + 0.45 * n((x / w) * 16, (y / h) * 16)
      const p = (y * w + x) * 4
      img.data[p] = lum; img.data[p + 1] = lum; img.data[p + 2] = lum
      img.data[p + 3] = Math.round(Math.max(0, Math.min(1, a * tear)) * 255)
    }
    g.putImageData(img, 0, 0)
    const source = new PIXI.CanvasSource({ resource: cv })
    source.addressMode = 'repeat'
    source.scaleMode = 'linear'
    return new PIXI.Texture({ source })
  }
  // v = 0 is the leading edge, up the beach; v = 1 is back at the waterline.
  const sheet = make(v => {
    const edge = Math.exp(-Math.pow((v - 0.07) / 0.06, 2))
    const film = Math.max(0, 1 - v) * 0.30
    return [248, Math.min(1, edge * 0.95 + film)]
  })
  const wet = make(v => [40, 0.55 * (0.35 + 0.65 * v)])
  const out = { sheet, wet }
  swashTex.set(PIXI, out)
  return out
}

export type Foam = {
  /** Both breaker layers, parented together. Position this at the island,
   *  UNDER it. */
  mesh: Container
  /** The swash and the wet sand. Position this at the island too, but OVER
   *  it, so the water can cross onto the beach. */
  over: Container
  /** Scrolls the crests shorewards and rolls the breakers along the coast.
   *  Called once a frame with the clock in seconds. */
  advance(seconds: number): void
}

/** The width envelope round the coast: the seeded, drifting curve that turns
 *  a rim into breakers. Returns 0..1. */
function breakers(a: number, seed: number, t: number, phase: number): number {
  const k = seed * Math.PI * 2 + phase
  const drift = t * DRIFT * Math.PI * 2
  const raw = 0.5
    + 0.30 * Math.sin(a * 3 + k + drift)
    + 0.22 * Math.sin(a * 5 - k * 1.7 - drift * 1.6)
    + 0.16 * Math.sin(a * 8 + k * 0.6 + drift * 0.7)
  // Pinch the troughs to nothing so there is clear water between breakers.
  const e = Math.max(0, Math.min(1, (raw - 0.22) / 0.56))
  return e * e * (3 - 2 * e)
}

/**
 * A surf ring for one island.
 *
 * `rs` is that island's 160 coastline radii, in percent of its box; `d` is the
 * box. The inner edge sits on the waterline — the outer edge of the painted
 * land — and the outer edge reaches out by a width that depends on which way
 * the shore faces and where the breakers are.
 */
export function makeShoreFoam(
  PIXI: typeof import('pixi.js'),
  rs: number[],
  d: number,
  texture: Texture,
  seed: number,
): Foam {
  const n = rs.length
  const view: Container = new PIXI.Container()
  const over: Container = new PIXI.Container()

  type Layer = {
    mesh: Mesh<MeshGeometry>
    verts: Float32Array
    uvs: Float32Array
    base: Float32Array
    /** Outer-edge scale, in/out offsets and rhythm for this layer. */
    scale: number
    lift: number
    speed: number
    phase: number
  }
  const layers: Layer[] = []

  const build = (scale: number, lift: number, speed: number, phase: number, alpha: number, into: Container = view, tex: Texture = texture): Layer => {
    const verts = new Float32Array(n * 4)
    const uvs = new Float32Array(n * 4)
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const u = (i / n) * AROUND + seed + phase
      uvs[i * 4] = u; uvs[i * 4 + 1] = 0
      uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1
      const j = (i + 1) % n
      idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2)
    }
    const mesh = new PIXI.MeshSimple({ texture: tex, vertices: verts, uvs, indices: new Uint32Array(idx) })
    mesh.alpha = alpha
    into.addChild(mesh)
    return { mesh, verts, uvs, base: Float32Array.from(uvs), scale, lift, speed, phase }
  }
  // The main run at the beach, and the thinner faster line a little out.
  layers.push(build(1.0, 0.0, 1.0, 0.0, 0.88))
  layers.push(build(0.55, 0.65, 1.45, 0.37, 0.55))

  // ── THE SWASH, over the island ──────────────────────────────────────
  const st = swashTextures(PIXI)
  const wetL = build(1, 0, 0, 0, 0.30, over, st.wet)
  const sheetL = build(1, 0, 0, 0, 0.62, over, st.sheet)
  wetL.mesh.tint = 0x223038
  /** How wet each bearing of beach still is, 0..1, decaying. */
  const wet = new Float32Array(n)
  let lastT = 0

  const shape = (t: number) => {
    const dt = Math.max(0, Math.min(0.1, t - lastT))
    lastT = t
    // ── THE SWASH FIRST, so its buffers are written every frame too ────
    {
      const sb = sheetL.mesh.geometry.getBuffer('aPosition')
      const sv = sb.data as Float32Array
      const wb = wetL.mesh.geometry.getBuffer('aPosition')
      const wv = wb.data as Float32Array
      const decay = Math.exp(-dt / WET_FADE)
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n
        const c = Math.cos(a), s = Math.sin(a)
        const coast = (rs[i] / 100) * d * 0.74
        const face = 0.5 + 0.5 * s
        const facing = face * face * (3 - 2 * face)
        // Up fast, back slow: the wave arrives and the water drains.
        const ph = (t / SWASH_PERIOD + seed + a * 0.35) % 1
        const run = ph < 0.3 ? ph / 0.3 : 1 - (ph - 0.3) / 0.7
        const e = run * run * (3 - 2 * run)
        const reach = RUNUP * facing * (0.55 + 0.45 * breakers(a, seed, t, 0.5))
        const up = reach * e
        wet[i] = Math.max(wet[i] * decay, up)
        // The sheet: leading edge up the beach, tail back at the waterline.
        const si = coast * (1 - up)
        const so = coast * (1 + 0.015)
        sv[i * 4] = c * si; sv[i * 4 + 1] = s * si
        sv[i * 4 + 2] = c * so; sv[i * 4 + 3] = s * so
        // The wet sand: as far as the water has been lately.
        const wi = coast * (1 - wet[i])
        wv[i * 4] = c * wi; wv[i * 4 + 1] = s * wi
        wv[i * 4 + 2] = c * so; wv[i * 4 + 3] = s * so
      }
      sb.update()
      wb.update()
    }
    for (const L of layers) {
      // The buffer's OWN array, not the one it was built from: a MeshSimple
      // may copy on construction, and the UV path below learned the same.
      const buf = L.mesh.geometry.getBuffer('aPosition')
      const v = buf.data as Float32Array
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n
        const c = Math.cos(a), s = Math.sin(a)
        // The waterline: the top face reaches 0.74 of the coastline radius.
        const coast = (rs[i] / 100) * d * 0.74
        // FACING. s is +1 on the south shore, which faces the viewer, and -1
        // on the north, which is behind the island's own rise.
        const face = 0.5 + 0.5 * s
        const facing = 0.12 + 0.88 * face * face * (3 - 2 * face)
        const width = BAND * facing * breakers(a, seed, t, L.phase) * L.scale
        const inner = coast * (1 + BAND * L.lift * facing * 0.6)
        const outer = inner * (1 + width)
        v[i * 4] = c * inner
        v[i * 4 + 1] = s * inner
        v[i * 4 + 2] = c * outer
        v[i * 4 + 3] = s * outer
      }
      buf.update()
    }
  }
  shape(0)

  return {
    mesh: view,
    over,
    advance(seconds) {
      shape(seconds)
      for (const L of layers) {
        // v only. u is fixed to the coast; scrolling it would slide the foam
        // ALONG the beach, which is the one direction surf does not go.
        const off = -seconds * SPEED * L.speed
        const buf = L.mesh.geometry.getBuffer('aUV')
        const data = buf.data as Float32Array
        for (let i = 0; i < L.base.length; i += 2) {
          data[i] = L.base[i]
          data[i + 1] = L.base[i + 1] + off
        }
        buf.update()
      }
    },
  }
}

/** Where the land stops, for anything that needs it outside this file. */
export const WATERLINE = GRASS
