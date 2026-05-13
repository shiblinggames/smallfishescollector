'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { awardPracticeKill } from './practiceActions'
import { getShipSkin } from '@/lib/shipSkins'
import { getXPProgress, getLevelFromXP, MAX_LEVEL } from '@/lib/expeditionLevel'
import RaidCombat from '../RaidCombat'
import type { BroadsideEnemy, EnemyAction } from '@/lib/bossRaids'
import NavLevelUpOverlay, { NavLevelUpInfo } from '@/components/NavLevelUpOverlay'
import TapToContinueGate from '@/components/TapToContinueGate'

type GamePhase  = 'idle' | 'playing' | 'win' | 'dead'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null

// ── Enemy definitions ─────────────────────────────────────────────────────────

const ENEMY_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/'

interface PracticeEnemy {
  id: string
  name: string
  hpBase: number
  minDmg: number
  maxDmg: number
  shipSpeed: number
  actionMs: number
  pattern: EnemyAction[]
  image: string
  portrait?: string
  killGold: number
  killXP: number
}

const PRACTICE_ENEMIES: Record<string, PracticeEnemy> = {
  brute: {
    id: 'brute', name: 'Reef Raider', hpBase: 25, minDmg: 2, maxDmg: 5,
    shipSpeed: 4, actionMs: 4500, pattern: ['reload', 'fire', 'reload', 'fire'],
    image: '/enemytier1.png', portrait: ENEMY_IMG_BASE + 'reefraider.png', killGold: 20, killXP: 20,
  },
  sniper: {
    id: 'sniper', name: "Crow's Nest Marksman", hpBase: 30, minDmg: 2, maxDmg: 10,
    shipSpeed: 3, actionMs: 5500, pattern: ['reload', 'reload', 'dodge', 'reload', 'fire'],
    image: '/enemytier1scout.png', portrait: ENEMY_IMG_BASE + 'crowsnestmarksman.png', killGold: 25, killXP: 30,
  },
  corsair: {
    id: 'corsair', name: 'Saltwater Corsair', hpBase: 38, minDmg: 6, maxDmg: 9,
    shipSpeed: 7, actionMs: 3500, pattern: ['reload', 'dodge', 'fire', 'reload', 'fire'],
    image: '/enemytier1elite.png', portrait: ENEMY_IMG_BASE + 'saltwatercorsair.png', killGold: 35, killXP: 45,
  },
}
const NON_BOSS_IDS = ['brute', 'sniper', 'corsair'] as const
function pickRandomEnemy(): PracticeEnemy {
  return PRACTICE_ENEMIES[NON_BOSS_IDS[Math.floor(Math.random() * NON_BOSS_IDS.length)]]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHARGES         = 3
const SPEED_BASE          = 0.006
const CANNON_MISS_CD      = 2400
const DODGE_PRIME_MS      = 750
const DODGE_COOLDOWN_MISS = 2200
const ENEMY_DODGE_MS      = 1400
const GRAZE_W             = 0.038
const PRACTICE_XP         = 25

function getFireZones(zoneCenter = 0.5) {
  const hitW  = 0.06
  const critW = 0.007
  return {
    grazeL: zoneCenter - hitW - GRAZE_W, hitL: zoneCenter - hitW, critL: zoneCenter - critW,
    critR: zoneCenter + critW, hitR: zoneCenter + hitW, grazeR: zoneCenter + hitW + GRAZE_W,
  }
}
function getShotResult(pos: number, zoneCenter: number): ShotResult {
  const z = getFireZones(zoneCenter)
  if (pos >= z.critL && pos <= z.critR)   return 'critical'
  if (pos >= z.hitL  && pos <= z.hitR)    return 'hit'
  if (pos >= z.grazeL && pos <= z.grazeR) return 'graze'
  return 'miss'
}

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

function rollIncomingDamage(enemy: PracticeEnemy): number {
  return Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
}

const SHOT_LABEL: Record<string, string> = { critical: 'Critical!', hit: 'Hit!', graze: 'Graze', miss: 'Miss' }
const SHOT_COLOR: Record<string, string> = { critical: '#fbbf24', hit: '#4ade80', graze: '#94a3b8', miss: '#6b7280' }

// ── Sub-components ────────────────────────────────────────────────────────────

function Hitsplat({ text, color, big, animKey }: { text: string; color: string; big?: boolean; animKey: number }) {
  return (
    <div key={animKey} style={{
      position: 'absolute', top: '40%', left: '50%',
      animation: 'hitsplat-pop 1.1s ease forwards',
      pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap',
    }}>
      <div style={{
        background: color,
        borderRadius: big ? '45% 55% 52% 48% / 48% 52% 55% 45%' : '50% 50% 48% 52% / 52% 48% 50% 50%',
        padding: big ? '0.42rem 0.9rem' : '0.22rem 0.55rem',
        boxShadow: big ? `0 3px 18px ${color}99, 0 0 10px ${color}66` : `0 2px 10px ${color}88`,
        transform: big ? 'rotate(-4deg)' : 'rotate(2deg)',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: big ? '1.05rem' : '0.75rem', color: '#fff', lineHeight: 1,
          textShadow: '0 1px 4px rgba(0,0,0,0.75)',
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
        <p className="font-karla" style={{ fontSize: '0.55rem', color: '#c0b8a8', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>HP</p>
        <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: barColor, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{current}/{max}</p>
      </div>
      <div style={{ height: 7, background: 'rgba(0,0,0,0.45)', borderRadius: 4, overflow: 'hidden' }}>
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
  const totalW   = hitHalfW * 2 + GRAZE_W * 2
  const hitPct   = (hitHalfW * 2 / totalW) * 100
  const hitLeft  = (GRAZE_W / totalW) * 100
  const critPct  = Math.max(8, (critHalfW * 2 / totalW) * 100)
  const critLeft = (100 - critPct) / 2
  return (
    <div style={{ position: 'relative', height: 44, borderRadius: 8 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 8,
        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.35)',
        overflow: 'hidden',
      }}>
        <div ref={zoneRef} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${(0.5 - hitHalfW - GRAZE_W) * 100}%`,
          width: `${totalW * 100}%`,
        }}>
          <div style={{
            position: 'absolute', inset: '3px 0',
            clipPath: 'polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%)',
            background: 'rgba(148,163,184,0.12)',
            filter: 'drop-shadow(0 0 3px rgba(148,163,184,0.3))',
          }} />
          <div style={{
            position: 'absolute', top: '3px', bottom: '3px',
            left: `${hitLeft}%`, width: `${hitPct}%`,
            background: 'rgba(74,222,128,0.22)',
          }} />
          <div style={{
            position: 'absolute', top: '25%', bottom: '25%',
            left: 'calc(50% - 1px)', width: 1,
            background: 'rgba(74,222,128,0.4)',
          }} />
          <motion.div
            animate={{ opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: '3px', bottom: '3px',
              left: `${critLeft}%`, width: `${critPct}%`,
              background: 'rgba(251,191,36,0.5)', borderRadius: 2,
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

// ── Nav level bar ─────────────────────────────────────────────────────────────

function NavLevelBar({ xp }: { xp: number }) {
  const { level, progress, xpInLevel, xpForLevel } = getXPProgress(xp)
  const isMax = level >= MAX_LEVEL
  const fillPct = isMax ? 100 : progress * 100
  const toGo = xpForLevel - xpInLevel
  const c = '#4ade80'
  return (
    <div className="flex items-center gap-2"
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${c}28`, borderRadius: 16, padding: '0.35rem 0.75rem' }}>
      <div className="shrink-0 flex items-baseline gap-0.5">
        <span className="font-karla font-600" style={{ fontSize: '0.42rem', color: c + 'bb', letterSpacing: '0.08em' }}>NAV</span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: c, lineHeight: 1 }}>{level}</span>
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <motion.div
          key={level}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${c}88 0%, ${c} 100%)`,
            boxShadow: `0 0 8px ${c}70`,
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="font-karla font-600 shrink-0"
        style={{ fontSize: '0.55rem', color: isMax ? c : 'rgba(255,255,255,0.55)', lineHeight: 1 }}>
        {isMax ? 'MAX' : `${toGo.toLocaleString()} xp`}
      </p>
    </div>
  )
}

// ── Tour steps ────────────────────────────────────────────────────────────────

const PRACTICE_TOUR = [
  { title: 'Hit the zone', body: "A marker sweeps back and forth along the bar. Fire when it lines up with the glowing target zone. Miss and your cannon jams briefly — so aim before you pull the trigger." },
  { title: 'Reload first', body: "Your cannon starts empty. Hit Reload to load a charge. You can stack up to 3 charges before firing — but the enemy is shooting back, so don't wait too long." },
  { title: 'Volley', body: "Fire with all 3 charges loaded and it fires as a Volley — double damage in one shot. Worth saving up when the hit zone is wide." },
  { title: 'Dodge incoming shots', body: "Watch the enemy's action bar. When it fills, they fire. Hit Dodge just before they do and you'll take 80% less damage. Dodge too early and you're locked out for a moment." },
]

// ── Main ──────────────────────────────────────────────────────────────────────

interface RaidCrewMember {
  name: string
  imageUrl: string
  power: number
  dodge: number
  fortune: number
}

export default function PracticeRaidGame({
  shipImageUrl, shipName, username, playerHPMax, shipMinDamage, shipSpeed,
  totalPower, totalDodge, totalFortune, crewMembers, equippedShipSkin,
  equippedRaidItems = [],
  hasSeenTutorial, hasCompletedPractice, initialExpeditionXP,
}: {
  shipImageUrl: string
  shipName: string
  username: string | null
  playerHPMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  crewMembers: RaidCrewMember[]
  equippedShipSkin: string | null
  equippedRaidItems?: string[]
  hasSeenTutorial: boolean
  hasCompletedPractice: boolean
  initialExpeditionXP: number
}) {
  const router = useRouter()
  const shipSkinDef       = equippedShipSkin ? getShipSkin(equippedShipSkin) : undefined
  const shipFilter        = shipSkinDef?.filter ?? 'none'
  const dodgeBonus        = totalDodge * 5
  const playerActionMs    = Math.max(700, 2000 - shipSpeed * 100)
  const dodgeCooldownUse  = Math.max(500, 1600 - dodgeBonus)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Tour
  const [seenTutorial, setSeenTutorial] = useState(hasSeenTutorial)
  const [showTour, setShowTour]   = useState(false)
  const [tourStep, setTourStep]   = useState(0)

  // Game state
  const [phase, setPhase]           = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]     = useState(playerHPMax)
  const [enemyHP, setEnemyHP]       = useState(0)
  const [enemyHPMax, setEnemyHPMax] = useState(0)
  const [enemyName, setEnemyName]   = useState('')
  const [enemyImage, setEnemyImage]     = useState(PRACTICE_ENEMIES.brute.image)
  const [enemyPortrait, setEnemyPortrait] = useState<string | null>(PRACTICE_ENEMIES.brute.portrait ?? null)
  const [enemyCharges, setEnemyCharges]   = useState(0)
  const [enemyDodging, setEnemyDodging]   = useState(false)
  const [enemyActionPct, setEnemyActionPct] = useState(1)
  const [charges, setCharges]             = useState(0)
  const [playerActionPct, setPlayerActionPct] = useState(0)
  const [shotResult, setShotResult]       = useState<ShotResult>(null)
  const [dodgePrimed, setDodgePrimed]     = useState(false)
  const [dodgeCooldown, setDodgeCooldown] = useState(false)
  const [dodgePrimePct, setDodgePrimePct] = useState(1)
  const [actionLocked, setActionLocked]   = useState(false)
  const [dodgeFlash, setDodgeFlash]       = useState(false)
  const [dodgeShake, setDodgeShake]       = useState(false)
  const [showDodgeVFX, setShowDodgeVFX]   = useState(false)
  const [cannonJammed, setCannonJammed]   = useState(false)
  const [enemySinking, setEnemySinking]   = useState(false)
  const [showCannonShot, setShowCannonShot] = useState(false)
  const [isVolleyShot, setIsVolleyShot]   = useState(false)
  const [isCritShot, setIsCritShot]       = useState(false)
  const [critShake, setCritShake]         = useState(false)
  const [critFlash, setCritFlash]         = useState(false)
  const [hitShake, setHitShake]           = useState(false)
  const [playerRecoil, setPlayerRecoil]   = useState(false)
  const [playerHitShake, setPlayerHitShake] = useState(false)
  const [pHitsplat, setPHitsplat]         = useState({ key: 0, text: '', color: '', big: false })
  const [eHitsplat, setEHitsplat]         = useState({ key: 0, text: '', color: '', big: false })
  const [winGold, setWinGold]             = useState(0)
  const [winXP, setWinXP]                 = useState(0)
  const [winPhase, setWinPhase]           = useState<'summary' | 'claimed'>('summary')
  const [isClaiming, setIsClaiming]       = useState(false)
  const [navXP, setNavXP]                 = useState(initialExpeditionXP)
  // Ref-mirror of navXP — async callbacks close over the initial value
  // otherwise (useCallback deps don't include navXP).
  const navXPRef                          = useRef(initialExpeditionXP)
  const [levelUp, setLevelUp]             = useState<NavLevelUpInfo | null>(null)
  // Tap-to-continue gate shown after every kill when no level-up fires.
  const [awaitingContinue, setAwaitingContinue] = useState(false)
  // Action to run after the level-up celebration OR tap-to-continue is
  // dismissed.
  const pendingAdvanceRef                 = useRef<(() => void) | null>(null)
  const [xpPopup, setXpPopup]             = useState<{ value: number; id: number } | null>(null)

  const fireIndicatorRef  = useRef<HTMLDivElement>(null)
  const fireFlashRef      = useRef<HTMLDivElement>(null)
  const zoneTargetRef     = useRef<HTMLDivElement>(null)
  const critFreezeRef     = useRef(false)
  const firePosRef        = useRef(0)
  const fireDirRef        = useRef(1)
  const zonePosRef        = useRef(0.5)
  const zoneDirRef        = useRef(1)
  const currentEnemyRef   = useRef<PracticeEnemy>(PRACTICE_ENEMIES.brute)
  // Bumped on each startGame so the <RaidCombat /> key always changes between
  // fights — even when the new random enemy happens to share id+hpBase with
  // the previous one (which would otherwise reuse the dead RaidCombat instance
  // with subPhase still 'done', leaving the game stuck).
  const [fightId, setFightId] = useState(0)
  const phaseRef          = useRef<GamePhase>('idle')
  const playerHPRef       = useRef(playerHPMax)
  const enemyHPRef        = useRef(0)
  const playerActionElapsedRef = useRef(0)
  const playerReadyRef    = useRef(false)
  const reloadSlowRef     = useRef(false)
  const chargesRef        = useRef(0)
  const dodgePrimedRef    = useRef(false)
  const dodgeCooldownRef  = useRef(false)
  const actionLockedRef   = useRef(false)
  const dodgePrimeElapsedRef = useRef(0)
  const dodgePrimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consecutiveDodgesRef = useRef(0)
  const rafRef            = useRef(0)
  const enemyChargesRef   = useRef(0)
  const enemyDodgingRef   = useRef(false)
  const enemyDodgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enemyPatternIdxRef = useRef(0)
  const enemyActionElapsedRef = useRef(0)
  const roundEndingRef    = useRef(false)

  const startGame = useCallback((enemy: PracticeEnemy) => {
    currentEnemyRef.current = enemy
    setFightId(id => id + 1)  // force <RaidCombat /> remount
    firePosRef.current = 0; fireDirRef.current = 1
    const halfW = 0.06 + GRAZE_W
    zonePosRef.current = halfW + Math.random() * (1 - halfW * 2)
    zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
    playerHPRef.current = playerHPMax
    playerActionElapsedRef.current = 0
    playerReadyRef.current = false
    reloadSlowRef.current = false
    chargesRef.current = 0
    if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
    dodgePrimedRef.current = false
    dodgeCooldownRef.current = false
    actionLockedRef.current = false
    dodgePrimeElapsedRef.current = 0
    consecutiveDodgesRef.current = 0
    roundEndingRef.current = false
    enemyHPRef.current = enemy.hpBase
    enemyChargesRef.current = 0
    enemyDodgingRef.current = false
    if (enemyDodgeTimeoutRef.current) { clearTimeout(enemyDodgeTimeoutRef.current); enemyDodgeTimeoutRef.current = null }
    enemyPatternIdxRef.current = 0
    enemyActionElapsedRef.current = 0

    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(playerHPMax)
    setEnemyHP(enemy.hpBase); setEnemyHPMax(enemy.hpBase)
    setEnemyName(enemy.name); setEnemyImage(enemy.image); setEnemyPortrait(enemy.portrait ?? null)
    setEnemyCharges(0); setEnemyDodging(false); setEnemyActionPct(1)
    setCharges(0); setPlayerActionPct(0)
    setCannonJammed(false); setActionLocked(false)
    setShotResult(null); setDodgePrimed(false); setDodgeCooldown(false)
    setDodgePrimePct(1); setDodgeFlash(false); setDodgeShake(false); setShowDodgeVFX(false)
    setEnemySinking(false); setShowCannonShot(false)
    setWinGold(0); setWinXP(0); setWinPhase('summary')
  }, [playerHPMax])

  function handleOpenFire() {
    if (phaseRef.current !== 'idle') return
    if (!seenTutorial) { setShowTour(true); return }
    const enemy = hasCompletedPractice ? pickRandomEnemy() : PRACTICE_ENEMIES.brute
    startGame(enemy)
  }

  function dismissTour() {
    setSeenTutorial(true)
    setShowTour(false)
    setTourStep(0)
    const enemy = hasCompletedPractice ? pickRandomEnemy() : PRACTICE_ENEMIES.brute
    startGame(enemy)
  }

  // Turn-based: no "OPEN FIRE" gate; auto-enter combat on mount.
  // First-time users still get the tour from handleOpenFire().
  // Defer past the first paint via double-RAF — framer-motion content in
  // <RaidCombat /> mounted during initial layout was pulling the body-level
  // fixed Nav + MobileTabBar into iOS PWA's compositing context and making
  // them drift on scroll. See memory: feedback_pagetransition_ios_pwa.md
  const autoStartedRef = useRef(false)
  const autoStartRafRef = useRef(0)
  useEffect(() => {
    if (autoStartedRef.current) return
    autoStartedRef.current = true
    autoStartRafRef.current = requestAnimationFrame(() => {
      autoStartRafRef.current = requestAnimationFrame(() => { handleOpenFire() })
    })
    return () => { if (autoStartRafRef.current) cancelAnimationFrame(autoStartRafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Combat loop
  useEffect(() => {
    // Disabled: the playing phase now runs inside <RaidCombat />, which owns
    // its own state/RAF. The old combat loop below is kept commented out so
    // unused old-combat refs/setters don't need to be torn out yet — we'll
    // clean those up in a follow-up.
    return
    /*
    if (phase !== 'playing') return
    let lastTime = performance.now()
    function loop(now: number) {
      if (phaseRef.current !== 'playing') return
      const dt = Math.min(now - lastTime, 50)
      lastTime = now

      // Fire indicator
      if (!critFreezeRef.current) {
        firePosRef.current += SPEED_BASE * (dt / 16.67) * fireDirRef.current
      }
      if (firePosRef.current >= 1) { firePosRef.current = 1; fireDirRef.current = -1 }
      if (firePosRef.current <= 0) { firePosRef.current = 0; fireDirRef.current =  1 }

      // Zone block
      const halfW = 0.06 + GRAZE_W
      const zSpeed = (3000 / currentEnemyRef.current.actionMs) * 0.0028 * (dt / 16.67)
      zonePosRef.current += zSpeed * zoneDirRef.current
      if (zonePosRef.current >= 1 - halfW) { zonePosRef.current = 1 - halfW; zoneDirRef.current = -1 }
      if (zonePosRef.current <= halfW)      { zonePosRef.current = halfW;     zoneDirRef.current =  1 }

      if (zoneTargetRef.current) {
        zoneTargetRef.current.style.left  = `${(zonePosRef.current - halfW) * 100}%`
        zoneTargetRef.current.style.width = `${halfW * 2 * 100}%`
      }
      if (fireIndicatorRef.current) {
        const zone = getShotResult(firePosRef.current, zonePosRef.current)
        const s = indicatorStyle(zone)
        fireIndicatorRef.current.style.left       = `calc(${firePosRef.current * 100}% - 2px)`
        fireIndicatorRef.current.style.background = s.bg
        fireIndicatorRef.current.style.boxShadow  = s.shadow
      }

      if (roundEndingRef.current) { rafRef.current = requestAnimationFrame(loop); return }

      // Player action bar
      playerActionElapsedRef.current += dt
      const effectiveActionMs = reloadSlowRef.current ? playerActionMs * 2 : playerActionMs
      const pPct = Math.min(1, Math.max(0, playerActionElapsedRef.current / effectiveActionMs))
      if (pPct >= 1 && reloadSlowRef.current) reloadSlowRef.current = false
      playerReadyRef.current = pPct >= 1
      setPlayerActionPct(pPct)

      // Dodge prime countdown
      if (dodgePrimedRef.current) {
        dodgePrimeElapsedRef.current += dt
        setDodgePrimePct(Math.max(0, 1 - dodgePrimeElapsedRef.current / DODGE_PRIME_MS))
      }

      // Enemy action timer
      const e = currentEnemyRef.current
      enemyActionElapsedRef.current += dt
      setEnemyActionPct(Math.max(0, 1 - enemyActionElapsedRef.current / e.actionMs))

      if (enemyActionElapsedRef.current >= e.actionMs) {
        enemyActionElapsedRef.current = 0
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
              if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
              dodgePrimedRef.current = false
              dodgePrimeElapsedRef.current = 0
              setDodgePrimed(false); setDodgePrimePct(1)
              const rawDmg    = rollIncomingDamage(e)
              const dodgedDmg = Math.max(1, Math.round(rawDmg * 0.2))
              playerHPRef.current = Math.max(0, playerHPRef.current - dodgedDmg)
              setPlayerHP(playerHPRef.current)
              playerActionElapsedRef.current = playerActionMs
              setShotResult(null)
              setPHitsplat(p => ({ key: p.key + 1, text: `-${dodgedDmg}`, color: '#38bdf8', big: false }))
              setDodgeShake(true); setDodgeFlash(true); setShowDodgeVFX(true)
              setTimeout(() => setDodgeShake(false), 520)
              setTimeout(() => setDodgeFlash(false), 340)
              setTimeout(() => setShowDodgeVFX(false), 650)
              dodgeCooldownRef.current = true; setDodgeCooldown(true)
              setTimeout(() => { dodgeCooldownRef.current = false; setDodgeCooldown(false) }, dodgeCooldownUse)
              if (playerHPRef.current <= 0) { phaseRef.current = 'dead'; setPhase('dead'); return }
            } else {
              const dmg = rollIncomingDamage(e)
              playerHPRef.current = Math.max(0, playerHPRef.current - dmg)
              setPlayerHP(playerHPRef.current)
              setPHitsplat(p => ({ key: p.key + 1, text: `-${dmg}`, color: '#f87171', big: true }))
              setPlayerHitShake(true)
              setTimeout(() => setPlayerHitShake(false), 520)
              if (playerHPRef.current <= 0) { phaseRef.current = 'dead'; setPhase('dead'); return }
              dodgeCooldownRef.current = true; setDodgeCooldown(true)
              setTimeout(() => { dodgeCooldownRef.current = false; setDodgeCooldown(false) }, DODGE_COOLDOWN_MISS)
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
    */
  }, [phase, playerActionMs, dodgeCooldownUse])

  const doReload = useCallback(() => {
    if (phaseRef.current !== 'playing' || !playerReadyRef.current || chargesRef.current >= MAX_CHARGES || actionLockedRef.current) return
    consecutiveDodgesRef.current = 0
    chargesRef.current = Math.min(MAX_CHARGES, chargesRef.current + 1)
    setCharges(chargesRef.current)
    reloadSlowRef.current = true
    playerActionElapsedRef.current = 0
    setPlayerActionPct(0)
  }, [])

  const fire = useCallback(() => {
    if (phaseRef.current !== 'playing' || !playerReadyRef.current || chargesRef.current < 1 || cannonJammed || actionLockedRef.current) return
    consecutiveDodgesRef.current = 0

    const isVolley = chargesRef.current === MAX_CHARGES
    chargesRef.current -= isVolley ? MAX_CHARGES : 1
    setCharges(chargesRef.current)

    const res = getShotResult(firePosRef.current, zonePosRef.current)
    setShotResult(res)
    snapIndicator(fireIndicatorRef)
    flashBar(fireFlashRef, res === 'critical' ? '#fbbf24' : res === 'hit' ? '#4ade80' : res === 'graze' ? '#94a3b8' : '#6b7280')

    playerActionElapsedRef.current = res === 'miss' ? -CANNON_MISS_CD : 0
    setPlayerActionPct(0)
    if (res === 'miss') setCannonJammed(true)

    const dmgMult = isVolley ? 2 : 1
    const dmg = rollShotDamage(res, shipMinDamage, totalPower) * dmgMult

    if (dmg > 0) {
      setShowCannonShot(true); setIsVolleyShot(isVolley); setIsCritShot(res === 'critical')
      setTimeout(() => setShowCannonShot(false), 700)
      setPlayerRecoil(true)
      setTimeout(() => setPlayerRecoil(false), 420)
      if (res === 'critical') {
        setCritShake(true); setCritFlash(true)
        critFreezeRef.current = true
        setTimeout(() => setCritShake(false), 620)
        setTimeout(() => setCritFlash(false), 380)
        setTimeout(() => { critFreezeRef.current = false }, 300)
      } else if (res === 'hit' || res === 'graze') {
        setHitShake(true)
        setTimeout(() => setHitShake(false), 470)
      }

      const blocked = enemyDodgingRef.current && res !== 'critical'
      const effectiveDmg = blocked ? Math.max(1, Math.round(dmg * 0.2)) : dmg
      enemyHPRef.current = Math.max(0, enemyHPRef.current - effectiveDmg)
      setEnemyHP(enemyHPRef.current)
      setEHitsplat(p => ({
        key: p.key + 1,
        text: blocked ? `-${effectiveDmg}` : `-${dmg}`,
        color: blocked ? '#38bdf8' : res === 'critical' ? '#fbbf24' : '#f87171',
        big: res === 'critical',
      }))

      if (enemyHPRef.current <= 0) {
        roundEndingRef.current = true
        setEnemySinking(true)
        const gold = currentEnemyRef.current.killGold
        const xp   = currentEnemyRef.current.killXP
        setWinGold(gold); setWinXP(xp)
        setTimeout(() => {
          roundEndingRef.current = false
          phaseRef.current = 'win'
          setPhase('win')
        }, 920)
        return
      }
    }

    if (res !== 'miss') setTimeout(() => setShotResult(null), 500)
    else setTimeout(() => { setCannonJammed(false); setShotResult(null) }, CANNON_MISS_CD)
  }, [shipMinDamage, totalPower, cannonJammed])

  const primeDodge = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    if (dodgeCooldownRef.current || dodgePrimedRef.current || actionLockedRef.current) return
    if (!playerReadyRef.current) return
    if (consecutiveDodgesRef.current >= 3) return

    playerActionElapsedRef.current = 0
    setPlayerActionPct(0)
    consecutiveDodgesRef.current++
    dodgePrimedRef.current = true
    dodgePrimeElapsedRef.current = 0
    setDodgePrimed(true); setDodgePrimePct(1)

    if (dodgePrimeTimerRef.current) clearTimeout(dodgePrimeTimerRef.current)
    dodgePrimeTimerRef.current = setTimeout(() => {
      dodgePrimedRef.current = false
      dodgePrimeElapsedRef.current = 0
      setDodgePrimed(false); setDodgePrimePct(1)
      actionLockedRef.current = true; setActionLocked(true)
      setTimeout(() => { actionLockedRef.current = false; setActionLocked(false) }, 1200)
    }, DODGE_PRIME_MS)
  }, [])

  // ─── Turn-based combat callbacks (called from <RaidCombat />) ─────────────

  const handleEnemyDefeated = useCallback(async (remainingPlayerHp: number) => {
    playerHPRef.current = remainingPlayerHp
    setPlayerHP(remainingPlayerHp)
    roundEndingRef.current = true
    setEnemySinking(true)
    const gold = currentEnemyRef.current.killGold
    const xp   = currentEnemyRef.current.killXP
    setWinGold(gold); setWinXP(xp)
    setEnemyName(currentEnemyRef.current.name)

    // Post-kill sequence: log narration already happened in <RaidCombat />.
    // Now: award → XP bar fills (≈700ms) → if level-up, show celebration and
    // defer post-battle screen until user dismisses → then surface "fight
    // another / return home".
    const showPostBattle = () => {
      roundEndingRef.current = false
      phaseRef.current = 'win'
      setPhase('win')
    }

    let res: { newExpeditionXP: number; newDoubloonTotal: number } | null = null
    try { res = await awardPracticeKill(xp, gold) } catch { /* save failed */ }
    if (!res) { setTimeout(showPostBattle, 400); return }

    const oldLevel = getLevelFromXP(navXPRef.current)
    const newLevel = getLevelFromXP(res.newExpeditionXP)
    navXPRef.current = res.newExpeditionXP
    setNavXP(res.newExpeditionXP)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
    if (xp > 0) setXpPopup({ value: xp, id: Date.now() })

    // Wait for the XP bar's 0.7s fill animation to land before the next beat.
    await new Promise<void>(r => setTimeout(r, 800))

    if (newLevel > oldLevel) {
      pendingAdvanceRef.current = showPostBattle
      setLevelUp({ fromLevel: oldLevel, toLevel: newLevel })
    } else {
      // Wait for a tap before surfacing the post-battle screen so the player
      // can sit on the log + XP totals at their own pace.
      pendingAdvanceRef.current = showPostBattle
      setAwaitingContinue(true)
    }
  }, [])

  const handlePlayerDefeated = useCallback(() => {
    phaseRef.current = 'dead'
    setPhase('dead')
  }, [])

  const collectReward = useCallback(async () => {
    if (isClaiming) return
    setIsClaiming(true)
    try {
      const res = await awardPracticeKill(winXP, winGold)
      setNavXP(res.newExpeditionXP)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
      if (winXP > 0) setXpPopup({ value: winXP, id: Date.now() })
    } catch { /* save failed, still advance */ } finally {
      setIsClaiming(false)
      setWinPhase('claimed')
    }
  }, [isClaiming, winXP, winGold])

  const retryGame = useCallback(() => {
    setWinPhase('summary')
    const enemy = hasCompletedPractice ? pickRandomEnemy() : PRACTICE_ENEMIES.brute
    startGame(enemy)
  }, [hasCompletedPractice, startGame])

  const isVolleyReady = charges === MAX_CHARGES
  const playerReady   = playerActionPct >= 1
  const isActionLocked = actionLocked
  const actionBarColor = enemyActionPct > 0.4 ? '#a78bfa' : enemyActionPct > 0.15 ? '#fbbf24' : '#ef4444'

  // ─── Playing phase: render the new turn-based combat ──────────────────────
  if (phase === 'playing') {
    const e = currentEnemyRef.current
    const enemyForCombat: BroadsideEnemy = {
      id: e.id, name: e.name, hpBase: e.hpBase, minDmg: e.minDmg, maxDmg: e.maxDmg,
      shipSpeed: e.shipSpeed, actionMs: e.actionMs, pattern: e.pattern,
      image: e.image, portrait: e.portrait,
    }
    return (
      <div className="flex flex-col items-center gap-2 select-none" style={{
        userSelect: 'none',
        // Reserve room for the MobileTabBar (~64px) + iOS safe-area-bottom,
        // plus a generous breathing gap above the bar so the action buttons
        // feel comfortably clear of it (was 8px, felt too tight).
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)',
        minHeight: 'calc(100dvh - 44px - env(safe-area-inset-bottom, 0px))',
      }}>
        {/* Leave link — always available so the player can back out at any
            time, even between auto-restarted fights. */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', marginBottom: 2 }}>
          <button
            onClick={() => router.push('/expeditions')}
            className="font-karla font-700 uppercase tracking-[0.12em]"
            style={{
              fontSize: '0.58rem', color: '#7a8aa0',
              background: 'rgba(20,28,40,0.6)',
              border: '1px solid rgba(122,138,160,0.3)',
              borderRadius: 999, padding: '0.35rem 0.7rem',
              cursor: 'pointer',
            }}
          >
            ← Leave
          </button>
        </div>
        {/* NavLevelBar must NOT be position:sticky — see memory
            feedback_pagetransition_ios_pwa.md. Combined with framer-motion
            compositing in RaidCombat, sticky here breaks the body's
            position:fixed Nav header + MobileTabBar in iOS PWA mode. */}
        <div style={{ width: '100%' }}>
          <NavLevelBar xp={navXP} />
          <AnimatePresence>
            {xpPopup && (
              <motion.p
                key={xpPopup.id}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], y: 18 }}
                transition={{ duration: 2.0, times: [0, 0.1, 0.6, 1], ease: 'easeOut' }}
                onAnimationComplete={() => setXpPopup(null)}
                className="font-karla font-700"
                style={{
                  position: 'absolute', right: 8, top: '100%',
                  fontSize: '0.8rem', color: '#4ade80',
                  pointerEvents: 'none',
                  textShadow: '0 0 10px rgba(74,222,128,0.7)',
                }}
              >
                +{xpPopup.value} XP
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div style={{ width: '100%', padding: '0 0.5rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <RaidCombat
            key={`practice-combat-${fightId}-${e.id}`}
            enemy={enemyForCombat}
            isBoss={false}
            shipImageUrl={shipImageUrl}
            shipFilter={shipFilter}
            shipName={shipName}
            playerLabel={username ?? shipName}
            playerHpMax={playerHPMax}
            playerHp={playerHP}
            shipMinDamage={shipMinDamage}
            shipSpeed={shipSpeed}
            totalPower={totalPower}
            totalNavigation={totalDodge}
            totalFortune={totalFortune}
            equippedRaidItems={equippedRaidItems}
            killReward={{ gold: e.killGold, xp: e.killXP }}
            onEnemyDefeated={handleEnemyDefeated}
            onPlayerDefeated={handlePlayerDefeated}
          />
        </div>

        {/* Nav level-up celebration — also rendered here so it surfaces while
            phase is still 'playing' (the post-kill gate). The fall-through
            return below also renders it for win/dead/idle states. */}
        <NavLevelUpOverlay
          info={levelUp}
          onDismiss={() => {
            setLevelUp(null)
            const fn = pendingAdvanceRef.current
            pendingAdvanceRef.current = null
            fn?.()
          }}
        />

        {/* Tap-to-continue gate after every kill (when no level-up). Lets
            the player sit on the action log + XP totals at their own pace
            before the post-battle screen pops up. */}
        <TapToContinueGate
          visible={awaitingContinue}
          onTap={() => {
            setAwaitingContinue(false)
            const fn = pendingAdvanceRef.current
            pendingAdvanceRef.current = null
            fn?.()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 select-none" style={{ userSelect: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}>

      {/* ── Nav level bar ─────────────────────────────────────────────────────── */}
      <div style={{ width: '100%', position: 'relative' }}>
        <NavLevelBar xp={navXP} />
        <AnimatePresence>
          {xpPopup && (
            <motion.p
              key={xpPopup.id}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 1, 0], y: 18 }}
              transition={{ duration: 2.0, times: [0, 0.1, 0.6, 1], ease: 'easeOut' }}
              onAnimationComplete={() => setXpPopup(null)}
              className="font-karla font-700"
              style={{
                position: 'absolute', right: 8, top: '100%',
                fontSize: '0.8rem', color: '#4ade80',
                pointerEvents: 'none',
                textShadow: '0 0 10px rgba(74,222,128,0.7)',
              }}
            >
              +{xpPopup.value} XP
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Combat scaffolding (status header, ships, HP/action bars, fire bar,
          action buttons) is now owned by <RaidCombat /> in the playing-phase
          early-return. The fall-through render here only handles the
          idle / win / dead / tutorial overlays, all of which are
          position:fixed and don't need any in-flow content. */}

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

      {/* Idle "OPEN FIRE" overlay removed — turn-based combat needs no
          real-time start gate; the skirmish auto-enters combat on mount
          and retryGame() jumps straight back into a new fight. The
          tutorial tour still fires for first-time users via
          handleOpenFire(). */}

      {/* ── Win overlay — just the next-step choice. The kill narration and
          reward streamed into the action log a beat earlier, so we don't
          repeat any of that here. */}
      <AnimatePresence>
        {phase === 'win' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.86)', zIndex: 50, padding: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 260 }}>
              <motion.button
                onPointerDown={retryGame}
                whileTap={{ scale: 0.96 }}
                animate={{ boxShadow: ['0 0 0px #ef444400', '0 0 18px #ef444466', '0 0 0px #ef444400'] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{ padding: '13px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(239,68,68,0.16)', border: '1.5px solid rgba(239,68,68,0.55)', color: '#ef4444', fontSize: '0.92rem' }}>
                Fight Another
              </motion.button>
              <motion.button
                onPointerDown={() => router.push('/expeditions')}
                whileTap={{ scale: 0.96 }}
                className="font-karla font-600 uppercase tracking-[0.06em]"
                style={{ padding: '13px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(240,237,232,0.7)', fontSize: '0.82rem' }}>
                Return Home
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nav level-up celebration ─────────────────────────────────────────── */}
      <NavLevelUpOverlay
        info={levelUp}
        onDismiss={() => {
          setLevelUp(null)
          const fn = pendingAdvanceRef.current
          pendingAdvanceRef.current = null
          fn?.()
        }}
      />

      {/* ── Dead overlay ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'dead' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 50 }}>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.32)', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Ship Sunk</p>
            <p className="font-cinzel font-700" style={{ color: '#f87171', fontSize: '2rem', marginBottom: 24 }}>Defeated</p>
            <motion.button
              onPointerDown={() => router.push('/expeditions')}
              whileTap={{ scale: 0.96 }}
              className="font-karla font-700"
              style={{ padding: '12px 32px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#c0b8a8', fontSize: '0.88rem', cursor: 'pointer', letterSpacing: '0.04em' }}>
              Return Home
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── First-time tour ───────────────────────────────────────────────────── */}
      {showTour && (
        <AnimatePresence>
          <motion.div
            key="practice-tour-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (tourStep < PRACTICE_TOUR.length - 1) setTourStep(s => s + 1) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, cursor: 'pointer' }}
          />
          <motion.div
            key={`practice-tour-${tourStep}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed', zIndex: 101,
              left: '1rem', right: '1rem',
              top: '50%', transform: 'translateY(-50%)',
              maxWidth: 340, margin: '0 auto',
              background: '#0d1520',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 14,
              padding: '1rem 1.1rem',
            }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: '#ef4444', marginBottom: '0.6rem' }}>
              Reef Skirmish — Tutorial
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8', marginBottom: '0.4rem' }}>
              {PRACTICE_TOUR[tourStep].title}
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, marginBottom: '0.85rem' }}>
              {PRACTICE_TOUR[tourStep].body}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845' }}>
                {tourStep + 1} / {PRACTICE_TOUR.length}
              </p>
              <button
                onClick={e => {
                  e.stopPropagation()
                  if (tourStep < PRACTICE_TOUR.length - 1) { setTourStep(s => s + 1) }
                  else { dismissTour() }
                }}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{
                  fontSize: '0.68rem', cursor: 'pointer', touchAction: 'manipulation',
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8, padding: '0.35rem 0.85rem',
                }}
              >
                {tourStep === PRACTICE_TOUR.length - 1 ? 'Got it' : 'Next →'}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      <style>{`
        @keyframes hitsplat-pop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10%) scale(0.1) rotate(-18deg); }
          18%  { opacity: 1; transform: translateX(-50%) translateY(-72%) scale(1.4) rotate(6deg); }
          38%  { opacity: 1; transform: translateX(-50%) translateY(-65%) scale(1.08) rotate(-3deg); }
          62%  { opacity: 1; transform: translateX(-50%) translateY(-68%) scale(1.02) rotate(2deg); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-84%) scale(0.82) rotate(0deg); }
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
        @keyframes hit-shake {
          0%   { transform: translateX(0) rotate(0deg); }
          15%  { transform: translateX(-6px) rotate(-1deg); }
          35%  { transform: translateX(6px) rotate(0.8deg); }
          55%  { transform: translateX(-4px) rotate(-0.5deg); }
          75%  { transform: translateX(3px) rotate(0.3deg); }
          90%  { transform: translateX(-1px); }
          100% { transform: translateX(0) rotate(0deg); }
        }
        @keyframes player-recoil {
          0%   { transform: translateX(0) rotate(0deg); }
          20%  { transform: translateX(-8px) rotate(-0.8deg); }
          50%  { transform: translateX(4px) rotate(0.4deg); }
          75%  { transform: translateX(-2px); }
          100% { transform: translateX(0) rotate(0deg); }
        }
        @keyframes player-hit {
          0%   { transform: translateX(0) scale(1); }
          15%  { transform: translateX(-12px) scale(0.97); }
          35%  { transform: translateX(10px) scale(1.01); }
          55%  { transform: translateX(-6px) scale(0.99); }
          75%  { transform: translateX(4px); }
          90%  { transform: translateX(-2px); }
          100% { transform: translateX(0) scale(1); }
        }
        @keyframes enemy-sink {
          0%   { transform: scaleX(-1) translateY(0) rotate(0deg); opacity: 1; }
          40%  { transform: scaleX(-1) translateY(4px) rotate(-6deg); opacity: 0.85; }
          100% { transform: scaleX(-1) translateY(60px) rotate(-18deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
