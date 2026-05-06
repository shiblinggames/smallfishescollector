'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { claimCannonLoot } from './actions'

type GamePhase   = 'idle' | 'playing' | 'clear' | 'dead'
type ShotResult  = 'miss' | 'graze' | 'hit' | 'critical' | null
type ParryState  = 'none' | 'incoming' | 'success' | 'half' | 'failed'
type ParryResult = 'full' | 'half' | 'miss'

const MAX_CHARGES      = 3
const SPEED_BASE       = 0.006
const SPEED_INC        = 0.0008
const PARRY_SPEED_BASE = 0.009
const PARRY_SPEED_INC  = 0.001
const ENEMY_FIRE_MS    = 3200
const ENEMY_FIRE_DEC   = 120
const PARRY_WINDOW_MS  = 550
const PARRY_WINDOW_DEC = 12
const ENEMY_HP_BASE    = 2
const CANNON_MISS_CD   = 2400
const PARRY_MISS_CD    = 2600
const INCOMING_DAMAGE  = 10

// ── Enemy scaling ─────────────────────────────────────────────────────────────

function isBossRound(round: number) { return round > 0 && round % 5 === 0 }
function getEnemyHPMax(round: number) {
  const base = ENEMY_HP_BASE + Math.floor(round / 2)
  return isBossRound(round) ? base + 10 : base
}

// ── Zone geometry ─────────────────────────────────────────────────────────────

function getFireZones(round: number, critBonus = 0) {
  const hitW  = Math.max(0.045, 0.08  - round * 0.005)
  const critW = Math.min(0.08,  Math.max(0.015, 0.032 - round * 0.002 + critBonus))
  return { grazeL: 0.5 - hitW - 0.05, hitL: 0.5 - hitW, critL: 0.5 - critW, critR: 0.5 + critW, hitR: 0.5 + hitW, grazeR: 0.5 + hitW + 0.05 }
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

const BASE_SHOT_DAMAGE: Record<string, number> = { critical: 2, hit: 1, graze: 1, miss: 0 }
const SHOT_LABEL: Record<string, string>       = { critical: 'Critical!', hit: 'Hit!', graze: 'Graze', miss: 'Miss' }
const SHOT_COLOR: Record<string, string>       = { critical: '#fbbf24', hit: '#4ade80', graze: '#94a3b8', miss: '#6b7280' }
const PARRY_LABEL: Record<string, string>      = { full: 'Parried!', half: 'Half Parry', miss: 'Hit!' }
const PARRY_COLOR: Record<string, string>      = { full: '#38bdf8', half: '#fbbf24', miss: '#ef4444' }

function killGold(round: number, fortuneMult: number, isVolley: boolean) {
  return Math.floor(40 * (round + 1) * fortuneMult * (isVolley ? 1.5 : 1))
}
function fmtGold(n: number) { return n.toLocaleString() }

// ── Indicator helpers ─────────────────────────────────────────────────────────

function indicatorStyle(zone: ShotResult) {
  if (zone === 'critical') return { bg: '#fbbf24', shadow: '0 0 18px rgba(251,191,36,1), 0 0 8px rgba(251,191,36,0.7)' }
  if (zone === 'hit')      return { bg: '#4ade80', shadow: '0 0 12px rgba(74,222,128,0.85)' }
  if (zone === 'graze')    return { bg: '#94a3b8', shadow: '0 0 8px rgba(148,163,184,0.6)' }
  return { bg: 'rgba(240,237,232,0.3)', shadow: '0 0 4px rgba(240,237,232,0.12)' }
}

function parryIndicatorStyle(result: ParryResult) {
  if (result === 'full') return { bg: '#38bdf8', shadow: '0 0 16px rgba(56,189,248,1)' }
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

// ── Sub-components ────────────────────────────────────────────────────────────

function Hitsplat({ text, color, big, animKey }: { text: string; color: string; big?: boolean; animKey: number }) {
  return (
    <div key={animKey} style={{
      position: 'absolute', top: '40%', left: '50%',
      animation: 'hitsplat-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards',
      pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap',
    }}>
      <div style={{
        background: 'rgba(8,6,4,0.9)',
        border: `2px solid ${color}`,
        borderRadius: big ? 10 : 6,
        padding: big ? '0.28rem 0.65rem' : '0.15rem 0.42rem',
        boxShadow: big ? `0 0 14px ${color}88` : `0 0 6px ${color}55`,
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: big ? '0.95rem' : '0.7rem', color, lineHeight: 1,
          textShadow: big ? `0 0 12px ${color}` : 'none',
        }}>{text}</p>
      </div>
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '0.2rem 0' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color, lineHeight: 1.1 }}>{value}</p>
      <p className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.4rem', color: '#4a4845', marginTop: 2 }}>{label}</p>
    </div>
  )
}

function HPBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = max > 0 ? (current / max) * 100 : 0
  const barColor = pct < 30 ? '#f87171' : pct < 60 ? '#f0c040' : color
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <p className="font-karla" style={{ fontSize: '0.38rem', color: '#4a4845' }}>HP</p>
        <p className="font-karla font-600" style={{ fontSize: '0.44rem', color: barColor }}>{current}/{max}</p>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.35s ease, background 0.35s ease' }} />
      </div>
    </div>
  )
}

function TimingBar({ indicatorRef, flashRef, zones, critZone }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  flashRef:     React.RefObject<HTMLDivElement | null>
  zones: { color: string; left: number; width: number }[]
  critZone?: { left: number; width: number }
}) {
  return (
    <div style={{ position: 'relative', height: 48, borderRadius: 12 }}>
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
        <div ref={flashRef} style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }} />
      </div>
      <div ref={indicatorRef} style={{
        position: 'absolute', top: 5, bottom: 5, width: 4, borderRadius: 2,
        background: 'rgba(240,237,232,0.3)', boxShadow: '0 0 4px rgba(240,237,232,0.12)',
        left: '0%', pointerEvents: 'none', zIndex: 2,
      }} />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CannonGame({
  shipImageUrl, shipName, playerHPMax, shipSpeed,
  totalPower, totalDodge, totalFortune, crewCount,
}: {
  shipImageUrl: string
  shipName: string
  playerHPMax: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  crewCount: number
}) {
  const critBonus      = totalPower / 800
  const parryBonus     = totalDodge * 4
  const fortuneMult    = 1 + totalFortune / 150
  const reloadCooldown = Math.max(600, 2200 - shipSpeed * 110)

  const [phase, setPhase]                     = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]               = useState(playerHPMax)
  const [enemyHP, setEnemyHP]                 = useState(ENEMY_HP_BASE)
  const [enemyHPMax, setEnemyHPMax]           = useState(ENEMY_HP_BASE)
  const [charges, setCharges]                 = useState(1)
  const [canReload, setCanReload]             = useState(true)
  const [streak, setStreak]                   = useState(0)
  const [best, setBest]                       = useState(0)
  const [pot, setPot]                         = useState(0)
  const [lastEarned, setLastEarned]           = useState(0)
  const [shotResult, setShotResult]           = useState<ShotResult>(null)
  const [parryState, setParryState]           = useState<ParryState>('none')
  const [parryFeedback, setParryFeedback]     = useState<ParryResult | null>(null)
  const [enemyFirePct, setEnemyFirePct]       = useState(1)
  const [roundDisplay, setRoundDisplay]       = useState(1)
  const [isBoss, setIsBoss]                   = useState(false)
  const [isClaiming, setIsClaiming]           = useState(false)
  const [cannonJammed, setCannonJammed]       = useState(false)
  const [parryLocked, setParryLocked]         = useState(false)
  const [enemySinking, setEnemySinking]       = useState(false)
  const [showCannonShot, setShowCannonShot]   = useState(false)
  const [isVolleyShot, setIsVolleyShot]       = useState(false)
  const [clearReady, setClearReady]           = useState(false)
  // Hitsplat state
  const [pHitsplat, setPHitsplat]             = useState({ key: 0, text: '', color: '', big: false })
  const [eHitsplat, setEHitsplat]             = useState({ key: 0, text: '', color: '', big: false })

  const fireIndicatorRef  = useRef<HTMLDivElement>(null)
  const fireFlashRef      = useRef<HTMLDivElement>(null)
  const parryIndicatorRef = useRef<HTMLDivElement>(null)
  const parryFlashRef     = useRef<HTMLDivElement>(null)

  const firePosRef        = useRef(0)
  const fireDirRef        = useRef(1)
  const parryPosRef       = useRef(0)
  const parryDirRef       = useRef(1)
  const roundRef          = useRef(0)
  const streakRef         = useRef(0)
  const potRef            = useRef(0)
  const playerHPRef       = useRef(playerHPMax)
  const enemyHPRef        = useRef(ENEMY_HP_BASE)
  const enemyHPMaxRef     = useRef(ENEMY_HP_BASE)
  const phaseRef          = useRef<GamePhase>('idle')
  const canFireRef        = useRef(true)
  const chargesRef        = useRef(1)
  const canReloadRef      = useRef(true)
  const parryLockedRef    = useRef(false)
  const roundEndingRef    = useRef(false)
  const rafRef            = useRef(0)
  const fireIntervalRef   = useRef(ENEMY_FIRE_MS)
  const fireElapsedRef    = useRef(0)
  const parryStateRef     = useRef<ParryState>('none')
  const parryElapsedRef   = useRef(0)

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
    chargesRef.current      = 1
    canReloadRef.current    = true
    parryLockedRef.current  = false
    roundEndingRef.current  = false
    fireIntervalRef.current = ENEMY_FIRE_MS
    fireElapsedRef.current  = 0
    parryStateRef.current   = 'none'
    parryElapsedRef.current = 0
    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(playerHPMax); setEnemyHP(ENEMY_HP_BASE); setEnemyHPMax(ENEMY_HP_BASE)
    setCharges(1); setCanReload(true)
    setStreak(0); setPot(0); setLastEarned(0)
    setCannonJammed(false); setParryLocked(false); setIsBoss(false)
    setShotResult(null); setParryState('none'); setParryFeedback(null)
    setEnemyFirePct(1); setRoundDisplay(1); setEnemySinking(false)
    setShowCannonShot(false); setClearReady(false)
  }, [playerHPMax])

  useEffect(() => {
    if (phase !== 'playing') return
    let lastTime = performance.now()

    function loop(now: number) {
      if (phaseRef.current !== 'playing') return
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

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

      if (roundEndingRef.current) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      if (parryStateRef.current === 'incoming') {
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
          playerHPRef.current = Math.max(0, playerHPRef.current - INCOMING_DAMAGE)
          setPlayerHP(playerHPRef.current)
          setPHitsplat(p => ({ key: p.key + 1, text: `-${INCOMING_DAMAGE}`, color: '#f87171', big: true }))
          flashBar(parryFlashRef, '#ef4444')
          setTimeout(() => { parryStateRef.current = 'none'; setParryState('none'); setParryFeedback(null) }, 700)
          if (playerHPRef.current <= 0) {
            phaseRef.current = 'dead'
            setBest(prev => Math.max(prev, streakRef.current))
            setPhase('dead'); return
          }
          fireElapsedRef.current = 0; setEnemyFirePct(1)
        }
      } else {
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

  const doReload = useCallback(() => {
    if (phaseRef.current !== 'playing' || !canReloadRef.current || chargesRef.current >= MAX_CHARGES) return
    chargesRef.current = Math.min(MAX_CHARGES, chargesRef.current + 1)
    setCharges(chargesRef.current)
    canReloadRef.current = false
    setCanReload(false)
    setTimeout(() => { canReloadRef.current = true; setCanReload(true) }, reloadCooldown)
  }, [reloadCooldown])

  const fire = useCallback(() => {
    if (phaseRef.current !== 'playing' || !canFireRef.current || chargesRef.current < 1 || cannonJammed) return
    canFireRef.current = false

    const isVolley = chargesRef.current === MAX_CHARGES
    chargesRef.current -= isVolley ? MAX_CHARGES : 1
    setCharges(chargesRef.current)

    const volleyCritBonus = isVolley ? critBonus * 1.5 : critBonus
    const res = getShotResult(firePosRef.current, roundRef.current, volleyCritBonus)
    setShotResult(res)
    snapIndicator(fireIndicatorRef)
    flashBar(fireFlashRef, res === 'critical' ? '#fbbf24' : res === 'hit' ? '#4ade80' : res === 'graze' ? '#94a3b8' : '#6b7280')

    const dmgMult = isVolley ? 2 : 1
    const dmg = (res ? BASE_SHOT_DAMAGE[res] : 0) * dmgMult

    if (dmg > 0) {
      setShowCannonShot(true)
      setIsVolleyShot(isVolley)
      setTimeout(() => setShowCannonShot(false), 600)

      enemyHPRef.current = Math.max(0, enemyHPRef.current - dmg)
      setEnemyHP(enemyHPRef.current)
      setEHitsplat(p => ({
        key: p.key + 1,
        text: res === 'critical' ? `⚡ ${dmg}` : `-${dmg}`,
        color: res === 'critical' ? '#fbbf24' : '#f87171',
        big: res === 'critical',
      }))

      if (enemyHPRef.current <= 0) {
        streakRef.current++
        setStreak(streakRef.current)
        const bossKill = isBossRound(roundRef.current)
        const earned = killGold(roundRef.current, fortuneMult, isVolley) * (bossKill ? 2 : 1)
        potRef.current += earned
        setPot(potRef.current)
        setLastEarned(earned)

        roundEndingRef.current = true
        setEnemySinking(true)
        setClearReady(false)

        setTimeout(() => {
          roundRef.current++
          setRoundDisplay(roundRef.current + 1)
          const nextBoss = isBossRound(roundRef.current)
          setIsBoss(nextBoss)
          const newMax = getEnemyHPMax(roundRef.current)
          enemyHPMaxRef.current = newMax; enemyHPRef.current = newMax
          const baseInterval = Math.max(1200, ENEMY_FIRE_MS - roundRef.current * ENEMY_FIRE_DEC)
          fireIntervalRef.current = nextBoss ? Math.floor(baseInterval * 0.72) : baseInterval
          fireElapsedRef.current = 0
          parryStateRef.current = 'none'; parryElapsedRef.current = 0
          setEnemyHP(newMax); setEnemyHPMax(newMax)
          setEnemyFirePct(1); setParryState('none')
          setEnemySinking(false)
          roundEndingRef.current = false
          phaseRef.current = 'clear'
          setPhase('clear')
          setTimeout(() => setClearReady(true), 80)
        }, 920)

        setTimeout(() => { canFireRef.current = true; setShotResult(null) }, 550)
        return
      }
    }

    if (res === 'miss') {
      setCannonJammed(true)
      setTimeout(() => { canFireRef.current = true; setShotResult(null); setCannonJammed(false) }, CANNON_MISS_CD)
    } else {
      setTimeout(() => { canFireRef.current = true; setShotResult(null) }, 550)
    }
  }, [critBonus, fortuneMult, cannonJammed])

  const parry = useCallback(() => {
    if (parryStateRef.current !== 'incoming' || parryLockedRef.current) return
    const res = getParryResult(parryPosRef.current, roundRef.current)
    parryStateRef.current = res === 'full' ? 'success' : 'half'
    setParryFeedback(res)
    snapIndicator(parryIndicatorRef)
    flashBar(parryFlashRef, res === 'full' ? '#38bdf8' : res === 'half' ? '#fbbf24' : '#ef4444')

    if (res === 'miss') {
      playerHPRef.current = Math.max(0, playerHPRef.current - INCOMING_DAMAGE)
      setPlayerHP(playerHPRef.current)
      setPHitsplat(p => ({ key: p.key + 1, text: `-${INCOMING_DAMAGE}`, color: '#f87171', big: true }))
      parryLockedRef.current = true
      setParryLocked(true)
      setTimeout(() => { parryLockedRef.current = false; setParryLocked(false) }, PARRY_MISS_CD)
      if (playerHPRef.current <= 0) {
        phaseRef.current = 'dead'
        setBest(prev => Math.max(prev, streakRef.current))
        setPhase('dead'); return
      }
    } else if (res === 'half') {
      const dmg = Math.ceil(INCOMING_DAMAGE / 2)
      playerHPRef.current = Math.max(0, playerHPRef.current - dmg)
      setPlayerHP(playerHPRef.current)
      setPHitsplat(p => ({ key: p.key + 1, text: `-${dmg}`, color: '#fbbf24', big: false }))
      if (playerHPRef.current <= 0) {
        phaseRef.current = 'dead'
        setBest(prev => Math.max(prev, streakRef.current))
        setPhase('dead'); return
      }
    } else {
      setPHitsplat(p => ({ key: p.key + 1, text: 'PARRIED!', color: '#38bdf8', big: false }))
    }

    parryElapsedRef.current = 0; fireElapsedRef.current = 0
    setEnemyFirePct(1)
    setTimeout(() => { parryStateRef.current = 'none'; setParryState('none'); setParryFeedback(null) }, 600)
  }, [])

  const advance = useCallback(() => {
    canFireRef.current = true
    setShotResult(null); setParryFeedback(null); setClearReady(false)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  const retreat = useCallback(async () => {
    if (isClaiming) return
    setIsClaiming(true)
    try { await claimCannonLoot(potRef.current) } finally { setIsClaiming(false) }
    setBest(prev => Math.max(prev, streakRef.current))
    phaseRef.current = 'idle'
    setPhase('idle')
  }, [isClaiming])

  const fZones = getFireZones(roundRef.current, critBonus)
  const pZones = getParryZones(roundRef.current)
  const isIncoming = parryState === 'incoming'
  const isVolleyReady = charges === MAX_CHARGES

  const fireBarZones = [
    { color: 'rgba(148,163,184,0.12)', left: fZones.grazeL, width: fZones.hitL   - fZones.grazeL },
    { color: 'rgba(74,222,128,0.18)',  left: fZones.hitL,   width: fZones.critL  - fZones.hitL   },
    { color: 'rgba(251,191,36,0.22)',  left: fZones.critL,  width: fZones.critR  - fZones.critL  },
    { color: 'rgba(74,222,128,0.18)',  left: fZones.critR,  width: fZones.hitR   - fZones.critR  },
    { color: 'rgba(148,163,184,0.12)', left: fZones.hitR,   width: fZones.grazeR - fZones.hitR   },
  ]
  const parryBarZones = [
    { color: 'rgba(251,191,36,0.18)', left: pZones.halfL, width: pZones.fullL - pZones.halfL },
    { color: 'rgba(56,189,248,0.28)', left: pZones.fullL, width: pZones.fullR - pZones.fullL },
    { color: 'rgba(251,191,36,0.18)', left: pZones.fullR, width: pZones.halfR - pZones.fullR },
  ]

  return (
    <div className="flex flex-col items-center gap-4 select-none" style={{ userSelect: 'none' }}>

      {/* ── Two-panel combat area ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>

        {/* Player panel */}
        <div style={{
          flex: 1, background: 'rgba(96,165,250,0.05)',
          border: '1px solid rgba(96,165,250,0.15)',
          borderRadius: 14, padding: '0.65rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: '0.35rem',
        }}>
          {/* Ship image + hitsplat */}
          <div style={{ position: 'relative', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={shipImageUrl} alt={shipName} style={{
              width: '100%', height: 72, objectFit: 'contain', objectPosition: 'center',
              animation: phase === 'playing' ? undefined : undefined,
            }} />
            {pHitsplat.key > 0 && <Hitsplat key={pHitsplat.key} text={pHitsplat.text} color={pHitsplat.color} big={pHitsplat.big} animKey={pHitsplat.key} />}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.6rem', color: '#f0ede8', lineHeight: 1.2 }}>{shipName}</p>
          <HPBar current={playerHP} max={playerHPMax} color="#60a5fa" />
          {/* Charge dots */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
            {[0, 1, 2].map(i => (
              <motion.div key={i}
                animate={{ scale: i === charges - 1 ? [1, 1.4, 1] : 1 }}
                transition={{ duration: 0.2 }}
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: i < charges ? '#f0c040' : 'rgba(255,255,255,0.1)',
                  boxShadow: i < charges ? '0 0 4px #f0c04088' : 'none',
                  transition: 'background 0.2s',
                }} />
            ))}
            {isVolleyReady && (
              <span className="font-karla font-700" style={{ fontSize: '0.42rem', color: '#f0c040', marginLeft: 2 }}>VOLLEY</span>
            )}
          </div>
          {/* Stat tiles */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.25rem', marginTop: '0.05rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.05rem' }}>
            <StatTile label="PWR" value={totalPower  || '—'} color="#f87171" />
            <StatTile label="NAV" value={totalDodge  || '—'} color="#60a5fa" />
            <StatTile label="FTN" value={totalFortune || '—'} color="#f0c040" />
            <StatTile label="SPD" value={shipSpeed}           color="#a78bfa" />
          </div>
        </div>

        {/* Enemy panel */}
        <div style={{
          flex: 1,
          background: isBoss ? 'rgba(249,115,22,0.06)' : 'rgba(167,139,250,0.05)',
          border: `1px solid ${isBoss ? 'rgba(249,115,22,0.22)' : 'rgba(167,139,250,0.15)'}`,
          borderRadius: 14, padding: '0.65rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: '0.35rem',
        }}>
          {/* Round + boss badge */}
          <div className="flex items-center justify-between">
            <span className="font-karla font-400" style={{ fontSize: '0.44rem', color: '#4a4845' }}>Round {roundDisplay}</span>
            {isBoss && (
              <span className="font-karla font-700" style={{ fontSize: '0.44rem', color: '#f97316', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.08em' }}>BOSS</span>
            )}
          </div>
          {/* Enemy ship image + hitsplat */}
          <div style={{ position: 'relative', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={shipImageUrl} alt="enemy" style={{
              width: '100%', height: 72, objectFit: 'contain', objectPosition: 'center',
              transform: 'scaleX(-1)',
              animation: enemySinking ? 'enemy-sink 0.9s ease-in forwards' : 'none',
              filter: isBoss ? 'hue-rotate(20deg) brightness(0.9)' : 'hue-rotate(180deg) brightness(0.8)',
            }} />
            {eHitsplat.key > 0 && <Hitsplat key={eHitsplat.key} text={eHitsplat.text} color={eHitsplat.color} big={eHitsplat.big} animKey={eHitsplat.key} />}
            {showCannonShot && (
              <>
                <span style={{ position: 'absolute', left: '18%', top: '38%', fontSize: isVolleyShot ? '1.3rem' : '0.9rem', animation: 'cannon-shot 0.5s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
                {isVolleyShot && (
                  <>
                    <span style={{ position: 'absolute', left: '35%', top: '55%', fontSize: '1.2rem', animation: 'cannon-shot 0.5s 0.07s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
                    <span style={{ position: 'absolute', left: '44%', top: '18%', fontSize: '1.4rem', animation: 'cannon-shot 0.6s 0.14s ease forwards', pointerEvents: 'none', zIndex: 10 }}>🔥</span>
                  </>
                )}
              </>
            )}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.6rem', color: '#f0ede8', lineHeight: 1.2 }}>Enemy Ship</p>
          <HPBar current={enemyHP} max={enemyHPMax} color={isBoss ? '#f97316' : '#a78bfa'} />
          {/* Incoming fire charge dots */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${enemyFirePct * 100}%`,
                background: isIncoming ? '#38bdf8' : enemyFirePct > 0.4 ? '#a78bfa' : enemyFirePct > 0.2 ? '#fbbf24' : '#ef4444',
                transition: 'background 0.3s',
              }} />
            </div>
          </div>
          {/* Enemy stat tiles */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.25rem', marginTop: '0.05rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.05rem' }}>
            <StatTile label="HP"  value={enemyHPMax}  color="#f87171" />
            <StatTile label="SPD" value={`${Math.round((fireIntervalRef.current / 1000) * 10) / 10}s`} color="#a78bfa" />
          </div>
        </div>

      </div>

      {/* ── Feedback ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 22 }}>
        <AnimatePresence mode="wait">
          {shotResult && !parryFeedback && (
            <motion.p key={shotResult} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: SHOT_COLOR[shotResult], textAlign: 'center' }}>
              {SHOT_LABEL[shotResult]}
            </motion.p>
          )}
          {parryFeedback && (
            <motion.p key={`p-${parryFeedback}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: PARRY_COLOR[parryFeedback], textAlign: 'center' }}>
              {PARRY_LABEL[parryFeedback]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── Fire bar ─────────────────────────────────────────────────────────── */}
      <div style={{ width: '100%' }}>
        <div className="flex items-center justify-between px-1 mb-1.5">
          <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#9a9488', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Cannon</p>
          {(phase === 'playing' || phase === 'clear') && (
            <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0c040' }}>⟡ {fmtGold(pot)}</span>
          )}
        </div>
        <TimingBar
          indicatorRef={fireIndicatorRef} flashRef={fireFlashRef}
          zones={fireBarZones}
          critZone={{ left: fZones.critL, width: fZones.critR - fZones.critL }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 5 }}>
          {[{ label: 'Graze', color: '#94a3b8' }, { label: 'Hit', color: '#4ade80' }, { label: '★ Crit', color: '#fbbf24' }].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: z.color }} />
              <span className="font-karla font-400" style={{ fontSize: '0.6rem', color: z.color }}>{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Parry bar ────────────────────────────────────────────────────────── */}
      <div style={{ width: '100%', minHeight: 72 }}>
        <AnimatePresence>
          {isIncoming && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="font-karla font-400 px-1 mb-1.5" style={{ fontSize: '0.62rem', color: parryLocked ? '#ef4444' : '#38bdf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {parryLocked ? 'Exposed — Incoming!' : 'Incoming — Parry!'}
              </p>
              <TimingBar
                indicatorRef={parryIndicatorRef} flashRef={parryFlashRef}
                zones={parryBarZones}
                critZone={{ left: pZones.fullL, width: pZones.fullR - pZones.fullL }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>

        {/* Left: RELOAD or PARRY when incoming */}
        {phase === 'playing' && (
          <motion.button
            onPointerDown={isIncoming ? parry : doReload}
            whileTap={{ scale: 0.95 }}
            animate={
              isIncoming && !parryLocked
                ? { boxShadow: ['0 0 0px #38bdf800', '0 0 16px #38bdf8aa', '0 0 8px #38bdf866'] }
                : parryLocked
                ? { boxShadow: ['0 0 0px #ef444400', '0 0 10px #ef444455', '0 0 0px #ef444400'] }
                : {}
            }
            transition={{ duration: 0.45, repeat: Infinity }}
            className="font-karla font-700"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
              background: isIncoming && !parryLocked ? 'rgba(56,189,248,0.2)'
                        : parryLocked               ? 'rgba(239,68,68,0.08)'
                        : !canReload || charges >= MAX_CHARGES ? 'rgba(255,255,255,0.03)'
                        :                             'rgba(96,165,250,0.12)',
              border: `1px solid ${
                isIncoming && !parryLocked ? 'rgba(56,189,248,0.6)'
                : parryLocked             ? 'rgba(239,68,68,0.3)'
                : !canReload || charges >= MAX_CHARGES ? 'rgba(255,255,255,0.07)'
                :                           'rgba(96,165,250,0.35)'
              }`,
              color: isIncoming && !parryLocked ? '#38bdf8'
                   : parryLocked               ? '#ef4444'
                   : !canReload                ? '#3a5a7a'
                   : charges >= MAX_CHARGES    ? '#4a4845'
                   :                            '#60a5fa',
              fontSize: parryLocked ? '0.72rem' : '0.92rem',
              letterSpacing: '0.06em',
              opacity: (!isIncoming && (!canReload || charges >= MAX_CHARGES)) ? 0.5 : 1,
              transition: 'all 0.12s',
            }}>
            {isIncoming ? (parryLocked ? 'Exposed…' : 'PARRY') : (!canReload ? 'Loading…' : charges >= MAX_CHARGES ? 'Full' : 'RELOAD')}
          </motion.button>
        )}

        {/* Right: FIRE / VOLLEY / start */}
        <motion.button
          onPointerDown={phase === 'playing' && !cannonJammed && charges > 0 ? fire : phase === 'idle' ? startGame : undefined}
          whileTap={charges > 0 && !cannonJammed ? { scale: 0.95 } : {}}
          className="font-karla font-700"
          style={{
            flex: 1, padding: '12px 0', borderRadius: 14,
            cursor: (phase === 'clear' || cannonJammed || (phase === 'playing' && charges === 0)) ? 'default' : 'pointer',
            background: cannonJammed          ? 'rgba(251,146,60,0.1)'
                      : isVolleyReady          ? 'rgba(240,192,64,0.18)'
                      : phase === 'playing'    ? 'rgba(239,68,68,0.14)'
                      :                         'rgba(56,189,248,0.14)',
            border: `1px solid ${
              cannonJammed       ? 'rgba(251,146,60,0.3)'
              : isVolleyReady    ? 'rgba(240,192,64,0.55)'
              : phase === 'playing' ? 'rgba(239,68,68,0.38)'
              :                    'rgba(56,189,248,0.38)'
            }`,
            color: cannonJammed       ? '#f97316'
                 : isVolleyReady      ? '#f0c040'
                 : phase === 'playing' ? '#ef4444'
                 :                      '#38bdf8',
            fontSize: cannonJammed ? '0.72rem' : '0.92rem',
            letterSpacing: '0.06em',
            opacity: phase === 'clear' ? 0 : (phase === 'playing' && charges === 0 && !cannonJammed) ? 0.35 : cannonJammed ? 0.7 : 1,
            pointerEvents: phase === 'clear' ? 'none' : 'auto',
            transition: 'all 0.12s',
            boxShadow: isVolleyReady ? '0 0 12px rgba(240,192,64,0.25)' : 'none',
          }}>
          {phase === 'idle'       ? 'Open Fire'
         : cannonJammed           ? 'Jammed…'
         : phase === 'playing' && charges === 0 ? 'No Charges'
         : isVolleyReady          ? '🔥 VOLLEY'
         : phase === 'playing'    ? 'FIRE'
         :                         'Try Again'}
        </motion.button>
      </div>

      {/* ── Round clear overlay ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'clear' && clearReady && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 50 }}>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Enemy Sunk</p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '1.5rem', marginBottom: 4 }}>Round {roundDisplay - 1} Clear</p>
            <motion.p key={lastEarned} initial={{ opacity: 0, y: -4, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className="font-karla font-700" style={{ color: '#f0c040', fontSize: '1.05rem', marginBottom: 2 }}>
              +{fmtGold(lastEarned)} ⟡
            </motion.p>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.38)', fontSize: '0.72rem', marginBottom: isBoss ? 10 : 32 }}>
              Pot: {fmtGold(pot)} ⟡
            </p>
            {isBoss && (
              <motion.p initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="font-cinzel font-700"
                style={{ color: '#f97316', fontSize: '0.82rem', letterSpacing: '0.1em', marginBottom: 28 }}>
                ⚔ BOSS INCOMING
              </motion.p>
            )}
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column', width: 240 }}>
              <motion.button onPointerDown={advance} whileTap={{ scale: 0.96 }}
                className="font-karla font-700"
                style={{ padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444', fontSize: '0.92rem', letterSpacing: '0.06em' }}>
                Advance →
              </motion.button>
              <motion.button onPointerDown={retreat} whileTap={{ scale: 0.96 }} disabled={isClaiming}
                className="font-karla font-600"
                style={{ padding: '12px 0', borderRadius: 14, cursor: isClaiming ? 'default' : 'pointer', background: 'rgba(240,197,64,0.1)', border: '1px solid rgba(240,197,64,0.32)', color: '#f0c040', fontSize: '0.82rem', letterSpacing: '0.04em', opacity: isClaiming ? 0.6 : 1 }}>
                {isClaiming ? 'Banking…' : `Retreat — Bank ${fmtGold(pot)} ⟡`}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dead overlay ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'dead' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 50 }}
            onPointerDown={startGame}>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.32)', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Lost at Sea</p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '3rem', margin: '0 0 4px' }}>{streak}</p>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.28)', fontSize: '0.7rem', marginBottom: 4 }}>
              {streak === 1 ? '1 ship sunk' : `${streak} ships sunk`}
            </p>
            {pot > 0 && <p className="font-karla font-400" style={{ color: 'rgba(239,68,68,0.5)', fontSize: '0.78rem', marginBottom: 4 }}>Lost {fmtGold(pot)} ⟡</p>}
            {best > 0 && <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.22)', fontSize: '0.68rem', marginBottom: 28 }}>Best: {best}</p>}
            {best === 0 && <div style={{ marginBottom: 28 }} />}
            <button className="font-karla font-700" style={{ padding: '11px 32px', background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.38)', borderRadius: 12, color: '#38bdf8', fontSize: '0.88rem', cursor: 'pointer' }}>
              Try Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle stat badges */}
      {phase === 'idle' && crewCount > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex gap-3 flex-wrap justify-center">
          {totalPower   > 0 && <span style={{ fontSize: '0.6rem', color: '#f87171', fontFamily: 'var(--font-karla)' }}>PWR {totalPower}</span>}
          {totalDodge   > 0 && <span style={{ fontSize: '0.6rem', color: '#60a5fa', fontFamily: 'var(--font-karla)' }}>NAV {totalDodge}</span>}
          {totalFortune > 0 && <span style={{ fontSize: '0.6rem', color: '#f0c040', fontFamily: 'var(--font-karla)' }}>FTN {totalFortune}</span>}
          <span style={{ fontSize: '0.6rem', color: '#a78bfa', fontFamily: 'var(--font-karla)' }}>SPD {shipSpeed}</span>
        </motion.div>
      )}

      <style>{`
        @keyframes hitsplat-pop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10%) scale(0.2) rotate(-10deg); }
          55%  { opacity: 1; transform: translateX(-50%) translateY(-65%) scale(1.25) rotate(4deg); }
          100% { opacity: 1; transform: translateX(-50%) translateY(-58%) scale(1) rotate(0deg); }
        }
        @keyframes cannon-shot {
          0%   { opacity: 0; transform: translate(-20px, 6px) scale(0.2) rotate(-20deg); }
          30%  { opacity: 1; transform: translate(0) scale(1.2) rotate(5deg); }
          65%  { opacity: 0.7; transform: translate(4px, -5px) scale(0.9); }
          100% { opacity: 0; transform: translate(10px, -10px) scale(0.3); }
        }
        @keyframes enemy-sink {
          0%   { transform: scaleX(-1) translateY(0) rotate(0deg); opacity: 1; }
          15%  { transform: scaleX(-1) translateY(5px) rotate(-3deg); opacity: 0.9; }
          55%  { transform: scaleX(-1) translateY(40px) rotate(-9deg); opacity: 0.5; filter: brightness(0.5); }
          100% { transform: scaleX(-1) translateY(90px) rotate(-13deg); opacity: 0; filter: brightness(0.2); }
        }
      `}</style>
    </div>
  )
}
