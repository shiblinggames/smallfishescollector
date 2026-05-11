'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Tunable constants ────────────────────────────────────────────────────────
const SHIP_X_RATIO    = 0.22
const SHIP_HEIGHT_PCT = 0.095  // small Canabalt-style sprite (~9.5% of canvas height)
const SHIP_ASPECT     = 1031 / 672   // trimmed boatrun.png

// Ship physics — Canabalt feel. Boat rides the wave surface; press-and-hold
// to jump (longer hold → higher jump). No automatic launches off crests.
const GRAVITY                  = 2800  // px/s² full gravity (in-air, after hold release)
const JUMP_IMPULSE             = 590   // px/s upward kick when press starts a jump
const JUMP_HOLD_GRAVITY_MULT   = 0.30  // gravity multiplier while hold is active (sustained jump)
const JUMP_MAX_HOLD_SEC        = 0.40  // hold beyond this no longer extends the jump
const BASE_SPEED               = 290   // px/s horizontal scroll (Canabalt rolls)
const SPEED_RAMP               = 7     // px/s² — gentle, unbounded climb (Canabalt-style)
const MAX_SPEED                = 1500  // soft safety cap; reached only after ~3 min of perfect play

// Sea surface — gentle long-period swells so the boat "runs" along the wave
const SEA_BASE_Y_PCT      = 0.78
const WAVE_PRIMARY_PERIOD = 560
const WAVE_PRIMARY_AMP    = 18
const WAVE_SECONDARY_PERIOD = 940
const WAVE_SECONDARY_AMP  = 7
const WAVE_AMP_RAMP_DISTANCE = 8000
const WAVE_AMP_RAMP_MAX   = 1.25

// Surface hazards — rocks/spikes poking out of the water. Boat clears them
// by being airborne when crossing. Size per spawn picks from three tiers
// with distance-based unlocks so early runs aren't punishingly hard.
const HAZARD_SPAWN_SPACING = 360   // base world px between hazard centers
const HAZARD_WARMUP        = 1200  // world px before the first hazard spawns
const TIER_SMALL_ONLY_M    = 25    // first ~25m: only small rocks (tap-clearable)
const TIER_NO_LARGE_M      = 90    // 25–90m: small + medium; no large rocks yet
const APPROACH_BUFFER_MED  = 80    // extra world px of approach before a medium rock
const APPROACH_BUFFER_LRG  = 240   // extra world px before a large rock (real reaction time)

// Time-based floors so high speeds don't outpace human reaction. Spacing and
// tier buffers scale with current speed once these times become more
// constraining than the world-px constants above.
const MIN_REACTION_TIME_SEC = 0.55  // floor on time between consecutive hazards
const MED_EXTRA_TIME_SEC    = 0.10  // extra reaction time for medium rocks
const LRG_EXTRA_TIME_SEC    = 0.30  // extra reaction time for large rocks

// Telegraph — fade-in marker at the right edge of the canvas previewing
// upcoming hazards before they actually scroll into view.
const TELEGRAPH_TIME_SEC    = 0.55  // how far ahead (in time) to preview hazards
const TELEGRAPH_MAX_ALPHA   = 0.55  // max opacity at edge of viewport

// Currents — slow-zones on the surface. Ride through to slow down (more
// reaction time); jump over to skip the slowdown. Spawned in the gap
// between hazards so they never overlap a rock.
const CURRENT_CHANCE       = 0.22  // probability of a current spawning after each hazard
const CURRENT_WIDTH_MIN    = 0.18  // % of canvas width
const CURRENT_WIDTH_MAX    = 0.32  // % of canvas width
const CURRENT_SPEED_MULT   = 0.55  // effective scroll speed when grounded inside a current
const CURRENT_WARMUP_M     = 35    // currents don't appear until 35m into the run
const CURRENT_ENTER_RATE   = 5.0   // 1/s — how fast the boat slows entering a current
const CURRENT_EXIT_RATE    = 1.6   // 1/s — how slow the boat re-accelerates leaving one

// Hitbox inset on the trimmed sprite
const HITBOX_INSET = { top: 0.35, right: 0.12, bottom: 0.08, left: 0.08 }

const METERS_PER_PIXEL = 1 / 60
const HIGH_SCORE_KEY = 'tide-run-best'

// ── Types ────────────────────────────────────────────────────────────────────
type GameState = 'ready' | 'playing' | 'dead'

interface Hazard {
  x: number          // world x (left edge of hazard)
  width: number
  height: number     // sticks up above the surface by this many px
}

interface Current {
  x: number          // world x (left edge of current zone)
  width: number      // width of slow-zone
}

// ── Sea surface helper ───────────────────────────────────────────────────────
function seaSurfaceY(worldX: number, ch: number, distanceScrolled: number): number {
  const ramp = 1 + Math.min(distanceScrolled / WAVE_AMP_RAMP_DISTANCE, 1) * (WAVE_AMP_RAMP_MAX - 1)
  const TAU = Math.PI * 2
  const w1 = Math.sin(worldX / WAVE_PRIMARY_PERIOD * TAU) * WAVE_PRIMARY_AMP
  const w2 = Math.sin(worldX / WAVE_SECONDARY_PERIOD * TAU + 1.1) * WAVE_SECONDARY_AMP
  return ch * SEA_BASE_Y_PCT - (w1 + w2) * ramp
}

// ── Game ─────────────────────────────────────────────────────────────────────
export default function TideRunGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const shipImgRef = useRef<HTMLImageElement | null>(null)

  // All mutable game state lives in a single ref. React state is only for UI.
  const gRef = useRef({
    state: 'ready' as GameState,
    cw: 0,
    ch: 0,
    shipH: 0,
    shipW: 0,
    shipY: 0,
    shipVy: 0,
    airborne: false,
    scrollX: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    hazards: [] as Hazard[],
    currents: [] as Current[],
    nextSpawnAt: 0,
    distance: 0,
    deathFlashUntil: 0,
    lastScoreUpdate: 0,
    holding: false,         // is the player currently holding to extend a jump?
    jumpHoldStart: 0,       // performance.now() of current jump's start
    lastHazardTier: null as 'small' | 'medium' | 'large' | null,
    speedMult: 1,           // smoothed effective scroll multiplier (current slowdown eases in/out)
  })

  const [uiState, setUiState] = useState<GameState>('ready')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)

  // ── Load sprite + best score ───────────────────────────────────────────────
  useEffect(() => {
    const img = new Image()
    img.src = '/boatrun.png'
    img.onload = () => { shipImgRef.current = img }
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(HIGH_SCORE_KEY) : null
    if (stored) setHighScore(parseInt(stored, 10) || 0)
  }, [])

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapperRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const g = gRef.current
    g.cw = rect.width
    g.ch = rect.height
    g.shipH = rect.height * SHIP_HEIGHT_PCT
    g.shipW = g.shipH * SHIP_ASPECT
    if (g.state === 'ready') {
      // Park the ship sitting on the sea surface at its screen x
      const cx = rect.width * SHIP_X_RATIO + g.shipW / 2
      const wy = seaSurfaceY(cx + g.scrollX, rect.height, 0)
      g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
      g.airborne = false
    }
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  // ── Reset game ─────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const g = gRef.current
    g.scrollX = 0
    g.speed = BASE_SPEED
    g.elapsed = 0
    g.hazards = []
    g.currents = []
    g.nextSpawnAt = HAZARD_WARMUP
    g.distance = 0
    g.deathFlashUntil = 0
    g.lastScoreUpdate = 0
    g.shipVy = 0
    g.airborne = false
    g.holding = false
    g.jumpHoldStart = 0
    g.lastHazardTier = null
    g.speedMult = 1
    // Land ship on the sea at its screen x
    const cx = g.cw * SHIP_X_RATIO + g.shipW / 2
    const wy = seaSurfaceY(cx + g.scrollX, g.ch, 0)
    g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
  }, [])

  // ── Press / release handlers ───────────────────────────────────────────────
  const onPress = useCallback(() => {
    const g = gRef.current
    if (g.state === 'ready') {
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
      return
    }
    if (g.state === 'dead') {
      if (performance.now() < g.deathFlashUntil + 350) return
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
      return
    }
    if (g.state === 'playing' && !g.airborne) {
      // Start a jump — initial impulse + open the hold window
      g.shipVy = -JUMP_IMPULSE
      g.airborne = true
      g.holding = true
      g.jumpHoldStart = performance.now()
    }
  }, [reset])

  const onRelease = useCallback(() => {
    const g = gRef.current
    g.holding = false
  }, [])

  // ── Spawn one surface hazard ──────────────────────────────────────────────
  // Tier is picked with distance-based gating so early game is forgiving;
  // medium/large hazards also get an "approach buffer" of extra world distance
  // so the player always has reaction time for the harder jumps.
  const spawnHazard = useCallback(() => {
    const g = gRef.current
    const distance = g.distance
    const r = Math.random()

    let tier: 'small' | 'medium' | 'large'
    if (distance < TIER_SMALL_ONLY_M) {
      tier = 'small'
    } else if (distance < TIER_NO_LARGE_M) {
      tier = r < 0.55 ? 'small' : 'medium'
    } else {
      if (r < 0.40) tier = 'small'
      else if (r < 0.75) tier = 'medium'
      else tier = 'large'
    }

    // Never spawn two large rocks in a row — the gap can be unclearable at
    // mid speeds (boat lands a hair before the second rock arrives but can't
    // reach 80px of clearance in time). Demote to medium when this would happen.
    if (tier === 'large' && g.lastHazardTier === 'large') {
      tier = 'medium'
    }

    // Large rocks on a wave crest are unfair: the boat launches from a lower
    // surface point and has to clear (waveDiff + rockHeight), eating most of
    // the jump margin. Only allow large rocks where the local wave is at or
    // below sea level (troughs and down-slopes). Crest-side spawns → medium.
    if (tier === 'large') {
      const probableX = g.nextSpawnAt + APPROACH_BUFFER_LRG + g.cw * 0.105 / 2
      const surfaceAtRock = seaSurfaceY(probableX, g.ch, g.scrollX)
      const baseY = g.ch * SEA_BASE_Y_PCT
      if (surfaceAtRock < baseY - g.ch * 0.015) {
        tier = 'medium'
      }
    }
    g.lastHazardTier = tier

    let height: number, width: number
    if (tier === 'small') {
      height = g.ch * 0.035
      width = g.cw * 0.06
    } else if (tier === 'medium') {
      height = g.ch * 0.075
      width = g.cw * 0.085
    } else {
      height = g.ch * 0.115
      width = g.cw * 0.105
    }

    // Spacing scales with current speed past a threshold so the time between
    // hazards never drops below MIN_REACTION_TIME_SEC. At low speeds, the
    // fixed world-px constants govern; at high speeds, time-based floors take over.
    const baseSpacing = Math.max(HAZARD_SPAWN_SPACING, g.speed * MIN_REACTION_TIME_SEC)
    const medBuffer = Math.max(APPROACH_BUFFER_MED, g.speed * MED_EXTRA_TIME_SEC)
    const lrgBuffer = Math.max(APPROACH_BUFFER_LRG, g.speed * LRG_EXTRA_TIME_SEC)

    // Push this hazard further out if it's a hard one — gives reaction time
    if (tier === 'medium') g.nextSpawnAt += medBuffer
    else if (tier === 'large') g.nextSpawnAt += lrgBuffer

    const hazardX = g.nextSpawnAt
    g.hazards.push({ x: hazardX, width, height })
    g.nextSpawnAt += baseSpacing

    // Maybe drop a current in the gap before the NEXT hazard.
    // Place it well clear of both this hazard and the next so it never overlaps.
    if (distance > CURRENT_WARMUP_M && Math.random() < CURRENT_CHANCE) {
      const cw = g.cw * (CURRENT_WIDTH_MIN + Math.random() * (CURRENT_WIDTH_MAX - CURRENT_WIDTH_MIN))
      const gapStart = hazardX + width + g.cw * 0.05         // 5% of cw past this hazard
      const gapEnd = g.nextSpawnAt - g.cw * 0.05              // 5% of cw before next hazard
      if (gapEnd - gapStart > cw) {
        const cx = gapStart + Math.random() * (gapEnd - gapStart - cw)
        g.currents.push({ x: cx, width: cw })
      }
    }
  }, [])

  // ── Surface hazard collision ──────────────────────────────────────────────
  // The drawn rock has a wider base (the anchor flare) and a much narrower
  // spike above the surface. Use only the visible spike's x-range for
  // collision so grazing past the visual edges doesn't trigger a death.
  const ROCK_COLLISION_LEFT_PCT  = 0.22  // % of width before collision starts
  const ROCK_COLLISION_RIGHT_PCT = 0.18  // % of width past which no collision

  const collidesWithHazard = useCallback((shipScreenX: number) => {
    const g = gRef.current
    const hx = shipScreenX + g.shipW * HITBOX_INSET.left
    const hy = g.shipY + g.shipH * HITBOX_INSET.top
    const hw = g.shipW * (1 - HITBOX_INSET.left - HITBOX_INSET.right)
    const hbot = hy + g.shipH * (1 - HITBOX_INSET.bottom - HITBOX_INSET.top)

    for (const obs of g.hazards) {
      const colLeft = obs.x + obs.width * ROCK_COLLISION_LEFT_PCT
      const colRight = obs.x + obs.width * (1 - ROCK_COLLISION_RIGHT_PCT)
      const ox = colLeft - g.scrollX
      const cw = colRight - colLeft
      if (ox + cw < hx) continue
      if (ox > hx + hw) break
      const hazardSurfaceY = seaSurfaceY(obs.x + obs.width / 2, g.ch, g.scrollX)
      const hazardTop = hazardSurfaceY - obs.height
      // Collide if boat's hitbox bottom is below hazard's top
      if (hbot > hazardTop) return true
    }
    return false
  }, [])

  // ── Step ──────────────────────────────────────────────────────────────────
  const step = useCallback((dt: number) => {
    const g = gRef.current
    if (g.state !== 'playing') return

    g.elapsed += dt
    g.speed = Math.min(BASE_SPEED + SPEED_RAMP * g.elapsed, MAX_SPEED)

    const shipScreenX = g.cw * SHIP_X_RATIO
    const cx = shipScreenX + g.shipW / 2

    // Effective scroll speed eases in/out of currents — asymmetric so the boat
    // gets grabbed fast but re-accelerates gradually (water resistance).
    let targetMult = 1
    if (!g.airborne) {
      const boatWorldX = shipScreenX + g.scrollX
      for (const c of g.currents) {
        if (boatWorldX >= c.x && boatWorldX <= c.x + c.width) {
          targetMult = CURRENT_SPEED_MULT
          break
        }
      }
    }
    const rate = targetMult < g.speedMult ? CURRENT_ENTER_RATE : CURRENT_EXIT_RATE
    const k = 1 - Math.exp(-rate * dt)
    g.speedMult += (targetMult - g.speedMult) * k
    g.scrollX += g.speed * g.speedMult * dt
    g.distance = g.scrollX * METERS_PER_PIXEL

    const surfaceY = seaSurfaceY(cx + g.scrollX, g.ch, g.scrollX)

    if (g.airborne) {
      // Variable-height jump: reduced gravity while the player is holding,
      // up to JUMP_MAX_HOLD_SEC and only while still rising.
      let gravityNow = GRAVITY
      if (g.holding && g.shipVy < 0) {
        const heldFor = (performance.now() - g.jumpHoldStart) / 1000
        if (heldFor < JUMP_MAX_HOLD_SEC) {
          gravityNow = GRAVITY * JUMP_HOLD_GRAVITY_MULT
        } else {
          g.holding = false
        }
      }
      g.shipVy += gravityNow * dt
      g.shipY += g.shipVy * dt

      // Land when falling onto surface
      if (g.shipVy >= 0) {
        const hitboxBottom = g.shipY + g.shipH * (1 - HITBOX_INSET.bottom)
        if (hitboxBottom >= surfaceY) {
          g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
          g.shipVy = 0
          g.airborne = false
          // Holding through a landing doesn't auto-jump; require a release+press
          g.holding = false
        }
      }
    } else {
      // Grounded — locked to wave surface (Canabalt-style auto-run)
      g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
      g.shipVy = 0
    }

    // Hazard spawn + prune
    while (g.nextSpawnAt < g.scrollX + g.cw * 1.05) spawnHazard()
    while (g.hazards.length > 0 && g.hazards[0].x + g.hazards[0].width < g.scrollX) {
      g.hazards.shift()
    }
    while (g.currents.length > 0 && g.currents[0].x + g.currents[0].width < g.scrollX) {
      g.currents.shift()
    }

    // Death check — only surface hazards (the sea itself is just a floor now)
    let dead = false
    if (collidesWithHazard(shipScreenX)) dead = true

    if (dead) {
      g.state = 'dead'
      g.deathFlashUntil = performance.now() + 250
      const finalMeters = Math.floor(g.distance)
      setScore(finalMeters)
      setUiState('dead')
      if (finalMeters > highScore) {
        setHighScore(finalMeters)
        if (typeof window !== 'undefined') window.localStorage.setItem(HIGH_SCORE_KEY, String(finalMeters))
      }
    } else {
      const now = performance.now()
      if (now - g.lastScoreUpdate > 180) {
        g.lastScoreUpdate = now
        setScore(Math.floor(g.distance))
      }
    }
  }, [spawnHazard, collidesWithHazard, highScore])

  // ── Render ─────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = gRef.current
    const { cw, ch } = g
    if (cw === 0 || ch === 0) return

    // ── Sky (full canvas — sea path will overpaint below the surface) ──
    const sky = ctx.createLinearGradient(0, 0, 0, ch)
    sky.addColorStop(0, '#5da7d4')
    sky.addColorStop(0.7, '#a8d4ec')
    sky.addColorStop(1, '#a8d4ec')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cw, ch)

    // ── Parallax: distant clouds (40% scroll speed) ──
    drawClouds(ctx, cw, ch, g.scrollX * 0.40)
    // ── Parallax: distant islands at the horizon (15% scroll speed) ──
    drawDistantIslands(ctx, cw, ch, g.scrollX * 0.15)

    // ── Dynamic sea surface ──
    ctx.beginPath()
    ctx.moveTo(0, ch)
    for (let x = 0; x <= cw; x += 4) {
      ctx.lineTo(x, seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }
    ctx.lineTo(cw, ch)
    ctx.closePath()
    const sea = ctx.createLinearGradient(0, ch * SEA_BASE_Y_PCT - 30, 0, ch)
    sea.addColorStop(0, '#1f5b80')
    sea.addColorStop(0.5, '#0e3a5c')
    sea.addColorStop(1, '#03182a')
    ctx.fillStyle = sea
    ctx.fill()

    // ── Foam crest ──
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= cw; x += 4) {
      const y = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // ── Current zones (foam patches on the surface) ──
    for (const c of g.currents) {
      const ox = c.x - g.scrollX
      if (ox + c.width < 0 || ox > cw) continue
      drawCurrent(ctx, ox, c.width, g.scrollX, (x) => seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }

    // ── Telegraph: fade-in warnings at the right edge for upcoming hazards ──
    // (Drawn behind hazards so the live rock takes precedence as it scrolls in.)
    const telegraphDist = g.speed * TELEGRAPH_TIME_SEC
    for (const obs of g.hazards) {
      const ox = obs.x - g.scrollX
      if (ox <= cw) continue                                  // already on or past screen
      if (ox - cw > telegraphDist) continue                   // too far ahead
      const t = (ox - cw) / telegraphDist                     // 0 = just entering, 1 = far
      const alpha = (1 - t) * TELEGRAPH_MAX_ALPHA
      const surfaceAtRight = seaSurfaceY(cw + g.scrollX, ch, g.scrollX)
      drawTelegraph(ctx, cw, surfaceAtRight, obs.height, alpha)
    }

    // ── Surface hazards (rocks bobbing on the wave) ──
    for (const obs of g.hazards) {
      const ox = obs.x - g.scrollX
      if (ox + obs.width < 0 || ox > cw) continue
      const surfaceAtHazard = seaSurfaceY(obs.x + obs.width / 2, ch, g.scrollX)
      drawHazard(ctx, ox, surfaceAtHazard, obs.width, obs.height)
    }

    // ── Ship ──
    const img = shipImgRef.current
    if (img && img.complete) {
      const shipX = cw * SHIP_X_RATIO
      let pitch = 0
      if (g.airborne) {
        // Asymmetric: rise tilts up more than fall tilts down (less aggressive nose-dive)
        const raw = g.shipVy * 0.00055
        pitch = Math.max(-0.40, Math.min(0.28, raw))
      } else {
        // Pitch to wave slope at ship center
        const cx = shipX + g.shipW / 2 + g.scrollX
        const dx = 10
        const dy = seaSurfaceY(cx + dx, ch, g.scrollX) - seaSurfaceY(cx - dx, ch, g.scrollX)
        pitch = Math.atan2(dy, dx * 2)
      }
      ctx.save()
      ctx.translate(shipX + g.shipW / 2, g.shipY + g.shipH / 2)
      ctx.rotate(pitch)
      ctx.drawImage(img, -g.shipW / 2, -g.shipH / 2, g.shipW, g.shipH)
      ctx.restore()
    }

    // ── Collision flash ──
    if (g.state === 'dead' && performance.now() < g.deathFlashUntil) {
      ctx.fillStyle = 'rgba(255, 240, 220, 0.6)'
      ctx.fillRect(0, 0, cw, ch)
    }
  }, [])

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (ts: number) => {
      const last = lastTsRef.current
      const dt = last === 0 ? 0 : Math.min((ts - last) / 1000, 0.05)
      lastTsRef.current = ts
      step(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [step, render])

  // ── Pause on tab hide ──────────────────────────────────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) lastTsRef.current = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ── Render UI ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link href="/expeditions" className="font-karla font-700 text-sm" style={{ color: '#bda05a' }}>
          ← Expeditions
        </Link>
        <p className="font-cinzel font-700 text-base" style={{ color: '#f0ede8' }}>Tide Run</p>
        <div style={{ width: 84 }} />
      </div>

      <div
        ref={wrapperRef}
        onPointerDown={(e) => { e.preventDefault(); onPress() }}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        onPointerLeave={onRelease}
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '9 / 14',
          background: '#062840',
          border: '1px solid rgba(255,255,255,0.10)',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

        {uiState === 'playing' && (
          <>
            <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
              <p className="font-cinzel font-700" style={{
                fontSize: '2.2rem',
                color: '#ffffff',
                textShadow: '0 2px 8px rgba(0,0,0,0.55)',
                letterSpacing: '0.02em',
              }}>
                {score}<span style={{ fontSize: '1rem', marginLeft: 4, opacity: 0.75 }}>m</span>
              </p>
            </div>
            {highScore > 0 && (
              <div className="absolute top-3 right-3 pointer-events-none text-right">
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{
                  fontSize: '0.55rem',
                  color: 'rgba(255,255,255,0.65)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  lineHeight: 1,
                }}>
                  Best
                </p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '0.95rem',
                  color: score > highScore ? '#ffd56b' : 'rgba(255,255,255,0.85)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  lineHeight: 1.1,
                  marginTop: 2,
                }}>
                  {Math.max(score, highScore)}<span style={{ fontSize: '0.6rem', marginLeft: 2, opacity: 0.7 }}>m</span>
                </p>
              </div>
            )}
          </>
        )}

        {uiState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1.6rem', color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.55)' }}>
              Tide Run
            </p>
            <p className="font-karla font-300 mb-5" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', maxWidth: 260 }}>
              Hold to jump. The longer you hold, the higher you go. Time it for the rock ahead.
            </p>
            <div className="font-karla font-700 uppercase tracking-[0.18em]" style={{
              fontSize: '0.72rem',
              color: '#bda05a',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(189,160,90,0.55)',
            }}>
              Tap to start
            </div>
            {highScore > 0 && (
              <p className="font-karla font-700 mt-5" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>
                Best: {highScore}m
              </p>
            )}
          </div>
        )}

        {uiState === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <div style={{
              padding: '18px 26px',
              borderRadius: 16,
              background: 'rgba(6, 18, 34, 0.86)',
              border: '1px solid rgba(189,160,90,0.5)',
              backdropFilter: 'blur(6px)',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.65rem', color: '#bda05a', marginBottom: 6 }}>
                Wrecked
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '2.4rem', color: '#ffffff', lineHeight: 1 }}>
                {score}<span style={{ fontSize: '1rem', marginLeft: 4, opacity: 0.75 }}>m</span>
              </p>
              <p className="font-karla font-300 mt-2" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                {score === highScore && score > 0 ? 'New best!' : `Best ${highScore}m`}
              </p>
              <p className="font-karla font-700 uppercase tracking-[0.18em] mt-4" style={{ fontSize: '0.7rem', color: '#bda05a' }}>
                Tap to retry
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
// Hazard: jagged rock sticking up out of the water surface.
// `surfaceY` is the water line at the hazard's x; `h` is how far above the water.
function drawHazard(ctx: CanvasRenderingContext2D, x: number, surfaceY: number, w: number, h: number) {
  const top = surfaceY - h
  const g = ctx.createLinearGradient(x, top, x, surfaceY)
  g.addColorStop(0, '#54453a')
  g.addColorStop(0.55, '#33271f')
  g.addColorStop(1, '#1a1410')
  ctx.fillStyle = g
  ctx.beginPath()
  // Anchor below the surface so the rock looks rooted in the water
  ctx.moveTo(x, surfaceY + h * 0.3)
  ctx.lineTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.lineTo(x + w * 0.74, top + h * 0.05)
  ctx.lineTo(x + w * 0.9,  top + h * 0.30)
  ctx.lineTo(x + w,        surfaceY + h * 0.3)
  ctx.closePath()
  ctx.fill()
  // Edge highlight on the lit side
  ctx.strokeStyle = 'rgba(255, 235, 200, 0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.stroke()
  // Tiny foam ring where rock meets water
  ctx.strokeStyle = 'rgba(230, 245, 255, 0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - w * 0.05, surfaceY)
  ctx.bezierCurveTo(x + w * 0.3, surfaceY - 1.5, x + w * 0.7, surfaceY - 1.5, x + w * 1.05, surfaceY)
  ctx.stroke()
}

// Current: a flat patch of foamy/churning water on the surface. Boat slows
// down while grounded inside it; jump over to skip.
function drawCurrent(
  ctx: CanvasRenderingContext2D,
  x: number, width: number,
  scrollX: number,
  surfaceAt: (screenX: number) => number,
) {
  // Lighter water tint to read as a distinct zone
  ctx.save()
  ctx.fillStyle = 'rgba(180, 220, 240, 0.20)'
  ctx.beginPath()
  for (let dx = 0; dx <= width; dx += 4) {
    const sx = x + dx
    const sy = surfaceAt(sx)
    if (dx === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  for (let dx = width; dx >= 0; dx -= 4) {
    const sx = x + dx
    ctx.lineTo(sx, surfaceAt(sx) + 9)
  }
  ctx.closePath()
  ctx.fill()

  // Animated foam streaks (use scrollX as phase so foam appears to swirl)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
  ctx.lineWidth = 1.4
  const streakCount = Math.max(3, Math.floor(width / 26))
  for (let i = 0; i < streakCount; i++) {
    const baseX = x + (i + 0.5) * (width / streakCount)
    const phase = (scrollX * 0.6 + i * 80) * 0.025
    const yOff = Math.sin(phase) * 2.5
    const sy = surfaceAt(baseX)
    ctx.beginPath()
    ctx.moveTo(baseX - 6, sy + yOff + 1)
    ctx.quadraticCurveTo(baseX, sy + yOff - 2, baseX + 6, sy + yOff + 1)
    ctx.stroke()
  }

  // Edge chevrons signalling the slow-zone direction
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1.2
  const drawChevron = (cx: number) => {
    const sy = surfaceAt(cx) - 4
    ctx.beginPath()
    ctx.moveTo(cx - 4, sy)
    ctx.lineTo(cx, sy + 4)
    ctx.lineTo(cx + 4, sy)
    ctx.stroke()
  }
  drawChevron(x + 8)
  drawChevron(x + width - 8)
  ctx.restore()
}

// Distant islands silhouetted at the horizon, parallax-scrolled slow.
function drawDistantIslands(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number) {
  ctx.fillStyle = 'rgba(70, 100, 140, 0.32)'
  const period = cw * 1.4
  const offset = ((scrollOffset % period) + period) % period
  const horizon = ch * 0.66
  for (let i = -1; i <= 2; i++) {
    const ix = i * period - offset
    // Two soft hills per period
    ctx.beginPath()
    ctx.moveTo(ix, horizon + 4)
    ctx.bezierCurveTo(ix + period * 0.15, horizon - 18, ix + period * 0.35, horizon - 22, ix + period * 0.5, horizon + 4)
    ctx.lineTo(ix + period * 0.5, horizon + 4)
    ctx.bezierCurveTo(ix + period * 0.6, horizon - 10, ix + period * 0.85, horizon - 14, ix + period, horizon + 4)
    ctx.closePath()
    ctx.fill()
  }
}

// Wispy clouds drifting at mid speed.
function drawClouds(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)'
  const period = cw * 1.1
  const offset = ((scrollOffset % period) + period) % period
  const cloudYs = [ch * 0.10, ch * 0.18, ch * 0.28]
  const cloudXs = [0.15, 0.45, 0.78]
  for (let i = -1; i <= 2; i++) {
    const ix = i * period - offset
    for (let j = 0; j < cloudXs.length; j++) {
      const cx = ix + cloudXs[j] * period
      const cy = cloudYs[j]
      const r = (j === 1 ? 14 : 11)
      ctx.beginPath()
      ctx.ellipse(cx,       cy,       r * 1.6, r * 0.55, 0, 0, Math.PI * 2)
      ctx.ellipse(cx - r,   cy + 2,   r * 1.1, r * 0.45, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + r,   cy + 2,   r * 1.0, r * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// Telegraph: a fading vertical bar at the right edge of the canvas
// previewing the height of an upcoming rock.
function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  rightX: number, surfaceY: number,
  hazardHeight: number, alpha: number,
) {
  const top = surfaceY - hazardHeight
  const barW = 6
  const barX = rightX - barW - 2
  ctx.save()
  ctx.globalAlpha = alpha
  const g = ctx.createLinearGradient(barX, top, barX, surfaceY)
  g.addColorStop(0, '#5a4a3a')
  g.addColorStop(1, '#1a1410')
  ctx.fillStyle = g
  ctx.fillRect(barX, top, barW, hazardHeight)
  // Small chevron pointing left to signal "incoming"
  ctx.fillStyle = 'rgba(255, 200, 130, 0.9)'
  ctx.beginPath()
  ctx.moveTo(barX - 2, top + hazardHeight * 0.5)
  ctx.lineTo(barX + 3, top + hazardHeight * 0.5 - 4)
  ctx.lineTo(barX + 3, top + hazardHeight * 0.5 + 4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
