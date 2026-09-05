'use client'

// ── THE SLIPWAY ─────────────────────────────────────────────────────────────
//
// The gauntlet's hub, as water. Phase 2 of the facelift: arriving at a descent
// stops being a scroll of cards and becomes somewhere you are — a small drowned
// sea with your ship on it, the places you can moor at lit around her, and the
// way down turning in the middle of it.
//
// ── EVERY PLACE IS A MENU THAT ALREADY EXISTS ───────────────────────────────
//
// Nothing here reimplements a panel. Mooring at the Locker opens the Locker;
// sailing into the portal opens the descent chooser, which is the SAME chooser
// the card used, so the run-start path — and the rule that starting a run
// consumes the attempt — is untouched by all of this. The sea changes how you
// reach a thing, never what the thing is.
//
// ── ONE SCREEN, NO CAMERA ───────────────────────────────────────────────────
//
// The whole hub is the viewport. There is no camera, no world larger than the
// window, and no scrolling: places sit at fractions of the screen so the hub
// composes itself on any phone, and sailing is the boat moving across a picture
// you can already see all of. A camera here would buy nothing and cost the
// clarity of being able to see every door at once.
//
// It shares the arena's rule about contexts: this is a second Pixi Application
// on the gauntlet's own route, alive only while the lobby is, and it must never
// coexist with the arena's. The two are different phases of the same screen, so
// they never are.

import { useEffect, useRef } from 'react'
import { makeWater, rgb3 } from '@/app/(app)/sea/seaWater'
import { makeWeather, type Weather } from './gauntletWeather'
import { texture } from '@/app/(app)/sea/skiffArt'

export type SlipwayPlace = {
  id: string
  /** What the helm says when you are alongside. */
  label: string
  /** Fractions of the viewport. */
  x: number
  y: number
  /** The portal is drawn as a vortex and entered rather than moored at. */
  portal?: boolean
  color: number
}

export type SlipwayTheme = {
  sea: [string, string, string]
  dark: number
  key: number
}

/** How close, in screen pixels, counts as alongside. */
const REACH = 96

let ringTex: Texture | null = null
let glowTex: Texture | null = null
let spinTex: Texture | null = null
type Texture = import('pixi.js').Texture

function ring(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = 5
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); g.stroke()
  const out = document.createElement('canvas')
  out.width = S; out.height = S
  const og = out.getContext('2d')!
  og.filter = 'blur(1.5px)'
  og.drawImage(c, 0, 0)
  return (ringTex = PIXI.Texture.from(out))
}

function glow(PIXI: typeof import('pixi.js')): Texture {
  if (glowTex) return glowTex
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

/** The portal's spiral, so the way down is visibly a way DOWN. */
function spin(PIXI: typeof import('pixi.js')): Texture {
  if (spinTex) return spinTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2, cy = S / 2
  g.lineCap = 'round'
  for (let a = 0; a < 3; a++) {
    const off = (a / 3) * Math.PI * 2
    let px = 0, py = 0
    for (let i = 0; i <= 150; i++) {
      const t = i / 150
      const th = off + t * Math.PI * 2 * 1.4
      const r = 8 + Math.pow(t, 0.85) * (S / 2 - 12)
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r
      if (i > 0) {
        g.strokeStyle = 'rgba(255,255,255,' + (0.12 + 0.62 * Math.sin(t * Math.PI)).toFixed(3) + ')'
        g.lineWidth = 22 * (0.3 + t)
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke()
      }
      px = x; py = y
    }
  }
  const out = document.createElement('canvas')
  out.width = S; out.height = S
  const og = out.getContext('2d')!
  og.filter = 'blur(4px)'
  og.drawImage(c, 0, 0)
  return (spinTex = PIXI.Texture.from(out))
}

export default function GauntletSlipway({ theme, places, shipUrl, onNear, onEnterPortal }: {
  theme: SlipwayTheme
  places: SlipwayPlace[]
  shipUrl: string
  /** The place the hull is alongside, or null. Drives the helm button. */
  onNear: (id: string | null) => void
  /** She sailed into the vortex. */
  onEnterPortal: () => void
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const themeRef = useRef(theme); themeRef.current = theme
  const placesRef = useRef(places); placesRef.current = places
  const onNearRef = useRef(onNear); onNearRef.current = onNear
  const onPortalRef = useRef(onEnterPortal); onPortalRef.current = onEnterPortal

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
        uSwell: 0.45,
        uRush: 0.08,
        uWarm: 0,
      })
      if (dead) { app.destroy(true, { children: true }); return }
      if (water) { app.stage.addChild(water.sprite); water.size(app.screen.width, app.screen.height) }

      const world = new PIXI.Container()
      world.isRenderGroup = true
      app.stage.addChild(world)

      const weather: Weather = makeWeather(PIXI)
      world.addChild(weather.water)

      // ── THE PLACES ──────────────────────────────────────────────────
      //
      // A lit ring on the water with a glow under it. No art: a buoy would be
      // one more thing to draw and the ring already says "moor here", which is
      // the whole message. The portal gets a spiral instead, because it is not
      // a place you tie up at.
      const ringT = ring(PIXI), glowT = glow(PIXI), spinT = spin(PIXI)
      type Mark = { p: SlipwayPlace; node: import('pixi.js').Container; ring: import('pixi.js').Sprite; halo: import('pixi.js').Sprite; spiral: import('pixi.js').Sprite | null }
      const marks: Mark[] = placesRef.current.map(p => {
        const node = new PIXI.Container()
        const halo = new PIXI.Sprite(glowT)
        halo.anchor.set(0.5); halo.tint = p.color; halo.alpha = 0.3; halo.blendMode = 'add'
        halo.width = 190; halo.height = 190 * 0.6
        const rg = new PIXI.Sprite(ringT)
        rg.anchor.set(0.5); rg.tint = p.color; rg.alpha = 0.6; rg.blendMode = 'add'
        rg.width = 96; rg.height = 96 * 0.55
        node.addChild(halo, rg)
        let spiral: import('pixi.js').Sprite | null = null
        if (p.portal) {
          // A sprite squashed into an ellipse and THEN rotated carries its own
          // long axis round with it, so the vortex stood up on its end every
          // half turn and stopped lying on the water. The squash belongs to a
          // container outside the spin: rotate the round sprite inside it and
          // the ground plane holds through every turn.
          const plate = new PIXI.Container()
          plate.scale.set(1, 0.5)
          spiral = new PIXI.Sprite(spinT)
          spiral.anchor.set(0.5); spiral.tint = p.color; spiral.alpha = 0.42; spiral.blendMode = 'add'
          spiral.width = 300; spiral.height = 300
          plate.addChild(spiral)
          node.addChildAt(plate, 0)
        }
        world.addChild(node)
        return { p, node, ring: rg, halo, spiral }
      })

      // ── THE SHIP ────────────────────────────────────────────────────
      // Added BEFORE the air layer, so the rain falls in front of her rather
      // than behind her. Every hull on the chart sits under the weather.
      const boat = new PIXI.Container()
      const shade = new PIXI.Sprite(glowT)
      shade.anchor.set(0.5)
      shade.tint = 0xbfe4ee
      shade.alpha = 0.22
      shade.blendMode = 'add'
      const hull = new PIXI.Sprite(PIXI.Texture.EMPTY)
      hull.anchor.set(0.5)
      boat.addChild(shade, hull)
      world.addChild(boat)

      world.addChild(weather.air)
      void texture(PIXI, shipUrl).then(t => { if (!dead) hull.texture = t }).catch(() => {})

      // Where she is and where she is going, both in screen pixels.
      const pos = { x: app.screen.width * 0.5, y: app.screen.height * 0.72 }
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

      let t = 0
      app.ticker.add(() => {
        const dt = Math.min(0.05, app.ticker.deltaMS / 1000)
        t += dt
        const W = app.screen.width, H = app.screen.height
        const th = themeRef.current

        water?.set({
          uTime: t,
          uRes: new Float32Array([W, H]),
          uShallow: rgb3(th.sea[2]), uMid: rgb3(th.sea[1]), uDeep: rgb3(th.sea[0]),
          uDark: th.dark,
        })
        water?.size(W, H)

        // ── SHE SAILS ─────────────────────────────────────────────────
        const dx = target.x - pos.x, dy = target.y - pos.y
        const d = Math.hypot(dx, dy)
        if (d > 4) {
          const speed = Math.min(d * 2.4, 260)
          pos.x += (dx / d) * speed * dt
          pos.y += (dy / d) * speed * dt
          if (Math.abs(dx) > 12) facing = dx < 0 ? 1 : -1
        }
        const bob = Math.sin(t * 1.6) * 3 + Math.sin(t * 2.4 + 1) * 1.8
        boat.x = pos.x
        boat.y = pos.y + bob
        if (hull.texture.width > 2) {
          const w = Math.min(190, W * 0.34)
          hull.width = w
          hull.height = w * (hull.texture.height / hull.texture.width)
          // The shadow pools under her waterline, not under her centre, and it
          // does NOT take the bob — a shadow that rises with the hull is what
          // makes a sprite look like it is flying.
          // Tight and just under her keel. Wide and soft reads as fog she is
          // sitting on rather than water she is sitting in.
          shade.width = w * 0.58
          shade.height = w * 0.17
          shade.y = hull.height * 0.29 - bob
        }
        hull.scale.x = Math.abs(hull.scale.x) * facing

        // ── THE PLACES BREATHE, AND THE NEAREST ONE ANSWERS ───────────
        let found: string | null = null
        let bestD = REACH
        for (const m of marks) {
          const mx = W * m.p.x, my = H * m.p.y
          m.node.x = mx; m.node.y = my
          const dd = Math.hypot(pos.x - mx, pos.y - my)
          if (dd < bestD) { bestD = dd; found = m.p.id }
          const near = dd < REACH * 1.6
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + m.p.x * 7)
          m.ring.alpha = (near ? 0.85 : 0.45) + 0.15 * pulse
          m.halo.alpha = (near ? 0.5 : 0.24) + 0.1 * pulse
          const s = (near ? 1.12 : 1) + 0.03 * pulse
          m.ring.width = 96 * s; m.ring.height = 96 * 0.55 * s
          if (m.spiral) {
            m.spiral.rotation += dt * (near ? 1.1 : 0.5)
            m.spiral.alpha = (near ? 0.66 : 0.4) + 0.08 * pulse
          }
        }
        if (found !== nearNow) { nearNow = found; onNearRef.current(found) }

        // ── AND THE WAY DOWN TAKES HER ────────────────────────────────
        // Sailing into the vortex IS the descent chooser opening. Fired once:
        // the chooser is a decision, and a door that keeps re-opening while
        // you sit in it is not a door.
        const portal = marks.find(m => m.p.portal)
        if (portal && !entered) {
          const pd = Math.hypot(pos.x - W * portal.p.x, pos.y - H * portal.p.y)
          if (pd < REACH * 0.5) { entered = true; onPortalRef.current() }
        } else if (portal && entered) {
          const pd = Math.hypot(pos.x - W * portal.p.x, pos.y - H * portal.p.y)
          if (pd > REACH * 1.4) entered = false
        }

        // A hub is weather you can stand in, not weather that is happening to
        // you: a quarter of the dial, no bolts to speak of, no maw.
        weather.advance(dt, t, W, H, 0.26, false, 0)
      })

      cleanup = () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        weather.destroy()
        app.destroy(true, { children: true, texture: false })
      }
    })().catch(() => {})

    return () => { dead = true; cleanup?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={holder} style={{ position: 'fixed', inset: 0, zIndex: 0, touchAction: 'none' }} />
}
