'use client'

// ── EVERYTHING THE AIM BAR DOES THAT A DIV CANNOT ───────────────────────────
//
// The bar was flat: a dark box, three coloured rectangles and a white sliver
// crossing them. Nothing about it said that the moment it governs — the single
// most repeated input in a raid — is the moment worth caring about. The fishing
// dial got its answer already (see components/DialFx); this is the same answer
// for the other instrument.
//
// Three things live in here:
//
//   (A TRAIL was here and is gone. A wake behind the needle sounded right and
//   read wrong: it draws the eye to where the needle HAS BEEN, and this
//   instrument is entirely about where it is about to be. It also smeared the
//   one hard edge a player is timing against.)
//
//   THE TARGET BREATHES. The zone was a static block; it now carries a soft
//   bloom in its own colour with a hotter core at the crit seam, so the thing
//   you are aiming AT is the brightest thing on the instrument.
//
//   THE APPROACH. As the needle closes on the seam the glow answers it. That is
//   the whole game of this bar — near is worth more than far — and it was
//   communicated entirely by two thin rectangles being adjacent.
//
//   THE LOCK. A burst at the judged spot, in the result's colour, so a crit
//   looks like a crit before the number has finished arriving.
//
// ── CANVAS 2D, FOR THE REASONS DIALFX GIVES ─────────────────────────────────
//
// Not Pixi. `components/DialFx` records that a second WebGL context evicts the
// sea's and takes the chart down, and this instrument is on screen in exactly
// the place that would happen — a fight over the chart. It is also a 600px
// strip of soft additive blobs, which `globalCompositeOperation = 'lighter'`
// does perfectly well on a 2D canvas.
//
// ── AND IT CANNOT TOUCH THE NEEDLE ──────────────────────────────────────────
//
// The needle itself is NOT drawn here. It runs on the compositor (see
// RaidCombat's WAAPI sweep), and the entire point of that is that main-thread
// work cannot make it skip. This canvas is main-thread work. It reads where the
// needle is and draws around it; if it drops a frame, the glow dims for a
// sixtieth of a second and the needle does not care. Drawing the needle here
// would hand back the exact problem the compositor sweep exists to solve.

import { useEffect, useRef } from 'react'

/** How far the canvas reaches past the bar on every side, in CSS px. The lock
 *  burst is the widest thing drawn and it has to have room to fall off rather
 *  than to be cut off square, which is the failure DialFx documents. */
const SPILL = 22

/** Burst sparks. One lock's worth, three times over, so a fast exchange never
 *  cuts the previous burst short. */
const BURST_CAP = 54

type Spark = {
  x: number; y: number
  vx: number; vy: number
  age: number; life: number
  size: number
  /** Index into the baked sprite set. */
  tint: number
}

export type AimBarFxHandle = {
  /** A shot was locked at `pos` (0..1) and judged. */
  burst(pos: number, kind: 'critical' | 'hit' | 'graze' | 'miss'): void
}

/** The palette, baked once. Per-particle tinting is not a thing on 2D and
 *  `ctx.filter` is slow, so each colour is its own small sprite. */
const TINTS = [
  '255,255,255',   // 0 the needle's own light
  '251,191,36',    // 1 crit gold
  '74,222,128',    // 2 hit green
  '148,163,184',   // 3 graze steel
  '239,68,68',     // 4 miss red
]

let sprites: HTMLCanvasElement[] | null = null
function bakeSprites(): HTMLCanvasElement[] {
  if (sprites) return sprites
  const S = 32
  sprites = TINTS.map(rgb => {
    const c = document.createElement('canvas')
    c.width = c.height = S
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grad.addColorStop(0.0, `rgba(${rgb},1)`)
    grad.addColorStop(0.4, `rgba(${rgb},0.55)`)
    grad.addColorStop(1.0, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
    return c
  })
  return sprites
}

export default function AimBarFx({ active, read, handleRef }: {
  /** Only while a shot is being aimed. Off, the canvas is not mounted at all. */
  active: boolean
  /**
   * WHERE EVERYTHING IS, read on the FX's own frame rather than pushed in as
   * props. All four numbers change every frame, and a prop that changes every
   * frame re-renders a twelve-thousand-line component to move a spark.
   */
  read: () => { pos: number; zone: number; critW: number; band: number }
  handleRef?: React.MutableRefObject<AimBarFxHandle | null>
}) {
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    if (!active) return
    const cv = cvRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const imgs = bakeSprites()

    let w = 0, h = 0, dpr = 1
    const size = () => {
      const r = cv.getBoundingClientRect()
      if (!r.width || !r.height) return
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = r.width; h = r.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(cv)

    // Pools, allocated once. Same discipline as the sea's effects: a fight is
    // the worst moment in the game to be handing the collector short-lived
    // objects, and this canvas runs beside an instrument being read by eye.
    const burst: Spark[] = []
    for (let i = 0; i < BURST_CAP; i++) burst.push({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, tint: 0 })
    let nb = 0

    if (handleRef) {
      handleRef.current = {
        burst(pos, kind) {
          const tint = kind === 'critical' ? 1 : kind === 'hit' ? 2 : kind === 'graze' ? 3 : 4
          const n = kind === 'critical' ? 22 : kind === 'hit' ? 15 : 9
          const x = SPILL + pos * Math.max(0, w - SPILL * 2)
          const y = h / 2
          for (let i = 0; i < n; i++) {
            const s = burst[nb]; nb = (nb + 1) % BURST_CAP
            const a = Math.random() * Math.PI * 2
            // FLATTENED, because the bar is. A round burst on a 44px strip
            // spends most of itself above and below the instrument it belongs
            // to; this throws along the axis the shot was travelling.
            const sp = 60 + Math.random() * (kind === 'critical' ? 260 : 150)
            s.x = x; s.y = y
            s.vx = Math.cos(a) * sp
            s.vy = Math.sin(a) * sp * 0.42
            s.age = 0
            s.life = 0.34 + Math.random() * 0.4
            s.size = (kind === 'critical' ? 13 : 9) + Math.random() * 8
            s.tint = tint
          }
        },
      }
    }

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!w || !h) { size(); return }

      const { pos, zone, critW, band } = readRef.current()
      const inner = Math.max(0, w - SPILL * 2)
      const px = SPILL + pos * inner
      const zx = SPILL + zone * inner
      const y = h / 2

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      // ── THE TARGET, BREATHING ────────────────────────────────────────────
      //
      // Its own soft bloom, widest at the band's width, with a hot core on the
      // crit seam. This is the thing being aimed at and it should be the
      // brightest thing on the instrument — it was a flat rectangle behind a
      // brighter needle, which is backwards.
      const breathe = 0.82 + 0.18 * Math.sin(now / 520)
      const bandPx = Math.max(18, band * inner)
      ctx.globalAlpha = 0.20 * breathe
      ctx.drawImage(imgs[2], zx - bandPx, y - 26, bandPx * 2, 52)
      const critPx = Math.max(9, critW * inner)
      ctx.globalAlpha = 0.42 * breathe
      ctx.drawImage(imgs[1], zx - critPx * 2.2, y - 22, critPx * 4.4, 44)

      // ── THE APPROACH ─────────────────────────────────────────────────────
      //
      // The seam answers a needle closing on it. The whole game of this bar is
      // that near is worth more than far, and until now that was communicated
      // by two thin rectangles happening to be adjacent.
      const near = Math.max(0, 1 - Math.abs(pos - zone) / Math.max(0.001, band * 2.4))
      if (near > 0.01) {
        ctx.globalAlpha = 0.5 * near * near
        const r = critPx * (3 + near * 4)
        ctx.drawImage(imgs[1], zx - r, y - r * 0.5, r * 2, r)
      }

      for (const s of burst) {
        if (s.age >= s.life) continue
        s.age += dt
        const t = s.age / s.life
        s.x += s.vx * dt
        s.y += s.vy * dt
        // Air resistance, so a burst blooms and settles rather than flying off
        // in straight lines.
        s.vx -= s.vx * Math.min(1, 3.4 * dt)
        s.vy -= s.vy * Math.min(1, 3.4 * dt)
        ctx.globalAlpha = 1 - t
        const d = s.size * (1 + t * 0.5)
        ctx.drawImage(imgs[s.tint], s.x - d / 2, s.y - d / 2, d, d)
      }

      // A GLOW UNDER THE NEEDLE, which is the only part of the needle drawn
      // here — and it is not the needle, it is the light it throws. The mark
      // itself stays on the compositor where nothing here can stutter it.
      ctx.globalAlpha = 0.5
      ctx.drawImage(imgs[near > 0.55 ? 1 : 0], px - 15, y - 15, 30, 30)

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (handleRef) handleRef.current = null
    }
  }, [active, handleRef])

  if (!active) return null
  return (
    <canvas
      ref={cvRef}
      aria-hidden
      style={{
        position: 'absolute',
        // Reaches past the bar so a burst falls off rather than being cut off
        // square at the edge of its own bitmap.
        left: -SPILL, right: -SPILL, top: -SPILL, bottom: -SPILL,
        width: `calc(100% + ${SPILL * 2}px)`, height: `calc(100% + ${SPILL * 2}px)`,
        pointerEvents: 'none', zIndex: 5,
      }}
    />
  )
}
