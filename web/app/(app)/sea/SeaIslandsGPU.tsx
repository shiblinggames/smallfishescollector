'use client'

// ── THE ISLANDS, ON THE GPU ─────────────────────────────────────────────────
//
// Stage two of the Pixi port, and it is deliberately the smallest useful slice:
// the LAND only. Every other thing on the chart — the buildings standing on the
// islands, the labels, the berths, the boat, the traders — stays exactly where
// it is, in the DOM, drawn over the top of this canvas.
//
// ── WHY THE LAND FIRST ──────────────────────────────────────────────────────
//
// It is where the memory is. `islandCache` and `surfCache` hold a canvas per
// island and per surf ring and never evict, which around thirty-odd islands is
// the bulk of what iOS was killing the renderer over. As one Pixi canvas they
// become GPU textures with a single backing surface, and the ones off screen
// cost nothing to have.
//
// It is also the slice with the least that can go wrong, because the ART DOES
// NOT CHANGE. `bakeIsland` already returns a finished HTMLCanvasElement and a
// canvas is a texture source, so these are the same paintings the DOM was
// showing, re-hosted. There is no new island art to get subtly wrong.
//
// ── THE ONE THING THAT MUST NOT DRIFT ───────────────────────────────────────
//
// The buildings are still DOM, positioned inside a container the frame loop
// transforms. This canvas has to land its islands in exactly the same place, in
// the same frame, or a tavern slides off the island it stands on. So the camera
// is not computed here: `camera()` is called by the same loop, from the same
// numbers, immediately after it writes the DOM transform. The mapping is that
// transform read back out:
//
//     scale(zoom) scaleY(GROUND) translate3d(-x, -y)   from a 50%/50% origin
//
// CSS applies right to left, so a world point lands at
// `centre + zoom * (wx - x, GROUND * (wy - y))`, which is a container scaled by
// (zoom, zoom * GROUND) and positioned at (w/2 - zoom*x, h/2 - zoom*GROUND*y).

import { useEffect, useRef, useState } from 'react'
import { GROUND, bakeIsland, requestGround } from './islandArt'
import { bakeMark } from './markArt'
import { nightTint, makeWater } from './seaWater'
import { makeFoamTexture, makeShoreFoam, type Foam } from './shoreFoam'
import { coastline } from '@/lib/islandShape'
import { SUBMERGE } from './submerge'
import { makeCaptain, makeShip, lookKey, type Captain, type CaptainLook } from './seaCaptain'
import { makeDrift, type Drift } from './seaDrift'
import { makeWake, type Contact, type Wake, type WakeKind } from './seaWake'
import { makeBerths, type Berths, type BerthSpec } from './seaBerth'
import { makeTowns, type Towns, type GpuTown } from './seaTown'
import { BOATS } from '@/lib/boats'
import type { Frame } from './skiffArt'

export type GpuIsland = { id: string; r: number; x: number; y: number; locked: boolean }
export type GpuMark = {
  art: string; x: number; y: number; size: number
  sway?: 'bob' | 'rock'
  /** Its index on the chart, which is all the sway phase is derived from — so
   *  two identical wrecks side by side are never in step. */
  i: number
}

export type GpuHandle = {
  /** Called by the frame loop, right after it writes the DOM world transform. */
  camera(x: number, y: number, zoom: number): void
  /** The clock's two axes: how dark, and how low the sun is. Tints every
   *  sprite on this canvas — see nightTint for why this is a tint and
   *  emphatically not a filter. */
  night(dark: number, warm: number): void
  /** The three blended stops out of seaAt, 0..255, deep first. Called on the
   *  chart's own deadband rather than every frame: the colour of the sea does
   *  not change sixty times a second and the shader does not need telling that
   *  it has not. */
  palette(stops: number[][]): void
  /**
   * The player's own captain, every frame.
   *
   * She is NOT in the world container, and that is not an oversight: the camera
   * follows her, so relative to the screen she never moves and only the sea
   * does. The DOM version learned the same thing the hard way — it used to sit
   * her in the world at her world position with the world translated by the
   * negative of it, which composes to dead centre by a needlessly clever route.
   *
   * `bob`, `heel` and `facing` are screen-space only, exactly as the DOM writes
   * them. Null while she is not being drawn here at all.
   */
  /**
   * Where the hull is parting the water, in WORLD coordinates, and how hard.
   *
   * The wake is the one part of the player that is NOT screen-space: each mark
   * has to stay where the hull left it, or it is a tail rather than a wake.
   * Null when she is not moving enough to leave one.
   */
  wake(s: {
    x: number; y: number; ang: number; force: number; scale: number; kind: WakeKind
    /** Where she sits, for the rings she makes at rest. */
    cx: number; cy: number
  } | null): void
  /** Which pieces of tall scenery are standing in front of the hull right now,
   *  as indices into `occluders`. Empty almost always. */
  front(list: number[]): void
  /** Which berth she is standing in, or null. Eased on the far side, so this
   *  can be called every frame or only on change. */
  berth(id: string | null): void
  /**
   * EVERYONE ELSE ON THE WATER, every frame.
   *
   * Unlike the player, these DO belong in the world container: they have world
   * positions and the camera does not follow them. `scale` is the hull's own
   * (traders are drawn smaller than you) and is divided by GROUND on the y to
   * undo the plane's squash, exactly as the DOM's `scaleY(1 / GROUND)` does —
   * a captain is standing up in the world, not lying flat on it.
   *
   * Anyone not in the list is hidden rather than destroyed. A trader who sails
   * off the edge of the patrol is coming back.
   */
  fleet(list: {
    key: string; x: number; y: number; facing: number; scale: number; dim: number
    /** Heading in radians, for the wake they leave. A captain's `facing` is
     *  only ±1 and says which way the sprite is mirrored; a wake needs to know
     *  which way they are actually going. */
    ang: number
    /** Where the HULL sits, for the rings they make at rest. Not the same as
     *  where the sprite is centred: the boat is drawn low in its sheet. */
    cx: number; cy: number
  }[]): void
  skipper(s: {
    bob: number
    heel: number
    facing: number
    zoom: number
    frame: Frame
    stage: number
  } | null): void
}

export default function SeaIslandsGPU({
  islands, marks, captain, ship, fleet, berths, towns, occluders, handle,
}: {
  islands: GpuIsland[]
  marks: GpuMark[]
  /** How the player looks right now. Rebuilt only when it actually changes —
   *  see the effect below, which compares by VALUE because a captain is
   *  expensive to assemble and cheap to steer. */
  captain: CaptainLook | null
  /** The expedition hull, past the sortie. Mutually exclusive with `captain`:
   *  the crossing REPLACES what is at the centre of the screen rather than
   *  dressing it up, so there is one slot and two things that can fill it. */
  ship: { url: string; flip: boolean } | null
  /** Where a boat can be tied up. Static, so read once. */
  berths: BerthSpec[]
  /** The tall scenery that can stand between the camera and the hull. Static,
   *  and a subset of `marks` — see the note where the front pass is built. */
  occluders: GpuMark[]
  /** What is built on the islands. Read once: an island's buildings change
   *  only when a place unlocks, which is a page-level event. */
  towns: GpuTown[]
  /** Everyone else, and how they look. Rebuilt only when somebody's outfit
   *  actually changes — see the effect below. */
  fleet: { key: string; look: CaptainLook }[]
  /** Filled in on mount so the loop can steer this without a re-render. */
  handle: { current: GpuHandle | null }
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  // The renderer starts asynchronously and the captain is built separately, so
  // the two need somewhere to meet. `ready` fires once, when there is a stage
  // to hang her on.
  const pixiRef = useRef<typeof import('pixi.js') | null>(null)
  const boatsRef = useRef<import('pixi.js').Container | null>(null)
  const capRef = useRef<{
    outer: import('pixi.js').Container
    inner: import('pixi.js').Container
    cap: Captain
  } | null>(null)
  const [ready, setReady] = useState(0)
  const lookRef = useRef<CaptainLook | null>(captain)
  lookRef.current = captain
  const shipRef = useRef(ship)
  shipRef.current = ship
  const fleetRef = useRef(fleet)
  fleetRef.current = fleet
  const crewRef = useRef(new Map<string, {
    holder: import('pixi.js').Container
    cap: Captain
    sig: string
    /** What this hull leaves behind. Read once when they are built rather than
     *  sent every frame: a trader does not change boats mid-patrol. */
    kind: WakeKind
  }>())
  const crewLayerRef = useRef<import('pixi.js').Container | null>(null)
  // Read once. Both lists are derived from static chart data, so re-baking on a
  // parent render would be pure waste.
  const berthRef = useRef(berths)
  const townRef = useRef(towns)
  const occRef = useRef(occluders)
  const listRef = useRef(islands)
  const marksRef = useRef(marks)

  useEffect(() => {
    let dead = false
    let app: import('pixi.js').Application | null = null
    let cleanup: (() => void) | null = null

    ;(async () => {
      const PIXI = await import('pixi.js')
      if (dead || !holder.current) return

      const el = holder.current
      const a = new PIXI.Application()
      await a.init({
        // TRANSPARENT. The water is a CSS gradient under this canvas and it is
        // staying there: it is one full-screen gradient that costs nothing and
        // carries its own tuning, and asking the GPU to repaint it every frame
        // would be work for no gain.
        backgroundAlpha: 0,
        resizeTo: el,
        antialias: true,
        // The same cap bakeIsland uses. Full retina across this many islands is
        // the memory pressure the port exists to relieve.
        resolution: Math.min(window.devicePixelRatio || 1, 1.25),
        autoDensity: true,
      })
      if (dead) { a.destroy(true, { children: true }); return }
      app = a
      el.appendChild(a.canvas)
      // Input belongs to the DOM chart underneath. This canvas is scenery.
      a.canvas.style.pointerEvents = 'none'

      // ── THE WATER, UNDER EVERYTHING ───────────────────────────────
      //
      // The CSS gradient is still mounted behind this canvas and still being
      // painted every deadband; this covers it. Nothing else on the chart has
      // to know which sea is showing, and turning the flag off puts the old one
      // back with no other change anywhere.
      const water = await makeWater(PIXI, {
        uTime: 0,
        uCam: new Float32Array([0, 0]),
        uZoom: 1,
        uRes: new Float32Array([a.screen.width, a.screen.height]),
        // Placeholders only. The first `palette` call replaces all three, and
        // it arrives before the first frame the captain sees.
        uShallow: new Float32Array([0.36, 0.60, 0.58]),
        uMid: new Float32Array([0.17, 0.35, 0.37]),
        uDeep: new Float32Array([0.07, 0.19, 0.22]),
        uDark: 0,
        // Upper left: the same key the buildings and the islands are lit by.
        uLight: new Float32Array([-0.7, -0.7]),
        uSwell: 1,
        uWarm: 0,
        uRush: 0,
      })
      if (water) {
        if (dead) { a.destroy(true, { children: true }); return }
        a.stage.addChild(water.sprite)
        water.size(a.screen.width, a.screen.height)
      }

      const world = new PIXI.Container()
      a.stage.addChild(world)

      // ── WHERE THE CAPTAINS GO ─────────────────────────────────────
      // Above the world, because a boat is on the water rather than under it,
      // and OUTSIDE it, because the player does not move relative to the
      // screen — the camera follows her. Traders will move in here too, but
      // they belong in the world container with the islands: they DO move.
      // ── WHAT YOU SAIL PAST ────────────────────────────────────────
      // In the world, under the land, over the water: flecks of foam at fixed
      // world positions. See seaDrift for why a field of discrete things reads
      // as travel where a scrolling texture reads as a scrolling texture.
      const drift: Drift = makeDrift(PIXI)
      world.addChild(drift.view)

      // ── WHERE SHE CAN TIE UP ──────────────────────────────────────
      // Added before the islands, which attach asynchronously as they bake, so
      // an island always paints over its own berth ring. That ordering is the
      // DOM's too, and for the same reason.
      const berthLayer: Berths = makeBerths(PIXI, berthRef.current)
      world.addChild(berthLayer.view)

      // ── AND WHAT SHE LEAVES BEHIND ────────────────────────────────
      // In the world for the same reason the flecks are: a wake that travels
      // with the boat is a tail. Over the drift and under the land, so a mark
      // laid near a shore runs up under the sand rather than over it.
      const wake: Wake = makeWake(PIXI)
      world.addChild(wake.view)

      // Other captains, IN the world: they have world positions and the camera
      // does not follow them. Added last so a boat is never behind the island
      // it is moored beside.
      const crewLayer = new PIXI.Container()
      world.addChild(crewLayer)
      crewLayerRef.current = crewLayer

      const boats = new PIXI.Container()
      a.stage.addChild(boats)
      pixiRef.current = PIXI
      boatsRef.current = boats

      // ── THE NEAR PASS ─────────────────────────────────────────────
      //
      // The handful of things currently standing between the camera and the
      // hull, drawn again ON TOP of her. The world is drawn in two passes and
      // this is the near one; the only difference is which side of the boat it
      // lands on.
      //
      // It exists because she is not IN the world. The camera follows her, so
      // she is screen-space at the centre and cannot be depth-sorted against
      // scenery that is not — which is the price of a camera-follow and this is
      // what it costs. Empty almost always: a few sprites when you are among
      // rocks and nothing at all in open water.
      //
      // Sprites are made on FIRST NEED and then kept. The list is bounded and
      // small, but most of it is never needed in a session — a rock on the far
      // side of the chart is not worth a texture because it might one day be
      // passed closely.
      const front = new PIXI.Container()
      a.stage.addChild(front)
      const nearBuilt = new Map<number, import('pixi.js').Container>()
      const nearWanted = new Set<number>()

      function nearSprite(i: number) {
        const held = nearBuilt.get(i)
        if (held) return held
        const m = occRef.current[i]
        if (!m) return null
        const node = new PIXI.Container()
        node.visible = false
        front.addChild(node)
        nearBuilt.set(i, node)
        const sub = SUBMERGE[m.art.split('/').pop()!.replace('.png', '')]
        bakeMark(m.art, sub).then(({ wet, dry }) => {
          if (dead) return
          // A mark above the waterline has no wet half, and that null is the
          // answer rather than a missing one.
          for (const cv of [wet, dry]) {
            if (!cv) continue
            const sp = new PIXI.Sprite(PIXI.Texture.from(cv))
            const k = m.size / cv.width
            sp.scale.set(k, k / GROUND)
            sp.anchor.set(0.5, 1)
            node.addChild(sp)
          }
        }).catch(() => {})
        return node
      }

      const foamTex = makeFoamTexture(PIXI)
      const foams: Foam[] = []
      const baked: { isle: GpuIsland; sprite: import('pixi.js').Sprite; pad: number }[] = []
      const place = (isle: GpuIsland) => {
        const d = isle.r * 2
        // The chart's own padding: the widest shoal wash plus the blur's spill.
        const pad = Math.round(d * 0.08) + 24
        const s = new PIXI.Sprite(PIXI.Texture.from(bakeIsland(isle.id, d, isle.locked, pad)))
        // Placed by CSS size, not by pixel size: the canvas is baked at DPR.
        s.width = d + pad * 2
        s.height = d + pad * 2
        s.anchor.set(0.5, 0.5)
        s.x = isle.x
        s.y = isle.y
        world.addChild(s)
        baked.push({ isle, sprite: s, pad })

        // THE SURF, AT THE ISLAND. A child of the world at the island's own
        // position, so it moves because the island moves and there is no camera
        // in it at all — which is the whole reason it is geometry rather than a
        // shader measuring distances in screen space. Added at the BOTTOM of
        // the display list so the crests run up under the shore instead of over
        // the sand.
        const f = makeShoreFoam(PIXI, coastline(isle.id), d, foamTex, (isle.x * 0.013) % 1)
        f.mesh.x = isle.x
        f.mesh.y = isle.y
        world.addChildAt(f.mesh, 0)
        foams.push(f)
      }
      for (const isle of listRef.current) place(isle)

      // The turf and rock land after the first bake. When they do, the chart
      // drops its cache and repaints; here the textures are swapped.
      requestGround(() => {
        if (dead) return
        for (const b of baked) {
          const d = b.isle.r * 2
          b.sprite.texture = PIXI.Texture.from(bakeIsland(b.isle.id, d, b.isle.locked, b.pad))
        }
      })

      // ── THE LANDMARKS ─────────────────────────────────────────────
      //
      // Wrecks, rigs, buoys, bones and the moored smacks. In the DOM these are
      // TWO masked <img> each and all 42 stay mounted whatever is on screen;
      // here they are two sprites sharing a texture baked once per painting,
      // and the ones off screen are simply not drawn.
      //
      // Two sprites and not a shader, deliberately: the waterline was placed by
      // eye on /sea/waterline and this reproduces the same two layers with the
      // same stops rather than approximating them. See markArt.
      type Swayer = {
        node: import('pixi.js').Container
        holder: import('pixi.js').Container
        sway: 'bob' | 'rock' | undefined
        phase: number
        x: number
        y: number
        half: number
      }
      const swayers: Swayer[] = []

      for (const m of marksRef.current) {
        const sub = SUBMERGE[m.art.split('/').pop()!.replace('.png', '')]
        bakeMark(m.art, sub).then(({ wet, dry }) => {
          if (dead) return

          // Anchored bottom-centre and stood up out of the plane, which is the
          // outer wrapper SeaMark uses; the inner one is free to sway without
          // clobbering it.
          const node = new PIXI.Container()
          node.x = m.x
          node.y = m.y

          const inner = new PIXI.Container()
          node.addChild(inner)

          const add = (cv: HTMLCanvasElement) => {
            const sp = new PIXI.Sprite(PIXI.Texture.from(cv))
            const k = m.size / cv.width
            sp.scale.set(k, k)
            sp.anchor.set(0.5, 1)
            inner.addChild(sp)
            return sp
          }
          add(wet)
          if (dry) add(dry)

          // The counter-squash, about the base, so it stands rather than lies.
          node.scale.set(1, 1 / GROUND)

          // Sway pivots at 50%/92% of the sprite, as the CSS does. The sprites
          // are anchored at their base, so that is a little way ABOVE zero.
          const h = (dry ?? wet).height * (m.size / (dry ?? wet).width)
          inner.pivot.set(0, -h * 0.08)
          inner.position.set(0, -h * 0.08)

          world.addChild(node)
          swayers.push({
            node, holder: inner, sway: m.sway,
            phase: (m.i * 0.77) % 3,
            x: m.x, y: m.y, half: m.size,
          })
        }).catch(() => {
          // One painting that will not decode must not cost the other forty.
        })
      }

      // ── SWAY AND CULL, once a frame ───────────────────────────────
      //
      // The DOM ran these as CSS animations on 84 promoted elements. Here it is
      // arithmetic on whatever is actually visible, and the cull is the thing
      // this stage exists for: a landmark off screen costs nothing at all,
      // where a mounted <img> costs a compositing layer whether you can see it
      // or not.
      let camX = 0, camY = 0, camZoom = 1
      let dark = 0, warm = 0
      let lastCamX = 0, lastCamY = 0, rush = 0
      /** The viewport in world units, as of the last frame. Written by the
       *  ticker and read by `fleet`, which runs before it. */
      let lastHalfW = 1, lastHalfH = 1
      /** The player's contact and the fleet's last positions, held between the
       *  handle calls that set them and the ticker that uses them. */
      let mine: Contact | null = null
      let fleetAt: {
        key: string; x: number; y: number; facing: number; scale: number; dim: number
        ang: number; cx: number; cy: number
      }[] = []
      const contacts: Contact[] = []
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      a.ticker.add(() => {
        const t = performance.now() / 1000
        // The surf runs and the sea moves. Both are time only: the camera and
        // the hour arrive through the handle, from the chart's own loop.
        for (const f of foams) f.advance(t)
        const dt = a.ticker.deltaMS / 1000
        // ── HOW HARD SHE IS TRAVELLING ────────────────────────────────
        // Derived from the camera rather than passed in: the chart already
        // hands this layer plenty, and the camera's own delta is the honest
        // measure of how fast the water is going past whatever is looking at
        // it. Smoothed, or a single stuttered frame reads as a lurch.
        const rvx = (camX - lastCamX) / Math.max(dt, 1e-4)
        const rvy = (camY - lastCamY) / Math.max(dt, 1e-4)
        lastCamX = camX; lastCamY = camY
        const raw = Math.min(1, Math.hypot(rvx, rvy) / 520)
        rush += (raw - rush) * Math.min(1, dt * 5)
        capRef.current?.cap.update(dt)
        for (const c of crewRef.current.values()) c.cap.update(dt)
        water?.set({
          uTime: t,
          uCam: new Float32Array([camX, camY]),
          uZoom: camZoom,
          uDark: dark,
          uWarm: warm,
          uRush: rush,
        })
        const halfW = a.screen.width / 2 / camZoom
        const halfH = a.screen.height / 2 / camZoom / GROUND
        lastHalfW = halfW; lastHalfH = halfH
        drift.advance(camX, camY, halfW, halfH, t, a.ticker.deltaMS / 1000)
        townLayer?.cull(camX, camY, halfW, halfH)
        // ── EVERY HULL ON THE WATER, ONCE A FRAME ─────────────────────
        // The player and the whole Salt Road go in together, because the wake
        // module works out for itself which of them are under way and which are
        // sitting still. Rebuilt into the same array rather than allocated.
        contacts.length = 0
        if (mine) contacts.push(mine)
        for (const e of fleetAt) {
          const c = crewRef.current.get(e.key)
          if (!c) continue
          contacts.push({
            id: e.key, x: e.x, y: e.y, ang: e.ang,
            cx: e.cx, cy: e.cy,
            scale: e.scale, kind: c.kind,
          })
        }
        wake.lay(contacts)
        berthLayer.advance(t, a.ticker.deltaMS / 1000)
        wake.advance(a.ticker.deltaMS / 1000)
        for (const sw of swayers) {
          // Generous margins: a landmark is anchored at its base and stands
          // well above it, so culling on the anchor alone pops the tall ones.
          const on = Math.abs(sw.x - camX) < halfW + sw.half * 2
            && Math.abs(sw.y - camY) < halfH + sw.half * 3
          sw.node.visible = on
          if (!on || !sw.sway || reduce) continue
          if (sw.sway === 'bob') {
            // markBob: 3.6s, translateY 0 to -5, rotate -3.2 to 3.2.
            const u = Math.sin(((t + sw.phase) / 3.6) * Math.PI * 2)
            sw.holder.rotation = (3.2 * Math.PI / 180) * u
            sw.holder.y = -sw.half * 0.08 - 2.5 * (u + 1)
          } else {
            // A wreck is thousands of tons of waterlogged timber: slower, less.
            const u = Math.sin(((t + sw.phase) / 9) * Math.PI * 2)
            sw.holder.rotation = (1.1 * Math.PI / 180) * u
          }
        }
      })

      let lastTint = -1
      // ── AND WHAT IS BUILT ON THEM ─────────────────────────────────
      //
      // A town is a container of its own, added to the world AFTER the islands
      // so a building stands on its island rather than under it — and the
      // building sprites share that display list, which is the whole point: a
      // tavern cannot slide off the island it is parented to.
      //
      // Started here but NOT awaited. Forty buildings is a lot of decoding, and
      // everything below this line is what makes the chart respond. This file
      // has already been caught once putting essential setup behind an await
      // that never settled; a town that arrives two hundred milliseconds late
      // is a town that arrives.
      let townLayer: Towns | null = null
      void makeTowns(PIXI, townRef.current).then(t => {
        if (dead) { t.destroy(); return }
        townLayer = t
        world.addChild(t.view)
      }).catch(() => {
        // An island with no buildings on it is still an island.
      })

      // The water's quad is screen space, so it has to follow the surface it is
      // drawn on. `resizeTo` handles the renderer; this handles the shader.
      const ro = new ResizeObserver(() => {
        if (!dead) water?.size(a.screen.width, a.screen.height)
      })
      ro.observe(el)
      cleanup = () => ro.disconnect()

      handle.current = {
        night(d, w) {
          dark = d
          warm = w
          const tint = nightTint(d, w)
          if (tint === lastTint) return
          lastTint = tint
          for (const b of baked) b.sprite.tint = tint
          for (const sw of swayers) {
            for (const child of sw.holder.children) {
              (child as import('pixi.js').Sprite).tint = tint
            }
          }
          // She takes the hour at just over half strength, which is what the
          // DOM did with `nightGrade(dark, 0.55)`: the boat you are steering
          // stays readable after dark while the world around it does not.
          capRef.current?.cap.setNight(nightTint(d * 0.55, w))
          // Other captains take the hour at FULL strength, like the islands
          // and unlike the player. That is what `.sea-lit` does to them in the
          // DOM, and it is the right call: the boat you are steering staying
          // readable after dark is a concession to the person steering it, not
          // a fact about the light.
          for (const c of crewRef.current.values()) c.cap.setNight(tint)
          drift.night(tint)
          wake.night(tint)
          // A harbour lamp is the one light out here that is NOT the sun, so it
          // gives up much less to the hour than the water around it. Most of
          // the point of a lit berth is that it is still lit after dark.
          berthLayer.night(nightTint(d * 0.3, w))
          // The buildings take the hour at the same strength the land does —
          // they are standing on it. The second number is the town's own lights
          // coming up, which is the one thing on the chart that gets BRIGHTER
          // after dark.
          townLayer?.night(tint, d)
        },
        palette(stops) {
          if (!water || stops.length < 3) return
          const f = (c: number[]) => new Float32Array([c[0] / 255, c[1] / 255, c[2] / 255])
          water.set({ uDeep: f(stops[0]), uMid: f(stops[1]), uShallow: f(stops[2]) })
        },
        wake(w) {
          mine = w ? { id: 'me', ...w } : null
        },
        berth(id) { berthLayer.setActive(id) },
        front(list) {
          nearWanted.clear()
          for (const i of list) nearWanted.add(i)
          for (const [i, node] of nearBuilt) node.visible = nearWanted.has(i)
          for (const i of list) {
            const node = nearSprite(i)
            const m = occRef.current[i]
            if (!node || !m) continue
            node.visible = true
            // Screen space, because the boat this is drawn over is. The same
            // mapping the world container uses, applied to one point.
            node.position.set(
              a.screen.width / 2 + camZoom * (m.x - camX),
              a.screen.height / 2 + camZoom * GROUND * (m.y - camY),
            )
            node.scale.set(camZoom, camZoom * GROUND)
          }
        },
        fleet(list) {
          fleetAt = list
          const seen = crewRef.current
          for (const c of seen.values()) c.holder.visible = false
          for (const e of list) {
            const c = seen.get(e.key)
            if (!c) continue
            c.holder.visible = true
            c.holder.position.set(e.x, e.y)
            // scaleY undoes the plane's squash, and the facing rides on x —
            // the same ±1 mirror the DOM writes.
            c.holder.scale.set(e.scale * e.facing, e.scale / GROUND)
            c.holder.alpha = e.dim
            // ── FAR AWAY COSTS LESS ────────────────────────────────
            // Fill rate is the one thing on this canvas that is not free, and a
            // captain most of a screen away is contributing sparks nobody is
            // looking at. Faded rather than switched, so nothing pops as you
            // sail toward somebody.
            const gone = Math.max(Math.abs(e.x - camX) / lastHalfW,
                                  Math.abs(e.y - camY) / lastHalfH)
            c.cap.setIntensity(Math.max(0, Math.min(1, 2.1 - gone * 1.6)))
          }
        },
        skipper(sk) {
          const c = capRef.current
          if (!c) return
          if (!sk) { c.outer.visible = false; return }
          c.outer.visible = true
          // TWO CONTAINERS, because the DOM transform is
          // `translate(-50%,-50%) scale(zoom) translateY(bob) scaleX(facing) rotate(heel)`
          // and a matrix reads right to left: the heel is applied INSIDE the
          // mirror. Pixi composes one node as translate·rotate·scale, which is
          // the opposite order, so a single node cannot say it. The outer one
          // carries the zoom and the bob (scaled, since the bob sits inside the
          // zoom), the inner one carries the mirror and the heel.
          c.outer.position.set(
            a.screen.width / 2,
            a.screen.height / 2 + sk.zoom * sk.bob,
          )
          c.outer.scale.set(sk.zoom)
          c.inner.scale.x = sk.facing
          c.inner.rotation = (sk.heel * Math.PI) / 180
          c.cap.setFrame(sk.frame)
          c.cap.setStage(sk.stage)
        },
        camera(x, y, zoom) {
          camX = x; camY = y; camZoom = zoom
          world.scale.set(zoom, zoom * GROUND)
          world.position.set(
            a.screen.width / 2 - zoom * x,
            a.screen.height / 2 - zoom * GROUND * y,
          )
        },
      }
      if (!dead) setReady(n => n + 1)
    })().catch(() => {
      // A renderer that will not start must not take the chart with it. The
      // DOM islands are still mounted behind the flag that turned this on, so
      // the worst case here is the chart the game has always had.
    })

    return () => {
      dead = true
      cleanup?.()
      handle.current = null
      // The app destroys her children with it; dropping the reference first is
      // what stops the captain effect from destroying an already-dead sprite.
      capRef.current = null
      crewRef.current.clear()
      crewLayerRef.current = null
      pixiRef.current = null
      boatsRef.current = null
      app?.destroy(true, { children: true })
      app = null
    }
  }, [handle])

  // ── THE CAPTAIN, REBUILT ONLY WHEN SHE CHANGES ────────────────────────────
  //
  // Keyed by VALUE rather than by object identity. A look is assembled fresh on
  // every render of the chart, so depending on the object would rebuild her
  // sixty times a second — the same trap that made the skiff bench flicker
  // between poses. Assembling a captain loads a dozen images and bakes a glow;
  // steering one is arithmetic.
  const key = `${lookKey(captain)}#${ship ? `${ship.url}${ship.flip ? '~f' : ''}` : ''}`
  useEffect(() => {
    let dead = false
    ;(async () => {
      const PIXI = pixiRef.current
      const boats = boatsRef.current
      const look = lookRef.current
      const hull = shipRef.current
      if (!PIXI || !boats) return
      // One slot. Past the sortie it is not your fishing boat, and the ship is
      // built through the same door so the loop that steers her does not have
      // to know which of the two it is holding.
      const built = look ? await makeCaptain(PIXI, look)
        : hull ? await makeShip(PIXI, hull)
        : null
      if (dead || !boatsRef.current) { built?.destroy(); return }

      capRef.current?.cap.destroy()
      capRef.current?.outer.destroy({ children: true })
      capRef.current = null
      if (!built) return

      const outer = new PIXI.Container()
      const inner = new PIXI.Container()
      inner.addChild(built.view)
      outer.addChild(inner)
      // Hidden until the loop places her. One frame at the origin is a boat
      // that appears in the top-left corner and then jumps, which is worse than
      // a boat that arrives a frame late.
      outer.visible = false
      boats.addChild(outer)
      capRef.current = { outer, inner, cap: built }
    })().catch(() => {
      // A captain who will not assemble must not take the chart with her.
    })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  // ── AND EVERYONE ELSE, RECONCILED ─────────────────────────────────────────
  //
  // Keyed by who is out there and what they are wearing, joined into one
  // string. A trader's LOOK is fixed for the day, so in practice this settles
  // once at dawn and then never fires again while you sail — which is the
  // point: assembling forty captains is expensive and steering them is not.
  //
  // Anyone whose outfit changed is torn down and rebuilt rather than patched.
  // A look change means a different hat sprite, a different hull, possibly a
  // different rod, and reaching into a built captain to swap those is a second
  // way of doing what makeCaptain already does.
  const fleetKey = fleet.map(f => `${f.key}~${lookKey(f.look)}`).join(',')
  useEffect(() => {
    let dead = false
    ;(async () => {
      const PIXI = pixiRef.current
      const layer = crewLayerRef.current
      if (!PIXI || !layer) return
      const crew = crewRef.current
      const want = new Map(fleetRef.current.map(f => [f.key, f]))

      // Gone, or wearing something else.
      for (const [key, held] of [...crew]) {
        const w = want.get(key)
        if (w && lookKey(w.look) === held.sig) continue
        held.cap.destroy()
        held.holder.destroy({ children: true })
        crew.delete(key)
      }

      // New. Awaited one at a time on purpose: the textures are shared, so the
      // second captain in the same hat pays nothing, and forty parallel image
      // decodes on a phone is how you drop the frame they were supposed to
      // arrive on.
      for (const [key, f] of want) {
        if (crew.has(key)) continue
        const cap = await makeCaptain(PIXI, f.look)
        if (dead || !crewLayerRef.current) { cap.destroy(); return }
        const holder = new PIXI.Container()
        holder.addChild(cap.view)
        // Hidden until the loop places them, or a boat appears at the origin
        // for one frame and then jumps.
        holder.visible = false
        layer.addChild(holder)
        const hull = f.look.boatId ? BOATS.find(b => b.id === f.look.boatId) : null
        crew.set(key, {
          holder, cap, sig: lookKey(f.look),
          kind: (hull?.wake as WakeKind | undefined) ?? 'plain',
        })
      }
    })().catch(() => {
      // One captain who will not assemble must not take the sea with them.
    })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetKey, ready])

  return <div ref={holder} aria-hidden style={{ position: 'absolute', inset: 0 }} />
}
