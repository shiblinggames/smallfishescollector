'use client'

// ── WHAT A CRATE IS WORTH, DRAWN ────────────────────────────────────────────
//
// Every crate in the game used to open the same way. Same shake, same spin, same
// pop, and the only thing telling a Wooden from an Ancient was the sprite and an
// accent colour. The rarest chest in the game opened like the one that drops
// every other cast.
//
// So the juice is a LADDER now, and this is the layer that carries it. Wooden
// gets a puff of splinters and nothing else — it should feel like prying open a
// box, because that is what it is. Ancient gets an ambient field before it is
// even touched, a charge that builds through the whole spin, and a burst that
// throws light across the card. The difference is legible before the strip
// stops moving, which is the point: anticipation is most of the reward.
//
// ── CANVAS 2D, DELIBERATELY, AND NOT AS A COMPROMISE ────────────────────────
//
// The obvious instinct is Pixi, since the sea is already on it. That is exactly
// the mistake that took the chart down once before: a browser allows only a
// handful of live WebGL contexts and EVICTS THE OLDEST when it runs out, and the
// oldest is the sea chart, up since the session started. The dial's streak fire
// shipped on Pixi and silently killed the renderer drawing the player's own
// boat, every trader and every island. It was reported as "no boat renders but I
// can still move", which is what a dead GL context under a live DOM looks like.
//
// A crate opens INSIDE that chart, in a 300px box, and it is a few hundred soft
// additive blobs. No meshes, no shaders, no filters, no texture over 64px.
// `globalCompositeOperation = 'lighter'` on a 2D canvas draws all of it, cannot
// contend for a context, and looks identical. See components/DialFx, which is
// the same decision written down after the same accident.
//
// THE COLOURS ARE PRE-BAKED, one small sprite per tint, because `ctx.filter` is
// slow and per-particle tinting on 2D is not a thing.
//
// ── AND IT COSTS NOTHING WHEN IT IS DOING NOTHING ───────────────────────────
//
// A Wooden crate sitting closed has no ambient field, so no canvas is created at
// all. The loop also parks itself the moment every particle is dead and the
// phase is not asking for more, so a revealed card sitting on screen while
// somebody reads it is not still painting.

import { useEffect, useRef } from 'react'
import type { CrateTierId } from './CrateOpening'

/** The baked sprite's own size. Every scale divides by it. */
const S = 64

/**
 * THE LADDER. One row per tier, and the numbers are the whole feel.
 *
 * `ambient` is the tell that matters most: it is the only one that runs while
 * the crate is still shut, so it is what makes a Diamond feel different BEFORE
 * you touch it. Wooden and Metal are deliberately zero — a common drop that
 * announces itself is a common drop that lies.
 */
const JUICE: Record<CrateTierId, {
  /** Specks drifting around a closed crate. 0 means no canvas at all. */
  ambient: number
  /** Particles per second thrown while the strip is spinning. */
  charge: number
  /** Sparks on the landing. The one number people would call "the juice". */
  burst: number
  /** How hard the burst lights the card up, 0 to 1. */
  flash: number
  /** Gravity on the sparks. Heavy debris falls; light motes hang. */
  fall: number
  /** Core and rim colours. Two per tier so a spark can cool as it dies. */
  hot: string
  cool: string
}> = {
  // Splinters. Brown, heavy, gone almost at once.
  wooden:  { ambient: 0,  charge: 0,  burst: 14, flash: 0.18, fall: 320, hot: '#e0b183', cool: '#8a5a33' },
  // Filings off a struck lid: white-hot, fast, still heavy.
  metal:   { ambient: 0,  charge: 8,  burst: 26, flash: 0.3,  fall: 260, hot: '#eef4ff', cool: '#7e8b9c' },
  // Coin glitter. This is where a crate starts feeling like money.
  gold:    { ambient: 10, charge: 20, burst: 46, flash: 0.52, fall: 150, hot: '#fff0c2', cool: '#e0a022' },
  // Prismatic and slow. Hangs in the air, which is what makes it read as rare.
  diamond: { ambient: 20, charge: 38, burst: 72, flash: 0.74, fall: 40,  hot: '#ffffff', cool: '#38bdf8' },
  // The one that stops the room. Rises instead of falling: nothing else in the
  // game does that, so an Ancient is recognisable from across the card.
  ancient: { ambient: 30, charge: 54, burst: 96, flash: 1,    fall: -60, hot: '#f6ecd2', cool: '#b08d4e' },
}

/** One soft radial dot. Baked once, drawn a few hundred times a frame. Same
 *  two-pass build as DialFx: a flat fill, then the alpha ramp punched through
 *  it, because one gradient cannot carry a solid hue AND a falloff everywhere. */
function bakeDot(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = colour
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'destination-in'
  const mask = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  mask.addColorStop(0.00, 'rgba(0,0,0,1)')
  mask.addColorStop(0.35, 'rgba(0,0,0,0.55)')
  mask.addColorStop(1.00, 'rgba(0,0,0,0)')
  g.fillStyle = mask
  g.fillRect(0, 0, S, S)
  return c
}

type Bit = {
  x: number; y: number
  vx: number; vy: number
  /** 0..1, and it is the whole animation: size, alpha and colour read it. */
  age: number
  life: number
  size: number
  /** 0 ambient, 1 charge, 2 burst. Decides which sprite and which physics. */
  kind: number
}

const CAP = 260
const blank = (): Bit => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, kind: 0 })

export default function CrateFx({ tier, phase, landKey, box = 92 }: {
  tier: CrateTierId
  phase: 'closed' | 'rolling' | 'revealed'
  /** Bumped on the frame the strip settles. Fires the burst. */
  landKey: number
  /** The crate art's box in CSS px, so particles leave the CRATE rather than
   *  the middle of a card that may be much wider than it. */
  box?: number
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  /** Restarts the loop after it has parked. Set by the effect below, called by
   *  the one under it whenever something new is worth drawing. */
  const kick = useRef<(() => void) | null>(null)
  // Live values read from inside the loop, so a phase change does not tear the
  // canvas down and rebuild it mid-flight.
  const live = useRef({ tier, phase, landKey, box })
  live.current = { tier, phase, landKey, box }

  // Wooden sitting closed wants nothing at all, and that is most of the crates
  // anyone ever opens. No canvas, no loop, no allocation.
  const wanted = JUICE[tier].ambient > 0 || phase !== 'closed'

  useEffect(() => {
    if (!wanted) return
    const el = holder.current
    if (!el) return

    const cv = document.createElement('canvas')
    cv.style.width = '100%'
    cv.style.height = '100%'
    cv.style.display = 'block'
    cv.style.pointerEvents = 'none'
    el.appendChild(cv)
    const ctx = cv.getContext('2d')
    if (!ctx) { el.removeChild(cv); return }

    // 1.5 rather than the renderer's 2. Soft blobs with no edge to keep sharp,
    // and fill rate is the only thing this spends.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0, h = 0
    const resize = () => {
      const r = el.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    // Two sprites per tier, baked for every tier once rather than rebuilt when
    // the tier prop changes: a host only ever shows one crate at a time and the
    // whole set is ten 64px canvases.
    const sprites = {} as Record<CrateTierId, { hot: HTMLCanvasElement; cool: HTMLCanvasElement }>
    for (const k of Object.keys(JUICE) as CrateTierId[]) {
      sprites[k] = { hot: bakeDot(JUICE[k].hot), cool: bakeDot(JUICE[k].cool) }
    }

    const bits = Array.from({ length: CAP }, blank)
    let next = 0
    const take = (): Bit => { const b = bits[next]; next = (next + 1) % CAP; return b }

    let parked = false
    let seenLand = live.current.landKey
    /** Decays from 1 after a landing. Drives the card-wide flash. */
    let flash = 0
    let chargeDebt = 0
    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const { tier: tr, phase: ph, landKey: lk, box: bx } = live.current
      const j = JUICE[tr]
      const sp = sprites[tr]
      // The crate art sits centred in the top `box` of the holder, so this is
      // where anything thrown by the crate should come FROM.
      const cx = w / 2
      const cy = Math.min(h / 2, bx / 2)

      // ── THE LANDING ──
      if (lk !== seenLand) {
        seenLand = lk
        flash = 1
        for (let i = 0; i < j.burst; i++) {
          const b = take()
          const a = Math.random() * Math.PI * 2
          // Biased sideways rather than evenly radial: a lid comes off, and a
          // perfect circle of sparks reads as a firework instead.
          const speed = 70 + Math.random() * 230
          b.x = cx; b.y = cy
          b.vx = Math.cos(a) * speed
          b.vy = Math.sin(a) * speed * 0.75 - 60
          b.age = 0
          b.life = 0.5 + Math.random() * 0.7
          b.size = 3 + Math.random() * 7
          b.kind = 2
        }
      }

      // ── THE CHARGE ── only while the strip is moving, and it converges INWARD,
      // which is what makes a long spin feel like it is building to something
      // rather than just taking longer.
      if (ph === 'rolling' && j.charge > 0) {
        chargeDebt += j.charge * dt
        while (chargeDebt >= 1) {
          chargeDebt -= 1
          const b = take()
          const a = Math.random() * Math.PI * 2
          const r = bx * (0.6 + Math.random() * 0.5)
          b.x = cx + Math.cos(a) * r
          b.y = cy + Math.sin(a) * r * 0.8
          // Aimed at the crate. Speed is set so it arrives about when it dies.
          b.life = 0.5 + Math.random() * 0.35
          b.vx = (cx - b.x) / b.life
          b.vy = (cy - b.y) / b.life
          b.age = 0
          b.size = 2 + Math.random() * 4
          b.kind = 1
        }
      }

      // ── THE AMBIENT FIELD ── the only one that runs on a closed crate, and
      // the reason a Diamond feels different before it is touched. Topped up to
      // a population rather than spawned at a rate, so it holds steady.
      if (ph === 'closed' && j.ambient > 0) {
        let aliveAmbient = 0
        for (const b of bits) if (b.kind === 0 && b.age < 1) aliveAmbient++
        if (aliveAmbient < j.ambient && Math.random() < 0.5) {
          const b = take()
          b.x = cx + (Math.random() * 2 - 1) * bx * 0.75
          b.y = cy + (Math.random() * 2 - 1) * bx * 0.5
          b.vx = (Math.random() * 2 - 1) * 8
          b.vy = -6 - Math.random() * 14
          b.age = 0
          b.life = 1.6 + Math.random() * 1.6
          b.size = 1.5 + Math.random() * 3
          b.kind = 0
        }
      }

      ctx.clearRect(0, 0, w, h)
      // LIGHT ADDS. The card underneath is flat and near-black, so anything
      // painted over it would read as a smear; adding reads as a glow.
      ctx.globalCompositeOperation = 'lighter'

      // The wash the burst throws across the card. One big soft dot, so the
      // whole panel warms for a moment instead of only the crate.
      if (flash > 0.002) {
        flash -= dt * 2.6
        const k = Math.max(0, flash)
        const rad = bx * (1.1 + (1 - k) * 1.5)
        ctx.globalAlpha = k * k * j.flash * 0.6
        ctx.drawImage(sp.cool, cx - rad, cy - rad * 0.8, rad * 2, rad * 1.6)
      }

      let alive = 0
      for (const b of bits) {
        if (b.age >= 1) continue
        alive++
        b.age += dt / b.life
        if (b.age >= 1) continue
        // Debris falls, ancient motes rise, and drag pulls everything up short
        // so nothing sails off the card at constant speed.
        if (b.kind === 2) {
          b.vy += j.fall * dt
          b.vx *= 1 - Math.min(1, dt * 1.6)
          b.vy *= 1 - Math.min(1, dt * 0.9)
        }
        b.x += b.vx * dt
        b.y += b.vy * dt

        // Sparks start at the hot colour and cool as they die; the ambient
        // field is always the cool one, because a resting crate is not on fire.
        const hot = b.kind === 2 && b.age < 0.45
        const img = hot ? sp.hot : sp.cool
        const fade = b.kind === 0
          // Ambient fades in AND out, so specks do not blink into existence.
          ? Math.sin(b.age * Math.PI) * 0.5
          : (1 - b.age) * (b.kind === 1 ? 0.6 : 1)
        const size = b.size * (b.kind === 1 ? 1 - b.age * 0.5 : 1 + b.age * 0.5)
        ctx.globalAlpha = Math.max(0, fade)
        ctx.drawImage(img, b.x - size, b.y - size, size * 2, size * 2)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // ── AND IT PARKS ITSELF ──
      // Nothing alive, no flash, and the phase is not asking for more. A
      // revealed card sitting on screen while somebody reads it should not
      // still be painting sixty times a second.
      const asking = (ph === 'closed' && j.ambient > 0) || (ph === 'rolling' && j.charge > 0)
      if (!alive && flash <= 0.002 && !asking) {
        cancelAnimationFrame(raf)
        raf = 0
        parked = true
      }
    }

    // The loop stops when there is nothing to draw, so anything that CAN give
    // it something to draw has to be able to start it again. Driven by a prop
    // change rather than by polling: the only things that create work are a
    // phase change and a landing, and both arrive as renders.
    kick.current = () => {
      if (!parked) return
      parked = false
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      kick.current = null
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      if (cv.parentNode === el) el.removeChild(cv)
    }
  }, [wanted])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { kick.current?.() }, [phase, landKey, tier])

  if (!wanted) return null
  return (
    <div ref={holder} aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
    }} />
  )
}
