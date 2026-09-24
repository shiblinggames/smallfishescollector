'use client'

// ── THE SLIPWAY ─────────────────────────────────────────────────────────────
//
// The gauntlet's hub, as water. Arriving at a descent stops being a scroll of
// cards and becomes somewhere you are: the inside of the maelstrom you just
// sailed into, with the way down still turning in the middle of it, the
// keeper of this door hanging over the eye, and the places you can moor at
// lit around you on the drowned floor of the thing.
//
// ── EVERY PLACE IS A MENU THAT ALREADY EXISTS ───────────────────────────────
//
// Nothing here reimplements a panel. Mooring at the Locker opens the Locker;
// sailing into the eye opens the descent chooser, which is the SAME chooser
// the cards used, so the run-start path — and the rule that starting a run
// consumes the attempt — is untouched by all of this. The sea changes how you
// reach a thing, never what the thing is.
//
// ── IT IS THE SEA'S OWN MAELSTROM, NOT A PICTURE OF ONE ─────────────────────
//
// The first cut drew a flat spiral texture for the way down, and it read as
// exactly that: a diagram. The chart already has the real thing — the
// keystoned bowl with its arms, funnel, foam, spirits and the hologram of its
// keeper — built for a world with a camera. It is hosted here by giving it the
// camera it expects: a container squashed by GROUND and scaled to hub size,
// with the eye held dead centre of the "view" so it is roused all the way,
// because you are inside it.
//
// ── ONE SCREEN, NO CAMERA ───────────────────────────────────────────────────
//
// The whole hub is the viewport. Places sit at fractions of the screen so the
// hub composes itself on any phone, and sailing is the boat moving across a
// picture you can already see all of.
//
// It shares the arena's rule about contexts: this is a second Pixi Application
// on the gauntlet's own route, alive only while the lobby is, and it must never
// coexist with the arena's. The two are different phases of the same screen, so
// they never are.

import { useEffect, useRef } from 'react'
import { makeWater, rgb3 } from '@/app/(app)/sea/seaWater'
import { makeMaelstroms, type Maelstroms } from '@/app/(app)/sea/seaMaelstrom'
import { MAELSTROMS } from '@/app/(app)/sea/raidWaters'
import { GROUND } from '@/app/(app)/sea/islandArt'
import { texture } from '@/app/(app)/sea/skiffArt'
import { makeWake, type Wake } from '@/app/(app)/sea/seaWake'
import { makeWeather, type Weather } from './gauntletWeather'
import { makeScenery, type Scenery } from './gauntletScenery'

export type SlipwayPlace = {
  id: string
  /** What the helm says when you are alongside. */
  label: string
  /**
   * Offsets from the CENTRE of the viewport, in units of its short side.
   * Desktop-first: a fraction of the viewport spreads a phone's layout across
   * a wide screen and leaves empty water between everything; an offset in
   * short-side units keeps the same diorama at every size, with the margins
   * of a wide screen given to the water rather than to the layout.
   */
  ox: number
  oy: number
  /** The way down: the maelstrom is drawn here and entered rather than moored at. */
  portal?: boolean
  color: number
  /**
   * WHAT STANDS HERE. A painted landmark on the mooring (phase 4 of the plan:
   * each gauntlet's hub is its own place, not the same pools of light in a
   * different colour). Stands on the pool, rising above it; the card hangs
   * below, so the two never meet.
   */
  art?: string
}

export type SlipwayTheme = {
  sea: [string, string, string]
  dark: number
  key: number
}

/** How close counts as alongside, in units of the viewport's short side. */
const REACH_U = 0.22

type Texture = import('pixi.js').Texture

/**
 * ── WHY THE CACHES ARE CHECKED, NOT JUST READ ───────────────────────────────
 *
 * These little canvas textures are cached at module scope so a remount does not
 * redraw them. But a gauntlet visit tears a whole Pixi Application down and
 * builds another (the lobby's, then the arena's, then the lobby's again), and a
 * texture whose source went down with a previous renderer would come back as an
 * invisible sprite with no error to show for it. So `live()` is the only way in:
 * a cached texture is reused ONLY while its source is still alive, and rebuilt
 * the moment it is not.
 */
function live(t: Texture | null): Texture | null {
  return t && !t.destroyed && !t.source.destroyed ? t : null
}

let ringTex: Texture | null = null
let glowTex: Texture | null = null

function ring(PIXI: typeof import('pixi.js')): Texture {
  const cached = live(ringTex)
  if (cached) return cached
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = 6
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); g.stroke()
  const out = document.createElement('canvas')
  out.width = S; out.height = S
  const og = out.getContext('2d')!
  og.filter = 'blur(2px)'
  og.drawImage(c, 0, 0)
  return (ringTex = PIXI.Texture.from(out))
}

function glow(PIXI: typeof import('pixi.js')): Texture {
  const cached = live(glowTex)
  if (cached) return cached
  const S = 256
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.32)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return (glowTex = PIXI.Texture.from(c))
}

export default function GauntletSlipway({ theme, variant, places, shipUrl, cards, sail, spreadX, onNear, onEnterPortal }: {
  theme: SlipwayTheme
  /** Whose door this is: which maelstrom, whose hologram, which wreck-field. */
  variant: 'davy' | 'don'
  places: SlipwayPlace[]
  /**
   * HOW WIDE THE DIORAMA IS ALLOWED TO BE, across. The places are laid out in
   * units of the viewport's SHORT side, which on a desktop is the height and on
   * a phone is the width — so the same 0.34 that sits comfortably inside a wide
   * screen puts a card half off the glass on a tall one. The host works out the
   * squeeze (it has to, because the DOM cards are placed from the same numbers)
   * and hands it down so both sides cannot disagree.
   */
  spreadX: number
  shipUrl: string
  /**
   * ── THE CARDS THAT RIDE THE MOORINGS ──────────────────────────────────────
   *
   * They are DOM, drawn by the parent, and this loop writes their opacity and
   * transform every frame from how close she actually is.
   *
   * `onNear` cannot do it. It carries ONE id and it carries it as state, so the
   * five cards had exactly two appearances between them — the near one and the
   * other four — and every card sat at near-full strength the whole time. Five
   * lit labels over a painted sea is a menu with a picture behind it: the eye
   * has nowhere to rest, and the water, which is the thing that was actually
   * built here, ends up as wallpaper.
   *
   * Through React state it would also be a re-render of an eight thousand line
   * component to fade a label, sixty times a second.
   */
  cards?: React.MutableRefObject<Map<string, HTMLElement | null>>
  /**
   * ── SEND HER TO A PLACE ───────────────────────────────────────────────────
   *
   * Filled in by this component for the parent to call. The hub is a thing you
   * SAIL, and that is the point of it — but a card riding a mooring still has
   * to be a thing you can press, because a first-time captain looking at a
   * painted sea with five labels on it has no reason to believe any of them are
   * controls. Pressing one takes the helm and steers there; the water does the
   * rest exactly as if you had steered yourself.
   */
  sail?: React.MutableRefObject<((id: string) => void) | null>
  /** The place the hull is alongside, or null. Drives the helm button. */
  onNear: (id: string | null) => void
  /** She sailed into the eye. */
  onEnterPortal: () => void
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const themeRef = useRef(theme); themeRef.current = theme
  const placesRef = useRef(places); placesRef.current = places
  const onNearRef = useRef(onNear); onNearRef.current = onNear
  const cardsRef = useRef(cards); cardsRef.current = cards
  const spreadRef = useRef(spreadX); spreadRef.current = spreadX
  const sailRef = useRef(sail); sailRef.current = sail
  const onPortalRef = useRef(onEnterPortal); onPortalRef.current = onEnterPortal
  const variantRef = useRef(variant); variantRef.current = variant

  useEffect(() => {
    let dead = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      const PIXI = await import('pixi.js')
      if (dead || !holder.current) return
      const el = holder.current

      const app = new PIXI.Application()
      await app.init({
        backgroundAlpha: 0,
        resizeTo: el,
        antialias: true,
        resolution: Math.min(1.5, window.devicePixelRatio || 1),
        autoDensity: true,
        preference: 'webgl',
      })
      if (dead) { app.destroy(true, { children: true }); return }
      el.appendChild(app.canvas)

      const th0 = themeRef.current
      const water = await makeWater(PIXI, {
        uTime: 0,
        uCam: new Float32Array([0, 0]),
        uZoom: 1,
        uRes: new Float32Array([app.screen.width, app.screen.height]),
        uShallow: rgb3(th0.sea[2]),
        uMid: rgb3(th0.sea[1]),
        uDeep: rgb3(th0.sea[0]),
        uDark: th0.dark,
        uLight: new Float32Array([0.5, -0.2]),
        uSwell: 0.5,
        uRush: 0.1,
        uWarm: 0,
      })
      if (dead) { app.destroy(true, { children: true }); return }
      if (water) { app.stage.addChild(water.sprite); water.size(app.screen.width, app.screen.height) }

      const world = new PIXI.Container()
      world.isRenderGroup = true
      app.stage.addChild(world)

      // ── THE FLOOR OF THE THING ──────────────────────────────────────
      // The arena's own scenery — the wreck-field, the shafts, the motes, the
      // vignette — so the hub is visibly the same place the fights are.
      const scenery: Scenery = makeScenery(PIXI)
      const weather: Weather = makeWeather(PIXI)
      world.addChild(weather.water, scenery.far)

      // ── THE MAELSTROM, HOSTED ───────────────────────────────────────
      //
      // The chart's renderer builds both doors at their world positions and
      // asks for a camera. The bowl container IS that camera: squashed by
      // GROUND like the chart's world, scaled to hub size, and positioned so
      // this door's eye lands on the portal place. The camera it is told
      // about sits ON the eye, so the door is roused all the way and its
      // keeper is lit — you are inside it, after all — and the other door is
      // half a world away and culled.
      // SOLID, not a hologram: this is his own door and you are standing in
      // it. The chart keeps the projection, which is what a landmark across a
      // junction should be.
      const maelstroms: Maelstroms = makeMaelstroms(PIXI, app.renderer, { solidKeeper: true })
      const bowl = new PIXI.Container()
      bowl.addChild(maelstroms.view)
      world.addChild(bowl)
      const door = MAELSTROMS.find(m => m.id === variantRef.current) ?? MAELSTROMS[0]

      // ── THE MOORINGS ────────────────────────────────────────────────
      //
      // A pool of light on the water and two ripples going out from it,
      // which is the chart's own idiom for "tie up here". No hoop.
      const ringT = ring(PIXI), glowT = glow(PIXI)
      type Mark = {
        p: SlipwayPlace; node: import('pixi.js').Container
        pool: import('pixi.js').Sprite; rings: import('pixi.js').Sprite[]; ph: number
        art: import('pixi.js').Sprite | null; dish: import('pixi.js').Sprite | null
      }
      const marks: Mark[] = placesRef.current.filter(p => !p.portal).map((p, i) => {
        const node = new PIXI.Container()
        const pool = new PIXI.Sprite(glowT)
        pool.anchor.set(0.5); pool.tint = p.color; pool.alpha = 0.3; pool.blendMode = 'add'
        node.addChild(pool)
        const rings: import('pixi.js').Sprite[] = []
        for (let k = 0; k < 2; k++) {
          const r = new PIXI.Sprite(ringT)
          r.anchor.set(0.5); r.tint = p.color; r.alpha = 0; r.blendMode = 'add'
          node.addChild(r); rings.push(r)
        }
        // THE LANDMARK, when the place has one: a dark dish under it (light
        // taken away says the water is deeper where it stands; see the boat's
        // own shade below), then the painting, anchored near its foot.
        let art: import('pixi.js').Sprite | null = null
        let dish: import('pixi.js').Sprite | null = null
        if (p.art) {
          dish = new PIXI.Sprite(glowT)
          dish.anchor.set(0.5); dish.tint = 0x3c4a56; dish.alpha = 0.55; dish.blendMode = 'multiply'
          art = new PIXI.Sprite(PIXI.Texture.EMPTY)
          art.anchor.set(0.5, 0.94)
          node.addChild(dish, art)
          const a = art
          void texture(PIXI, p.art).then(t => { if (!dead) a.texture = t }).catch(() => {})
        }
        world.addChild(node)
        return { p, node, pool, rings, ph: i * 1.7, art, dish }
      })

      // ── WHAT SHE LEAVES BEHIND ──────────────────────────────────────
      //
      // The lobby had no wake at all, and that is most of why this water read
      // as a painted floor: she crossed it and it did not notice. The chart
      // already owns the real thing — the V, the churn at the stern, and the
      // standing rings a hull sits in when it stops — so it is hosted here
      // rather than reinvented.
      //
      // IT WANTS A SQUASHED WORLD. Everything in `seaWake` is written for the
      // chart's container, which carries `scaleY(GROUND)`, and it divides by
      // GROUND on the way in so its rings land as ellipses on the glass. The
      // Slipway's world is flat screen space, so the wake gets a host with that
      // squash and is fed positions divided by GROUND, exactly as the chart
      // feeds it. Without the host every ring would be a perfect circle, which
      // reads as a hole rather than as water.
      const wakeHost = new PIXI.Container()
      wakeHost.scale.set(1, GROUND)
      const wake: Wake = makeWake(PIXI)
      wakeHost.addChild(wake.view)
      world.addChild(wakeHost)
      // Foam in a drowned place is not white. Taken down toward the water so
      // the brightest thing on this sea stays the door.
      wake.night(0x9fbac8)

      // ── THE SHIP ────────────────────────────────────────────────────
      const boat = new PIXI.Container()
      // ── A DARK DISH, NOT A LAMP ─────────────────────────────────────
      //
      // This was an ADDITIVE pale-blue blob, which is the exact mistake the
      // wake module warns about in its own notes: light added at the waterline
      // makes a hull look like it is hovering over a bulb. Light TAKEN AWAY
      // says the water is deeper where she sits. Same sprite, multiplied.
      const shade = new PIXI.Sprite(glowT)
      shade.anchor.set(0.5); shade.tint = 0x5c7080; shade.alpha = 0.5; shade.blendMode = 'multiply'
      const hull = new PIXI.Sprite(PIXI.Texture.EMPTY)
      hull.anchor.set(0.5)
      boat.addChild(shade, hull)
      world.addChild(boat)
      void texture(PIXI, shipUrl).then(t => { if (!dead) hull.texture = t }).catch(() => {})

      world.addChild(weather.air, scenery.near)

      const u0 = Math.min(app.screen.width, app.screen.height)
      const pos = { x: app.screen.width * 0.5, y: app.screen.height * 0.5 + u0 * 0.26 }
      const target = { x: pos.x, y: pos.y }
      let facing = 1
      /**
       * WHICH WAY SHE IS POINTED. Plain ±1, applied the frame it changes.
       *
       * It used to EASE through zero, on the reasoning that a hull swinging its
       * beam toward you narrows and opens out again. That is true of a hull and
       * false of this sprite: the art is a flat side-on painting, so squashing
       * it horizontally through zero is a sheet of paper being turned over, and
       * it reads as exactly that. A mirror between two frames is the honest
       * cheat here, and it is the one the chart has always used.
       */
      /** How hard she is driving, 0..1, smoothed. Feeds the wake's force and
       *  the lift of her bow: a boat under way sits differently from one
       *  drifting, and that difference is most of "she is sailing". */
      let drive = 0
      /** Held rather than derived, because the heading of a stopped boat is
       *  atan2(0, 0) and her wake would snap to due east the moment she
       *  settled. */
      let heading = Math.PI
      let nearNow: string | null = null
      let entered = false

      const toLocal = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        target.x = e.clientX - r.left
        target.y = e.clientY - r.top
      }
      // THE HELM, FOR THE CARDS. See the `sail` prop.
      const handle = sailRef.current
      if (handle) {
        handle.current = (id: string) => {
          const p = placesRef.current.find(x => x.id === id)
          if (!p) return
          const W = app.screen.width, H = app.screen.height
          const u = Math.min(W, H)
          target.x = W / 2 + p.ox * u * spreadRef.current
          target.y = H / 2 + p.oy * u
        }
      }

      let down = false
      const onDown = (e: PointerEvent) => { down = true; toLocal(e) }
      const onMove = (e: PointerEvent) => { if (down) toLocal(e) }
      const onUp = () => { down = false }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)

      weather.theme({ key: themeRef.current.key, pale: 0xcfe6f0 })
      maelstroms.night(0.35)

      // The water's colours, parsed once per palette rather than three times a
      // frame — `rgb3` parses a hex string and allocates. See the same note in
      // the arena; `water.set` copies out of whatever it is handed.
      const pal = { key: '', deep: rgb3('#000000'), mid: rgb3('#000000'), shallow: rgb3('#000000') }
      const palette = (deep: string, mid: string, shallow: string) => {
        const k = `${deep}|${mid}|${shallow}`
        if (pal.key !== k) {
          pal.key = k
          pal.deep = rgb3(deep); pal.mid = rgb3(mid); pal.shallow = rgb3(shallow)
        }
        return pal
      }
      const uRes = new Float32Array(2)

      let t = 0
      app.ticker.add(() => {
        const dt = Math.min(0.05, app.ticker.deltaMS / 1000)
        t += dt
        const W = app.screen.width, H = app.screen.height
        const th = themeRef.current
        // THE STAGE. Everything is placed from the centre in units of the
        // short side, so a phone and a desktop see the same composition.
        const u = Math.min(W, H)
        const cx = W / 2, cy = H / 2
        const at = (p: { ox: number; oy: number }) => ({ x: cx + p.ox * u * spreadRef.current, y: cy + p.oy * u })
        const REACH = REACH_U * u

        uRes[0] = W; uRes[1] = H
        const pc = palette(th.sea[0], th.sea[1], th.sea[2])
        water?.set({
          uTime: t,
          uRes,
          uShallow: pc.shallow, uMid: pc.mid, uDeep: pc.deep,
          uDark: th.dark + scenery.grade(),
        })
        water?.size(W, H)

        scenery.set({
          variant: variantRef.current, hardcore: false, boss: false, apex: false,
          deep: 0.3, mood: 'between', key: th.key,
          deepColor: parseInt(th.sea[0].replace('#', ''), 16),
        })

        // ── THE DOOR, IN THE MIDDLE OF THE ROOM ───────────────────────
        const portal = placesRef.current.find(p => p.portal)
        const { x: px, y: py } = portal ? at(portal) : { x: cx, y: cy - u * 0.16 }
        // The bowl spans most of the short side: the flat texture is 2.4
        // radii across. The same fraction on a phone and a desktop.
        const z = Math.max(0.2, Math.min(0.6, (u * 0.94) / (door.r * 2.4)))
        bowl.scale.set(z, z * GROUND)
        bowl.position.set(px - door.x * z, py - door.y * z * GROUND)
        maelstroms.advance(t, dt, door.x, door.y, W / (2 * z), H / (2 * z * GROUND))

        // ── SHE SAILS ─────────────────────────────────────────────────
        const dx = target.x - pos.x, dy = target.y - pos.y
        const d = Math.hypot(dx, dy)
        const top = u * 0.62
        let vx = 0, vy = 0
        if (d > 4) {
          const speed = Math.min(d * 2.4, top)
          vx = (dx / d) * speed
          vy = (dy / d) * speed
          pos.x += vx * dt
          pos.y += vy * dt
          heading = Math.atan2(vy, vx)
          if (Math.abs(dx) > 12) facing = dx < 0 ? 1 : -1
        }
        // The throttle is eased — a hull has mass, and full speed on the first
        // frame of a press is a cursor rather than a boat. The FACING is not:
        // see its declaration.
        drive += (Math.hypot(vx, vy) / top - drive) * Math.min(1, dt * 4)

        const bob = Math.sin(t * 1.6) * 3 + Math.sin(t * 2.4 + 1) * 1.8
        boat.x = pos.x
        boat.y = pos.y + bob
        const beam = Math.min(320, u * 0.36)
        if (hull.texture.width > 2) {
          hull.width = beam
          hull.height = beam * (hull.texture.height / hull.texture.width)
          shade.width = beam * 0.72
          shade.height = beam * 0.22
          shade.y = hull.height * 0.29 - bob
        }
        const sgn = facing
        hull.scale.x = Math.abs(hull.scale.x) * sgn
        // AND HER BOW COMES UP WITH THE THROTTLE. Small on purpose: at this
        // size a few degrees is the difference between a boat and a sticker,
        // and any more is a toy being waggled.
        hull.rotation = drive * 0.06 * sgn

        // ── AND THE WATER ANSWERS ─────────────────────────────────────
        // The cutwater is forward of her centre and a little below it; where
        // she SITS is under the middle of her, which is where the standing
        // rings come from once she stops. Divided by GROUND on the way in,
        // because the host carries the squash — see wakeHost.
        if (hull.texture.width > 2) {
          const keel = hull.height * 0.29
          wake.lay([{
            id: 'me',
            x: pos.x - sgn * beam * 0.3,
            y: (pos.y + keel * 0.7) / GROUND,
            cx: pos.x,
            cy: (pos.y + keel) / GROUND,
            ang: heading,
            // Under this she is drifting rather than driving, and a drifting
            // hull should be standing in rings, not trailing foam.
            force: drive > 0.08 ? Math.min(1, drive) : 0,
            scale: beam / 210,
            heave: 0,
            kind: 'plain',
          }])
        }
        wake.advance(dt)

        // ── THE MOORINGS BREATHE, AND THE NEAREST ONE ANSWERS ─────────
        let found: string | null = null
        let bestD = REACH
        for (const m of marks) {
          const { x: mx, y: my } = at(m.p)
          m.node.x = mx; m.node.y = my
          const dd = Math.hypot(pos.x - mx, pos.y - my)
          if (dd < bestD) { bestD = dd; found = m.p.id }
          // ── HOW MUCH THIS MOORING IS THE ONE SHE IS AT ──────────────
          //
          // Continuous, not a threshold. A light that switches on at a radius
          // is a trigger volume; one that comes up as you approach is a place
          // answering. Squared, so the far ones sit right back and nearly all
          // of the brightening happens in the last boat-length.
          const k = Math.max(0, Math.min(1, 1 - dd / (REACH * 2.6))) ** 2
          // ── LEGIBLE FIRST, LIT SECOND ───────────────────────────────
          //
          // The far state was 0.26 opacity, which is a menu you cannot read
          // from across the room — and a hub whose whole job is to show you
          // where you can go. `k` still says which one you are AT; it no
          // longer decides whether the others can be seen at all.
          const seen = 0.62 + 0.38 * k
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + m.ph)
          // ── AND IT IS A POOL, NOT A FLOOD ───────────────────────────
          //
          // These were 0.35 of the short side ACROSS, four of them, additive,
          // and never dimmer than 0.26. At the spacing the places sit at they
          // overlapped into one wash of light over the whole floor, which is
          // what made this water look flat and muddy: nothing was dark, so
          // nothing was lit. Half the size, a third of the resting brightness,
          // and the lit one is unmistakable because the others are not.
          m.pool.width = u * (0.17 + 0.02 * pulse) * (1 + 0.42 * k)
          m.pool.height = m.pool.width * 0.42
          m.pool.alpha = 0.16 + 0.42 * k + 0.05 * pulse * (0.3 + k)
          if (m.art && m.art.texture.width > 2) {
            // Sized to the short side like everything on this stage, and a
            // touch bigger for the one she is at. Bobs on its own slow swell.
            const w = u * 0.2 * (1 + 0.06 * k)
            m.art.width = w
            m.art.height = w * (m.art.texture.height / m.art.texture.width)
            m.art.y = Math.sin(t * 1.1 + m.ph) * u * 0.004
            m.art.alpha = 0.82 + 0.18 * k
            if (m.dish) { m.dish.width = w * 1.1; m.dish.height = w * 0.34; m.dish.y = u * 0.004 }
          }
          for (let j = 0; j < m.rings.length; j++) {
            // The ripples quicken as she comes alongside rather than stepping
            // from one rate to another.
            const uu = ((t * (0.34 + 0.24 * k) + m.ph * 0.13 + j * 0.5) % 1)
            const s = u * (0.055 + uu * (0.12 + 0.1 * k))
            m.rings[j].width = s; m.rings[j].height = s * 0.42
            m.rings[j].alpha = (1 - uu) * (0.1 + 0.46 * k)
          }
          // ── AND ITS CARD, WHICH IS DOM ──────────────────────────────
          // One number written per frame; the sub line, the lift, the scale
          // and the glow all read it. See the `cards` prop.
          const el = cardsRef.current?.current.get(m.p.id)
          if (el) {
            el.style.opacity = Math.max(0.8, seen).toFixed(3)
            // The lift was SIX PIXELS, which is a card that does not move.
            // Over the landmark (its foot on the mooring), a touch bigger for
            // the one she is at, as the painting under it is.
            el.style.transform = `translate(-50%, -92%) scale(${(0.98 + 0.05 * k).toFixed(3)})`
            el.style.setProperty('--k', k.toFixed(3))
          }
        }
        // The eye itself is a place the helm can name.
        if (portal) {
          const pd = Math.hypot(pos.x - px, pos.y - py)
          if (pd < REACH * 1.2 && pd < bestD + REACH) found = portal.id
        }
        if (found !== nearNow) { nearNow = found; onNearRef.current(found) }

        // ── AND THE WAY DOWN TAKES HER ────────────────────────────────
        // Sailing into the eye IS the descent chooser opening. Fired once:
        // the chooser is a decision, and a door that keeps re-opening while
        // you sit in it is not a door.
        if (portal && !entered) {
          const pd = Math.hypot(pos.x - px, pos.y - py)
          if (pd < REACH * 0.55) { entered = true; onPortalRef.current() }
        } else if (portal && entered) {
          const pd = Math.hypot(pos.x - px, pos.y - py)
          if (pd > REACH * 1.4) entered = false
        }

        // A hub is weather you can stand in, not weather that is happening to
        // you: a fifth of the dial, no bolts to speak of, no maw.
        weather.advance(dt, t, W, H, 0.22, false, 0)
        scenery.advance(dt, t, W, H, 0.22, 0)
      })

      cleanup = () => {
        if (handle) handle.current = null
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        wake.destroy()
        maelstroms.destroy()
        scenery.destroy()
        weather.destroy()
        // THE FILTER COMES OFF FIRST. The water is a sprite wearing a shader,
        // and destroying the renderer with that shader still bound to its
        // textures is what Pixi's "destroyed while still bound" warnings were.
        if (water) {
          const fs = water.sprite.filters
          water.sprite.filters = []
          if (Array.isArray(fs)) for (const f of fs) f.destroy()
          water.sprite.destroy()
        }
        app.destroy(true, { children: true, texture: false })
      }
    })().catch(() => {})

    return () => { dead = true; cleanup?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={holder} style={{ position: 'fixed', inset: 0, zIndex: 0, touchAction: 'none' }} />
}
