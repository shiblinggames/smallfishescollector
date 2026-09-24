// ── THE CURRENTS AND THE KELP, DRAWN ────────────────────────────────────────
//
// What lib/seaFlow says the water does, made visible, because a current you
// cannot see is a mystery drag and a kelp bed you cannot see is a bug.
//
//   A LANE is four strips along its (meandering) centreline, each tapered to
//   nothing at both ends, each scrolling its texture the way the water runs
//   (Kong: make the currents look better; it was one flat strip of streaks):
//     BODY    a soft turquoise sheen down the lane, so it reads as a river in
//             the sea even standing still;
//     DRIFT   wide faint streaks, slow;
//     RACE    thin bright streaks down the middle, fast, the parallax against
//             DRIFT is what makes it read as moving water;
//     SHEAR   broken foam along both edges, where fast water rubs on still.
//   The same trick the island surf uses (shoreFoam): the geometry never moves,
//   only its UVs, so each strip is one draw and a few hundred floats.
//
//   A KELP BED is one sprite of dark fronds laid flat on the plane, breathing
//   very slightly. All the beds share one baked texture, so they batch.
//
// Both sit on the water under the islands, and both take the night tint.

import type { Container, Texture, MeshSimple, Sprite } from 'pixi.js'
import { CURRENTS, KELP } from '@/lib/seaFlow'

const GROUND = 0.58
/** Each layer: which texture, how far one repeat reaches along the lane (world
 *  px), how fast it runs (world px/s), where it sits across the lane (0 is the
 *  centre, 1 the edge), how wide (share of the lane's half-width), and how
 *  strong. RACE runs at about the speed the current carries a hull, so riding
 *  one you keep pace with the bright streaks. */
type Layer = { tex: 'body' | 'drift' | 'race' | 'shear'; tile: number; speed: number; at: number; wide: number; alpha: number; tint: number }
const LAYERS: Layer[] = [
  { tex: 'body', tile: 900, speed: 40, at: 0, wide: 1.0, alpha: 0.16, tint: 0x9fe6f2 },
  { tex: 'drift', tile: 760, speed: 95, at: 0, wide: 0.95, alpha: 0.2, tint: 0xffffff },
  { tex: 'race', tile: 520, speed: 170, at: 0, wide: 0.5, alpha: 0.34, tint: 0xffffff },
  { tex: 'shear', tile: 380, speed: 130, at: 0.86, wide: 0.1, alpha: 0.3, tint: 0xeaf8ff },
  { tex: 'shear', tile: 410, speed: 120, at: -0.86, wide: 0.1, alpha: 0.3, tint: 0xeaf8ff },
]

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

function canvasTex(PIXI: typeof import('pixi.js'), cv: HTMLCanvasElement): Texture {
  const source = new PIXI.CanvasSource({ resource: cv })
  source.addressMode = 'repeat'
  source.scaleMode = 'linear'
  return new PIXI.Texture({ source })
}

/** The sheen: brightest down the middle, gone at the edges, with a slow
 *  unevenness along it so the band is not a flat stripe. */
function bodyTexture(PIXI: typeof import('pixi.js')): Texture {
  const w = 128, h = 64
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  const img = g.createImageData(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / (h - 1)
    const across = Math.max(0, 1 - Math.abs(v - 0.5) * 2)
    const along = 0.7 + 0.3 * Math.sin((x / w) * Math.PI * 2 + Math.sin((x / w) * Math.PI * 6) * 0.6)
    const a = across * across * (3 - 2 * across) * along
    const o = (y * w + x) * 4
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
    img.data[o + 3] = Math.round(a * 255)
  }
  g.putImageData(img, 0, 0)
  return canvasTex(PIXI, cv)
}

/** Thin, bright, long streaks, packed toward the middle. */
function raceTexture(PIXI: typeof import('pixi.js')): Texture {
  const w = 256, h = 48
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  let s = 31
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  g.filter = 'blur(0.8px)'
  for (let i = 0; i < 7; i++) {
    const y = h / 2 + (rnd() - 0.5) * h * 0.6
    const x = rnd() * w
    const len = 60 + rnd() * 110
    const grad = g.createLinearGradient(x, 0, x + len, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.75, `rgba(255,255,255,${0.6 + rnd() * 0.4})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.strokeStyle = grad
    g.lineWidth = 1.1 + rnd() * 0.9
    g.lineCap = 'round'
    for (const off of [0, -w]) { g.beginPath(); g.moveTo(x + off, y); g.lineTo(x + len + off, y); g.stroke() }
  }
  g.filter = 'none'
  const fade = g.createLinearGradient(0, 0, 0, h)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.35, 'rgba(0,0,0,1)')
  fade.addColorStop(0.65, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(0, 0, w, h)
  return canvasTex(PIXI, cv)
}

/** Broken foam: short ragged dashes with gaps, the line where fast water
 *  meets still. */
function shearTexture(PIXI: typeof import('pixi.js')): Texture {
  const w = 256, h = 16
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  let s = 53
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  g.filter = 'blur(0.6px)'
  let x = 0
  while (x < w) {
    const len = 8 + rnd() * 26
    const y = h / 2 + (rnd() - 0.5) * 5
    g.fillStyle = `rgba(255,255,255,${0.45 + rnd() * 0.5})`
    g.beginPath()
    g.ellipse(x + len / 2, y, len / 2, 1.3 + rnd() * 1.4, 0, 0, Math.PI * 2)
    g.fill()
    x += len + 6 + rnd() * 22
  }
  g.filter = 'none'
  return canvasTex(PIXI, cv)
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
  const tex: Record<Layer['tex'], Texture> = {
    body: bodyTexture(PIXI), drift: streakTexture(PIXI), race: raceTexture(PIXI), shear: shearTexture(PIXI),
  }
  const strips: { mesh: MeshSimple; base: Float32Array; speed: number; tile: number }[] = []

  for (const lane of CURRENTS) {
    const pts = lane.pts
    const n = pts.length
    // Cumulative distance, for the UVs and the taper.
    const dist = [0]
    for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    const total = dist[n - 1] || 1
    // The normal at each point, averaged over its two segments so the strip
    // bends smoothly with the meander.
    const nrm = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
      const dx = b.x - a.x, dy = b.y - a.y
      const L = Math.hypot(dx, dy) || 1
      return { x: -dy / L, y: dx / L }
    })
    for (const layer of LAYERS) {
      const verts = new Float32Array(n * 4)
      const uvs = new Float32Array(n * 4)
      const idx: number[] = []
      for (let i = 0; i < n; i++) {
        const f = dist[i] / total
        const e = Math.min(1, f / 0.12, (1 - f) / 0.12)
        const taper = e * e * (3 - 2 * e)
        const c = layer.at * lane.half * taper
        const h = layer.wide * lane.half * taper
        const cx = pts[i].x + nrm[i].x * c, cy = pts[i].y + nrm[i].y * c
        verts[i * 4] = cx + nrm[i].x * h
        verts[i * 4 + 1] = cy + nrm[i].y * h
        verts[i * 4 + 2] = cx - nrm[i].x * h
        verts[i * 4 + 3] = cy - nrm[i].y * h
        const u = dist[i] / layer.tile
        uvs[i * 4] = u; uvs[i * 4 + 1] = 0
        uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1
        if (i < n - 1) {
          const p = i * 2, q = (i + 1) * 2
          idx.push(p, p + 1, q, p + 1, q + 1, q)
        }
      }
      const mesh = new PIXI.MeshSimple({ texture: tex[layer.tex], vertices: verts, uvs, indices: new Uint32Array(idx) })
      mesh.blendMode = 'add'
      mesh.alpha = layer.alpha
      mesh.tint = layer.tint
      view.addChild(mesh)
      strips.push({ mesh, base: Float32Array.from(uvs), speed: layer.speed, tile: layer.tile })
    }
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
      // Every layer runs the way the water does, each at its own pace.
      for (const l of strips) {
        const off = -(t * l.speed) / l.tile
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
