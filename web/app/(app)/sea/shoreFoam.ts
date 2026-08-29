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

import { GRASS } from '@/lib/islandShape'

/** How far out from the waterline the foam reaches, as a share of the island's
 *  own radius at that bearing. */
const BAND = 0.16
/** How fast the bands run shorewards. UV units a second. */
const SPEED = 0.13
/** How many times the foam texture repeats around a coast. Higher makes the
 *  breaks shorter and busier. */
const AROUND = 7

/**
 * The foam strip: a soft band, transparent at both edges, tiling vertically.
 *
 * Vertical is the SHOREWARD axis, so scrolling v runs the crests at the beach.
 * Two crests of different weight, because an even pulse reads as a machine.
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
    // Two crests, the second lighter and offset, both soft.
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

export type Foam = {
  mesh: import('pixi.js').Mesh<import('pixi.js').MeshGeometry>
  /** Scrolls the crests shorewards. Called once a frame. */
  advance(seconds: number): void
}

/**
 * A surf ring for one island.
 *
 * `rs` is that island's 160 coastline radii, in percent of its box; `d` is the
 * box. The inner edge sits on the waterline — the outer edge of the painted
 * land — and the outer edge reaches BAND further out.
 */
export function makeShoreFoam(
  PIXI: typeof import('pixi.js'),
  rs: number[],
  d: number,
  texture: import('pixi.js').Texture,
  seed: number,
): Foam {
  const n = rs.length
  const verts = new Float32Array(n * 4)       // inner then outer, per angle
  const uvs = new Float32Array(n * 4)
  const idx: number[] = []

  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n
    // The waterline: the top face reaches 0.74 of the coastline radius, and
    // that edge is where the land stops and the water starts.
    const inner = (rs[i] / 100) * d * 0.74
    const outer = inner * (1 + BAND)
    const c = Math.cos(a)
    const s = Math.sin(a)

    verts[i * 4] = c * inner
    verts[i * 4 + 1] = s * inner
    verts[i * 4 + 2] = c * outer
    verts[i * 4 + 3] = s * outer

    // u runs around the coast, v across the band. The seed rotates where each
    // island's crests fall so two neighbours never break in step.
    const u = (i / n) * AROUND + seed
    uvs[i * 4] = u
    uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = u
    uvs[i * 4 + 3] = 1

    const j = (i + 1) % n
    idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2)
  }

  const mesh = new PIXI.MeshSimple({
    texture,
    vertices: verts,
    uvs,
    indices: new Uint32Array(idx),
  })
  // Additive-ish: broken water lightens what is under it rather than covering
  // it, which is also what stops the ring reading as a drawn outline.
  mesh.blendMode = 'add'
  mesh.alpha = 0.5

  const uvBuf = mesh.geometry.getBuffer('aUV')
  const base = Float32Array.from(uvs)

  return {
    mesh,
    advance(seconds) {
      // v only. u is fixed to the coast; scrolling it would slide the foam
      // ALONG the beach, which is the one direction surf does not go.
      const off = -seconds * SPEED
      const data = uvBuf.data as Float32Array
      for (let i = 0; i < base.length; i += 2) {
        data[i] = base[i]
        data[i + 1] = base[i + 1] + off
      }
      uvBuf.update()
    },
  }
}

/** Where the land stops, for anything that needs it outside this file. */
export const WATERLINE = GRASS
