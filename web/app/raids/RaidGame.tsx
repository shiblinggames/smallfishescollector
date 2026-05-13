'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { claimRaidLoot } from './actions'
import { awardRaidKill } from './raidXPActions'
import { getShipSkin } from '@/lib/shipSkins'
import { getActiveEffects } from '@/lib/raidItems'
import { getXPProgress, getLevelFromXP, MAX_LEVEL } from '@/lib/expeditionLevel'
import {
  BossRaidConfig, BroadsideEnemy, RaidLootItem, RARITY_COLOR,
} from '@/lib/bossRaids'
import RaidCombat from './RaidCombat'
import NavLevelUpOverlay, { NavLevelUpInfo } from '@/components/NavLevelUpOverlay'
import TapToContinueGate from '@/components/TapToContinueGate'

type GamePhase  = 'idle' | 'ready' | 'playing' | 'clear' | 'dead' | 'loot'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null

function rollLootIndex(loot: RaidLootItem[]): number {
  const total = loot.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (let i = 0; i < loot.length; i++) {
    r -= loot[i].weight
    if (r <= 0) return i
  }
  return loot.length - 1
}

function isBossRound(round: number, seqLen: number): boolean {
  return round % (seqLen + 1) === seqLen
}
function getEnemyForRound(round: number, config: BossRaidConfig): BroadsideEnemy {
  const cycleLen = config.sequence.length + 1
  if (isBossRound(round, config.sequence.length)) return config.enemies[config.bossId]
  return config.enemies[config.sequence[round % cycleLen]]
}
function getEnemyHP(round: number, config: BossRaidConfig): number {
  return getEnemyForRound(round, config).hpBase
}
function getActionMs(round: number, config: BossRaidConfig): number {
  return getEnemyForRound(round, config).actionMs
}
function rollIncomingDamage(round: number, config: BossRaidConfig): number {
  const e = getEnemyForRound(round, config)
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

function fmtGold(n: number) { return n.toLocaleString() }

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

// (Removed: fmtTime + getTimeTier — Barnacle Pete no longer has a time limit
//  or speed-tier multipliers on loot. Every successful raid clear grants the
//  base loot roll. raidStartTimeRef is still tracked for the corsairs_bane
//  speedrun badge, but it doesn't gate or scale rewards.)

// ── Zone geometry ─────────────────────────────────────────────────────────────

const GRAZE_W = 0.038

function getFireZones(round: number, zoneCenter = 0.5) {
  const hitW  = Math.max(0.03, 0.06  - round * 0.004)
  const critW = 0.007
  return {
    grazeL: zoneCenter - hitW - GRAZE_W, hitL: zoneCenter - hitW, critL: zoneCenter - critW,
    critR: zoneCenter + critW, hitR: zoneCenter + hitW, grazeR: zoneCenter + hitW + GRAZE_W,
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
  const grazeW = GRAZE_W
  const totalW = hitHalfW * 2 + grazeW * 2
  const hitPct  = (hitHalfW * 2 / totalW) * 100
  const hitLeft = (grazeW / totalW) * 100
  const critVisualPct = Math.max(8, (critHalfW * 2 / totalW) * 100)
  const critLeft = (100 - critVisualPct) / 2
  return (
    <div style={{ position: 'relative', height: 44, borderRadius: 8 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 8,
        background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.35)',
        overflow: 'hidden',
      }}>
        {/* Moving ship target — left/width driven by RAF at 60fps via zoneRef */}
        <div ref={zoneRef} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${(0.5 - hitHalfW - grazeW) * 100}%`,
          width: `${totalW * 100}%`,
        }}>
          {/* Ship hull — outer graze zone (slate) */}
          <div style={{
            position: 'absolute', inset: '3px 0',
            clipPath: 'polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%)',
            background: 'rgba(148,163,184,0.12)',
            filter: 'drop-shadow(0 0 3px rgba(148,163,184,0.3))',
          }} />
          {/* Hit zone — green inner band */}
          <div style={{
            position: 'absolute', top: '3px', bottom: '3px',
            left: `${hitLeft}%`, width: `${hitPct}%`,
            background: 'rgba(74,222,128,0.22)',
          }} />
          {/* Mast line */}
          <div style={{
            position: 'absolute', top: '25%', bottom: '25%',
            left: 'calc(50% - 1px)', width: 1,
            background: 'rgba(74,222,128,0.4)',
          }} />
          {/* Crit zone — bridge marker */}
          <motion.div
            animate={{ opacity: [0.4, 0.75, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: '3px', bottom: '3px',
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

interface RaidCrewMember {
  name: string
  imageUrl: string
  power: number
  dodge: number
  fortune: number
}

export default function RaidGame({ config, equippedShipSkin, shipSkins, equippedItems,
  shipImageUrl, shipName, username, playerHPMax, shipMinDamage, shipSpeed,
  totalPower, totalDodge, totalFortune, crewCount, crewMembers, initialExpeditionXP,
}: {
  config: BossRaidConfig
  shipImageUrl: string
  shipName: string
  username: string | null
  playerHPMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  crewCount: number
  crewMembers: RaidCrewMember[]
  equippedShipSkin: string | null
  shipSkins: string[]
  equippedItems: string[]
  initialExpeditionXP: number
}) {
  const router            = useRouter()
  const shipSkinDef       = equippedShipSkin ? getShipSkin(equippedShipSkin) : undefined
  const shipFilter        = shipSkinDef?.filter ?? 'none'
  const dodgeBonus        = totalDodge * 5
  const fortuneMult       = 1 + totalFortune / 75   // 2× at max crew luck (~75)
  const playerActionMs    = Math.max(700, 2000 - shipSpeed * 100)
  const dodgeCooldownUse  = Math.max(500, 1600 - dodgeBonus)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const [phase, setPhase]               = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]         = useState(playerHPMax)
  const [enemyHP, setEnemyHP]           = useState(0)
  const [enemyHPMax, setEnemyHPMax]     = useState(0)
  const [enemyName, setEnemyName]       = useState('Reef Raider')
  const [enemyImage, setEnemyImage]     = useState(() => config.enemies[config.sequence[0]]?.image ?? '')
  const [enemyPortrait, setEnemyPortrait] = useState<string | null>(null)
  const [enemyCharges, setEnemyCharges]   = useState(0)
  const [enemyDodging, setEnemyDodging]   = useState(false)
  const [enemyActionPct, setEnemyActionPct] = useState(1)
  const [charges, setCharges]           = useState(0)
  const [playerActionPct, setPlayerActionPct] = useState(0)
  const [streak, setStreak]             = useState(0)
  const [best, setBest]                 = useState(0)
  const [winGold, setWinGold]           = useState(0)
  const [winXP, setWinXP]               = useState(0)
  const [winPhase, setWinPhase]         = useState<'summary' | 'claimed'>('summary')
  const [winIsBoss, setWinIsBoss]       = useState(false)
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
  const [showCrewInfo, setShowCrewInfo] = useState(false)
  const [cannonJammed, setCannonJammed] = useState(false)
  const [enemySinking, setEnemySinking] = useState(false)
  const [showCannonShot, setShowCannonShot] = useState(false)
  const [isVolleyShot, setIsVolleyShot] = useState(false)
  const [isCritShot, setIsCritShot]     = useState(false)
  const [critShake, setCritShake]       = useState(false)
  const [critFlash, setCritFlash]       = useState(false)
  const [hitShake, setHitShake]         = useState(false)
  const [playerRecoil, setPlayerRecoil] = useState(false)
  const [playerHitShake, setPlayerHitShake] = useState(false)
  const [clearReady, setClearReady]     = useState(false)
  const [lootAmount, setLootAmount]     = useState(0)
  const [lootBase, setLootBase]         = useState(0)
  const [lootOpened, setLootOpened]     = useState(false)
  const [lootClaimed, setLootClaimed]   = useState(false)
  const [slotDisplay, setSlotDisplay] = useState(0)
  const [slotLanded, setSlotLanded]   = useState(false)
  const [slotFinal, setSlotFinal]     = useState(0)
  const slotIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([])
  const [pHitsplat, setPHitsplat]       = useState({ key: 0, text: '', color: '', big: false })
  const [eHitsplat, setEHitsplat]       = useState({ key: 0, text: '', color: '', big: false })
  const [enemyMinDmg, setEnemyMinDmg]   = useState(2)
  const [enemyMaxDmg, setEnemyMaxDmg]   = useState(5)
  const [navXP, setNavXP]               = useState(initialExpeditionXP)
  // Mirror of navXP read from async callbacks — the useCallback closures don't
  // re-bake on every navXP change, so they'd see the initial value forever
  // without this. Keep in lockstep with setNavXP.
  const navXPRef                        = useRef(initialExpeditionXP)
  const [xpPopup, setXpPopup]           = useState<{ value: number; id: number } | null>(null)
  const [levelUp, setLevelUp]           = useState<NavLevelUpInfo | null>(null)
  // Tap-to-continue gate shown after every kill (no level-up branch).
  // Lets the player sit on the log + XP totals as long as they want
  // instead of being auto-advanced into the next fight.
  const [awaitingContinue, setAwaitingContinue] = useState(false)
  // Action to run once the level-up overlay OR the tap-to-continue prompt
  // is dismissed — used to gate the next-fight advance.
  const pendingAdvanceRef               = useRef<(() => void) | null>(null)

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
  const playerHPRef           = useRef(playerHPMax)
  const enemyHPRef            = useRef(0)
  const enemyHPMaxRef         = useRef(0)
  const phaseRef              = useRef<GamePhase>('idle')
  const playerActionElapsedRef = useRef(0)
  const playerReadyRef         = useRef(false)
  const reloadSlowRef          = useRef(false)
  const chargesRef            = useRef(1)
  const raidStartTimeRef      = useRef(0)
  const dodgePrimedRef        = useRef(false)
  const dodgeCooldownRef      = useRef(false)
  const actionLockedRef       = useRef(false)
  const dodgePrimeElapsedRef  = useRef(0)
  const dodgePrimeTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consecutiveDodgesRef  = useRef(0)
  const roundEndingRef        = useRef(false)
  const rafRef                = useRef(0)
  const enemyChargesRef        = useRef(0)
  const enemyDodgingRef        = useRef(false)
  const enemyDodgeTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enemyPatternIdxRef     = useRef(0)
  const enemyActionElapsedRef  = useRef(0)

  const resetEnemyForRound = useCallback((round: number) => {
    const e = getEnemyForRound(round, config)
    const hp = getEnemyHP(round, config)
    enemyHPRef.current          = hp
    enemyHPMaxRef.current       = hp
    enemyChargesRef.current     = 0
    enemyDodgingRef.current     = false
    if (enemyDodgeTimeoutRef.current) { clearTimeout(enemyDodgeTimeoutRef.current); enemyDodgeTimeoutRef.current = null }
    enemyPatternIdxRef.current  = 0
    enemyActionElapsedRef.current = 0
    setEnemyHP(hp); setEnemyHPMax(hp)
    setEnemyName(e.name)
    setEnemyImage(e.image)
    setEnemyPortrait(e.portrait ?? null)
    setEnemyCharges(0)
    setEnemyDodging(false)
    setEnemyActionPct(1)
    setIsBoss(isBossRound(round, config.sequence.length))
    setEnemyMinDmg(e.minDmg)
    setEnemyMaxDmg(e.maxDmg)
    // Randomize zone starting position for each round
    const hitW  = Math.max(0.03, 0.06 - round * 0.004)
    const halfW = hitW + GRAZE_W
    zonePosRef.current  = halfW + Math.random() * (1 - halfW * 2)
    zoneDirRef.current  = Math.random() < 0.5 ? 1 : -1
    if (isBossRound(round, config.sequence.length)) zoneJitterRef.current = 1800 + Math.random() * 2200
  }, [])

  const startGame = useCallback(() => {
    firePosRef.current      = 0; fireDirRef.current = 1
    zonePosRef.current      = 0.5; zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
    zoneJitterRef.current   = 0
    roundRef.current        = 0; streakRef.current  = 0
    playerHPRef.current          = playerHPMax
    playerActionElapsedRef.current = 0
    playerReadyRef.current        = false
    reloadSlowRef.current         = false
    chargesRef.current            = 0
    if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
    dodgePrimedRef.current       = false
    dodgeCooldownRef.current     = false
    actionLockedRef.current      = false
    dodgePrimeElapsedRef.current = 0
    consecutiveDodgesRef.current = 0
    roundEndingRef.current       = false

    resetEnemyForRound(0)

    raidStartTimeRef.current = performance.now()

    phaseRef.current = 'playing'
    setPhase('playing')
    setPlayerHP(playerHPMax)
    setCharges(0); setPlayerActionPct(0)
    setStreak(0)
    setWinGold(0); setWinXP(0); setWinPhase('summary'); setWinIsBoss(false)
    setCannonJammed(false); setActionLocked(false)
    setShotResult(null); setDodgePrimed(false); setDodgeCooldown(false)
    setDodgePrimePct(1); setDodgeFlash(false); setDodgeShake(false); setShowDodgeVFX(false)
    setRoundDisplay(1); setEnemySinking(false)
    setShowCannonShot(false); setClearReady(false)
    setLootAmount(0); setLootBase(0); setLootOpened(false); setLootClaimed(false)
  }, [playerHPMax, resetEnemyForRound])

  // Turn-based: no "OPEN FIRE" gate, so jump straight into combat on mount.
  // BUT — we must defer past the first paint, otherwise framer-motion content
  // in <RaidCombat /> mounts during initial layout and iOS Safari (PWA mode)
  // pulls the body-level fixed Nav + MobileTabBar into the same compositing
  // context, causing them to drift on scroll. A double-RAF gives the browser
  // one full paint with the page in its non-combat skeleton before we mount
  // the heavy combat content.
  // See memory: feedback_pagetransition_ios_pwa.md
  const autoStartedRef = useRef(false)
  const autoStartRafRef = useRef(0)
  useEffect(() => {
    if (autoStartedRef.current) return
    autoStartedRef.current = true
    autoStartRafRef.current = requestAnimationFrame(() => {
      autoStartRafRef.current = requestAnimationFrame(() => { startGame() })
    })
    return () => { if (autoStartRafRef.current) cancelAnimationFrame(autoStartRafRef.current) }
  }, [startGame])

  useEffect(() => {
    // Disabled: the playing phase now runs inside <RaidCombat />, which owns
    // its own state/RAF. The old combat loop below is kept commented out so
    // unused old-combat refs/setters don't need to be torn out yet — we'll
    // clean those up in a follow-up.
    /*
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
        const hitW  = Math.max(0.03, 0.06 - roundRef.current * 0.004)
        const halfW = hitW + GRAZE_W
        const zSpeed = (3000 / getActionMs(roundRef.current, config)) * 0.0028 * (dt / 16.67)
        if (isBossRound(roundRef.current, config.sequence.length)) {
          zoneJitterRef.current -= dt
          if (zoneJitterRef.current <= 0) {
            zoneDirRef.current *= -1
            zoneJitterRef.current = 1800 + Math.random() * 2200
          }
        }
        zonePosRef.current += zSpeed * zoneDirRef.current
        if (zonePosRef.current >= 1 - halfW) {
          zonePosRef.current = 1 - halfW; zoneDirRef.current = -1
          if (isBossRound(roundRef.current, config.sequence.length)) zoneJitterRef.current = 1800 + Math.random() * 2200
        }
        if (zonePosRef.current <= halfW) {
          zonePosRef.current = halfW; zoneDirRef.current = 1
          if (isBossRound(roundRef.current, config.sequence.length)) zoneJitterRef.current = 1800 + Math.random() * 2200
        }
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
      const actionMs = getActionMs(roundRef.current, config)
      enemyActionElapsedRef.current += dt
      setEnemyActionPct(Math.max(0, 1 - enemyActionElapsedRef.current / actionMs))

      if (enemyActionElapsedRef.current >= actionMs) {
        enemyActionElapsedRef.current = 0

        const e = getEnemyForRound(roundRef.current, config)
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
              // Prediction dodge — 80% reduction, cancel prime, reset actions, VFX
              if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
              dodgePrimedRef.current = false
              dodgePrimeElapsedRef.current = 0
              setDodgePrimed(false); setDodgePrimePct(1)
              const rawDmg    = rollIncomingDamage(roundRef.current, config)
              const dodgedDmg = Math.max(1, Math.round(rawDmg * 0.2))
              playerHPRef.current = Math.max(0, playerHPRef.current - dodgedDmg)
              setPlayerHP(playerHPRef.current)
              // Reward: instantly ready the player action bar
              playerActionElapsedRef.current = playerActionMs
              setShotResult(null)
              // VFX cascade
              setPHitsplat(p => ({ key: p.key + 1, text: `-${dodgedDmg}`, color: '#38bdf8', big: false }))
              setDodgeShake(true); setDodgeFlash(true); setShowDodgeVFX(true)
              setTimeout(() => { setDodgeShake(false) }, 520)
              setTimeout(() => { setDodgeFlash(false) }, 340)
              setTimeout(() => { setShowDodgeVFX(false) }, 650)
              dodgeCooldownRef.current = true
              setDodgeCooldown(true)
              setTimeout(() => { dodgeCooldownRef.current = false; setDodgeCooldown(false) }, dodgeCooldownUse)
              if (playerHPRef.current <= 0) { phaseRef.current = 'dead'; setBest(prev => Math.max(prev, streakRef.current)); setPhase('dead'); return }
            } else {
              // Took the hit
              const dmg = rollIncomingDamage(roundRef.current, config)
              playerHPRef.current = Math.max(0, playerHPRef.current - dmg)
              setPlayerHP(playerHPRef.current)
              setPHitsplat(p => ({ key: p.key + 1, text: `-${dmg}`, color: '#f87171', big: true }))
              setPlayerHitShake(true)
              setTimeout(() => setPlayerHitShake(false), 520)
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
    */
  }, [phase, dodgeCooldownUse, playerActionMs])

  // Slot machine spin — triggers when loot crate is opened
  useEffect(() => {
    if (!lootOpened) return
    const final = rollLootIndex(config.loot)
    setSlotFinal(final)
    setSlotLanded(false)

    const tick = () => setSlotDisplay(prev => (prev + 1) % config.loot.length)

    // Three phases: fast → medium → slow, then snap to result
    const fast = setInterval(tick, 70)
    slotIntervalsRef.current = [fast]

    const t1 = setTimeout(() => {
      clearInterval(fast)
      const med = setInterval(tick, 140)
      slotIntervalsRef.current = [med]

      const t2 = setTimeout(() => {
        clearInterval(med)
        const slow = setInterval(tick, 280)
        slotIntervalsRef.current = [slow]

        const t3 = setTimeout(() => {
          clearInterval(slow)
          setSlotDisplay(final)
          setSlotLanded(true)
        }, 900)
        return () => clearTimeout(t3)
      }, 900)
      return () => clearTimeout(t2)
    }, 1400)

    return () => { clearTimeout(t1); slotIntervalsRef.current.forEach(clearInterval) }
  }, [lootOpened])

  // (Removed: 5-minute raid timer + time-expired loot screen. Pete no longer
  //  has a time limit. raidStartTimeRef is still set in startGame so the
  //  speedrun badge can compute elapsed time at claim — but nothing in the
  //  visible flow gates on it.)

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

    const res = getShotResult(firePosRef.current, zonePosRef.current, roundRef.current)
    setShotResult(res)
    snapIndicator(fireIndicatorRef)
    flashBar(fireFlashRef, res === 'critical' ? '#fbbf24' : res === 'hit' ? '#4ade80' : res === 'graze' ? '#94a3b8' : '#6b7280')

    // Reset action bar — miss applies a penalty by starting in negative time
    playerActionElapsedRef.current = res === 'miss' ? -CANNON_MISS_CD : 0
    setPlayerActionPct(0)
    if (res === 'miss') setCannonJammed(true)

    const dmgMult = isVolley ? 2 : 1
    const bossMult = isBossRound(roundRef.current, config.sequence.length)
      ? getActiveEffects(equippedItems).filter(e => e.type === 'boss_damage_mult').reduce((acc, e) => acc * e.value, 1)
      : 1
    const dmg = rollShotDamage(res, shipMinDamage, totalPower) * dmgMult * bossMult

    if (dmg > 0) {
      setShowCannonShot(true)
      setIsVolleyShot(isVolley)
      setIsCritShot(res === 'critical')
      setTimeout(() => setShowCannonShot(false), 700)
      setPlayerRecoil(true)
      setTimeout(() => setPlayerRecoil(false), 420)
      if (res === 'critical') {
        setCritShake(true)
        setCritFlash(true)
        critFreezeRef.current = true
        setTimeout(() => { setCritShake(false) }, 620)
        setTimeout(() => { setCritFlash(false) }, 380)
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
        streakRef.current++
        setStreak(streakRef.current)
        const enemyId = getEnemyForRound(roundRef.current, config).id
        const gold = config.killRewards[enemyId]?.gold ?? 0
        const xp   = config.killRewards[enemyId]?.xp   ?? 0

        roundEndingRef.current = true
        setEnemySinking(true)
        setClearReady(false)

        setTimeout(() => {
          setEnemySinking(false)
          roundEndingRef.current = false
          setShotResult(null)

          setWinGold(gold)
          setWinXP(xp)
          setWinPhase('summary')

          if (isBossRound(roundRef.current, config.sequence.length)) {
            const base  = Math.floor(Math.random() * 301 + 300)
            const total = Math.floor(base * fortuneMult)
            setLootBase(base)
            setLootAmount(total)
            setWinIsBoss(true)
          } else {
            roundRef.current++
            resetEnemyForRound(roundRef.current)
            setRoundDisplay(roundRef.current + 1)
            setWinIsBoss(false)
          }

          phaseRef.current = 'clear'
          setPhase('clear')
          setTimeout(() => setClearReady(true), 80)
        }, 920)
        return
      }
    }

    // Clear jammed state once the bar refills (handled via cannonJammed + bar reaching ready)
    if (res !== 'miss') setTimeout(() => setShotResult(null), 500)
    else setTimeout(() => { setCannonJammed(false); setShotResult(null) }, CANNON_MISS_CD)
  }, [shipMinDamage, totalPower, fortuneMult, cannonJammed, resetEnemyForRound])

  const primeDodge = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    if (dodgeCooldownRef.current || dodgePrimedRef.current || actionLockedRef.current) return
    if (!playerReadyRef.current) return
    if (consecutiveDodgesRef.current >= 3) return  // must use another action first

    playerActionElapsedRef.current = 0
    setPlayerActionPct(0)

    consecutiveDodgesRef.current++
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
    setShotResult(null); setClearReady(false)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  // ─── Turn-based combat callbacks ───────────────────────────────────────────
  // Called from <RaidCombat /> when the current encounter ends.

  const handleEnemyDefeated = useCallback(async (remainingPlayerHp: number) => {
    playerHPRef.current = remainingPlayerHp
    setPlayerHP(remainingPlayerHp)

    streakRef.current++
    setStreak(streakRef.current)
    const enemyId = getEnemyForRound(roundRef.current, config).id
    const gold = config.killRewards[enemyId]?.gold ?? 0
    const xp   = config.killRewards[enemyId]?.xp   ?? 0
    const isBossKill = isBossRound(roundRef.current, config.sequence.length)

    setEnemySinking(true)
    setClearReady(false)

    // Boss → keep the existing Round Clear → loot crate flow (the crate IS
    // the reward presentation, so we don't want to skip it). Non-boss kills
    // are narrated inline by <RaidCombat />'s log and just auto-advance to
    // the next enemy here.
    if (isBossKill) {
      setTimeout(() => {
        setEnemySinking(false)
        setWinGold(gold); setWinXP(xp); setWinPhase('summary')
        // No time tier multiplier — Pete clears always grant the base roll
        // (scaled only by the player's Fortune stat).
        const base  = Math.floor(Math.random() * 301 + 300)
        const total = Math.floor(base * fortuneMult)
        setLootBase(base)
        setLootAmount(total)
        setWinIsBoss(true)
        phaseRef.current = 'clear'
        setPhase('clear')
        setTimeout(() => setClearReady(true), 80)
      }, 920)
      return
    }

    // Non-boss post-kill sequence:
    //   1. RaidCombat already narrated "<enemy> defeated · +gold · +XP"
    //   2. Award server-side, then animate the XP bar fill (≈700ms)
    //   3. If the kill bumped the player's Nav level, surface the level-up
    //      overlay AFTER the bar has visibly filled. Defer the next-fight
    //      advance until the user dismisses it.
    //   4. Otherwise just advance to the next enemy.
    const advanceToNext = () => {
      setEnemySinking(false)
      roundRef.current++
      resetEnemyForRound(roundRef.current)
      setRoundDisplay(roundRef.current + 1)
      // Phase stays 'playing'; the key={`combat-r${roundDisplay}`} on
      // <RaidCombat /> remounts it fresh with the next enemy.
    }

    let res: { newExpeditionXP: number; newDoubloonTotal: number } | null = null
    try { res = await awardRaidKill(xp, gold) } catch { /* save failed */ }
    if (!res) { setTimeout(advanceToNext, 400); return }

    const oldLevel = getLevelFromXP(navXPRef.current)
    const newLevel = getLevelFromXP(res.newExpeditionXP)
    navXPRef.current = res.newExpeditionXP
    setNavXP(res.newExpeditionXP)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
    if (xp > 0) setXpPopup({ value: xp, id: Date.now() })

    // Wait for the XP bar's 0.7s fill animation to land before the next beat.
    await new Promise<void>(r => setTimeout(r, 800))

    if (newLevel > oldLevel) {
      // Show the celebration and defer the advance until the user taps
      // dismiss. The level-up overlay is itself a tap-to-continue prompt.
      pendingAdvanceRef.current = advanceToNext
      setLevelUp({ fromLevel: oldLevel, toLevel: newLevel })
    } else {
      // No level-up — still gate on a tap-to-continue so the player can
      // sit on the log + XP totals at their own pace.
      pendingAdvanceRef.current = advanceToNext
      setAwaitingContinue(true)
    }
  }, [config, fortuneMult, resetEnemyForRound])

  const handlePlayerDefeated = useCallback(() => {
    phaseRef.current = 'dead'
    setBest(prev => Math.max(prev, streakRef.current))
    setPhase('dead')
  }, [])

  const collectKill = useCallback(async () => {
    if (isClaiming) return
    setIsClaiming(true)
    try {
      const res = await awardRaidKill(winXP, winGold)
      const oldLevel = getLevelFromXP(navXPRef.current)
      const newLevel = getLevelFromXP(res.newExpeditionXP)
      navXPRef.current = res.newExpeditionXP
      setNavXP(res.newExpeditionXP)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
      if (winXP > 0) setXpPopup({ value: winXP, id: Date.now() })
      // Delay the level-up overlay so the player sees the XP bar fill first.
      if (newLevel > oldLevel) {
        setTimeout(() => setLevelUp({ fromLevel: oldLevel, toLevel: newLevel }), 800)
      }
    } catch { /* save failed, still advance */ } finally {
      setIsClaiming(false)
      setWinPhase('claimed')
    }
  }, [isClaiming, winXP, winGold])

  const openFire = useCallback(() => {
    if (phaseRef.current === 'idle') { startGame(); return }
    if (phaseRef.current === 'ready') {
      phaseRef.current = 'playing'
      setPhase('playing')
    }
  }, [startGame])

  const isVolleyReady  = charges === MAX_CHARGES
  const playerReady    = playerActionPct >= 1
  const isActionLocked = actionLocked

  const actionBarColor     = enemyActionPct > 0.4 ? '#a78bfa' : enemyActionPct > 0.15 ? '#fbbf24' : '#ef4444'

  // ─── Playing phase: render the new turn-based combat ──────────────────────
  if (phase === 'playing') {
    return (
      <div className="flex flex-col items-center gap-2 select-none" style={{
        userSelect: 'none',
        // Available height: viewport
        //   - Nav header (44px mobile / 64px desktop — use mobile, it's the smaller window)
        //   - MobileTabBar (~64px, hidden on sm+ but cheap to reserve)
        //   - iOS safe-area-bottom (home indicator)
        // Plus a generous breathing gap above the tab bar so the action
        // buttons feel comfortably clear of it (was 8px, felt too tight).
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)',
        minHeight: 'calc(100dvh - 44px - env(safe-area-inset-bottom, 0px))',
      }}>
        {/* Leave link — always available so the player can back out at any
            time, even between auto-advanced fights. */}
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
        {/* Nav level bar — kept across all phases. NOTE: must NOT be
            position:sticky (or have transform/filter/will-change) — combined
            with framer-motion compositing inside RaidCombat, iOS Safari PWA
            mis-handles position:fixed for Nav header + MobileTabBar.
            See memory: feedback_pagetransition_ios_pwa.md */}
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

        {/* Turn-based combat owns the rest of the playing-phase UI */}
        <div style={{ width: '100%', padding: '0 0.5rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {(() => {
            const currentEnemyId = getEnemyForRound(roundRef.current, config).id
            const reward = config.killRewards[currentEnemyId]
            return (
              <RaidCombat
                key={`combat-r${roundDisplay}`}
                enemy={getEnemyForRound(roundRef.current, config)}
                isBoss={isBoss}
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
                equippedRaidItems={equippedItems}
                killReward={reward ? { gold: reward.gold, xp: reward.xp } : undefined}
                onEnemyDefeated={handleEnemyDefeated}
                onPlayerDefeated={handlePlayerDefeated}
              />
            )
          })()}
        </div>

        {/* Nav level-up celebration — also rendered here so it surfaces on
            non-boss kills (phase stays 'playing'; the fall-through return
            below never runs in that case). */}
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
            before the next enemy mounts. */}
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
      {/* See note in playing-phase return — no position:sticky here either. */}
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

      {/* Round / status header is owned by <RaidCombat /> in playing phase. */}

      {/* Combat scaffolding (ships, HP/action bars, fire bar, action buttons,
          raid timer) is owned by <RaidCombat /> in the playing-phase
          early-return. The fall-through render here only handles the
          idle / ready / clear / dead / loot overlays. */}

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

      {/* Round-start "OPEN FIRE" overlay removed — turn-based combat needs
          no real-time start gate; raids auto-enter combat on mount and on
          advance(). */}

      {/* ── Round clear / collect overlay ────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'clear' && clearReady && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 50 }}>

            {winPhase === 'summary' ? (
              <>
                <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Enemy Sunk</p>
                <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '1.5rem', marginBottom: 20 }}>{winIsBoss ? 'Boss Defeated' : 'Round Clear'}</p>
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 28 }}>
                  <p className="font-karla font-700" style={{ fontSize: '1.6rem', color: '#f0c040', textShadow: '0 0 16px #f0c04066' }}>+{fmtGold(winGold)} ⟡</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.88rem', color: '#4ade80' }}>+{winXP} XP</p>
                </motion.div>
                <motion.button
                  onPointerDown={collectKill}
                  whileTap={{ scale: 0.96 }}
                  disabled={isClaiming}
                  animate={{ boxShadow: isClaiming ? undefined : ['0 0 0px #f0c04000', '0 0 18px #f0c04055', '0 0 0px #f0c04000'] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="font-karla font-700"
                  style={{ padding: '13px 48px', borderRadius: 14, cursor: isClaiming ? 'default' : 'pointer', background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f0c040', fontSize: '0.95rem', letterSpacing: '0.06em', opacity: isClaiming ? 0.6 : 1 }}>
                  {isClaiming ? 'Saving…' : 'Collect'}
                </motion.button>
              </>
            ) : (
              <>
                <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.28)', fontSize: '0.58rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Collected</p>
                <p className="font-karla font-600" style={{ color: 'rgba(240,237,232,0.55)', fontSize: '0.82rem', marginBottom: 28 }}>
                  +{fmtGold(winGold)} ⟡ · +{winXP} XP saved
                </p>
                <div style={{ display: 'flex', gap: 10, flexDirection: 'column', width: 240 }}>
                  {winIsBoss ? (
                    <motion.button
                      onPointerDown={() => { phaseRef.current = 'loot'; setPhase('loot') }}
                      whileTap={{ scale: 0.96 }}
                      animate={{ boxShadow: ['0 0 0px #f0c04000', '0 0 18px #f0c04066', '0 0 0px #f0c04000'] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="font-karla font-700"
                      style={{ padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f0c040', fontSize: '0.92rem', letterSpacing: '0.06em' }}>
                      Open Loot Crate
                    </motion.button>
                  ) : (
                    <motion.button onPointerDown={advance} whileTap={{ scale: 0.96 }}
                      className="font-karla font-700"
                      style={{ padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444', fontSize: '0.92rem', letterSpacing: '0.06em' }}>
                      Advance →
                    </motion.button>
                  )}
                  <motion.button
                    onPointerDown={() => router.push('/expeditions')}
                    whileTap={{ scale: 0.96 }}
                    className="font-karla font-600"
                    style={{ padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6a6764', fontSize: '0.82rem', letterSpacing: '0.04em' }}>
                    Leave Raid
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dead overlay — minimal "you sank" + Return to Port ─────────────── */}
      <AnimatePresence>
        {phase === 'dead' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', zIndex: 50, padding: '1.5rem' }}>
            <p className="font-karla font-400 uppercase tracking-[0.14em]" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.6rem', marginBottom: 10 }}>Ship Sunk</p>
            <p className="font-cinzel font-700" style={{ color: '#f87171', fontSize: '2rem', marginBottom: 32 }}>Defeated</p>
            <motion.button
              onPointerDown={() => router.push('/expeditions')}
              whileTap={{ scale: 0.96 }}
              className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{ padding: '13px 36px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, color: '#c0b8a8', fontSize: '0.88rem', cursor: 'pointer' }}>
              Return to Port
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loot overlay (raid complete) ─────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'loot' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', zIndex: 50 }}>
              <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Raid Complete</p>
              <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '1.6rem', marginBottom: 28 }}>{config.bossDefeatedText}</p>

              {!lootOpened ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/plunderclosed.png" alt="Plunder crate" style={{ width: 120, height: 120, objectFit: 'contain' }} />
                  </motion.div>
                  <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.4)', fontSize: '0.65rem', letterSpacing: '0.08em' }}>Plunder Crate</p>
                  <motion.button
                    onPointerDown={() => setLootOpened(true)}
                    whileTap={{ scale: 0.95 }}
                    animate={{ boxShadow: ['0 0 0px #f0c04000', '0 0 18px #f0c04066', '0 0 0px #f0c04000'] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="font-karla font-700"
                    style={{ padding: '12px 32px', borderRadius: 14, cursor: 'pointer', background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f0c040', fontSize: '0.92rem', letterSpacing: '0.06em' }}>
                    Open Crate
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/plunderopen.png" alt="Plunder crate open" style={{ width: 100, height: 100, objectFit: 'contain', marginBottom: 20 }} />

                  {/* Single loot roll */}
                  {(() => {
                    const item  = config.loot[slotDisplay]
                    const color = RARITY_COLOR[item.rarity]
                    return (
                      <motion.div
                        animate={slotLanded ? { scale: [1, 1.32, 0.92, 1.1, 1] } : {}}
                        transition={{ duration: 0.65, ease: 'easeOut' }}
                        style={{
                          width: 120, height: 144,
                          border: `2px solid ${slotLanded ? color : 'rgba(255,255,255,0.12)'}`,
                          borderRadius: 18,
                          background: slotLanded ? `${color}1a` : 'rgba(0,0,0,0.45)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                          overflow: 'hidden',
                          transition: 'border-color 0.2s, background 0.2s',
                          boxShadow: slotLanded ? `0 0 28px ${color}55` : 'none',
                          marginBottom: 20,
                        }}>
                        {item.shipSkinId ? (
                          <img src={shipImageUrl} alt={item.label}
                            style={{ width: 70, height: 70, objectFit: 'contain', objectPosition: 'bottom',
                              filter: !slotLanded ? 'blur(1.5px) brightness(0.3)' : getShipSkin(item.shipSkinId)!.filter,
                              transition: 'filter 0.15s' }} />
                        ) : item.image ? (
                          <img src={item.image} alt={item.label}
                            style={{ width: 70, height: 70, objectFit: 'contain',
                              filter: !slotLanded ? 'blur(1.5px) brightness(0.6)' : 'none',
                              transition: 'filter 0.15s' }} />
                        ) : (
                          <span style={{ fontSize: '2.8rem',
                            filter: !slotLanded ? 'blur(1.5px) brightness(0.6)' : 'none',
                            transition: 'filter 0.15s' }}>{item.emoji}</span>
                        )}
                        <p className="font-karla font-700" style={{
                          fontSize: '0.72rem', color: slotLanded ? color : 'transparent',
                          textAlign: 'center', lineHeight: 1.2,
                          transition: 'color 0.2s',
                        }}>{item.label}</p>
                      </motion.div>
                    )
                  })()}

                  {/* Doubloon total + claim — always in flow, fades in when landed */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: slotLanded ? 1 : 0, transition: 'opacity 0.4s 0.2s' }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0c040', textShadow: '0 0 20px #f0c04088' }}>
                          {fmtGold(lootAmount)} ⟡
                        </p>
                        {fortuneMult > 1 && (
                          <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.3)', fontSize: '0.6rem', marginBottom: 10 }}>
                            {fortuneMult.toFixed(2)}× luck
                          </p>
                        )}
                        <motion.button
                          onPointerDown={async () => {
                            if (lootClaimed) return
                            setLootClaimed(true)
                            const elapsedMs = performance.now() - raidStartTimeRef.current
                            const res = await claimRaidLoot(lootAmount, [config.loot[slotFinal].id], elapsedMs, playerHPMax - playerHP)
                            window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
                            router.push('/expeditions')
                          }}
                          whileTap={{ scale: 0.95 }}
                          disabled={lootClaimed}
                          className="font-karla font-700"
                          style={{ padding: '12px 36px', borderRadius: 14, cursor: lootClaimed ? 'default' : 'pointer', background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f0c040', fontSize: '0.92rem', letterSpacing: '0.06em', opacity: lootClaimed ? 0.6 : 1 }}>
                          {lootClaimed ? 'Claimed!' : 'Claim Loot'}
                        </motion.button>
                  </div>

                </motion.div>
              )}
            </motion.div>
        )}
      </AnimatePresence>


      {/* ── Nav level-up celebration ───────────────────────────────────────── */}
      <NavLevelUpOverlay
        info={levelUp}
        onDismiss={() => {
          setLevelUp(null)
          // Resume whatever was waiting (e.g. the next-fight advance).
          const fn = pendingAdvanceRef.current
          pendingAdvanceRef.current = null
          fn?.()
        }}
      />

      {/* ── Crew info popup ─────────────────────────────────────────────────── */}
      {showCrewInfo && (
        <div
          onClick={() => setShowCrewInfo(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, rgba(8,10,18,0.99) 0%, rgba(6,8,14,0.99) 100%)',
              border: '1px solid rgba(96,165,250,0.2)',
              borderRadius: 16, padding: '1.1rem',
              width: '100%', maxWidth: 280,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8' }}>Your Crew</p>
              <button onClick={() => setShowCrewInfo(false)} style={{ background: 'none', border: 'none', color: '#5a5855', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '2px 4px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {crewMembers.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                    border: i === 0 ? '2px solid rgba(240,192,64,0.55)' : '1.5px solid rgba(255,255,255,0.12)',
                  }}>
                    <img src={c.imageUrl} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 4 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: '#f0ede8', lineHeight: 1.2 }}>{c.name}</p>
                      {i === 0 && (
                        <span className="font-karla font-700" style={{ fontSize: '0.36rem', color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)', borderRadius: 3, padding: '0.08rem 0.28rem', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Captain</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.7rem' }}>
                      <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#f87171' }}>PWR {c.power}</span>
                      <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#60a5fa' }}>NAV {c.dodge}</span>
                      <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#f0c040' }}>FTN {c.fortune}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
          22%  { transform: translateX(-14px) rotate(-2deg); }
          55%  { transform: translateX(5px) rotate(0.6deg); }
          80%  { transform: translateX(-2px); }
          100% { transform: translateX(0) rotate(0deg); }
        }
        @keyframes player-hit {
          0%   { transform: translateX(0) rotate(0deg); }
          12%  { transform: translateX(9px) rotate(1.2deg); }
          28%  { transform: translateX(-9px) rotate(-1.2deg); }
          45%  { transform: translateX(6px) rotate(0.8deg); }
          62%  { transform: translateX(-4px) rotate(-0.5deg); }
          80%  { transform: translateX(2px); }
          100% { transform: translateX(0) rotate(0deg); }
        }
        @keyframes enemy-sink {
          0%   { transform: scaleX(-1) translateY(0) rotate(0deg); opacity: 1; }
          15%  { transform: scaleX(-1) translateY(5px) rotate(-3deg); opacity: 0.9; }
          55%  { transform: scaleX(-1) translateY(40px) rotate(-9deg); opacity: 0.5; filter: brightness(0.5); }
          100% { transform: scaleX(-1) translateY(90px) rotate(-13deg); opacity: 0; filter: brightness(0.2); }
        }
        @keyframes enemy-sink-portrait {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          15%  { transform: translateY(5px) rotate(-3deg); opacity: 0.9; }
          55%  { transform: translateY(40px) rotate(-9deg); opacity: 0.5; filter: brightness(0.5); }
          100% { transform: translateY(90px) rotate(-13deg); opacity: 0; filter: brightness(0.2); }
        }
      `}</style>
    </div>
  )
}
