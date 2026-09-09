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
 * ── A LANDING IS A NOTCH, NOT A HALF OF THE ISLAND ──────────────────────────
 *
 * The first cut of this was one cosine: high opposite the berth, low at it.
 * That does fix the docking, and it flattens far more coast than it needs to.
 * A cosine is half the island low — and because of how the extrusion draws
 * (the base outline sits inside the face outline at the far side, so the wall
 * only ever SHOWS on the near shore) the half it flattens is the only half you
 * can see. The islands went back to reading as flat, and the height was still
 * there; it was just all behind the land.
 *
 * So the beach is a NOTCH now, a gaussian about a quarter of the way round,
 * centred on the mooring circle and jittered per island. Land where you land,
 * cliff along the rest of the near shore, which is what you actually want to
 * sail past on the way in.
 *
 * Under it, a TWO-FOLD RIDGE: high at both ends of a seeded line, low at both
 * flanks. Two headlands is what an island stretched along an axis has, and the
 * axis it is stretched along comes off the same kind of seed in `coastline`.
 *
 * Never quite zero at the notch. A shore that meets the sea at exactly nothing
 * has no edge and goes back to reading as a decal — it wants a lip of wet sand,
 * which is what the wall paints there now. See PALETTES.
 */
export function liftAt(id: string, d: number, angle: number): number {
  const L = islandLift(id, d)
  const seed = seedOf(id)

  // the ridge: two headlands, on a line of this island's own
  const crest = (((seed >>> 11) % 1000) / 1000) * Math.PI
  const ridge = 0.60 + 0.40 * ((1 + Math.cos(2 * (angle - crest))) / 2)

  // the landing, cut into it
  const jit = ((((seed >>> 5) % 1000) / 1000) - 0.5) * 0.9
  let da = angle - (BERTH_A + jit * 0.35)
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2
  const shore = Math.exp(-(da * da) / (2 * 0.72 * 0.72))

  return L * ridge * (1 - 0.88 * shore)
}

/** The wall's height at a bearing as a FRACTION of the island's own tallest —
 *  0.07ish on the landing, 1 at a headland. What the wall is painted by. */
export function shoreness(id: string, d: number, angle: number): number {
  return liftAt(id, d, angle) / Math.max(1, islandLift(id, d))
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
const GROUND_TEX: {
  turf?: HTMLImageElement; rock?: HTMLImageElement; done?: boolean
  turfG?: HTMLCanvasElement; rockG?: HTMLCanvasElement
} = {}

/**
 * ── A TEXTURE THAT CARRIES GRAIN AND NOT COLOUR ─────────────────────────────
 *
 * `ground-turf.png` is a fully opaque painting with a mean of (185,185,121),
 * and it was going on `source-atop` at 0.42 — which does not texture the land,
 * it REPLACES 42% of it with one shared yellow-green. Every island, the same
 * 42%. Measured across the ten ports, the authored separation between palettes
 * in the green band ran 2 to 91 and what reached the screen was 1 to 50: half
 * the difference thrown away, and the dark palettes — basalt, jungle, redstone
 * — crushed into each other, because the darker a colour is the more a fixed
 * blend toward a light one dominates it.
 *
 * That is why five whole palettes still looked like one. It was not the
 * palettes.
 *
 * So the texture is desaturated and pulled toward mid grey once, and laid on in
 * `soft-light` instead. Grey soft-light contributes NO hue at all: it modulates
 * what is underneath, light where the paint is light and dark where it is dark,
 * and a chalk island stays chalk while a jungle island stays jungle. Pulling it
 * toward mid first is what keeps it a modulation rather than a bleach — a
 * texture whose mean sits well above mid lightens everything it touches.
 */
function greyed(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  // saturation-0 over the top keeps luminance and drops the hue entirely
  g.globalCompositeOperation = 'saturation'
  g.fillStyle = 'hsl(0,0%,50%)'
  g.fillRect(0, 0, c.width, c.height)
  // and half way to mid, so soft-light neither blows out nor crushes
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 0.5
  g.fillStyle = '#808080'
  g.fillRect(0, 0, c.width, c.height)
  return c
}
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
    if (GROUND_TEX.turf?.width) GROUND_TEX.turfG = greyed(GROUND_TEX.turf)
    if (GROUND_TEX.rock?.width) GROUND_TEX.rockG = greyed(GROUND_TEX.rock)
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
/**
 * ── TEN ISLANDS, ONE SET OF COLOURS ─────────────────────────────────────────
 *
 * Every island was five hardcoded bands: one sand ramp, one green ramp, ten
 * times over. A warm-to-cool dial went on top of that and it was not enough,
 * because a dial cannot make two DIFFERENT places — it makes one place at two
 * temperatures, and ten islands at ten temperatures still read as ten copies.
 *
 * These are five whole coasts instead, each with its own sand, its own scrub,
 * its own canopy and its own rock. An island draws one of them off its seed and
 * then the dial runs INSIDE it, so two Dunes still differ without either of
 * them straying out of the family.
 *
 * `rock` is the cliff wall, top to base. `beach` is what the wall becomes where
 * the land shelves down to the landing — see liftAt. Both are part of the
 * palette rather than one shared brown, because a chalk island with a basalt
 * cliff is two islands wearing one coat.
 */
type IslePalette = {
  name: string
  wet: [string, string, string]
  sand: [string, string]
  pale: [string, string]
  scrub: [string, string]
  green: [string, string, string]
  rock: [string, string]
  beach: [string, string]
}

const PALETTES: IslePalette[] = [
  { // warm limestone and dry olive scrub — the coast every island used to be
    name: 'dune',
    wet: ['#c0a276', '#a78452', '#85693f'],
    sand: ['#d0b792', '#bf9e71'],
    pale: ['#dbc6a4', '#c7ab7f'],
    scrub: ['#afb65f', '#909b45'],
    green: ['#7a9c44', '#5c7d36', '#4c6b2d'],
    rock: ['#4a3f30', '#221c12'],
    beach: ['#d9c19a', '#ab8f63'],
  },
  { // black sand and wet green over basalt, somewhere a long way north
    name: 'basalt',
    wet: ['#8a8378', '#6e6960', '#4e4a44'],
    sand: ['#9c968b', '#857f75'],
    pale: ['#aaa49a', '#948e84'],
    scrub: ['#5f8060', '#496548'],
    green: ['#357063', '#255449', '#1b3f37'],
    rock: ['#3b4148', '#14181d'],
    beach: ['#a39c92', '#6f6a62'],
  },
  { // bleached chalk, pale sand, bright turf on top
    name: 'chalk',
    wet: ['#cfc7b2', '#b6ad97', '#948c78'],
    sand: ['#e0d7c1', '#cbc1a8'],
    pale: ['#ece4d2', '#dad1bb'],
    scrub: ['#b9c06a', '#9aa350'],
    green: ['#86ab4e', '#6a8e3d', '#587a33'],
    rock: ['#8f8d82', '#4e4d46'],
    beach: ['#eae1cb', '#b8ae94'],
  },
  { // iron in the rock, terracotta and ochre, green only where it can hold on
    name: 'redstone',
    wet: ['#b98354', '#9c6a40', '#78502f'],
    sand: ['#cb9a6c', '#b8834f'],
    pale: ['#d9ae83', '#c4955f'],
    scrub: ['#b0a054', '#948232'],
    green: ['#8a8b39', '#6e6f2a', '#585921'],
    rock: ['#6b3f2c', '#2e1710'],
    beach: ['#d5a877', '#a87b4c'],
  },
  { // dark loam under a canopy that has never been cut back
    name: 'jungle',
    wet: ['#bd9d6e', '#9c7c4c', '#775c35'],
    sand: ['#cdb387', '#b99b68'],
    pale: ['#dbc59b', '#c7ad7d'],
    scrub: ['#69a03d', '#4d8029'],
    green: ['#2f8034', '#175a22', '#0d4019'],
    rock: ['#453a29', '#1c160d'],
    beach: ['#d6bd93', '#a88a5c'],
  },
]

/** Which coast this island is. Its own mix of the hash: the low bits already
 *  carry the lift jitter and the crest bearing, and reusing them would tie an
 *  island's colour to its shape for no reason. */
function paletteOf(id: string): IslePalette {
  const h = Math.imul(seedOf(id) ^ 0x5bf03635, 2246822519) >>> 0
  return PALETTES[h % PALETTES.length]
}

/** The dial itself. At module scope because the grass is tinted through it
 *  too, and an island whose meadow is a different family from its own bands is
 *  two islands. */
function toneHex(hex: string, warmCool: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  // Toward cool: red down, blue up, everything a shade darker.
  const k = (warmCool - 0.5) * 2
  r = Math.round(Math.min(255, Math.max(0, r * (1 - k * 0.085))))
  g = Math.round(Math.min(255, Math.max(0, g * (1 - k * 0.025))))
  b = Math.round(Math.min(255, Math.max(0, b * (1 + k * 0.11))))
  const dim = 1 - k * 0.055
  r = Math.round(r * dim); g = Math.round(g * dim); b = Math.round(b * dim)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Blend two `#rrggbb` by t. */
function mixHex(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16)
  const k = Math.min(1, Math.max(0, t))
  const c = (sh: number) => Math.round(
    ((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * k)
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`
}

function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/**
 * THIS ISLAND'S GRASS, as a Pixi tint.
 *
 * The tuft plate in seaGrass is greyscale and the mesh multiplies by this, so
 * one plate is basalt grass on one island and jungle grass on the next with no
 * second texture anywhere.
 *
 * Lifted toward white before tinting. The plate is dark at the root and a
 * multiply only ever darkens, so tinting with the band colour itself grows
 * grass darker than the ground it stands on — which reads as a shadow lying on
 * the meadow rather than as the meadow.
 */
export function grassTint(id: string): number {
  const pal = paletteOf(id)
  const chr = ((seedOf(id) >>> 9) % 1000) / 1000
  return parseInt(toneHex(mixHex(pal.green[0], '#ffffff', 0.24), chr).slice(1), 16)
}

/** Lay one texture over whatever is already on `g`, confined to the pixels
 *  that are already opaque. `seed` turns it so no two islands match. */
function paintGround(
  g: CanvasRenderingContext2D, img: HTMLCanvasElement | undefined,
  D: number, seed: number, alpha: number,
) {
  if (!img || !img.width) return
  g.save()
  // SOFT-LIGHT, on a grey plate. See `greyed` for why this is not source-atop:
  // an opaque texture laid over the land was replacing its colour rather than
  // giving it a surface, and it was doing it identically on all ten islands.
  g.globalCompositeOperation = 'soft-light'
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
  /** WHICH COAST THIS IS — one of five whole palettes, sand and scrub and
   *  canopy and rock together. See PALETTES. */
  const PAL = paletteOf(id)

  /** And where inside that family it sits, 0..1, off the same hash as
   *  everything else about the island. */
  const chr = ((seedOf(id) >>> 9) % 1000) / 1000

  /**
   * ── THE DIAL, NOW THAT IT IS ONLY A DIAL ────────────────────────────────
   *
   * This used to be the whole of an island's colour: five hardcoded bands with
   * a warm-to-cool shift over them. It was not enough and could not have been.
   * A dial makes ONE place at two temperatures, so ten islands on one dial are
   * ten copies of a coast at ten temperatures, which is exactly what they
   * looked like.
   *
   * PALETTES does the work now, and this only separates two islands that drew
   * the SAME palette — inside a family it wants to be the difference between
   * two beaches, not between two coasts. It was halved for that when PALETTES
   * arrived and that went too far: the two basalt ports came out two units
   * apart, which is no difference at all. Back most of the way up.
   *
   * Applied to every band and to the rock together, so an island still reads as
   * one place rather than as a green top on a grey bottom.
   */
  const T = (hex: string) => toneHex(hex, chr)

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

  /**
   * ── THE THREE OUTLINES, AND WHERE THE WATER IS ──────────────────────────
   *
   *   traceL(s, -1)  the TOP FACE, raised a lift above the plane
   *   traceL(s,  0)  the WATERLINE — the island's actual footprint on the sea
   *   traceL(s, +1)  the CLIFF BASE, a lift below it
   *
   * The wall is everything between the first and the last, and until now it was
   * ONE gradient across the whole of it: the same dark brown above the water
   * and below, painted opaque over the sea. Which is why the biggest islands
   * looked like they were sitting on a dark plinth. The wall was the only
   * vertical surface on the chart that did not know where the waterline was.
   *
   * The offsets are symmetric — the base is exactly as far below the plane as
   * the face is above it — so the submerged band is, to the pixel, WHERE THE
   * REFLECTION OF THE WALL GOES. It was already the right shape. It was just
   * painted as rock.
   *
   * The band is a crescent on the SOUTH shore and that is geometry, not a
   * choice: at due north the base outline sits inside the face outline and the
   * face covers it, at due east and west the two cross, and only on the near
   * side does the base clear the face. Which is the one place a reflection
   * would be visible anyway — the water in FRONT of the island.
   */
  /**
   * ── AND IT IS PAINTED PER BEARING, NOT AS ONE SHAPE ─────────────────────
   *
   * The wall used to be a single polygon under a single gradient, which is why
   * the landing was the same dark rock as the headland: one fill cannot know
   * that this quarter of the coast shelves and that one does not.
   *
   * So it is walked as quads, one per pair of the coastline's 160 points, each
   * one filled by ITS OWN height. `shoreness` is the wall's height there as a
   * fraction of the island's tallest — near zero at the landing, 1 at a
   * headland — and it drives the colour from `beach` to `rock` and the strength
   * of the reflection with it. A beach reflects almost nothing, because a beach
   * has almost nothing standing above the water to reflect.
   *
   * Each quad is stroked in its own fill as well as filled. Adjacent quads of
   * slightly different colours leave a hairline of background between them
   * otherwise — canvas antialiases both edges of a shared seam and neither
   * covers it.
   */
  const N = rs.length
  const bearing = (i: number) => (Math.PI * 2 * (i % N)) / N
  const radius = (i: number) => (rs[i % N] / 100) * d * 0.74
  const wx = (i: number) => C + Math.cos(bearing(i)) * radius(i)
  const wy = (i: number, sign: number) =>
    C + sign * (liftAt(id, d, bearing(i)) / GROUND) + Math.sin(bearing(i)) * radius(i)
  const quad = (i: number, s0: number, s1: number) => {
    lg.beginPath()
    lg.moveTo(wx(i), wy(i, s0))
    lg.lineTo(wx(i + 1), wy(i + 1, s0))
    lg.lineTo(wx(i + 1), wy(i + 1, s1))
    lg.lineTo(wx(i), wy(i, s1))
    lg.closePath()
  }
  /** The waterline and the cliff base at due SOUTH — the one bearing where the
   *  whole band is on show, and what the ripple pass is measured against. */
  const yWater = C + (rs[Math.floor(N / 4)] / 100) * d * 0.74
  const yBase = yWater + liftAt(id, d, Math.PI / 2) / GROUND

  const paintQuad = (i: number, s0: number, s1: number, fill: string | CanvasGradient) => {
    quad(i, s0, s1)
    lg.fillStyle = fill
    lg.fill()
    lg.strokeStyle = fill
    lg.lineWidth = 1
    lg.stroke()
  }

  // ── BELOW THE WATERLINE: A REFLECTION, NOT A BASEMENT ────────────
  //
  // TRANSLUCENT, and that is most of the point. The old fill was opaque, so it
  // covered the shore bands and the surf that the water shader draws right up
  // to the coast — the sea stopped at the island instead of running under it.
  // Everything here is rgba and the water reads through all of it.
  //
  // The ramp is the wall's own, MIRRORED: darkest where it meets the line
  // (that is the foot of the cliff, the darkest part of the wall, and it is
  // nearest the water) and lightening downward toward what the top of the wall
  // reflects, then gone. Steep, like the landmarks' mirrors — a reflection that
  // survives all the way down reads as a second island.
  for (let i = 0; i < N; i++) {
    const h = (shoreness(id, d, bearing(i)) + shoreness(id, d, bearing(i + 1))) / 2
    const k = Math.min(1, Math.max(0, (h - 0.14) / 0.46))
    if (k < 0.02) continue
    const y0 = (wy(i, 0) + wy(i + 1, 0)) / 2
    const y1 = (wy(i, 1) + wy(i + 1, 1)) / 2
    if (y1 - y0 < 0.5) continue
    const g = lg.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, `rgba(26,23,16,${(0.70 * k).toFixed(3)})`)
    g.addColorStop(0.40, `rgba(52,45,33,${(0.40 * k).toFixed(3)})`)
    g.addColorStop(0.78, `rgba(64,58,44,${(0.16 * k).toFixed(3)})`)
    g.addColorStop(1, 'rgba(70,66,52,0)')
    paintQuad(i, 0, 1, g)
  }

  // ── AND THE RIPPLE THAT PROVES IT IS WATER ───────────────────────
  //
  // A reflection with a clean edge is a shadow. Alternating bands of alpha
  // taken back out with destination-out cut it into horizontal slivers, which
  // is what a surface with any swell on it does to the thing it reflects.
  //
  // Safe as a full-canvas operation because this layer holds NOTHING else yet:
  // `land` was made two dozen lines ago and the fill above is the first thing
  // on it. The shoal, the surf and the contact shadow are all on `cv`.
  {
    const g = lg.createLinearGradient(0, yWater, 0, yBase)
    const bands = 7
    for (let k = 0; k <= bands; k++) {
      g.addColorStop(k / bands, k % 2 ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0)')
    }
    lg.save()
    lg.globalCompositeOperation = 'destination-out'
    lg.fillStyle = g
    lg.fillRect(0, 0, D, D)
    lg.restore()
  }

  // ── ABOVE THE WATERLINE: THE WALL, ROCK TO SAND ──────────────────
  //
  // Opaque. This face points down the page, away from the light in the upper
  // left, so it stays in shadow — but it is catching sky, not sitting in a
  // cave, and at 3.5% of the island it is big enough for that to show.
  //
  // AND IT SHELVES. Where the land drops to the landing the wall is a few
  // pixels of wet sand, not a few pixels of cliff — which is the whole reason
  // this is a loop. You moor on a beach; you should be able to see that you are
  // mooring on a beach.
  for (let i = 0; i < N; i++) {
    const h = (shoreness(id, d, bearing(i)) + shoreness(id, d, bearing(i + 1))) / 2
    const t = Math.min(1, Math.max(0, (h - 0.10) / 0.45))
    const y0 = (wy(i, -1) + wy(i + 1, -1)) / 2
    const y1 = (wy(i, 0) + wy(i + 1, 0)) / 2
    const g = lg.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, T(mixHex(PAL.beach[0], PAL.rock[0], t)))
    g.addColorStop(1, T(mixHex(PAL.beach[1], PAL.rock[1], t)))
    paintQuad(i, -1, 0, g)
  }

  lg.save()
  traceL(0.74, 0)
  lg.clip()

  // STRATA. Curves at fractions of the lift are the coastline offset by a
  // fraction of the wall's height, so they run parallel to the shore all the
  // way round — which is exactly what a bedding plane in an extruded headland
  // does. Pale rather than dark: these are ledges catching the same sky the
  // rim light comes from, and dark ones read as cracks.
  lg.lineWidth = Math.max(1, d * 0.0035)
  for (const [sign, a] of [[-0.30, 0.15], [-0.58, 0.10], [-0.80, 0.06]] as [number, number][]) {
    // Segment by segment, so a ledge fades out as the wall shelves. Run as one
    // stroke round the whole coast it draws three pale lines across the landing
    // as well, and sand has no bedding planes in it.
    for (let i = 0; i < N; i++) {
      const h = (shoreness(id, d, bearing(i)) + shoreness(id, d, bearing(i + 1))) / 2
      const t = Math.min(1, Math.max(0, (h - 0.22) / 0.45))
      if (t < 0.04) continue
      lg.beginPath()
      lg.moveTo(wx(i), wy(i, sign))
      lg.lineTo(wx(i + 1), wy(i + 1, sign))
      lg.strokeStyle = `rgba(255,242,218,${(a * t).toFixed(3)})`
      lg.stroke()
    }
  }

  // Rock over the wall, gently — it is in shadow and mostly edge, so the
  // texture is there to break the flat brown rather than to be read. Inside
  // the waterline clip now: source-atop alone would have laid it over the
  // reflection too, and a reflection with rock grain in it is a rock.
  paintGround(lg, GROUND_TEX.rockG, D, seedOf(id) * 7, 0.85)
  lg.restore()

  // the face, lifted, everything inside clipped to it
  lg.save()
  traceL(0.74, -1)
  lg.clip()
  const face = (scale: number, fill: string | CanvasGradient) => {
    traceL(0.74 * scale, -1)
    lg.fillStyle = fill
    lg.fill()
  }
  face(10, grad165(lg, 0.74, [[0, T(PAL.wet[0])], [0.55, T(PAL.wet[1])], [1, T(PAL.wet[2])]]))
  face(0.97, grad165(lg, 0.72, [[0, T(PAL.sand[0])], [1, T(PAL.sand[1])]]))
  face(0.90, grad165(lg, 0.67, [[0, T(PAL.pale[0])], [1, T(PAL.pale[1])]]))
  face(0.81, grad165(lg, 0.60, [[0, T(PAL.scrub[0])], [1, T(PAL.scrub[1])]]))
  face(0.70, grad165(lg, 0.52, [[0, T(PAL.green[0])], [0.62, T(PAL.green[1])], [1, T(PAL.green[2])]]))

  // TURF OVER ALL FIVE BANDS AT ONCE, inside the face clip that is still open,
  // so the beach reads as sand and the middle as grass without either needing
  // its own texture. The crown, the woods and the rim light are drawn after
  // this and keep sitting on top, which is the whole reason it goes on here
  // rather than last.
  paintGround(lg, GROUND_TEX.turfG, D, seedOf(id), 0.9)

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
