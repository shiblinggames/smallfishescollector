'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type GamePhase = 'idle' | 'playing' | 'dead'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null

const ENEMY_HP_BASE  = 3
const PLAYER_HP_MAX  = 3
const SPEED_BASE     = 0.006   // bar units per frame
const SPEED_INC      = 0.0008  // extra per round
const ENEMY_FIRE_MS  = 3200    // ms between enemy shots (base)
const ENEMY_FIRE_DEC = 150     // ms faster per round

// Zone boundaries (0–1, symmetric around 0.5)
function getZones(round: number) {
  const graze  = 0.10 + Math.max(0, 0.01 * round) // shrinks inward... wait, let me think
  // Actually graze stays same, hit shrinks, critical shrinks most
  const hitW   = Math.max(0.07, 0.13  - round * 0.008)
  const critW  = Math.max(0.03, 0.065 - round * 0.005)
  return {
    grazeL: 0.5 - 0.18 - hitW,
    hitL:   0.5 - hitW,
    critL:  0.5 - critW,
    critR:  0.5 + critW,
    hitR:   0.5 + hitW,
    grazeR: 0.5 + hitW + 0.18,
  }
}

function getResult(pos: number, round: number): ShotResult {
  const z = getZones(round)
  if (pos >= z.critL && pos <= z.critR) return 'critical'
  if (pos >= z.hitL  && pos <= z.hitR)  return 'hit'
  if (pos >= z.grazeL && pos <= z.grazeR) return 'graze'
  return 'miss'
}

const RESULT_DAMAGE: Record<string, number> = { critical: 2, hit: 1, graze: 1, miss: 0 }
const RESULT_LABEL:  Record<string, string>  = { critical: 'Critical!', hit: 'Hit!', graze: 'Graze', miss: 'Miss' }
const RESULT_COLOR:  Record<string, string>  = {
  critical: '#fbbf24', hit: '#4ade80', graze: '#94a3b8', miss: '#6b7280',
}

export default function CannonGame({ shipImageUrl }: { shipImageUrl: string }) {
  const [phase, setPhase]           = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]     = useState(PLAYER_HP_MAX)
  const [enemyHP, setEnemyHP]       = useState(ENEMY_HP_BASE)
  const [enemyHPMax, setEnemyHPMax] = useState(ENEMY_HP_BASE)
  const [streak, setStreak]         = useState(0)
  const [best, setBest]             = useState(0)
  const [result, setResult]         = useState<ShotResult>(null)
  const [enemyHit, setEnemyHit]     = useState(false)
  const [playerHit, setPlayerHit]   = useState(false)
  const [enemyFirePct, setEnemyFirePct] = useState(1)

  const posRef        = useRef(0)
  const dirRef        = useRef(1)
  const roundRef      = useRef(0)
  const streakRef     = useRef(0)
  const playerHPRef   = useRef(PLAYER_HP_MAX)
  const enemyHPRef    = useRef(ENEMY_HP_BASE)
  const enemyHPMaxRef = useRef(ENEMY_HP_BASE)
  const phaseRef      = useRef<GamePhase>('idle')
  const canFireRef    = useRef(true)
  const indicatorRef  = useRef<HTMLDivElement>(null)
  const rafRef        = useRef(0)
  const enemyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fireIntervalRef = useRef(ENEMY_FIRE_MS)
  const fireElapsedRef  = useRef(0)
  const lastFrameRef    = useRef(0)

  const startGame = useCallback(() => {
    posRef.current        = 0
    dirRef.current        = 1
    roundRef.current      = 0
    streakRef.current     = 0
    playerHPRef.current   = PLAYER_HP_MAX
    enemyHPRef.current    = ENEMY_HP_BASE
    enemyHPMaxRef.current = ENEMY_HP_BASE
    canFireRef.current    = true
    fireIntervalRef.current = ENEMY_FIRE_MS
    fireElapsedRef.current  = 0
    lastFrameRef.current    = 0
    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(PLAYER_HP_MAX)
    setEnemyHP(ENEMY_HP_BASE)
    setEnemyHPMax(ENEMY_HP_BASE)
    setStreak(0)
    setResult(null)
    setEnemyFirePct(1)
  }, [])

  // Main animation loop
  useEffect(() => {
    if (phase !== 'playing') return

    let lastTime = performance.now()

    function loop(now: number) {
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

      // Move indicator
      const speed = SPEED_BASE + roundRef.current * SPEED_INC
      posRef.current += speed * (dt / 16.67) * dirRef.current
      if (posRef.current >= 1) { posRef.current = 1; dirRef.current = -1 }
      if (posRef.current <= 0) { posRef.current = 0; dirRef.current = 1 }

      if (indicatorRef.current) {
        indicatorRef.current.style.left = `calc(${posRef.current * 100}% - 2px)`
      }

      // Enemy fire countdown
      fireElapsedRef.current += dt
      const pct = 1 - fireElapsedRef.current / fireIntervalRef.current
      setEnemyFirePct(Math.max(0, pct))

      if (fireElapsedRef.current >= fireIntervalRef.current) {
        fireElapsedRef.current = 0
        // Enemy fires — player takes 1 damage
        playerHPRef.current--
        setPlayerHP(playerHPRef.current)
        setPlayerHit(true)
        setTimeout(() => setPlayerHit(false), 400)
        if (playerHPRef.current <= 0) {
          phaseRef.current = 'dead'
          setBest(prev => Math.max(prev, streakRef.current))
          setPhase('dead')
          return
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  const fire = useCallback(() => {
    if (phaseRef.current !== 'playing' || !canFireRef.current) return
    canFireRef.current = false

    const pos = posRef.current
    const res = getResult(pos, roundRef.current)
    setResult(res)

    const dmg = res ? RESULT_DAMAGE[res] : 0
    if (dmg > 0) {
      enemyHPRef.current = Math.max(0, enemyHPRef.current - dmg)
      setEnemyHP(enemyHPRef.current)
      setEnemyHit(true)
      setTimeout(() => setEnemyHit(false), 350)

      if (enemyHPRef.current <= 0) {
        // Round won
        roundRef.current++
        streakRef.current++
        setStreak(streakRef.current)
        const newMax = ENEMY_HP_BASE + Math.floor(roundRef.current / 2)
        enemyHPMaxRef.current = newMax
        enemyHPRef.current    = newMax
        fireIntervalRef.current = Math.max(1200, ENEMY_FIRE_MS - roundRef.current * ENEMY_FIRE_DEC)
        fireElapsedRef.current  = 0
        setEnemyHP(newMax)
        setEnemyHPMax(newMax)
        setEnemyFirePct(1)
      }
    }

    // Brief cooldown before can fire again
    setTimeout(() => { canFireRef.current = true; setResult(null) }, 600)
  }, [])

  const zones = getZones(roundRef.current)

  return (
    <div className="flex flex-col items-center gap-6 select-none" style={{ userSelect: 'none' }}>

      {/* Enemy ship */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="font-karla font-600 text-[#f0ede8]" style={{ fontSize: '0.8rem' }}>
            Enemy Ship
          </span>
          <span className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#9a9488' }}>
            Round {roundRef.current + 1}
          </span>
        </div>

        {/* Enemy HP */}
        <div className="flex gap-2 mb-3 px-1">
          {Array.from({ length: enemyHPMax }).map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i < enemyHP ? '#ef4444' : 'rgba(255,255,255,0.1)',
              boxShadow: i < enemyHP ? '0 0 6px #ef444488' : 'none',
              transition: 'background 0.15s',
            }} />
          ))}
        </div>

        {/* Enemy ship image */}
        <motion.div
          animate={enemyHit ? { x: [0, -8, 6, -4, 0] } : { x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 8 }}
        >
          <img
            src={shipImageUrl}
            alt="enemy"
            style={{
              width: 80, height: 36, objectFit: 'contain',
              transform: 'scaleX(-1)',
              filter: enemyHit ? 'brightness(2) saturate(0)' : 'none',
              transition: 'filter 0.15s',
            }}
          />
        </motion.div>
      </div>

      {/* Shot result */}
      <div style={{ height: 28 }}>
        <AnimatePresence>
          {result && (
            <motion.p
              key={result}
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="font-cinzel font-700"
              style={{ fontSize: '1.1rem', color: RESULT_COLOR[result], textAlign: 'center' }}
            >
              {RESULT_LABEL[result]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Power bar */}
      <div
        style={{ width: '100%', maxWidth: 360, position: 'relative', cursor: 'pointer' }}
        onPointerDown={phase === 'playing' ? fire : startGame}
      >
        {/* Track */}
        <div style={{
          position: 'relative', height: 52, borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}>
          {/* Graze zones */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${zones.grazeL * 100}%`,
            width: `${(zones.grazeR - zones.grazeL) * 100}%`,
            background: 'rgba(148,163,184,0.15)',
          }} />
          {/* Hit zones */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${zones.hitL * 100}%`,
            width: `${(zones.hitR - zones.hitL) * 100}%`,
            background: 'rgba(74,222,128,0.2)',
          }} />
          {/* Critical zone */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${zones.critL * 100}%`,
            width: `${(zones.critR - zones.critL) * 100}%`,
            background: 'rgba(251,191,36,0.35)',
          }} />

          {/* Indicator */}
          <div
            ref={indicatorRef}
            style={{
              position: 'absolute', top: 4, bottom: 4,
              width: 4, borderRadius: 2,
              background: '#f0ede8',
              boxShadow: '0 0 8px rgba(240,237,232,0.8)',
              left: '0%',
            }}
          />
        </div>

        {/* Zone labels */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
          {[
            { label: 'Graze', color: '#94a3b8' },
            { label: 'Hit', color: '#4ade80' },
            { label: '★ Critical', color: '#fbbf24' },
          ].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: z.color }} />
              <span className="font-karla font-400" style={{ fontSize: '0.65rem', color: z.color }}>{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fire button */}
      <motion.button
        onPointerDown={phase === 'playing' ? fire : startGame}
        whileTap={{ scale: 0.95 }}
        className="font-karla font-700"
        style={{
          padding: '13px 48px',
          background: phase === 'playing' ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.15)',
          border: `1px solid ${phase === 'playing' ? 'rgba(239,68,68,0.4)' : 'rgba(56,189,248,0.4)'}`,
          borderRadius: 14, cursor: 'pointer',
          color: phase === 'playing' ? '#ef4444' : '#38bdf8',
          fontSize: '1rem', letterSpacing: '0.06em',
        }}
      >
        {phase === 'idle' ? 'Open Fire' : phase === 'dead' ? 'Try Again' : 'FIRE'}
      </motion.button>

      {/* Enemy fire countdown */}
      {phase === 'playing' && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#9a9488' }}>
              Incoming fire
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: enemyFirePct > 0.4 ? '#4ade80' : enemyFirePct > 0.2 ? '#fbbf24' : '#ef4444',
              width: `${enemyFirePct * 100}%`,
              transition: 'background 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Player ship + HP */}
      <div className="w-full max-w-sm">
        <motion.div
          animate={playerHit ? { x: [0, 8, -6, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 8 }}
        >
          <img
            src={shipImageUrl}
            alt="your ship"
            style={{
              width: 80, height: 36, objectFit: 'contain',
              filter: playerHit ? 'brightness(2) saturate(0)' : 'none',
              transition: 'filter 0.15s',
            }}
          />
          <div className="flex gap-2">
            {Array.from({ length: PLAYER_HP_MAX }).map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < playerHP ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                boxShadow: i < playerHP ? '0 0 6px #38bdf888' : 'none',
                transition: 'background 0.15s',
              }} />
            ))}
          </div>
        </motion.div>
      </div>

      {/* Dead overlay */}
      <AnimatePresence>
        {phase === 'dead' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)', zIndex: 50,
            }}
            onPointerDown={startGame}
          >
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Ships Sunk</p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '3rem', margin: '0 0 4px' }}>{streak}</p>
            {best > 0 && <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.3)', fontSize: '0.75rem', marginBottom: 28 }}>Best: {best}</p>}
            {best === 0 && <div style={{ marginBottom: 28 }} />}
            <button
              className="font-karla font-700"
              style={{
                padding: '11px 34px', background: 'rgba(56,189,248,0.15)',
                border: '1px solid rgba(56,189,248,0.4)', borderRadius: 12,
                color: '#38bdf8', fontSize: '0.9rem', letterSpacing: '0.04em', cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
