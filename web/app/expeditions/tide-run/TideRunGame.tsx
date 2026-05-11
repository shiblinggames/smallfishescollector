'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Tunable constants ────────────────────────────────────────────────────────
const SHIP_X_RATIO    = 0.24
const SHIP_HEIGHT_PCT = 0.14   // ship height as fraction of canvas height
const SHIP_ASPECT     = 1031 / 672   // trimmed boatrun.png

// Ship physics
const GRAVITY      = 1900      // px/s² (only applies when airborne)
const TAP_IMPULSE  = -560      // px/s (negative = upward)
const BASE_SPEED   = 240       // px/s horizontal scroll
const SPEED_RAMP   = 13        // px/s² (linear time ramp)
const MAX_SPEED    = 600       // px/s

// Sea surface — multi-sine in world space, amplitude ramps with distance
const SEA_BASE_Y_PCT      = 0.80   // mean sea level (% of canvas height)
const WAVE_PRIMARY_PERIOD = 300
const WAVE_PRIMARY_AMP    = 18
const WAVE_SECONDARY_PERIOD = 115
const WAVE_SECONDARY_AMP  = 8
const WAVE_TERTIARY_PERIOD = 520
const WAVE_TERTIARY_AMP   = 12
const WAVE_AMP_RAMP_DISTANCE = 8000
const WAVE_AMP_RAMP_MAX   = 1.55   // peak amplitude multiplier

// Spire spawning
const SPAWN_SPACING   = 260
const SPIRE_MIN_HEIGHT_PCT = 0.08
const SPIRE_MAX_HEIGHT_PCT = 0.36

// Hitbox inset on the trimmed sprite
const HITBOX_INSET = { top: 0.35, right: 0.12, bottom: 0.08, left: 0.08 }

const METERS_PER_PIXEL = 1 / 60
const HIGH_SCORE_KEY = 'tide-run-best'

// ── Types ────────────────────────────────────────────────────────────────────
type GameState = 'ready' | 'playing' | 'dead'

interface Spire {
  x: number          // world x (left edge)
  width: number
  height: number     // hangs down from y=0
}

// ── Sea surface helper ───────────────────────────────────────────────────────
function seaSurfaceY(worldX: number, ch: number, distanceScrolled: number): number {
  const ramp = 1 + Math.min(distanceScrolled / WAVE_AMP_RAMP_DISTANCE, 1) * (WAVE_AMP_RAMP_MAX - 1)
  const TAU = Math.PI * 2
  const w1 = Math.sin(worldX / WAVE_PRIMARY_PERIOD * TAU) * WAVE_PRIMARY_AMP
  const w2 = Math.sin(worldX / WAVE_SECONDARY_PERIOD * TAU + 1.3) * WAVE_SECONDARY_AMP
  const w3 = Math.sin(worldX / WAVE_TERTIARY_PERIOD * TAU - 0.6) * WAVE_TERTIARY_AMP
  return ch * SEA_BASE_Y_PCT - (w1 + w2 + w3) * ramp
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
    airborne: true,
    scrollX: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    spires: [] as Spire[],
    nextSpawnAt: 0,
    distance: 0,
    deathFlashUntil: 0,
    lastScoreUpdate: 0,
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
    g.spires = []
    g.nextSpawnAt = g.cw * 1.6       // ~2.5s grace before first spire at base speed
    g.distance = 0
    g.deathFlashUntil = 0
    g.lastScoreUpdate = 0
    g.shipVy = 0
    g.airborne = false
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
      g.shipVy = TAP_IMPULSE
      g.airborne = true
      setUiState('playing')
      setScore(0)
    } else if (g.state === 'playing') {
      g.shipVy = TAP_IMPULSE
      g.airborne = true
    } else if (g.state === 'dead') {
      if (performance.now() < g.deathFlashUntil + 350) return
      reset()
      g.state = 'playing'
      g.shipVy = TAP_IMPULSE
      g.airborne = true
      setUiState('playing')
      setScore(0)
    }
  }, [reset])

  // ── Spawn one spire ────────────────────────────────────────────────────────
  const spawnSpire = useCallback(() => {
    const g = gRef.current
    const minH = g.ch * SPIRE_MIN_HEIGHT_PCT
    const maxH = g.ch * SPIRE_MAX_HEIGHT_PCT
    g.spires.push({
      x: g.nextSpawnAt,
      width: g.cw * 0.13,
      height: minH + Math.random() * (maxH - minH),
    })
    g.nextSpawnAt += SPAWN_SPACING
  }, [])

  // ── Spire collision (sea is handled by airborne/grounded landing) ──────────
  const collidesWithSpire = useCallback((shipScreenX: number) => {
    const g = gRef.current
    const hx = shipScreenX + g.shipW * HITBOX_INSET.left
    const hy = g.shipY + g.shipH * HITBOX_INSET.top
    const hw = g.shipW * (1 - HITBOX_INSET.left - HITBOX_INSET.right)

    for (const s of g.spires) {
      const ox = s.x - g.scrollX
      if (ox + s.width < hx) continue
      if (ox > hx + hw) break
      if (hy < s.height) return true
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

    if (g.airborne) {
      // Free-fall physics
      g.shipVy += GRAVITY * dt
      g.shipY += g.shipVy * dt

      // Land check — sample wave surface across hitbox width
      if (g.shipVy >= 0) {
        const hitboxLeft = shipScreenX + g.shipW * HITBOX_INSET.left
        const hitboxRight = shipScreenX + g.shipW * (1 - HITBOX_INSET.right)
        let highestSurface = Infinity  // smallest y = highest wave crest
        for (let i = 0; i <= 4; i++) {
          const sx = hitboxLeft + (hitboxRight - hitboxLeft) * (i / 4)
          const wy = seaSurfaceY(sx + g.scrollX, g.ch, g.scrollX)
          if (wy < highestSurface) highestSurface = wy
        }
        const hitboxBottom = g.shipY + g.shipH * (1 - HITBOX_INSET.bottom)
        if (hitboxBottom >= highestSurface) {
          g.airborne = false
          g.shipVy = 0
          g.shipY = highestSurface - g.shipH * (1 - HITBOX_INSET.bottom)
        }
      }
    } else {
      // Grounded — locked to surface
      const wy = seaSurfaceY(cx + g.scrollX, g.ch, g.scrollX)
      g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
    }

    // Spire spawn + prune
    while (g.nextSpawnAt < g.scrollX + g.cw * 1.05) spawnSpire()
    while (g.spires.length > 0 && g.spires[0].x + g.spires[0].width < g.scrollX) {
      g.spires.shift()
    }

    // Death checks
    const hitboxTop = g.shipY + g.shipH * HITBOX_INSET.top
    let dead = false
    if (hitboxTop < 0) dead = true                                // flew off the top
    else if (collidesWithSpire(shipScreenX)) dead = true          // hit a spire

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
  }, [spawnSpire, collidesWithSpire, highScore])

  // ── Render ─────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = gRef.current
    const { cw, ch } = g
    if (cw === 0 || ch === 0) return

    // ── Sky ──
    const sky = ctx.createLinearGradient(0, 0, 0, ch * 0.7)
    sky.addColorStop(0, '#5da7d4')
    sky.addColorStop(1, '#a8d4ec')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cw, ch * 0.7)

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

    // ── Spires ──
    for (const s of g.spires) {
      const ox = s.x - g.scrollX
      if (ox + s.width < 0 || ox > cw) continue
      drawSpire(ctx, ox, 0, s.width, s.height)
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
              Ride the swell. Tap to leap off a crest and clear the spires.
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
function drawSpire(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#1a1410')
  g.addColorStop(0.6, '#3a3128')
  g.addColorStop(1, '#5a4a3a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w * 0.88, y + h)
  ctx.lineTo(x + w * 0.68, y + h - h * 0.22)
  ctx.lineTo(x + w * 0.50, y + h)
  ctx.lineTo(x + w * 0.30, y + h - h * 0.16)
  ctx.lineTo(x + w * 0.12, y + h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
}
