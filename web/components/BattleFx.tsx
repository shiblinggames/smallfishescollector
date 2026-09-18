'use client'

// ── THE STATUS EFFECTS, AS PARTICLES ────────────────────────────────────────
//
// One 2D canvas over the battle stage, and every status aura in the fight is
// an EMITTER into it. Sixteen of them: seven things done to the enemy, six done
// to you, the two persistent conditions off the sea, and the vengeance ward.
//
// ── WHY THEY LOOKED LIKE UI, AND THE FIRE DID NOT ───────────────────────────
//
// The dial's fire (components/DialFx) is six hundred pooled sprites with
// buoyancy, drag and a five-stop heat ramp, blended ADDITIVELY so that where
// two embers overlap they sum toward white-hot. The status auras were DOM:
// a radial-gradient wash and six <span> motes tweened from A to B with a
// box-shadow for a glow. A box-shadow does not add; two motes overlapping just
// stack. A tween is not physics; a mote on a fixed path reads as an interface,
// not a material. One colour per effect cannot read as heat. And the DOM
// version had to AVOID blend modes on purpose, because a blended DOM layer
// re-composites every frame on the main thread and starved the aim minigame's
// needle. Every one of those constraints is lifted by drawing to one canvas.
//
// ── THE SEA ALREADY DID HALF OF THIS, AND THIS DOES NOT REPEAT IT ───────────
//
// Over the sea and in the gauntlet, the Pixi layer (sea/seaAbilityFx) paints
// the PERSISTENT conditions on the hull the chart is painting, and the ability
// casts on the water. Those are good and they stay. What this layer owns is
// the ONE-SHOT auras (a status landing, a buff arriving), which were DOM on
// every route, plus the persistent conditions on routes with no renderer, plus
// the vengeance ward, which was DOM everywhere.
//
// ── CANVAS 2D, FOR THE REASON DIALFX GIVES ──────────────────────────────────
//
// Not Pixi. A second WebGL context evicts the sea's and takes the chart down.
// A 2D canvas is not a GL context and cannot. See lib/fxCanvas.
//
// ── IT NEVER TOUCHES THE NEEDLE ─────────────────────────────────────────────
//
// The aim needle runs on the compositor so that main-thread work cannot make
// it skip. This is main-thread work, so it STOPS during the aim sub-phase --
// the loop halts and the last frame stays up, exactly what the DOM auras'
// `paused` prop did.
//
// ── HOW AN EMITTER KNOWS WHERE THE HULL IS ──────────────────────────────────
//
// It does not get told. Each aura component still mounts where it always did,
// inside the hull's box at inset:0, and hands this layer that element. The
// loop reads the element's rect every frame -- so recoil, sway and the sea
// re-placing the hull all come for free -- and keeps the last rect it saw once
// the element is gone, so a one-shot that outlives its React node finishes
// where it started. `--ink` is read off the same element: over the sea the
// hull's box is the width of the whole painting rather than the ship in it,
// and a fire sized to the box burns the water either side of her.

import { useEffect, useRef } from 'react'
import { bakeDot, bakeRing, makeBlob, HOT } from '@/lib/fxCanvas'

export type FxKind =
  | 'enemy:burn' | 'enemy:freeze' | 'enemy:snared' | 'enemy:foresee' | 'enemy:marked' | 'enemy:stunned' | 'enemy:stolen'
  | 'player:heal' | 'player:tide' | 'player:aim' | 'player:charge' | 'player:brace' | 'player:parry'
  | 'ship:condition' | 'ship:ward'

/** What a persistent emitter reads live, updated by its component each render. */
export type FxLive = { burning?: boolean; frozen?: boolean; urgent?: boolean }

type Rect = { x: number; y: number; w: number; h: number; ink: number }

type Emitter = {
  id: number
  el: HTMLElement
  kind: FxKind
  color: string | null
  live: FxLive
  /** Seconds for a one-shot; Infinity for a persistent one. */
  dur: number
  age: number
  rect: Rect | null
  /** Per-emitter deterministic noise, so facets and tongues stay put. */
  seed: number[]
  /** Spawn debt for continuous emitters. */
  debtA: number
  debtB: number
  /** Ink is re-read only occasionally; getComputedStyle is not free. */
  inkAt: number
}

// ── THE BUS ─────────────────────────────────────────────────────────────────
const emitters = new Map<number, Emitter>()
const wake = new Set<() => void>()
let nextId = 1

const DUR: Partial<Record<FxKind, number>> = {
  'enemy:burn': 0.95, 'enemy:freeze': 1.0, 'enemy:snared': 0.85, 'enemy:foresee': 0.85,
  'enemy:marked': 0.9, 'enemy:stunned': 0.85, 'enemy:stolen': 0.7,
  'player:heal': 0.95, 'player:tide': 0.85, 'player:aim': 0.8, 'player:charge': 0.7,
  'player:brace': 0.85, 'player:parry': 0.62,
}

function add(el: HTMLElement, kind: FxKind, color: string | null, live: FxLive): () => void {
  const id = nextId++
  const persistent = kind === 'ship:condition' || kind === 'ship:ward'
  emitters.set(id, {
    id, el, kind, color, live,
    dur: persistent ? Infinity : (DUR[kind] ?? 0.85),
    age: 0, rect: null,
    seed: Array.from({ length: 16 }, () => Math.random()),
    debtA: 0, debtB: 0, inkAt: -1,
  })
  for (const w of wake) w()
  // A one-shot is NOT removed when its component goes: it has its own clock
  // and finishes on it. A persistent one stops the moment its component does.
  return () => { if (persistent) emitters.delete(id) }
}

/**
 * Mount an aura. Returns the ref for an `inset: 0` div inside the hull box;
 * the layer reads that element's rect every frame. `live` is a mutable object
 * the component updates on every render for the persistent kinds.
 */
export function useBattleFx(kind: FxKind, color?: string | null, live?: FxLive) {
  const ref = useRef<HTMLDivElement | null>(null)
  const liveRef = useRef<FxLive>(live ?? {})
  if (live) Object.assign(liveRef.current, live)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return add(el, kind, color ?? null, liveRef.current)
    // Colour and kind are fixed for a mount: the callers key their auras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

// ── PARTICLES ───────────────────────────────────────────────────────────────
//
// Modes are what a particle DOES; everything else is a number on it.
const RISE = 0, FALL = 1, INWARD = 2, DRIFT = 3, STREAM = 4, ORBIT = 5, SMOKE = 6, SPARK = 7

type P = {
  x: number; y: number; vx: number; vy: number
  age: number; life: number; size: number
  mode: number
  img: HTMLCanvasElement
  /** RISE with a heat ramp reads HOT by age instead of `img`. */
  ramp: boolean
  /** INWARD/ORBIT: the point it is about. */
  cx: number; cy: number
  /** ORBIT: radius and angular speed. INWARD: start radius. */
  r: number; w: number
  /** Buoyancy for RISE; sideways squash for ORBIT. */
  k: number
  spin: number
}
const P_CAP = 1100
const S_CAP = 90
const blankP = (): P => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, mode: RISE, img: null as unknown as HTMLCanvasElement, ramp: false, cx: 0, cy: 0, r: 0, w: 0, k: 1, spin: 0 })

const COLOR: Record<string, [string, string]> = {
  'enemy:burn':    ['#fb923c', '#ffd27a'],
  'enemy:freeze':  ['#7dd3fc', '#e0f4ff'],
  'enemy:snared':  ['#d9b066', '#f0d79a'],
  'enemy:foresee': ['#8b7bf0', '#cfc4ff'],
  'enemy:marked':  ['#f43f5e', '#ffa8b8'],
  'enemy:stunned': ['#c9b6ff', '#efe6ff'],
  'enemy:stolen':  ['#f5c542', '#ffe9a8'],
  'player:heal':   ['#4ade80', '#bbf7d0'],
  'player:tide':   ['#5eead4', '#a7f3e8'],
  'player:aim':    ['#fbbf24', '#fde68a'],
  'player:charge': ['#f5c542', '#ffe9a8'],
  'player:brace':  ['#9eb0cd', '#d6deec'],
  'player:parry':  ['#e8eefc', '#ffffff'],
}
const WARD = '#d1495b'
const FIRE_POOL = '#ff8c28'
const RIME = '#bae6fd'
const SMOKE_C = '#5a5048'

export default function BattleFxCanvas({ overSea, paused }: { overSea: boolean; paused: boolean }) {
  const holder = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const cv = document.createElement('canvas')
    cv.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none'
    el.appendChild(cv)
    const ctx = cv.getContext('2d')
    if (!ctx) { el.removeChild(cv); return }

    // 1.5, not 2: a field of soft blobs with no edge to keep sharp, and fill
    // rate is the only thing it spends.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0, h = 0, fade = 24
    const resize = () => {
      const r = el.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height))
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fade = Math.max(20, Math.min(w, h) * 0.06)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    const blob = makeBlob(ctx, () => ({ w, h, fade }))

    // ── SPRITES, BAKED ONCE ──
    const dot = new Map<string, HTMLCanvasElement>()
    const ring = new Map<string, HTMLCanvasElement>()
    const D = (c: string) => { let s = dot.get(c); if (!s) { s = bakeDot(c); dot.set(c, s) } return s }
    const R = (c: string) => { let s = ring.get(c); if (!s) { s = bakeRing(c); ring.set(c, s) } return s }
    const hot = HOT.map(bakeDot)
    const smokeDot = bakeDot(SMOKE_C)

    // ── POOLS ──
    const ps = Array.from({ length: P_CAP }, blankP)
    const ss = Array.from({ length: S_CAP }, blankP)
    let pi = 0, si = 0
    const takeP = () => { const p = ps[pi]; pi = (pi + 1) % P_CAP; return p }
    const takeS = () => { const p = ss[si]; si = (si + 1) % S_CAP; return p }

    let clock = 0
    let last = 0
    let raf = 0
    let running = false

    // ── THE HULL, IN CANVAS SPACE ──
    const measure = (e: Emitter) => {
      if (e.el.isConnected) {
        const r = e.el.getBoundingClientRect()
        const c = cv.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          if (e.inkAt < 0 || clock - e.inkAt > 0.5) {
            e.inkAt = clock
            const v = parseFloat(getComputedStyle(e.el).getPropertyValue('--ink'))
            e.rect = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height, ink: Number.isFinite(v) && v > 0 ? v : (e.rect?.ink ?? 1) }
          } else {
            e.rect = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height, ink: e.rect?.ink ?? 1 }
          }
        }
      }
      return e.rect
    }

    // ── SPAWNERS ──
    /** An ember off the lower hull, rising. `i` scales size and throw. */
    const ember = (rc: Rect, i: number, ramp: boolean, col: string, life = 0.55) => {
      const p = takeP()
      const hw = rc.w * rc.ink / 2, cx = rc.x + rc.w / 2
      p.x = cx + (Math.random() * 2 - 1) * hw * 0.9
      p.y = rc.y + rc.h * (0.55 + Math.random() * 0.4)
      p.vx = (Math.random() - 0.5) * 22 * i
      p.vy = -(20 + Math.random() * 44 * i)
      p.age = 0; p.life = life + Math.random() * 0.45
      p.size = (3.5 + Math.random() * 4.5) * (0.7 + i * 0.4)
      p.mode = RISE; p.ramp = ramp; p.img = D(col); p.k = 0.5 + i * 0.5
      p.spin = (Math.random() - 0.5) * 2.2
    }
    const puff = (rc: Rect, i: number) => {
      const p = takeS()
      const hw = rc.w * rc.ink / 2
      p.x = rc.x + rc.w / 2 + (Math.random() * 2 - 1) * hw * 0.6
      p.y = rc.y + rc.h * 0.45
      p.vx = (Math.random() - 0.5) * 18; p.vy = -26 - Math.random() * 30 * i
      p.age = 0; p.life = 1.3 + Math.random() * 1.1
      p.size = (12 + Math.random() * 12) * (0.7 + i * 0.4)
      p.mode = SMOKE; p.img = smokeDot; p.ramp = false; p.spin = (Math.random() - 0.5) * 2
    }
    const frost = (rc: Rect) => {
      const p = takeP()
      const hw = rc.w * rc.ink / 2
      p.x = rc.x + rc.w / 2 + (Math.random() * 2 - 1) * hw * 0.85
      p.y = rc.y + rc.h * (0.2 + Math.random() * 0.45)
      p.vx = (Math.random() - 0.5) * 6; p.vy = 8 + Math.random() * 10
      p.age = 0; p.life = 1.6 + Math.random() * 0.9
      p.size = 2.2 + Math.random() * 2.2
      p.mode = FALL; p.img = D('#e9faff'); p.ramp = false; p.spin = Math.random() * 6
    }

    // ── DRAW HELPERS ──
    const ellipse = (img: HTMLCanvasElement, x: number, y: number, rw: number, rh: number, a: number) => blob(img, x, y, rw * 2, rh * 2, a)
    const circ = (img: HTMLCanvasElement, x: number, y: number, r: number, a: number) => blob(img, x, y, r * 2, r * 2, a)
    const strokeGlow = (col: string, width: number, a: number, path: () => void) => {
      ctx.globalAlpha = a
      ctx.strokeStyle = col; ctx.lineWidth = width + 4; ctx.lineCap = 'round'
      ctx.beginPath(); path(); ctx.stroke()
      ctx.globalAlpha = Math.min(1, a * 1.6)
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = width
      ctx.beginPath(); path(); ctx.stroke()
    }
    /** One-shot envelope: up fast, hold, out. */
    const env = (t: number, inAt = 0.2, outAt = 0.7) => t < inAt ? t / inAt : t < outAt ? 1 : Math.max(0, 1 - (t - outAt) / (1 - outAt))
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
    const easeIn = (t: number) => Math.pow(Math.max(0, Math.min(1, t)), 2.2)

    // ── ONE EMITTER, ONE FRAME ──
    const drive = (e: Emitter, dt: number) => {
      const rc = measure(e)
      if (!rc) return
      const born = e.age === 0
      e.age += dt
      const hw = rc.w * rc.ink / 2, hh = rc.h / 2
      const cx = rc.x + rc.w / 2, cy = rc.y + rc.h * 0.52
      const wy = rc.y + rc.h * 0.9
      const [col, mote] = COLOR[e.kind] ?? [e.color ?? '#ffffff', e.color ?? '#ffffff']
      const C = e.color ?? col, M = e.color ?? mote
      const t = e.dur === Infinity ? 0 : Math.min(1, e.age / e.dur)
      /** Spawn `n` over the first `over` seconds. */
      const spawn = (n: number, over: number, f: () => void) => {
        if (e.age > over + dt) return
        e.debtA += (n / over) * dt
        while (e.debtA >= 1) { e.debtA -= 1; f() }
      }

      switch (e.kind) {
        // ── THINGS DONE TO THE ENEMY ─────────────────────────────────
        case 'enemy:burn': {
          ellipse(D(C), cx, cy, hw * 1.3, hh * 1.1, 0.5 * env(t))
          spawn(48, 0.38, () => ember(rc, 1.1, true, M, 0.5))
          if (born) for (let i = 0; i < 5; i++) puff(rc, 0.9)
          break
        }
        case 'enemy:freeze': {
          ellipse(D(C), cx, cy, hw * 1.3, hh * 1.1, 0.42 * env(t))
          // Rime ring, creeping out a little and holding: ice spreads, it does not pulse.
          ellipse(R(RIME), cx, cy, hw * lerp(0.9, 1.12, easeOut(t * 1.6)), hh * lerp(0.9, 1.12, easeOut(t * 1.6)), 0.5 * env(t, 0.15, 0.6))
          spawn(26, 0.45, () => frost(rc))
          // Facets grow in and hold. Painted, not lit: ice is not a light.
          ctx.globalCompositeOperation = 'source-over'
          for (let i = 0; i < 6; i++) {
            const sd = e.seed[i], s2 = e.seed[i + 6]
            const g = easeOut((t - i * 0.05) / 0.32)
            if (g <= 0) continue
            const fx = cx + (sd * 2 - 1) * hw * 0.8, fy = rc.y + rc.h * (0.25 + s2 * 0.5)
            const L = (8 + s2 * 12) * g * Math.min(1, hh / 40), W = L * 0.42
            const ang = (sd - 0.5) * 1.2
            const a = 0.85 * env(t, 0.2, 0.62)
            ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang)
            ctx.globalAlpha = a
            ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(W, -L * 0.34); ctx.lineTo(W * 0.56, L * 0.0); ctx.lineTo(-W * 0.56, 0); ctx.lineTo(-W, -L * 0.34); ctx.closePath()
            ctx.fillStyle = 'rgba(230,248,255,0.9)'; ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke()
            ctx.restore()
          }
          ctx.globalCompositeOperation = 'lighter'
          break
        }
        case 'enemy:snared': {
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.05, 0.45 * env(t))
          // Two rings closing on the hull, staggered: a net tightening.
          for (let n = 0; n < 2; n++) {
            const k = easeIn((t - n * 0.14) / 0.7)
            if (k <= 0 || k >= 1) continue
            ellipse(R(C), cx, cy, hw * lerp(1.9, 0.75, k), hh * lerp(1.9, 0.75, k), 0.8 * (1 - k))
          }
          spawn(40, 0.3, () => {
            const p = takeP(); const a = Math.random() * Math.PI * 2
            p.cx = cx; p.cy = cy; p.r = Math.max(hw, hh) * (1.35 + Math.random() * 0.4); p.w = a
            p.x = cx + Math.cos(a) * p.r; p.y = cy + Math.sin(a) * p.r * 0.8
            p.age = 0; p.life = 0.5 + Math.random() * 0.3; p.size = 3 + Math.random() * 3
            p.mode = INWARD; p.img = D(M); p.ramp = false; p.vx = 0; p.vy = 0
          })
          break
        }
        case 'enemy:foresee': {
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.05, 0.4 * env(t))
          for (let n = 0; n < 2; n++) {
            const k = easeOut((t - n * 0.16) / 0.8)
            if (k <= 0) continue
            ellipse(R(C), cx, cy, hw * lerp(0.3, 2.2, k), hh * lerp(0.3, 2.2, k), 0.85 * (1 - k))
          }
          spawn(22, 0.3, () => {
            const p = takeP()
            p.cx = cx; p.cy = cy; p.r = hw * (0.6 + Math.random() * 0.7); p.w = Math.random() * Math.PI * 2
            p.k = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.4)
            p.age = 0; p.life = 0.6 + Math.random() * 0.3; p.size = 2.6 + Math.random() * 2.4
            p.mode = ORBIT; p.img = D(M); p.ramp = false
          })
          break
        }
        case 'enemy:marked': {
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.05, 0.42 * env(t))
          for (let n = 0; n < 2; n++) {
            const k = easeIn((t - n * 0.14) / 0.7)
            if (k <= 0 || k >= 1) continue
            ellipse(R(C), cx, cy, hw * lerp(2.2, 0.6, k), hh * lerp(2.2, 0.6, k), 0.9 * (1 - k * 0.6))
          }
          // The crosshair snaps in once the rings have closed, and holds.
          const s = easeOut((t - 0.36) / 0.3)
          if (s > 0) {
            const rr = Math.min(hw, hh) * 0.55 * lerp(1.6, 1, s), a = 0.95 * s * env(t, 0.4, 0.75)
            circ(R(C), cx, cy, rr, a)
            strokeGlow(C, 1.6, a * 0.9, () => {
              ctx.moveTo(cx - rr * 1.5, cy); ctx.lineTo(cx - rr * 0.65, cy); ctx.moveTo(cx + rr * 0.65, cy); ctx.lineTo(cx + rr * 1.5, cy)
              ctx.moveTo(cx, cy - rr * 1.5); ctx.lineTo(cx, cy - rr * 0.65); ctx.moveTo(cx, cy + rr * 0.65); ctx.lineTo(cx, cy + rr * 1.5)
            })
          }
          spawn(12, 0.4, () => {
            const p = takeP(); const a = Math.random() * Math.PI * 2
            p.x = cx; p.y = cy; p.vx = Math.cos(a) * 40; p.vy = Math.sin(a) * 30
            p.age = 0; p.life = 0.5; p.size = 2.5 + Math.random() * 2; p.mode = DRIFT; p.img = D(M); p.ramp = false
          })
          break
        }
        case 'enemy:stunned': {
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.05, 0.45 * env(t))
          // One hard shockwave. Nothing icy: a stun must never read as a freeze.
          const k = easeOut(t / 0.45)
          if (k < 1) ellipse(R(C), cx, cy, hw * lerp(0.25, 2.1, k), hh * lerp(0.25, 2.1, k), 0.95 * (1 - k))
          // Dazed sparks wheeling over the hull.
          for (let n = 0; n < 3; n++) {
            const a = n * (Math.PI * 2 / 3) + t * 5.2
            const rr = hw * 0.55
            const sx = cx + Math.cos(a) * rr, sy = rc.y + rc.h * 0.28 + Math.sin(a) * rr * 0.32
            circ(D(M), sx, sy, 5, 0.95 * env(t))
            circ(D(C), sx, sy, 13, 0.5 * env(t))
          }
          break
        }
        case 'enemy:stolen': {
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.05, 0.42 * env(t))
          // The snatch arc whips off toward your rack, and the shot streams after it.
          const k = easeOut(t / 0.6)
          if (k < 1) {
            const ax = cx - hw * 0.3 - k * hw * 1.4, ay = cy
            strokeGlow(C, 2, 0.9 * (1 - k) * env(t, 0.1, 0.5), () => { ctx.arc(ax, ay, Math.max(4, hh * 0.35), Math.PI * 0.6, Math.PI * 1.4) })
          }
          spawn(30, 0.32, () => {
            const p = takeP()
            p.x = cx - hw * (Math.random() * 0.6); p.y = cy + (Math.random() - 0.5) * hh * 0.7
            p.vx = -(90 + Math.random() * 120); p.vy = (Math.random() - 0.5) * 30
            p.age = 0; p.life = 0.45 + Math.random() * 0.25; p.size = 3 + Math.random() * 3
            p.mode = STREAM; p.img = D(M); p.ramp = false
          })
          break
        }

        // ── THINGS DONE TO YOU ───────────────────────────────────────
        case 'player:heal': {
          ellipse(D(C), cx, cy, hw * 1.2, hh * 1.1, 0.5 * env(t))
          spawn(34, 0.5, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.75; p.y = rc.y + rc.h * (0.45 + Math.random() * 0.4)
            p.vx = (Math.random() - 0.5) * 10; p.vy = -(18 + Math.random() * 26)
            p.age = 0; p.life = 0.7 + Math.random() * 0.5; p.size = 2.8 + Math.random() * 3
            p.mode = RISE; p.ramp = false; p.img = D(M); p.k = 0.35; p.spin = Math.random() * 6
          })
          break
        }
        case 'player:tide': {
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.1, 0.5 * env(t))
          // A bulwark ring snapping OUT: the shield forming.
          const k = easeOut(t / 0.7)
          if (k < 1) ellipse(R(C), cx, cy, hw * lerp(0.4, 1.45, k), hh * lerp(0.4, 1.45, k), 0.95 * (1 - k))
          spawn(26, 0.45, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.8; p.y = rc.y + rc.h * (0.5 + Math.random() * 0.4)
            p.vx = (Math.random() - 0.5) * 12; p.vy = -(16 + Math.random() * 24)
            p.age = 0; p.life = 0.65 + Math.random() * 0.4; p.size = 2.6 + Math.random() * 2.6
            p.mode = RISE; p.ramp = false; p.img = D(M); p.k = 0.3; p.spin = Math.random() * 6
          })
          break
        }
        case 'player:aim': {
          ellipse(D(C), cx, cy, hw * 1.2, hh * 1.05, 0.28 * env(t))
          // A reticle that snaps down onto the guns.
          const s = easeOut(t / 0.35)
          const rr = Math.min(hw, hh) * 0.6 * lerp(1.5, 1, s), a = 0.95 * env(t, 0.25, 0.7)
          const rot = lerp(-0.32, 0, s)
          circ(R(C), cx, cy, rr, a)
          strokeGlow(C, 1.8, a * 0.9, () => {
            for (let n = 0; n < 4; n++) {
              const an = rot + n * Math.PI / 2
              ctx.moveTo(cx + Math.cos(an) * rr * 0.72, cy + Math.sin(an) * rr * 0.72)
              ctx.lineTo(cx + Math.cos(an) * rr * 1.18, cy + Math.sin(an) * rr * 1.18)
            }
          })
          spawn(6, 0.3, () => {
            const p = takeP(); const an = Math.random() * Math.PI * 2
            p.x = cx; p.y = cy; p.vx = Math.cos(an) * 30; p.vy = Math.sin(an) * 22
            p.age = 0; p.life = 0.55; p.size = 2.4; p.mode = DRIFT; p.img = D(M); p.ramp = false
          })
          break
        }
        case 'player:charge': {
          // A gold FLASH, then powder sparks fast off the deck.
          ellipse(D(C), cx, cy, hw * 1.4, hh * 1.2, 0.7 * env(t, 0.12, 0.35))
          spawn(46, 0.28, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.8; p.y = rc.y + rc.h * (0.5 + Math.random() * 0.35)
            p.vx = (Math.random() - 0.5) * 40; p.vy = -(70 + Math.random() * 90)
            p.age = 0; p.life = 0.32 + Math.random() * 0.25; p.size = 2.6 + Math.random() * 3
            p.mode = RISE; p.ramp = false; p.img = D(M); p.k = 0.9; p.spin = Math.random() * 6
          })
          break
        }
        case 'player:brace': {
          ellipse(D(C), cx, cy, hw * 1.2, hh * 1.05, 0.4 * env(t))
          // Corner brackets clamping INWARD: an iron clamp, not a bubble.
          const s = easeOut(t / 0.4), a = 0.95 * env(t, 0.2, 0.7)
          const bw = hw * lerp(1.35, 1.0, s), bh = hh * lerp(1.35, 1.0, s), L = Math.max(8, Math.min(hw, hh) * 0.3)
          strokeGlow(C, 2.4, a, () => {
            for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
              const px = cx + sx * bw, py = cy + sy * bh
              ctx.moveTo(px - sx * L, py); ctx.lineTo(px, py); ctx.lineTo(px, py - sy * L)
            }
          })
          spawn(12, 0.4, () => {
            const p = takeP(); const an = Math.random() * Math.PI * 2
            p.x = cx; p.y = cy; p.vx = Math.cos(an) * 34; p.vy = Math.sin(an) * 24
            p.age = 0; p.life = 0.55; p.size = 2.6; p.mode = DRIFT; p.img = D(M); p.ramp = false
          })
          break
        }
        case 'player:parry': {
          ellipse(D(C), cx, cy, hw * 1.15, hh * 1.0, 0.3 * env(t, 0.15, 0.45))
          // A steel slash across the hull, growing in, with a spark flare at
          // the point of contact. A deflection is a struck ANGLE.
          const k = easeOut(t / 0.42)
          const ang = -0.49, len = hw * 1.3 * k
          const sx = cx - Math.cos(ang) * len, sy = cy - Math.sin(ang) * len
          const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len
          strokeGlow(M, 2.2, 0.95 * env(t, 0.1, 0.5), () => { ctx.moveTo(sx, sy); ctx.lineTo(ex, ey) })
          const fk = easeOut(t / 0.5)
          circ(D(M), cx + hw * 0.16, cy - hh * 0.16, Math.max(6, hw * 0.28) * lerp(0.3, 1.9, fk), 0.9 * (1 - fk))
          if (born) for (let i = 0; i < 12; i++) {
            const p = takeP(); const an = ang + Math.PI / 2 + (Math.random() - 0.5) * 1.4
            p.x = cx + hw * 0.16; p.y = cy - hh * 0.16
            p.vx = Math.cos(an) * (80 + Math.random() * 120); p.vy = Math.sin(an) * (80 + Math.random() * 120)
            p.age = 0; p.life = 0.3 + Math.random() * 0.2; p.size = 2 + Math.random() * 2
            p.mode = SPARK; p.img = D(M); p.ramp = false
          }
          break
        }

        // ── THE PERSISTENT ONES ──────────────────────────────────────
        case 'ship:condition': {
          const { burning, frozen } = e.live
          if (burning) {
            // Heat pool at the waterline, breathing.
            ellipse(D(FIRE_POOL), cx, wy - hh * 0.1, hw * 1.15, hh * 0.5, 0.36 + 0.1 * Math.sin(clock * 3.3))
            // Three tongues on their own rhythms: prime-ish periods, so the
            // licks never re-sync. That irregularity is what separates fire
            // from a pulsing light.
            const T = [[-0.45, 0.83, 0.62], [0.05, 1.07, 0.84], [0.4, 0.71, 0.56]] as const
            for (const [ox, per, ht] of T) {
              const f = 0.8 + 0.2 * Math.sin(clock * (Math.PI * 2 / per) + ox * 9)
              const th = hh * ht * f, tw = hw * 0.3
              blob(D('#ffb864'), cx + ox * hw, wy - th * 0.55, tw * 2, th * 2, 0.55)
              blob(D('#fff0c8'), cx + ox * hw, wy - th * 0.35, tw * 1.1, th * 1.1, 0.45)
            }
            e.debtA += 24 * dt
            while (e.debtA >= 1) { e.debtA -= 1; ember(rc, 1.0, true, '#ffd27a', 0.55) }
            e.debtB += 2.5 * dt
            while (e.debtB >= 1) { e.debtB -= 1; puff(rc, 0.8) }
          }
          if (frozen) {
            // Rime at the waterline, breathing so slowly it reads as spreading.
            ellipse(D(RIME), cx, wy - hh * 0.1, hw * 1.2 * (1 + 0.04 * Math.sin(clock * 1.37)), hh * 0.5, 0.42)
            // Facets that GROW in once and hold. Nothing on ice slides.
            ctx.globalCompositeOperation = 'source-over'
            for (let i = 0; i < 8; i++) {
              const sd = e.seed[i], s2 = e.seed[i + 8]
              const g = easeOut((e.age - i * 0.06) / 0.62)
              if (g <= 0) continue
              const fx = cx + (sd * 2 - 1) * hw * 0.85, fy = rc.y + rc.h * (0.18 + s2 * 0.5)
              const L = (10 + s2 * 16) * Math.min(1, hh / 44) * g, W = L * 0.42
              ctx.save(); ctx.translate(fx, fy); ctx.rotate((sd - 0.5) * 1.3)
              ctx.globalAlpha = 0.92
              ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(W, -L * 0.34); ctx.lineTo(W * 0.56, 0); ctx.lineTo(-W * 0.56, 0); ctx.lineTo(-W, -L * 0.34); ctx.closePath()
              ctx.fillStyle = 'rgba(236,250,255,0.92)'; ctx.fill()
              ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.stroke()
              ctx.restore()
            }
            ctx.globalCompositeOperation = 'lighter'
            e.debtB += 5 * dt
            while (e.debtB >= 1) { e.debtB -= 1; frost(rc) }
          }
          break
        }
        case 'ship:ward': {
          // A slow crimson pulse while the ward holds; quick on the last turn,
          // because a fuse you cannot hear run out is not a decision.
          const per = e.live.urgent ? 0.62 : 2.1
          const b = 0.5 + 0.5 * Math.sin(clock * (Math.PI * 2 / per))
          const a = e.live.urgent ? lerp(0.22, 0.5, b) : lerp(0.12, 0.3, b)
          ellipse(D(WARD), cx, cy + hh * 0.1, hw * 1.35, hh * 1.15, a)
          ellipse(R(WARD), cx, cy + hh * 0.1, hw * (1.1 + 0.04 * b), hh * (1.02 + 0.04 * b), a * 0.9)
          break
        }
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
      last = now
      clock += dt
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // ── SMOKE FIRST, the one thing here that does not add ──
      ctx.globalCompositeOperation = 'source-over'
      for (const p of ss) {
        if (p.age >= 1) continue
        p.age += dt / p.life
        if (p.age >= 1) continue
        p.vx *= 1 - 0.6 * dt; p.vy *= 1 - 0.35 * dt
        p.x += (p.vx + Math.sin(clock * 1.3 + p.spin * 5) * 18 * p.age) * dt
        p.y += p.vy * dt
        // Smoke only ever EXPANDS: the difference between a cloud and a spark.
        const d = p.size * (0.5 + p.age * 1.9) * 2
        blob(p.img, p.x, p.y, d, d, Math.sin(p.age * Math.PI) * 0.16)
      }

      ctx.globalCompositeOperation = 'lighter'
      // Emitters: washes, rings, marks, spawning.
      for (const e of Array.from(emitters.values())) {
        drive(e, dt)
        if (e.dur !== Infinity && e.age >= e.dur) emitters.delete(e.id)
      }

      // ── AND THE PARTICLES, in front ──
      ctx.globalCompositeOperation = 'lighter'
      for (const p of ps) {
        if (p.age >= 1) continue
        p.age += dt / p.life
        if (p.age >= 1) continue
        let a = 1, sz = p.size
        switch (p.mode) {
          case RISE:
            // Buoyancy, not gravity: an ember accelerates upward as it heats
            // the air around it and slows sideways as it loses its throw.
            p.vy -= 40 * dt * p.k; p.vx *= 1 - 1.9 * dt; p.vy *= 1 - 0.8 * dt
            p.x += (p.vx + Math.sin(clock * 3.1 + p.spin * 6) * 10 * p.age) * dt
            p.y += p.vy * dt
            sz = p.size * (0.55 + Math.sin(p.age * Math.PI) * 0.75)
            a = p.age < 0.3 ? 1 : Math.pow(1 - (p.age - 0.3) / 0.7, 1.7)
            break
          case FALL:
            p.vy += 6 * dt
            p.x += (p.vx + Math.sin(clock * 2 + p.spin) * 4) * dt; p.y += p.vy * dt
            a = Math.sin(p.age * Math.PI); sz = p.size * (1 - p.age * 0.4)
            break
          case INWARD: {
            const k = easeOut(p.age)
            const r = p.r * (1 - k * 0.92)
            p.x = p.cx + Math.cos(p.w) * r; p.y = p.cy + Math.sin(p.w) * r * 0.8
            a = Math.sin(p.age * Math.PI)
            break
          }
          case DRIFT:
            p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt
            p.x += p.vx * dt; p.y += p.vy * dt
            a = Math.sin(p.age * Math.PI)
            break
          case STREAM:
            p.vx *= 1 - 0.5 * dt
            p.x += p.vx * dt; p.y += (p.vy - 12 * p.age) * dt
            a = Math.sin(p.age * Math.PI); sz = p.size * (1 + p.age * 0.5)
            break
          case ORBIT:
            p.w += p.k * dt
            p.x = p.cx + Math.cos(p.w) * p.r; p.y = p.cy + Math.sin(p.w) * p.r * 0.45
            a = Math.sin(p.age * Math.PI)
            break
          case SPARK:
            p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt
            p.x += p.vx * dt; p.y += p.vy * dt
            a = 1 - p.age; sz = p.size * (1.3 - p.age)
            break
        }
        const img = p.ramp ? hot[Math.min(hot.length - 1, Math.floor(p.age * hot.length))] : p.img
        blob(img, p.x, p.y, sz * 2, sz * 2, a)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // Nothing left alive and nothing persistent: go quiet. Costs nothing
      // until the next aura asks.
      if (emitters.size === 0 && !ps.some(p => p.age < 1) && !ss.some(p => p.age < 1)) stop()
    }

    const start = () => {
      if (running || pausedRef.current) return
      running = true; last = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => { if (!running) return; running = false; cancelAnimationFrame(raf) }
    wake.add(start)
    if (emitters.size > 0) start()

    // The aim sub-phase: halt, and hold the last frame.
    const watch = window.setInterval(() => {
      if (pausedRef.current) stop()
      else if (emitters.size > 0 && !running) start()
    }, 120)

    return () => {
      window.clearInterval(watch)
      wake.delete(start)
      stop()
      ro.disconnect()
      if (cv.parentNode) cv.parentNode.removeChild(cv)
    }
  }, [])

  return (
    <div ref={holder} aria-hidden style={{
      position: 'absolute',
      // OVER THE SEA THE HULLS LEAVE THE BOX: they stand wherever the chart
      // put them, routinely outside the stage's rectangle. The bitmap is grown
      // to reach them; the stage's overflow is visible on that route so it
      // shows, and hidden on the others so it clips to the stage like every
      // other layer there.
      inset: overSea ? '-40%' : 0,
      // Above both hulls (2 and 3), under the impact flash (9) and the aim
      // badges (11). Additive light over the sprite is the point: the hull is
      // lit by its own fire rather than framed by it.
      zIndex: 5,
      pointerEvents: 'none',
    }} />
  )
}
