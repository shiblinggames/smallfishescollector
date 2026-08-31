'use client'

// ── THE DIAL CATCHES FIRE ───────────────────────────────────────────────────
//
// A Pixi layer BEHIND the dial, and behind is the whole design. The dial itself
// is untouched: the zones stay SVG, and the needle stays in its own composited
// layer spun by a WAAPI rotation on the compositor thread, because that is what
// makes main-thread jank unable to make it skip. Nothing here can reach either.
// What this adds is the thing SVG genuinely cannot do, which is a lot of small
// bright things moving independently.
//
// ── IT GROWS WITH THE STREAK, CONTINUOUSLY ──────────────────────────────────
//
// The old fire was two states: a ring at streak 2, a slightly bigger ring at 3
// and up. So the reward for a streak of nine looked exactly like the reward for
// a streak of three, which is the wrong shape for the one number in this game
// people chase. Here the streak is a dial, not a switch: more embers, faster,
// higher, hotter in colour and further round the rim, all the way up.
//
// ── EMBERS OFF THE RIM, NOT A LAMP BEHIND THE DISC ──────────────────────────
//
// Every particle is born ON the dial's outer ring at a random bearing and rises
// with a little outward drift, so the fire belongs to the edge of the
// instrument. A single emitter at one point reads as a sparkler taped to it,
// which is the same mistake the rod auras had to unlearn.
//
// ── WHAT IT COSTS, AND WHEN ─────────────────────────────────────────────────
//
// Nothing at all until a streak is actually running: no context, no canvas, no
// import. It is created on the first frame the fire is wanted and destroyed on
// the way out. At full tilt it is a few hundred particles in ONE
// ParticleContainer, which is one draw call, on a canvas the size of the dial
// rather than the screen.

import { useEffect, useRef } from 'react'

/** Where the ring is, as a fraction of the box. Matches the dial's OUTER_R+6
 *  against its 220 viewBox, so the embers leave the rim rather than the paint. */
const RING = (96 + 6) / 220

/** The most we will ever have alive. Sized against the top of the ladder:
 *  spawn rate x life at streak 10 with headroom, so the pool never has to
 *  recycle a particle that is still on screen. */
const CAP = 420

type Ember = {
  x: number; y: number
  vx: number; vy: number
  /** 0..1, and it is the whole animation: size, alpha and colour all read it. */
  age: number
  life: number
  size: number
  /** Which of the three heats this one was born at. */
  heat: number
  spin: number
}

export default function DialFire({ streak, burstKey }: {
  /** The live perfect streak. 0 or 1 is no fire; it builds from 2 up and has no
   *  ceiling written into it, only the diminishing returns of `intensity`. */
  streak: number
  /** Bumped on a perfect catch. Throws a hard ring of sparks off the rim, on
   *  the same frame the dial's own flash fires. */
  burstKey: number
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const live = useRef({ streak, burstKey })
  live.current = { streak, burstKey }

  useEffect(() => {
    // NOTHING HAPPENS UNTIL THERE IS A STREAK. A player who never chains two
    // perfects never loads Pixi, never gets a second WebGL context, and never
    // pays a frame for this.
    if (streak < 2) return
    let dead = false
    let app: import('pixi.js').Application | null = null

    ;(async () => {
      const PIXI = await import('pixi.js')
      if (dead || !holder.current) return
      const el = holder.current
      const a = new PIXI.Application()
      await a.init({
        backgroundAlpha: 0,
        resizeTo: el,
        antialias: false,   // embers are soft blobs; there is no edge to smooth
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      if (dead) { a.destroy(true, { children: true }); return }
      app = a
      el.appendChild(a.canvas)
      a.canvas.style.pointerEvents = 'none'

      // ── ONE SOFT DOT, TINTED PER PARTICLE ───────────────────────────
      // A single texture and `tint` rather than three textures: tint is free
      // and a texture swap would break the batch that makes this one draw call.
      const S = 64
      const c = document.createElement('canvas')
      c.width = c.height = S
      const g = c.getContext('2d')!
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      grad.addColorStop(0.00, 'rgba(255,255,255,1)')
      grad.addColorStop(0.35, 'rgba(255,255,255,0.5)')
      grad.addColorStop(1.00, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, S, S)
      const tex = PIXI.Texture.from(c)

      const layer: import('pixi.js').ParticleContainer = new PIXI.ParticleContainer({
        dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
      })
      // FIRE ADDS. Two embers overlapping are brighter than one, which is what
      // makes a dense fire read as hot rather than as more dots.
      layer.blendMode = 'add'
      a.stage.addChild(layer)

      const pool: (Ember & { p: import('pixi.js').Particle })[] = []
      for (let i = 0; i < CAP; i++) {
        const p: import('pixi.js').Particle = new PIXI.Particle({ texture: tex })
        p.anchorX = 0.5
        p.anchorY = 0.5
        p.alpha = 0
        layer.addParticle(p)
        pool.push({ p, x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, heat: 0, spin: 0 })
      }
      let next = 0
      const take = () => { const e = pool[next]; next = (next + 1) % CAP; return e }

      // ── THE LADDER ──────────────────────────────────────────────────
      //
      // Everything the fire does is one number, and it never quite stops
      // growing: sqrt keeps a streak of twenty visibly bigger than a streak of
      // ten without a streak of a hundred filling the screen. 2 is the first
      // rung, so it starts at a real fire rather than a wisp.
      const intensity = () => {
        const s = live.current.streak
        return s < 2 ? 0 : Math.min(2.6, Math.sqrt((s - 1) / 2.2))
      }

      // Heat by age: white at the base, gold through the middle, ember red as
      // it dies. Read off a ramp rather than lerped in RGB, because a straight
      // interpolation from white to red goes through pink.
      const HOT = [0xfff3d0, 0xffd479, 0xff9d3c, 0xef4b28, 0x8f2410]
      const tintAt = (t: number) => HOT[Math.min(HOT.length - 1, Math.floor(t * HOT.length))]

      let seenBurst = live.current.burstKey
      let spawnDebt = 0
      let clock = 0

      const spawn = (i: number, burst: boolean) => {
        const e = take()
        const w = a.renderer.width / a.renderer.resolution
        const h = a.renderer.height / a.renderer.resolution
        const cx = w / 2, cy = h / 2
        const r = Math.min(w, h) * RING
        // ── WHERE IT IS BORN ──
        // Anywhere on the ring at low streaks and increasingly weighted to the
        // bottom half as it grows, because a fire climbs: the top of the rim is
        // where the embers ARRIVE, not where they start.
        const bias = burst ? Math.random() : (Math.random() * 2 - 1)
        const ang = burst
          ? Math.random() * Math.PI * 2
          : Math.PI * 0.5 + bias * Math.PI * (0.55 + i * 0.22)
        const jitter = 1 + (Math.random() - 0.5) * 0.06
        e.x = cx + Math.cos(ang) * r * jitter
        e.y = cy + Math.sin(ang) * r * jitter
        // Outward off the rim, then buoyancy takes over in the tick.
        const out = burst ? 130 + Math.random() * 110 : 6 + Math.random() * 14 * i
        e.vx = Math.cos(ang) * out
        e.vy = Math.sin(ang) * out - (burst ? 0 : 26 + Math.random() * 40 * i)
        e.age = 0
        e.life = burst ? 0.42 + Math.random() * 0.22 : 0.55 + Math.random() * (0.5 + i * 0.35)
        e.size = (burst ? 5 : 4 + Math.random() * 5) * (0.7 + i * 0.45)
        e.heat = burst ? 0 : Math.random() * 0.28
        e.spin = (Math.random() - 0.5) * 2.2
      }

      a.ticker.add(t => {
        const dt = Math.min(0.05, t.deltaMS / 1000)
        clock += dt
        const i = intensity()

        // ── THE PERFECT ── a hard ring of sparks, on the frame the dial's own
        // gold flash fires. It is the only thing in here that does not obey the
        // streak: a perfect is a perfect at any length.
        if (live.current.burstKey !== seenBurst) {
          seenBurst = live.current.burstKey
          for (let k = 0; k < 46; k++) spawn(Math.max(1, i), true)
        }

        // ── AND THE STANDING FIRE ──
        // Fractional debt rather than a rounded count, or the rate quantises
        // into visible steps at the low end and the first rung looks like a
        // stutter instead of a flame.
        if (i > 0) {
          spawnDebt += i * i * 120 * dt
          while (spawnDebt >= 1) { spawnDebt -= 1; spawn(i, false) }
        }

        for (const e of pool) {
          if (e.age >= 1) { e.p.alpha = 0; continue }
          e.age += dt / e.life
          if (e.age >= 1) { e.p.alpha = 0; continue }
          // BUOYANCY, not gravity. An ember accelerates upward as it heats the
          // air around it and slows sideways as it loses its throw.
          e.vy -= 42 * dt * (0.4 + i)
          e.vx *= 1 - 1.9 * dt
          e.vy *= 1 - 0.8 * dt
          // A little lateral wander so a column of them does not read as a jet.
          e.x += (e.vx + Math.sin(clock * 3.1 + e.spin * 6) * 12 * e.age) * dt
          e.y += e.vy * dt
          e.p.x = e.x
          e.p.y = e.y
          // Swelling then dying, which is what a spark of burning gas does.
          const k = (e.size * (0.55 + Math.sin(e.age * Math.PI) * 0.75)) / S
          e.p.scaleX = k
          e.p.scaleY = k
          e.p.tint = tintAt(e.heat + e.age * (1 - e.heat))
          // Held bright for the first third, then out. A linear fade from the
          // first frame makes every ember look like it is already going out.
          e.p.alpha = e.age < 0.3 ? 1 : Math.pow(1 - (e.age - 0.3) / 0.7, 1.7)
        }
      })
    })()

    return () => {
      dead = true
      if (app) {
        app.ticker.stop()
        app.destroy(true, { children: true, texture: true })
        app = null
      }
    }
    // Built ONCE for the life of a streak. `streak` is read through the ref
    // inside the ticker, so growing from 3 to 4 changes the fire without
    // tearing down a WebGL context to do it; the dependency is only whether
    // there is a fire at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak >= 2])

  return (
    <div ref={holder} aria-hidden style={{
      position: 'absolute',
      // OVERSPILL. The dial's own box stops at the rim and the fire has to go
      // well past it, so the canvas is grown around the instrument and pushed
      // behind it. Nothing here is interactive and nothing here is layout.
      inset: '-46%',
      pointerEvents: 'none',
      zIndex: 0,
    }} />
  )
}
