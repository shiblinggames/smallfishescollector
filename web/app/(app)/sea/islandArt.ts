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

export /** The old flat lift, kept only as the floor `islandLift` clamps to. */
const ISLAND_LIFT = 15

/**
 * ── HOW FAR AN ISLAND STANDS OUT OF THE WATER ───────────────────────────────
 *
 * In SCREEN pixels. Everything with height divides by GROUND to convert that
 * into the squashed layer's own units, so a lift stays the same on screen
 * however the plane is tilted.
 *
 * ── IT USED TO BE 15 FOR EVERYTHING, AND THAT IS THE BUG ────────────────────
 *
 * One number, from a 420px cay to the 1000px Mainland. Thirty screen pixels of
 * cliff either way: seven percent of the cay's width and THREE of the
 * Mainland's — so the bigger an island got, the flatter it read, which is
 * exactly backwards. A house on the Mainland stands a hundred and fifty pixels
 * tall on land with thirty pixels of edge, and no amount of painting on the top
 * face fixes a shape with no side to it.
 *
 * A FRACTION OF ITS OWN SIZE, then — but a SMALL one, and the first attempt at
 * this got that badly wrong. It went to 5.5% of the box, which put a hundred
 * and forty pixels of sheer drop round the Mainland, and the whole chart turned
 * into mesas: every island a plateau, and mooring at one felt like tying up
 * against a cliff face. Reported exactly that way.
 *
 * THE EXTRUSION IS THE SAME HEIGHT ALL THE WAY ROUND, and that is the thing
 * that does not scale. A real island is a cliff on one side and a beach you can
 * walk up on the other; a uniform ring of rock is a cliff EVERYWHERE, so every
 * pixel added to it is added to the shore you arrive at. Past about forty
 * pixels of drop it stops reading as land with some height and starts reading
 * as a wall.
 *
 * So it went to 2.5%, which was safe and did not do very much.
 *
 * ── AND THEN THE CLIFF STOPPED BEING UNIFORM ────────────────────────────────
 *
 * `liftAt` puts the height on ONE SIDE and shelves the other to a lip, and the
 * side it shelves is the one the berth is on. That changes what this number is
 * allowed to be: it is the height of a HEADLAND now, seen across the island,
 * not the height of the wall you tie up against. The berth sees about a sixth
 * of it whatever it says.
 *
 * 3.5%. The Mainland gets a seventy-eight pixel headland and a fourteen pixel
 * beach where you moor. Still barely half the hundred and forty that was
 * rejected, and none of it is at the shore that was the complaint.
 *
 * AND SEEDED, gently. Ten islands at one proportion is ten of the same island
 * at different scales, but this is a tenth of the swing the first pass used:
 * character, not a different landform.
 */
export function islandLift(id: string, d: number): number {
  const seed = (seedOf(id) % 1000) / 1000
  const base = Math.min(46, Math.max(15, d * 0.035))
  return Math.round(base * (0.85 + seed * 0.3))
}

/**
 * ── WHERE THE BERTH IS, AS A BEARING ────────────────────────────────────────
 *
 * `berthOf` puts the mooring circle at (+0.85r, +0.60r) from an island's
 * centre, which is east-south-east. Written here rather than imported because
 * chart.ts imports FROM this file's neighbours and the cycle is not worth one
 * arctangent.
 */
const BERTH_A = Math.atan2(0.60, 0.85)

/**
 * ── HOW HIGH THE LAND STANDS, AT ONE BEARING ────────────────────────────────
 *
 * A CLIFF ON ONE SIDE, A BEACH ON THE OTHER. This is the whole of what the
 * uniform lift could not do, and the reason it could not: an extrusion that is
 * the same height all the way round is a cliff EVERYWHERE, so every pixel of
 * height is also a pixel of wall at the place you moor. Taking it out again
 * fixed the docking and left the island flat.
 *
 * Varying it fixes both at once. The land rises to a headland on one side and
 * shelves to nothing on the other, which is what a coast actually looks like —
 * and it means the island can carry real vertical mass on the side you SEE it
 * from without putting any of it where you arrive.
 *
 * ── THE LOW SIDE IS THE BERTH SIDE, AND THAT IS NOT A COINCIDENCE ───────────
 *
 * The one place every captain approaches an island is its mooring circle, so
 * that is the one bearing guaranteed to be a beach. The high side is opposite
 * it, jittered per island so ten coasts do not all lean the same way, and the
 * jitter is bounded well short of reaching the berth.
 *
 * Never quite zero: 16% keeps a lip of rock at the waterline even at the
 * beach, because land that meets the sea at exactly nothing has no edge and
 * goes back to reading as a decal.
 */
export function liftAt(id: string, d: number, angle: number): number {
  const L = islandLift(id, d)
  const jit = ((((seedOf(id) >>> 5) % 1000) / 1000) - 0.5) * 1.1
  const hi = BERTH_A + Math.PI + jit
  const k = (1 + Math.cos(angle - hi)) / 2
  return L * (0.16 + 0.84 * k)
}

/** The lift at a point given as a percentage of the island's box — which is how
 *  chart.ts places every building. */
export function liftAtPoint(id: string, d: number, xPct: number, yPct: number): number {
  return liftAt(id, d, Math.atan2(yPct - 50, xPct - 50))
}

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
 * ── FORGET THE BAYS YOU HAVE LEFT ───────────────────────────────────────────
 *
 * `islandCache` is keyed by island and never let anything go, which was right
 * while every island on the chart was worth keeping for the session and became
 * a leak the moment the campaign started culling to one bay. The renderer drops
 * an island's SPRITE when you leave its water; the canvas behind it stayed, so
 * sailing out to the fifth chapter accumulated all forty-four campaign isles on
 * the way — the exact pile the cull was added to prevent, arrived at by a
 * different road.
 *
 * These are not small. A 340px isle bakes to about a thousand pixels square at
 * this dpr, which is four megabytes each, and a phone has a budget for perhaps
 * thirty. Past it the compositor stops being able to hand out backing surfaces,
 * and the first thing that costs you is every CSS-filtered mark on the chart
 * quietly failing to paint — a bay full of ships that are mounted, positioned,
 * and invisible.
 *
 * So the renderer says which islands are still on the chart and everything else
 * is dropped. Coming back re-bakes, which costs a frame and is the correct
 * trade against carrying four bays you cannot see.
 */
export function evictIslandsExcept(keep: Set<string>) {
  for (const key of [...islandCache.keys()]) {
    // Keys are `${id}:${d}:${locked}` and ids never contain a colon.
    if (!keep.has(key.slice(0, key.indexOf(':')))) islandCache.delete(key)
  }
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
  const LIFT = islandLift(id, d)
  /** The island's own character, 0..1, off the same hash as everything else
   *  about it. Drives the palette below. */
  const chr = ((seedOf(id) >>> 9) % 1000) / 1000

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

  // ── THE SHOAL WASHES ARE GONE ────────────────────────────────────
  //
  // Three blurred rings at 1.12, 0.98 and 0.86 of the island box, painted into
  // this canvas. They are the rings that were still showing after the two
  // animated DOM ones were removed, and they were the more static of the two:
  // baked into the island's own texture, they could not have moved if they
  // wanted to.
  //
  // The shore belongs to the water now — seaWater draws it as distance to the
  // nearest coast with the bands running shorewards. Leaving these in would put
  // a painted ring under a moving surf, and the ring would win, because it is
  // attached to the land and the surf is attached to the sea.

  // ── contact shadow, thrown toward the light's opposite ───────────
  blurred((g) => {
    trace(g, 0.78, C + LIFT * 0.34, C + LIFT * 0.5)
    g.fillStyle = 'rgba(2,10,18,0.42)'
    g.fill()
  }, 9)

  // ── cliff + top face, on their own layer so `locked` can grey them
  //    without touching the water ────────────────────────────────────
  const land = document.createElement('canvas')
  land.width = cv.width; land.height = cv.height
  const lg = land.getContext('2d')!
  lg.scale(dpr, dpr)
  // The MEAN lift, for the soft passes — the crown wash, the rim light and the
  // inset shadow. Those are broad gradients placed roughly against the top
  // face; giving each of them its own per-bearing profile would be arithmetic
  // nobody could see. The two things whose SHAPE is the land — the cliff and
  // the face — take the profile itself. See liftAt.
  const lift = (LIFT * 0.58) / GROUND

  /**
   * Trace the coast at a scale, displaced vertically by a PROFILE rather than a
   * constant — `up` is how far this bearing's land stands above the plane, and
   * the sign is the caller's (the cliff hangs below, the face sits above).
   */
  const traceL = (scale: number, sign: number) => {
    lg.beginPath()
    for (let i = 0; i < rs.length; i++) {
      const a = (Math.PI * 2 * i) / rs.length
      const r = (rs[i] / 100) * d * scale
      const x = C + Math.cos(a) * r
      const y = C + sign * (liftAt(id, d, a) / GROUND) + Math.sin(a) * r
      if (i === 0) lg.moveTo(x, y); else lg.lineTo(x, y)
    }
    lg.closePath()
  }

  // the cliff, dropped — deep under the headland, barely there at the beach
  traceL(0.74, 1)
  lg.fillStyle = grad165(lg, 0.74, [[0, '#3b3226'], [0.55, '#2a2419'], [1, '#191509']])
  lg.fill()

  // Rock over the cliff, gently — it is in shadow and mostly edge, so the
  // texture is there to break the flat brown rather than to be read.
  paintGround(lg, GROUND_TEX.rock, D, seedOf(id) * 7, 0.3)

  // the face, lifted, everything inside clipped to it
  lg.save()
  traceL(0.74, -1)
  lg.clip()
  const face = (scale: number, fill: string | CanvasGradient) => {
    traceL(0.74 * scale, -1)
    lg.fillStyle = fill
    lg.fill()
  }
  // ── AND NOT ALL THE SAME LAND ────────────────────────────────────
  //
  // Every island was these exact five bands: one sand, one green, ten times
  // over. Read as one island at ten sizes, which is most of what "they all
  // look the same" is — the silhouettes differ more than the surfaces do.
  //
  // `chr` swings the whole ramp between two coasts, and the shift is applied to
  // ALL FIVE BANDS TOGETHER so a single island still reads as one place. Warm
  // and pale at 0 (limestone and dry scrub, a Mediterranean rock); cool and
  // dark at 1 (basalt and wet green, somewhere further north).
  //
  // SMALL ON PURPOSE. These are hand-painted assets in a fixed house style and
  // a big hue swing would put an island outside it. The most this moves any
  // channel is about a sixth, which is the difference between two beaches
  // rather than between two games.
  const tone = (hex: string, warmCool: number) => {
    const n = parseInt(hex.slice(1), 16)
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    // Toward cool: red down, blue up, everything a shade darker.
    const k = (warmCool - 0.5) * 2
    r = Math.round(Math.min(255, Math.max(0, r * (1 - k * 0.10))))
    g = Math.round(Math.min(255, Math.max(0, g * (1 - k * 0.03))))
    b = Math.round(Math.min(255, Math.max(0, b * (1 + k * 0.13))))
    const dim = 1 - k * 0.06
    r = Math.round(r * dim); g = Math.round(g * dim); b = Math.round(b * dim)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }
  const T = (hex: string) => tone(hex, chr)
  face(10, grad165(lg, 0.74, [[0, T('#c0a276')], [0.55, T('#a78452')], [1, T('#85693f')]]))
  face(0.97, grad165(lg, 0.72, [[0, T('#d0b792')], [1, T('#bf9e71')]]))
  face(0.90, grad165(lg, 0.67, [[0, T('#dbc6a4')], [1, T('#c7ab7f')]]))
  face(0.81, grad165(lg, 0.60, [[0, T('#afb65f')], [1, T('#909b45')]]))
  face(0.70, grad165(lg, 0.52, [[0, T('#7a9c44')], [0.62, T('#5c7d36')], [1, T('#4c6b2d')]]))

  // TURF OVER ALL FIVE BANDS AT ONCE, inside the face clip that is still open,
  // so the beach reads as sand and the middle as grass without either needing
  // its own texture. The crown, the woods and the rim light are drawn after
  // this and keep sitting on top, which is the whole reason it goes on here
  // rather than last.
  paintGround(lg, GROUND_TEX.turf, D, seedOf(id), 0.42)

  // ── THE CROWN — higher ground catching the light ─────────────────
  //
  // OFF CENTRE, AND SOMEWHERE DIFFERENT ON EACH ISLAND. It sat at a fixed small
  // offset up and left on every one, which reads as a target: a disc with a
  // bright ring in the middle of it. Real high ground is to one END of an
  // island, and which end is the first thing that makes two islands look like
  // two places rather than one shape drawn twice.
  //
  // Pushed out to 40% of the crown's own radius, on a seeded bearing, and kept
  // biased upward — the light comes from the upper left and high ground that
  // catches it should be on the side facing it.
  {
    const R = d * 0.74 * 0.48 * 0.63
    const bearing = ((seedOf(id) >>> 17) % 1000) / 1000 * Math.PI * 2
    const off = R * 0.40
    const cx = C - R * 0.2 + Math.cos(bearing) * off
    const cy = C - lift - R * 0.55 + Math.sin(bearing) * off * 0.7
    const rg = lg.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35)
    rg.addColorStop(0, 'rgba(190,206,140,0.55)')
    rg.addColorStop(0.48, 'rgba(150,176,105,0.22)')
    rg.addColorStop(0.78, 'rgba(150,176,105,0)')
    lg.fillStyle = rg
    lg.fillRect(0, 0, D, D)
  }

  // ── THE WOODS ARE GONE ───────────────────────────────────────────
  //
  // Nine seeded radial clumps of dark green, meant to read as canopy from
  // above. They read as dark circles, because that is what a soft radial
  // gradient is: at chart size there was no canopy in them, only nine blobs on
  // a lawn. The painted turf underneath does the job they were doing - it has
  // real brushwork, scrub and worn ground in it - and it does not need nine
  // discs sitting on top saying "trees".

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
  traceL(0.74, -1)
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
