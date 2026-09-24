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
//   A KELP BED is painted (Kie.ai, public/sea/kelp-*.webp) and is UNDER the
//   water. Kong, twice: it should look underwater and 2.5D (it was baked
//   strokes lying flat on the surface), and then, of a full-colour canopy mat
//   laid over the sea: "does not look underwater at all, it looks like an
//   island". Anything drawn OVER the water in its own colours is an object on
//   the water, however it is tinted. So the bed is drawn with MULTIPLY: it
//   darkens and stains the sea in its shape and every ripple, glint and
//   colour of the water still shows through it, which is exactly what a thing
//   below the surface looks like. Layers, deepest first, each softer (baked
//   blur, not a filter) and pulled further into PERSPECTIVE (nearer the
//   camera's line and smaller, so they slide under the surface as you sail):
//     MURK     the dark mass of the bed, very soft
//     STALKS   two or three clumps rising from below
//     FRONDS   the mat just under the surface, nearly sharp
//     SHEEN    the only additive bit: a faint gold where fronds near the top
//              catch the light. Faint on purpose; any stronger and it floats.
//
// Both sit on the water under the islands, and both take the night tint.

import type { Container, Texture, MeshSimple, Sprite } from 'pixi.js'
import { CURRENTS, KELP, otherLaneK } from '@/lib/seaFlow'

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
  /** The clock, and where the camera is looking (world px), for the depth. */
  advance(seconds: number, camX?: number, camY?: number): void
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

export function makeFlow(PIXI: typeof import('pixi.js')): FlowGfx {
  const view: Container = new PIXI.Container()
  const tex: Record<Layer['tex'], Texture> = {
    body: bodyTexture(PIXI), drift: streakTexture(PIXI), race: raceTexture(PIXI), shear: shearTexture(PIXI),
  }
  const strips: { mesh: MeshSimple; base: Float32Array; speed: number; tile: number }[] = []

  for (const lane of CURRENTS) {
    // Resampled every ~100px (the lane data is every ~400), so the foam can be
    // cut cleanly where another lane crosses.
    const pts: { x: number; y: number }[] = [lane.pts[0]]
    for (let i = 1; i < lane.pts.length; i++) {
      const a = lane.pts[i - 1], b = lane.pts[i]
      const m = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 100))
      for (let j = 1; j <= m; j++) pts.push({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m })
    }
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
        const cx = pts[i].x + nrm[i].x * c, cy = pts[i].y + nrm[i].y * c
        // Edge foam is where fast water meets still. Inside another lane's
        // water (a crossing) there is no still water, so the line fades out
        // rather than drawing a wall across the other current.
        let cut = 1
        if (layer.tex === 'shear') {
          const o = Math.min(1, otherLaneK(cx, cy, lane.id) * 2.5)
          cut = 1 - o * o * (3 - 2 * o)
        }
        const h = layer.wide * lane.half * taper * cut
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

  // ── THE BEDS ── built when the two paintings have landed, in one
  // container each per layer so every bed's murk is under every bed's stalks.
  type BedLayer = { tex: 'deep' | 'mat'; blur: number; blend: 'multiply' | 'add'; tint: number; alpha: number; depth: number; sway: number }
  const BED_LAYERS: BedLayer[] = [
    { tex: 'mat', blur: 9, blend: 'multiply', tint: 0x6f8f7a, alpha: 0.55, depth: 0.93, sway: 0 },
    { tex: 'deep', blur: 3, blend: 'multiply', tint: 0x93a784, alpha: 0.6, depth: 0.962, sway: 0.05 },
    { tex: 'mat', blur: 1.2, blend: 'multiply', tint: 0xb4c29a, alpha: 0.42, depth: 0.988, sway: 0.035 },
    { tex: 'mat', blur: 0, blend: 'add', tint: 0x3a3214, alpha: 0.5, depth: 1, sway: 0.035 },
  ]
  const holders = BED_LAYERS.map(() => { const c: Container = new PIXI.Container(); view.addChild(c); return c })
  const bits: { sp: Sprite; x: number; y: number; sx: number; sy: number; depth: number; sway: number; phase: number }[] = []
  /** The painting, softened once onto a canvas: padded so the blur has room,
   *  and small, because it is blurred and drawn big. */
  const soft = (img: HTMLImageElement, blur: number) => {
    const W = 320
    const h = Math.round((W * img.naturalHeight) / img.naturalWidth)
    const pad = Math.ceil(blur * 3)
    const cv = document.createElement('canvas')
    cv.width = W + pad * 2
    cv.height = h + pad * 2
    const g = cv.getContext('2d')!
    if (blur > 0) g.filter = `blur(${blur}px)`
    g.drawImage(img, pad, pad, W, h)
    return { tex: PIXI.Texture.from(cv), pad, w: W, h }
  }
  const load = (url: string) => new Promise<HTMLImageElement>((ok, no) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = no
    img.src = url
  })
  void Promise.all([load('/sea/kelp-deep.webp'), load('/sea/kelp-canopy.webp')]).then(([deepImg, matImg]) => {
    if (view.destroyed) return
    const baked = BED_LAYERS.map(l => soft(l.tex === 'deep' ? deepImg : matImg, l.blur))
    for (const k of KELP) {
      let r = (k.seed * 2654435761) >>> 0
      const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296)
      BED_LAYERS.forEach((l, li) => {
        const b = baked[li]
        const place = (x: number, y: number, w: number, anchorY: number) => {
          const sp: Sprite = new PIXI.Sprite(b.tex)
          // The anchor is on the PAINTING, not the padded canvas round it.
          sp.anchor.set(0.5, (b.pad + anchorY * b.h) / (b.h + b.pad * 2))
          sp.blendMode = l.blend
          sp.tint = l.tint
          sp.alpha = l.alpha
          const flip = rnd() < 0.5 ? -1 : 1
          // Three-quarter paintings, counter-scaled against the plane's squash.
          const sx = (w / b.w) * flip
          const sy = ((w * b.h) / b.w / GROUND) / b.h
          holders[li].addChild(sp)
          bits.push({ sp, x, y, sx, sy, depth: l.depth, sway: l.sway, phase: k.seed * 0.9 + li })
        }
        if (l.tex === 'deep') {
          // Rooted a little below the bed's middle, rising up the screen.
          const n = 2 + (k.seed % 2)
          for (let c = 0; c < n; c++) {
            place(k.x + (c - (n - 1) / 2) * k.r * 0.55 + (rnd() - 0.5) * k.r * 0.2,
              k.y + k.r * (0.18 + rnd() * 0.22), k.r * (0.9 + rnd() * 0.3), 0.92)
          }
        } else {
          // Sized to the water that actually holds you (kelpAt's r), not past it.
          place(k.x, k.y, k.r * (li === 0 ? 2.1 : li === 2 ? 1.8 : 1.5), 0.5)
        }
      })
    }
  })
  let lastCamX = 0, lastCamY = 0

  return {
    view,
    advance(t, camX = lastCamX, camY = lastCamY) {
      lastCamX = camX; lastCamY = camY
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
      // PERSPECTIVE: the deeper the layer, the nearer the camera's line it is
      // drawn and the smaller, so the bed slides under the surface as you
      // sail. And it sways, slower than the swell above it.
      for (const d of bits) {
        const b = Math.sin(t * 0.5 + d.phase)
        d.sp.position.set(camX + (d.x - camX) * d.depth, camY + (d.y - camY) * d.depth)
        d.sp.scale.set(d.sx * d.depth * (1 + b * 0.015), d.sy * d.depth * (1 - b * 0.015))
        d.sp.skew.x = b * d.sway
      }
    },
    night(tint) {
      view.tint = tint
    },
  }
}
