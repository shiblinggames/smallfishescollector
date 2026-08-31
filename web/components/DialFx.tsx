'use client'

// ── EVERYTHING THE DIAL DOES THAT SVG CANNOT ────────────────────────────────
//
// A Pixi layer BEHIND the dial, and behind is the whole design. The dial itself
// is untouched: the zones stay SVG, and the needle stays in its own composited
// layer spun by a WAAPI rotation on the compositor thread, because that is what
// makes main-thread jank unable to make it skip. Nothing here can reach either.
// What this adds is what SVG genuinely cannot do, which is a great many small
// bright things moving independently.
//
// Four things live in here, and each one existed as a compromise before:
//
//   THE FIRE was two states. A ring at streak 2, a bigger ring at 3 and up, and
//   nothing after. The reward for a streak of nine looked exactly like a streak
//   of three, which is the wrong shape for the one number people chase.
//
//   THE LIGHT IT CASTS did not exist. Fire was drawn AROUND the instrument
//   while the instrument stayed the same brightness, which is the tell that it
//   is a decal rather than something burning.
//
//   THE SMOKE did not exist either, and it is most of why a big fire reads as
//   big: flame says how hot, smoke says how much.
//
//   THE ANCIENT AURA is two static rings, and the comment on them says why:
//   the breathing version "animated strokeOpacity on two thick rings every
//   frame for the whole fight, which re-rastered the stroke ~60x/sec and was a
//   big part of the Ancient Deep is laggy report". That is a shader's job, and
//   out here it costs a tint and an alpha.
//
// ── WHAT IT COSTS, AND WHEN ─────────────────────────────────────────────────
//
// Nothing until a streak is running or an Ancient is on the hook: no import, no
// canvas, no second WebGL context. Built on the frame it is wanted, destroyed
// on the way out, and the live numbers are read through a ref inside the ticker
// so a streak going from three to four does not tear down a context to do it.

import { useEffect, useRef } from 'react'

/** Where the dial's rim is, as a fraction of the box. Matches OUTER_R+6
 *  against the 220 viewBox, so embers leave the rim rather than the paint. */
const RING = (96 + 6) / 220

const CAP_EMBER = 420
const CAP_SMOKE = 90
const CAP_MOTE = 54
/** The soft-dot texture's own size. Every scale is divided by it. */
const S = 64

type Bit = {
  x: number; y: number
  vx: number; vy: number
  /** 0..1, and it is the whole animation: size, alpha and colour all read it. */
  age: number
  life: number
  size: number
  heat: number
  spin: number
}

export default function DialFx({ streak, burstKey, ancientBoss = false }: {
  /** The live perfect streak. Under 2 is no fire; it builds from there and has
   *  no ceiling written into it, only the diminishing returns of `intensity`. */
  streak: number
  /** Bumped on a perfect catch. Throws a hard ring of sparks off the rim, on
   *  the same frame the dial's own gold flash fires. */
  burstKey: number
  /** One of the six Ancient trophy fights. */
  ancientBoss?: boolean
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  const live = useRef({ streak, burstKey, ancientBoss })
  live.current = { streak, burstKey, ancientBoss }

  const wanted = streak >= 2 || ancientBoss

  useEffect(() => {
    if (!wanted) return
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
        antialias: false,   // every sprite here is a soft blob; no edge to smooth
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      if (dead) { a.destroy(true, { children: true }); return }
      app = a
      el.appendChild(a.canvas)
      a.canvas.style.pointerEvents = 'none'

      // ── ONE SOFT DOT, TINTED PER PARTICLE ───────────────────────────
      // A single texture and `tint` rather than one per colour: tint is free
      // and a texture swap would break the batch that makes each container a
      // single draw call.
      const dot = (() => {
        const c = document.createElement('canvas')
        c.width = c.height = S
        const g = c.getContext('2d')!
        const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
        grad.addColorStop(0.00, 'rgba(255,255,255,1)')
        grad.addColorStop(0.35, 'rgba(255,255,255,0.5)')
        grad.addColorStop(1.00, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(0, 0, S, S)
        return PIXI.Texture.from(c)
      })()

      // ── 1. THE LIGHT THE FIRE CASTS ─────────────────────────────────
      //
      // A warm wash sitting UNDER the instrument, growing with the streak. This
      // is the part that makes the dial look like it is burning rather than
      // like it has fire drawn near it: a light source lights what is around
      // it, and the old fire lit nothing.
      const wash: import('pixi.js').Sprite = new PIXI.Sprite(dot)
      wash.anchor.set(0.5)
      wash.blendMode = 'add'
      wash.alpha = 0
      a.stage.addChild(wash)

      // ── 2. THE ANCIENT'S HALO ───────────────────────────────────────
      //
      // Breathing, which the SVG version is not allowed to be. Two sprites: a
      // wide void-violet bloom and a tight cyan rim, out of phase, so it
      // swells rather than blinking.
      const voidHalo: import('pixi.js').Sprite = new PIXI.Sprite(dot)
      voidHalo.anchor.set(0.5)
      voidHalo.blendMode = 'add'
      voidHalo.tint = 0x7c3aed
      voidHalo.alpha = 0
      a.stage.addChild(voidHalo)

      const rim: import('pixi.js').Sprite = new PIXI.Sprite(dot)
      rim.anchor.set(0.5)
      rim.blendMode = 'add'
      rim.tint = 0x67e8f9
      rim.alpha = 0
      a.stage.addChild(rim)

      // ── 3. SMOKE ────────────────────────────────────────────────────
      //
      // Its own container because it does NOT add: smoke over a dark sea is
      // lit by the fire under it, so it is a pale warm grey at very low alpha,
      // and adding it would turn it into more flame. Behind the embers, so the
      // bright things stay in front of the dull ones.
      const smokeLayer: import('pixi.js').ParticleContainer = new PIXI.ParticleContainer({
        dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
      })
      a.stage.addChild(smokeLayer)

      const emberLayer: import('pixi.js').ParticleContainer = new PIXI.ParticleContainer({
        dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
      })
      // FIRE ADDS. Two embers overlapping are brighter than one, which is what
      // makes a dense fire read as hot rather than as more dots.
      emberLayer.blendMode = 'add'
      a.stage.addChild(emberLayer)

      // ── 4. THE ANCIENT'S MOTES ──────────────────────────────────────
      // Slow, cold specks orbiting the instrument. Nothing about them is
      // urgent; they are there to say the water is wrong.
      const moteLayer: import('pixi.js').ParticleContainer = new PIXI.ParticleContainer({
        dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
      })
      moteLayer.blendMode = 'add'
      a.stage.addChild(moteLayer)

      const make = (n: number, into: import('pixi.js').ParticleContainer) => {
        const out: (Bit & { p: import('pixi.js').Particle })[] = []
        for (let i = 0; i < n; i++) {
          const p: import('pixi.js').Particle = new PIXI.Particle({ texture: dot })
          p.anchorX = 0.5
          p.anchorY = 0.5
          p.alpha = 0
          into.addParticle(p)
          out.push({ p, x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, heat: 0, spin: 0 })
        }
        return out
      }
      const embers = make(CAP_EMBER, emberLayer)
      const smoke = make(CAP_SMOKE, smokeLayer)
      const motes = make(CAP_MOTE, moteLayer)
      let ne = 0, ns = 0
      const takeEmber = () => { const e = embers[ne]; ne = (ne + 1) % CAP_EMBER; return e }
      const takeSmoke = () => { const e = smoke[ns]; ns = (ns + 1) % CAP_SMOKE; return e }

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

      const box = () => {
        const w = a.renderer.width / a.renderer.resolution
        const h = a.renderer.height / a.renderer.resolution
        return { w, h, cx: w / 2, cy: h / 2, r: Math.min(w, h) * RING }
      }

      let seenBurst = live.current.burstKey
      let emberDebt = 0
      let smokeDebt = 0
      let clock = 0
      let moteInit = false

      const spawnEmber = (i: number, burst: boolean) => {
        const e = takeEmber()
        const { cx, cy, r } = box()
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
        const out = burst ? 130 + Math.random() * 110 : 6 + Math.random() * 14 * i
        e.vx = Math.cos(ang) * out
        e.vy = Math.sin(ang) * out - (burst ? 0 : 26 + Math.random() * 40 * i)
        e.age = 0
        e.life = burst ? 0.42 + Math.random() * 0.22 : 0.55 + Math.random() * (0.5 + i * 0.35)
        e.size = (burst ? 5 : 4 + Math.random() * 5) * (0.7 + i * 0.45)
        e.heat = burst ? 0 : Math.random() * 0.28
        e.spin = (Math.random() - 0.5) * 2.2
      }

      const spawnSmoke = (i: number) => {
        const e = takeSmoke()
        const { cx, cy, r } = box()
        // Off the TOP half only. Smoke is what the fire has already finished
        // with, and it has finished with it by the time it has risen.
        const ang = -Math.PI * 0.5 + (Math.random() * 2 - 1) * Math.PI * 0.62
        e.x = cx + Math.cos(ang) * r * (0.86 + Math.random() * 0.2)
        e.y = cy + Math.sin(ang) * r * (0.86 + Math.random() * 0.2)
        e.vx = (Math.random() - 0.5) * 26
        e.vy = -34 - Math.random() * 40 * i
        e.age = 0
        e.life = 1.5 + Math.random() * 1.4
        e.size = (14 + Math.random() * 14) * (0.7 + i * 0.5)
        e.heat = 0
        e.spin = (Math.random() - 0.5) * 2
      }

      a.ticker.add(t => {
        const dt = Math.min(0.05, t.deltaMS / 1000)
        clock += dt
        const i = intensity()
        const { cx, cy, r } = box()

        // ── THE WASH ── the dial lit by its own fire. Breathes slightly, so it
        // never sits as a flat disc of light behind the instrument.
        wash.position.set(cx, cy)
        const flick = 0.9 + Math.sin(clock * 7.3) * 0.05 + Math.sin(clock * 11.7) * 0.05
        const washR = r * (1.9 + i * 0.55)
        wash.scale.set((washR * 2) / S)
        wash.alpha = Math.min(0.5, i * 0.17) * flick
        wash.tint = i > 1.5 ? 0xff7a2a : 0xff9d3c

        // ── THE ANCIENT ── breathing, which is the whole point of moving it
        // out of SVG. Two periods, out of phase, so it swells rather than
        // pulsing on a beat.
        if (live.current.ancientBoss) {
          const b1 = 0.5 + 0.5 * Math.sin(clock * 0.9)
          const b2 = 0.5 + 0.5 * Math.sin(clock * 1.37 + 1.1)
          voidHalo.position.set(cx, cy)
          voidHalo.scale.set((r * (2.5 + b1 * 0.34) * 2) / S)
          voidHalo.alpha = 0.16 + b1 * 0.13
          rim.position.set(cx, cy)
          rim.scale.set((r * (1.28 + b2 * 0.07) * 2) / S)
          rim.alpha = 0.1 + b2 * 0.1

          if (!moteInit) {
            moteInit = true
            for (let k = 0; k < CAP_MOTE; k++) {
              const m = motes[k]
              m.age = 0; m.life = 1
              m.spin = Math.random() * Math.PI * 2          // bearing
              m.size = 1.6 + Math.random() * 3.4
              m.heat = 0.35 + Math.random() * 0.75          // orbit radius factor
              m.vx = (0.06 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1)  // rad/s
              m.vy = Math.random() * Math.PI * 2            // bob phase
            }
          }
          for (const m of motes) {
            m.spin += m.vx * dt
            const rr = r * (1.15 + m.heat * 0.85) + Math.sin(clock * 0.8 + m.vy) * 6
            m.p.x = cx + Math.cos(m.spin) * rr
            m.p.y = cy + Math.sin(m.spin) * rr * 0.92
            const k = m.size / S
            m.p.scaleX = k
            m.p.scaleY = k
            m.p.tint = m.heat > 0.75 ? 0x67e8f9 : 0xa78bfa
            m.p.alpha = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(clock * 1.7 + m.vy))
          }
        } else {
          voidHalo.alpha = 0
          rim.alpha = 0
          for (const m of motes) m.p.alpha = 0
        }

        // ── THE PERFECT ── a hard ring of sparks, on the frame the dial's own
        // gold flash fires. The only thing in here that does not obey the
        // streak: a perfect is a perfect at any length.
        if (live.current.burstKey !== seenBurst) {
          seenBurst = live.current.burstKey
          for (let k = 0; k < 46; k++) spawnEmber(Math.max(1, i), true)
        }

        // ── THE STANDING FIRE ──
        // Fractional debt rather than a rounded count, or the rate quantises
        // into visible steps at the low end and the first rung looks like a
        // stutter instead of a flame.
        if (i > 0) {
          emberDebt += i * i * 120 * dt
          while (emberDebt >= 1) { emberDebt -= 1; spawnEmber(i, false) }
          // SMOKE ONLY ONCE IT IS A REAL FIRE. A wisp of smoke off a small
          // flame reads as something going out.
          if (i > 0.9) {
            smokeDebt += (i - 0.9) * 16 * dt
            while (smokeDebt >= 1) { smokeDebt -= 1; spawnSmoke(i) }
          }
        }

        for (const e of embers) {
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

        for (const e of smoke) {
          if (e.age >= 1) { e.p.alpha = 0; continue }
          e.age += dt / e.life
          if (e.age >= 1) { e.p.alpha = 0; continue }
          e.vx *= 1 - 0.6 * dt
          e.vy *= 1 - 0.35 * dt
          e.x += (e.vx + Math.sin(clock * 1.3 + e.spin * 5) * 20 * e.age) * dt
          e.y += e.vy * dt
          e.p.x = e.x
          e.p.y = e.y
          // Smoke only ever expands. It is the one thing here that does not
          // swell and shrink, because that is the difference between a cloud
          // and a spark.
          const k = (e.size * (0.5 + e.age * 1.9)) / S
          e.p.scaleX = k
          e.p.scaleY = k
          // Warm near the flame, grey once it is clear of it.
          e.p.tint = e.age < 0.35 ? 0x6b5340 : 0x4a4a52
          e.p.alpha = Math.sin(e.age * Math.PI) * 0.17
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
    // Built ONCE for the life of a fire. The live numbers are read through a
    // ref inside the ticker, so growing from 3 to 4 changes the fire without
    // tearing down a WebGL context to do it; the dependency is only whether
    // there is anything to draw at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted])

  return (
    <div ref={holder} aria-hidden style={{
      position: 'absolute',
      // OVERSPILL. The dial's own box stops at the rim and this has to reach
      // well past it, so the canvas is grown around the instrument and pushed
      // behind it. Nothing here is interactive and nothing here is layout.
      inset: '-46%',
      pointerEvents: 'none',
      zIndex: 0,
    }} />
  )
}
