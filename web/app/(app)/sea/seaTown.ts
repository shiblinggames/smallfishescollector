// ── WHAT IS BUILT ON THE ISLANDS ────────────────────────────────────────────
//
// The last large thing standing in the DOM inside the world layer, and the one
// with the most to lose by staying there.
//
// ── WHY IT HAD TO MOVE ──────────────────────────────────────────────────────
//
// Not cost, though the cost is real: every building is a composited element
// carrying an animated `filter`, and there are dozens across the chart. The
// reason is AGREEMENT. The islands are on the canvas and the buildings standing
// on them were not, so two different renderers were being handed the same
// camera and asked to land on the same pixel every frame. SeaIslandsGPU carries
// a long note about that being the one thing that must not drift, and it is
// only true for as long as nobody makes a mistake. A tavern that shares a
// display list with the island it stands on cannot slide off it.
//
// ── THE TRANSFORM IS THE WHOLE JOB ──────────────────────────────────────────
//
// A building is placed as a percentage of its ISLAND'S BOX — a square of the
// island's diameter, centred on the island — and then:
//
//   translate(-50%, -100%)   anchored at its FEET, so it grows upward out of
//                            the ground rather than out of its own middle
//   scaleY(1 / GROUND)       counter-squash, so it STANDS UP off a plane that
//                            is otherwise foreshortened
//   transform-origin: bottom center
//
// All three say the same thing: a building has height, and the ground does not.
// The anchor lands at the feet, the y scale undoes the plane, and the paint
// order runs back to front so a house further down the island overlaps the one
// behind it the way a hillside town does.
//
// ── AND THE TOWN LIGHTS UP ──────────────────────────────────────────────────
//
// The hour takes the whole world down. This is the one thing that comes UP, and
// it is what turns a dimmer into nightfall.
//
// IT USED TO BE ONE WASH: a single soft ellipse, 78% by 52% of the island's
// box, faded up under the buildings. On paper that is windows throwing light on
// the ground they stand on. On the chart it was a warm blob lying across half
// the island with no source anywhere in it — brightest over open grass, dark
// over the actual town, and the same shape on every island. Light with nothing
// making it does not read as night, it reads as a smudge on the lens.
//
// So the town is lit by LAMPS, which is how a harbour is lit: a run of them
// around the promenade, each a small hard point with its own pool on the sand
// around it. The point is the source and the pool is what it reaches, and both
// come up together out of nothing at dusk. Same amber, same falloff and same
// idea as the lights on a berth ring, because a captain reading the water at
// night should be reading ONE language of light.

import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND, liftAtPoint } from './islandArt'
import { coastline, grassAt, GRASS } from '@/lib/islandShape'
import { texture } from './skiffArt'
import { makeSmoke, type Chimney, type Smoke } from './seaSmoke'

/**
 * ── WHICH ROOFS HAVE A FIRE LIT ─────────────────────────────────────────────
 *
 * Named, not derived. The first cut put a pot on anything wider than 46px,
 * which is a rule about PAINTINGS, and it lit thirteen of them — including the
 * hall's stores, a drill yard and a trawl shed, none of which are places
 * anybody is sitting indoors.
 *
 * Who has a fire going is a fact about the place. A town, a forge, a
 * charterhouse full of clerks and a gunwharf: four buildings, and every one of
 * them is somewhere work is being done under a roof.
 */
const SMOKING = new Set([
  'mainland-town.png',
  'forge.png',
  'charterhouse.png',
  'gunwharf.png',
])

export type GpuBuilding = {
  /** Percent of the island's box. */
  x: number
  y: number
  /** Fraction of the island's DIAMETER. */
  scale: number
  art: string
}

export type GpuTown = {
  id: string
  x: number
  y: number
  r: number
  locked: boolean
  buildings: GpuBuilding[]
}

/** A dark, desaturated grey for a place you cannot land at yet. The DOM says
 *  `grayscale(0.9) brightness(0.5)`; a tint cannot desaturate, so this is the
 *  brightness half of it and the closest a multiply gets to the rest. If a
 *  locked island ever needs to read as properly colourless it wants a shader,
 *  not a darker number here. */
const LOCKED = 0x4a4a52

/** Harbour amber. The berths' exact warm, because these are the same lamps a
 *  little further inland and two ambers on one shore is two towns. */
const GLOW = 0xffc478

/** How far out the run of lamps stands, as a fraction of the coastline.
 *
 *  BUILDABLE is 0.599 of it and the painted land ends at 0.74, so this is the
 *  sand-and-scrub ring between the last cottage and the cliff edge: outside
 *  everything anybody builds on, inside everything that is land. That band is
 *  the promenade whether or not it is drawn as one, and a lamp on it can never
 *  be standing in the sea or on a roof. */
const PROM = 0.66

/** How tall a lamp stands, as a fraction of the island's radius. Height maps
 *  straight to screen y on this plane, so this is also the gap you see between
 *  the light and the pool it casts — which is the whole of what says post. */
const POST = 0.052

/** How bright at the middle of the night. The pool is deliberately meek: it is
 *  the light REACHING the sand, and sand at night is not lit, it is glimpsed. */
const CORE_PEAK = 0.9
const POOL_PEAK = 0.3

let coreTex: Texture | null = null
let poolTex: Texture | null = null

/** The lamp itself: a hard bright middle and a short halo. Small on screen, so
 *  most of its range goes on the first fifth — anything softer than this stops
 *  being a light and starts being a stain. */
function coreTexture(PIXI: typeof import('pixi.js')): Texture {
  if (coreTex) return coreTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.72)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.2)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  coreTex = PIXI.Texture.from(c)
  return coreTex
}

/** And what it throws on the ground. Bright under the lamp and gone well before
 *  the next one: a run of lamps has DARK BETWEEN THEM, and losing that is how
 *  you end up back at one wash with extra steps. */
function poolTexture(PIXI: typeof import('pixi.js')): Texture {
  if (poolTex) return poolTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.30, 'rgba(255,255,255,0.42)')
  grad.addColorStop(0.62, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  poolTex = PIXI.Texture.from(c)
  return poolTex
}

/** One lamp: the light, the ground it reaches, and a phase of its own so a run
 *  of them breathes out of step rather than pulsing as one bar. */
type Lamp = {
  core: Sprite
  pool: Sprite
  phase: number
}

type Built = {
  spec: GpuTown
  node: Container
  sprites: Sprite[]
  lamps: Lamp[]
}

export type Towns = {
  view: Container
  /** The hour: a tint for the buildings, and how far up the town's own lights
   *  have come. */
  night(tint: number, dark: number): void
  /** Hide whatever is not on screen. A town off the edge of the view costs
   *  nothing to have, which is most of the point of moving it here. */
  cull(camX: number, camY: number, halfW: number, halfH: number): void
  /** The chimneys. One frame; see seaSmoke. */
  advance(dt: number, camX: number, camY: number, halfW: number, halfH: number): void
  destroy(): void
}

export async function makeTowns(
  PIXI: typeof import('pixi.js'),
  towns: GpuTown[],
): Promise<Towns> {
  const view: Container = new PIXI.Container()
  const built: Built[] = []
  const chimneys: Chimney[] = []

  for (const spec of towns) {
    const node: Container = new PIXI.Container()
    node.position.set(spec.x, spec.y)
    view.addChild(node)

    const d = spec.r * 2
    const lamps: Lamp[] = []

    // ── THE RUN OF LAMPS ─────────────────────────────────────────────────
    //
    // UNDER THE BUILDINGS, and added first for exactly that reason: the town
    // is drawn back to front over the top of this, so a lamp behind a roof is
    // covered by it and a lamp south of the town is not — which is the same
    // occlusion the buildings already give each other, for free, and the
    // reason a lamp is a thing standing ON the island rather than a decal
    // floating over the picture of one.
    //
    // A LOCKED island stays dark. Nobody is home, which is the same reason its
    // chimneys are cold.
    if (spec.buildings.length && !spec.locked) {
      const rs = coastline(spec.id)
      /** The coastline's own radius at a bearing, in box-percent. `grassAt` is
       *  the only interpolator the shape exports and it bakes the grass band
       *  in, so this takes it back out rather than walking the ring twice. */
      const coastAt = (a: number) => grassAt(rs, a) / GRASS

      // ONE PER SO MANY PIXELS OF SHORE, not a fixed count. The Mainland is
      // 4.6x a single-purpose port, and nine lamps around it is a lit town
      // while nine around the Shipyard is a runway.
      const n = Math.max(4, Math.min(12, Math.round(spec.r / 58)))
      let h = 0
      for (let i = 0; i < spec.id.length; i++) h = (h * 31 + spec.id.charCodeAt(i)) >>> 0

      for (let i = 0; i < n; i++) {
        // Evenly spread and then knocked off it. A perfect ring reads as
        // machinery; half a step of slop reads as lamps somebody put up.
        const jit = ((Math.imul(h ^ Math.imul(i + 1, 0x9e3779b1), 2654435761) >>> 0) % 1000) / 1000
        const a = ((i + 0.5) / n) * Math.PI * 2 + (jit - 0.5) * (Math.PI * 2 / n) * 0.55
        const p = coastAt(a) * PROM
        const bx = 50 + Math.cos(a) * p
        const by = 50 + Math.sin(a) * p
        // The same three lines every building here uses: box-percent to node
        // units, then up onto the land at ITS OWN bearing. A lamp that skipped
        // the lift would be buried in the cliff face like the buildings were.
        const lx = -spec.r + (bx / 100) * d
        const ly = -spec.r + (by / 100) * d - liftAtPoint(spec.id, d, bx, by) / GROUND

        const pool: Sprite = new PIXI.Sprite(poolTexture(PIXI))
        pool.anchor.set(0.5)
        // ROUND HERE, an ellipse on screen. The WORLD is what carries the
        // plane's squash — it is scaled (zoom, zoom * GROUND), which is why a
        // building has to counter-squash to stand up — so a flat thing is
        // simply drawn round and let alone. Writing the ellipse here squared
        // with the world's and laid the pool out flatter than the ground it
        // is lying on.
        pool.width = spec.r * 0.66
        pool.height = spec.r * 0.66
        pool.position.set(lx, ly)
        pool.tint = GLOW
        pool.alpha = 0
        pool.blendMode = 'add'
        node.addChild(pool)

        const core: Sprite = new PIXI.Sprite(coreTexture(PIXI))
        core.anchor.set(0.5)
        // AND THIS ONE COUNTER-SQUASHES, because a lamp is not lying on the
        // ground, it is a light in the air facing you. Same 1 / GROUND every
        // building on the island uses to stand up.
        core.width = Math.max(12, spec.r * 0.062)
        core.height = core.width / GROUND
        // Up the post. A height in world units is GROUND times that on screen,
        // so a post you actually want to see is divided by it — the same
        // division the island's own lift goes through two lines above.
        core.position.set(lx, ly - (spec.r * POST) / GROUND)
        core.tint = GLOW
        core.alpha = 0
        core.blendMode = 'add'
        node.addChild(core)

        lamps.push({ core, pool, phase: jit * 6.28 })
      }
    }

    const sprites: Sprite[] = []
    // BACK TO FRONT, in the order the chart lists them. Paint order is the
    // display list's order here, exactly as it was document order before, so
    // the two renderers agree without anybody sorting anything.
    for (const b of spec.buildings) {
      let tex: Texture
      try {
        tex = await texture(PIXI, b.art)
      } catch {
        // One building that will not decode must not cost the island.
        continue
      }
      const s: Sprite = new PIXI.Sprite(tex)
      // At its FEET.
      s.anchor.set(0.5, 1)
      const w = d * b.scale
      const k = w / tex.width
      // Counter-squashed on y so it stands up off the plane.
      s.scale.set(k, k / GROUND)
      // The percentage is of the island's BOX, whose top-left is one radius up
      // and to the left of the island's centre — which is where this node is.
      //
      // ── AND RAISED ONTO THE LAND ─────────────────────────────────────────
      //
      // An island is drawn as a raised disc: `bakeIsland` drops a cliff by
      // ISLAND_LIFT and puts the top face the same distance ABOVE the island's
      // nominal plane. So the land a building stands on is not at y=0, it is
      // one lift up, and a building placed without it has its feet buried in
      // the cliff face rather than standing on the grass.
      //
      // The DOM chart has always done this. The Pixi port did not, and it is
      // the whole of "the buildings do not match the island's perspective":
      // every roof on every island was sunk by twenty-six world pixels, which
      // reads as the island being a flat decal slid under them.
      // ITS OWN GROUND, not the island's average. A cottage up on the
      // headland stands high; the same cottage down by the mooring stands
      // almost at the water.
      s.position.set(
        -spec.r + (b.x / 100) * d,
        -spec.r + (b.y / 100) * d - liftAtPoint(spec.id, d, b.x, b.y) / GROUND,
      )
      s.tint = spec.locked ? LOCKED : 0xffffff
      node.addChild(s)
      sprites.push(s)

      // ── AND WHERE ITS CHIMNEYS ARE ───────────────────────────────
      //
      // WHICH buildings smoke is named above. WHERE the pot sits is derived,
      // because nothing in the chart's data says, and a coordinate per building
      // would be a lot of typing for something nobody would ever tune: a
      // chimney sits high on the painted mass, and how many there are follows
      // how wide the building is. One for a forge, three for a whole town.
      //
      // `up` is the sprite's own height in the node's units — the art's aspect
      // at this width, un-squashed the same way the sprite itself is, because
      // the top of a building drawn standing up is that far above its feet.
      //
      // A LOCKED island has cold hearths. Nobody is home yet.
      if (!spec.locked && SMOKING.has(b.art.split('/').pop() ?? '')) {
        const up = (w * (tex.height / tex.width)) / GROUND
        const pots = Math.max(1, Math.min(3, Math.round(w / 240)))
        // The forge is not a kitchen: it works harder and it burns dirtier.
        const forge = b.art.includes('forge') || b.art.includes('gunwharf')
        for (let k = 0; k < pots; k++) {
          // Spread across the middle of the roofline rather than the full
          // width, so a pot never hangs off the end of the painting.
          const across = pots === 1 ? 0 : (k / (pots - 1) - 0.5) * 0.52
          chimneys.push({
            x: spec.x + s.position.x + across * w,
            y: spec.y + s.position.y - up * 0.84,
            heat: forge ? 1.7 : 0.85 + ((k * 7 + w) % 5) * 0.08,
            tint: forge ? 0x6d6257 : 0xb9b3a8,
          })
        }
      }
    }

    built.push({ spec, node, sprites, lamps })
  }

  // ── THE SMOKE GOES IN WITH THE TOWNS ─────────────────────────────
  //
  // Inside this view rather than as its own layer on the world, and added after
  // every building, which settles its z-order for free: a plume is in front of
  // the roof it comes off and behind nothing, because the towns are already the
  // last thing in the world.
  const smoke: Smoke = makeSmoke(PIXI, chimneys)
  view.addChild(smoke.view)

  /** How far into the night, held from `night` so the breath below knows
   *  whether there is anything lit to breathe. */
  let dark = 0
  let clock = 0

  return {
    view,

    advance(dt, camX, camY, halfW, halfH) {
      smoke.advance(dt, camX, camY, halfW, halfH)
      // NOTHING AT NOON. Every lamp on the chart is alpha 0 in daylight, so
      // this is one comparison and out.
      if (dark <= 0.01) return
      clock += dt
      for (const b of built) {
        // And nothing off screen: `cull` has already put the node down, and a
        // lamp nobody can see does not need to flicker.
        if (!b.node.visible) continue
        for (const l of b.lamps) {
          // A flame in a glass box is never quite still. Slow and shallow —
          // this is a lamp guttering, not a light being switched.
          const u = Math.sin(clock * 1.7 + l.phase) * 0.5 + Math.sin(clock * 0.61 + l.phase * 2.3) * 0.5
          l.core.alpha = dark * CORE_PEAK * (1 + u * 0.1)
          l.pool.alpha = dark * POOL_PEAK * (1 + u * 0.14)
        }
      }
    },

    night(tint, dark_) {
      dark = dark_
      for (const b of built) {
        if (!b.spec.locked) for (const s of b.sprites) s.tint = tint
        // Nothing at noon, full by the middle of the night. Set here as well as
        // in the breath, because the hour can turn while the chart is still —
        // and because `advance` returns early in daylight, which is what has to
        // put them out when it gets there.
        for (const l of b.lamps) {
          l.core.alpha = dark * CORE_PEAK
          l.pool.alpha = dark * POOL_PEAK
        }
      }
    },

    cull(camX, camY, halfW, halfH) {
      for (const b of built) {
        // Generous on y: a building is anchored at its feet and stands well
        // above them, so culling on the island's centre alone pops the tall
        // ones at the top of the screen.
        b.node.visible = Math.abs(b.spec.x - camX) < halfW + b.spec.r * 1.5
          && Math.abs(b.spec.y - camY) < halfH + b.spec.r * 3
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
