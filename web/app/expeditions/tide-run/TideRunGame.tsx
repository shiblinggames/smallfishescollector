'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

// ── Tunable constants ────────────────────────────────────────────────────────
const SHIP_X_RATIO    = 0.24
const SHIP_HEIGHT_PCT = 0.14   // ship height as fraction of canvas height
const SHIP_ASPECT     = 1031 / 672   // trimmed boatrun.png

const GRAVITY      = 1900      // px/s²
const TAP_IMPULSE  = -560      // px/s (negative = upward)
const BASE_SPEED   = 230       // px/s horizontal scroll
const SPEED_RAMP   = 14        // px/s² (linear ramp)
const MAX_SPEED    = 620       // px/s

const SPAWN_SPACING = 240      // world px between obstacle centers
const MAX_GAP       = 290      // starting vertical gap (paired obstacles)
const MIN_GAP       = 165      // narrowed gap floor
const GAP_NARROW_DISTANCE = 12000  // world px to narrow from MAX → MIN

const PAIR_PROBABILITY_START = 0.18  // pair frequency at start
const PAIR_PROBABILITY_MAX   = 0.45  // pair frequency once ramped
const PAIR_RAMP_DISTANCE     = 8000

// Hitbox inset on the trimmed sprite (top / right / bottom / left as fractions)
const HITBOX_INSET = { top: 0.35, right: 0.12, bottom: 0.08, left: 0.08 }

const METERS_PER_PIXEL = 1 / 60
const HIGH_SCORE_KEY = 'tide-run-best'

// ── Types ────────────────────────────────────────────────────────────────────
type GameState = 'ready' | 'playing' | 'dead'
type ObstacleType = 'wave' | 'spire' | 'pair'

interface Obstacle {
  x: number              // world x (left edge)
  width: number
  type: ObstacleType
  topHeight: number      // 0 if no spire
  botHeight: number      // 0 if no wave
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
    scrollX: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    obstacles: [] as Obstacle[],
    nextSpawnAt: 0,
    distance: 0,        // meters
    deathFlashUntil: 0, // timestamp for collision flash
    lastScoreUpdate: 0, // timestamp of last React score state update
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
      g.shipY = rect.height * 0.45
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
    g.shipY = g.ch * 0.45
    g.shipVy = 0
    g.scrollX = 0
    g.speed = BASE_SPEED
    g.elapsed = 0
    g.obstacles = []
    g.nextSpawnAt = g.cw * 1.6  // ~2.5s grace before first obstacle at base speed
    g.distance = 0
    g.deathFlashUntil = 0
    g.lastScoreUpdate = 0
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
      g.shipVy = TAP_IMPULSE
    } else if (g.state === 'dead') {
      // Brief grace period so you don't accidentally restart from a death tap
      if (performance.now() < g.deathFlashUntil + 350) return
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
    }
  }, [reset])

  // ── Spawn an obstacle pair/single at the right edge ────────────────────────
  const spawn = useCallback(() => {
    const g = gRef.current

    // Gap narrows linearly with distance scrolled
    const gapProgress = Math.min(g.scrollX / GAP_NARROW_DISTANCE, 1)
    const currentGap = MAX_GAP + (MIN_GAP - MAX_GAP) * gapProgress

    // Pair probability ramps up early
    const pairProgress = Math.min(g.scrollX / PAIR_RAMP_DISTANCE, 1)
    const pairChance = PAIR_PROBABILITY_START + (PAIR_PROBABILITY_MAX - PAIR_PROBABILITY_START) * pairProgress

    const obstacleWidth = g.cw * 0.13

    let obs: Obstacle
    const r = Math.random()
    if (r < pairChance) {
      // Paired top spire + bottom wave with a gap
      const totalAvailable = g.ch - currentGap
      const topH = totalAvailable * (0.25 + Math.random() * 0.5)
      const botH = totalAvailable - topH
      obs = {
        x: g.nextSpawnAt,
        width: obstacleWidth,
        type: 'pair',
        topHeight: topH,
        botHeight: botH,
      }
    } else if (Math.random() < 0.5) {
      // Single bottom wave
      const minH = g.ch * 0.10
      const maxH = g.ch * 0.42
      obs = {
        x: g.nextSpawnAt,
        width: obstacleWidth,
        type: 'wave',
        topHeight: 0,
        botHeight: minH + Math.random() * (maxH - minH),
      }
    } else {
      // Single top spire
      const minH = g.ch * 0.10
      const maxH = g.ch * 0.40
      obs = {
        x: g.nextSpawnAt,
        width: obstacleWidth,
        type: 'spire',
        topHeight: minH + Math.random() * (maxH - minH),
        botHeight: 0,
      }
    }

    g.obstacles.push(obs)
    g.nextSpawnAt += SPAWN_SPACING
  }, [])

  // ── Collision check ────────────────────────────────────────────────────────
  const collides = useCallback((shipScreenX: number) => {
    const g = gRef.current
    // Inner hitbox
    const hx = shipScreenX + g.shipW * HITBOX_INSET.left
    const hy = g.shipY + g.shipH * HITBOX_INSET.top
    const hw = g.shipW * (1 - HITBOX_INSET.left - HITBOX_INSET.right)
    const hh = g.shipH * (1 - HITBOX_INSET.top - HITBOX_INSET.bottom)

    // Ceiling / floor
    if (hy < 0) return true
    if (hy + hh > g.ch) return true

    for (const obs of g.obstacles) {
      const ox = obs.x - g.scrollX
      if (ox + obs.width < hx) continue
      if (ox > hx + hw) break  // obstacles sorted by x ascending → safe to break
      // top spire
      if (obs.topHeight > 0) {
        if (hy < obs.topHeight && hx + hw > ox && hx < ox + obs.width) return true
      }
      // bottom wave
      if (obs.botHeight > 0) {
        const waveTop = g.ch - obs.botHeight
        if (hy + hh > waveTop && hx + hw > ox && hx < ox + obs.width) return true
      }
    }
    return false
  }, [])

  // ── Step physics + spawn + collisions ──────────────────────────────────────
  const step = useCallback((dt: number) => {
    const g = gRef.current
    if (g.state !== 'playing') return

    g.elapsed += dt
    g.shipVy += GRAVITY * dt
    g.shipY += g.shipVy * dt
    g.speed = Math.min(BASE_SPEED + SPEED_RAMP * g.elapsed, MAX_SPEED)
    g.scrollX += g.speed * dt
    g.distance = g.scrollX * METERS_PER_PIXEL

    while (g.nextSpawnAt < g.scrollX + g.cw * 1.05) spawn()

    // Prune off-screen obstacles
    while (g.obstacles.length > 0 && g.obstacles[0].x + g.obstacles[0].width < g.scrollX) {
      g.obstacles.shift()
    }

    const shipScreenX = g.cw * SHIP_X_RATIO
    if (collides(shipScreenX)) {
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
      // Throttle live score updates to ~5Hz to avoid React churn
      const now = performance.now()
      if (now - g.lastScoreUpdate > 180) {
        g.lastScoreUpdate = now
        setScore(Math.floor(g.distance))
      }
    }
  }, [spawn, collides, highScore])

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
    const sky = ctx.createLinearGradient(0, 0, 0, ch * 0.65)
    sky.addColorStop(0, '#5da7d4')
    sky.addColorStop(1, '#a8d4ec')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cw, ch * 0.65)

    // ── Sea ──
    const sea = ctx.createLinearGradient(0, ch * 0.65, 0, ch)
    sea.addColorStop(0, '#1a4d6e')
    sea.addColorStop(1, '#062840')
    ctx.fillStyle = sea
    ctx.fillRect(0, ch * 0.65, cw, ch * 0.35)

    // ── Distant wave silhouettes (parallax) ──
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    const parallax = g.scrollX * 0.25
    for (let i = 0; i < 14; i++) {
      const period = cw + 220
      const wx = ((i * 180 - parallax) % period + period) % period - 110
      ctx.beginPath()
      ctx.ellipse(wx, ch * 0.66, 110, 7, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Obstacles ──
    for (const obs of g.obstacles) {
      const ox = obs.x - g.scrollX
      if (ox + obs.width < 0 || ox > cw) continue
      if (obs.topHeight > 0) drawSpire(ctx, ox, 0, obs.width, obs.topHeight)
      if (obs.botHeight > 0) drawWave(ctx, ox, ch - obs.botHeight, obs.width, obs.botHeight)
    }

    // ── Ship ──
    const img = shipImgRef.current
    if (img && img.complete) {
      const shipX = cw * SHIP_X_RATIO
      const tilt = Math.max(-0.4, Math.min(0.6, g.shipVy * 0.0008))
      ctx.save()
      ctx.translate(shipX + g.shipW / 2, g.shipY + g.shipH / 2)
      ctx.rotate(tilt)
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
      const dt = last === 0 ? 0 : Math.min((ts - last) / 1000, 0.05)  // clamp dt to avoid tunneling on tab switch
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
      if (document.hidden) lastTsRef.current = 0  // reset dt so we don't tunnel
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

        {/* Live score */}
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

        {/* Ready overlay */}
        {uiState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1.6rem', color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.55)' }}>
              Tide Run
            </p>
            <p className="font-karla font-300 mb-5" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', maxWidth: 260 }}>
              Tap to surge over waves and under spires. Survive as long as you can.
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

        {/* Death overlay */}
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
                {score > highScore - 1 && score === highScore ? 'New best!' : `Best ${highScore}m`}
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
function drawWave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, '#2a6a90')
  g.addColorStop(0.4, '#0e3a5c')
  g.addColorStop(1, '#03182a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + 10)
  ctx.bezierCurveTo(x + w * 0.25, y - 6, x + w * 0.75, y - 6, x + w, y + 10)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fill()
  // foam crest
  ctx.strokeStyle = 'rgba(220, 240, 255, 0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + 2, y + 10)
  ctx.bezierCurveTo(x + w * 0.25, y - 6, x + w * 0.75, y - 6, x + w - 2, y + 10)
  ctx.stroke()
}

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
  // edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
}
