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
import { GROUND, bakeIsland, requestGround, evictIslandsExcept } from './islandArt'
import { bakeMark } from './markArt'
import { nightTint, makeWater } from './seaWater'
import { makeClouds } from './seaClouds'
import { makeFoamTexture, makeShoreFoam, type Foam } from './shoreFoam'
import { makeShoals, type Shoals } from './seaShoals'
import { makeGulls, type Gulls } from './seaGulls'
import { makeSplash, type Splash } from './seaSplash'
import { makeGunFx, type GunFx, type ImpactKind } from './seaGunFx'
import { makeAbilityFx, type AbilityFx, type AbilityShape } from './seaAbilityFx'
import { makeSurf, type Surf, type SurfLine } from './seaSurfLine'
import { makeLights, type Lights } from './seaLights'
import { makeSqualls, type Squalls } from './seaSqualls'
import { makeLap, LAP_MIN_SIZE, type Lap } from './markLap'
import { coastline } from '@/lib/islandShape'
import { SUBMERGE } from './submerge'
import { makeCaptain, makeShip, lookKey, type Captain, type CaptainLook } from './seaCaptain'
import { makeDrift, type Drift } from './seaDrift'
import { makeWake, type Contact, type Wake, type WakeKind } from './seaWake'
import { makeBerths, type Berths, type BerthSpec } from './seaBerth'
import { makePortalWell, type PortalWell, type PortalWellSpec } from './seaPortalWell'
import { makeTowns, type Towns, type GpuTown } from './seaTown'
import { makePath, type SeaPath } from './seaPath'
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
  /** How much lantern the captain has bought, 0.34 to 1 — see lanternGlow.
   *  Its own call rather than a night() argument: the hour changes every frame
   *  and this changes when somebody buys something. */
  lantern(glow: number): void
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
    /** How heavily she sits, 0 to 1. Drives the trough and the collar. */
    heave: number
  } | null): void
  /** Which pieces of tall scenery are standing in front of the hull right now,
   *  as indices into `occluders`. Empty almost always. */
  front(list: number[]): void
  /**
   * SOMETHING HIT THE WATER HERE, in world coordinates. Every fish within reach
   * bolts.
   *
   * The one moment the shoals stop being scenery: dropping a hook into a patch
   * you crossed the chart to find, and watching it empty, is most of the reason
   * to have drawn them at all.
   */
  scatter(x: number, y: number): void
  /**
   * A FISH BREAKS THE SURFACE HERE, in world coordinates.
   *
   * `dir` is which way the boat is facing, so it leaves the water heading away
   * from the hull. Timed to be back down as the result card arrives: see
   * seaSplash, and the hold in FishingHere it is built to sit inside.
   */
  splash(x: number, y: number, dir: number, perfect: boolean): void
  /**
   * A HULL FIRES, at a world point. Flash, smoke off her side, and the water
   * she shoves aside. See seaGunFx — including why a raid is allowed a Pixi
   * effects layer now when it very much was not before.
   */
  gunfire(x: number, y: number, tx: number, ty: number): void
  /** And where a shot ends up: a ring on the water and spray off it. */
  gunimpact(x: number, y: number, kind: ImpactKind): void
  /** A critical: one hard ring travelling twice as far, twice as fast. */
  gunshock(x: number, y: number): void
  /** A rolling broadside: `guns` muzzles down her side, and the answering walk
   *  of splashes across the target. `heavy` is the Barrage. */
  gunvolley(x: number, y: number, tx: number, ty: number, guns: number, heavy?: boolean): void
  /** The Railgun's charge, lance, spray-line and punch-through. */
  gunrail(x: number, y: number, tx: number, ty: number, tint: number): void
  /** The nuke, in its two moments: the silo thrust and the detonation. */
  gunnuke(kind: 'launch' | 'blast', x: number, y: number, tint: number): void
  /** A dodge: the water she throws coming hard over, away from `dx,dy`. */
  gunwake(x: number, y: number, dx: number, dy: number): void
  /** A hull goes down: the sea boils, wreckage floats up, a slick spreads —
   *  and every fish in earshot leaves. */
  gunsink(x: number, y: number): void
  /**
   * THE BAYS' ROUTE BOUNDARIES, as shoals rather than as rock. Set when the
   * list changes — a gate coming down removes a line — and not per frame. See
   * seaSurfLine, including why this is not collision.
   */
  surf(lines: SurfLine[]): void
  /**
   * A NEW ISLAND LIST. Reconciled rather than rebuilt: what is gone is
   * destroyed, what is new is baked, what is unchanged is left alone and never
   * re-baked. The campaign's isles come and go with the bay you are in — see
   * the note at `reconcile` for why they cannot all be kept for the session.
   */
  islands(next: GpuIsland[]): void
  /**
   * A CREW ABILITY LANDS on the hull at `x,y`, in its class's colour. `shape`
   * is what it does rather than which one it is — see seaAbilityFx.
   */
  ability(
    x: number, y: number,
    /** The other hull, for the motions drawn BETWEEN two ships. */
    tx: number, ty: number,
    color: number, shape: AbilityShape,
    /** 1, or more for a legendary chase skin's version of the same ability. */
    power: number,
  ): void
  /**
   * A WARD HOLDING ON A HULL. Called every frame while a fight is up, with
   * where that hull is — a shell that lags the ship is a decal. See
   * seaAbilityFx for why this is a state and not a cast.
   */
  ward(
    side: 'player' | 'enemy', x: number, y: number,
    /** The hull's beam in world px, so the shell is cut to the ship. */
    beam: number,
    color: number, up: boolean,
  ): void
  /**
   * A CONDITION HOLDING ON A HULL — burning, frozen, snared, marked. Called
   * every frame with where that hull is, like the ward. `kind` is a code; see
   * seaAbilityFx, and note that WHICH condition is worth drawing is decided in
   * the fight, where the rules live.
   */
  status(side: 'player' | 'enemy', x: number, y: number, beam: number, kind: number): void
  /** The guiding path: from the hull to wherever the tour has sent her, or
   *  null for neither. See seaPath — naming a place says WHAT, and on a chart
   *  this size a new captain also needs WHICH WAY. */
  guide(
    from: { x: number; y: number } | null,
    to: { x: number; y: number } | null,
    radius?: number,
  ): void
  /** Which berth she is standing in, or null. Eased on the far side, so this
   *  can be called every frame or only on change. */
  berth(id: string | null): void
  /** The portal's tier can change mid-session (you buy one), and whether
   *  you are standing in it changes every frame you cross the rim. */
  portal(spec: PortalWellSpec, inside: boolean, hold: number): void
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
    /** How far she is from the centre of the shot, in screen px. Zero almost
     *  always — she sits at the middle because the camera follows her — and
     *  non-zero while the first voyage flies the camera off to show an island,
     *  when she has to travel with the world instead of being dragged along. */
    offX: number
    offY: number
    /**
     * HOW FAR GONE SHE IS, 0 to 1, while the portal has her.
     *
     * The boat lives on this canvas, so a DOM effect drawn over the chart can
     * cover her but cannot make her DISSOLVE — and a captain who stays solid
     * while the water takes her is a captain standing behind an effect rather
     * than in one. One number, applied as alpha on the same node the bob and
     * the heel already ride.
     */
    fade?: number
  } | null): void
}

export default function SeaIslandsGPU({
  islands, marks, captain, ship, fleet, berths, portal, towns, occluders, handle,
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
  /** The homestead portal, as a place on the water. One per chart. */
  portal: PortalWellSpec
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
  /** Where the hull is on the stage relative to its centre. Zero whenever the
   *  camera is following her, which is nearly always; non-zero while something
   *  else owns the framing. Anything drawn ON her reads this rather than
   *  assuming the middle of the screen. */
  const hullOff = useRef({ x: 0, y: 0 })
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
  const portalRef = useRef(portal)
  const townRef = useRef(towns)
  const occRef = useRef(occluders)
  const listRef = useRef(islands)
  const marksRef = useRef(marks)

  /**
   * ── A LOST CONTEXT USED TO BE PERMANENT ───────────────────────────────────
   *
   * Nothing anywhere listened for `webglcontextlost`, so when the browser took
   * this context away the chart went blank and STAYED blank: your own boat,
   * every trader, every island and every wake gone, while the DOM over the top
   * carried on working and the helm still steered. It was reported exactly like
   * that, and it was caused by a second WebGL context on the fishing dial, which
   * is gone. But a browser can take a context for its own reasons at any time
   * (a background tab reclaimed on a phone is the common one), so the hole was
   * always there and the dial only found it.
   *
   * Two halves. `preventDefault` on the loss is what makes the context
   * RESTORABLE at all: without it the browser never bothers. And a restore
   * bumps this counter, which is in the effect's dependencies, so the whole
   * renderer is torn down and rebuilt from the chart data it is all derived
   * from anyway.
   */
  const [gen, setGen] = useState(0)

  useEffect(() => {
    let dead = false
    let app: import('pixi.js').Application | null = null
    let cleanup: (() => void) | null = null
    let lostOff: (() => void) | null = null

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
        // ── TWO DIFFERENT COSTS, AND THEY WERE THE SAME NUMBER ────────
        //
        // This used to be 1.25, matching bakeIsland's cap, on the reasoning
        // that full retina across this many islands is the memory pressure the
        // port exists to relieve. That reasoning is right about BAKES and wrong
        // about this, and the two are not the same thing:
        //
        //   A BAKE is one canvas per island at its own world diameter, kept for
        //   the session. Thirty of those at full retina really is the problem,
        //   and bakeIsland's 1.25 cap stays exactly where it is.
        //
        //   THE RENDERER RESOLUTION is the framebuffer. It is ONE surface the
        //   size of the viewport, and it does not multiply by anything.
        //
        // Sharing a constant between them made the whole chart render at 1.25
        // and upscale to the device — on a phone at DPR 3 that is every pixel
        // blown up by two and a half, which is exactly as soft as it sounds.
        // It did not show while this canvas drew only the land, because the
        // land is deliberately soft art and everything crisp was still DOM
        // drawing at native density over the top. Now that the canvas draws all
        // of it, the cap was the only thing deciding how sharp the chart is.
        //
        // 2 rather than 3: the honest ceiling. It is native on the DPR-2 phones
        // that are most of them, two thirds on a DPR-3 screen — a difference
        // you have to look for — and it keeps the framebuffer, and the water
        // filter's render target that matches it, to something a five-year-old
        // handset can hold.
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      if (dead) { a.destroy(true, { children: true }); return }
      app = a
      el.appendChild(a.canvas)
      // Input belongs to the DOM chart underneath. This canvas is scenery.
      a.canvas.style.pointerEvents = 'none'

      // See the note on `gen`. preventDefault is not optional here: it is what
      // tells the browser this canvas wants the context back.
      const onLost = (e: Event) => { e.preventDefault(); setGen(g => g + 1) }
      a.canvas.addEventListener('webglcontextlost', onLost, false)
      lostOff = () => a.canvas.removeEventListener('webglcontextlost', onLost)

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

      // ── WHAT IS UNDER THE WATER ───────────────────────────────────
      // FIRST into the world, so everything else on this chart is above them:
      // the drift foam, the wake, the islands, every boat. A fish seen through
      // water is under it, and the whole read depends on that ordering.
      const shoals: Shoals = makeShoals(PIXI)
      world.addChild(shoals.view)

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

      // ── AND THE ONE THAT IS NOT A MOORING ─────────────────────────
      // Beside the berths, in the same slot in the display list and for the
      // same reason: it lies on the water and the land paints over it. It
      // borrows the berth's whole vocabulary and inverts every part of it, so
      // sitting them next to each other here is the honest arrangement.
      const portalWell: PortalWell = makePortalWell(PIXI, portalRef.current)
      world.addChild(portalWell.view)

      // ── AND WHAT SHE LEAVES BEHIND ────────────────────────────────
      // In the world for the same reason the flecks are: a wake that travels
      // with the boat is a tail. Over the drift and under the land, so a mark
      // laid near a shore runs up under the sand rather than over it.
      const wake: Wake = makeWake(PIXI)
      world.addChild(wake.view)

      // ── AND THE WAY THERE ─────────────────────────────────────────
      // In the world, over the wake and under the land, because it is painted
      // ON the water and an island is in front of it.
      const guide: SeaPath = makePath(PIXI)
      world.addChild(guide.view)

      // Other captains, IN the world: they have world positions and the camera
      // does not follow them. Added last so a boat is never behind the island
      // it is moored beside.
      const crewLayer = new PIXI.Container()
      world.addChild(crewLayer)
      crewLayerRef.current = crewLayer

      // ── THE WEATHER ───────────────────────────────────────────────
      //
      // TWO HALVES IN TWO PLACES, and that split is the illusion. The cloud
      // shadow and the dimples are ON the water, so they go in the world under
      // everything solid; the rain is in the AIR, so it goes on the stage over
      // the lot, taking the world's transform the way the gulls do. Rain drawn
      // under an island would be falling behind it.
      const squalls: Squalls = makeSqualls(PIXI)
      /**
       * FAIR-WEATHER CLOUD. Two layers and they go to two different places:
       * the shadows onto the PLANE with everything else that lies on it, and
       * the bodies onto the STAGE, above the world, because they are between
       * the camera and the sea. See seaClouds — the split is the whole point,
       * and it is what makes the parallax honest rather than a sliding
       * texture.
       *
       * Under the squalls, so real weather always wins: a fair-weather puff
       * has no business lightening a storm.
       */
      const clouds = makeClouds(PIXI)
      world.addChild(clouds.water)

      world.addChild(squalls.water)

      // ── WHAT IS STILL LIT AFTER DARK ──────────────────────────────
      //
      // The world half goes over the water and UNDER everything solid, because
      // a pool of lamplight is on the sea and an island is in front of it. The
      // lantern goes on the STAGE with the player, because the camera follows
      // her: relative to the screen she never moves and only the sea does.
      const lights: Lights = makeLights(PIXI)
      world.addChild(lights.world)

      // ── WHAT COMES OUT OF THE WATER ───────────────────────────────
      // Over the wake and the crew, because a fish clearing the surface is in
      // front of everything the surface has on it. In the world, because it
      // happens at a place on the sea and stays there.
      const splash: Splash = makeSplash(PIXI)
      world.addChild(splash.view)
      // THE GUNS. In the world with the splash and for the same reasons: this
      // is weather on the water at a place, not an effect on the lens. Above
      // the splash so a broadside's smoke can hang in front of a fish.
      const guns: GunFx = makeGunFx(PIXI)
      world.addChild(guns.view)
      // ABOVE THE GUNS. An ability is the one thing in a fight that is
      // unambiguously magic, and it should read over the powder smoke rather
      // than through it.
      const spells: AbilityFx = makeAbilityFx(PIXI)
      world.addChild(spells.view)
      // THE BAYS' BOUNDARIES, as broken water. In the world with everything
      // else lying on the plane, and UNDER the boats: a shoal is water, and a
      // hull crossing in front of one is right.
      const surf: Surf = makeSurf(PIXI)
      world.addChildAt(surf.view, 0)

      // ── WHAT IS IN THE AIR ────────────────────────────────────────
      //
      // ON THE STAGE, NOT IN THE WORLD, and given the world's own transform
      // every frame instead. Islands bake asynchronously and add themselves to
      // the world long after this line runs, so anything added here would end
      // up UNDER a headland that finished baking a second later. Birds are
      // above everything by definition, and copying two numbers a frame is a
      // great deal cheaper than sorting the world container forever.
      const gulls: Gulls = makeGulls(PIXI)
      /**
       * ── THE DEPTH HAZE ──────────────────────────────────────────────
       *
       * Air. Not much of it, but the thing that has been missing from this
       * chart since it got its tilt: GROUND squashes the plane so it recedes
       * up-screen, and then every rock at the top of the view was drawn as
       * crisply as the one under the bow. Distance with no atmosphere in it is
       * not distance, it is a map.
       *
       * ONE SPRITE, ABOVE THE PLANE AND BELOW THE HULL. Everything standing on
       * the water is seen through it and gets hazier the further off it is;
       * the boat, the gulls and the rain are in front of it and stay clear —
       * which is right, because they are here rather than there.
       *
       * WHY NOT TINT EVERY SPRITE. Because that is two and a half thousand
       * per-frame writes to say a thing one gradient says for free, and this
       * layer exists precisely to avoid paying that before we know it is
       * needed. A veil in front is also what haze physically IS.
       *
       * IT WEARS THE WATER'S OWN COLOUR — see `palette` — so it can never
       * disagree with the sea it is thickening, at any hour or in any band.
       */
      const hazeTex = (() => {
        const cv = document.createElement('canvas')
        cv.width = 1; cv.height = 128
        const cx = cv.getContext('2d')!
        const g = cx.createLinearGradient(0, 0, 0, 128)
        // Strongest at the very top and gone by two thirds down, so the near
        // water — where a captain is actually looking — is untouched.
        g.addColorStop(0, 'rgba(255,255,255,1)')
        g.addColorStop(0.28, 'rgba(255,255,255,0.55)')
        g.addColorStop(0.66, 'rgba(255,255,255,0)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        cx.fillStyle = g
        cx.fillRect(0, 0, 1, 128)
        return PIXI.Texture.from(cv)
      })()
      const haze = new PIXI.Sprite(hazeTex)
      // 0.12, DOWN FROM 0.34 BY WAY OF 0.20. This is the OTHER film on the screen: a static
      // one over the upper third, where the cloud bodies were a moving one over
      // all of it. At a third of full white it was doing more than air does
      // over a few thousand pixels of water, and it washed the far sea toward
      // grey rather than veiling it. Distance still reads; it is no longer the
      // first thing the eye finds.
      haze.alpha = 0.12
      const sizeHaze = () => {
        haze.width = a.screen.width
        haze.height = a.screen.height
      }
      sizeHaze()

      // THE BODIES, above the plane and BELOW the haze — added first, because
      // the display list is painted in order. A cloud is in front of the sea,
      // and a cloud far up the view is behind the air between it and the
      // camera, so the haze has to be able to veil it like everything else out
      // there. Put the other way round the distant sky stayed crisp over
      // hazed water, which reads as the haze being a filter on the sea rather
      // than air in the world.
      a.stage.addChild(clouds.air)
      a.stage.addChild(haze)

      a.stage.addChild(gulls.view)
      // Under the captain, over everything else on the stage.
      a.stage.addChild(lights.screen)
      a.stage.addChild(squalls.air)

      const boats = new PIXI.Container()
      a.stage.addChild(boats)
      pixiRef.current = PIXI
      boatsRef.current = boats

      // The surf texture and every strip of foam that scrolls with it — the
      // islands' shore rings and the lap at each landmark's waterline. Declared
      // before the near pass because that builds laps too, and a const referred
      // to from a hoisted function it is declared after is a trap waiting for
      // somebody to move a call earlier.
      const foamTex = makeFoamTexture(PIXI)
      /** Each with the mark it belongs to, because scrolling a UV buffer costs
       *  an upload per mesh per frame and there is no point paying it for foam
       *  nobody can see. With the reef on the canvas this is the difference
       *  between a handful of uploads a frame and several hundred. */
      const laps: { l: Lap; x: number; y: number; half: number }[] = []

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
          //
          // Wet, then the lap, then dry — the same order and the same reason as
          // the world copy. This one is drawn OVER the hull, so without the
          // foam a rock would lose its waterline at the exact moment it passed
          // in front of you, which is the moment you are looking straight at it.
          const put = (cv: HTMLCanvasElement) => {
            const sp = new PIXI.Sprite(PIXI.Texture.from(cv))
            const k = m.size / cv.width
            sp.scale.set(k, k / GROUND)
            sp.anchor.set(0.5, 1)
            // ── AND IT TAKES THE HOUR, like everything else on this canvas ──
            //
            // This layer was never tinted. `night()` walks the baked islands and
            // the swayers and stopped there, so the near pass painted at full
            // noon whatever the sky was doing — and the near pass is not a
            // separate set of scenery, it is the SAME rock drawn a second time
            // over the hull. So a rock lit up as it passed in front of the boat
            // and went dark again the moment it dropped behind her, which reads
            // as the world flashing rather than as a copy that was missed.
            //
            // A sprite built after dusk starts at the current tint; the loop
            // below in night() keeps the ones already standing.
            sp.tint = lastTint < 0 ? 0xffffff : lastTint
            node.addChild(sp)
          }
          put(wet)
          if (sub && m.size >= LAP_MIN_SIZE) {
            const k = m.size / wet.width
            const lap = makeLap(PIXI, sub, foamTex, m.size, (wet.height * k) / GROUND, (i * 0.41) % 1)
            node.addChild(lap.mesh)
            laps.push({ l: lap, x: m.x, y: m.y, half: m.size })
          }
          if (dry) put(dry)
        }).catch(() => {})
        return node
      }

      const foams: { f: Foam; x: number; y: number; r: number }[] = []
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
        foams.push({ f, x: isle.x, y: isle.y, r: isle.r })
      }
      for (const isle of listRef.current) place(isle)

      /**
       * ── ADD AND DROP ISLANDS AFTER THE FACT ──────────────────────────────
       *
       * Islands used to be placed once, here, from a ref — the list could
       * change and nothing would happen. That was fine while every island on
       * the chart was worth keeping for the session, and it stopped being fine
       * when the campaign grew: a bake is one canvas per island at its own
       * diameter, the note on the renderer's resolution puts thirty of those at
       * the edge of what a phone will hold, and five chapters of bays is
       * seventy-odd.
       *
       * So the caller can hand over a new list and this reconciles it: what is
       * gone is destroyed, what is new is placed, what is unchanged is left
       * alone and never re-baked. The bays are ten thousand pixels apart and
       * you can only be in one, so the chart carries the fishing sea plus the
       * bay you are actually in.
       */
      const reconcile = (next: GpuIsland[]) => {
        const want = new Map(next.map(i => [i.id, i]))
        for (let k = baked.length - 1; k >= 0; k--) {
          const b = baked[k]
          if (want.has(b.isle.id)) continue
          // THE TEXTURE GOES WITH THE SPRITE. A bare destroy() left the GPU
          // copy of a bay you had sailed out of resident for the session, which
          // is the same leak as the canvas below and lands on the scarcer of
          // the two memories. Each island bakes its own canvas and therefore
          // owns its own texture, so nothing else is holding this one.
          b.sprite.destroy({ texture: true, textureSource: true })
          baked.splice(k, 1)
          const fi = foams.findIndex(f => f.x === b.isle.x && f.y === b.isle.y)
          if (fi >= 0) { foams[fi].f.mesh.destroy(); foams.splice(fi, 1) }
        }
        const have = new Set(baked.map(b => b.isle.id))
        for (const isle of next) if (!have.has(isle.id)) place(isle)
        // AND THE BAKES BEHIND THEM. Dropping the sprite was only ever half of
        // letting a bay go — see evictIslandsExcept. Done after placing, so an
        // island that is merely MOVING between lists is never evicted and
        // re-baked in the same breath.
        evictIslandsExcept(new Set(next.map(i => i.id)))
        listRef.current = next
      }

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

          // ── THE WATER LAPPING AT IT ─────────────────────────────
          //
          // BETWEEN THE TWO HALVES, which is the whole reason it works: over
          // the wet copy that is under the surface, under the dry copy that is
          // above it. Foam sits AT the water, so it belongs in front of what is
          // below and behind what is above, and the display list says that
          // without anybody blending anything.
          if (sub && m.size >= LAP_MIN_SIZE) {
            const k = m.size / wet.width
            const lap = makeLap(PIXI, sub, foamTex, m.size, wet.height * k, (m.i * 0.41) % 1)
            inner.addChild(lap.mesh)
            laps.push({ l: lap, x: m.x, y: m.y, half: m.size })
          }

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
      /** Backing store for the above. Grows once to the size of the busiest
       *  frame and is written through forever after. */
      const pooled: Contact[] = []
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

      a.ticker.add(() => {
        const t = performance.now() / 1000
        const dt = a.ticker.deltaMS / 1000
        const halfW = a.screen.width / 2 / camZoom
        const halfH = a.screen.height / 2 / camZoom / GROUND
        lastHalfW = halfW; lastHalfH = halfH

        // ── THE SURF RUNS, WHERE ANYONE CAN SEE IT ────────────────────
        //
        // Scrolling foam means rewriting a UV buffer and uploading it, once per
        // mesh per frame. That was fine for thirty island rings; with the reef
        // on the canvas it would be hundreds of small uploads a frame, nearly
        // all of them for water off the edge of the screen. The cull is the
        // same bounds test the landmarks use.
        for (const f of foams) {
          if (Math.abs(f.x - camX) < halfW + f.r * 1.6
            && Math.abs(f.y - camY) < halfH + f.r * 1.6) f.f.advance(t)
        }
        for (const l of laps) {
          if (Math.abs(l.x - camX) < halfW + l.half * 2
            && Math.abs(l.y - camY) < halfH + l.half * 3) l.l.advance(t)
        }
        // ── HOW HARD SHE IS TRAVELLING ────────────────────────────────
        // Derived from the camera rather than passed in: the chart already
        // hands this layer plenty, and the camera's own delta is the honest
        // measure of how fast the water is going past whatever is looking at
        // it. Smoothed, or a single stuttered frame reads as a lurch.
        const rvx = (camX - lastCamX) / Math.max(dt, 1e-4)
        const rvy = (camY - lastCamY) / Math.max(dt, 1e-4)
        lastCamX = camX; lastCamY = camY
        // ── HOW FAST COUNTS AS FAST ───────────────────────────────────
        //
        // Was `speed / 520`, linear, so a 300px/s cruise — which is most of the
        // sailing anybody does — only counted as 0.58 and left most of the
        // high-frequency detail up. A power curve gets there sooner: 0.72 at
        // cruise, and pinned at the top by the time the hull is fully refitted.
        //
        const speed = Math.hypot(rvx, rvy)
        const raw = Math.min(1, Math.pow(speed / 380, 1.3))
        // ── FAST TO DAMP, SLOW TO COME BACK ───────────────────────────
        //
        // One rate for both directions meant the detail snapped back the
        // instant the boat stopped: come off the helm and the water flashed to
        // full brightness in about a fifth of a second, which reads as a light
        // being switched on rather than as a wake settling.
        //
        // Asymmetric now, and the asymmetry is what a real sea does. Detail
        // goes as soon as you are moving, because that is when it turns into
        // strobe and there is nothing to be gained by easing into removing it.
        // It comes back over a couple of seconds, because water that has been
        // disturbed takes a moment to lie flat and the eye knows it.
        const settling = raw < rush
        rush += (raw - rush) * Math.min(1, dt * (settling ? 0.9 : 6))
        capRef.current?.cap.update(dt)
        for (const c of crewRef.current.values()) c.cap.update(dt)
        water?.frame(t, camX, camY, camZoom, dark, warm, rush)
        drift.advance(camX, camY, halfW, halfH, t, dt)
        shoals.advance(camX, camY, halfW, halfH, t, dt)
        gulls.advance(camX, camY, halfW, halfH, t, dt)
        // ADVANCED ON PIXI'S OWN TICKER, which is the whole reason this works.
        // The chart's rAF loop returns early while the dial is up, so nothing
        // driven from there animates during a catch; this one is not.
        splash.advance(dt)
        guns.advance(dt)
        spells.advance(dt)
        surf.advance(t)
        // The last two are where the HULL is on the stage — usually the screen
        // centre, because the camera follows her, but not always. A fight frames
        // the engagement rather than the captain, and she sits low and to the
        // left of it; with the centre hardcoded her lantern stayed behind in the
        // middle of the screen, a pool of light on empty water.
        lights.advance(camX, camY, halfW, halfH,
          a.screen.width / 2 + hullOff.current.x,
          a.screen.height / 2 + hullOff.current.y, t, dt)
        squalls.advance(camX, camY, halfW, halfH, dt)
        // The sky. Needs the screen as well as the world, because half of it is
        // drawn in screen space — that is what the parallax IS.
        clouds.advance(t, camX, camY, halfW, halfH, camZoom, a.screen.width, a.screen.height)
        townLayer?.cull(camX, camY, halfW, halfH)
        // ── EVERY HULL ON THE WATER, ONCE A FRAME ─────────────────────
        // The player and the whole Salt Road go in together, because the wake
        // module works out for itself which of them are under way and which are
        // sitting still. Rebuilt into the same array rather than allocated.
        // REUSED, not rebuilt. Forty hulls is forty object literals a frame and
        // two and a half thousand a second, for a list that is read once and
        // thrown away. The array is trimmed to length and its entries are
        // written through.
        contacts.length = 0
        if (mine) contacts.push(mine)
        for (const e of fleetAt) {
          const c = crewRef.current.get(e.key)
          if (!c) continue
          const n = contacts.length
          const slot = pooled[n] ?? (pooled[n] = {
            id: '', x: 0, y: 0, ang: 0, cx: 0, cy: 0, scale: 1, kind: 'plain',
          })
          slot.id = e.key
          slot.x = e.x; slot.y = e.y; slot.ang = e.ang
          slot.cx = e.cx; slot.cy = e.cy
          slot.scale = e.scale; slot.kind = c.kind
          contacts.push(slot)
        }
        wake.lay(contacts)
        berthLayer.advance(t, dt, camX, camY, halfW, halfH)
        portalWell.advance(t, dt, camX, camY, halfW, halfH)
        wake.advance(dt)
        guide.advance(t)
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
        if (dead) return
        water?.size(a.screen.width, a.screen.height)
        sizeHaze()
      })
      ro.observe(el)
      cleanup = () => ro.disconnect()

      handle.current = {
        lantern(glow) { lights.lantern(glow) },

        night(d, w) {
          dark = d
          warm = w
          // AIR THINS AFTER DARK. Haze is light scattered off it, and at night
          // there is far less light to scatter — a far rock does not go misty
          // in the dark, it goes invisible, which the palette is already
          // responsible for saying. Left at a third of itself rather than
          // nothing, so a moonlit sea still has some depth in it.
          haze.alpha = 0.12 * (1 - d * 0.66)
          // AND THE SKY GOES OUT WITH IT. A cloud is a lit thing; after dark
          // there is no sun to light it and no sun to cast it, and a shadow
          // with nothing making it is a stain on the water.
          clouds.night(d)
          const tint = nightTint(d, w)
          if (tint === lastTint) return
          lastTint = tint
          for (const b of baked) b.sprite.tint = tint
          for (const sw of swayers) {
            for (const child of sw.holder.children) {
              (child as import('pixi.js').Sprite).tint = tint
            }
          }
          // THE NEAR PASS TOO. It is the same rock as the world copy under it,
          // so it has to be the same colour — see the note in nearSprite.
          for (const node of nearBuilt.values()) {
            for (const child of node.children) {
              const sp = child as import('pixi.js').Sprite
              if (sp.tint !== undefined) sp.tint = tint
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
          // Underwater, so it takes the hour HARDER than the surface does: the
          // last thing to still be visible after dark is not the thing below it.
          shoals.night(nightTint(Math.min(1, d * 1.25), w))
          // A gull is a pale thing against a dark sea and it is the LAST thing
          // still catching light at dusk, so it gives up less to the hour than
          // the water under it.
          gulls.night(nightTint(d * 0.72, w))
          splash.night(nightTint(d * 0.55, w))
          // Smoke and spray dim with the hour; the muzzle flash does not,
          // because it is the one thing out here making its own light.
          guns.night(d)
          spells.night(d)
          surf.night(d)
          // NOT a tint. Everything else on this canvas is multiplied toward the
          // hour; these are the things that answer it by emitting, so they take
          // the darkness itself and get BRIGHTER as it deepens.
          lights.night(d)
          squalls.night(tint)
          wake.night(tint)
          // A harbour lamp is the one light out here that is NOT the sun, so it
          // gives up much less to the hour than the water around it. Most of
          // the point of a lit berth is that it is still lit after dark.
          berthLayer.night(nightTint(d * 0.3, w))
          // A hole in the water takes the hour like the water does. It is
          // not a lamp and it should not stay bright when nothing else is.
          portalWell.night(tint)
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
          // THE HAZE IS THE WATER, THINNED. Taken from the PALE stop and lifted
          // toward white, because air over a sea takes its colour from the sea
          // and gives back a little of the sky. Any other colour and the far
          // water would be a different sea from the near.
          const p = stops[2]
          haze.tint = (Math.round(Math.min(255, p[0] * 0.72 + 74)) << 16)
            | (Math.round(Math.min(255, p[1] * 0.72 + 82)) << 8)
            | Math.round(Math.min(255, p[2] * 0.72 + 92))
        },
        wake(w) {
          mine = w ? { id: 'me', ...w } : null
        },
        guide(from, to, radius) { guide.set(from, to, radius) },
        berth(id) { berthLayer.setActive(id) },
        portal(spec, inside, hold) { portalWell.setSpec(spec); portalWell.setActive(inside, hold) },
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
          // A LAMP PER BOAT, off the same list the hulls come from, so a light
          // can never burn where there is nobody. `cx`/`cy` is where the hull
          // actually sits, which is what the rings at rest use too.
          lights.lamps(list.map(f => ({ x: f.cx, y: f.cy })))
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
          // GOING, OR COMING BACK. See `fade` on the spec.
          c.outer.alpha = 1 - Math.max(0, Math.min(1, sk.fade ?? 0))
          // TWO CONTAINERS, because the DOM transform is
          // `translate(-50%,-50%) scale(zoom) translateY(bob) scaleX(facing) rotate(heel)`
          // and a matrix reads right to left: the heel is applied INSIDE the
          // mirror. Pixi composes one node as translate·rotate·scale, which is
          // the opposite order, so a single node cannot say it. The outer one
          // carries the zoom and the bob (scaled, since the bob sits inside the
          // zoom), the inner one carries the mirror and the heel.
          c.outer.position.set(
            a.screen.width / 2 + sk.offX,
            a.screen.height / 2 + sk.offY + sk.zoom * sk.bob,
          )
          // WHERE SHE ACTUALLY IS, kept for anything else drawn ON her. The
          // lantern used to assume screen centre — true only while the camera
          // is following her, which it stops doing the moment a fight frames
          // the engagement instead. See the note at lights.advance.
          hullOff.current.x = sk.offX
          hullOff.current.y = sk.offY + sk.zoom * sk.bob
          c.outer.scale.set(sk.zoom)
          c.inner.scale.x = sk.facing
          c.inner.rotation = (sk.heel * Math.PI) / 180
          c.cap.setFrame(sk.frame)
          c.cap.setStage(sk.stage)
        },
        islands(next) { reconcile(next) },
        scatter(x, y) { shoals.scatter(x, y) },
        splash(x, y, dir, perfect) { splash.fire(x, y, dir, perfect) },
        gunfire(x, y, tx, ty) { guns.fire(x, y, tx, ty) },
        gunimpact(x, y, kind) { guns.impact(x, y, kind) },
        gunshock(x, y) { guns.shock(x, y) },
        gunvolley(x, y, tx, ty, n, heavy) { guns.volley(x, y, tx, ty, n, heavy) },
        gunrail(x, y, tx, ty, tint) { guns.railgun(x, y, tx, ty, tint) },
        gunnuke(kind, x, y, tint) {
          if (kind === 'launch') guns.nukeLaunch(x, y)
          else guns.nukeBlast(x, y, tint)
        },
        gunwake(x, y, dx, dy) { guns.wake(x, y, dx, dy) },
        surf(lines) { surf.set(lines) },
        ability(x, y, tx, ty, color, shape, power) { spells.cast(x, y, tx, ty, color, shape, power) },
        ward(side, x, y, beam, color, up) { spells.ward(side, x, y, beam, color, up) },
        status(side, x, y, beam, kind) { spells.status(side, x, y, beam, kind) },
        gunsink(x, y) {
          guns.sink(x, y)
          // AND THE FISH BOLT. A ship going down is the loudest thing that has
          // ever happened in this water; the shoals already know how to leave.
          shoals.scatter(x, y)
        },

        camera(x, y, zoom) {
          camX = x; camY = y; camZoom = zoom
          world.scale.set(zoom, zoom * GROUND)
          world.position.set(
            a.screen.width / 2 - zoom * x,
            a.screen.height / 2 - zoom * GROUND * y,
          )
          // The air rides the same transform as the water under it. See where
          // it is added: it is a sibling of the world rather than a child, so
          // a late-baking island can never end up in front of a bird.
          gulls.view.scale.copyFrom(world.scale)
          gulls.view.position.copyFrom(world.position)
          // The rain rides the same transform, for the same reason: it is a
          // sibling of the world so a late-baking island cannot end up in
          // front of it.
          squalls.air.scale.copyFrom(world.scale)
          squalls.air.position.copyFrom(world.position)
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
      lostOff?.()
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
  }, [handle, gen])

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
