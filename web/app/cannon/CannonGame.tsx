'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { claimCannonLoot } from './actions'

type GamePhase  = 'idle' | 'playing' | 'clear' | 'dead'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null
// ── Enemy definitions ─────────────────────────────────────────────────────────

interface BroadsideEnemy {
  id: string
  name: string
  hpBase: number
  minDmg: number
  maxDmg: number
  actionMs: number    // how long each action step takes
  pattern: string[]   // sequence of 'reload' | 'fire' actions
}

const BROADSIDE_ENEMIES: Record<string, BroadsideEnemy> = {
  brute: {
    id: 'brute', name: 'Reef Raider', hpBase: 25, minDmg: 2, maxDmg: 5,
    actionMs: 4500,
    pattern: ['reload', 'fire', 'reload', 'fire'],
  },
  sniper: {
    id: 'sniper', name: "Crow's Nest Marksman", hpBase: 30, minDmg: 2, maxDmg: 10,
    actionMs: 5500,
    pattern: ['reload', 'reload', 'dodge', 'reload', 'fire'],
  },
  corsair: {
    id: 'corsair', name: 'Saltwater Corsair', hpBase: 38, minDmg: 6, maxDmg: 9,
    actionMs: 3500,
    pattern: ['reload', 'dodge', 'fire', 'reload', 'fire'],
  },
  pete: {
    id: 'pete', name: 'Barnacle Pete', hpBase: 55, minDmg: 8, maxDmg: 15,
    actionMs: 4500,
    pattern: ['reload', 'reload', 'dodge', 'fire', 'reload', 'fire'],
  },
}
const BROADSIDE_SEQUENCE = ['brute', 'brute', 'sniper', 'sniper', 'corsair', 'corsair']

function isBossRound(round: number) { return round % 7 === 6 }
function getEnemyForRound(round: number): BroadsideEnemy {
  if (isBossRound(round)) return BROADSIDE_ENEMIES.pete
  return BROADSIDE_ENEMIES[BROADSIDE_SEQUENCE[round % 7]]
}
function getEnemyHP(round: number): number {
  return getEnemyForRound(round).hpBase
}
function getActionMs(round: number): number {
  return getEnemyForRound(round).actionMs
}
function rollIncomingDamage(round: number): number {
  const e = getEnemyForRound(round)
  return Math.floor(Math.random() * (e.maxDmg - e.minDmg + 1)) + e.minDmg
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHARGES    = 3
const SPEED_BASE     = 0.006
const SPEED_INC      = 0.0008
const CANNON_MISS_CD      = 2400
const DODGE_PRIME_MS      = 750   // window stays primed this long
const DODGE_COOLDOWN_MISS = 2200  // cooldown after eating an unblocked hit
const ENEMY_DODGE_MS      = 1400

function rollShotDamage(res: ShotResult, shipMinDamage: number, totalPower: number): number {
  if (!res || res === 'miss') return 0
  const powerMax = shipMinDamage + Math.floor(totalPower / 4)
  const ranges: Record<string, [number, number]> = {
    critical: [shipMinDamage * 2, Math.round(powerMax * 1.5)],
    hit:      [shipMinDamage, powerMax],
    graze:    [1, Math.max(1, Math.ceil(powerMax * 0.4))],
  }
  const [min, max] = ranges[res]
  return Math.floor(Math.random() * (max - min + 1)) + min
}
const SHOT_LABEL: Record<string, string> = { critical: 'Critical!', hit: 'Hit!', graze: 'Graze', miss: 'Miss' }
const SHOT_COLOR: Record<string, string> = { critical: '#fbbf24', hit: '#4ade80', graze: '#94a3b8', miss: '#6b7280' }

function killGold(round: number, fortuneMult: number, isVolley: boolean) {
  const base = isBossRound(round) ? 120 : 50
  return Math.floor(base * fortuneMult * (isVolley ? 1.5 : 1))
}
function fmtGold(n: number) { return n.toLocaleString() }

// ── Zone geometry ─────────────────────────────────────────────────────────────

function getFireZones(round: number, zoneCenter = 0.5) {
  const hitW  = Math.max(0.045, 0.08  - round * 0.005)
  const critW = Math.min(0.02, Math.max(0.004, 0.006 - round * 0.0003))
  return {
    grazeL: zoneCenter - hitW - 0.05, hitL: zoneCenter - hitW, critL: zoneCenter - critW,
    critR: zoneCenter + critW, hitR: zoneCenter + hitW, grazeR: zoneCenter + hitW + 0.05,
  }
}
function getShotResult(pos: number, zoneCenter: number, round: number): ShotResult {
  const z = getFireZones(round, zoneCenter)
  if (pos >= z.critL && pos <= z.critR)   return 'critical'
  if (pos >= z.hitL  && pos <= z.hitR)    return 'hit'
  if (pos >= z.grazeL && pos <= z.grazeR) return 'graze'
  return 'miss'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function indicatorStyle(zone: ShotResult) {
  if (zone === 'critical') return { bg: '#fbbf24', shadow: '0 0 18px rgba(251,191,36,1), 0 0 8px rgba(251,191,36,0.7)' }
  if (zone === 'hit')      return { bg: '#4ade80', shadow: '0 0 12px rgba(74,222,128,0.85)' }
  if (zone === 'graze')    return { bg: '#94a3b8', shadow: '0 0 8px rgba(148,163,184,0.6)' }
  return { bg: 'rgba(240,237,232,0.3)', shadow: '0 0 4px rgba(240,237,232,0.12)' }
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
      animation: 'hitsplat-pop 0.9s ease forwards',
      pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap',
    }}>
      <div style={{
        background: 'rgba(8,6,4,0.9)', border: `2px solid ${color}`,
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


function HPBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = max > 0 ? (current / max) * 100 : 0
  const barColor = pct < 30 ? '#f87171' : pct < 60 ? '#f0c040' : color
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <p className="font-karla" style={{ fontSize: '0.38rem', color: '#4a4845' }}>HP</p>
        <p className="font-karla font-600" style={{ fontSize: '0.44rem', color: barColor }}>{current}/{max}</p>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.35s ease, background 0.35s ease' }} />
      </div>
    </div>
  )
}

function TimingBar({ indicatorRef, flashRef, zoneRef, hitHalfW, critHalfW }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  flashRef:     React.RefObject<HTMLDivElement | null>
  zoneRef:      React.RefObject<HTMLDivElement | null>
  hitHalfW: number
  critHalfW: number
}) {
  const grazeW = 0.05
  const totalW = hitHalfW * 2 + grazeW * 2
  // Exaggerate crit zone for visibility (actual detection uses real critHalfW)
  const critVisualPct = Math.max(16, (critHalfW * 2 / totalW) * 100 * 4)
  const critLeft = (100 - critVisualPct) / 2
  return (
    <div style={{ position: 'relative', height: 28, borderRadius: 8 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 8,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        {/* Moving ship target — left/width driven by RAF at 60fps via zoneRef */}
        <div ref={zoneRef} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${(0.5 - hitHalfW - grazeW) * 100}%`,
          width: `${totalW * 100}%`,
        }}>
          {/* Ship hull — top-down silhouette */}
          <div style={{
            position: 'absolute', inset: '3px 0',
            clipPath: 'polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%)',
            background: 'rgba(74,222,128,0.14)',
            filter: 'drop-shadow(0 0 3px rgba(74,222,128,0.4))',
          }} />
          {/* Mast line */}
          <div style={{
            position: 'absolute', top: '25%', bottom: '25%',
            left: 'calc(50% - 1px)', width: 1,
            background: 'rgba(74,222,128,0.35)',
          }} />
          {/* Crit zone — bridge marker */}
          <motion.div
            animate={{ opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: '18%', bottom: '18%',
              left: `${critLeft}%`, width: `${critVisualPct}%`,
              background: 'rgba(251,191,36,0.5)',
              borderRadius: 2,
            }}
          />
        </div>
        <div ref={flashRef} style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }} />
      </div>
      <div ref={indicatorRef} style={{
        position: 'absolute', top: 3, bottom: 3, width: 3, borderRadius: 2,
        background: 'rgba(240,237,232,0.3)', boxShadow: '0 0 4px rgba(240,237,232,0.12)',
        left: '0%', pointerEvents: 'none', zIndex: 2,
      }} />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CannonGame({
  shipImageUrl, shipName, playerHPMax, shipMinDamage, shipSpeed,
  totalPower, totalDodge, totalFortune, crewCount,
}: {
  shipImageUrl: string
  shipName: string
  playerHPMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  crewCount: number
}) {
  const dodgeBonus        = totalDodge * 5
  const fortuneMult       = 1 + totalFortune / 150
  const reloadCooldown    = Math.max(600, 2200 - shipSpeed * 110)
  const dodgeCooldownUse  = Math.max(500, 1600 - dodgeBonus)

  const [phase, setPhase]               = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]         = useState(playerHPMax)
  const [enemyHP, setEnemyHP]           = useState(0)
  const [enemyHPMax, setEnemyHPMax]     = useState(0)
  const [enemyName, setEnemyName]       = useState('Reef Raider')
  const [enemyCharges, setEnemyCharges]   = useState(0)
  const [enemyDodging, setEnemyDodging]   = useState(false)
  const [enemyActionPct, setEnemyActionPct] = useState(1)
  const [charges, setCharges]           = useState(0)
  const [canFire, setCanFire]           = useState(true)
  const [canReload, setCanReload]       = useState(true)
  const [streak, setStreak]             = useState(0)
  const [best, setBest]                 = useState(0)
  const [pot, setPot]                   = useState(0)
  const [lastEarned, setLastEarned]     = useState(0)
  const [shotResult, setShotResult]     = useState<ShotResult>(null)
  const [dodgePrimed, setDodgePrimed]   = useState(false)
  const [dodgeCooldown, setDodgeCooldown] = useState(false)
  const [dodgePrimePct, setDodgePrimePct] = useState(1)
  const [actionLocked, setActionLocked] = useState(false)
  const [dodgeFlash, setDodgeFlash]     = useState(false)
  const [dodgeShake, setDodgeShake]     = useState(false)
  const [showDodgeVFX, setShowDodgeVFX] = useState(false)
  const [roundDisplay, setRoundDisplay] = useState(1)
  const [isBoss, setIsBoss]             = useState(false)
  const [isClaiming, setIsClaiming]     = useState(false)
  const [cannonJammed, setCannonJammed] = useState(false)
  const [enemySinking, setEnemySinking] = useState(false)
  const [showCannonShot, setShowCannonShot] = useState(false)
  const [isVolleyShot, setIsVolleyShot] = useState(false)
  const [isCritShot, setIsCritShot]     = useState(false)
  const [critShake, setCritShake]       = useState(false)
  const [critFlash, setCritFlash]       = useState(false)
  const [clearReady, setClearReady]     = useState(false)
  const [pHitsplat, setPHitsplat]       = useState({ key: 0, text: '', color: '', big: false })
  const [eHitsplat, setEHitsplat]       = useState({ key: 0, text: '', color: '', big: false })

  const fireIndicatorRef  = useRef<HTMLDivElement>(null)
  const fireFlashRef      = useRef<HTMLDivElement>(null)
  const zoneTargetRef     = useRef<HTMLDivElement>(null)
  const critFreezeRef     = useRef(false)

  const firePosRef            = useRef(0)
  const fireDirRef            = useRef(1)
  const zonePosRef            = useRef(0.5)
  const zoneDirRef            = useRef(1)
  const zoneJitterRef         = useRef(0)
  const roundRef              = useRef(0)
  const streakRef             = useRef(0)
  const potRef                = useRef(0)
  const playerHPRef           = useRef(playerHPMax)
  const enemyHPRef            = useRef(0)
  const enemyHPMaxRef         = useRef(0)
  const phaseRef              = useRef<GamePhase>('idle')
  const canFireRef            = useRef(true)
  const chargesRef            = useRef(1)
  const canReloadRef          = useRef(true)
  const dodgePrimedRef        = useRef(false)
  const dodgeCooldownRef      = useRef(false)
  const actionLockedRef       = useRef(false)
  const dodgePrimeElapsedRef  = useRef(0)
  const dodgePrimeTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roundEndingRef        = useRef(false)
  const rafRef                = useRef(0)
  const enemyChargesRef        = useRef(0)
  const enemyDodgingRef        = useRef(false)
  const enemyDodgeTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enemyPatternIdxRef     = useRef(0)
  const enemyActionElapsedRef  = useRef(0)

  const resetEnemyForRound = useCallback((round: number) => {
    const e = getEnemyForRound(round)
    const hp = getEnemyHP(round)
    enemyHPRef.current          = hp
    enemyHPMaxRef.current       = hp
    enemyChargesRef.current     = 0
    enemyDodgingRef.current     = false
    if (enemyDodgeTimeoutRef.current) { clearTimeout(enemyDodgeTimeoutRef.current); enemyDodgeTimeoutRef.current = null }
    enemyPatternIdxRef.current  = 0
    enemyActionElapsedRef.current = 0
    setEnemyHP(hp); setEnemyHPMax(hp)
    setEnemyName(e.name)
    setEnemyCharges(0)
    setEnemyDodging(false)
    setEnemyActionPct(1)
    setIsBoss(isBossRound(round))
    // Randomize zone starting position for each round
    const hitW  = Math.max(0.045, 0.08 - round * 0.005)
    const halfW = hitW + 0.05
    zonePosRef.current  = halfW + Math.random() * (1 - halfW * 2)
    zoneDirRef.current  = Math.random() < 0.5 ? 1 : -1
    if (isBossRound(round)) zoneJitterRef.current = 350 + Math.random() * 600
  }, [])

  const startGame = useCallback(() => {
    firePosRef.current      = 0; fireDirRef.current = 1
    zonePosRef.current      = 0.5; zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
    zoneJitterRef.current   = 0
    roundRef.current        = 0; streakRef.current  = 0
    potRef.current          = 0
    playerHPRef.current     = playerHPMax
    canFireRef.current          = true
    chargesRef.current          = 0
    canReloadRef.current        = true
    setCanFire(true)
    if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
    dodgePrimedRef.current       = false
    dodgeCooldownRef.current     = false
    actionLockedRef.current      = false
    dodgePrimeElapsedRef.current = 0
    roundEndingRef.current       = false

    resetEnemyForRound(0)

    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(playerHPMax)
    setCharges(0); setCanReload(true)
    setStreak(0); setPot(0); setLastEarned(0)
    setCannonJammed(false); setActionLocked(false)
    setShotResult(null); setDodgePrimed(false); setDodgeCooldown(false)
    setDodgePrimePct(1); setDodgeFlash(false); setDodgeShake(false); setShowDodgeVFX(false)
    setRoundDisplay(1); setEnemySinking(false)
    setShowCannonShot(false); setClearReady(false)
  }, [playerHPMax, resetEnemyForRound])

  useEffect(() => {
    if (phase !== 'playing') return
    let lastTime = performance.now()

    function loop(now: number) {
      if (phaseRef.current !== 'playing') return
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

      // Player fire indicator
      const fSpeed = SPEED_BASE + roundRef.current * SPEED_INC
      if (!critFreezeRef.current) {
        firePosRef.current += fSpeed * (dt / 16.67) * fireDirRef.current
      }
      if (firePosRef.current >= 1) { firePosRef.current = 1; fireDirRef.current = -1 }
      if (firePosRef.current <= 0) { firePosRef.current = 0; fireDirRef.current =  1 }

      // Moving zone block — speed mapped to enemy actionMs (faster enemy = faster zone)
      {
        const hitW  = Math.max(0.045, 0.08 - roundRef.current * 0.005)
        const halfW = hitW + 0.05
        const zSpeed = (3000 / getActionMs(roundRef.current)) * 0.0028 * (dt / 16.67)
        if (isBossRound(roundRef.current)) {
          zoneJitterRef.current -= dt
          if (zoneJitterRef.current <= 0) {
            zoneDirRef.current *= -1
            zoneJitterRef.current = 350 + Math.random() * 600
          }
        }
        zonePosRef.current += zSpeed * zoneDirRef.current
        if (zonePosRef.current >= 1 - halfW) { zonePosRef.current = 1 - halfW; zoneDirRef.current = -1 }
        if (zonePosRef.current <= halfW)      { zonePosRef.current = halfW;     zoneDirRef.current =  1 }
        if (zoneTargetRef.current) {
          zoneTargetRef.current.style.left  = `${(zonePosRef.current - halfW) * 100}%`
          zoneTargetRef.current.style.width = `${halfW * 2 * 100}%`
        }
      }

      if (fireIndicatorRef.current) {
        const zone = getShotResult(firePosRef.current, zonePosRef.current, roundRef.current)
        const s = indicatorStyle(zone)
        fireIndicatorRef.current.style.left       = `calc(${firePosRef.current * 100}% - 2px)`
        fireIndicatorRef.current.style.background = s.bg
        fireIndicatorRef.current.style.boxShadow  = s.shadow
      }

      if (roundEndingRef.current) { rafRef.current = requestAnimationFrame(loop); return }

      // Dodge prime countdown
      if (dodgePrimedRef.current) {
        dodgePrimeElapsedRef.current += dt
        setDodgePrimePct(Math.max(0, 1 - dodgePrimeElapsedRef.current / DODGE_PRIME_MS))
      }

      // Enemy action timer
      const actionMs = getActionMs(roundRef.current)
      enemyActionElapsedRef.current += dt
      setEnemyActionPct(Math.max(0, 1 - enemyActionElapsedRef.current / actionMs))

      if (enemyActionElapsedRef.current >= actionMs) {
        enemyActionElapsedRef.current = 0

        const e = getEnemyForRound(roundRef.current)
        const action = e.pattern[enemyPatternIdxRef.current % e.pattern.length]
        enemyPatternIdxRef.current++

        if (action === 'reload') {
          if (enemyChargesRef.current < MAX_CHARGES) {
            enemyChargesRef.current++
            setEnemyCharges(enemyChargesRef.current)
          }
        } else if (action === 'dodge') {
          enemyDodgingRef.current = true
          setEnemyDodging(true)
          if (enemyDodgeTimeoutRef.current) clearTimeout(enemyDodgeTimeoutRef.current)
          enemyDodgeTimeoutRef.current = setTimeout(() => {
            enemyDodgingRef.current = false
            setEnemyDodging(false)
          }, ENEMY_DODGE_MS)
        } else if (action === 'fire') {
          if (enemyChargesRef.current > 0) {
            enemyChargesRef.current--
            setEnemyCharges(enemyChargesRef.current)

            if (dodgePrimedRef.current) {
              // Prediction dodge — cancel prime, reset actions, VFX
              if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
              dodgePrimedRef.current = false
              dodgePrimeElapsedRef.current = 0
              setDodgePrimed(false); setDodgePrimePct(1)
              // Reward: instantly restore fire + reload
              canFireRef.current = true; setCanFire(true)
              canReloadRef.current = true; setCanReload(true)
              setShotResult(null)
              // VFX cascade
              setPHitsplat(p => ({ key: p.key + 1, text: 'DODGED!', color: '#38bdf8', big: true }))
              setDodgeShake(true); setDodgeFlash(true); setShowDodgeVFX(true)
              setTimeout(() => { setDodgeShake(false) }, 520)
              setTimeout(() => { setDodgeFlash(false) }, 340)
              setTimeout(() => { setShowDodgeVFX(false) }, 650)
              dodgeCooldownRef.current = true
              setDodgeCooldown(true)
              setTimeout(() => { dodgeCooldownRef.current = false; setDodgeCooldown(false) }, dodgeCooldownUse)
            } else {
              // Took the hit
              const dmg = rollIncomingDamage(roundRef.current)
              playerHPRef.current = Math.max(0, playerHPRef.current - dmg)
              setPlayerHP(playerHPRef.current)
              setPHitsplat(p => ({ key: p.key + 1, text: `-${dmg}`, color: '#f87171', big: true }))
              if (playerHPRef.current <= 0) {
                phaseRef.current = 'dead'
                setBest(prev => Math.max(prev, streakRef.current))
                setPhase('dead'); return
              }
              dodgeCooldownRef.current = true
              setDodgeCooldown(true)
              setTimeout(() => { dodgeCooldownRef.current = false; setDodgeCooldown(false) }, DODGE_COOLDOWN_MISS)
            }
          }
          // No charges → skip fire, pattern still advances
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, dodgeCooldownUse])

  const doReload = useCallback(() => {
    if (phaseRef.current !== 'playing' || !canReloadRef.current || chargesRef.current >= MAX_CHARGES || actionLockedRef.current) return
    chargesRef.current = Math.min(MAX_CHARGES, chargesRef.current + 1)
    setCharges(chargesRef.current)
    canReloadRef.current = false
    setCanReload(false)
    // Randomize indicator position — prevents cheesing by reloading near crit zone
    firePosRef.current = Math.random()
    fireDirRef.current = Math.random() < 0.5 ? 1 : -1
    setTimeout(() => { canReloadRef.current = true; setCanReload(true) }, reloadCooldown)
  }, [reloadCooldown])

  const fire = useCallback(() => {
    if (phaseRef.current !== 'playing' || !canFireRef.current || chargesRef.current < 1 || cannonJammed || actionLockedRef.current) return
    canFireRef.current = false
    setCanFire(false)

    const isVolley = chargesRef.current === MAX_CHARGES
    chargesRef.current -= isVolley ? MAX_CHARGES : 1
    setCharges(chargesRef.current)

    const res = getShotResult(firePosRef.current, zonePosRef.current, roundRef.current)
    setShotResult(res)
    snapIndicator(fireIndicatorRef)
    flashBar(fireFlashRef, res === 'critical' ? '#fbbf24' : res === 'hit' ? '#4ade80' : res === 'graze' ? '#94a3b8' : '#6b7280')

    const dmgMult = isVolley ? 2 : 1
    const dmg = rollShotDamage(res, shipMinDamage, totalPower) * dmgMult

    if (dmg > 0) {
      setShowCannonShot(true)
      setIsVolleyShot(isVolley)
      setIsCritShot(res === 'critical')
      setTimeout(() => setShowCannonShot(false), 700)
      if (res === 'critical') {
        setCritShake(true)
        setCritFlash(true)
        critFreezeRef.current = true
        setTimeout(() => { setCritShake(false) }, 620)
        setTimeout(() => { setCritFlash(false) }, 380)
        setTimeout(() => { critFreezeRef.current = false }, 300)
      }

      const blocked = enemyDodgingRef.current && res !== 'critical'
      const effectiveDmg = blocked ? 0 : dmg

      enemyHPRef.current = Math.max(0, enemyHPRef.current - effectiveDmg)
      setEnemyHP(enemyHPRef.current)
      setEHitsplat(p => ({
        key: p.key + 1,
        text: blocked ? 'Blocked!' : res === 'critical' ? `⚡ ${dmg}` : `-${dmg}`,
        color: blocked ? '#38bdf8' : res === 'critical' ? '#fbbf24' : '#f87171',
        big: res === 'critical',
      }))

      if (!blocked && enemyHPRef.current <= 0) {
        streakRef.current++
        setStreak(streakRef.current)
        const earned = killGold(roundRef.current, fortuneMult, isVolley)
        potRef.current += earned
        setPot(potRef.current)
        setLastEarned(earned)

        roundEndingRef.current = true
        setEnemySinking(true)
        setClearReady(false)

        setTimeout(() => {
          roundRef.current++
          resetEnemyForRound(roundRef.current)
          setRoundDisplay(roundRef.current + 1)
          setEnemySinking(false)
          roundEndingRef.current = false
          phaseRef.current = 'clear'
          setPhase('clear')
          setTimeout(() => setClearReady(true), 80)
        }, 920)

        setTimeout(() => { canFireRef.current = true; setCanFire(true); setShotResult(null) }, 550)
        return
      }
    }

    if (res === 'miss') {
      setCannonJammed(true)
      setTimeout(() => { canFireRef.current = true; setCanFire(true); setShotResult(null); setCannonJammed(false) }, CANNON_MISS_CD)
    } else {
      setTimeout(() => { canFireRef.current = true; setCanFire(true); setShotResult(null) }, 550)
    }
  }, [shipMinDamage, totalPower, fortuneMult, cannonJammed, resetEnemyForRound])

  const primeDodge = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    if (dodgeCooldownRef.current || dodgePrimedRef.current || actionLockedRef.current) return
    if (!canFireRef.current || !canReloadRef.current) return  // committed: can't prime mid-action

    dodgePrimedRef.current = true
    dodgePrimeElapsedRef.current = 0
    setDodgePrimed(true); setDodgePrimePct(1)

    // Auto-expire: window ran out with no incoming shot → lock all actions as punishment
    if (dodgePrimeTimerRef.current) clearTimeout(dodgePrimeTimerRef.current)
    dodgePrimeTimerRef.current = setTimeout(() => {
      dodgePrimedRef.current = false
      dodgePrimeElapsedRef.current = 0
      setDodgePrimed(false); setDodgePrimePct(1)
      actionLockedRef.current = true
      setActionLocked(true)
      setTimeout(() => { actionLockedRef.current = false; setActionLocked(false) }, 1200)
    }, DODGE_PRIME_MS)
  }, [])

  const advance = useCallback(() => {
    canFireRef.current = true
    setShotResult(null); setClearReady(false)
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

  const isVolleyReady  = charges === MAX_CHARGES
  const isCommitted    = !canFire || !canReload
  const isActionLocked = actionLocked
  const powerMax      = shipMinDamage + Math.floor(totalPower / 4)

  const dodgePrimeBarColor = dodgePrimePct > 0.5 ? '#38bdf8' : dodgePrimePct > 0.2 ? '#fbbf24' : '#ef4444'
  const actionBarColor     = enemyActionPct > 0.4 ? '#a78bfa' : enemyActionPct > 0.15 ? '#fbbf24' : '#ef4444'

  return (
    <div className="flex flex-col items-center gap-4 select-none" style={{ userSelect: 'none' }}>

      {/* ── Two-panel combat area ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>

        {/* Player panel */}
        <div style={{
          flex: 1, background: 'rgba(96,165,250,0.05)',
          border: `1px solid ${dodgeShake ? 'rgba(56,189,248,0.5)' : 'rgba(96,165,250,0.15)'}`,
          borderRadius: 14, padding: '0.65rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: '0.3rem',
          animation: dodgeShake ? 'dodge-slide 0.5s ease' : 'none',
          transition: 'border-color 0.2s',
        }}>
          <div style={{ position: 'relative', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={shipImageUrl} alt={shipName} style={{ width: '100%', height: 72, objectFit: 'contain', objectPosition: 'center' }} />
            {pHitsplat.key > 0 && <Hitsplat key={pHitsplat.key} text={pHitsplat.text} color={pHitsplat.color} big={pHitsplat.big} animKey={pHitsplat.key} />}
            {showDodgeVFX && (
              <>
                <span style={{ position: 'absolute', left: '60%', top: '15%', fontSize: '1.5rem', animation: 'cannon-shot 0.55s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💨</span>
                <span style={{ position: 'absolute', left: '20%', top: '35%', fontSize: '1.2rem', animation: 'cannon-shot 0.5s 0.07s ease forwards', pointerEvents: 'none', zIndex: 10 }}>⚡</span>
                <span style={{ position: 'absolute', left: '48%', top: '55%', fontSize: '1.0rem', animation: 'cannon-shot 0.6s 0.12s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💨</span>
              </>
            )}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.6rem', color: '#f0ede8', lineHeight: 1.2 }}>{shipName}</p>
          <HPBar current={playerHP} max={playerHPMax} color="#60a5fa" />

          {/* Player cannon charges */}
          <div style={{
            marginTop: 4,
            background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.15)',
            borderRadius: 8, padding: '0.4rem 0.35rem',
          }}>
            <p className="font-karla font-700 text-center" style={{ fontSize: '0.48rem', color: '#a07820', letterSpacing: '0.12em', marginBottom: 6 }}>CANNON</p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={{ scale: i === charges - 1 ? [1, 1.4, 1] : 1 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: i < charges ? '#f0c040' : 'rgba(255,255,255,0.07)',
                    boxShadow: i < charges ? '0 0 8px #f0c04099, 0 0 16px #f0c04044' : 'none',
                    border: `2px solid ${i < charges ? '#f0c040' : 'rgba(255,255,255,0.1)'}`,
                  }} />
              ))}
            </div>
            <p className="font-karla font-700 text-center"
              style={{ fontSize: '0.5rem', color: '#f0c040', marginTop: 5, letterSpacing: '0.1em',
                textShadow: isVolleyReady ? '0 0 8px #f0c040' : 'none',
                opacity: isVolleyReady ? 1 : 0, transition: 'opacity 0.2s' }}>
              VOLLEY
            </p>
          </div>

          {/* Damage range */}
          <div style={{ marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6 }}>
            <p className="font-karla font-400 text-center" style={{ fontSize: '0.45rem', color: '#5a5855', letterSpacing: '0.08em', marginBottom: 3 }}>DAMAGE</p>
            <p className="font-karla font-700 text-center" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>
              {shipMinDamage}–{powerMax}
            </p>
            <p className="font-karla font-400 text-center" style={{ fontSize: '0.42rem', color: '#5a5855', marginTop: 1 }}>
              crit {shipMinDamage * 2}–{Math.round(powerMax * 1.5)}
            </p>
          </div>
        </div>

        {/* Enemy panel */}
        <div style={{
          flex: 1,
          background: isBoss ? 'rgba(249,115,22,0.06)' : 'rgba(167,139,250,0.05)',
          border: `1px solid ${isBoss ? 'rgba(249,115,22,0.22)' : 'rgba(167,139,250,0.15)'}`,
          borderRadius: 14, padding: '0.65rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: '0.3rem',
          animation: critShake ? 'crit-shake 0.6s ease' : 'none',
        }}>
          <div className="flex items-center justify-between">
            <span className="font-karla font-400" style={{ fontSize: '0.44rem', color: '#4a4845' }}>Round {roundDisplay}</span>
            <div className="flex items-center gap-1">
              {enemyDodging && (
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="font-karla font-700"
                  style={{ fontSize: '0.44rem', color: '#38bdf8', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.08em' }}>
                  EVADING
                </motion.span>
              )}
              {isBoss && (
                <span className="font-karla font-700" style={{ fontSize: '0.44rem', color: '#f97316', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.08em' }}>BOSS</span>
              )}
            </div>
          </div>
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
                <span style={{ position: 'absolute', left: '18%', top: '38%', fontSize: isCritShot ? '1.6rem' : isVolleyShot ? '1.3rem' : '0.9rem', animation: 'cannon-shot 0.55s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
                {isCritShot && (
                  <>
                    <span style={{ position: 'absolute', left: '42%', top: '20%', fontSize: '1.4rem', animation: 'cannon-shot 0.5s 0.06s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
                    <span style={{ position: 'absolute', left: '28%', top: '55%', fontSize: '1.2rem', animation: 'cannon-shot 0.55s 0.1s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
                    <span style={{ position: 'absolute', left: '55%', top: '42%', fontSize: '1.8rem', animation: 'cannon-shot 0.65s 0.04s ease forwards', pointerEvents: 'none', zIndex: 10 }}>⭐</span>
                    <span style={{ position: 'absolute', left: '38%', top: '38%', fontSize: '1.5rem', animation: 'cannon-shot 0.7s 0.12s ease forwards', pointerEvents: 'none', zIndex: 10 }}>🔥</span>
                  </>
                )}
                {isVolleyShot && !isCritShot && (
                  <>
                    <span style={{ position: 'absolute', left: '35%', top: '55%', fontSize: '1.2rem', animation: 'cannon-shot 0.5s 0.07s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
                    <span style={{ position: 'absolute', left: '44%', top: '18%', fontSize: '1.4rem', animation: 'cannon-shot 0.6s 0.14s ease forwards', pointerEvents: 'none', zIndex: 10 }}>🔥</span>
                  </>
                )}
              </>
            )}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.6rem', color: '#f0ede8', lineHeight: 1.2 }}>{enemyName}</p>
          <HPBar current={enemyHP} max={enemyHPMax} color={isBoss ? '#f97316' : '#a78bfa'} />

          {/* Enemy cannon charges */}
          <div style={{
            marginTop: 4,
            background: enemyCharges > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${enemyCharges > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 8, padding: '0.4rem 0.35rem',
            transition: 'all 0.3s',
          }}>
            <p className="font-karla font-700 text-center" style={{ fontSize: '0.48rem', color: enemyCharges > 0 ? '#ef4444' : '#3a3835', letterSpacing: '0.12em', marginBottom: 6, transition: 'color 0.3s' }}>CANNONS</p>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={{ scale: i === enemyCharges - 1 ? [1, 1.5, 1] : 1 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: i < enemyCharges ? '#ef4444' : 'rgba(255,255,255,0.06)',
                    boxShadow: i < enemyCharges ? '0 0 8px #ef444499, 0 0 16px #ef444433' : 'none',
                    border: `2px solid ${i < enemyCharges ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                  }} />
              ))}
            </div>
          </div>

          {/* Enemy action bar */}
          <div style={{ marginTop: 4 }}>
            <p className="font-karla font-700" style={{ fontSize: '0.45rem', color: actionBarColor, letterSpacing: '0.14em', marginBottom: 3, transition: 'color 0.3s' }}>ACTION</p>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${enemyActionPct * 100}%`,
                background: actionBarColor,
                boxShadow: enemyActionPct < 0.25 ? `0 0 8px ${actionBarColor}88` : 'none',
                transition: 'background 0.3s, box-shadow 0.3s',
                borderRadius: 4,
              }} />
            </div>
          </div>
        </div>

      </div>

      {/* ── Dodge prime indicator — always in DOM to prevent layout shift ─── */}
      <div style={{
        width: '100%', borderRadius: 12, padding: '0.45rem 0.65rem',
        background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)',
        opacity: dodgePrimed ? 1 : 0, pointerEvents: 'none', transition: 'opacity 0.15s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: '#38bdf8', letterSpacing: '0.1em' }}>⚡ DODGE PRIMED</span>
          <span className="font-karla font-400" style={{ fontSize: '0.45rem', color: 'rgba(56,189,248,0.55)' }}>window</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${dodgePrimePct * 100}%`,
            background: dodgePrimeBarColor,
            boxShadow: `0 0 8px ${dodgePrimeBarColor}88`,
            transition: 'background 0.2s', borderRadius: 4,
          }} />
        </div>
      </div>

      {/* ── Feedback ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 22 }}>
        <AnimatePresence mode="wait">
          {shotResult && (
            <motion.p key={shotResult} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: SHOT_COLOR[shotResult], textAlign: 'center' }}>
              {SHOT_LABEL[shotResult]}
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
          zoneRef={zoneTargetRef}
          hitHalfW={Math.max(0.045, 0.08 - (roundDisplay - 1) * 0.005)}
          critHalfW={Math.min(0.02, Math.max(0.004, 0.006 - (roundDisplay - 1) * 0.0003))}
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

      {/* ── Action buttons ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>

        {/* RELOAD */}
        {phase === 'playing' && (
          <motion.button
            onPointerDown={doReload}
            whileTap={canReload && charges < MAX_CHARGES && !isActionLocked ? { scale: 0.95 } : {}}
            className="font-karla font-700"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
              background: isActionLocked ? 'rgba(239,68,68,0.07)' : !canReload || charges >= MAX_CHARGES ? 'rgba(255,255,255,0.03)' : 'rgba(96,165,250,0.12)',
              border: `1px solid ${isActionLocked ? 'rgba(239,68,68,0.22)' : !canReload || charges >= MAX_CHARGES ? 'rgba(255,255,255,0.07)' : 'rgba(96,165,250,0.35)'}`,
              color: isActionLocked ? '#7a2a2a' : !canReload ? '#3a5a7a' : charges >= MAX_CHARGES ? '#4a4845' : '#60a5fa',
              fontSize: '0.85rem', letterSpacing: '0.06em',
              opacity: isActionLocked || !canReload || charges >= MAX_CHARGES ? 0.45 : 1,
              transition: 'all 0.12s',
            }}>
            {isActionLocked ? '…' : !canReload ? 'Loading…' : charges >= MAX_CHARGES ? 'Full' : 'RELOAD'}
          </motion.button>
        )}

        {/* DODGE */}
        {phase === 'playing' && (
          <motion.button
            onPointerDown={primeDodge}
            whileTap={!dodgeCooldown && !dodgePrimed && !isCommitted && !isActionLocked ? { scale: 0.95 } : {}}
            animate={
              dodgePrimed
                ? { boxShadow: ['0 0 0px #38bdf800', '0 0 14px #38bdf8aa', '0 0 6px #38bdf866'] }
                : {}
            }
            transition={{ duration: 0.4, repeat: Infinity }}
            className="font-karla font-700"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
              background: dodgePrimed        ? 'rgba(56,189,248,0.18)'
                        : isActionLocked     ? 'rgba(239,68,68,0.07)'
                        : dodgeCooldown      ? 'rgba(255,255,255,0.03)'
                        : isCommitted        ? 'rgba(251,146,60,0.06)'
                        :                     'rgba(56,189,248,0.10)',
              border: `1px solid ${
                dodgePrimed    ? 'rgba(56,189,248,0.65)'
                : isActionLocked ? 'rgba(239,68,68,0.22)'
                : dodgeCooldown  ? 'rgba(255,255,255,0.07)'
                : isCommitted    ? 'rgba(251,146,60,0.22)'
                :                  'rgba(56,189,248,0.3)'
              }`,
              color: dodgePrimed   ? '#38bdf8'
                   : isActionLocked ? '#7a2a2a'
                   : dodgeCooldown  ? '#2a4050'
                   : isCommitted    ? '#f97316'
                   :                  '#38bdf8',
              fontSize: '0.85rem', letterSpacing: '0.06em',
              opacity: isActionLocked || dodgeCooldown || isCommitted ? 0.45 : 1,
              transition: 'all 0.12s',
            }}>
            {dodgePrimed ? 'DODGING…' : isActionLocked ? '…' : dodgeCooldown ? '…' : isCommitted ? 'Busy' : 'DODGE'}
          </motion.button>
        )}

        {/* Right: FIRE / VOLLEY / idle start */}
        <motion.button
          onPointerDown={phase === 'playing' && !cannonJammed && charges > 0 && !isActionLocked ? fire : phase === 'idle' ? startGame : undefined}
          whileTap={charges > 0 && !cannonJammed && !isActionLocked ? { scale: 0.95 } : {}}
          className="font-karla font-700"
          style={{
            flex: 1, padding: '12px 0', borderRadius: 14,
            cursor: (phase === 'clear' || cannonJammed || (phase === 'playing' && charges === 0)) ? 'default' : 'pointer',
            background: cannonJammed       ? 'rgba(251,146,60,0.1)'
                      : isVolleyReady       ? 'rgba(240,192,64,0.18)'
                      : phase === 'playing' ? 'rgba(239,68,68,0.14)'
                      :                      'rgba(56,189,248,0.14)',
            border: `1px solid ${
              cannonJammed       ? 'rgba(251,146,60,0.3)'
              : isVolleyReady    ? 'rgba(240,192,64,0.55)'
              : phase === 'playing' ? 'rgba(239,68,68,0.38)'
              :                    'rgba(56,189,248,0.38)'
            }`,
            color: cannonJammed        ? '#f97316'
                 : isVolleyReady       ? '#f0c040'
                 : phase === 'playing' ? '#ef4444'
                 :                      '#38bdf8',
            fontSize: cannonJammed ? '0.72rem' : '0.92rem',
            letterSpacing: '0.06em',
            opacity: phase === 'clear' ? 0 : (phase === 'playing' && charges === 0 && !cannonJammed) ? 0.35 : cannonJammed ? 0.7 : 1,
            pointerEvents: phase === 'clear' ? 'none' : 'auto',
            transition: 'all 0.12s',
            boxShadow: isVolleyReady ? '0 0 12px rgba(240,192,64,0.25)' : 'none',
          }}>
          {phase === 'idle'        ? 'Open Fire'
         : cannonJammed            ? 'Jammed…'
         : phase === 'playing' && charges === 0 ? 'No Charges'
         : isVolleyReady           ? '🔥 VOLLEY'
         : phase === 'playing'     ? 'FIRE'
         :                          'Try Again'}
        </motion.button>
      </div>

      {/* ── Crit flash ───────────────────────────────────────────────────────── */}
      {critFlash && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40,
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.35) 0%, rgba(251,191,36,0.08) 60%, transparent 100%)',
          animation: 'crit-flash 0.38s ease forwards',
        }} />
      )}

      {/* ── Dodge flash ──────────────────────────────────────────────────────── */}
      {dodgeFlash && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40,
          background: 'radial-gradient(ellipse at center, rgba(56,189,248,0.3) 0%, rgba(56,189,248,0.07) 60%, transparent 100%)',
          animation: 'crit-flash 0.34s ease forwards',
        }} />
      )}

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

      {/* Idle badge */}
      {phase === 'idle' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-1">
          <span style={{ fontSize: '0.65rem', color: '#9a9488', fontFamily: 'var(--font-karla)' }}>
            DMG <span style={{ color: '#f0ede8', fontWeight: 700 }}>{shipMinDamage}–{powerMax}</span>
            <span style={{ color: '#5a5855' }}> · crit {shipMinDamage * 2}–{Math.round(powerMax * 1.5)}</span>
          </span>
        </motion.div>
      )}

      <style>{`
        @keyframes hitsplat-pop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10%) scale(0.2) rotate(-10deg); }
          28%  { opacity: 1; transform: translateX(-50%) translateY(-65%) scale(1.25) rotate(4deg); }
          55%  { opacity: 1; transform: translateX(-50%) translateY(-58%) scale(1) rotate(0deg); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-74%) scale(0.85) rotate(0deg); }
        }
        @keyframes cannon-shot {
          0%   { opacity: 0; transform: translate(-20px, 6px) scale(0.2) rotate(-20deg); }
          30%  { opacity: 1; transform: translate(0) scale(1.2) rotate(5deg); }
          65%  { opacity: 0.7; transform: translate(4px, -5px) scale(0.9); }
          100% { opacity: 0; transform: translate(10px, -10px) scale(0.3); }
        }
        @keyframes crit-shake {
          0%   { transform: translateX(0) rotate(0deg); }
          12%  { transform: translateX(-10px) rotate(-1.5deg); }
          25%  { transform: translateX(10px) rotate(1.5deg); }
          38%  { transform: translateX(-8px) rotate(-1deg); }
          52%  { transform: translateX(8px) rotate(1deg); }
          65%  { transform: translateX(-4px) rotate(-0.5deg); }
          78%  { transform: translateX(4px) rotate(0.3deg); }
          90%  { transform: translateX(-2px); }
          100% { transform: translateX(0) rotate(0deg); }
        }
        @keyframes crit-flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes dodge-slide {
          0%   { transform: translateX(0) rotate(0deg); }
          18%  { transform: translateX(14px) rotate(1deg); }
          38%  { transform: translateX(-6px) rotate(-0.5deg); }
          60%  { transform: translateX(4px) rotate(0.3deg); }
          80%  { transform: translateX(-2px); }
          100% { transform: translateX(0) rotate(0deg); }
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
