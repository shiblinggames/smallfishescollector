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
  // ── THE LEGENDARY SIGNATURES ──
  // A legendary boon's moment, drawn as its own thing rather than as the
  // common cue for the same effect. No title card and no spark burst on
  // purpose: the action log already says what happened. These are the
  // PICTURE of it.
  | 'enemy:coil' | 'enemy:kraken' | 'enemy:wrath' | 'player:feed' | 'player:favor'
  // ── THE CHASE SKINS' SET PIECES ──
  // What a legendary's ability does to a hull when its chase skin is on:
  // a lightning storm, an apex kill, a death-mark, an abyssal scry, a
  // cosmic surge, an ancient ward. Each was its own tree of tweened divs
  // (components/ChaseStrikeFx, gone); each is a case here now.
  | 'enemy:tempest' | 'enemy:leviathan' | 'enemy:requiem' | 'enemy:oracle' | 'player:galaxy' | 'player:fossil'
  // ── OFF THE STAGE ──
  // The summon splash's light show (its own canvas, bus 'summon') and the
  // raid-item drum's activation rings on its pill.
  | 'summon:arrive' | 'pill:cast'
  | 'ship:condition' | 'ship:ward'

/** What a persistent emitter reads live, updated by its component each render. */
export type FxLive = {
  burning?: boolean; frozen?: boolean; urgent?: boolean
  /** enemy:tempest: one bolt per shot, on the barrage's cadence (ms). */
  shots?: number; interval?: number
  /** A one-shot's length in seconds, when the caller's timing sets it. */
  dur?: number
  /** summon:arrive: a chase skin lands heavier, and with its signature. */
  chase?: boolean; skinId?: string | null
}

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
// One per surface. The stage's canvas drives the 'stage' bus; the summon
// splash mounts its own canvas on 'summon', so a full-viewport light show
// never draws into the stage and the stage never draws into it.
type Bus = { emitters: Map<number, Emitter>; wake: Set<() => void> }
const buses = new Map<string, Bus>()
const busFor = (name: string) => { let b = buses.get(name); if (!b) { b = { emitters: new Map(), wake: new Set() }; buses.set(name, b) } return b }
let nextId = 1

const DUR: Partial<Record<FxKind, number>> = {
  'enemy:burn': 0.95, 'enemy:freeze': 1.0, 'enemy:snared': 0.85, 'enemy:foresee': 0.85,
  'enemy:marked': 0.9, 'enemy:stunned': 0.85, 'enemy:stolen': 0.7,
  'enemy:coil': 0.6, 'enemy:kraken': 1.15, 'enemy:wrath': 0.85, 'player:feed': 1.05, 'player:favor': 1.1,
  'player:heal': 0.95, 'player:tide': 0.85, 'player:aim': 0.8, 'player:charge': 0.7,
  'player:brace': 0.85, 'player:parry': 0.62,
  'enemy:leviathan': 1.4, 'enemy:requiem': 1.4, 'enemy:oracle': 1.5, 'player:galaxy': 1.75, 'player:fossil': 2.1,
  'summon:arrive': 2.6, 'pill:cast': 0.9,
}

function add(el: HTMLElement, kind: FxKind, color: string | null, live: FxLive, busName: string): () => void {
  const id = nextId++
  const persistent = kind === 'ship:condition' || kind === 'ship:ward'
  const b = busFor(busName)
  b.emitters.set(id, {
    id, el, kind, color, live,
    dur: persistent ? Infinity : (live.dur ?? DUR[kind] ?? 0.85),
    age: 0, rect: null,
    seed: Array.from({ length: 16 }, () => Math.random()),
    debtA: 0, debtB: 0, inkAt: -1,
  })
  for (const w of b.wake) w()
  // A one-shot is NOT removed when its component goes: it has its own clock
  // and finishes on it. A persistent one stops the moment its component does.
  return () => { if (persistent) b.emitters.delete(id) }
}

/**
 * Mount an aura. Returns the ref for an `inset: 0` div inside the hull box;
 * the layer reads that element's rect every frame. `live` is a mutable object
 * the component updates on every render for the persistent kinds.
 */
export function useBattleFx(kind: FxKind, color?: string | null, live?: FxLive, bus = 'stage') {
  const ref = useRef<HTMLDivElement | null>(null)
  const liveRef = useRef<FxLive>(live ?? {})
  if (live) Object.assign(liveRef.current, live)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return add(el, kind, color ?? null, liveRef.current, bus)
    // Colour, kind and bus are fixed for a mount: the callers key their auras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

// ── PARTICLES ───────────────────────────────────────────────────────────────
//
// Modes are what a particle DOES; everything else is a number on it.
const RISE = 0, FALL = 1, INWARD = 2, DRIFT = 3, STREAM = 4, ORBIT = 5, SMOKE = 6, SPARK = 7, RAIN = 8

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
  /** Stretch, so a streak can be drawn with the same round sprite. Reset on take. */
  ex: number; ey: number
}
const P_CAP = 1100
const S_CAP = 90
const blankP = (): P => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, mode: RISE, img: null as unknown as HTMLCanvasElement, ramp: false, cx: 0, cy: 0, r: 0, w: 0, k: 1, spin: 0, ex: 1, ey: 1 })

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
  'enemy:coil':    ['#7c3aed', '#c4b5fd'],
  'enemy:kraken':  ['#7c3aed', '#d8ccff'],
  'enemy:wrath':   ['#f5c542', '#fff1b8'],
  'player:feed':   ['#dc2626', '#4ade80'],
  'player:favor':  ['#f5c542', '#fff1b8'],
  'enemy:tempest':   ['#38bdf8', '#dff4ff'],
  'enemy:leviathan': ['#dc2626', '#ffb4b4'],
  'enemy:requiem':   ['#ff4d7d', '#ffd0dc'],
  'enemy:oracle':    ['#2dd4bf', '#c8fff6'],
  'player:galaxy':   ['#8b7bf0', '#e4dcff'],
  'player:fossil':   ['#c8a45c', '#f3e4bf'],
  'summon:arrive':   ['#f5c542', '#fff1b8'],
  'pill:cast':       ['#e0a44a', '#ffe3a8'],
}
const WARD = '#d1495b'
const FIRE_POOL = '#ff8c28'
const RIME = '#bae6fd'
const SMOKE_C = '#5a5048'

export default function BattleFxCanvas({ overSea, paused, bus = 'stage', z = 5 }: { overSea: boolean; paused: boolean; bus?: string; z?: number }) {
  const holder = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const { emitters, wake } = busFor(bus)
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
    const takeP = () => { const p = ps[pi]; pi = (pi + 1) % P_CAP; p.ex = 1; p.ey = 1; return p }
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
    /** Deterministic 0..1 off a seed: a bolt keeps its shape frame to frame. */
    const rnd = (s: number) => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x) }
    /** A lightning channel: short segments with jitter largest mid-channel. */
    const boltPath = (x1: number, y1: number, x2: number, y2: number, amp: number, sd: number) => {
      ctx.moveTo(x1, y1)
      const segs = 10
      for (let i = 1; i < segs; i++) {
        const u = i / segs, taper = Math.max(0.2, 1 - Math.abs(u - 0.45) * 1.1)
        ctx.lineTo(x1 + (x2 - x1) * u + (rnd(sd + i * 1.7) * 2 - 1) * amp * taper, y1 + (y2 - y1) * u)
      }
      ctx.lineTo(x2, y2)
    }
    /** A dashed ellipse with a glow under a white core, turned by `rot`. */
    const dashRing = (col: string, x: number, y: number, rx: number, ry: number, rot: number, dash: number, gap: number, width: number, a: number) => {
      if (a <= 0.01 || rx <= 1 || ry <= 1) return
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.setLineDash([dash, gap])
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = width + 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.globalAlpha = Math.min(1, a * 1.5); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.8, width * 0.55)
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    /** An aureole: `n` soft beams out from a point, turned by `rot`. */
    const rays = (col: string, x: number, y: number, R0: number, n: number, rot: number, a: number) => {
      if (a <= 0.01 || R0 <= 2) return
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, R0 * 0.06); ctx.lineCap = 'round'
      ctx.beginPath()
      for (let i = 0; i < n; i++) { const an = i * Math.PI * 2 / n; ctx.moveTo(Math.cos(an) * R0 * 0.18, Math.sin(an) * R0 * 0.18); ctx.lineTo(Math.cos(an) * R0, Math.sin(an) * R0) }
      ctx.stroke()
      ctx.restore()
    }
    /** `n` sparks thrown from a point. */
    const burst = (x: number, y: number, n: number, col: string, speed: number, size = 2.5) => {
      const img = D(col)
      for (let i = 0; i < n; i++) {
        const p = takeP(); const an = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8)
        p.x = x; p.y = y; p.vx = Math.cos(an) * v; p.vy = Math.sin(an) * v * 0.85
        p.age = 0; p.life = 0.35 + Math.random() * 0.3; p.size = size + Math.random() * size
        p.mode = SPARK; p.img = img; p.ramp = false
      }
    }

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

        // ── THE LEGENDARY SIGNATURES ─────────────────────────────────
        case 'enemy:coil': {
          // One coil of the deep taking hold: a single violet ring tightening
          // onto the hull, quiet, so the build-up is seen without being loud.
          const k = easeIn(t / 0.55)
          if (k < 1) ellipse(R(C), cx, cy, hw * lerp(1.55, 0.95, k), hh * lerp(1.55, 0.95, k), 0.7 * (1 - k * 0.5))
          spawn(8, 0.25, () => {
            const p = takeP(); const a = Math.random() * Math.PI * 2
            p.cx = cx; p.cy = cy; p.r = Math.max(hw, hh) * 1.4; p.w = a
            p.age = 0; p.life = 0.45; p.size = 2.4 + Math.random() * 2
            p.mode = INWARD; p.img = D(M); p.ramp = false
          })
          break
        }
        case 'enemy:kraken': {
          // THE DEEP CLOSES. Tentacles come up from under the hull and wrap it,
          // growing in over the first third, then the whole grip clenches: a
          // ring collapses hard onto the hull, ink boils off it, and the
          // wash goes deep violet. Held for the rest of the beat.
          const grow = easeOut(t / 0.34)
          const clench = easeIn((t - 0.34) / 0.22)
          const tight = 1 - 0.14 * clench
          ellipse(D(C), cx, cy, hw * 1.4, hh * 1.25, (0.3 + 0.35 * clench) * env(t, 0.15, 0.8))
          // Four arcs, each a bezier from below the hull curling round a side
          // of it. Drawn to `grow` of their length so they rise into place.
          const arcs: [number, number, number][] = [[-0.85, -1, 0.9], [-0.35, 1, 1.15], [0.3, -1, 1.05], [0.8, 1, 0.95]]
          for (let n = 0; n < arcs.length; n++) {
            const [ox, side, len] = arcs[n]
            const g = easeOut((t - n * 0.05) / 0.34)
            if (g <= 0) continue
            const x0 = cx + ox * hw * tight, y0 = rc.y + rc.h * 1.05
            const x1 = cx + (ox + side * 0.6) * hw * tight, y1 = cy + hh * 0.2
            const x2 = cx + (ox - side * 0.25) * hw * tight, y2 = cy - hh * (0.9 * len) * tight
            strokeGlow(C, 3.4, 0.85 * env(t, 0.2, 0.82), () => {
              ctx.moveTo(x0, y0)
              // Partial bezier by subdividing: cheap and exact enough.
              const N = 18
              for (let s = 1; s <= N * g; s++) {
                const u = s / N, v = 1 - u
                ctx.lineTo(v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2)
              }
            })
            // A sucker glow at the tip.
            const u = g, v = 1 - g
            circ(D(M), v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2, 5, 0.9 * env(t, 0.2, 0.82))
          }
          if (clench > 0 && clench < 1) ellipse(R(M), cx, cy, hw * lerp(1.7, 0.7, clench), hh * lerp(1.7, 0.7, clench), 0.95 * (1 - clench))
          // Ink at the clench.
          if (t > 0.34 && e.debtB === 0) { e.debtB = 1; for (let i = 0; i < 7; i++) { const p = takeS(); const hw2 = rc.w * rc.ink / 2; p.x = cx + (Math.random() * 2 - 1) * hw2 * 0.7; p.y = cy + hh * 0.3; p.vx = (Math.random() - 0.5) * 24; p.vy = -18 - Math.random() * 20; p.age = 0; p.life = 1.2 + Math.random() * 0.8; p.size = 14 + Math.random() * 12; p.mode = SMOKE; p.img = D('#2a1650'); p.ramp = false; p.spin = (Math.random() - 0.5) * 2 } }
          spawn(30, 0.5, () => {
            const p = takeP(); const a = Math.random() * Math.PI * 2
            p.cx = cx; p.cy = cy; p.r = Math.max(hw, hh) * (1.5 + Math.random() * 0.5); p.w = a
            p.age = 0; p.life = 0.5 + Math.random() * 0.3; p.size = 2.6 + Math.random() * 2.6
            p.mode = INWARD; p.img = D(M); p.ramp = false
          })
          break
        }
        case 'enemy:wrath': {
          // The Man-o-War's Wrath: on top of the Mega's own blast, a heavy gold
          // shockwave and a second slower one behind it, hot gold sparks thrown
          // wide, and the hull lit gold for the beat.
          ellipse(D(C), cx, cy, hw * 1.5, hh * 1.3, 0.55 * env(t, 0.08, 0.4))
          const k1 = easeOut(t / 0.42), k2 = easeOut((t - 0.1) / 0.6)
          if (k1 < 1) ellipse(R(M), cx, cy, hw * lerp(0.3, 2.6, k1), hh * lerp(0.3, 2.6, k1), 1.0 * (1 - k1))
          if (k2 > 0 && k2 < 1) ellipse(R(C), cx, cy, hw * lerp(0.4, 2.0, k2), hh * lerp(0.4, 2.0, k2), 0.7 * (1 - k2))
          if (born) for (let i = 0; i < 28; i++) {
            const p = takeP(); const a = Math.random() * Math.PI * 2
            p.x = cx; p.y = cy; p.vx = Math.cos(a) * (120 + Math.random() * 160); p.vy = Math.sin(a) * (90 + Math.random() * 120)
            p.age = 0; p.life = 0.4 + Math.random() * 0.3; p.size = 3 + Math.random() * 3
            p.mode = SPARK; p.img = D(M); p.ramp = false
          }
          break
        }
        case 'player:feed': {
          // THE LEVIATHAN FEEDS. A deep drink: blood streams in from the enemy's
          // side of the water into your hull, and the hull answers green as it
          // takes. Red first, then the mend.
          const red = D(C), green = D(M)
          ellipse(red, cx, cy, hw * 1.3, hh * 1.15, 0.4 * env(t, 0.1, 0.45) * (1 - easeIn((t - 0.45) / 0.3)))
          ellipse(green, cx, cy, hw * 1.3, hh * 1.15, 0.5 * env(Math.max(0, (t - 0.4) / 0.6), 0.25, 0.7))
          spawn(40, 0.45, () => {
            const p = takeP()
            // Born off to the RIGHT, where the enemy is, at the hull's height.
            const a = (Math.random() - 0.5) * 0.9
            p.cx = cx; p.cy = cy; p.r = hw * (2.2 + Math.random() * 0.8); p.w = a
            p.age = 0; p.life = 0.5 + Math.random() * 0.3; p.size = 3 + Math.random() * 3
            p.mode = INWARD; p.img = red; p.ramp = false
          })
          const k = easeOut((t - 0.45) / 0.5)
          if (k > 0 && k < 1) ellipse(R(M), cx, cy, hw * lerp(0.6, 1.4, k), hh * lerp(0.6, 1.4, k), 0.85 * (1 - k))
          break
        }
        case 'player:favor': {
          // THE DON'S FAVOR. The fight opens with something granted, in the
          // colour of what it was: a slow ring out and a stately rise of motes.
          ellipse(D(C), cx, cy, hw * 1.35, hh * 1.2, 0.45 * env(t, 0.2, 0.7))
          const k = easeOut(t / 0.8)
          if (k < 1) ellipse(R(C), cx, cy, hw * lerp(0.5, 1.6, k), hh * lerp(0.5, 1.6, k), 0.8 * (1 - k))
          spawn(26, 0.6, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.8; p.y = rc.y + rc.h * (0.4 + Math.random() * 0.45)
            p.vx = (Math.random() - 0.5) * 8; p.vy = -(12 + Math.random() * 18)
            p.age = 0; p.life = 0.8 + Math.random() * 0.5; p.size = 2.6 + Math.random() * 2.8
            p.mode = RISE; p.ramp = false; p.img = D(M); p.k = 0.25; p.spin = Math.random() * 6
          })
          break
        }

        // ── THE CHASE SKINS' SET PIECES ──────────────────────────────
        // Each was a tree of tweened divs over the hull. Same choreography,
        // same beats the fight is timed to, drawn as light and particles.
        case 'enemy:tempest': {
          // A STORM BREAKS OVER THE ENEMY. Dark cloud masses above the hull,
          // rain comes down through a blue underglow that flickers, and one
          // bolt per shot of the barrage cracks cloud-to-hull, raking across
          // her, the last one heavy and forked. Each strike is a white-out on
          // the hull and a throw of sparks off the point it hit.
          const n = Math.max(3, Math.min(12, e.live.shots ?? 5)), iv = (e.live.interval ?? 200) / 1000
          const top = Math.max(fade, rc.y - rc.h * 1.6)
          const hold = env(t, 0.1, 0.85)
          if (born) for (let i = 0; i < 18; i++) {
            const p = takeS()
            p.x = cx + (Math.random() * 2 - 1) * hw * 1.4; p.y = top + rc.h * (0.1 + Math.random() * 0.35)
            p.vx = (Math.random() - 0.5) * 16; p.vy = -3 - Math.random() * 5
            p.age = 0; p.life = e.dur * 0.85 + Math.random() * 0.4; p.size = 18 + Math.random() * 18
            p.mode = SMOKE; p.img = D('#141c30'); p.ramp = false; p.spin = (Math.random() - 0.5) * 2
          }
          const fl = 0.55 + 0.45 * Math.random()
          ellipse(D(C), cx, top + rc.h * 0.28, hw * 1.6, rc.h * 0.32, 0.34 * fl * hold)
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.1, 0.22 * fl * hold)
          e.debtB += 110 * dt * hold
          while (e.debtB >= 1) {
            e.debtB -= 1
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 1.7; p.y = top + rc.h * 0.3
            p.vx = -24; p.vy = 420 + Math.random() * 180
            p.age = 0; p.life = Math.max(0.12, (cy + hh - p.y) / p.vy); p.size = 1.1; p.ey = 8
            p.mode = RAIN; p.img = D('#a8d4ff'); p.ramp = false
          }
          for (let k = 0; k < n; k++) {
            const at = k * iv, big = k === n - 1, life = big ? 0.5 : 0.34
            const a = e.age - at
            if (a < 0 || a > life) continue
            const u = n === 1 ? 0.5 : k / (n - 1)
            const hx = big ? cx : cx + (u - 0.5) * hw * 1.3 + (k % 2 ? 1 : -1) * hw * 0.1
            const hy = big ? cy + hh * 0.3 : cy + hh * (0.0 + (k % 3) * 0.22)
            const ox = hx + (k % 2 ? -1 : 1) * hw * 0.35
            const q = a / life
            const fk = big
              ? (q < 0.12 ? 1 : q < 0.28 ? 0.4 : q < 0.42 ? 1 : 1 - (q - 0.42) / 0.58)
              : (q < 0.14 ? 1 : q < 0.34 ? 0.25 : q < 0.5 ? 0.85 : 1 - (q - 0.5) / 0.5)
            const amp = big ? hw * 0.22 : hw * 0.14, sd = e.seed[k % 16] * 100
            strokeGlow(C, big ? 3.4 : 1.9, 0.95 * fk, () => boltPath(ox, top, hx, hy, amp, sd))
            strokeGlow(C, big ? 1.8 : 1.1, 0.7 * fk, () => {
              const fu = 0.42, fx0 = ox + (hx - ox) * fu, fy0 = top + (hy - top) * fu
              boltPath(fx0, fy0, fx0 + (rnd(sd + 9) - 0.5) * amp * 3.2, fy0 + (hy - top) * 0.32, amp * 0.5, sd + 13)
            })
            if (a - dt < 0) {
              burst(hx, hy, big ? 44 : 16, M, big ? 280 : 160)
              burst(hx, hy, big ? 20 : 6, '#ffffff', big ? 200 : 120)
              for (let i = 0; i < (big ? 10 : 3); i++) ember(rc, 1.0, true, M, 0.4)
            }
            const R0 = Math.max(hw, hh)
            circ(D('#ffffff'), hx, hy, R0 * lerp(0.15, big ? 1.1 : 0.6, easeOut(q)), 0.95 * (1 - q))
            circ(D(C), hx, hy, R0 * lerp(0.2, big ? 1.6 : 0.9, easeOut(q)), 0.8 * (1 - q))
            circ(R(C), hx, hy, R0 * lerp(0.1, big ? 1.5 : 0.85, easeOut(q)), 0.9 * (1 - q))
            if (big) ellipse(D('#ffffff'), cx, cy, hw * 1.25, hh * 1.1, 0.55 * Math.pow(1 - q, 3))
          }
          break
        }
        case 'enemy:leviathan': {
          // THE APEX KILL. A reticle snaps its lock and holds. A dashed ring
          // contracts, motes are dragged in, and a blood-red core gathers,
          // swells, then tightens to a white-hot point the instant before it
          // goes. Then ONE detonation: white to red, three shockwaves, a ring
          // of fangs, sparks thrown wide. No aftershock.
          const S = 0.58, R0 = Math.max(hw, hh)
          if (e.age < S) {
            const q = e.age / S
            const s = easeOut(q / 0.3), tight = 1 - 0.1 * easeIn((q - 0.3) / 0.7)
            const bw = hw * lerp(1.6, 0.95, s) * tight, bh = hh * lerp(1.6, 0.95, s) * tight, L = Math.max(8, Math.min(hw, hh) * 0.32)
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(lerp(-0.25, 0, s))
            strokeGlow(C, 2.6, 0.95 * s, () => {
              for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
                ctx.moveTo(sx * bw - sx * L, sy * bh); ctx.lineTo(sx * bw, sy * bh); ctx.lineTo(sx * bw, sy * bh - sy * L)
              }
            })
            ctx.restore()
            const ck = easeIn(q)
            dashRing(C, cx, cy, hw * lerp(2.4, 0.45, ck), hh * lerp(2.4, 0.45, ck), q * 2.2, 6, 5, 1.6, 0.8 * Math.min(1, q * 3))
            e.debtB += 80 * dt
            while (e.debtB >= 1) {
              e.debtB -= 1
              const p = takeP(); const an = Math.random() * Math.PI * 2
              p.cx = cx; p.cy = cy; p.r = R0 * (2.0 + Math.random() * 0.6); p.w = an
              p.age = 0; p.life = 0.3 + Math.random() * 0.15; p.size = 2.6 + Math.random() * 2.4
              p.mode = INWARD; p.img = D(M); p.ramp = false
            }
            const cr = R0 * (q < 0.72 ? lerp(0.1, 0.6, easeOut(q / 0.72)) : lerp(0.6, 0.12, easeIn((q - 0.72) / 0.28)))
            circ(D(C), cx, cy, cr * 1.9, 0.55 * q)
            circ(D('#ffffff'), cx, cy, cr * 0.6, 0.7 * q * q)
            ellipse(D(C), cx, cy, hw * 1.3, hh * 1.15, 0.3 * q)
          } else {
            const q = Math.min(1, (e.age - S) / 0.72)
            if (e.age - dt < S) {
              burst(cx, cy, 80, M, 320, 3.2); burst(cx, cy, 30, '#ffffff', 220)
              for (let i = 0; i < 8; i++) { const p = takeS(); p.x = cx + (Math.random() * 2 - 1) * hw * 0.7; p.y = cy + hh * 0.2; p.vx = (Math.random() - 0.5) * 60; p.vy = -30 - Math.random() * 30; p.age = 0; p.life = 0.9 + Math.random() * 0.5; p.size = 14 + Math.random() * 12; p.mode = SMOKE; p.img = D('#3a0a0a'); p.ramp = false; p.spin = (Math.random() - 0.5) * 2 }
            }
            circ(D('#ffffff'), cx, cy, R0 * lerp(0.2, 2.6, easeOut(q)), 0.95 * (1 - q))
            circ(D(C), cx, cy, R0 * lerp(0.3, 3.4, easeOut(q)), 0.9 * (1 - q))
            for (let n = 0; n < 3; n++) {
              const k = easeOut((q - n * 0.1) / 0.7)
              if (k > 0 && k < 1) ellipse(R(C), cx, cy, hw * lerp(0.3, 3.2, k), hh * lerp(0.3, 3.2, k), 0.95 * (1 - k))
            }
            const fq = easeOut(q / 0.7)
            ctx.save(); ctx.translate(cx, cy)
            strokeGlow(C, 3, 0.9 * (1 - q), () => {
              for (let i = 0; i < 14; i++) {
                const an = i * Math.PI * 2 / 14
                ctx.moveTo(Math.cos(an) * R0 * 0.3, Math.sin(an) * R0 * 0.24)
                ctx.lineTo(Math.cos(an) * R0 * lerp(0.3, 1.7, fq), Math.sin(an) * R0 * lerp(0.3, 1.7, fq) * 0.8)
              }
            })
            ctx.restore()
            ellipse(D(C), cx, cy, hw * 1.4, hh * 1.2, 0.6 * (1 - q))
          }
          break
        }
        case 'enemy:requiem': {
          // THE DEATH-MARK. A gilded gaze falls from above, an aureole of rays
          // tightens, and the sigil converges onto the hull turning: dashed
          // outer ring, inner ring, twelve ticks, a six-point star, and the
          // eye at its heart. It sears in at the half-second with a gold
          // flash and a throw of sparks, and rose motes wheel over the mark.
          const S = 0.5, GOLD = '#f5c542', R0 = Math.max(hw, hh)
          const beamTop = Math.max(fade, rc.y - rc.h * 1.5)
          const bg = easeOut(e.age / 0.45)
          blob(D(GOLD), cx, lerp(beamTop, (beamTop + cy) / 2, bg), hw * 0.8, (cy - beamTop) * bg * 1.3, 0.45 * env(t, 0.2, 0.7))
          blob(D(C), cx, cy - hh * 0.3, hw * 0.6, hh * 1.6, 0.3 * env(t, 0.25, 0.7))
          rays(GOLD, cx, cy, R0 * 1.9 * lerp(1.5, 1, easeOut(t / 0.4)), 14, t * 0.5 - 0.4, 0.16 * env(t, 0.25, 0.75))
          const s = easeOut(e.age / 0.5), rot = lerp(-0.6, 0, s) + t * 0.15, rr = Math.min(hw * 0.9, hh * 0.95) * lerp(1.55, 1, s)
          const sa = 0.95 * s * env(t, 0.3, 0.78)
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
          dashRing(GOLD, 0, 0, rr, rr * 0.8, 0, 3, 5, 1.2, sa)
          strokeGlow(C, 1.6, sa * 0.9, () => { ctx.ellipse(0, 0, rr * 0.72, rr * 0.72 * 0.8, 0, 0, Math.PI * 2) })
          strokeGlow(GOLD, 1.4, sa, () => {
            for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6; ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.8); ctx.lineTo(Math.cos(an) * rr * 0.86, Math.sin(an) * rr * 0.86 * 0.8) }
            for (const an of [0, Math.PI / 3, Math.PI * 2 / 3]) { ctx.moveTo(Math.cos(an) * rr * 0.5, Math.sin(an) * rr * 0.4); ctx.lineTo(-Math.cos(an) * rr * 0.5, -Math.sin(an) * rr * 0.4) }
          })
          strokeGlow(C, 1.8, sa, () => { ctx.ellipse(0, 0, rr * 0.3, rr * 0.16, 0, 0, Math.PI * 2) })
          ctx.restore()
          circ(D(C), cx, cy, rr * 0.1, sa)
          circ(D('#ffffff'), cx, cy, rr * 0.05, sa)
          if (e.age >= S) {
            const q = Math.min(1, (e.age - S) / 0.55)
            if (e.age - dt < S) { burst(cx, cy + hh * 0.2, 36, GOLD, 220); burst(cx, cy, 20, M, 140) }
            circ(D('#ffffff'), cx, cy + hh * 0.25, R0 * lerp(0.3, 1.9, easeOut(q)), 0.9 * (1 - q))
            circ(D(GOLD), cx, cy + hh * 0.25, R0 * lerp(0.4, 2.4, easeOut(q)), 0.7 * (1 - q))
            ellipse(R(C), cx, cy, hw * lerp(0.5, 1.9, easeOut(q)), hh * lerp(0.5, 1.9, easeOut(q)), 0.9 * (1 - q))
          }
          spawn(24, 0.5, () => {
            const p = takeP()
            p.cx = cx; p.cy = cy; p.r = hw * (0.7 + Math.random() * 0.6); p.w = Math.random() * Math.PI * 2
            p.k = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.2)
            p.age = 0; p.life = 0.7 + Math.random() * 0.4; p.size = 2.4 + Math.random() * 2.2
            p.mode = ORBIT; p.img = D(M); p.ramp = false
          })
          ellipse(D(C), cx, cy, hw * 1.25, hh * 1.1, 0.35 * env(t, 0.3, 0.75))
          break
        }
        case 'enemy:oracle': {
          // THE ABYSSAL SCRY. Caustic teal light wobbles over the target, four
          // sonar rings go out scanning her, a rune ring turns in, and a scan
          // line sweeps the hull top to bottom. Then the eye opens: a lens of
          // white and teal, and a dark pupil that LOOKS, tracking side to
          // side while the read lands. Bubbles rise from under her the whole
          // time.
          const OPEN = 0.4, R0 = Math.max(hw, hh)
          ellipse(D(C), cx + Math.sin(clock * 1.7) * hw * 0.15, cy, hw * 1.4, hh * 1.2, 0.35 * env(t, 0.2, 0.75))
          ellipse(D(C), cx - Math.sin(clock * 2.3) * hw * 0.2, cy + hh * 0.2, hw * 1.0, hh * 0.9, 0.3 * env(t, 0.25, 0.75))
          for (let n = 0; n < 4; n++) {
            const k = easeOut((e.age - 0.15 - n * 0.18) / 1.0)
            if (k > 0 && k < 1) ellipse(R(C), cx, cy, hw * lerp(0.2, 3.0, k), hh * lerp(0.2, 3.0, k), 0.8 * (1 - k))
          }
          const s = easeOut(e.age / 0.5), rr = Math.min(hw * 0.85, hh) * lerp(1.5, 1, s), rot = lerp(-0.5, 0.17, s) + t * 0.3
          dashRing(C, cx, cy, rr, rr * 0.85, rot, 3, 6, 1.2, 0.85 * s * env(t, 0.3, 0.75))
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
          strokeGlow(C, 1.3, 0.85 * s * env(t, 0.3, 0.75), () => { for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.85); ctx.lineTo(Math.cos(an) * rr * 0.84, Math.sin(an) * rr * 0.84 * 0.85) } })
          ctx.restore()
          const sq = (e.age - 0.1) / 0.7
          if (sq > 0 && sq < 1) blob(D(M), cx, rc.y + rc.h * (0.1 + 0.8 * sq), hw * 2.4, 7, 0.85 * Math.sin(sq * Math.PI))
          if (e.age >= OPEN) {
            const q = e.age - OPEN, open = easeOut(q / 0.28), ea = 0.95 * env(t, 0.35, 0.78)
            const ew = Math.max(hw * 0.5, 18), eh = ew * 0.55 * open
            blob(D('#ffffff'), cx, cy, ew * 1.3, eh * 1.3, 0.5 * ea)
            blob(D(C), cx, cy, ew * 2.4, eh * 2.6, 0.55 * ea)
            strokeGlow(C, 1.8, ea, () => { ctx.ellipse(cx, cy, ew, Math.max(0.5, eh), 0, 0, Math.PI * 2) })
            const look = Math.min(1, Math.max(0, (q - 0.3) * 3))
            const px = cx + Math.sin((q - 0.3) * 3.4) * ew * 0.42 * look
            ctx.globalCompositeOperation = 'source-over'
            ctx.globalAlpha = ea; ctx.fillStyle = '#04121a'
            ctx.beginPath(); ctx.ellipse(px, cy, ew * 0.17, Math.max(0.5, eh * 0.72), 0, 0, Math.PI * 2); ctx.fill()
            ctx.globalCompositeOperation = 'lighter'
            circ(D('#ffffff'), px + ew * 0.06, cy - eh * 0.3, ew * 0.05, 0.9 * ea)
            if (q - dt < 0) { circ(D('#ffffff'), cx, cy, R0 * 0.6, 0.9); burst(cx, cy, 30, M, 180) }
            const fq = Math.min(1, q / 0.55)
            circ(D('#ffffff'), cx, cy, R0 * lerp(0.3, 1.8, easeOut(fq)), 0.8 * (1 - fq))
          }
          spawn(40, 0.9, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.9; p.y = rc.y + rc.h * 0.95
            p.vx = (Math.random() - 0.5) * 8; p.vy = -(30 + Math.random() * 40)
            p.age = 0; p.life = 0.9 + Math.random() * 0.6; p.size = 2.5 + Math.random() * 3
            p.mode = RISE; p.k = 0.2; p.img = R(M); p.ramp = false; p.spin = Math.random() * 6
          })
          break
        }
        case 'player:galaxy': {
          // THE COSMIC SURGE. Three nebulae bloom over your hull in the skin's
          // colour, cyan and magenta; a spiral galaxy of two hundred stars
          // turns behind her, tilted, the inner arms faster than the outer;
          // a white core burns at the centre; the shield-dome settles round
          // the hull with an overshoot; stars twinkle; three shooting stars
          // cross; healing motes rise through all of it.
          const CY = '#4dc9ff', MG = '#c56bff', R0 = Math.max(hw, hh)
          const g = easeOut(t / 0.35)
          ellipse(D(C), cx - hw * 0.15, cy - hh * 0.1, hw * 1.6 * g, hh * 1.5 * g, 0.4 * env(t, 0.3, 0.7))
          ellipse(D(CY), cx + hw * 0.25, cy + hh * 0.1, hw * 1.3 * g, hh * 1.2 * g, 0.32 * env(t, 0.35, 0.7))
          ellipse(D(MG), cx - hw * 0.05, cy + hh * 0.3, hw * 1.2 * g, hh * 1.1 * g, 0.32 * env(t, 0.4, 0.7))
          if (born) for (let i = 0; i < 200; i++) {
            const p = takeP(); const arm = i % 2, u = i / 200
            p.cx = cx; p.cy = cy; p.r = R0 * (0.15 + 1.5 * u); p.w = arm * Math.PI + u * 4.2 + (Math.random() - 0.5) * 0.5
            p.k = 1.4 / (0.4 + u); p.age = 0; p.life = 1.25 + Math.random() * 0.4
            p.size = 2 + Math.random() * 2.5 + (1 - u) * 2
            p.mode = ORBIT; p.img = D(i % 5 === 0 ? '#ffffff' : i % 3 === 0 ? MG : i % 2 ? CY : C); p.ramp = false
          }
          circ(D('#ffffff'), cx, cy, R0 * 0.22 * lerp(0.3, 1, easeOut(t / 0.25)), 0.9 * env(t, 0.2, 0.7))
          circ(D(C), cx, cy, R0 * 0.6, 0.6 * env(t, 0.2, 0.7))
          const dk = t / 0.3, ds = dk < 1 ? lerp(0.55, 1.06, easeOut(dk)) : lerp(1.06, 1.0, Math.min(1, (t - 0.3) / 0.2))
          ellipse(R(CY), cx, cy, hw * 1.15 * ds, hh * 1.15 * ds, 0.85 * env(t, 0.25, 0.72))
          ellipse(D(C), cx, cy, hw * 1.15 * ds, hh * 1.15 * ds, 0.15 * env(t, 0.25, 0.72))
          const q = (e.age - 0.26) / 0.6
          if (q > 0 && q < 1) circ(D('#ffffff'), cx, cy, R0 * lerp(0.3, 2.2, easeOut(q)), 0.85 * (1 - q))
          for (let i = 0; i < 16; i++) {
            const sx = cx + (e.seed[i] * 2 - 1) * hw * 1.8, sy = cy + (e.seed[(i + 7) % 16] * 2 - 1) * hh * 1.6
            const tw = 0.5 + 0.5 * Math.sin(clock * 7 + i * 1.9)
            circ(D('#ffffff'), sx, sy, 2.5 + tw * 2, 0.9 * tw * env(t, 0.2, 0.75))
          }
          for (const [at, yy] of [[0.35, 0.2], [0.62, 0.5], [0.98, 0.72]] as const) {
            if (e.age >= at && e.age - dt < at) {
              const p = takeP()
              p.x = cx - hw * 1.8; p.y = cy + (yy - 0.5) * hh * 1.6; p.vx = 420; p.vy = 24
              p.age = 0; p.life = 0.8; p.size = 2.6; p.ex = 10; p.mode = STREAM; p.img = D(CY); p.ramp = false
            }
          }
          spawn(44, 0.8, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.9; p.y = rc.y + rc.h * (0.5 + Math.random() * 0.4)
            p.vx = (Math.random() - 0.5) * 10; p.vy = -(20 + Math.random() * 30)
            p.age = 0; p.life = 0.8 + Math.random() * 0.5; p.size = 2.6 + Math.random() * 3
            p.mode = RISE; p.ramp = false; p.img = D(Math.random() < 0.33 ? MG : Math.random() < 0.5 ? CY : M); p.k = 0.3; p.spin = Math.random() * 6
          })
          break
        }
        case 'player:fossil': {
          // THE ANCIENT WARD. Sepia and amber haze, an aureole of rays turning
          // slowly, and two counter-rotating rings of glyphs converging on the
          // hull until they LOCK, with a flash, a throw of cream sparks and a
          // breath of stone dust. Primordial motes rise through the seal for
          // the rest of it.
          const LOCK = 0.62, CREAM = '#ead6a6', R0 = Math.max(hw, hh)
          ellipse(D(C), cx, cy, hw * 1.4, hh * 1.3, 0.35 * env(t, 0.25, 0.8))
          ellipse(D(CREAM), cx + hw * 0.2, cy + hh * 0.2, hw * 1.0, hh * 0.9, 0.25 * env(t, 0.3, 0.8))
          rays(C, cx, cy, R0 * 1.8, 16, -0.35 + t * 0.35, 0.14 * env(t, 0.3, 0.75))
          const s = easeOut(e.age / LOCK), after = Math.max(0, e.age - LOCK), ra = 0.9 * env(t, 0.15, 0.82)
          const r1 = Math.min(hw * 0.95, hh * 1.05) * lerp(1.5, 1, s), rot1 = lerp(-0.7, 0, s) + after * 0.12
          dashRing(CREAM, cx, cy, r1, r1 * 0.85, rot1, 3, 5, 1.1, ra)
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot1)
          strokeGlow(CREAM, 1.3, ra, () => { for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6; ctx.moveTo(Math.cos(an) * r1, Math.sin(an) * r1 * 0.85); ctx.lineTo(Math.cos(an) * r1 * (k % 2 ? 0.86 : 0.9), Math.sin(an) * r1 * (k % 2 ? 0.86 : 0.9) * 0.85) } })
          ctx.restore()
          const r2 = r1 * 0.72, rot2 = lerp(0.7, 0, s) - after * 0.1
          dashRing(C, cx, cy, r2, r2 * 0.85, rot2, 2, 6, 1.4, ra)
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot2)
          strokeGlow(C, 1.2, ra, () => { for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; ctx.moveTo(Math.cos(an) * r2, Math.sin(an) * r2 * 0.85); ctx.lineTo(Math.cos(an) * r2 * 0.84, Math.sin(an) * r2 * 0.84 * 0.85) } })
          ctx.restore()
          if (e.age >= LOCK) {
            const q = Math.min(1, after / 0.6)
            if (e.age - dt < LOCK) {
              burst(cx, cy, 40, CREAM, 220); burst(cx, cy, 16, M, 160)
              for (let i = 0; i < 6; i++) { const p = takeS(); p.x = cx + (Math.random() * 2 - 1) * hw * 0.8; p.y = cy + hh * 0.5; p.vx = (Math.random() - 0.5) * 40; p.vy = -14 - Math.random() * 16; p.age = 0; p.life = 1.1 + Math.random() * 0.6; p.size = 12 + Math.random() * 10; p.mode = SMOKE; p.img = D('#5a4630'); p.ramp = false; p.spin = (Math.random() - 0.5) * 2 }
            }
            circ(D('#fff6e0'), cx, cy, R0 * lerp(0.3, 1.9, easeOut(q)), 0.9 * (1 - q))
            circ(D(C), cx, cy, R0 * lerp(0.4, 2.4, easeOut(q)), 0.6 * (1 - q))
            ellipse(R(C), cx, cy, hw * lerp(0.6, 1.7, easeOut(q)), hh * lerp(0.6, 1.7, easeOut(q)), 0.85 * (1 - q))
          }
          spawn(36, 1.0, () => {
            const p = takeP()
            p.x = cx + (Math.random() * 2 - 1) * hw * 0.85; p.y = rc.y + rc.h * (0.5 + Math.random() * 0.4)
            p.vx = (Math.random() - 0.5) * 8; p.vy = -(14 + Math.random() * 22)
            p.age = 0; p.life = 1.0 + Math.random() * 0.6; p.size = 2.6 + Math.random() * 2.8
            p.mode = RISE; p.ramp = false; p.img = D(Math.random() < 0.5 ? CREAM : M); p.k = 0.25; p.spin = Math.random() * 6
          })
          break
        }

        // ── THE SUMMON ───────────────────────────────────────────────
        case 'summon:arrive': {
          // THE CREW IS CONJURED. The rect here is the viewport; the figure
          // stands at 43% down it. Rays fan out and turn, two dashed rings
          // counter-rotate in and hold, a white flash lands on arrival, and
          // motes drift in the dark for the whole hold. A chase skin lands
          // heavier: a gold flare, two ripples at its feet, sparks climbing
          // for the length of the hold, and its own signature over the art.
          const chase = !!e.live.chase, skin = e.live.skinId ?? null
          const X = rc.x + rc.w / 2, Y = rc.y + rc.h * 0.43, R0 = Math.min(rc.w, rc.h) * 0.3
          const A = env(t, 0.05, 0.88), arr = easeOut(e.age / 0.35)
          rays(C, X, Y, R0 * 2.4 * lerp(0.4, 1.2, arr), 18, -0.5 + e.age * 0.35, (chase ? 0.2 : 0.14) * A)
          circ(D(C), X, Y + R0 * 0.2, R0 * 1.7, (chase ? 0.5 : 0.35) * A)
          dashRing(C, X, Y, R0 * 1.15 * lerp(0.3, 1, arr), R0 * 1.15 * lerp(0.3, 1, arr), e.age * 0.9, 14, 12, 1.6, 0.6 * A)
          dashRing(C, X, Y, R0 * 0.92 * lerp(0.3, 1, arr), R0 * 0.92 * lerp(0.3, 1, arr), -e.age * 0.9, 4, 16, 2.2, 0.6 * A)
          const q1 = (e.age - 0.1) / 0.45
          if (q1 > 0 && q1 < 1) circ(D('#ffffff'), X, Y, R0 * lerp(0.4, 1.8, easeOut(q1)), 0.85 * (1 - q1))
          if (chase) {
            const q2 = (e.age - 0.14) / 0.7
            if (q2 > 0 && q2 < 1) circ(D('#fffbe8'), X, Y, R0 * lerp(0.3, 2.6, easeOut(q2)), 0.9 * (1 - q2))
            for (const [at, sc] of [[0.18, 1], [0.46, 1.25]] as const) {
              const k = easeOut((e.age - at) / 0.9)
              if (k > 0 && k < 1) ellipse(R(C), X, Y + R0 * 1.1, R0 * lerp(0.25, 2.1, k) * sc, R0 * lerp(0.08, 0.6, k) * sc, 0.7 * (1 - k))
            }
            if (e.age - dt < 0.14) burst(X, Y, 50, M, 300, 3)
          }
          e.debtB += (chase ? 36 : 10) * dt * (t < 0.8 ? 1 : 0)
          while (e.debtB >= 1) {
            e.debtB -= 1
            const p = takeP()
            p.x = X + (Math.random() * 2 - 1) * R0 * 1.3; p.y = Y + R0 * (0.5 + Math.random() * 0.5)
            p.vx = (Math.random() - 0.5) * 30; p.vy = -(60 + Math.random() * 110)
            p.age = 0; p.life = 1.0 + Math.random() * 0.7; p.size = 3 + Math.random() * 3.5
            p.mode = RISE; p.ramp = false; p.img = D(Math.random() < 0.3 ? '#ffffff' : M); p.k = 0.3; p.spin = Math.random() * 6
          }
          spawn(60, 1.6, () => {
            const p = takeP(); const an = Math.random() * Math.PI * 2, rr = R0 * (0.8 + Math.random() * 1.6)
            p.x = X + Math.cos(an) * rr; p.y = Y + Math.sin(an) * rr * 0.8
            p.vx = (Math.random() - 0.5) * 12; p.vy = -(4 + Math.random() * 10)
            p.age = 0; p.life = 1.2 + Math.random() * 0.6; p.size = 2 + Math.random() * 2.5
            p.mode = DRIFT; p.img = D(M); p.ramp = false
          })
          if (chase && skin) {
            // The signature, over the art: the same language as the skin's
            // strike so the summon and the strike rhyme.
            const sw = R0 * 0.9, sh = R0 * 1.1
            if (skin === 'mako_tempest') {
              const k = Math.floor(e.age / 0.32)
              const a = e.age - k * 0.32
              if (a < 0.2 && k < 7) {
                const sd = e.seed[k % 16] * 100, side = k % 2 ? 1 : -1
                const x1 = X + side * sw * (0.3 + rnd(sd) * 0.6), y1 = Y - sh * 1.5
                const x2 = X + side * sw * (0.2 + rnd(sd + 3) * 0.5), y2 = Y + sh * (rnd(sd + 5) - 0.4)
                const fk = a < 0.05 ? 1 : a < 0.1 ? 0.3 : a < 0.14 ? 0.9 : 1 - (a - 0.14) / 0.06
                strokeGlow(C, 2.2, 0.95 * fk * A, () => boltPath(x1, y1, x2, y2, sw * 0.18, sd))
                if (a - dt < 0) burst(x2, y2, 16, M, 180)
              }
            } else if (skin === 'dole_krakenhunter') {
              const arcs: [number, number, number][] = [[-0.95, -1, 1.0], [-0.4, 1, 1.25], [0.35, -1, 1.15], [0.9, 1, 1.05]]
              for (let n = 0; n < arcs.length; n++) {
                const [ox, side, len] = arcs[n]
                const g = easeOut((e.age - 0.2 - n * 0.07) / 0.5)
                if (g <= 0) continue
                const x0 = X + ox * sw, y0 = Y + sh * 1.15
                const x1 = X + (ox + side * 0.7) * sw, y1 = Y + sh * 0.2
                const x2 = X + (ox - side * 0.3) * sw, y2 = Y - sh * 0.9 * len
                strokeGlow(C, 3.2, 0.8 * A, () => {
                  ctx.moveTo(x0, y0)
                  for (let s2 = 1; s2 <= 18 * g; s2++) { const u = s2 / 18, v = 1 - u; ctx.lineTo(v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2) }
                })
                const u = g, v = 1 - g
                circ(D(M), v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2, 6, 0.9 * A)
              }
              spawn(50, 1.8, () => { const p = takeP(); p.x = X + (Math.random() * 2 - 1) * sw * 1.2; p.y = Y + sh * 1.1; p.vx = (Math.random() - 0.5) * 8; p.vy = -(30 + Math.random() * 40); p.age = 0; p.life = 1.2 + Math.random() * 0.8; p.size = 2.5 + Math.random() * 3; p.mode = RISE; p.k = 0.2; p.img = R(M); p.ramp = false; p.spin = Math.random() * 6 })
            } else if (skin === 'catfish_galaxy') {
              if (e.age - dt < 0.15) for (let i = 0; i < 220; i++) {
                const p = takeP(); const arm = i % 2, u = i / 220
                p.cx = X; p.cy = Y + sh * 0.15; p.r = R0 * (0.4 + 1.6 * u); p.w = arm * Math.PI + u * 4.2 + (Math.random() - 0.5) * 0.5
                p.k = 1.1 / (0.4 + u); p.age = 0; p.life = 2.0 + Math.random() * 0.3
                p.size = 2 + Math.random() * 2.5 + (1 - u) * 2
                p.mode = ORBIT; p.img = D(i % 5 === 0 ? '#ffffff' : i % 3 === 0 ? '#c56bff' : i % 2 ? '#4dc9ff' : C); p.ramp = false
              }
            } else if (skin === 'coelacanth_fossil') {
              const s = easeOut(e.age / 0.7), r3 = R0 * 1.45 * lerp(1.4, 1, s), rot3 = lerp(-0.8, 0, s) + e.age * 0.1
              ctx.save(); ctx.translate(X, Y); ctx.rotate(rot3)
              strokeGlow('#ead6a6', 1.4, 0.8 * A, () => { for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8; ctx.moveTo(Math.cos(an) * r3, Math.sin(an) * r3); ctx.lineTo(Math.cos(an) * r3 * (k % 2 ? 0.9 : 0.94), Math.sin(an) * r3 * (k % 2 ? 0.9 : 0.94)) } })
              ctx.restore()
            } else if (skin === 'doby_huntersbane') {
              const pulse = 0.94 + 0.06 * Math.sin(clock * 6), bw = sw * 1.05 * pulse, bh = sh * 1.05 * pulse, L = R0 * 0.28
              strokeGlow(C, 2.6, 0.9 * A, () => {
                for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
                  ctx.moveTo(X + sx * bw - sx * L, Y + sy * bh); ctx.lineTo(X + sx * bw, Y + sy * bh); ctx.lineTo(X + sx * bw, Y + sy * bh - sy * L)
                }
              })
              spawn(90, 1.8, () => { const p = takeP(); const an = Math.random() * Math.PI * 2; p.cx = X; p.cy = Y; p.r = R0 * (1.8 + Math.random() * 0.8); p.w = an; p.age = 0; p.life = 0.5 + Math.random() * 0.3; p.size = 2.6 + Math.random() * 2.4; p.mode = INWARD; p.img = D(M); p.ramp = false })
            } else if (skin === 'moorish_idol_idol') {
              rays('#f5c542', X, Y, R0 * 2.2, 12, 0.3 - e.age * 0.25, 0.2 * A)
              blob(D('#f5c542'), X, Y - sh * 0.9, sw * 0.9, sh * 2.2, 0.35 * A)
              spawn(40, 1.6, () => { const p = takeP(); p.cx = X; p.cy = Y; p.r = R0 * (0.9 + Math.random() * 0.5); p.w = Math.random() * Math.PI * 2; p.k = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random()); p.age = 0; p.life = 1.2 + Math.random() * 0.6; p.size = 2.4 + Math.random() * 2.2; p.mode = ORBIT; p.img = D(M); p.ramp = false })
            }
          }
          break
        }
        case 'pill:cast': {
          // The raid-item drum's activation: two rings off the portrait and a
          // few sparks, where two bordered divs used to tween.
          const r = rc.w / 2
          for (let n = 0; n < 2; n++) {
            const k = easeOut((e.age - n * 0.12) / 0.75)
            if (k > 0 && k < 1) circ(R(C), cx, cy, r * lerp(0.5, 2.6 + n * 0.6, k), 0.9 * (1 - k))
          }
          circ(D(C), cx, cy, r * 1.6, 0.5 * env(t, 0.1, 0.4))
          if (born) burst(cx, cy, 14, M, 120, 2)
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
          case RAIN:
            // Straight down, no drag, drawn as a streak. Gone at the deck.
            p.x += p.vx * dt; p.y += p.vy * dt
            a = 0.7 * Math.sin(p.age * Math.PI)
            break
        }
        const img = p.ramp ? hot[Math.min(hot.length - 1, Math.floor(p.age * hot.length))] : p.img
        blob(img, p.x, p.y, sz * 2 * p.ex, sz * 2 * p.ey, a)
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
    // The bus is fixed for a mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // lit by its own fire rather than framed by it. The summon's canvas
      // passes its own, under the art it backlights.
      zIndex: z,
      pointerEvents: 'none',
    }} />
  )
}
