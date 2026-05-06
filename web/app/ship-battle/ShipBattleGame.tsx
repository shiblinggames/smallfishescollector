'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type GamePhase = 'idle' | 'playing' | 'dead'

interface Ball { x: number; y: number; vx: number; vy: number }

const CW          = 600
const CH          = 420
const GRAVITY     = 0.22
const SHIP_W      = 72
const SHIP_H      = 32
const PLAYER_X    = 60
const ENEMY_X     = CW - 60 - SHIP_W
const BALL_R      = 5
const HP_MAX      = 3

function hitCheck(balls: Ball[], sx: number, sy: number): boolean {
  return balls.some(b => {
    const dx = b.x - (sx + SHIP_W / 2)
    const dy = b.y - (sy + SHIP_H / 2)
    return Math.sqrt(dx * dx + dy * dy) < SHIP_W * 0.42
  })
}

function trajectoryPoints(ox: number, oy: number, vx: number, vy: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  let x = ox, y = oy, v = vy
  for (let i = 0; i < 50; i++) {
    x += vx; y += v; v += GRAVITY
    pts.push({ x, y })
    if (x > CW + 20 || x < -20 || y > CH + 20) break
  }
  return pts
}

export default function ShipBattleGame({ shipImageUrl }: { shipImageUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase]         = useState<GamePhase>('idle')
  const [streak, setStreak]       = useState(0)
  const [best, setBest]           = useState(0)

  const playerY       = useRef(CH / 2 - SHIP_H / 2)
  const enemyY        = useRef(CH / 2 - SHIP_H / 2)
  const playerHP      = useRef(HP_MAX)
  const enemyHP       = useRef(HP_MAX)
  const enemyHPMax    = useRef(HP_MAX)
  const streakRef     = useRef(0)
  const round         = useRef(0)
  const playerBalls   = useRef<Ball[]>([])
  const enemyBalls    = useRef<Ball[]>([])
  const isDragging    = useRef(false)
  const aimPt         = useRef({ x: 0, y: 0 })
  const bobT          = useRef(0)
  const fireTimer     = useRef(150)
  const fireInterval  = useRef(150)
  const frameCount    = useRef(0)
  const gameOver      = useRef(false)
  const phaseRef      = useRef<GamePhase>('idle')
  const shipImg       = useRef<HTMLImageElement | null>(null)
  const dpr           = useRef(1)
  const animFrame     = useRef(0)

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
    playerY.current    = CH / 2 - SHIP_H / 2
    enemyY.current     = CH / 2 - SHIP_H / 2
    playerHP.current   = HP_MAX
    enemyHP.current    = HP_MAX
    enemyHPMax.current = HP_MAX
    streakRef.current  = 0
    round.current      = 0
    playerBalls.current = []
    enemyBalls.current  = []
    isDragging.current  = false
    bobT.current        = 0
    fireTimer.current   = 150
    fireInterval.current = 150
    frameCount.current  = 0
    gameOver.current    = false
    phaseRef.current    = 'playing'
    setStreak(0)
    setPhase('playing')
  }, [])

  const canvasCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (CW / rect.width),
      y: (e.clientY - rect.top)  * (CH / rect.height),
    }
  }, [])

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (phaseRef.current !== 'playing') { startGame(); return }
    const { x, y } = canvasCoords(e)
    if (x > CW / 2) return
    isDragging.current = true
    aimPt.current = { x, y }
  }, [startGame, canvasCoords])

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return
    aimPt.current = canvasCoords(e)
  }, [canvasCoords])

  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return
    isDragging.current = false
    const ox = PLAYER_X + SHIP_W
    const oy = playerY.current + SHIP_H / 2
    const dx = aimPt.current.x - ox
    const dy = aimPt.current.y - oy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 8) return
    const power = Math.min(dist / 38, 15)
    playerBalls.current.push({ x: ox, y: oy, vx: (dx / dist) * power, vy: (dy / dist) * power })
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rawCtx = canvas.getContext('2d')
    if (!rawCtx) return
    const ctx: CanvasRenderingContext2D = rawCtx
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0)

    function drawShip(x: number, y: number, flipped: boolean) {
      ctx.save()
      if (flipped) {
        ctx.translate(x + SHIP_W, y)
        ctx.scale(-1, 1)
        if (shipImg.current) ctx.drawImage(shipImg.current, 0, 0, SHIP_W, SHIP_H)
        else { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.roundRect(0, 0, SHIP_W, SHIP_H, 5); ctx.fill() }
      } else {
        if (shipImg.current) ctx.drawImage(shipImg.current, x, y, SHIP_W, SHIP_H)
        else { ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.roundRect(x, y, SHIP_W, SHIP_H, 5); ctx.fill() }
      }
      ctx.restore()
    }

    function drawHearts(cx: number, cy: number, hp: number, max: number, color: string) {
      const spacing = 14
      const totalW = (max - 1) * spacing
      for (let i = 0; i < max; i++) {
        const hx = cx - totalW / 2 + i * spacing
        ctx.beginPath()
        ctx.arc(hx, cy, 4, 0, Math.PI * 2)
        ctx.fillStyle = i < hp ? color : 'rgba(255,255,255,0.12)'
        ctx.fill()
      }
    }

    function enemyFire() {
      const ox = ENEMY_X
      const oy = enemyY.current + SHIP_H / 2
      const tx = PLAYER_X + SHIP_W / 2
      const ty = playerY.current + SHIP_H / 2
      const dx = tx - ox, dy = ty - oy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const power = 7 + round.current * 0.4
      const spread = (Math.random() - 0.5) * (6 - Math.min(round.current, 4))
      enemyBalls.current.push({
        x: ox, y: oy,
        vx: (dx / dist) * power,
        vy: (dy / dist) * power - 2 + spread,
      })
    }

    function tick() {
      if (gameOver.current) return
      frameCount.current++

      // Enemy bob
      const bobSpeed = 0.022 + round.current * 0.003
      const bobAmp   = 35  + round.current * 4
      bobT.current  += bobSpeed
      enemyY.current = Math.max(20, Math.min(CH - SHIP_H - 20, CH / 2 - SHIP_H / 2 + Math.sin(bobT.current) * bobAmp))

      // Enemy fire
      fireTimer.current--
      if (fireTimer.current <= 0) {
        enemyFire()
        fireTimer.current = Math.max(55, fireInterval.current - round.current * 8)
      }

      // Move balls
      const moveBalls = (balls: Ball[]) =>
        balls
          .map(b => ({ ...b, x: b.x + b.vx, y: b.y + b.vy, vy: b.vy + GRAVITY }))
          .filter(b => b.x > -30 && b.x < CW + 30 && b.y < CH + 30 && b.y > -30)
      playerBalls.current = moveBalls(playerBalls.current)
      enemyBalls.current  = moveBalls(enemyBalls.current)

      // Hit: player → enemy
      if (hitCheck(playerBalls.current, ENEMY_X, enemyY.current)) {
        playerBalls.current = playerBalls.current.filter(b => {
          const dx = b.x - (ENEMY_X + SHIP_W / 2)
          const dy = b.y - (enemyY.current + SHIP_H / 2)
          return Math.sqrt(dx * dx + dy * dy) >= SHIP_W * 0.42
        })
        enemyHP.current--
        if (enemyHP.current <= 0) {
          round.current++
          streakRef.current++
          setStreak(streakRef.current)
          const newMax = Math.min(HP_MAX + Math.floor(round.current / 2), 6)
          enemyHPMax.current  = newMax
          enemyHP.current     = newMax
          playerBalls.current = []
          enemyBalls.current  = []
          fireInterval.current = Math.max(55, 150 - round.current * 9)
          fireTimer.current   = fireInterval.current
        }
      }

      // Hit: enemy → player
      if (hitCheck(enemyBalls.current, PLAYER_X, playerY.current)) {
        enemyBalls.current = enemyBalls.current.filter(b => {
          const dx = b.x - (PLAYER_X + SHIP_W / 2)
          const dy = b.y - (playerY.current + SHIP_H / 2)
          return Math.sqrt(dx * dx + dy * dy) >= SHIP_W * 0.42
        })
        playerHP.current--
        if (playerHP.current <= 0) {
          gameOver.current = true
          phaseRef.current = 'dead'
          setBest(prev => Math.max(prev, streakRef.current))
          cancelAnimationFrame(animFrame.current)
          setPhase('dead')
          return
        }
      }

      // ── Draw ──
      ctx.clearRect(0, 0, CW, CH)

      const bgGrad = ctx.createLinearGradient(0, 0, 0, CH)
      bgGrad.addColorStop(0, '#0b1d30')
      bgGrad.addColorStop(1, '#09263a')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, CW, CH)

      // Waves
      ctx.strokeStyle = 'rgba(56,189,248,0.055)'
      ctx.lineWidth = 1
      for (let row = 0; row < 10; row++) {
        const baseY = (CH / 10) * row + CH / 20
        ctx.beginPath()
        for (let x = 0; x <= CW; x += 5) {
          const wy = baseY + Math.sin((x + frameCount.current * 0.5) / 36) * 2.5
          x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy)
        }
        ctx.stroke()
      }

      // Trajectory preview
      if (isDragging.current) {
        const ox = PLAYER_X + SHIP_W
        const oy = playerY.current + SHIP_H / 2
        const dx = aimPt.current.x - ox
        const dy = aimPt.current.y - oy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 8) {
          const power = Math.min(dist / 38, 15)
          const pts = trajectoryPoints(ox, oy, (dx / dist) * power, (dy / dist) * power)
          ctx.strokeStyle = 'rgba(255,255,255,0.2)'
          ctx.setLineDash([4, 9])
          ctx.lineWidth = 1.5
          ctx.beginPath()
          pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // Player cannonballs
      for (const b of playerBalls.current) {
        ctx.fillStyle = '#1c1917'
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
      }

      // Enemy cannonballs
      for (const b of enemyBalls.current) {
        ctx.fillStyle = '#7f1d1d'
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      drawShip(PLAYER_X, playerY.current, false)
      drawShip(ENEMY_X,  enemyY.current,  true)

      // HP dots
      drawHearts(PLAYER_X + SHIP_W / 2, playerY.current - 12, playerHP.current, HP_MAX, '#38bdf8')
      drawHearts(ENEMY_X  + SHIP_W / 2, enemyY.current - 12,  enemyHP.current,  enemyHPMax.current, '#ef4444')

      // Streak
      ctx.fillStyle = 'rgba(240,237,232,0.5)'
      ctx.font = '600 13px Karla, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(streakRef.current > 0 ? `${streakRef.current} sunk` : '', CW / 2, 22)

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
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
      />
      {phase !== 'playing' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', borderRadius: 20,
        }}>
          {phase === 'dead' && <>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Ships Sunk</p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '2.6rem', margin: '0 0 4px' }}>{streak}</p>
            {best > 0 && <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.3)', fontSize: '0.72rem', marginBottom: 22 }}>Best: {best}</p>}
            {best === 0 && <div style={{ marginBottom: 22 }} />}
          </>}
          {phase === 'idle' && (
            <p className="font-karla font-300" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.85rem', marginBottom: 22 }}>
              Drag to aim · release to fire
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
            {phase === 'idle' ? 'Open Fire' : 'Try Again'}
          </button>
        </div>
      )}
    </div>
  )
}
