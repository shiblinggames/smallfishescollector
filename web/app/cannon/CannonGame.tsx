'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type GamePhase  = 'idle' | 'playing' | 'dead'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null
type ParryState = 'none' | 'incoming' | 'success' | 'failed'

const ENEMY_HP_BASE    = 3
const PLAYER_HP_MAX    = 3
const SPEED_BASE       = 0.006
const SPEED_INC        = 0.0008
const ENEMY_FIRE_MS    = 3200
const ENEMY_FIRE_DEC   = 150
const PARRY_WINDOW_MS  = 750   // how long parry window stays open
const PARRY_WINDOW_DEC = 35    // ms shorter per round

function getZones(round: number) {
  const hitW  = Math.max(0.07, 0.13  - round * 0.008)
  const critW = Math.max(0.03, 0.065 - round * 0.005)
  return {
    grazeL: 0.5 - hitW - 0.18, hitL: 0.5 - hitW,
    critL:  0.5 - critW,        critR: 0.5 + critW,
    hitR:   0.5 + hitW,         grazeR: 0.5 + hitW + 0.18,
  }
}

function getResult(pos: number, round: number): ShotResult {
  const z = getZones(round)
  if (pos >= z.critL  && pos <= z.critR)  return 'critical'
  if (pos >= z.hitL   && pos <= z.hitR)   return 'hit'
  if (pos >= z.grazeL && pos <= z.grazeR) return 'graze'
  return 'miss'
}

const RESULT_DAMAGE: Record<string, number> = { critical: 2, hit: 1, graze: 1, miss: 0 }
const RESULT_LABEL:  Record<string, string>  = { critical: 'Critical!', hit: 'Hit!', graze: 'Graze', miss: 'Miss' }
const RESULT_COLOR:  Record<string, string>  = { critical: '#fbbf24', hit: '#4ade80', graze: '#94a3b8', miss: '#6b7280' }

export default function CannonGame({ shipImageUrl }: { shipImageUrl: string }) {
  const [phase, setPhase]               = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]         = useState(PLAYER_HP_MAX)
  const [enemyHP, setEnemyHP]           = useState(ENEMY_HP_BASE)
  const [enemyHPMax, setEnemyHPMax]     = useState(ENEMY_HP_BASE)
  const [streak, setStreak]             = useState(0)
  const [best, setBest]                 = useState(0)
  const [shotResult, setShotResult]     = useState<ShotResult>(null)
  const [parryState, setParryState]     = useState<ParryState>('none')
  const [parryPct, setParryPct]         = useState(1)   // parry window remaining
  const [enemyFirePct, setEnemyFirePct] = useState(1)   // countdown to next shot
  const [enemyHit, setEnemyHit]         = useState(false)
  const [playerHit, setPlayerHit]       = useState(false)

  const posRef          = useRef(0)
  const dirRef          = useRef(1)
  const roundRef        = useRef(0)
  const streakRef       = useRef(0)
  const playerHPRef     = useRef(PLAYER_HP_MAX)
  const enemyHPRef      = useRef(ENEMY_HP_BASE)
  const enemyHPMaxRef   = useRef(ENEMY_HP_BASE)
  const phaseRef        = useRef<GamePhase>('idle')
  const canFireRef      = useRef(true)
  const indicatorRef    = useRef<HTMLDivElement>(null)
  const rafRef          = useRef(0)
  const fireIntervalRef = useRef(ENEMY_FIRE_MS)
  const fireElapsedRef  = useRef(0)
  const parryStateRef   = useRef<ParryState>('none')
  const parryElapsedRef = useRef(0)

  const parryWindowMs = () => Math.max(300, PARRY_WINDOW_MS - roundRef.current * PARRY_WINDOW_DEC)

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
    parryStateRef.current   = 'none'
    parryElapsedRef.current = 0
    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(PLAYER_HP_MAX)
    setEnemyHP(ENEMY_HP_BASE)
    setEnemyHPMax(ENEMY_HP_BASE)
    setStreak(0)
    setShotResult(null)
    setParryState('none')
    setEnemyFirePct(1)
    setParryPct(1)
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    let lastTime = performance.now()

    function loop(now: number) {
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

      // Move bar indicator
      const speed = SPEED_BASE + roundRef.current * SPEED_INC
      posRef.current += speed * (dt / 16.67) * dirRef.current
      if (posRef.current >= 1) { posRef.current = 1; dirRef.current = -1 }
      if (posRef.current <= 0) { posRef.current = 0; dirRef.current =  1 }
      if (indicatorRef.current) {
        indicatorRef.current.style.left = `calc(${posRef.current * 100}% - 2px)`
      }

      if (parryStateRef.current === 'incoming') {
        // Parry window countdown
        parryElapsedRef.current += dt
        const pct = 1 - parryElapsedRef.current / parryWindowMs()
        setParryPct(Math.max(0, pct))

        if (parryElapsedRef.current >= parryWindowMs()) {
          // Missed parry — take damage
          parryStateRef.current = 'failed'
          setParryState('failed')
          playerHPRef.current--
          setPlayerHP(playerHPRef.current)
          setPlayerHit(true)
          setTimeout(() => setPlayerHit(false), 450)
          setTimeout(() => { parryStateRef.current = 'none'; setParryState('none') }, 600)

          if (playerHPRef.current <= 0) {
            phaseRef.current = 'dead'
            setBest(prev => Math.max(prev, streakRef.current))
            setPhase('dead')
            return
          }
          // Reset fire countdown
          fireElapsedRef.current = 0
          setEnemyFirePct(1)
        }
      } else {
        // Enemy fire countdown
        fireElapsedRef.current += dt
        const pct = 1 - fireElapsedRef.current / fireIntervalRef.current
        setEnemyFirePct(Math.max(0, pct))

        if (fireElapsedRef.current >= fireIntervalRef.current) {
          // Open parry window
          fireElapsedRef.current  = 0
          parryElapsedRef.current = 0
          parryStateRef.current   = 'incoming'
          setParryState('incoming')
          setParryPct(1)
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
    const res = getResult(posRef.current, roundRef.current)
    setShotResult(res)
    const dmg = res ? RESULT_DAMAGE[res] : 0

    if (dmg > 0) {
      enemyHPRef.current = Math.max(0, enemyHPRef.current - dmg)
      setEnemyHP(enemyHPRef.current)
      setEnemyHit(true)
      setTimeout(() => setEnemyHit(false), 350)

      if (enemyHPRef.current <= 0) {
        roundRef.current++
        streakRef.current++
        setStreak(streakRef.current)
        const newMax = ENEMY_HP_BASE + Math.floor(roundRef.current / 2)
        enemyHPMaxRef.current   = newMax
        enemyHPRef.current      = newMax
        fireIntervalRef.current = Math.max(1400, ENEMY_FIRE_MS - roundRef.current * ENEMY_FIRE_DEC)
        fireElapsedRef.current  = 0
        parryStateRef.current   = 'none'
        parryElapsedRef.current = 0
        setEnemyHP(newMax)
        setEnemyHPMax(newMax)
        setEnemyFirePct(1)
        setParryState('none')
      }
    }

    setTimeout(() => { canFireRef.current = true; setShotResult(null) }, 550)
  }, [])

  const parry = useCallback(() => {
    if (parryStateRef.current !== 'incoming') return
    parryStateRef.current   = 'success'
    parryElapsedRef.current = 0
    fireElapsedRef.current  = 0
    setParryState('success')
    setEnemyFirePct(1)
    setTimeout(() => { parryStateRef.current = 'none'; setParryState('none') }, 500)
  }, [])

  const zones = getZones(roundRef.current)
  const isIncoming = parryState === 'incoming'

  return (
    <div className="flex flex-col items-center gap-5 select-none" style={{ userSelect: 'none' }}>

      {/* Enemy */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="font-karla font-600 text-[#f0ede8]" style={{ fontSize: '0.8rem' }}>Enemy Ship</span>
          <span className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#9a9488' }}>Round {roundRef.current + 1}</span>
        </div>
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
        <motion.div
          animate={enemyHit ? { x: [0, -8, 6, -4, 0] } : { x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 8 }}
        >
          <img src={shipImageUrl} alt="enemy" style={{
            width: 80, height: 36, objectFit: 'contain', transform: 'scaleX(-1)',
            filter: enemyHit ? 'brightness(2) saturate(0)' : 'none', transition: 'filter 0.15s',
          }} />
        </motion.div>
      </div>

      {/* Feedback label */}
      <div style={{ height: 26 }}>
        <AnimatePresence mode="wait">
          {shotResult && (
            <motion.p key={shotResult} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: RESULT_COLOR[shotResult], textAlign: 'center' }}>
              {RESULT_LABEL[shotResult]}
            </motion.p>
          )}
          {parryState === 'success' && (
            <motion.p key="parry-success" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#38bdf8', textAlign: 'center' }}>
              Parried!
            </motion.p>
          )}
          {parryState === 'failed' && (
            <motion.p key="parry-fail" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#ef4444', textAlign: 'center' }}>
              Hit!
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Power bar */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{
          position: 'relative', height: 52, borderRadius: 12,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${zones.grazeL * 100}%`, width: `${(zones.grazeR - zones.grazeL) * 100}%`, background: 'rgba(148,163,184,0.15)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${zones.hitL * 100}%`,   width: `${(zones.hitR - zones.hitL) * 100}%`,     background: 'rgba(74,222,128,0.2)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${zones.critL * 100}%`,  width: `${(zones.critR - zones.critL) * 100}%`,   background: 'rgba(251,191,36,0.35)' }} />
          <div ref={indicatorRef} style={{
            position: 'absolute', top: 4, bottom: 4, width: 4, borderRadius: 2,
            background: '#f0ede8', boxShadow: '0 0 8px rgba(240,237,232,0.8)', left: '0%',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 7 }}>
          {[{ label: 'Graze', color: '#94a3b8' }, { label: 'Hit', color: '#4ade80' }, { label: '★ Critical', color: '#fbbf24' }].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: z.color }} />
              <span className="font-karla font-400" style={{ fontSize: '0.65rem', color: z.color }}>{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* FIRE + PARRY buttons */}
      <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 360 }}>
        <motion.button
          onPointerDown={phase === 'playing' ? fire : startGame}
          whileTap={{ scale: 0.95 }}
          className="font-karla font-700"
          style={{
            flex: 1, padding: '13px 0',
            background: phase === 'playing' ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.15)',
            border: `1px solid ${phase === 'playing' ? 'rgba(239,68,68,0.4)' : 'rgba(56,189,248,0.4)'}`,
            borderRadius: 14, cursor: 'pointer',
            color: phase === 'playing' ? '#ef4444' : '#38bdf8',
            fontSize: '1rem', letterSpacing: '0.06em',
          }}
        >
          {phase === 'idle' ? 'Open Fire' : phase === 'dead' ? 'Try Again' : 'FIRE'}
        </motion.button>

        {phase === 'playing' && (
          <motion.button
            onPointerDown={parry}
            whileTap={{ scale: 0.95 }}
            animate={isIncoming ? { scale: [1, 1.04, 1], boxShadow: ['0 0 0px #38bdf800', '0 0 18px #38bdf8aa', '0 0 10px #38bdf866'] } : {}}
            transition={isIncoming ? { duration: 0.35, repeat: Infinity } : {}}
            className="font-karla font-700"
            style={{
              flex: 1, padding: '13px 0',
              background: isIncoming ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isIncoming ? 'rgba(56,189,248,0.7)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 14, cursor: isIncoming ? 'pointer' : 'default',
              color: isIncoming ? '#38bdf8' : 'rgba(255,255,255,0.2)',
              fontSize: '1rem', letterSpacing: '0.06em',
              transition: 'background 0.15s, border 0.15s, color 0.15s',
            }}
          >
            PARRY
          </motion.button>
        )}
      </div>

      {/* Incoming / parry window bar */}
      {phase === 'playing' && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div className="flex justify-between px-1 mb-1">
            <span className="font-karla font-400" style={{ fontSize: '0.65rem', color: isIncoming ? '#38bdf8' : '#9a9488' }}>
              {isIncoming ? 'Parry window!' : 'Incoming fire'}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            {isIncoming ? (
              <motion.div
                style={{ height: '100%', borderRadius: 2, background: '#38bdf8', width: `${parryPct * 100}%` }}
              />
            ) : (
              <div style={{
                height: '100%', borderRadius: 2, width: `${enemyFirePct * 100}%`,
                background: enemyFirePct > 0.4 ? '#4ade80' : enemyFirePct > 0.2 ? '#fbbf24' : '#ef4444',
                transition: 'background 0.3s',
              }} />
            )}
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
          <img src={shipImageUrl} alt="your ship" style={{
            width: 80, height: 36, objectFit: 'contain',
            filter: playerHit ? 'brightness(2) saturate(0)' : 'none', transition: 'filter 0.15s',
          }} />
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
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 50 }}
            onPointerDown={startGame}
          >
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Ships Sunk</p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '3rem', margin: '0 0 4px' }}>{streak}</p>
            {best > 0 && <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.3)', fontSize: '0.75rem', marginBottom: 28 }}>Best: {best}</p>}
            {best === 0 && <div style={{ marginBottom: 28 }} />}
            <button className="font-karla font-700" style={{ padding: '11px 34px', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 12, color: '#38bdf8', fontSize: '0.9rem', letterSpacing: '0.04em', cursor: 'pointer' }}>
              Try Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
