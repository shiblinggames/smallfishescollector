// ── THE ISLAND BAKERY ───────────────────────────────────────────────────────
//
// Everything that PAINTS an island, lifted out of SeaMap so it can have more
// than one consumer.
//
// It moved because the chart is being tried on a GPU renderer (see
// ./pixi/PixiBench), and this is the piece that decides whether that is a small
// job or a large one. `bakeIsland` already returns a finished HTMLCanvasElement
// and a canvas is a texture source — so if the new renderer can call this
// function, every island arrives on the GPU looking EXACTLY as it does now:
// cliff, crown, wood clumps, rim light, painted turf and all, with none of the
// art re-derived and nothing left to match up by eye.
//
// A PURE MOVE. Not one number, colour or path changed in the lift. The only
// edits are the `export` keywords, and GROUND and ISLAND_LIFT coming along
// because a bakery cannot describe a raised, foreshortened island without them.
// SeaMap imports the whole lot straight back, which is what makes the move
// verifiable: had anything been dropped, it would not compile.

import { coastline } from '@/lib/islandShape'

/** How far the ground plane is squashed toward the camera. The whole chart's
 *  sense of being a surface rather than a map comes from this one number. */
export const GROUND = 0.58

export /** How far an island stands out of the water, in SCREEN pixels. Everything
 *  with height divides by GROUND to convert that into the squashed layer's own
 *  units, so the lift stays the same on screen however the plane is tilted. */
const ISLAND_LIFT = 15

/**
 * ── THE ISLAND BAKERY ──────────────────────────────────────────────────────
 *
 * An island used to be ~14 stacked divs: three blurred shoal washes, a blurred
 * contact shadow, a cliff, and a top face holding five terrain bands, a crown,
 * nine canopy blobs, a rim light and an inset shadow — every one clipped by a
 * 160-point polygon, several carrying CSS blur() filters. All static, and all
 * re-RASTERISED by the browser whenever the tiles they sit in scroll back into
 * view or get evicted under memory pressure — which on a phone around the
 * Mainland (four big islands and the reef in one screen) is constantly. The
 * probe read it as raster hitches with a cheap loop: exactly the signature.
 *
 * So the static stack is painted ONCE into a canvas per island and shown as a
 * single image. The two breathing surf rings stay as DOM: they animate
 * transform/opacity under will-change, which composites from a texture
 * rasterised once, so they were never the problem.
 *
 * CSS blur() is reproduced by the downscale trick — draw the shape into a
 * small offscreen and scale it back up smoothed — rather than ctx.filter,
 * which iOS Safari only gained recently. It is not gaussian-exact; on soft
 * water washes nobody can tell.
 *
 * DPR is capped at 1.25: the art is deliberately soft, the Mainland's canvas
 * is over a thousand CSS pixels across, and full-retina raster for four big
 * islands is exactly the memory pressure this exists to relieve.
 */
const islandCache = new Map<string, HTMLCanvasElement>()

/**
 * ── THE PAINTED GROUND ──────────────────────────────────────────────────────
 *
 * The islands were smooth vector gradients sitting under hand-painted
 * buildings, and that reads as a sticker under a drawing. It gets reported as
 * "the perspective does not match", which it does: the light here already runs
 * from the upper left exactly as the buildings' does, and the ground plane's
 * GROUND squash is a 35 degree camera against their 30. What was missing was
 * not angle, it was SURFACE - a gradient has no brushwork in it, so there is
 * nothing for the eye to read as the same hand.
 *
 * So two painted textures are laid over the bands the gradients already
 * establish. OVER, never instead of: every fill below stays exactly as tuned,
 * and the texture goes on at partial strength in `overlay`, so the crown
 * highlight, the woods, the rim light and the coast shadow all still do their
 * modelling and the paint only gives them a surface to happen on.
 *
 * DRAWN TO FIT, NOT TILED. A generated texture is never truly seamless and a
 * visible repeat across an island is worse than no texture at all, so each one
 * is drawn once, scaled to cover, and rotated by the island's own seed so two
 * islands do not wear the same patch of grass.
 *
 * ASYNC INTO A SYNCHRONOUS BAKE. The bake is deliberately synchronous - it runs
 * in the ref callback so an island is painted in the frame it mounts rather
 * than a frame later. An image cannot be. So the first bake simply goes without
 * the texture, exactly as it does today, and when the files land the cache is
 * dropped and every mounted island repaints itself once.
 */
const GROUND_TEX: { turf?: HTMLImageElement; rock?: HTMLImageElement; done?: boolean } = {}
const groundWaiters = new Set<() => void>()

export function requestGround(repaint: () => void) {
  if (GROUND_TEX.done) return
  groundWaiters.add(repaint)
  if (GROUND_TEX.turf) return
  if (typeof window === 'undefined') return

  let left = 2
  const settle = () => {
    if (--left > 0) return
    GROUND_TEX.done = true
    // Everything baked before the paint arrived was baked without it.
    islandCache.clear()
    for (const again of groundWaiters) again()
    groundWaiters.clear()
  }
  const load = (src: string, key: 'turf' | 'rock') => {
    const img = new Image()
    img.decoding = 'async'
    // A texture that never arrives must not leave the islands unpainted, so a
    // failure settles the same as a success and the gradients simply stand.
    img.onload = () => { GROUND_TEX[key] = img; settle() }
    img.onerror = settle
    img.src = src
  }
  GROUND_TEX.turf = new Image()   // claims the slot so this only runs once
  load('/sea/ground-turf.png', 'turf')
  load('/sea/ground-rock.png', 'rock')
}

/** The same string hash `coastline` uses, so an island's turf is turned by the
 *  same number that shaped its coast. */
function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/** Lay one texture over whatever is already on `g`, confined to the pixels
 *  that are already opaque. `seed` turns it so no two islands match. */
function paintGround(
  g: CanvasRenderingContext2D, img: HTMLImageElement | undefined,
  D: number, seed: number, alpha: number,
) {
  if (!img || !img.width) return
  g.save()
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = alpha
  g.translate(D / 2, D / 2)
  g.rotate((seed % 360) * Math.PI / 180)
  // NEAR ITS OWN SIZE, and this is the whole difference between paint and a
  // tint. It was drawn at D * 1.5, which for the Mainland blew a 768px texture
  // up to 1812 and then showed the island only the middle third of it: every
  // brush mark smeared past the point of being a mark, and the result was a
  // faint tonal wash indistinguishable from the gradient underneath.
  //
  // The land is about 0.68 of the box across, so this covers it roughly once at
  // the texture native resolution. Still generous enough that a rotation cannot
  // uncover a corner: the island sits inside a circle of radius 0.34 d and this
  // covers one of 0.39 d whichever way it is turned.
  const cover = D * 0.78
  g.drawImage(img, -cover / 2, -cover / 2, cover, cover)
  g.restore()
}

/**
 * THE SURF RINGS, pre-blurred at low resolution.
 *
 * Baked separately from the island because they MOVE: the breathing animation
 * needs its own element. But each ring was an island-sized blurred clipped div
 * promoted to its own GPU layer at device resolution — around the Mainland,
 * eight such layers, on the order of ninety megabytes of texture on an iPhone.
 * Past the compositor's budget it de-promotes and re-runs a Gaussian blur
 * through a 160-point clip per ring per frame. As a canvas the texture is the
 * backing store, and the backing store is drawn at half size — the content is
 * a blur, so the resolution is genuinely irrelevant.
 */
const surfCache = new Map<string, HTMLCanvasElement>()

export function bakeSurf(id: string, d: number, scale: number, color: string, blurPx: number): HTMLCanvasElement {
  const key = `${id}:${d}:${scale}`
  const hit = surfCache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = Math.max(32, Math.round(d * 0.5))
  cv.height = cv.width
  const rs = coastline(id)
  const k = Math.max(2, Math.round(blurPx / 2))
  const small = document.createElement('canvas')
  small.width = Math.max(8, Math.round(cv.width / k))
  small.height = small.width
  const sg = small.getContext('2d')!
  const su = small.width / d
  sg.beginPath()
  for (let i = 0; i < rs.length; i++) {
    const a = (Math.PI * 2 * i) / rs.length
    const r = (rs[i] / 100) * d * scale * su
    const x = small.width / 2 + Math.cos(a) * r
    const y = small.height / 2 + Math.sin(a) * r
    if (i === 0) sg.moveTo(x, y); else sg.lineTo(x, y)
  }
  sg.closePath()
  sg.fillStyle = color
  sg.fill()
  const g = cv.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(small, 0, 0, cv.width, cv.height)
  surfCache.set(key, cv)
  return cv
}


export function bakeIsland(id: string, d: number, locked: boolean, pad: number): HTMLCanvasElement {
  const key = `${id}:${d}:${locked ? 1 : 0}`
  const hit = islandCache.get(key)
  if (hit) return hit

  const dpr = Math.min(1.25, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const D = d + pad * 2
  const cv = document.createElement('canvas')
  cv.width = Math.round(D * dpr)
  cv.height = Math.round(D * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  const rs = coastline(id)
  const C = pad + d / 2

  /** Trace the coast at a scale of the island box, optionally offset. */
  const trace = (g: CanvasRenderingContext2D, scale: number, cx = C, cy = C) => {
    g.beginPath()
    for (let i = 0; i < rs.length; i++) {
      const a = (Math.PI * 2 * i) / rs.length
      const r = (rs[i] / 100) * d * scale
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.closePath()
  }

  /** A 165deg linear gradient across a band's bounding box, like the CSS. */
  const grad165 = (g: CanvasRenderingContext2D, scale: number, stops: [number, string][]) => {
    const R = d * scale * 0.63
    const lg = g.createLinearGradient(C - R * 0.26, C - R, C + R * 0.26, C + R)
    for (const [at, col] of stops) lg.addColorStop(at, col)
    return lg
  }

  /** The blur(): draw into an offscreen at 1/k scale, upscale smoothed. Two
   *  passes for the big radii so the softness has no visible steps. */
  const blurred = (draw: (g: CanvasRenderingContext2D, s: number) => void, blurPx: number) => {
    const k = Math.max(2, Math.min(10, Math.round(blurPx / 2)))
    const small = document.createElement('canvas')
    small.width = Math.max(8, Math.round((D * dpr) / k))
    small.height = small.width
    const sg = small.getContext('2d')!
    sg.scale((small.width / D), (small.width / D))
    draw(sg, 1)
    const mid = document.createElement('canvas')
    mid.width = Math.max(16, Math.round((D * dpr) / 2))
    mid.height = mid.width
    const mg = mid.getContext('2d')!
    mg.imageSmoothingQuality = 'high'
    mg.drawImage(small, 0, 0, mid.width, mid.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(mid, 0, 0, D, D)
  }

  // ── the shoal washes ─────────────────────────────────────────────
  for (const [scale, col, blur] of [
    [1.12, 'rgba(140,190,206,0.13)', 16],
    [0.98, 'rgba(168,204,216,0.22)', 8],
    [0.86, 'rgba(200,222,230,0.30)', 2],
  ] as [number, string, number][]) {
    blurred((g, _s) => { trace(g, scale); g.fillStyle = col; g.fill() }, blur)
  }

  // ── contact shadow, thrown toward the light's opposite ───────────
  blurred((g) => {
    trace(g, 0.78, C + ISLAND_LIFT * 0.34, C + ISLAND_LIFT * 0.5)
    g.fillStyle = 'rgba(2,10,18,0.42)'
    g.fill()
  }, 9)

  // ── cliff + top face, on their own layer so `locked` can grey them
  //    without touching the water ────────────────────────────────────
  const land = document.createElement('canvas')
  land.width = cv.width; land.height = cv.height
  const lg = land.getContext('2d')!
  lg.scale(dpr, dpr)
  const lift = ISLAND_LIFT / GROUND

  const traceL = (scale: number, dy = 0) => {
    lg.beginPath()
    for (let i = 0; i < rs.length; i++) {
      const a = (Math.PI * 2 * i) / rs.length
      const r = (rs[i] / 100) * d * scale
      const x = C + Math.cos(a) * r
      const y = C + dy + Math.sin(a) * r
      if (i === 0) lg.moveTo(x, y); else lg.lineTo(x, y)
    }
    lg.closePath()
  }

  // the cliff, dropped
  traceL(0.74, lift)
  lg.fillStyle = grad165(lg, 0.74, [[0, '#3b3226'], [0.55, '#2a2419'], [1, '#191509']])
  lg.fill()

  // Rock over the cliff, gently — it is in shadow and mostly edge, so the
  // texture is there to break the flat brown rather than to be read.
  paintGround(lg, GROUND_TEX.rock, D, seedOf(id) * 7, 0.3)

  // the face, lifted, everything inside clipped to it
  lg.save()
  traceL(0.74, -lift)
  lg.clip()
  const face = (scale: number, fill: string | CanvasGradient) => {
    traceL(0.74 * scale, -lift)
    lg.fillStyle = fill
    lg.fill()
  }
  face(10, grad165(lg, 0.74, [[0, '#b9a077'], [0.55, '#9c8259'], [1, '#7d6743']]))
  face(0.97, grad165(lg, 0.72, [[0, '#cbb590'], [1, '#b89c72']]))
  face(0.90, grad165(lg, 0.67, [[0, '#d8c49f'], [1, '#c2a97e']]))
  face(0.81, grad165(lg, 0.60, [[0, '#9aa269'], [1, '#7d8850']]))
  face(0.70, grad165(lg, 0.52, [[0, '#6f8a4e'], [0.62, '#55703c'], [1, '#466032']]))

  // TURF OVER ALL FIVE BANDS AT ONCE, inside the face clip that is still open,
  // so the beach reads as sand and the middle as grass without either needing
  // its own texture. The crown, the woods and the rim light are drawn after
  // this and keep sitting on top, which is the whole reason it goes on here
  // rather than last.
  paintGround(lg, GROUND_TEX.turf, D, seedOf(id), 0.42)

  // the crown — higher ground catching the light
  {
    const R = d * 0.74 * 0.48 * 0.63
    const cx = C - R * 0.2, cy = C - lift - R * 0.55
    const rg = lg.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35)
    rg.addColorStop(0, 'rgba(190,206,140,0.55)')
    rg.addColorStop(0.48, 'rgba(150,176,105,0.22)')
    rg.addColorStop(0.78, 'rgba(150,176,105,0)')
    lg.fillStyle = rg
    lg.fillRect(0, 0, D, D)
  }

  // the woods — the same nine seeded clumps the DOM drew
  {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 37 + id.charCodeAt(i)) >>> 0
    let st = h || 1
    const nx = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 0x100000000 }
    const faceD = d * 0.74
    for (let i = 0; i < 9; i++) {
      const a = nx() * Math.PI * 2
      const rad = 4 + nx() * 19
      const bx = C + ((Math.cos(a) * rad) / 100) * faceD
      const by = C - lift + ((Math.sin(a) * rad * 0.9) / 100) * faceD
      const rw = ((7 + nx() * 11) / 100) * faceD
      const o = 0.20 + nx() * 0.26
      const gx = bx - rw * 0.08, gy = by - rw * 0.13
      const rg = lg.createRadialGradient(gx, gy, 0, gx, gy, rw * 0.78)
      rg.addColorStop(0, `rgba(74,102,52,${o + 0.18})`)
      rg.addColorStop(0.55, `rgba(46,68,34,${o})`)
      rg.addColorStop(0.78, 'rgba(40,58,30,0)')
      lg.save()
      lg.translate(bx, by)
      lg.scale(1, 0.82)
      lg.translate(-bx, -by)
      lg.fillStyle = rg
      lg.beginPath()
      lg.arc(bx, by, rw, 0, Math.PI * 2)
      lg.fill()
      lg.restore()
    }
  }

  // rim light where the sky hits the top edge
  {
    const top = C - lift - d * 0.74 * 0.63
    const rim = lg.createLinearGradient(0, top, 0, top + d * 0.74 * 1.26 * 0.2)
    rim.addColorStop(0, 'rgba(240,248,250,0.34)')
    rim.addColorStop(1, 'rgba(240,248,250,0)')
    lg.fillStyle = rim
    lg.fillRect(0, 0, D, D)
  }

  // the inset shadow the DOM did with box-shadow: a fat blurred stroke on the
  // coast, of which the clip keeps only the inner half
  lg.lineWidth = 64
  lg.strokeStyle = 'rgba(0,0,0,0.34)'
  lg.filter = 'blur(0px)'
  traceL(0.74, -lift)
  lg.stroke()
  lg.lineWidth = 26
  lg.strokeStyle = 'rgba(0,0,0,0.22)'
  lg.stroke()

  // brightness(0.94)-ish
  lg.fillStyle = 'rgba(12,16,12,0.06)'
  lg.fillRect(0, 0, D, D)
  lg.restore()

  if (locked) {
    lg.globalCompositeOperation = 'saturation'
    lg.fillStyle = 'rgb(120,120,120)'
    lg.fillRect(0, 0, D, D)
    lg.globalCompositeOperation = 'source-atop'
    lg.fillStyle = 'rgba(0,0,0,0.45)'
    lg.fillRect(0, 0, D, D)
    lg.globalCompositeOperation = 'source-over'
  }

  ctx.drawImage(land, 0, 0, D, D)
  islandCache.set(key, cv)
  return cv
}

/**
 * A PIECE OF LAND, painted.
 *
 * Everything that makes an island look like an island and nothing that makes it
 * a PLACE: no buildings, no label, no dock. Sized entirely by its parent — every
 * layer in here is an absolute inset in percent, so the caller decides how big
 * the rock is and this decides what it looks like.
 *
 * Pulled out of `PlaceIsland` when the discoverable isles arrived. They are the
 * same land: same coastline generator, same terrain bands, same surf, same
 * extrusion. Copying 130 lines of tuned layers to a second component would have
 * meant two islands that drift apart on the first edit, and this stack has been
 * measured and re-measured (see THE COASTLINE) in a way that is not worth doing
 * twice.
 *
 * `id` is the seed. Two things with the same id are the same rock, and every
 * shape on this chart is therefore stable across renders and reloads.
 */
