'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Tunable constants ────────────────────────────────────────────────────────
const SHIP_X_RATIO    = 0.24
const SHIP_HEIGHT_PCT = 0.14   // ship height as fraction of canvas height
const SHIP_ASPECT     = 1031 / 672   // trimmed boatrun.png

// Ship physics — Tiny Wings ramp feel. Boat rides the swell, builds upward
// velocity on the up-slope, and gets flung off at the crest with that exact
// momentum (scaled by WAVE_LIFT_FACTOR). Big waves → big air. Small waves →
// little hops. No artificial minimum.
const GRAVITY            = 1300  // px/s² (in-air pulldown)
const TAP_DIVE           = 760   // px/s downward impulse on tap (player-controlled descent)
const WAVE_LIFT_FACTOR   = 1.55  // launch magnitude = peak up-slope vy × this
const MAX_LAUNCH         = 800   // hard cap so max-speed launches stay on screen
const BASE_SPEED         = 240   // px/s horizontal scroll
const SPEED_RAMP         = 13    // px/s² (linear time ramp)
const MAX_SPEED          = 580   // px/s

// Sea surface — long-period sines for smooth rolling hills (Tiny Wings feel)
const SEA_BASE_Y_PCT      = 0.74   // mean sea level (% of canvas height)
const WAVE_PRIMARY_PERIOD = 440
const WAVE_PRIMARY_AMP    = 28
const WAVE_SECONDARY_PERIOD = 760  // very long swell, no high-frequency chop
const WAVE_SECONDARY_AMP  = 14
const WAVE_AMP_RAMP_DISTANCE = 6000
const WAVE_AMP_RAMP_MAX   = 1.45   // peak amplitude multiplier

// Surface hazards — rocks/spikes poking out of the water. Boat clears them
// by being airborne when crossing. Player times taps to control descent.
const HAZARD_SPAWN_SPACING = 360   // world px between hazards
const HAZARD_WARMUP        = 1200  // world px before the first hazard spawns
const HAZARD_WIDTH_PCT     = 0.085 // % of canvas width
const HAZARD_HEIGHT_PCT    = 0.05  // % of canvas height above the surface

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
    nextSpawnAt: 0,
    distance: 0,
    deathFlashUntil: 0,
    lastScoreUpdate: 0,
    lastSlope: 0,    // previous frame's surface slope — used to detect crest crossings
    maxUpslope: 0,   // peak |surfaceVy| since last trough; consumed at crest crossing
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
    g.nextSpawnAt = HAZARD_WARMUP
    g.distance = 0
    g.deathFlashUntil = 0
    g.lastScoreUpdate = 0
    g.shipVy = 0
    g.airborne = false
    g.lastSlope = 0
    g.maxUpslope = 0
    // Land ship on the sea at its screen x
    const cx = g.cw * SHIP_X_RATIO + g.shipW / 2
    const wy = seaSurfaceY(cx + g.scrollX, g.ch, 0)
    g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
  }, [])

  // ── Tap handler ────────────────────────────────────────────────────────────
  const onTap = useCallback(() => {
    const g = gRef.current
    if (g.state === 'ready') {
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
    } else if (g.state === 'playing') {
      // Dive impulse — only matters when airborne; grounded snap will override
      g.shipVy += TAP_DIVE
    } else if (g.state === 'dead') {
      if (performance.now() < g.deathFlashUntil + 350) return
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
    }
  }, [reset])

  // ── Spawn one surface hazard ──────────────────────────────────────────────
  const spawnHazard = useCallback(() => {
    const g = gRef.current
    g.hazards.push({
      x: g.nextSpawnAt,
      width: g.cw * HAZARD_WIDTH_PCT,
      height: g.ch * HAZARD_HEIGHT_PCT,
    })
    g.nextSpawnAt += HAZARD_SPAWN_SPACING
  }, [])

  // ── Surface hazard collision ──────────────────────────────────────────────
  const collidesWithHazard = useCallback((shipScreenX: number) => {
    const g = gRef.current
    const hx = shipScreenX + g.shipW * HITBOX_INSET.left
    const hy = g.shipY + g.shipH * HITBOX_INSET.top
    const hw = g.shipW * (1 - HITBOX_INSET.left - HITBOX_INSET.right)
    const hbot = hy + g.shipH * (1 - HITBOX_INSET.bottom - HITBOX_INSET.top)

    for (const obs of g.hazards) {
      const ox = obs.x - g.scrollX
      if (ox + obs.width < hx) continue
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
    g.scrollX += g.speed * dt
    g.distance = g.scrollX * METERS_PER_PIXEL

    const shipScreenX = g.cw * SHIP_X_RATIO
    const cx = shipScreenX + g.shipW / 2
    const surfaceY = seaSurfaceY(cx + g.scrollX, g.ch, g.scrollX)

    // Slope at boat (positive = surface descending forward, negative = ascending)
    const dx = 5
    const slope = (seaSurfaceY(cx + g.scrollX + dx, g.ch, g.scrollX) - seaSurfaceY(cx + g.scrollX - dx, g.ch, g.scrollX)) / (dx * 2)

    if (g.airborne) {
      // In the air: gravity + tap impulse (already added to shipVy)
      g.shipVy += GRAVITY * dt
      g.shipY += g.shipVy * dt

      // Land when falling onto surface
      if (g.shipVy >= 0) {
        const hitboxBottom = g.shipY + g.shipH * (1 - HITBOX_INSET.bottom)
        if (hitboxBottom >= surfaceY) {
          g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
          g.shipVy = 0
          g.airborne = false
        }
      }
    } else {
      // Grounded: locked to surface
      g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
      g.shipVy = 0

      // Track peak upward surface velocity during the current up-slope; this is
      // the momentum the boat carries off the next crest.
      if (slope < 0) {
        const upVy = -slope * g.speed
        if (upVy > g.maxUpslope) g.maxUpslope = upVy
      }

      // Crest crossing — slope flipped from negative (ascending) to positive
      if (g.lastSlope < 0 && slope >= 0) {
        const launchMag = Math.min(MAX_LAUNCH, g.maxUpslope * WAVE_LIFT_FACTOR)
        g.maxUpslope = 0
        if (launchMag > 1) {
          g.shipVy = -launchMag
          g.airborne = true
        }
      }
    }

    g.lastSlope = slope

    // Hazard spawn + prune
    while (g.nextSpawnAt < g.scrollX + g.cw * 1.05) spawnHazard()
    while (g.hazards.length > 0 && g.hazards[0].x + g.hazards[0].width < g.scrollX) {
      g.hazards.shift()
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
        pitch = Math.max(-0.4, Math.min(0.6, g.shipVy * 0.0008))
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
        onPointerDown={(e) => { e.preventDefault(); onTap() }}
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
        )}

        {uiState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1.6rem', color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.55)' }}>
              Tide Run
            </p>
            <p className="font-karla font-300 mb-5" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', maxWidth: 260 }}>
              Every crest launches you skyward. Tap to dive faster and land between the rocks.
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
