'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type GamePhase = 'idle' | 'playing' | 'dead'

interface Obstacle {
  x: number
  topH: number   // height of top block (0 = no top block)
  botH: number   // height of bottom block (0 = no bottom block)
  w: number
  passed: boolean
}

const CW         = 600
const CH         = 460
const GRAVITY    = 0.28
const LIFT       = 0.62
const MAX_VEL    = 8
const SHIP_X     = CW * 0.18
const SHIP_W     = 64
const SHIP_H     = 28
const GAP_MIN    = 110
const GAP_MAX    = 160
const Y_MIN      = 20
const Y_MAX      = CH - 20 - SHIP_H

export default function ShipRunGame({ shipImageUrl, shipName }: { shipImageUrl: string; shipName: string }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase]           = useState<GamePhase>('idle')
  const [finalScore, setFinalScore] = useState(0)

  const shipY      = useRef(CH / 2 - SHIP_H / 2)
  const velY       = useRef(0)
  const holding    = useRef(false)
  const score      = useRef(0)
  const speed      = useRef(3)
  const obstacles  = useRef<Obstacle[]>([])
  const gameOver   = useRef(false)
  const animFrame  = useRef(0)
  const shipImg    = useRef<HTMLImageElement | null>(null)
  const bgOffset   = useRef(0)
  const phaseRef   = useRef<GamePhase>('idle')
  const frameCount = useRef(0)
  const lastSpawn  = useRef(0)
  const dpr        = useRef(1)

  useEffect(() => {
    const img = new Image()
    img.src = shipImageUrl
    img.onload = () => { shipImg.current = img }
  }, [shipImageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    dpr.current   = window.devicePixelRatio || 1
    canvas.width  = CW * dpr.current
    canvas.height = CH * dpr.current
  }, [])

  const startGame = useCallback(() => {
    shipY.current      = CH / 2 - SHIP_H / 2
    velY.current       = 0
    holding.current    = false
    score.current      = 0
    speed.current      = 3
    obstacles.current  = []
    gameOver.current   = false
    bgOffset.current   = 0
    frameCount.current = 0
    lastSpawn.current  = 0
    phaseRef.current   = 'playing'
    setPhase('playing')
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (phaseRef.current !== 'playing') { startGame(); return }
    holding.current = true
  }, [startGame])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    holding.current = false
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rawCtx = canvas.getContext('2d')
    if (!rawCtx) return
    const ctx: CanvasRenderingContext2D = rawCtx
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0)

    function spawnObstacle() {
      const gapSize = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN)
      const gapY    = Y_MIN + Math.random() * (CH - Y_MIN * 2 - gapSize)
      obstacles.current.push({
        x:      CW + 10,
        topH:   gapY,
        botH:   CH - gapY - gapSize,
        w:      28 + Math.random() * 18,
        passed: false,
      })
    }

    function drawObstacle(obs: Obstacle) {
      const gapY  = obs.topH
      const gapBot = CH - obs.botH

      // top block
      if (obs.topH > 0) {
        const grad = ctx.createLinearGradient(obs.x, 0, obs.x + obs.w, 0)
        grad.addColorStop(0, '#1e3a5f')
        grad.addColorStop(1, '#162d4a')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(obs.x, 0, obs.w, gapY, [0, 0, 8, 8])
        ctx.fill()
        // edge glow
        ctx.fillStyle = 'rgba(56,189,248,0.18)'
        ctx.fillRect(obs.x, gapY - 3, obs.w, 3)
      }

      // bottom block
      if (obs.botH > 0) {
        const grad = ctx.createLinearGradient(obs.x, 0, obs.x + obs.w, 0)
        grad.addColorStop(0, '#1e3a5f')
        grad.addColorStop(1, '#162d4a')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(obs.x, gapBot, obs.w, obs.botH, [8, 8, 0, 0])
        ctx.fill()
        ctx.fillStyle = 'rgba(56,189,248,0.18)'
        ctx.fillRect(obs.x, gapBot, obs.w, 3)
      }
    }

    function tick() {
      if (gameOver.current) return
      frameCount.current++
      speed.current = 3 + score.current / 350

      // Physics
      if (holding.current) {
        velY.current = Math.max(velY.current - LIFT, -MAX_VEL)
      } else {
        velY.current = Math.min(velY.current + GRAVITY, MAX_VEL)
      }
      shipY.current = Math.max(Y_MIN, Math.min(Y_MAX, shipY.current + velY.current))

      bgOffset.current = (bgOffset.current + speed.current * 0.5) % CW

      // Move obstacles
      obstacles.current = obstacles.current
        .map(o => ({ ...o, x: o.x - speed.current }))
        .filter(o => o.x + o.w > -10)

      // Spawn
      const interval = Math.max(80, 160 - score.current / 15)
      if (frameCount.current - lastSpawn.current > interval) {
        spawnObstacle()
        lastSpawn.current = frameCount.current
      }

      score.current++

      // Collision
      const sL = SHIP_X - SHIP_W * 0.35
      const sR = SHIP_X + SHIP_W * 0.35
      const sT = shipY.current + SHIP_H * 0.15
      const sB = shipY.current + SHIP_H * 0.85
      for (const obs of obstacles.current) {
        if (sR < obs.x || sL > obs.x + obs.w) continue
        const gapY   = obs.topH
        const gapBot = CH - obs.botH
        if ((obs.topH > 0 && sT < gapY) || (obs.botH > 0 && sB > gapBot)) {
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

      // Ocean bg
      const grad = ctx.createLinearGradient(0, 0, 0, CH)
      grad.addColorStop(0, '#0b1d30')
      grad.addColorStop(1, '#09263a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, CW, CH)

      // Scrolling wave lines
      ctx.strokeStyle = 'rgba(56,189,248,0.06)'
      ctx.lineWidth = 1
      for (let row = 0; row < 12; row++) {
        const baseY = (CH / 12) * row + CH / 24
        ctx.beginPath()
        for (let x = 0; x <= CW + 60; x += 5) {
          const wx = x - bgOffset.current
          const wy = baseY + Math.sin(wx / 32) * 3
          x === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy)
        }
        ctx.stroke()
      }

      obstacles.current.forEach(o => drawObstacle(o))

      // Ship
      if (shipImg.current) {
        ctx.drawImage(shipImg.current, SHIP_X - SHIP_W / 2, shipY.current, SHIP_W, SHIP_H)
      } else {
        ctx.fillStyle = '#60a5fa'
        ctx.beginPath()
        ctx.roundRect(SHIP_X - SHIP_W / 2, shipY.current, SHIP_W, SHIP_H, 5)
        ctx.fill()
      }

      // Score
      ctx.fillStyle = 'rgba(240,237,232,0.6)'
      ctx.font = '700 15px Karla, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.floor(score.current / 10)}m`, CW - 16, 28)

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
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
            <p className="font-karla font-300" style={{ color: 'rgba(240,237,232,0.45)', fontSize: '0.85rem', marginBottom: 20 }}>
              Hold to rise · release to fall
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
