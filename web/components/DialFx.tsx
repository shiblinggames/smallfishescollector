'use client'

// ── EVERYTHING THE DIAL DOES THAT SVG CANNOT ────────────────────────────────
//
// A layer BEHIND the dial, and behind is the whole design. The dial itself is
// untouched: the zones stay SVG, and the needle stays in its own composited
// layer spun by a WAAPI rotation on the compositor thread, because that is what
// makes main-thread jank unable to make it skip. Nothing here can reach either.
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
//   THE ANCIENT AURA is two static rings, and the comment on them says why: the
//   breathing version "animated strokeOpacity on two thick rings every frame
//   for the whole fight, which re-rastered the stroke ~60x/sec and was a big
//   part of the Ancient Deep is laggy report".
//
// ── CANVAS 2D, AND THAT IS NOT A COMPROMISE, IT IS THE FIX ──────────────────
//
// This shipped on Pixi and took the chart down with it. A browser allows only
// a handful of live WebGL contexts and EVICTS THE OLDEST when it runs out; the
// oldest is the sea chart, which had been up since the session started. So a
// streak on the dial silently killed the renderer drawing your own boat, every
// trader and every island, and nothing anywhere listens for `webglcontextlost`,
// so it never came back. The report was "no boat renders but I can still move",
// which is exactly what a dead GL context under a live DOM looks like.
//
// A second context was never worth having here. This is a 300px box of soft
// additive blobs — no meshes, no shaders, no filters, no textures bigger than
// 64px — and `globalCompositeOperation = 'lighter'` on a 2D canvas does all of
// it. Same visuals, one canvas, and it cannot contend for anything.
//
// THE COLOURS ARE PRE-BAKED, one small sprite per tint, because `ctx.filter` is
// slow and per-particle tinting on 2D is not a thing. Eleven 64px sprites, made
// once, and every particle is a drawImage.
//
// ── WHAT IT COSTS, AND WHEN ─────────────────────────────────────────────────
//
// Nothing until a streak is running or an Ancient is on the hook: the canvas is
// created on the frame it is wanted and dropped on the way out, and the live
// numbers are read through a ref inside the loop so a streak going from three
// to four does not rebuild anything.

import { useEffect, useRef } from 'react'

/** Where the dial's rim is, as a fraction of THE DIAL'S box. Matches OUTER_R+6
 *  against the 220 viewBox, so embers leave the rim rather than the paint. */
const RING = (96 + 6) / 220

/**
 * HOW FAR THE CANVAS REACHES PAST THE DIAL, as a fraction of the dial's box on
 * each side. The holder is `inset: -SPILL`, so the canvas is (1 + 2 x SPILL)
 * dial-widths across and its half-extent is (0.5 + SPILL) of one.
 *
 * ── IT IS A CONSTANT BECAUSE IT WAS TWO NUMBERS THAT DISAGREED ─────────────
 *
 * The spill was a bare `-46%` in the style and nothing in the maths knew about
 * it, so `r` was measured against the CANVAS: `min(w,h) * RING`. RING is
 * calibrated against the dial, so r came out 1.92x too big and every size
 * derived from it went with it. The wash at a streak of ten worked out around
 * 1,600px wide inside a 576px canvas — the whole soft falloff fell outside the
 * bitmap and what was left was the flat bright middle of the gradient, cut off
 * square by the canvas edge. A visible warm BOX behind the dial, which is
 * exactly how it was reported.
 *
 * So the two live together now and everything is measured off the dial. The
 * value has to leave room for the largest thing drawn — the wash at the top of
 * the ladder, at 1.04 dial-widths from centre — with margin for the smoke,
 * which rises furthest.
 */
const SPILL = 0.75

/**
 * THE POOL HAS TO COVER THE PEAK, and it did not.
 *
 * Alive at once is spawn rate x lifetime, and at the top of the ladder that is
 * about 570. At 300 the fire recycled embers that were still on screen: a
 * particle vanishing mid-arc and reappearing at the rim, which reads as the
 * effect glitching rather than as a number being too small. It was already
 * true before the curve grew and would only have got louder.
 */
const CAP_EMBER = 600
const CAP_SMOKE = 70
const CAP_MOTE = 44
/** The baked sprite's own size. Every scale is divided by it. */
const S = 64

/** Heat by age: white at the base, gold through the middle, ember red as it
 *  dies. A ramp rather than an RGB lerp, because white to red goes via pink. */
const HOT = ['#fff3d0', '#ffd479', '#ff9d3c', '#ef4b28', '#8f2410']
const SMOKE_NEAR = '#6b5340'
const SMOKE_FAR = '#4a4a52'
const VOID = '#7c3aed'
const RIM = '#67e8f9'
const WASH_WARM = '#ff9d3c'
const WASH_HOT = '#ff7a2a'

/** One soft radial dot in a given colour. Baked once and drawn a few hundred
 *  times a frame. */
function bakeDot(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // The colour at full strength in the core, gone at the rim. Parsed through
  // a fill rather than string-built rgba(), so any CSS colour works.
  grad.addColorStop(0.00, colour)
  grad.addColorStop(0.35, colour)
  grad.addColorStop(1.00, colour)
  g.fillStyle = grad
  g.globalAlpha = 1
  // Draw the falloff as a separate mask pass: fill the colour, then punch the
  // alpha ramp through it. One radial gradient cannot carry both a solid hue
  // and an alpha ramp across every browser, and this always can.
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'destination-in'
  const mask = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  mask.addColorStop(0.00, 'rgba(0,0,0,1)')
  mask.addColorStop(0.35, 'rgba(0,0,0,0.5)')
  mask.addColorStop(1.00, 'rgba(0,0,0,0)')
  g.fillStyle = mask
  g.fillRect(0, 0, S, S)
  return c
}

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

const blank = (): Bit => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, heat: 0, spin: 0 })

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

    // 1.5 rather than the renderer's 2. This is a field of soft blobs with no
    // edge to keep sharp, and the fill rate is the only thing it spends.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0, h = 0
    /** Width of the boundary fade. Set with the canvas, not once beside it: a
     *  rotation or a resize changes the bitmap and a snapshot taken next to
     *  the draw call would go stale against it. */
    let edgeFade = 24
    const resize = () => {
      const r = el.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      edgeFade = Math.max(24, Math.min(w, h) * 0.08)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const hot = HOT.map(bakeDot)
    const smokeNear = bakeDot(SMOKE_NEAR)
    const smokeFar = bakeDot(SMOKE_FAR)
    const voidDot = bakeDot(VOID)
    const rimDot = bakeDot(RIM)
    const washWarm = bakeDot(WASH_WARM)
    const washHot = bakeDot(WASH_HOT)

    const embers = Array.from({ length: CAP_EMBER }, blank)
    const smoke = Array.from({ length: CAP_SMOKE }, blank)
    const motes = Array.from({ length: CAP_MOTE }, blank)
    let ne = 0, ns = 0
    const takeEmber = () => { const e = embers[ne]; ne = (ne + 1) % CAP_EMBER; return e }
    const takeSmoke = () => { const e = smoke[ns]; ns = (ns + 1) % CAP_SMOKE; return e }

    // ── THE LADDER, ANCHORED AT TEN ───────────────────────────────────
    //
    // Everything the fire does is one number, and getting its SHAPE right took
    // two passes in opposite directions.
    //
    // The first divided inside a square root, so it opened at 0.67 and DOUBLED
    // by streak three. Chaining a handful of perfects already put you at the
    // top of the ladder, and everything above it looked identical.
    //
    // The second slowed the early climb and undershot the other end. Ten is the
    // number people actually chase and it has to LOOK like it; at 0.42*sqrt it
    // was still a modest fire there.
    //
    // So it is ANCHORED rather than tuned. A streak of ten is 2.0, which is
    // where the version people liked put "big"; the exponent is picked so the
    // first rung still opens small, and the cap at 2.8 leaves somewhere for
    // fifteen and twenty to go. Smoke arrives at five and the hot colour at
    // seven, both far enough up to stay news.
    //
    //   streak    2    3    4    5    7   10   15   20+
    //   i      0.45 0.72 0.95 1.15 1.52 2.00 2.70 2.80
    //   e/s      29   58   88  118  178  269  422  445
    const intensity = () => {
      const s = live.current.streak
      return s < 2 ? 0 : Math.min(2.8, 2 * Math.pow((s - 1) / 9, 0.68))
    }

    for (const m of motes) {
      m.spin = Math.random() * Math.PI * 2            // bearing
      m.size = 1.6 + Math.random() * 3.4
      m.heat = 0.35 + Math.random() * 0.75            // orbit radius factor
      m.vx = (0.06 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1)  // rad/s
      m.vy = Math.random() * Math.PI * 2              // bob phase
    }

    let seenBurst = live.current.burstKey
    let emberDebt = 0
    let smokeDebt = 0
    let clock = 0
    let last = performance.now()
    let raf = 0

    const spawnEmber = (i: number, burst: boolean, cx: number, cy: number, r: number) => {
      const e = takeEmber()
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

    const spawnSmoke = (i: number, cx: number, cy: number, r: number) => {
      const e = takeSmoke()
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

    /** One soft sprite, centred, at a diameter and an alpha. */
    // ── NOTHING IS ALLOWED TO MEET THE EDGE AT FULL STRENGTH ──────────
    //
    // Sizing the canvas so every particle fits is a losing game: the wash and
    // the aura scale with the streak, the embers are thrown by physics with no
    // closed form, and the ladder has no ceiling anybody wants to write down.
    // Get it wrong and the failure mode is not subtle — it is a visible BOX,
    // because a soft gradient cut by a rectangle stops being soft.
    //
    // So the boundary is a fade rather than a wall. Anything approaching it
    // dims to nothing over the last band of pixels, which makes clipping
    // impossible by construction rather than by arithmetic that has to be
    // redone every time the fire is retuned.
    //
    // The big centred blobs — the wash, the aura — sit at the middle and never
    // touch this. It costs one min and one multiply per particle.
    const blob = (img: HTMLCanvasElement, x: number, y: number, d: number, alpha: number) => {
      if (alpha <= 0.004 || d <= 0.5) return
      const edge = Math.min(x, y, w - x, h - y)
      if (edge <= 0) return
      const k = edge < edgeFade ? edge / edgeFade : 1
      const a = alpha * k
      if (a <= 0.004) return
      ctx.globalAlpha = a
      ctx.drawImage(img, x - d / 2, y - d / 2, d, d)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      clock += dt
      const i = intensity()
      const cx = w / 2, cy = h / 2
      // BACK OUT THE DIAL FROM THE CANVAS. The canvas is deliberately bigger
      // than the instrument; the rim is a fact about the instrument.
      const dial = Math.min(w, h) / (1 + 2 * SPILL)
      const r = dial * RING

      ctx.clearRect(0, 0, w, h)

      // ── THE PERFECT ── a hard ring of sparks, on the frame the dial's own
      // gold flash fires. The only thing in here that does not obey the streak:
      // a perfect is a perfect at any length.
      if (live.current.burstKey !== seenBurst) {
        seenBurst = live.current.burstKey
        for (let k = 0; k < 46; k++) spawnEmber(Math.max(1, i), true, cx, cy, r)
      }

      // ── THE STANDING FIRE ──
      // Fractional debt rather than a rounded count, or the rate quantises into
      // visible steps at the low end and the first rung looks like a stutter
      // instead of a flame.
      if (i > 0) {
        // ^1.5, NOT SQUARED. The curve above already grows, and squaring it on
        // top made the count climb as roughly the fourth power of the streak,
        // which is how the first version managed to be at its ceiling by three.
        // This lets the count rise WITH the fire rather than ahead of it, and
        // leaves size, height and the wash to carry the rest.
        emberDebt += Math.pow(i, 1.5) * 95 * dt
        while (emberDebt >= 1) { emberDebt -= 1; spawnEmber(i, false, cx, cy, r) }
        // SMOKE ONLY ONCE IT IS A REAL FIRE. A wisp off a small flame reads as
        // something going out.
        // 1.15 is a streak of five. Smoke is the "this is a real fire" tell and
        // it should not arrive while the fire is still a flicker.
        if (i > 1.15) {
          smokeDebt += (i - 1.15) * 14 * dt
          while (smokeDebt >= 1) { smokeDebt -= 1; spawnSmoke(i, cx, cy, r) }
        }
      }

      // ── SMOKE FIRST, and it is the one thing here that does not add. Smoke
      // over a dark sea is lit by the fire under it, so it is a pale warm grey
      // at very low alpha; adding it would turn it into more flame.
      ctx.globalCompositeOperation = 'source-over'
      for (const e of smoke) {
        if (e.age >= 1) continue
        e.age += dt / e.life
        if (e.age >= 1) continue
        e.vx *= 1 - 0.6 * dt
        e.vy *= 1 - 0.35 * dt
        e.x += (e.vx + Math.sin(clock * 1.3 + e.spin * 5) * 20 * e.age) * dt
        e.y += e.vy * dt
        // Smoke only ever EXPANDS. It is the one thing here that does not swell
        // and shrink, because that is the difference between a cloud and a spark.
        blob(e.age < 0.35 ? smokeNear : smokeFar, e.x, e.y,
          e.size * (0.5 + e.age * 1.9) * 2, Math.sin(e.age * Math.PI) * 0.17)
      }

      ctx.globalCompositeOperation = 'lighter'

      // ── THE WASH ── the dial lit by its own fire. Breathes slightly, so it
      // never sits as a flat disc of light behind the instrument.
      if (i > 0) {
        const flick = 0.9 + Math.sin(clock * 7.3) * 0.05 + Math.sin(clock * 11.7) * 0.05
        // FITS INSIDE THE CANVAS AT THE TOP OF THE LADDER, which is the whole
        // point: at the cap this reaches 1.04 dial-widths and the canvas holds
        // 1.25, so the falloff lands on the bitmap and the light has an edge
        // made of gradient rather than of rectangle.
        blob(i > 1.5 ? washHot : washWarm, cx, cy,
          r * (1.4 + i * 0.3) * 2, Math.min(0.5, i * 0.17) * flick)
      }

      // ── THE ANCIENT ── breathing, which is the whole point of moving it off
      // SVG. Two periods, out of phase, so it swells rather than pulsing on a
      // beat.
      if (live.current.ancientBoss) {
        const b1 = 0.5 + 0.5 * Math.sin(clock * 0.9)
        const b2 = 0.5 + 0.5 * Math.sin(clock * 1.37 + 1.1)
        // Same reasoning as the wash: it has to fit the bitmap it is on.
        blob(voidDot, cx, cy, r * (1.9 + b1 * 0.26) * 2, 0.16 + b1 * 0.13)
        blob(rimDot, cx, cy, r * (1.28 + b2 * 0.07) * 2, 0.1 + b2 * 0.1)
        for (const m of motes) {
          m.spin += m.vx * dt
          const rr = r * (1.15 + m.heat * 0.85) + Math.sin(clock * 0.8 + m.vy) * 6
          blob(m.heat > 0.75 ? rimDot : voidDot,
            cx + Math.cos(m.spin) * rr, cy + Math.sin(m.spin) * rr * 0.92,
            m.size * 2, 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(clock * 1.7 + m.vy)))
        }
      }

      // ── AND THE EMBERS, in front of everything ──
      for (const e of embers) {
        if (e.age >= 1) continue
        e.age += dt / e.life
        if (e.age >= 1) continue
        // BUOYANCY, not gravity. An ember accelerates upward as it heats the
        // air around it and slows sideways as it loses its throw.
        e.vy -= 42 * dt * (0.4 + i)
        e.vx *= 1 - 1.9 * dt
        e.vy *= 1 - 0.8 * dt
        // A little lateral wander so a column of them does not read as a jet.
        e.x += (e.vx + Math.sin(clock * 3.1 + e.spin * 6) * 12 * e.age) * dt
        e.y += e.vy * dt
        const t = e.heat + e.age * (1 - e.heat)
        // Swelling then dying, which is what a spark of burning gas does. Held
        // bright for the first third: a linear fade from the first frame makes
        // every ember look like it is already going out.
        blob(hot[Math.min(hot.length - 1, Math.floor(t * hot.length))], e.x, e.y,
          e.size * (0.55 + Math.sin(e.age * Math.PI) * 0.75) * 2,
          e.age < 0.3 ? 1 : Math.pow(1 - (e.age - 0.3) / 0.7, 1.7))
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (cv.parentNode) cv.parentNode.removeChild(cv)
    }
    // Built ONCE for the life of a fire. The live numbers are read through a
    // ref inside the loop, so growing from 3 to 4 changes the fire without
    // rebuilding anything; the dependency is only whether there is anything to
    // draw at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted])

  return (
    <div ref={holder} aria-hidden style={{
      position: 'absolute',
      // OVERSPILL. The dial's own box stops at the rim and this has to reach
      // well past it, so the canvas is grown around the instrument and pushed
      // behind it. Nothing here is interactive and nothing here is layout.
      //
      // FROM THE SAME CONSTANT THE MATHS USES. These were independent numbers
      // and they disagreed; see SPILL for what that cost.
      inset: `-${SPILL * 100}%`,
      pointerEvents: 'none',
      zIndex: 0,
    }} />
  )
}
