'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { claimRaidLoot } from './actions'
import { awardRaidKillXP, RAID_KILL_XP } from './raidXPActions'
import { getShipSkin } from '@/lib/shipSkins'
import { getActiveEffects } from '@/lib/raidItems'
import { getXPProgress, getLevelFromXP, MAX_LEVEL } from '@/lib/expeditionLevel'

type GamePhase  = 'idle' | 'ready' | 'playing' | 'clear' | 'dead' | 'loot'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null

// ── Raid loot table ───────────────────────────────────────────────────────────
// Replace image: null with a URL string once art is ready
interface RaidLootItem {
  id: string
  label: string
  image: string | null
  emoji: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  weight: number
}
const RARITY_COLOR: Record<RaidLootItem['rarity'], string> = {
  common:    '#9ca3af',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
}
const BARNACLE_PETE_LOOT: RaidLootItem[] = [
  { id: 'doubloons_300', label: '+300 ⟡',       image: '/smallpile.png',   emoji: '🪙', rarity: 'common',   weight: 50 },
  { id: 'doubloons_600', label: '+600 ⟡',       image: '/dailybonus.png',  emoji: '💰', rarity: 'uncommon', weight: 25 },
  { id: 'gems_25',       label: '25 Gems',       image: null, emoji: '💎', rarity: 'rare',     weight: 15 },
  { id: 'pack',          label: '1 Pack',        image: '/cardbacknew.png', emoji: '📦', rarity: 'rare',     weight: 5  },
  { id: 'corsair_black',  label: 'Corsair Black',  image: null, emoji: '🚢', rarity: 'epic',  weight: 5  },
  { id: 'corsair_cannon', label: 'Corsair Cannon', image: '/corsaircannon.png', emoji: '💣', rarity: 'rare',  weight: 3  },
]
function rollLootIndex(): number {
  const total = BARNACLE_PETE_LOOT.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (let i = 0; i < BARNACLE_PETE_LOOT.length; i++) {
    r -= BARNACLE_PETE_LOOT[i].weight
    if (r <= 0) return i
  }
  return BARNACLE_PETE_LOOT.length - 1
}

// ── Enemy definitions ─────────────────────────────────────────────────────────

const ENEMY_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/'

interface BroadsideEnemy {
  id: string
  name: string
  hpBase: number
  minDmg: number
  maxDmg: number
  actionMs: number
  pattern: string[]
  image: string       // ship art
  portrait?: string   // circular portrait overlay (boss only)
}

const BROADSIDE_ENEMIES: Record<string, BroadsideEnemy> = {
  brute: {
    id: 'brute', name: 'Reef Raider', hpBase: 25, minDmg: 2, maxDmg: 5,
    actionMs: 4500,
    pattern: ['reload', 'fire', 'reload', 'fire'],
    image: ENEMY_IMG_BASE + 'enemytier1.png',
  },
  sniper: {
    id: 'sniper', name: "Crow's Nest Marksman", hpBase: 30, minDmg: 2, maxDmg: 10,
    actionMs: 5500,
    pattern: ['reload', 'reload', 'dodge', 'reload', 'fire'],
    image: ENEMY_IMG_BASE + 'enemytier1.png',
  },
  corsair: {
    id: 'corsair', name: 'Saltwater Corsair', hpBase: 38, minDmg: 6, maxDmg: 9,
    actionMs: 3500,
    pattern: ['reload', 'dodge', 'fire', 'reload', 'fire'],
    image: ENEMY_IMG_BASE + 'enemytier1elite.png',
  },
  pete: {
    id: 'pete', name: 'Barnacle Pete', hpBase: 55, minDmg: 8, maxDmg: 15,
    actionMs: 4500,
    pattern: ['reload', 'reload', 'dodge', 'fire', 'reload', 'fire'],
    image: ENEMY_IMG_BASE + 'enemytier1boss.png',
    portrait: ENEMY_IMG_BASE + 'barnacle_pete.png',
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

const KILL_GOLD: Record<string, number> = { brute: 20, sniper: 25, corsair: 35, pete: 0 }
function killGold(round: number): number {
  return KILL_GOLD[getEnemyForRound(round).id] ?? 0
}
function killXP(round: number): number {
  return RAID_KILL_XP[getEnemyForRound(round).id] ?? 0
}
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

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function getTimeTier(secs: number): { mult: number; label: string; color: string } | null {
  if (secs < 120) return { mult: 1.5,  label: 'Legendary', color: '#f97316' }
  if (secs < 180) return { mult: 1.25, label: 'Swift',     color: '#fbbf24' }
  if (secs < 300) return { mult: 1.0,  label: 'Completed', color: '#4ade80' }
  return null  // over 5:00 — time expired, no loot
}

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

export default function RaidGame({ equippedShipSkin, shipSkins, equippedItems,
  shipImageUrl, shipName, playerHPMax, shipMinDamage, shipSpeed,
  totalPower, totalDodge, totalFortune, crewCount, crewMembers, initialExpeditionXP,
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
  const [enemyImage, setEnemyImage]     = useState(BROADSIDE_ENEMIES.brute.image)
  const [enemyPortrait, setEnemyPortrait] = useState<string | null>(null)
  const [enemyCharges, setEnemyCharges]   = useState(0)
  const [enemyDodging, setEnemyDodging]   = useState(false)
  const [enemyActionPct, setEnemyActionPct] = useState(1)
  const [charges, setCharges]           = useState(0)
  const [playerActionPct, setPlayerActionPct] = useState(0)
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
  const [raidElapsedMs, setRaidElapsedMs] = useState(0)
  const [lootAmount, setLootAmount]     = useState(0)
  const [lootBase, setLootBase]         = useState(0)
  const [lootOpened, setLootOpened]     = useState(false)
  const [lootClaimed, setLootClaimed]   = useState(false)
  const [slotDisplay, setSlotDisplay] = useState(0)
  const [slotLanded, setSlotLanded]   = useState(false)
  const [slotFinal, setSlotFinal]     = useState(0)
  const slotIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([])
  const [raidTimeSecs, setRaidTimeSecs] = useState(0)
  const [raidTier, setRaidTier]         = useState<{ mult: number; label: string; color: string } | null>(null)
  const [pHitsplat, setPHitsplat]       = useState({ key: 0, text: '', color: '', big: false })
  const [eHitsplat, setEHitsplat]       = useState({ key: 0, text: '', color: '', big: false })
  const [enemyMinDmg, setEnemyMinDmg]   = useState(2)
  const [enemyMaxDmg, setEnemyMaxDmg]   = useState(5)
  const [navXP, setNavXP]               = useState(initialExpeditionXP)
  const [xpPopup, setXpPopup]           = useState<{ value: number; id: number } | null>(null)

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
  const playerActionElapsedRef = useRef(0)
  const playerReadyRef         = useRef(false)
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
    setEnemyImage(e.image)
    setEnemyPortrait(e.portrait ?? null)
    setEnemyCharges(0)
    setEnemyDodging(false)
    setEnemyActionPct(1)
    setIsBoss(isBossRound(round))
    setEnemyMinDmg(e.minDmg)
    setEnemyMaxDmg(e.maxDmg)
    // Randomize zone starting position for each round
    const hitW  = Math.max(0.03, 0.06 - round * 0.004)
    const halfW = hitW + GRAZE_W
    zonePosRef.current  = halfW + Math.random() * (1 - halfW * 2)
    zoneDirRef.current  = Math.random() < 0.5 ? 1 : -1
    if (isBossRound(round)) zoneJitterRef.current = 1800 + Math.random() * 2200
  }, [])

  const startGame = useCallback(() => {
    firePosRef.current      = 0; fireDirRef.current = 1
    zonePosRef.current      = 0.5; zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
    zoneJitterRef.current   = 0
    roundRef.current        = 0; streakRef.current  = 0
    potRef.current          = 0
    playerHPRef.current          = playerHPMax
    playerActionElapsedRef.current = 0
    playerReadyRef.current        = false
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
    setStreak(0); setPot(0); setLastEarned(0)
    setCannonJammed(false); setActionLocked(false)
    setShotResult(null); setDodgePrimed(false); setDodgeCooldown(false)
    setDodgePrimePct(1); setDodgeFlash(false); setDodgeShake(false); setShowDodgeVFX(false)
    setRoundDisplay(1); setEnemySinking(false)
    setShowCannonShot(false); setClearReady(false)
    setRaidElapsedMs(0); setLootAmount(0); setLootBase(0); setLootOpened(false); setLootClaimed(false)
    setRaidTimeSecs(0); setRaidTier(null)
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
        const hitW  = Math.max(0.03, 0.06 - roundRef.current * 0.004)
        const halfW = hitW + GRAZE_W
        const zSpeed = (3000 / getActionMs(roundRef.current)) * 0.0028 * (dt / 16.67)
        if (isBossRound(roundRef.current)) {
          zoneJitterRef.current -= dt
          if (zoneJitterRef.current <= 0) {
            zoneDirRef.current *= -1
            zoneJitterRef.current = 1800 + Math.random() * 2200
          }
        }
        zonePosRef.current += zSpeed * zoneDirRef.current
        if (zonePosRef.current >= 1 - halfW) {
          zonePosRef.current = 1 - halfW; zoneDirRef.current = -1
          if (isBossRound(roundRef.current)) zoneJitterRef.current = 1800 + Math.random() * 2200
        }
        if (zonePosRef.current <= halfW) {
          zonePosRef.current = halfW; zoneDirRef.current = 1
          if (isBossRound(roundRef.current)) zoneJitterRef.current = 1800 + Math.random() * 2200
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
      const pPct = Math.min(1, Math.max(0, playerActionElapsedRef.current / playerActionMs))
      playerReadyRef.current = pPct >= 1
      setPlayerActionPct(pPct)

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
              // Prediction dodge — 80% reduction, cancel prime, reset actions, VFX
              if (dodgePrimeTimerRef.current) { clearTimeout(dodgePrimeTimerRef.current); dodgePrimeTimerRef.current = null }
              dodgePrimedRef.current = false
              dodgePrimeElapsedRef.current = 0
              setDodgePrimed(false); setDodgePrimePct(1)
              const rawDmg    = rollIncomingDamage(roundRef.current)
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
              const dmg = rollIncomingDamage(roundRef.current)
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
  }, [phase, dodgeCooldownUse, playerActionMs])

  // Slot machine spin — triggers when loot crate is opened
  useEffect(() => {
    if (!lootOpened) return
    const final = rollLootIndex()
    setSlotFinal(final)
    setSlotLanded(false)

    const tick = () => setSlotDisplay(prev => (prev + 1) % BARNACLE_PETE_LOOT.length)

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

  // Raid timer — ticks through playing+clear, triggers time-expired at 5:00
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'clear') return
    const id = setInterval(() => {
      const elapsed = performance.now() - raidStartTimeRef.current
      setRaidElapsedMs(elapsed)
      if (elapsed >= 300000 && phaseRef.current !== 'loot') {
        setRaidTimeSecs(elapsed / 1000)
        phaseRef.current = 'loot'
        setPhase('loot')
      }
    }, 200)
    return () => clearInterval(id)
  }, [phase])

  const doReload = useCallback(() => {
    if (phaseRef.current !== 'playing' || !playerReadyRef.current || chargesRef.current >= MAX_CHARGES || actionLockedRef.current) return
    consecutiveDodgesRef.current = 0
    chargesRef.current = Math.min(MAX_CHARGES, chargesRef.current + 1)
    setCharges(chargesRef.current)
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
    const bossMult = isBossRound(roundRef.current)
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
        const earned = killGold(roundRef.current)
        potRef.current += earned
        setPot(potRef.current)
        setLastEarned(earned)
        const xp = killXP(roundRef.current)
        if (xp > 0) {
          awardRaidKillXP(xp).then(res => {
            setNavXP(res.newExpeditionXP)
            setXpPopup({ value: xp, id: Date.now() })
          })
        }

        roundEndingRef.current = true
        setEnemySinking(true)
        setClearReady(false)

        setTimeout(() => {
          setEnemySinking(false)
          roundEndingRef.current = false
          setShotResult(null)

          if (isBossRound(roundRef.current)) {
            const elapsed = performance.now() - raidStartTimeRef.current
            const secs    = elapsed / 1000
            const tier    = getTimeTier(secs)
            setRaidTimeSecs(secs)
            setRaidTier(tier)
            if (tier) {
              const base  = Math.floor(Math.random() * 301 + 300)
              const total = Math.floor(base * tier.mult * fortuneMult) + potRef.current
              setLootBase(base)
              setLootAmount(total)
            }
            phaseRef.current = 'loot'
            setPhase('loot')
          } else {
            roundRef.current++
            resetEnemyForRound(roundRef.current)
            setRoundDisplay(roundRef.current + 1)
            phaseRef.current = 'clear'
            setPhase('clear')
            setTimeout(() => setClearReady(true), 80)
          }
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
    phaseRef.current = 'ready'
    setPhase('ready')
  }, [])

  const openFire = useCallback(() => {
    if (phaseRef.current === 'idle') { startGame(); return }
    if (phaseRef.current === 'ready') {
      phaseRef.current = 'playing'
      setPhase('playing')
    }
  }, [startGame])

  const retreat = useCallback(async () => {
    if (isClaiming) return
    setIsClaiming(true)
    try {
      const res = await claimRaidLoot(potRef.current, [])
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
    } finally { setIsClaiming(false) }
    router.push('/expeditions')
  }, [isClaiming, router])

  const isVolleyReady  = charges === MAX_CHARGES
  const playerReady    = playerActionPct >= 1
  const isActionLocked = actionLocked
  const powerMax      = shipMinDamage + Math.floor(totalPower / 4)

  const actionBarColor     = enemyActionPct > 0.4 ? '#a78bfa' : enemyActionPct > 0.15 ? '#fbbf24' : '#ef4444'

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

      {/* ── Round / status header ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', paddingBottom: 2, visibility: (phase === 'idle' || phase === 'ready') ? 'hidden' : 'visible' }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', textShadow: '0 2px 10px rgba(0,0,0,0.95)' }}>Round {roundDisplay}</span>
          <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {enemyDodging && (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="font-karla font-700"
                style={{ fontSize: '0.58rem', color: '#38bdf8', background: 'rgba(56,189,248,0.25)', border: '1px solid rgba(56,189,248,0.7)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.08em' }}>
                EVADING
              </motion.span>
            )}
            {isBoss && (
              <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#f97316', background: 'rgba(249,115,22,0.28)', border: '1px solid rgba(249,115,22,0.7)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.08em' }}>BOSS</span>
            )}
          </div>
      </div>

      {/* ── Two-panel combat area ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, width: '100%' }}>

        {/* Player panel */}
        <div style={{
          flex: 3, background: 'none',
          borderRadius: 14, padding: '0.65rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: '0.3rem',
          animation: dodgeShake ? 'dodge-slide 0.5s ease' : playerHitShake ? 'player-hit 0.5s ease' : playerRecoil ? 'player-recoil 0.4s ease' : 'none',
        }}>
          <div style={{ position: 'relative', height: 230, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <img src={shipImageUrl} alt={shipName} style={{ width: '100%', height: 230, objectFit: 'contain', objectPosition: 'bottom', filter: shipFilter }} />
            {/* Captain portrait — top left, click to view crew */}
            {crewMembers.length > 0 && (
              <button
                onClick={() => setShowCrewInfo(true)}
                style={{
                  position: 'absolute', bottom: 4, left: 4, zIndex: 5,
                  width: 32, height: 32, borderRadius: '50%',
                  border: '2px solid rgba(96,165,250,0.65)',
                  overflow: 'hidden', padding: 0, cursor: 'pointer',
                  boxShadow: '0 0 8px rgba(96,165,250,0.35)',
                  background: 'rgba(0,0,0,0.3)',
                }}
              >
                <img src={crewMembers[0].imageUrl} alt={crewMembers[0].name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              </button>
            )}
            {pHitsplat.key > 0 && <Hitsplat key={pHitsplat.key} text={pHitsplat.text} color={pHitsplat.color} big={pHitsplat.big} animKey={pHitsplat.key} />}
            {showDodgeVFX && (
              <>
                <span style={{ position: 'absolute', left: '60%', top: '15%', fontSize: '1.5rem', animation: 'cannon-shot 0.55s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💨</span>
                <span style={{ position: 'absolute', left: '20%', top: '35%', fontSize: '1.2rem', animation: 'cannon-shot 0.5s 0.07s ease forwards', pointerEvents: 'none', zIndex: 10 }}>⚡</span>
                <span style={{ position: 'absolute', left: '48%', top: '55%', fontSize: '1.0rem', animation: 'cannon-shot 0.6s 0.12s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💨</span>
              </>
            )}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.75rem', color: '#f0ede8', lineHeight: 1.2, textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>{shipName}</p>
          <HPBar current={playerHP} max={playerHPMax} color="#60a5fa" />
        </div>

        {/* Enemy panel */}
        <div style={{
          flex: 2, background: 'none',
          borderRadius: 14, padding: '0.65rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: '0.3rem',
          animation: critShake ? 'crit-shake 0.6s ease' : hitShake ? 'hit-shake 0.45s ease' : 'none',
        }}>
          <div style={{ position: 'relative', height: 230, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden', paddingBottom: 24 }}>
            <img src={enemyImage} alt={enemyName} style={{
              width: '100%', height: 90, objectFit: 'contain', objectPosition: 'bottom',
              transform: 'scaleX(-1)',
              animation: enemySinking ? 'enemy-sink 0.9s ease-in forwards' : 'none',
              filter: isBoss ? 'hue-rotate(20deg) brightness(0.9)' : 'hue-rotate(180deg) brightness(0.8)',
            }} />
            {enemyPortrait && (
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 26, height: 26, borderRadius: '50%',
                border: '2px solid rgba(249,115,22,0.6)',
                overflow: 'hidden',
                boxShadow: '0 0 8px rgba(249,115,22,0.4)',
              }}>
                <img src={enemyPortrait} alt="portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
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
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.75rem', color: '#f0ede8', lineHeight: 1.2, textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>{enemyName}</p>
          <HPBar current={enemyHP} max={enemyHPMax} color={isBoss ? '#f97316' : '#a78bfa'} />
        </div>

      </div>

      {/* ── Enemy action bar — cannon dots inline with progress bar ─────────── */}
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          {/* Cannon charge dots */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <motion.div key={i}
                animate={{ scale: i === enemyCharges - 1 ? [1, 1.5, 1] : 1 }}
                transition={{ duration: 0.18 }}
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i < enemyCharges ? '#ef4444' : 'rgba(255,255,255,0.18)',
                  boxShadow: i < enemyCharges ? '0 0 6px #ef444499' : 'none',
                  border: `1.5px solid ${i < enemyCharges ? '#ef4444' : 'rgba(255,255,255,0.3)'}`,
                  transition: 'background 0.15s, box-shadow 0.15s',
                }} />
            ))}
            <AnimatePresence>
              {enemyCharges === MAX_CHARGES && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }}
                  className="font-karla font-700"
                  style={{ fontSize: '0.58rem', color: '#ef4444', letterSpacing: '0.1em', marginLeft: 1, textShadow: '0 0 8px #ef444499' }}>
                  ARMED
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: actionBarColor, letterSpacing: '0.14em', transition: 'color 0.3s', marginLeft: 'auto', textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>ENEMY</p>
        </div>
        <div style={{ height: 10, background: 'rgba(0,0,0,0.45)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${enemyActionPct * 100}%`,
            background: actionBarColor,
            boxShadow: enemyActionPct < 0.25 ? `0 0 8px ${actionBarColor}88` : 'none',
            transition: 'background 0.3s, box-shadow 0.3s',
            borderRadius: 4,
          }} />
        </div>
      </div>


      {/* ── Feedback ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 18 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {[0, 1, 2].map(i => (
              <motion.div key={i}
                animate={{ scale: i === charges - 1 && charges > 0 ? [1, 1.45, 1] : 1 }}
                transition={{ duration: 0.18 }}
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i < charges ? '#60a5fa' : 'rgba(255,255,255,0.2)',
                  boxShadow: i < charges ? '0 0 7px rgba(96,165,250,0.75)' : 'none',
                  border: `1.5px solid ${i < charges ? '#60a5fa' : 'rgba(255,255,255,0.35)'}`,
                  transition: 'background 0.15s, box-shadow 0.15s, border-color 0.15s',
                }}
              />
            ))}
            <AnimatePresence>
              {isVolleyReady && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }}
                  className="font-karla font-700"
                  style={{ fontSize: '0.68rem', color: '#f0c040', letterSpacing: '0.1em', marginLeft: 2, textShadow: '0 0 8px #f0c04099' }}>
                  VOLLEY
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {(phase === 'playing' || phase === 'ready' || phase === 'clear') && (
            <span className="font-karla font-600" style={{
              fontSize: '0.82rem', letterSpacing: '0.06em',
              color: raidElapsedMs >= 270000 ? '#ef4444' : raidElapsedMs >= 180000 ? '#fbbf24' : '#c0b898',
              textShadow: '0 1px 6px rgba(0,0,0,0.95)',
              transition: 'color 0.5s',
            }}>
              ⏱ {fmtTime(raidElapsedMs)}
            </span>
          )}
        </div>
        <TimingBar
          indicatorRef={fireIndicatorRef} flashRef={fireFlashRef}
          zoneRef={zoneTargetRef}
          hitHalfW={Math.max(0.03, 0.06 - (roundDisplay - 1) * 0.004)}
          critHalfW={0.007}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 5 }}>
          {[{ label: 'Graze', color: '#94a3b8' }, { label: 'Hit', color: '#4ade80' }, { label: '★ Crit', color: '#fbbf24' }].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: z.color }} />
              <span className="font-karla font-400" style={{ fontSize: '0.6rem', color: z.color, textShadow: '0 1px 5px rgba(0,0,0,0.95)' }}>{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Player action bar ────────────────────────────────────────────────── */}
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: playerReady ? '#4ade80' : '#5aaa6a', letterSpacing: '0.14em', transition: 'color 0.3s', textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>
            YOUR ACTION
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: playerReady ? '#a0f0b8' : '#5aaa6a', transition: 'color 0.3s', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
            {playerReady ? 'READY' : 'charging…'}
          </p>
        </div>
        <div style={{ height: 10, background: 'rgba(0,0,0,0.45)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${playerActionPct * 100}%`,
            background: playerReady ? '#4ade80' : '#3a8a50',
            boxShadow: playerReady ? '0 0 10px rgba(74,222,128,0.6)' : 'none',
            transition: 'background 0.2s, box-shadow 0.2s',
            borderRadius: 4,
          }} />
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────────── */}

      {/* Playing phase: circle buttons */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', width: '100%' }}>

          {/* RELOAD */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <motion.button
              onPointerDown={playerReady && charges < MAX_CHARGES && !isActionLocked ? doReload : undefined}
              whileTap={playerReady && charges < MAX_CHARGES && !isActionLocked ? { scale: 0.88 } : {}}
              style={{
                width: 82, height: 82, borderRadius: '50%', cursor: playerReady && charges < MAX_CHARGES && !isActionLocked ? 'pointer' : 'default',
                background: isActionLocked ? 'rgba(239,68,68,0.07)' : !playerReady || charges >= MAX_CHARGES ? 'rgba(255,255,255,0.03)' : 'rgba(96,165,250,0.12)',
                border: `2px solid ${isActionLocked ? 'rgba(239,68,68,0.22)' : !playerReady || charges >= MAX_CHARGES ? 'rgba(255,255,255,0.1)' : 'rgba(96,165,250,0.45)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isActionLocked || !playerReady || charges >= MAX_CHARGES ? 0.4 : 1,
                transition: 'all 0.12s',
                boxShadow: !isActionLocked && playerReady && charges < MAX_CHARGES ? '0 0 14px rgba(96,165,250,0.18), inset 0 1px 0 rgba(255,255,255,0.07)' : 'none',
              }}>
              <p className="font-karla font-700" style={{
                fontSize: '0.72rem', letterSpacing: '0.06em',
                color: isActionLocked ? '#7a2a2a' : !playerReady ? '#3a5a7a' : charges >= MAX_CHARGES ? '#4a4845' : '#60a5fa',
              }}>
                {isActionLocked ? '…' : charges >= MAX_CHARGES ? 'Full' : 'RELOAD'}
              </p>
            </motion.button>
          </div>

          {/* DODGE */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <motion.button
              onPointerDown={primeDodge}
              whileTap={playerReady && !dodgeCooldown && !dodgePrimed && !isActionLocked ? { scale: 0.88 } : {}}
              animate={dodgePrimed ? { boxShadow: ['0 0 0px #38bdf800', '0 0 20px #38bdf8aa', '0 0 8px #38bdf866'] } : {}}
              transition={{ duration: 0.4, repeat: Infinity }}
              style={{
                width: 82, height: 82, borderRadius: '50%', cursor: playerReady && !dodgeCooldown && !dodgePrimed && !isActionLocked ? 'pointer' : 'default',
                background: dodgePrimed    ? 'rgba(56,189,248,0.18)'
                          : isActionLocked ? 'rgba(239,68,68,0.07)'
                          : dodgeCooldown  ? 'rgba(255,255,255,0.03)'
                          : !playerReady   ? 'rgba(255,255,255,0.03)'
                          :                 'rgba(56,189,248,0.10)',
                border: `2px solid ${dodgePrimed    ? 'rgba(56,189,248,0.65)'
                          : isActionLocked ? 'rgba(239,68,68,0.22)'
                          : dodgeCooldown  ? 'rgba(255,255,255,0.1)'
                          : !playerReady   ? 'rgba(255,255,255,0.1)'
                          :                 'rgba(56,189,248,0.35)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isActionLocked || dodgeCooldown || !playerReady ? 0.4 : 1,
                transition: 'background 0.12s, border-color 0.12s, opacity 0.12s',
              }}>
              <p className="font-karla font-700" style={{
                fontSize: '0.72rem', letterSpacing: '0.06em',
                color: dodgePrimed    ? '#38bdf8'
                     : isActionLocked ? '#7a2a2a'
                     : dodgeCooldown  ? '#2a4050'
                     :                  '#38bdf8',
              }}>
                {dodgePrimed ? 'PRIMED' : isActionLocked || dodgeCooldown ? '…' : 'DODGE'}
              </p>
            </motion.button>
          </div>

          {/* FIRE / VOLLEY */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <motion.button
              onPointerDown={playerReady && !cannonJammed && charges > 0 && !isActionLocked ? fire : undefined}
              whileTap={playerReady && !cannonJammed && charges > 0 && !isActionLocked ? { scale: 0.88 } : {}}
              animate={isVolleyReady ? { boxShadow: ['0 0 0px #f0c04000', '0 0 20px #f0c04077', '0 0 0px #f0c04000'] } : {}}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{
                width: 82, height: 82, borderRadius: '50%',
                cursor: playerReady && !cannonJammed && charges > 0 && !isActionLocked ? 'pointer' : 'default',
                background: cannonJammed  ? 'rgba(251,146,60,0.1)'
                          : !playerReady  ? 'rgba(255,255,255,0.03)'
                          : isVolleyReady ? 'rgba(240,192,64,0.18)'
                          : charges === 0 ? 'rgba(255,255,255,0.03)'
                          :                'rgba(239,68,68,0.14)',
                border: `2px solid ${cannonJammed  ? 'rgba(251,146,60,0.35)'
                          : !playerReady  ? 'rgba(255,255,255,0.1)'
                          : isVolleyReady ? 'rgba(240,192,64,0.6)'
                          : charges === 0 ? 'rgba(255,255,255,0.1)'
                          :                'rgba(239,68,68,0.45)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: !playerReady && !cannonJammed ? 0.4 : charges === 0 && !cannonJammed ? 0.32 : cannonJammed ? 0.7 : 1,
                transition: 'all 0.12s',
              }}>
              <p className="font-karla font-700" style={{
                fontSize: cannonJammed ? '0.6rem' : '0.72rem', letterSpacing: '0.06em',
                color: cannonJammed  ? '#f97316'
                     : !playerReady  ? '#4a3535'
                     : isVolleyReady ? '#f0c040'
                     : charges === 0 ? '#4a4845'
                     :                '#ef4444',
              }}>
                {cannonJammed ? 'Jammed' : charges === 0 ? 'Empty' : isVolleyReady ? 'VOLLEY' : 'FIRE'}
              </p>
            </motion.button>
          </div>

        </div>
      )}

      {/* Idle / ready phase: placeholder buttons to hold layout */}
      {(phase === 'idle' || phase === 'ready') && (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', width: '100%' }}>
          <div style={{ width: 82, height: 82, flexShrink: 0 }} />
          <div style={{ width: 82, height: 82, flexShrink: 0 }} />
          <div style={{ width: 82, height: 82, flexShrink: 0 }} />
        </div>
      )}

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

      {/* ── Round start overlay (idle + ready) ───────────────────────────────── */}
      <AnimatePresence>
        {(phase === 'idle' || phase === 'ready') && (
          <motion.div
            key={phase === 'idle' ? 'idle-overlay' : `ready-${roundDisplay}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.62)', zIndex: 50 }}>
            <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.45)', fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>
              {isBoss ? 'Boss Round' : 'Round'}
            </p>
            <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '5rem', lineHeight: 1, marginBottom: 36, textShadow: '0 2px 24px rgba(0,0,0,0.85)' }}>
              {roundDisplay}
            </p>
            <motion.button
              onPointerDown={openFire}
              animate={{ boxShadow: ['0 0 0px #ef444400', '0 0 28px #ef444488', '0 0 0px #ef444400'] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              whileTap={{ scale: 0.95 }}
              className="font-karla font-700"
              style={{ padding: '14px 48px', borderRadius: 14, cursor: 'pointer', background: 'rgba(239,68,68,0.18)', border: '1.5px solid rgba(239,68,68,0.55)', color: '#ef4444', fontSize: '1rem', letterSpacing: '0.1em' }}>
              OPEN FIRE
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── Loot overlay (raid complete) ─────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'loot' && (
          raidTier ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', zIndex: 50 }}>
              <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Raid Complete</p>
              <p className="font-cinzel font-700" style={{ color: '#f0ede8', fontSize: '1.6rem', marginBottom: 10 }}>Barnacle Pete Defeated</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#5a5855' }}>Cleared in</span>
                <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{fmtTime(raidTimeSecs * 1000)}</span>
              </div>
              <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
                style={{ background: `${raidTier.color}18`, border: `1px solid ${raidTier.color}55`, borderRadius: 8, padding: '3px 12px', marginBottom: 28 }}>
                <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: raidTier.color, letterSpacing: '0.1em' }}>
                  {raidTier.label} · {raidTier.mult}×
                </span>
              </motion.div>

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
                    const item  = BARNACLE_PETE_LOOT[slotDisplay]
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
                        {item.id === 'corsair_black' ? (
                          <img src={shipImageUrl} alt={item.label}
                            style={{ width: 70, height: 70, objectFit: 'contain', objectPosition: 'bottom',
                              filter: !slotLanded ? 'blur(1.5px) brightness(0.3)' : getShipSkin('corsair_black')!.filter,
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
                        <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.3)', fontSize: '0.6rem', marginBottom: 10 }}>
                          {fmtGold(pot)} raid · {fmtGold(Math.floor(lootBase * raidTier.mult * fortuneMult))} crate ({raidTier.mult}× speed{fortuneMult > 1 ? ` · ${fortuneMult.toFixed(2)}× luck` : ''})
                        </p>
                        <motion.button
                          onPointerDown={async () => {
                            if (lootClaimed) return
                            setLootClaimed(true)
                            const res = await claimRaidLoot(lootAmount, [BARNACLE_PETE_LOOT[slotFinal].id])
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
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', zIndex: 50 }}>
              <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.35)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Time Expired</p>
              <p className="font-cinzel font-700" style={{ color: '#f87171', fontSize: '1.6rem', marginBottom: 10 }}>Too Slow</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#5a5855' }}>Stopped at</span>
                <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{fmtTime(raidTimeSecs * 1000)}</span>
              </div>
              <p className="font-karla font-400" style={{ color: 'rgba(240,237,232,0.28)', fontSize: '0.68rem', marginBottom: 32, textAlign: 'center' }}>
                Finish the raid in under 5:00 to earn loot.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 240 }}>
                <motion.button
                  onPointerDown={startGame}
                  whileTap={{ scale: 0.96 }}
                  className="font-karla font-700"
                  style={{ padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444', fontSize: '0.92rem', letterSpacing: '0.06em' }}>
                  Try Again
                </motion.button>
                <motion.button
                  onPointerDown={() => { phaseRef.current = 'idle'; setPhase('idle') }}
                  whileTap={{ scale: 0.96 }}
                  className="font-karla font-600"
                  style={{ padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6a6764', fontSize: '0.82rem', letterSpacing: '0.04em' }}>
                  Leave
                </motion.button>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>


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
