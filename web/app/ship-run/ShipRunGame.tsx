'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type GamePhase = 'idle' | 'playing' | 'dead'

interface Obstacle {
  x: number
  lane: number
  w: number
  h: number
  type: 'rock' | 'barrel' | 'monster'
}

const LANES   = 3
const CW      = 600
const CH      = 460
const LANE_H  = CH / LANES
const SHIP_X  = CW * 0.14
const SHIP_W  = LANE_H * 1.5
const SHIP_H  = LANE_H * 0.52

function drawShip(ctx: CanvasRenderingContext2D, y: number, img: HTMLImageElement | null) {
  if (img) {
    ctx.drawImage(img, SHIP_X - SHIP_W * 0.38, y, SHIP_W, SHIP_H)
  } else {
    ctx.fillStyle = '#60a5fa'
    ctx.beginPath()
    ctx.roundRect(SHIP_X - 24, y, 48, SHIP_H, 6)
    ctx.fill()
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const obsY = obs.lane * LANE_H + (LANE_H - obs.h) / 2
  if (obs.type === 'rock') {
    ctx.fillStyle = '#4b5563'
    ctx.beginPath()
    ctx.roundRect(obs.x, obsY, obs.w, obs.h, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(obs.x + 5, obsY + 5, obs.w * 0.28, 3)
  } else if (obs.type === 'barrel') {
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.roundRect(obs.x, obsY, obs.w, obs.h, 6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 2
    for (const frac of [0.32, 0.68]) {
      ctx.beginPath()
      ctx.moveTo(obs.x + 4, obsY + obs.h * frac)
      ctx.lineTo(obs.x + obs.w - 4, obsY + obs.h * frac)
      ctx.stroke()
    }
  } else {
    ctx.fillStyle = '#0d9488'
    ctx.shadowColor = '#2dd4bf'
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.ellipse(obs.x + obs.w / 2, obsY + obs.h / 2, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(obs.x + obs.w * 0.38, obsY + obs.h * 0.38, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(obs.x + obs.w * 0.38, obsY + obs.h * 0.38, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

export default function ShipRunGame({ shipImageUrl, shipName }: { shipImageUrl: string; shipName: string }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase]           = useState<GamePhase>('idle')
  const [finalScore, setFinalScore] = useState(0)

  const shipLane    = useRef(1)
  const shipY       = useRef((1 + 0.5) * LANE_H - SHIP_H / 2)
  const score       = useRef(0)
  const speed       = useRef(2.8)
  const obstacles   = useRef<Obstacle[]>([])
  const gameOver    = useRef(false)
  const animFrame   = useRef(0)
  const shipImg     = useRef<HTMLImageElement | null>(null)
  const bgOffset    = useRef(0)
  const phaseRef    = useRef<GamePhase>('idle')
  const frameCount  = useRef(0)
  const lastSpawn   = useRef(0)

  useEffect(() => {
    const img = new Image()
    img.src = shipImageUrl
    img.onload = () => { shipImg.current = img }
  }, [shipImageUrl])

  const dpr = useRef(1)

  // Size the backing store for device pixel ratio once on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    dpr.current = window.devicePixelRatio || 1
    canvas.width  = CW * dpr.current
    canvas.height = CH * dpr.current
  }, [])

  const startGame = useCallback(() => {
    shipLane.current   = 1
    shipY.current      = (1 + 0.5) * LANE_H - SHIP_H / 2
    score.current      = 0
    speed.current      = 2.8
    obstacles.current  = []
    gameOver.current   = false
    bgOffset.current   = 0
    frameCount.current = 0
    lastSpawn.current  = 0
    phaseRef.current   = 'playing'
    setPhase('playing')
  }, [])

  const handleTap = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (phaseRef.current !== 'playing') { startGame(); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) {
      shipLane.current = Math.max(0, shipLane.current - 1)
    } else {
      shipLane.current = Math.min(LANES - 1, shipLane.current + 1)
    }
  }, [startGame])

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rawCtx = canvas.getContext('2d')
    if (!rawCtx) return
    const ctx: CanvasRenderingContext2D = rawCtx
    // Restore DPR scale (setTransform replaces rather than stacks)
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0)

    function spawnObstacle() {
      const lane  = Math.floor(Math.random() * LANES)
      const types = ['rock', 'rock', 'barrel', 'monster'] as Obstacle['type'][]
      const type  = types[Math.floor(Math.random() * types.length)]
      const w     = type === 'rock' ? 38 + Math.random() * 24 : type === 'barrel' ? 28 : 44
      obstacles.current.push({ x: CW + 20, lane, w, h: LANE_H * (type === 'monster' ? 0.6 : 0.42), type })
    }

    function tick() {
      if (gameOver.current) return
      frameCount.current++

      speed.current  = 2.8 + score.current / 400
      bgOffset.current = (bgOffset.current + speed.current * 0.4) % CW

      const targetY  = (shipLane.current + 0.5) * LANE_H - SHIP_H / 2
      shipY.current += (targetY - shipY.current) * 0.2

      obstacles.current = obstacles.current
        .map(o => ({ ...o, x: o.x - speed.current }))
        .filter(o => o.x + o.w > 0)

      const interval = Math.max(55, 115 - score.current / 25)
      if (frameCount.current - lastSpawn.current > interval) {
        spawnObstacle()
        if (Math.random() < 0.25 && score.current > 150) setTimeout(spawnObstacle, 350)
        lastSpawn.current = frameCount.current
      }

      score.current++

      const sLeft  = SHIP_X - SHIP_W * 0.22
      const sRight = SHIP_X + SHIP_W * 0.22
      const sTop   = shipY.current + SHIP_H * 0.18
      const sBot   = shipY.current + SHIP_H * 0.82
      for (const obs of obstacles.current) {
        const oY = obs.lane * LANE_H + (LANE_H - obs.h) / 2
        if (sRight > obs.x + 5 && sLeft < obs.x + obs.w - 5 && sBot > oY + 5 && sTop < oY + obs.h - 5) {
          gameOver.current = true
          phaseRef.current = 'dead'
          cancelAnimationFrame(animFrame.current)
          setFinalScore(Math.floor(score.current / 10))
          setPhase('dead')
          return
        }
      }

      // ── Draw ──
      ctx.clearRect(0, 0, CW, CH)

      const grad = ctx.createLinearGradient(0, 0, 0, CH)
      grad.addColorStop(0, '#0b1d30')
      grad.addColorStop(1, '#09263a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, CW, CH)

      ctx.strokeStyle = 'rgba(56,189,248,0.07)'
      ctx.lineWidth = 1
      for (let row = 0; row < 9; row++) {
        const baseY = (CH / 9) * row + CH / 18
        ctx.beginPath()
        for (let x = 0; x <= CW + 50; x += 5) {
          const wx = x - bgOffset.current
          const wy = baseY + Math.sin(wx / 28) * 2.5
          x === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy)
        }
        ctx.stroke()
      }

      ctx.strokeStyle = 'rgba(56,189,248,0.05)'
      ctx.setLineDash([6, 14])
      ctx.lineWidth = 1
      for (let i = 1; i < LANES; i++) {
        ctx.beginPath()
        ctx.moveTo(0, LANE_H * i)
        ctx.lineTo(CW, LANE_H * i)
        ctx.stroke()
      }
      ctx.setLineDash([])

      obstacles.current.forEach(o => drawObstacle(ctx, o))
      drawShip(ctx, shipY.current, shipImg.current)

      ctx.fillStyle = 'rgba(240,237,232,0.65)'
      ctx.font = '700 15px Karla, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.floor(score.current / 10)}m`, CW - 14, 26)

      animFrame.current = requestAnimationFrame(tick)
    }

    animFrame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrame.current)
  }, [phase])

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: CW, margin: '0 auto' }}>
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        style={{ width: '100%', display: 'block', touchAction: 'none', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)' }}
        onPointerDown={handleTap}
      />
      {phase !== 'playing' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', borderRadius: 20,
        }}>
          {phase === 'dead' && <>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.45)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Distance</p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '2.4rem', margin: '0 0 20px' }}>{finalScore}m</p>
          </>}
          {phase === 'idle' && (
            <p className="font-karla font-300" style={{ color: 'rgba(240,237,232,0.45)', fontSize: '0.8rem', marginBottom: 20 }}>
              Tap left · right to dodge
            </p>
          )}
          <button
            onClick={startGame}
            className="font-karla font-700"
            style={{
              padding: '11px 34px', background: 'rgba(56,189,248,0.15)',
              border: '1px solid rgba(56,189,248,0.4)', borderRadius: 12,
              color: '#38bdf8', fontSize: '0.9rem', letterSpacing: '0.04em', cursor: 'pointer',
            }}
          >
            {phase === 'idle' ? 'Set Sail' : 'Try Again'}
          </button>
        </div>
      )}
    </div>
  )
}
