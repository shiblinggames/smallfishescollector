// ── THE CURRENTS AND THE KELP, DRAWN ────────────────────────────────────────
//
// What lib/seaFlow says the water does, made visible, because a current you
// cannot see is a mystery drag and a kelp bed you cannot see is a bug.
//
//   A LANE is one mesh strip along its centreline, tapered to nothing at both
//   ends, with a texture of soft white streaks that scrolls the way the water
//   runs. The same trick the island surf uses (shoreFoam): the geometry never
//   moves, only its UVs, so a whole lane is one draw and a few hundred floats.
//
//   A KELP BED is one sprite of dark fronds laid flat on the plane, breathing
//   very slightly. All the beds share one baked texture, so they batch.
//
// Both sit on the water under the islands, and both take the night tint.

import type { Container, Texture, MeshSimple, Sprite } from 'pixi.js'
import { CURRENTS, KELP } from '@/lib/seaFlow'

const GROUND = 0.58
/** World px per repeat of the streak texture along a lane. */
const TILE = 520
/** How fast the streaks run, in tiles a second. */
const RUN = 0.32

export type FlowGfx = {
  view: Container
  advance(seconds: number): void
  night(tint: number): void
}

function streakTexture(PIXI: typeof import('pixi.js')): Texture {
  const w = 256, h = 64
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  let s = 7
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  g.filter = 'blur(1.5px)'
  for (let i = 0; i < 9; i++) {
    const y = 10 + rnd() * (h - 20)
    const x = rnd() * w
    const len = 40 + rnd() * 90
    const a = 0.35 + rnd() * 0.5
    const grad = g.createLinearGradient(x, 0, x + len, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.strokeStyle = grad
    g.lineWidth = 1.6 + rnd() * 1.6
    g.lineCap = 'round'
    for (const off of [0, -w]) { // wrap round the tile's seam
      g.beginPath(); g.moveTo(x + off, y); g.lineTo(x + len + off, y); g.stroke()
    }
  }
  g.filter = 'none'
  // Across the lane: gone at the edges, full down the middle.
  const fade = g.createLinearGradient(0, 0, 0, h)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.3, 'rgba(0,0,0,1)')
  fade.addColorStop(0.7, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(0, 0, w, h)
  const source = new PIXI.CanvasSource({ resource: cv })
  source.addressMode = 'repeat'
  source.scaleMode = 'linear'
  return new PIXI.Texture({ source })
}

function kelpTexture(PIXI: typeof import('pixi.js')): Texture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  let s = 19
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  // Long fronds lying on the surface, radiating loosely from a few holdfasts,
  // in the muted olive and brown of the painted shallows.
  const tones = ['#3f5a2a', '#4d6a30', '#5b5a26', '#3a4a22', '#6a6a2e']
  for (let c = 0; c < 5; c++) {
    const cx = S / 2 + (rnd() - 0.5) * S * 0.35
    const cy = S / 2 + (rnd() - 0.5) * S * 0.35
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2
      const len = S * (0.14 + rnd() * 0.2)
      const bend = (rnd() - 0.5) * 0.9
      g.strokeStyle = tones[Math.floor(rnd() * tones.length)]
      g.globalAlpha = 0.5 + rnd() * 0.4
      g.lineWidth = 3 + rnd() * 5
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(cx, cy)
      g.quadraticCurveTo(
        cx + Math.cos(a + bend) * len * 0.6, cy + Math.sin(a + bend) * len * 0.6,
        cx + Math.cos(a) * len, cy + Math.sin(a) * len)
      g.stroke()
    }
  }
  g.globalAlpha = 1
  // Soft all round, so a bed has no rim.
  const fade = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(0, 0, S, S)
  return PIXI.Texture.from(cv)
}

export function makeFlow(PIXI: typeof import('pixi.js')): FlowGfx {
  const view: Container = new PIXI.Container()
  const streaks = streakTexture(PIXI)
  const lanes: { mesh: MeshSimple; base: Float32Array }[] = []

  for (const lane of CURRENTS) {
    const pts = lane.pts
    const n = pts.length
    const verts = new Float32Array(n * 4)
    const uvs = new Float32Array(n * 4)
    const idx: number[] = []
    // Cumulative distance, for the UVs and the taper.
    const dist = [0]
    for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    const total = dist[n - 1] || 1
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
      const dx = b.x - a.x, dy = b.y - a.y
      const L = Math.hypot(dx, dy) || 1
      // The normal on the plane; its y is squashed with everything else by
      // the world, so it is laid out in world units here.
      const nx = -dy / L, ny = dx / L
      const f = dist[i] / total
      const e = Math.min(1, f / 0.12, (1 - f) / 0.12)
      const half = lane.half * (e * e * (3 - 2 * e))
      verts[i * 4] = pts[i].x + nx * half
      verts[i * 4 + 1] = pts[i].y + ny * half
      verts[i * 4 + 2] = pts[i].x - nx * half
      verts[i * 4 + 3] = pts[i].y - ny * half
      const u = dist[i] / TILE
      uvs[i * 4] = u; uvs[i * 4 + 1] = 0
      uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1
      if (i < n - 1) {
        const p = i * 2, q = (i + 1) * 2
        idx.push(p, p + 1, q, p + 1, q + 1, q)
      }
    }
    const mesh = new PIXI.MeshSimple({ texture: streaks, vertices: verts, uvs, indices: new Uint32Array(idx) })
    mesh.blendMode = 'add'
    mesh.alpha = 0.2
    view.addChild(mesh)
    lanes.push({ mesh, base: Float32Array.from(uvs) })
  }

  const kelpTex = kelpTexture(PIXI)
  const beds: { sp: Sprite; w: number; phase: number }[] = []
  for (const k of KELP) {
    const sp: Sprite = new PIXI.Sprite(kelpTex)
    sp.anchor.set(0.5)
    sp.x = k.x
    sp.y = k.y
    const w = k.r * 2.3
    // Laid on the plane: the world squashes y by GROUND, so the texture is
    // drawn at its own proportions and the world does the rest.
    sp.width = w
    sp.height = w
    sp.rotation = (k.seed * 1.7) % (Math.PI * 2)
    sp.alpha = 0.75
    view.addChild(sp)
    beds.push({ sp, w, phase: k.seed * 0.9 })
  }
  void GROUND

  return {
    view,
    advance(t) {
      // Streaks run the way the water does: forward along u.
      const off = -t * RUN
      for (const l of lanes) {
        const buf = l.mesh.geometry.getBuffer('aUV')
        const data = buf.data as Float32Array
        for (let i = 0; i < l.base.length; i += 2) {
          data[i] = l.base[i] + off
          data[i + 1] = l.base[i + 1]
        }
        buf.update()
      }
      // Kelp breathes with the swell, barely.
      for (const b of beds) {
        const s = 1 + Math.sin(t * 0.6 + b.phase) * 0.025
        b.sp.width = b.w * s
        b.sp.height = b.w * (2 - s)
      }
    },
    night(tint) {
      view.tint = tint
    },
  }
}
