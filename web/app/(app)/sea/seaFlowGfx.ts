// ── THE CURRENTS AND THE KELP, DRAWN ────────────────────────────────────────
//
// What lib/seaFlow says the water does, made visible, because a current you
// cannot see is a mystery drag and a kelp bed you cannot see is a bug.
//
//   A LANE is four soft strips along its (meandering) centreline, drawn as
//   WATER rather than a road (see LAYERS): a faint patchy tint and three layers
//   of wavy ripple clusters at three speeds, every one of them wandering in
//   width and centre along the lane. No edge lines. The geometry never moves,
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
import { CURRENTS, KELP } from '@/lib/seaFlow'

const GROUND = 0.58
/** Each layer: which texture, how far one repeat reaches along the lane (world
 *  px), how fast it runs (world px/s), where it sits across the lane (0 is the
 *  centre, 1 the edge), how wide (share of the lane's half-width), and how
 *  strong. RACE runs at about the speed the current carries a hull, so riding
 *  one you keep pace with the bright streaks. */
/**
 * ── WATER, NOT A ROAD ───────────────────────────────────────────────────────
 * Kong: the currents "literally look like highways". They were a solid tinted
 * band of constant width (the road), two foam lines down its edges (the lane
 * markings) and a bright streak down its middle (the centre line). So: no edge
 * lines at all; the tint only in faint patches that come and go; the streaks
 * short wavy ripples in CLUSTERS with open water between them, at three speeds
 * so they slide past each other; and every layer's width and centre wandering
 * slowly along the lane (`wob`, a phase per layer) so no two stretches match.
 * How a current works is untouched: this is only the picture of it.
 */
type Layer = { tex: 'body' | 'ripA' | 'ripB' | 'ripC'; tile: number; speed: number; wide: number; alpha: number; tint: number; wob: number }
const LAYERS: Layer[] = [
  { tex: 'body', tile: 2400, speed: 28, wide: 0.9, alpha: 0.07, tint: 0x9fdce8, wob: 0.3 },
  { tex: 'ripA', tile: 1500, speed: 60, wide: 0.95, alpha: 0.17, tint: 0xeef8fa, wob: 1.7 },
  { tex: 'ripB', tile: 1100, speed: 100, wide: 0.7, alpha: 0.19, tint: 0xffffff, wob: 3.1 },
  { tex: 'ripC', tile: 800, speed: 150, wide: 0.42, alpha: 0.15, tint: 0xffffff, wob: 4.6 },
]

export type FlowGfx = {
  view: Container
  /** The clock, and where the camera is looking (world px), for the depth. */
  advance(seconds: number, camX?: number, camY?: number, halfW?: number, halfH?: number): void
  night(tint: number): void
}

function canvasTex(PIXI: typeof import('pixi.js'), cv: HTMLCanvasElement): Texture {
  const source = new PIXI.CanvasSource({ resource: cv })
  source.addressMode = 'repeat'
  source.scaleMode = 'linear'
  return new PIXI.Texture({ source })
}

/** A FAINT TINT IN PATCHES. Soft across (gone well before the edges) and,
 *  along the lane, mostly nothing with a few pools of colour, so it reads as
 *  water that is a little different here rather than as a painted band. */
function bodyTexture(PIXI: typeof import('pixi.js')): Texture {
  const w = 256, h = 64
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  const img = g.createImageData(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / (h - 1)
    const across = Math.max(0, 1 - Math.abs(v - 0.5) * 2.2)
    const u = (x / w) * Math.PI * 2
    const n = 0.5 + 0.5 * Math.sin(u + Math.sin(u * 3) * 0.8) * Math.sin(u * 2 + 1.3)
    const along = Math.pow(Math.max(0, n), 2.2)
    const a = across * across * (3 - 2 * across) * along
    const o = (y * w + x) * 4
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
    img.data[o + 3] = Math.round(a * 255)
  }
  g.putImageData(img, 0, 0)
  return canvasTex(PIXI, cv)
}

/** RIPPLES IN CLUSTERS. A long tile holding a few groups of short wavy strokes
 *  (the way moving water catches the light in patches) with open water between
 *  the groups, soft at both edges, wrapping cleanly at the seam. */
function rippleTexture(PIXI: typeof import('pixi.js'), seed: number, clusters: number, per: number, thick: number): Texture {
  const w = 1024, h = 96
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  g.filter = 'blur(0.9px)'
  g.lineCap = 'round'
  for (let c = 0; c < clusters; c++) {
    const cx = ((c + rnd() * 0.6) / clusters) * w
    const cy = h * (0.3 + rnd() * 0.4)
    const n = Math.round(per * (0.6 + rnd() * 0.8))
    for (let k = 0; k < n; k++) {
      const x0 = cx + (rnd() - 0.5) * 180
      const y0 = cy + (rnd() - 0.5) * h * 0.42
      const len = 26 + rnd() * 90
      const amp = 1.2 + rnd() * 2.6
      const a = 0.22 + rnd() * 0.5
      g.lineWidth = thick * (0.7 + rnd() * 0.7)
      for (const off of [0, -w, w]) {
        const grad = g.createLinearGradient(x0 + off, 0, x0 + off + len, 0)
        grad.addColorStop(0, 'rgba(255,255,255,0)')
        grad.addColorStop(0.5, `rgba(255,255,255,${a})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.strokeStyle = grad
        g.beginPath()
        for (let t = 0; t <= 12; t++) {
          const px = x0 + off + (len * t) / 12
          const py = y0 + Math.sin((t / 12) * Math.PI * 1.6 + k) * amp
          if (t === 0) g.moveTo(px, py); else g.lineTo(px, py)
        }
        g.stroke()
      }
    }
  }
  g.filter = 'none'
  const fade = g.createLinearGradient(0, 0, 0, h)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.28, 'rgba(0,0,0,1)')
  fade.addColorStop(0.72, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = fade
  g.fillRect(0, 0, w, h)
  return canvasTex(PIXI, cv)
}

export function makeFlow(PIXI: typeof import('pixi.js')): FlowGfx {
  const view: Container = new PIXI.Container()
  const tex: Record<Layer['tex'], Texture> = {
    body: bodyTexture(PIXI),
    ripA: rippleTexture(PIXI, 71, 4, 7, 1.6),
    ripB: rippleTexture(PIXI, 113, 5, 5, 1.3),
    ripC: rippleTexture(PIXI, 197, 3, 4, 1.1),
  }
  /**
   * ── ONLY WHAT IS ON SCREEN IS DRAWN, OR SCROLLED ─────────────────────────
   * Kong hit stuttering sailing. Every lane was ONE mesh per layer the length
   * of the lane, resampled every 100px for edge foam that no longer exists,
   * and every frame rewrote and re-uploaded the UVs of all twenty of them:
   * about fifteen thousand floats and twenty buffer uploads a frame, for a sea
   * where you can see a stretch of one lane at a time. Now each lane is cut
   * into CHUNKS with their own bounds, points every 200px, and a chunk off
   * the camera is hidden and not touched.
   */
  const strips: { mesh: MeshSimple; base: Float32Array; speed: number; tile: number; x0: number; y0: number; x1: number; y1: number }[] = []
  const CHUNK = 16

  for (const lane of CURRENTS) {
    // Resampled every ~200px (the lane data is every ~400): enough for the
    // width and centre to wander smoothly.
    const pts: { x: number; y: number }[] = [lane.pts[0]]
    for (let i = 1; i < lane.pts.length; i++) {
      const a = lane.pts[i - 1], b = lane.pts[i]
      const m = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 200))
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
        // Longer tapers than the push's own fade, so a lane frays out.
        const e = Math.min(1, f / 0.18, (1 - f) / 0.18)
        const taper = e * e * (3 - 2 * e)
        // THE LANE WANDERS: width and centre drift on two slow sines per
        // layer, out of step with each other, so no stretch is the same width
        // and no layer sits exactly on another.
        const dd = dist[i]
        const wv = 0.72 + 0.28 * Math.sin(dd / 1700 + layer.wob) * Math.sin(dd / 730 + layer.wob * 1.9)
        const c = Math.sin(dd / 1300 + layer.wob * 2.3) * 0.18 * lane.half * taper
        const cx = pts[i].x + nrm[i].x * c, cy = pts[i].y + nrm[i].y * c
        const h = layer.wide * lane.half * taper * wv
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
      void idx
      // Cut into chunks of CHUNK segments (sharing their end points, so the
      // strip is seamless), each with its own bounds for the cull.
      for (let a = 0; a < n - 1; a += CHUNK) {
        const b = Math.min(n - 1, a + CHUNK)
        const cn = b - a + 1
        const cv = verts.slice(a * 4, (b + 1) * 4)
        const cu = uvs.slice(a * 4, (b + 1) * 4)
        const ci: number[] = []
        for (let k = 0; k < cn - 1; k++) { const p = k * 2, q = (k + 1) * 2; ci.push(p, p + 1, q, p + 1, q + 1, q) }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (let k = 0; k < cv.length; k += 2) {
          if (cv[k] < x0) x0 = cv[k]; if (cv[k] > x1) x1 = cv[k]
          if (cv[k + 1] < y0) y0 = cv[k + 1]; if (cv[k + 1] > y1) y1 = cv[k + 1]
        }
        const mesh = new PIXI.MeshSimple({ texture: tex[layer.tex], vertices: cv, uvs: cu, indices: new Uint32Array(ci) })
        mesh.blendMode = 'add'
        mesh.alpha = layer.alpha
        mesh.tint = layer.tint
        mesh.visible = false
        view.addChild(mesh)
        strips.push({ mesh, base: Float32Array.from(cu), speed: layer.speed, tile: layer.tile, x0, y0, x1, y1 })
      }
    }
  }

  // ── THE BEDS ── built when the two paintings have landed, in one
  // container each per layer so every bed's murk is under every bed's stalks.
  type BedLayer = { tex: 'deep' | 'mat'; blur: number; blend: 'multiply' | 'add'; tint: number; alpha: number; depth: number; sway: number }
  // FAINTER AND SOFTER (Kong, 2026-09-24: still giant scary masses; it should
  // be faint and hidden underwater). Tints lifted toward the water, alphas
  // roughly halved, more blur on every layer and the surface sheen nearly
  // gone: a shadow of weed under the surface rather than a thing on it.
  //
  // ── AND 2.5D, NOT A DECAL (Kong: it looks flat, that is why it does not
  // fit). The flat top-down canopy mats are gone. A bed is a very soft murk
  // lying on the bottom, and a scatter of standing clumps through it: the
  // near (south) ones bigger, lower on the screen and nearer the surface, the
  // far ones smaller and deeper, so they slide less as you sail over, which
  // is what puts them under water rather than on it.
  const BED_LAYERS: BedLayer[] = [
    { tex: 'mat', blur: 16, blend: 'multiply', tint: 0xa9bdad, alpha: 0.22, depth: 0.92, sway: 0 },
    { tex: 'deep', blur: 4, blend: 'multiply', tint: 0xadc0a8, alpha: 0.34, depth: 0.96, sway: 0.05 },
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
        const place = (x: number, y: number, w: number, anchorY: number, depthOf = l.depth) => {
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
          bits.push({ sp, x, y, sx, sy, depth: depthOf, sway: l.sway, phase: k.seed * 0.9 + li + x * 0.001 })
        }
        if (l.tex === 'deep') {
          // CLUMPS THROUGH THE BED, far to near. Spread over an ellipse (the
          // bed seen from above and to the south), then drawn north first so
          // the near ones overlap the far. `s` is how far south a clump is,
          // 0 at the far edge and 1 at the near: it decides the size (the 2.5D
          // rule, near reaches further) and the depth (near is shallower).
          const n = 4 + (k.seed % 3)
          const spots: { x: number; y: number; s: number }[] = []
          for (let c = 0; c < n; c++) {
            const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * k.r * 0.85
            const dy = Math.sin(a) * rr * 0.62
            spots.push({ x: k.x + Math.cos(a) * rr, y: k.y + dy, s: (dy / (k.r * 0.62) + 1) / 2 })
          }
          spots.sort((p, q) => p.y - q.y)
          for (const sp of spots) {
            place(sp.x, sp.y, k.r * (0.42 + 0.42 * sp.s) * (0.85 + rnd() * 0.3), 0.92, 0.94 + 0.045 * sp.s)
          }
        } else {
          // Sized to the water that actually holds you (kelpAt's r), not past it.
          // The murk: one soft shadow of the whole bed, a little south of
          // centre so it sits under the near clumps, fading out inside the
          // water that actually holds you.
          place(k.x, k.y + k.r * 0.08, k.r * 1.6, 0.5)
        }
      })
    }
  })
  let lastCamX = 0, lastCamY = 0

  return {
    view,
    advance(t, camX = lastCamX, camY = lastCamY, halfW = 2400, halfH = 2400) {
      lastCamX = camX; lastCamY = camY
      // The camera's reach, with a margin so nothing pops in at the edge.
      const vx0 = camX - halfW * 1.25, vx1 = camX + halfW * 1.25
      const vy0 = camY - halfH * 1.25, vy1 = camY + halfH * 1.25
      // HYSTERESIS: shown at 1.25x the view, hidden only past 1.6x. Every
      // visible flip is a structure change on the world (a rebuild of all of
      // it), and the four layers' chunk ends nearly line up, so a hard edge
      // meant bursts of four rebuilds each time the camera crossed one.
      const ox0 = camX - halfW * 1.6, ox1 = camX + halfW * 1.6
      const oy0 = camY - halfH * 1.6, oy1 = camY + halfH * 1.6
      // Every layer runs the way the water does, each at its own pace. Only
      // the chunks in reach are shown or scrolled.
      for (const l of strips) {
        const on = l.mesh.visible
          ? l.x1 > ox0 && l.x0 < ox1 && l.y1 > oy0 && l.y0 < oy1
          : l.x1 > vx0 && l.x0 < vx1 && l.y1 > vy0 && l.y0 < vy1
        if (l.mesh.visible !== on) l.mesh.visible = on
        if (!on) continue
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
        // Kelp in reach only (a bed is a few hundred px; the margin covers it).
        const on = d.sp.visible
          ? d.x > ox0 - 600 && d.x < ox1 + 600 && d.y > oy0 - 600 && d.y < oy1 + 600
          : d.x > vx0 - 600 && d.x < vx1 + 600 && d.y > vy0 - 600 && d.y < vy1 + 600
        if (d.sp.visible !== on) d.sp.visible = on
        if (!on) continue
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
