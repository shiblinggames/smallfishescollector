'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { claimCannonLoot } from './actions'

type GamePhase   = 'idle' | 'playing' | 'clear' | 'dead'
type ShotResult  = 'miss' | 'graze' | 'hit' | 'critical' | null
type ParryState  = 'none' | 'incoming' | 'success' | 'half' | 'failed'
type ParryResult = 'full' | 'half' | 'miss'

const SPEED_BASE       = 0.006
const SPEED_INC        = 0.0008
const PARRY_SPEED_BASE = 0.009
const PARRY_SPEED_INC  = 0.001
const ENEMY_FIRE_MS    = 3200
const ENEMY_FIRE_DEC   = 120
const PARRY_WINDOW_MS  = 550   // tight baseline — NAV widens this
const PARRY_WINDOW_DEC = 12
const ENEMY_HP_BASE    = 2
const CANNON_MISS_CD   = 2400  // ms locked after a clean miss
const PARRY_MISS_CD    = 2600  // ms exposed after missing the parry zone

// ── Zone geometry ─────────────────────────────────────────────────────────────

function getFireZones(round: number, critBonus = 0) {
  const hitW  = Math.max(0.045, 0.08  - round * 0.005)
  const critW = Math.min(0.08,  Math.max(0.015, 0.032 - round * 0.002 + critBonus))
  return { grazeL: 0.5 - hitW - 0.14, hitL: 0.5 - hitW, critL: 0.5 - critW, critR: 0.5 + critW, hitR: 0.5 + hitW, grazeR: 0.5 + hitW + 0.14 }
}

function getShotResult(pos: number, round: number, critBonus = 0): ShotResult {
  const z = getFireZones(round, critBonus)
  if (pos >= z.critL && pos <= z.critR)   return 'critical'
  if (pos >= z.hitL  && pos <= z.hitR)    return 'hit'
  if (pos >= z.grazeL && pos <= z.grazeR) return 'graze'
  return 'miss'
}

function getParryZones(round: number) {
  const fullW = Math.max(0.04, 0.07  - round * 0.003)
  const halfW = Math.max(0.05, 0.10  - round * 0.003)
  return { halfL: 0.5 - fullW - halfW, fullL: 0.5 - fullW, fullR: 0.5 + fullW, halfR: 0.5 + fullW + halfW }
}

function getParryResult(pos: number, round: number): ParryResult {
  const z = getParryZones(round)
  if (pos >= z.fullL && pos <= z.fullR) return 'full'
  if (pos >= z.halfL && pos <= z.halfR) return 'half'
  return 'miss'
}

const SHOT_DAMAGE: Record<string, number> = { critical: 2, hit: 1, graze: 1, miss: 0 }
const SHOT_LABEL:  Record<string, string> = { critical: 'Critical!', hit: 'Hit!', graze: 'Graze', miss: 'Miss' }
const SHOT_COLOR:  Record<string, string> = { critical: '#fbbf24', hit: '#4ade80', graze: '#94a3b8', miss: '#6b7280' }
const PARRY_LABEL: Record<string, string> = { full: 'Parried!', half: 'Half Parry', miss: 'Hit!' }
const PARRY_COLOR: Record<string, string> = { full: '#38bdf8', half: '#fbbf24', miss: '#ef4444' }

// Base doubloons per enemy kill — scales steeply with round
function killGold(round: number, fortuneMult: number) {
  return Math.floor(40 * (round + 1) * fortuneMult)
}

function fmtGold(n: number) {
  return n.toLocaleString()
}

// ── Indicator helpers ─────────────────────────────────────────────────────────

function indicatorStyle(zone: ShotResult) {
  if (zone === 'critical') return { bg: '#fbbf24', shadow: '0 0 18px rgba(251,191,36,1), 0 0 8px rgba(251,191,36,0.7)' }
  if (zone === 'hit')      return { bg: '#4ade80', shadow: '0 0 12px rgba(74,222,128,0.85)' }
  if (zone === 'graze')    return { bg: '#94a3b8', shadow: '0 0 8px rgba(148,163,184,0.6)' }
  return { bg: 'rgba(240,237,232,0.3)', shadow: '0 0 4px rgba(240,237,232,0.12)' }
}

function parryIndicatorStyle(result: ParryResult) {
  if (result === 'full') return { bg: '#38bdf8', shadow: '0 0 16px rgba(56,189,248,1), 0 0 8px rgba(56,189,248,0.7)' }
  if (result === 'half') return { bg: '#fbbf24', shadow: '0 0 12px rgba(251,191,36,0.85)' }
  return { bg: 'rgba(240,237,232,0.25)', shadow: '0 0 4px rgba(240,237,232,0.1)' }
}

function flashBar(ref: React.RefObject<HTMLDivElement | null>, color: string) {
  if (!ref.current) return
  ref.current.style.background = color
  ref.current.style.opacity = '0.3'
  let start: number | null = null
  const fade = (t: number) => {
    if (start === null) start = t
    const p = (t - start) / 260
    if (ref.current) ref.current.style.opacity = String(Math.max(0, 0.3 * (1 - p)))
    if (p < 1) requestAnimationFrame(fade)
  }
  requestAnimationFrame(fade)
}

function snapIndicator(ref: React.RefObject<HTMLDivElement | null>) {
  const el = ref.current
  if (!el) return
  el.style.transition = 'transform 0s'
  el.style.transform = 'scaleY(2.8)'
  requestAnimationFrame(() => {
    if (!el) return
    el.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)'
    el.style.transform = 'scaleY(1)'
  })
}

// ── TimingBar ─────────────────────────────────────────────────────────────────

function TimingBar({ indicatorRef, flashRef, zones, critZone }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  flashRef:     React.RefObject<HTMLDivElement | null>
  zones: { color: string; left: number; width: number }[]
  critZone?: { left: number; width: number }
}) {
  return (
    <div style={{ position: 'relative', height: 52, borderRadius: 12 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 12,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        {zones.map((z, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${z.left * 100}%`, width: `${z.width * 100}%`,
            background: z.color,
          }} />
        ))}
        {critZone && (
          <motion.div
            animate={{ opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${critZone.left * 100}%`, width: `${critZone.width * 100}%`,
              background: 'rgba(251,191,36,0.26)', pointerEvents: 'none',
            }}
          />
        )}
        <div ref={flashRef} style={{
          position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', borderRadius: 12,
        }} />
      </div>
      <div ref={indicatorRef} style={{
        position: 'absolute', top: 5, bottom: 5, width: 4, borderRadius: 2,
        background: 'rgba(240,237,232,0.3)',
        boxShadow: '0 0 4px rgba(240,237,232,0.12)',
        left: '0%', pointerEvents: 'none', zIndex: 2,
      }} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CannonGame({
  shipImageUrl, shipName, playerHPMax,
  totalPower, totalDodge, totalFortune, crewCount,
}: {
  shipImageUrl: string
  shipName: string
  playerHPMax: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  crewCount: number
}) {
  // Derived bonuses
  const critBonus     = totalPower / 800        // wider crit zone
  const parryBonus    = totalDodge * 4          // +ms parry window per NAV point (tight baseline)
  const fortuneMult   = 1 + totalFortune / 150  // gold multiplier

  const [phase, setPhase]                 = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]           = useState(playerHPMax)
  const [enemyHP, setEnemyHP]             = useState(ENEMY_HP_BASE)
  const [enemyHPMax, setEnemyHPMax]       = useState(ENEMY_HP_BASE)
  const [streak, setStreak]               = useState(0)
  const [best, setBest]                   = useState(0)
  const [pot, setPot]                     = useState(0)
  const [lastEarned, setLastEarned]       = useState(0)
  const [shotResult, setShotResult]       = useState<ShotResult>(null)
  const [parryState, setParryState]       = useState<ParryState>('none')
  const [parryFeedback, setParryFeedback] = useState<ParryResult | null>(null)
  const [enemyFirePct, setEnemyFirePct]   = useState(1)
  const [enemyHit, setEnemyHit]           = useState(false)
  const [playerHit, setPlayerHit]         = useState(false)
  const [roundDisplay, setRoundDisplay]   = useState(1)
  const [isClaiming, setIsClaiming]       = useState(false)
  const [cannonJammed, setCannonJammed]   = useState(false)
  const [parryLocked, setParryLocked]     = useState(false)

  const fireIndicatorRef  = useRef<HTMLDivElement>(null)
  const fireFlashRef      = useRef<HTMLDivElement>(null)
  const parryIndicatorRef = useRef<HTMLDivElement>(null)
  const parryFlashRef     = useRef<HTMLDivElement>(null)

  const firePosRef      = useRef(0)
  const fireDirRef      = useRef(1)
  const parryPosRef     = useRef(0)
  const parryDirRef     = useRef(1)
  const roundRef        = useRef(0)
  const streakRef       = useRef(0)
  const potRef          = useRef(0)
  const playerHPRef     = useRef(playerHPMax)
  const enemyHPRef      = useRef(ENEMY_HP_BASE)
  const enemyHPMaxRef   = useRef(ENEMY_HP_BASE)
  const phaseRef        = useRef<GamePhase>('idle')
  const canFireRef      = useRef(true)
  const parryLockedRef  = useRef(false)
  const rafRef          = useRef(0)
  const fireIntervalRef = useRef(ENEMY_FIRE_MS)
  const fireElapsedRef  = useRef(0)
  const parryStateRef   = useRef<ParryState>('none')
  const parryElapsedRef = useRef(0)

  const parryWindowMs = useCallback(() =>
    Math.max(800, PARRY_WINDOW_MS + parryBonus - roundRef.current * PARRY_WINDOW_DEC),
  [parryBonus])

  const startGame = useCallback(() => {
    firePosRef.current      = 0; fireDirRef.current      = 1
    parryPosRef.current     = 0; parryDirRef.current     = 1
    roundRef.current        = 0; streakRef.current       = 0
    potRef.current          = 0
    playerHPRef.current     = playerHPMax
    enemyHPRef.current      = ENEMY_HP_BASE
    enemyHPMaxRef.current   = ENEMY_HP_BASE
    canFireRef.current      = true
    parryLockedRef.current  = false
    fireIntervalRef.current = ENEMY_FIRE_MS
    fireElapsedRef.current  = 0
    parryStateRef.current   = 'none'
    parryElapsedRef.current = 0
    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(playerHPMax); setEnemyHP(ENEMY_HP_BASE); setEnemyHPMax(ENEMY_HP_BASE)
    setStreak(0); setPot(0); setLastEarned(0)
    setCannonJammed(false); setParryLocked(false)
    setShotResult(null); setParryState('none'); setParryFeedback(null)
    setEnemyFirePct(1); setRoundDisplay(1)
  }, [playerHPMax])

  useEffect(() => {
    if (phase !== 'playing') return
    let lastTime = performance.now()

    function loop(now: number) {
      if (phaseRef.current !== 'playing') return
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

      // Fire bar
      const fSpeed = SPEED_BASE + roundRef.current * SPEED_INC
      firePosRef.current += fSpeed * (dt / 16.67) * fireDirRef.current
      if (firePosRef.current >= 1) { firePosRef.current = 1; fireDirRef.current = -1 }
      if (firePosRef.current <= 0) { firePosRef.current = 0; fireDirRef.current =  1 }
      if (fireIndicatorRef.current) {
        const zone = getShotResult(firePosRef.current, roundRef.current, critBonus)
        const s = indicatorStyle(zone)
        fireIndicatorRef.current.style.left       = `calc(${firePosRef.current * 100}% - 2px)`
        fireIndicatorRef.current.style.background = s.bg
        fireIndicatorRef.current.style.boxShadow  = s.shadow
      }

      if (parryStateRef.current === 'incoming') {
        // Parry bar
        const pSpeed = PARRY_SPEED_BASE + roundRef.current * PARRY_SPEED_INC
        parryPosRef.current += pSpeed * (dt / 16.67) * parryDirRef.current
        if (parryPosRef.current >= 1) { parryPosRef.current = 1; parryDirRef.current = -1 }
        if (parryPosRef.current <= 0) { parryPosRef.current = 0; parryDirRef.current =  1 }
        if (parryIndicatorRef.current) {
          const res = getParryResult(parryPosRef.current, roundRef.current)
          const s = parryIndicatorStyle(res)
          parryIndicatorRef.current.style.left       = `calc(${parryPosRef.current * 100}% - 2px)`
          parryIndicatorRef.current.style.background = s.bg
          parryIndicatorRef.current.style.boxShadow  = s.shadow
        }

        parryElapsedRef.current += dt
        setEnemyFirePct(Math.max(0, 1 - parryElapsedRef.current / parryWindowMs()))

        if (parryElapsedRef.current >= parryWindowMs()) {
          parryStateRef.current = 'failed'
          setParryState('failed'); setParryFeedback('miss')
          playerHPRef.current--
          setPlayerHP(playerHPRef.current)
          setPlayerHit(true)
          flashBar(parryFlashRef, '#ef4444')
          setTimeout(() => setPlayerHit(false), 450)
          setTimeout(() => { parryStateRef.current = 'none'; setParryState('none'); setParryFeedback(null) }, 700)
          if (playerHPRef.current <= 0) {
            phaseRef.current = 'dead'
            setBest(prev => Math.max(prev, streakRef.current))
            setPhase('dead'); return
          }
          fireElapsedRef.current = 0; setEnemyFirePct(1)
        }
      } else {
        // Enemy countdown
        fireElapsedRef.current += dt
        setEnemyFirePct(Math.max(0, 1 - fireElapsedRef.current / fireIntervalRef.current))

        if (fireElapsedRef.current >= fireIntervalRef.current) {
          fireElapsedRef.current = 0
          parryElapsedRef.current = 0
          parryPosRef.current = 0; parryDirRef.current = 1
          parryStateRef.current = 'incoming'
          setParryState('incoming')
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, critBonus, parryWindowMs])

  const fire = useCallback(() => {
    if (phaseRef.current !== 'playing' || !canFireRef.current) return
    canFireRef.current = false
    const res = getShotResult(firePosRef.current, roundRef.current, critBonus)
    setShotResult(res)
    snapIndicator(fireIndicatorRef)
    flashBar(fireFlashRef, res === 'critical' ? '#fbbf24' : res === 'hit' ? '#4ade80' : res === 'graze' ? '#94a3b8' : '#6b7280')

    const dmg = res ? SHOT_DAMAGE[res] : 0
    if (dmg > 0) {
      enemyHPRef.current = Math.max(0, enemyHPRef.current - dmg)
      setEnemyHP(enemyHPRef.current)
      setEnemyHit(true)
      setTimeout(() => setEnemyHit(false), 350)

      if (enemyHPRef.current <= 0) {
        streakRef.current++
        setStreak(streakRef.current)

        const earned = killGold(roundRef.current, fortuneMult)
        potRef.current += earned
        setPot(potRef.current)
        setLastEarned(earned)

        roundRef.current++
        setRoundDisplay(roundRef.current + 1)
        const newMax = ENEMY_HP_BASE + Math.floor(roundRef.current / 2)
        enemyHPMaxRef.current = newMax; enemyHPRef.current = newMax
        fireIntervalRef.current = Math.max(1200, ENEMY_FIRE_MS - roundRef.current * ENEMY_FIRE_DEC)
        fireElapsedRef.current = 0
        parryStateRef.current = 'none'; parryElapsedRef.current = 0
        setEnemyHP(newMax); setEnemyHPMax(newMax)
        setEnemyFirePct(1); setParryState('none')

        phaseRef.current = 'clear'
        setTimeout(() => setPhase('clear'), 320)
        return
      }
    }

    if (res === 'miss') {
      // Jammed — can't fire for a few seconds
      setCannonJammed(true)
      setTimeout(() => {
        canFireRef.current = true
        setShotResult(null)
        setCannonJammed(false)
      }, CANNON_MISS_CD)
    } else {
      setTimeout(() => { canFireRef.current = true; setShotResult(null) }, 550)
    }
  }, [critBonus, fortuneMult])

  const parry = useCallback(() => {
    if (parryStateRef.current !== 'incoming' || parryLockedRef.current) return
    const res = getParryResult(parryPosRef.current, roundRef.current)
    parryStateRef.current = res === 'full' ? 'success' : 'half'
    setParryFeedback(res)
    snapIndicator(parryIndicatorRef)
    flashBar(parryFlashRef, res === 'full' ? '#38bdf8' : res === 'half' ? '#fbbf24' : '#ef4444')

    if (res === 'miss') {
      playerHPRef.current--
      setPlayerHP(playerHPRef.current)
      setPlayerHit(true)
      setTimeout(() => setPlayerHit(false), 450)
      // Exposed — parry locked for a few seconds
      parryLockedRef.current = true
      setParryLocked(true)
      setTimeout(() => { parryLockedRef.current = false; setParryLocked(false) }, PARRY_MISS_CD)
      if (playerHPRef.current <= 0) {
        phaseRef.current = 'dead'
        setBest(prev => Math.max(prev, streakRef.current))
        setPhase('dead'); return
      }
    } else if (res === 'half') {
      playerHPRef.current = Math.max(0, playerHPRef.current - 1)
      setPlayerHP(playerHPRef.current)
      setPlayerHit(true)
      setTimeout(() => setPlayerHit(false), 300)
      if (playerHPRef.current <= 0) {
        parryStateRef.current = 'failed'
        phaseRef.current = 'dead'
        setBest(prev => Math.max(prev, streakRef.current))
        setPhase('dead'); return
      }
    }

    parryElapsedRef.current = 0; fireElapsedRef.current = 0
    setEnemyFirePct(1)
    setTimeout(() => { parryStateRef.current = 'none'; setParryState('none'); setParryFeedback(null) }, 600)
  }, [])

  const advance = useCallback(() => {
    canFireRef.current = true
    setShotResult(null)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  const retreat = useCallback(async () => {
    if (isClaiming) return
    setIsClaiming(true)
    try {
      await claimCannonLoot(potRef.current)
    } finally {
      setIsClaiming(false)
    }
    setBest(prev => Math.max(prev, streakRef.current))
    phaseRef.current = 'idle'
    setPhase('idle')
  }, [isClaiming])

  const fZones = getFireZones(roundRef.current, critBonus)
  const pZones = getParryZones(roundRef.current)
  const isIncoming = parryState === 'incoming'

  const fireBarZones = [
    { color: 'rgba(148,163,184,0.12)', left: fZones.grazeL, width: fZones.hitL   - fZones.grazeL },
    { color: 'rgba(74,222,128,0.18)',  left: fZones.hitL,   width: fZones.critL  - fZones.hitL   },
    { color: 'rgba(251,191,36,0.22)',  left: fZones.critL,  width: fZones.critR  - fZones.critL  },
    { color: 'rgba(74,222,128,0.18)',  left: fZones.critR,  width: fZones.hitR   - fZones.critR  },
    { color: 'rgba(148,163,184,0.12)', left: fZones.hitR,   width: fZones.grazeR - fZones.hitR   },
  ]

  const parryBarZones = [
    { color: 'rgba(251,191,36,0.18)',  left: pZones.halfL,  width: pZones.fullL - pZones.halfL },
    { color: 'rgba(56,189,248,0.28)',  left: pZones.fullL,  width: pZones.fullR - pZones.fullL },
    { color: 'rgba(251,191,36,0.18)',  left: pZones.fullR,  width: pZones.halfR - pZones.fullR },
  ]

  return (
    <div className="flex flex-col items-center gap-5 select-none" style={{ userSelect: 'none' }}>

      {/* Enemy section */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="font-karla font-600 text-[#f0ede8]" style={{ fontSize: '0.8rem' }}>Enemy Ship</span>
          <div className="flex items-center gap-3">
            {phase === 'playing' || phase === 'clear' ? (
              <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0c040' }}>
                ⟡ {fmtGold(pot)}
              </span>
            ) : null}
            <span className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#9a9488' }}>Round {roundDisplay}</span>
          </div>
        </div>
        <div className="flex gap-2 mb-3 px-1">
          {Array.from({ length: enemyHPMax }).map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i < enemyHP ? '#ef4444' : 'rgba(255,255,255,0.1)',
              boxShadow: i < enemyHP ? '0 0 6px #ef444488' : 'none', transition: 'background 0.15s',
            }} />
          ))}
        </div>
        <motion.div animate={enemyHit ? { x: [0, -8, 6, -4, 0] } : { x: 0 }} transition={{ duration: 0.3 }}
          style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 8 }}>
          <img src={shipImageUrl} alt="enemy" style={{
            width: 80, height: 36, objectFit: 'contain', transform: 'scaleX(-1)',
            filter: enemyHit ? 'brightness(2) saturate(0)' : 'none', transition: 'filter 0.15s',
          }} />
        </motion.div>
      </div>

      {/* Feedback */}
      <div style={{ height: 26 }}>
        <AnimatePresence mode="wait">
          {shotResult && !parryFeedback && (
            <motion.p key={shotResult} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: SHOT_COLOR[shotResult], textAlign: 'center' }}>
              {SHOT_LABEL[shotResult]}
            </motion.p>
          )}
          {parryFeedback && (
            <motion.p key={`parry-${parryFeedback}`} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: PARRY_COLOR[parryFeedback], textAlign: 'center' }}>
              {PARRY_LABEL[parryFeedback]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Fire bar */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        <p className="font-karla font-400 px-1 mb-2" style={{ fontSize: '0.68rem', color: '#9a9488', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Cannon</p>
        <TimingBar
          indicatorRef={fireIndicatorRef}
          flashRef={fireFlashRef}
          zones={fireBarZones}
          critZone={{ left: fZones.critL, width: fZones.critR - fZones.critL }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 7 }}>
          {[{ label: 'Graze', color: '#94a3b8' }, { label: 'Hit', color: '#4ade80' }, { label: '★ Critical', color: '#fbbf24' }].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: z.color }} />
              <span className="font-karla font-400" style={{ fontSize: '0.65rem', color: z.color }}>{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Parry bar */}
      <div style={{ width: '100%', maxWidth: 360, minHeight: 80 }}>
        <AnimatePresence>
          {isIncoming && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="font-karla font-400 px-1 mb-2" style={{ fontSize: '0.68rem', color: '#38bdf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Incoming — Parry!
              </p>
              <TimingBar
                indicatorRef={parryIndicatorRef}
                flashRef={parryFlashRef}
                zones={parryBarZones}
                critZone={{ left: pZones.fullL, width: pZones.fullR - pZones.fullL }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 7 }}>
                {[{ label: 'Half', color: '#fbbf24' }, { label: 'Full Parry', color: '#38bdf8' }].map(z => (
                  <div key={z.label} className="flex items-center gap-1">
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: z.color }} />
                    <span className="font-karla font-400" style={{ fontSize: '0.65rem', color: z.color }}>{z.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Countdown bar */}
      {phase === 'playing' && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${enemyFirePct * 100}%`,
              background: isIncoming ? '#38bdf8' : enemyFirePct > 0.4 ? '#4ade80' : enemyFirePct > 0.2 ? '#fbbf24' : '#ef4444',
              transition: 'background 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 360 }}>
        <motion.button
          onPointerDown={phase === 'playing' && !cannonJammed ? fire : phase === 'idle' ? startGame : undefined}
          whileTap={!cannonJammed ? { scale: 0.95 } : {}}
          className="font-karla font-700"
          style={{
            flex: 1, padding: '13px 0',
            background: cannonJammed        ? 'rgba(251,146,60,0.1)'
                      : phase === 'playing' ? 'rgba(239,68,68,0.15)'
                      :                       'rgba(56,189,248,0.15)',
            border: `1px solid ${
              cannonJammed        ? 'rgba(251,146,60,0.3)'
              : phase === 'playing' ? 'rgba(239,68,68,0.4)'
              :                       'rgba(56,189,248,0.4)'
            }`,
            borderRadius: 14,
            cursor: (phase === 'clear' || cannonJammed) ? 'default' : 'pointer',
            color: cannonJammed        ? '#f97316'
                 : phase === 'playing' ? '#ef4444'
                 :                       '#38bdf8',
            fontSize: cannonJammed ? '0.78rem' : '1rem',
            letterSpacing: '0.06em',
            opacity: phase === 'clear' ? 0 : cannonJammed ? 0.7 : 1,
            pointerEvents: phase === 'clear' ? 'none' : 'auto',
            transition: 'all 0.15s',
          }}>
          {phase === 'idle'    ? 'Open Fire'
         : cannonJammed        ? 'Jammed…'
         : phase === 'playing' ? 'FIRE'
         :                       'Try Again'}
        </motion.button>

        {phase === 'playing' && (
          <motion.button
            onPointerDown={!parryLocked ? parry : undefined}
            whileTap={!parryLocked ? { scale: 0.95 } : {}}
            animate={
              parryLocked   ? { boxShadow: ['0 0 0px #ef444400', '0 0 10px #ef444455', '0 0 0px #ef444400'] }
              : isIncoming  ? { boxShadow: ['0 0 0px #38bdf800', '0 0 16px #38bdf8aa', '0 0 8px #38bdf866'] }
              : {}
            }
            transition={{ duration: 0.5, repeat: Infinity }}
            className="font-karla font-700"
            style={{
              flex: 1, padding: '13px 0',
              background: parryLocked  ? 'rgba(239,68,68,0.08)'
                        : isIncoming   ? 'rgba(56,189,248,0.2)'
                        :                'rgba(255,255,255,0.04)',
              border: `1px solid ${
                parryLocked  ? 'rgba(239,68,68,0.3)'
                : isIncoming ? 'rgba(56,189,248,0.65)'
                :              'rgba(255,255,255,0.1)'
              }`,
              borderRadius: 14,
              cursor: (isIncoming && !parryLocked) ? 'pointer' : 'default',
              color: parryLocked  ? '#ef4444'
                   : isIncoming   ? '#38bdf8'
                   :                'rgba(255,255,255,0.18)',
              fontSize: parryLocked ? '0.78rem' : '1rem',
              letterSpacing: '0.06em',
              opacity: parryLocked ? 0.65 : 1,
              transition: 'background 0.15s, border 0.15s, color 0.15s',
            }}>
            {parryLocked ? 'Exposed…' : 'PARRY'}
          </motion.button>
        )}
      </div>

      {/* Player ship + HP */}
      <div className="w-full max-w-sm">
        <motion.div animate={playerHit ? { x: [0, 8, -6, 4, 0] } : { x: 0 }} transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 8 }}>
          <img src={shipImageUrl} alt="your ship" style={{
            width: 80, height: 36, objectFit: 'contain',
            filter: playerHit ? 'brightness(2) saturate(0)' : 'none', transition: 'filter 0.15s',
          }} />
          <div className="flex gap-2">
            {Array.from({ length: playerHPMax }).map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < playerHP ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                boxShadow: i < playerHP ? '0 0 6px #38bdf888' : 'none', transition: 'background 0.15s',
              }} />
            ))}
          </div>
        </motion.div>

        {/* Crew stat badges — shown on idle */}
        {phase === 'idle' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex gap-3 flex-wrap mt-3 px-2">
            <span className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
              {shipName} · {playerHPMax} HP
            </span>
            {crewCount > 0 ? (
              <>
                {totalPower  > 0 && <span style={{ fontSize: '0.62rem', color: '#f87171', fontFamily: 'var(--font-karla)' }}>PWR {totalPower}</span>}
                {totalDodge  > 0 && <span style={{ fontSize: '0.62rem', color: '#60a5fa', fontFamily: 'var(--font-karla)' }}>NAV {totalDodge}</span>}
                {totalFortune > 0 && <span style={{ fontSize: '0.62rem', color: '#f0c040', fontFamily: 'var(--font-karla)' }}>FTN {totalFortune}</span>}
              </>
            ) : (
              <span style={{ fontSize: '0.62rem', color: '#4a4845', fontFamily: 'var(--font-karla)' }}>No crew assigned</span>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Round clear overlay ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'clear' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.78)', zIndex: 50,
            }}>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              Enemy Sunk
            </p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '1.6rem', marginBottom: 4 }}>
              Round {roundDisplay - 1} Clear
            </p>
            <motion.p
              key={lastEarned}
              initial={{ opacity: 0, y: -4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="font-karla font-700"
              style={{ color: '#f0c040', fontSize: '1.1rem', marginBottom: 2 }}>
              +{fmtGold(lastEarned)} ⟡
            </motion.p>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.75rem', marginBottom: 36 }}>
              Pot: {fmtGold(pot)} ⟡
            </p>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column', width: 240 }}>
              <motion.button
                onPointerDown={advance} whileTap={{ scale: 0.96 }}
                className="font-karla font-700"
                style={{
                  padding: '13px 0', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.18)',
                  border: '1px solid rgba(239,68,68,0.5)',
                  color: '#ef4444', fontSize: '0.95rem', letterSpacing: '0.06em',
                }}>
                Advance →
              </motion.button>
              <motion.button
                onPointerDown={retreat} whileTap={{ scale: 0.96 }}
                disabled={isClaiming}
                className="font-karla font-600"
                style={{
                  padding: '13px 0', borderRadius: 14, cursor: isClaiming ? 'default' : 'pointer',
                  background: 'rgba(240,197,64,0.12)',
                  border: '1px solid rgba(240,197,64,0.35)',
                  color: '#f0c040', fontSize: '0.88rem', letterSpacing: '0.04em',
                  opacity: isClaiming ? 0.6 : 1,
                }}>
                {isClaiming ? 'Banking…' : `Retreat — Bank ${fmtGold(pot)} ⟡`}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dead overlay ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'dead' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.78)', zIndex: 50,
            }}
            onPointerDown={startGame}>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              Lost at Sea
            </p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '3rem', margin: '0 0 4px' }}>{streak}</p>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.3)', fontSize: '0.7rem', marginBottom: 4 }}>
              {streak === 1 ? '1 ship sunk' : `${streak} ships sunk`}
            </p>
            {pot > 0 && (
              <p className="font-karla font-400" style={{ color: 'rgba(239,68,68,0.55)', fontSize: '0.8rem', marginBottom: 4 }}>
                Lost {fmtGold(pot)} ⟡
              </p>
            )}
            {best > 0 && (
              <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.25)', fontSize: '0.7rem', marginBottom: 28 }}>
                Best: {best}
              </p>
            )}
            {best === 0 && <div style={{ marginBottom: 28 }} />}
            <button className="font-karla font-700" style={{
              padding: '11px 34px',
              background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)',
              borderRadius: 12, color: '#38bdf8', fontSize: '0.9rem', letterSpacing: '0.04em', cursor: 'pointer',
            }}>
              Try Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
