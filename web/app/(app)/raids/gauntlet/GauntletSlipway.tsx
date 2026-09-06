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

export default function GauntletSlipway({ theme, variant, places, shipUrl, onNear, onEnterPortal }: {
  theme: SlipwayTheme
  /** Whose door this is: which maelstrom, whose hologram, which wreck-field. */
  variant: 'davy' | 'don'
  places: SlipwayPlace[]
  shipUrl: string
  /** The place the hull is alongside, or null. Drives the helm button. */
  onNear: (id: string | null) => void
  /** She sailed into the eye. */
  onEnterPortal: () => void
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const themeRef = useRef(theme); themeRef.current = theme
  const placesRef = useRef(places); placesRef.current = places
  const onNearRef = useRef(onNear); onNearRef.current = onNear
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
      const maelstroms: Maelstroms = makeMaelstroms(PIXI, app.renderer)
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
        world.addChild(node)
        return { p, node, pool, rings, ph: i * 1.7 }
      })

      // ── THE SHIP ────────────────────────────────────────────────────
      const boat = new PIXI.Container()
      const shade = new PIXI.Sprite(glowT)
      shade.anchor.set(0.5); shade.tint = 0xbfe4ee; shade.alpha = 0.22; shade.blendMode = 'add'
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
      let nearNow: string | null = null
      let entered = false

      const toLocal = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        target.x = e.clientX - r.left
        target.y = e.clientY - r.top
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
        const at = (p: { ox: number; oy: number }) => ({ x: cx + p.ox * u, y: cy + p.oy * u })
        const REACH = REACH_U * u

        water?.set({
          uTime: t,
          uRes: new Float32Array([W, H]),
          uShallow: rgb3(th.sea[2]), uMid: rgb3(th.sea[1]), uDeep: rgb3(th.sea[0]),
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
        if (d > 4) {
          const speed = Math.min(d * 2.4, u * 0.62)
          pos.x += (dx / d) * speed * dt
          pos.y += (dy / d) * speed * dt
          if (Math.abs(dx) > 12) facing = dx < 0 ? 1 : -1
        }
        const bob = Math.sin(t * 1.6) * 3 + Math.sin(t * 2.4 + 1) * 1.8
        boat.x = pos.x
        boat.y = pos.y + bob
        if (hull.texture.width > 2) {
          const w = Math.min(320, u * 0.36)
          hull.width = w
          hull.height = w * (hull.texture.height / hull.texture.width)
          shade.width = w * 0.58
          shade.height = w * 0.17
          shade.y = hull.height * 0.29 - bob
        }
        hull.scale.x = Math.abs(hull.scale.x) * facing

        // ── THE MOORINGS BREATHE, AND THE NEAREST ONE ANSWERS ─────────
        let found: string | null = null
        let bestD = REACH
        for (const m of marks) {
          const { x: mx, y: my } = at(m.p)
          m.node.x = mx; m.node.y = my
          const dd = Math.hypot(pos.x - mx, pos.y - my)
          if (dd < bestD) { bestD = dd; found = m.p.id }
          const near = dd < REACH * 1.6
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + m.ph)
          m.pool.width = u * (0.35 + 0.055 * pulse)
          m.pool.height = m.pool.width * 0.42
          m.pool.alpha = (near ? 0.5 : 0.26) + 0.08 * pulse
          for (let k = 0; k < m.rings.length; k++) {
            const uu = ((t * (near ? 0.55 : 0.36) + m.ph * 0.13 + k * 0.5) % 1)
            const s = u * (0.08 + uu * 0.22)
            m.rings[k].width = s; m.rings[k].height = s * 0.42
            m.rings[k].alpha = (1 - uu) * (near ? 0.55 : 0.28)
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
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
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
