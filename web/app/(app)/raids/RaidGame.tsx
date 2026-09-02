'use client'

import { useEffect, useRef, useState, useCallback, useMemo} from 'react'
import CloseButton from '@/components/CloseButton'
import type { DialAimBonus } from '@/lib/dialAim'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { claimRaidLoot, reportRaidSink, recordRaidHit, recordRaidClear, startRaidRun, type RaidClearTimes } from './actions'
import { awardRaidKill } from './raidXPActions'
import { unlockBadge } from '@/app/(app)/achievements/badgeActions'
import { getShipSkin } from '@/lib/shipSkins'
import { getActiveEffects } from '@/lib/raidItems'
import { getXPProgress, getLevelFromXP, MAX_LEVEL } from '@/lib/expeditionLevel'
import { raidDamageProfile, fortuneLootMult, fortuneDoubloonMult, type RaidMods } from '@/lib/expeditions'
import { rollCrate, crateItemChances, isChallengeRaid, LOOT_RARITY_TIER } from '@/lib/raidLoot'
import { crewLevelFromXP, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { type ShipAugment } from '@/lib/shipAugments'
import {
  BossRaidConfig, BroadsideEnemy, RaidLootItem, RARITY_COLOR, raidCompletionBonusXp, RAID_ZONE_BG, RAID_LOCATION_BG, RAID_BOSS_BG,
} from '@/lib/bossRaids'
import { isChallengeRaidId, baseRaidIdOf } from '@/lib/raidChallenge'
import { AFFIXES, ELITE_HP_MULT, ELITE_DMG_MULT, rollAffix, rollSecondAffix, mergeAffixes, rollEliteSlots, type AffixDef, type AffixId } from '@/lib/raidAffixes'
import { isUniqueLoot } from '@/lib/bossRaids'
import RaidCombat, { type ShipAnchor, type ShipFx } from './RaidCombat'
import RaidLootStage from './RaidLootStage'
import BossDialogueModal from './BossDialogueModal'
import TideModal from './TideModal'
import { drawTides, expireAfterFight, PRE_BOSS_REPRIEVE, type TideEvent, type TideEffect, type TideChoice } from '@/lib/tides'
import NavLevelUpOverlay, { NavLevelUpInfo } from '@/components/NavLevelUpOverlay'
import RenownUpOverlay, { type RenownUpInfo } from '@/components/RenownUpOverlay'
import { renownLevel } from '@/lib/renown'
import TapToContinueGate from '@/components/TapToContinueGate'
import { StatLevelBar } from '@/components/StatLevelBar'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
// WHERE THIS FIGHT IS. The bay a raid belongs to owns the water it happens
// on — see bayOfRaid.
import { bayOfRaid, bayWaterCss } from '@/app/(app)/sea/raidWaters'

type GamePhase  = 'idle' | 'ready' | 'playing' | 'clear' | 'dead' | 'loot'
type ShotResult = 'miss' | 'graze' | 'hit' | 'critical' | null

function isBossRound(round: number, seqLen: number): boolean {
  return round % (seqLen + 1) === seqLen
}
function getEnemyForRound(round: number, config: BossRaidConfig): BroadsideEnemy {
  const cycleLen = config.sequence.length + 1
  if (isBossRound(round, config.sequence.length)) return config.enemies[config.bossId]
  return config.enemies[config.sequence[round % cycleLen]]
}

/** Returns the affix for the current round if this slot was rolled elite at
 *  run start. Boss rounds are excluded by the caller; we only check the
 *  challenge-mode elite map. */
function getEliteAffixForRound(
  round: number,
  config: BossRaidConfig,
  eliteAffixes: Record<number, AffixId>,
): AffixDef | undefined {
  if (isBossRound(round, config.sequence.length)) return undefined
  const slot = round % (config.sequence.length + 1)
  const id = eliteAffixes[slot]
  return id ? AFFIXES[id] : undefined
}

/** Scale a BroadsideEnemy into its elite form (×2 HP, ×1.5 dmg on top of
 *  whatever challenge-mode scaling already applied to the base). Stat-only
 *  transform; the affix behavior is wired separately in RaidCombat. */
function buildEliteEnemy(base: BroadsideEnemy): BroadsideEnemy {
  return {
    ...base,
    hpBase: Math.round(base.hpBase * ELITE_HP_MULT),
    minDmg: Math.max(1, Math.round(base.minDmg * ELITE_DMG_MULT)),
    maxDmg: Math.max(1, Math.round(base.maxDmg * ELITE_DMG_MULT)),
  }
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
  // Single source of truth (lib/expeditions.raidDamageProfile) so combat, the
  // rating and the ledger never drift.
  const { hitMin, powerMax, critMax } = raidDamageProfile(totalPower, shipMinDamage)
  const ranges: Record<string, [number, number]> = {
    critical: [shipMinDamage * 2, critMax],
    hit:      [hitMin, powerMax],
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
  return <StatLevelBar level={level} progress={progress} toGo={xpForLevel - xpInLevel} isMax={isMax} accent="#4ade80" label="NAV" />
}

// (Removed: fmtTime + getTimeTier — Barnacle Pete no longer has a time limit
//  or speed-tier multipliers on loot. Every successful raid clear grants the
//  base loot roll. raidStartTimeRef is still wired through to claimRaidLoot
//  for cumulative-stats tracking, but no longer drives any badge gate —
//  corsairs_bane is now awarded for clearing Pete's challenge variant.)

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
  /** user_crew row id. Drives per-crew ability cooldown across RaidCombat
   *  remounts (each fight is its own mount; the used set lives in RaidGame). */
  id: number
  /** Species slug for class resolution via lib/crewClasses. */
  slug: string
  name: string
  imageUrl: string
  /** Cumulative XP — drives the crew's current class-ability tier. */
  xp: number
  power: number
  dodge: number
  fortune: number
}

export default function RaidGame({ onLeave, overSea = false, anchors, onShipFx, config, equippedShipSkin, shipSkins, equippedItems,
  ownedRaidItems,
  ownedSpecialItems = [],
  /**
   * SHUT THE FIGHT WHERE IT STANDS, rather than navigating out of it.
   *
   * Set when this is mounted as a SHEET over the chart — see RaidSheet. There
   * is nowhere to navigate back to then, because the sea never went anywhere:
   * every road out of a fight (fleeing, the pop-state guard, the buttons after
   * it ends) closes the overlay and puts the captain back on the water they
   * were floating on.
   *
   * Absent, this is a /raids/* route and leaving means a navigation, which is
   * what every one of those calls did before this existed.
   */
  classDamageMult,
  classDoubloonMult,
  shipClasses,
  equippedRepairKit,
  shipImageUrl, shipName, username, playerHPMax, shipMinDamage, shipSpeed,
  totalPower, totalDodge, totalFortune, crewCount, crewMembers, initialExpeditionXP,
  playerCharacterColor, playerEquippedHat,
  playerAvatarBg, playerAvatarBorder,
  raidMods, bonusChargeSlots = 0, manowarAugment = null,
  legendaryLootMult = 1,
  dialAim,
}: {
  /** Close instead of navigate. See the note on the destructure above. */
  onLeave?: () => void
  /**
   * THE SEA IS ALREADY BEHIND THIS, so paint nothing over it.
   *
   * Set when mounted as a sheet on the chart. Every backdrop below is a
   * stand-in for water that is not there on a /raids/* route — the bay's
   * gradient most of all, which is the chart's OWN water recreated from the
   * same function. Painting it over the live chart is the exact failure this
   * flag exists to stop: an opaque imitation of the sea on top of the real one
   * looks like a new screen, because visually it is one.
   *
   * A boss PHASE backdrop still paints. When Finn turns the sea under him that
   * is the beat, and it is a change to the water rather than a picture of it.
   */
  overSea?: boolean
  /** Live handle to where the chart's two hulls are. See RaidCombat. */
  anchors?: { current: { player: ShipAnchor; enemy: ShipAnchor } | null }
  /** What those hulls are doing, sent back for the chart to draw. */
  onShipFx?: (fx: { player: ShipFx; enemy: ShipFx }) => void
  config: BossRaidConfig
  /** Fishing gear widening the dial bands. Only the Finn finale passes it. */
  dialAim?: DialAimBonus
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
  ownedRaidItems: string[]
  /** Fishing specials owned (boolean columns, not raid_items). */
  ownedSpecialItems?: string[]
  /** Aggregated ship-class multiplier for player outgoing damage in
   *  raids (1.15 = +15% from one Master Gunner pick, stacks
   *  multiplicatively across chapters). */
  classDamageMult: number
  /** Aggregated ship-class multiplier for raid clear doubloons
   *  (1.25 = +25% from Helmsman). */
  classDoubloonMult: number
  /** Raw chapter -> classId picks. Threaded to RaidCombat so the
   *  in-fight Captain's Ledger popup can show which classes are
   *  buffing the player. */
  shipClasses: Record<string, string>
  equippedRepairKit: string
  initialExpeditionXP: number
  playerCharacterColor: string | null
  playerEquippedHat: string | null
  playerAvatarBg: string | null
  playerAvatarBorder: string | null
  raidMods: RaidMods
  /** Extra player cannonball slots from claimed Locker Upgrades. */
  bonusChargeSlots?: number
  /** Man-o-War volley augment (or null). */
  manowarAugment?: ShipAugment | null
  /** Kingpin's Cut (Don's Locker perk): legendary boss-drop weight multiplier
   *  in the loot roll. 1 = no perk, 2 = 2x legendary drop rate. */
  legendaryLootMult?: number
}) {
  const router            = useRouter()
  /**
   * OUT OF THE FIGHT, whichever way it is mounted.
   *
   * Every road out used to be its own `router.push('/expeditions')` — fleeing,
   * the pop-state guard, the buttons after it ends. As a sheet on the chart
   * there is nowhere to push to: the sea is still there, and navigating would
   * take a captain off the water they are floating on to a menu about it.
   *
   * One function, so a road out added later cannot forget which mount it is in.
   */
  const leaveRaid = useCallback(() => {
    if (onLeave) { onLeave(); return }
    router.push('/expeditions')
  }, [onLeave, router])
  const shipSkinDef       = equippedShipSkin ? getShipSkin(equippedShipSkin) : undefined
  const shipFilter        = shipSkinDef?.filter ?? 'none'
  // Pre-built set of every unique the player already owns. rollLootIndex
  // skips these so a boss clear always rolls something new — owned ship
  // skins and owned raid items both drop out of the eligible pool. The
  // pool always includes the currency slots, so there's always something
  // to roll into even if the player has every unique.
  const ownedUniqueIds    = new Set<string>([
    ...shipSkins,
    ...ownedRaidItems,
    // Fishing SPECIALS live one boolean column each, not in raid_items, so
    // without this Finn's table can roll a second Primeval Eye at a player who
    // already carries one -- a 2.5% ancient drop spent on nothing.
    ...ownedSpecialItems,
  ])
  const dodgeBonus        = totalDodge * 5
  // Two different jobs, two different curves. Coin scales uncapped because a
  // richer haul is harmless; ITEM odds are capped at 2x by fortuneLootMult
  // because a chase item that becomes common stops being a chase.
  const fortuneMult       = fortuneDoubloonMult(totalFortune)   // doubloons, uncapped
  const lootFortuneMult   = fortuneLootMult(totalFortune)   // item odds, hard 2x
  // What this crate can still drop and how likely each one is. Computed HERE
  // because this is the only place that holds the table, the owned set and both
  // multipliers at once; the combat sheet just renders what it is given, so the
  // odds it shows cannot drift from the odds rollCrate uses.
  const crateOdds = useMemo(
    () => crateItemChances(config.loot, ownedUniqueIds, config.uniqueShare, legendaryLootMult, lootFortuneMult, isChallengeRaid(config.raidId)),
    [config.loot, config.uniqueShare, config.raidId, ownedUniqueIds, legendaryLootMult, lootFortuneMult],
  )
  const playerActionMs    = Math.max(700, 2000 - shipSpeed * 100)
  const dodgeCooldownUse  = Math.max(500, 1600 - dodgeBonus)

  // Body-scroll lock ONLY in an installed PWA. On iOS standalone the
  // framer-motion compositing during combat detaches the fixed Nav header
  // + MobileTabBar unless the document is frozen; the .raid-combat-region
  // class turns into a fixed-height internal scroller there so the action
  // buttons stay reachable. In a normal mobile browser we must NOT lock
  // body scroll — doing so made raids completely unplayable (no way to
  // scroll to FIRE/VOLLEY/DODGE); the document scrolls naturally instead,
  // identical to every other page.
  // position:fixed lock (lib/bodyScrollLock), NOT overflow:hidden — on iOS the
  // overflow lock still let chained/rubber-band drags scroll the document mid-
  // fight, visually carrying the fixed header away while hit-testing stayed put.
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return
    return lockBodyScroll()
  }, [])

  // Quartermaster's Anchor — once-per-RUN lethal save (raids only, this
  // wrapper; never PracticeRaidGame). Persists across encounter remounts
  // because RaidCombat is keyed/remounted per fight but this ref lives
  // on the run wrapper.
  const anchorSavesLeftRef = useRef(
    getActiveEffects(equippedItems)
      .filter(e => e.type === 'lethal_save')
      .reduce((a, e) => a + e.value, 0),
  )

  // Challenge-mode elite roll. Runs once at mount: pick N non-boss slots
  // (currently 2) and roll a random affix for each. Persists across
  // encounter remounts so each elite slot gets the same affix throughout
  // a run, but a fresh run rerolls. Boss slot is never elite — bosses
  // get phases (Phase 3 work), not affixes.
  const eliteAffixesRef = useRef<Record<number, AffixId>>(
    isChallengeRaidId(config.raidId)
      ? Object.fromEntries(rollEliteSlots(config.sequence.length, 2).map(slot => [slot, rollAffix()]))
      : {},
  )
  // mergeRandomAffix raids (the Quartermaster challenge): every intro enemy that
  // already carries a signature affix gets a random SECOND affix (distinct),
  // rolled ONCE per run per slot so it's stable across encounter remounts but
  // fresh on a new attempt. Merged onto the baked affix at resolve time.
  const bonusAffixesRef = useRef<Record<number, AffixId>>(
    isChallengeRaidId(config.raidId) && config.mergeRandomAffix
      ? Object.fromEntries(
          config.sequence
            .map((key, i) => [i, config.enemies[key]?.affix] as const)
            .filter(([, a]) => !!a)
            .map(([i, a]) => [i, rollSecondAffix(a as AffixId)]),
        )
      : {},
  )

  const [phase, setPhase]               = useState<GamePhase>('idle')
  const [playerHP, setPlayerHP]         = useState(playerHPMax)
  const [enemyHP, setEnemyHP]           = useState(0)
  const [enemyHPMax, setEnemyHPMax]     = useState(0)
  const [enemyName, setEnemyName]       = useState('Reef Raider')
  // A BOSS-ONLY raid (sequence: []) has no sequence[0], so fall through to the
  // boss. The round effect overwrites this on mount either way; this just stops
  // the first frame rendering an empty hull.
  const [enemyImage, setEnemyImage]     = useState(() => config.enemies[config.sequence[0]]?.image ?? config.enemies[config.bossId]?.image ?? '')
  // Backdrop for the boss phase currently in play, reported up by RaidCombat.
  // This component owns the fixed full-screen battle backdrop, so the swap has
  // to happen HERE (RaidCombat runs with transparentBackdrop and paints none).
  const [phaseBg, setPhaseBg] = useState<string | null>(null)
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
  // Crew XP accumulator. Server returns per-crew old/new XP after every kill.
  // We keep the ORIGINAL oldXP/oldLevel from the first time we saw each crew
  // and overwrite newXP/newLevel each kill — so when the loot stage reads
  // this on boss death, it gets a full "earned across the raid" snapshot
  // ("Doby Lv 12 → 14, +910 XP") rather than just the last-kill delta.
  const crewXPAccumRef = useRef<Map<number, { id: number; name: string; oldXP: number; newXP: number; oldLevel: number; newLevel: number }>>(new Map())
  // Per-raid crew ability cooldown. Crew abilities can fire once per raid
  // (or twice if a Rest Stop fires at the halfway point). Set of user_crew
  // ids that have already used their ability since the last reset.
  const [usedAbilityIds, setUsedAbilityIds] = useState<Set<number>>(new Set())
  // Per-raid activatable-item use (War Drum / Thunder Drum). ONCE per whole
  // raid — deliberately NOT reset at the Rest Stop (unlike abilities), so it's
  // a single use for the run, not one per half.
  const [usedRaidItemIds, setUsedRaidItemIds] = useState<Set<string>>(new Set())
  // Rest Stop interstitial — gates the advance into the second half of the
  // raid (fight at index Math.floor(sequence.length / 2)). Clears
  // usedAbilityIds on confirm.
  const [restStopPending, setRestStopPending] = useState(false)
  const restStopFiredRef = useRef(false)
  const pendingRestAdvanceRef = useRef<(() => void) | null>(null)
  function mergeCrewXPGrants(grants: { id: number; name: string; oldXP: number; newXP: number; oldLevel: number; newLevel: number }[]) {
    const m = crewXPAccumRef.current
    for (const g of grants) {
      const prev = m.get(g.id)
      if (prev) m.set(g.id, { ...g, oldXP: prev.oldXP, oldLevel: prev.oldLevel })
      else m.set(g.id, g)
    }
  }
  // Boss pre-fight dialogue. When advancing into a boss round we stash the
  // pending advance here, render the dialogue modal, and only fire the
  // advance when the dialogue is dismissed (Engage tap).
  const [bossDialoguePending, setBossDialoguePending] = useState(false)
  const pendingBossAdvanceRef = useRef<(() => void) | null>(null)
  // ── Tides (mid-raid roguelike events) ────────────────────────────────
  // Drawn once at raid start from the eligible pool (tier <= maxTier).
  // Each slot fires a TideModal after the kill of a specific encounter
  // (config.tides.slots), gating the next-round advance the same way
  // boss dialogue does. activeTideEffects accumulates as picks land;
  // RaidCombat reads it via prop. Tokens (guaranteedDodge etc.) are
  // tracked inside activeTideEffects and consumed-on-use by the engine.
  const [drawnTides, setDrawnTides] = useState<TideEvent[]>([])
  // Mirror of drawnTides for use inside handleEnemyDefeated's tide
  // check — that callback's deps array intentionally omits state that
  // shouldn't recreate it, so reading `drawnTides` directly captures
  // the initial empty array and the tide modal never fires. Refs
  // always read the latest value (see the same pattern below for
  // navXPRef, playerHPRef, etc.).
  const drawnTidesRef = useRef<TideEvent[]>([])
  const [activeTideEffects, setActiveTideEffects] = useState<TideEffect[]>([])
  const [pendingTide, setPendingTide] = useState<TideEvent | null>(null)
  const pendingTideAdvanceRef = useRef<(() => void) | null>(null)
  // Track which tide slots have fired so a retry doesn't re-fire ones
  // the player already saw this run (defensive — we also clear it on
  // reset). Indices are kept relative to config.tides.slots.
  const tidesFiredRef = useRef<Set<number>>(new Set())
  // Pre-boss reprieve (config.preBossReprieve) — a guaranteed one-time choice
  // right before the boss fight. Same gate/ref pattern as tides.
  const [pendingReprieve, setPendingReprieve] = useState(false)
  const pendingReprieveAdvanceRef = useRef<(() => void) | null>(null)
  const reprieveFiredRef = useRef(false)
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
  /** Gems the crate's currency row actually paid, straight from the server. */
  const [lootGems, setLootGems]         = useState(0)
  const [lootBase, setLootBase]         = useState(0)
  const [lootClaimed, setLootClaimed]   = useState(false)
  // Clear time for the victory screen: this run + your best + global best.
  const [clearTimeMs, setClearTimeMs]   = useState<number | null>(null)
  const [clearTimes, setClearTimes]     = useState<RaidClearTimes | null>(null)
  // Pre-rolled loot index (set at boss kill), shown directly by RaidLootStage.
  // The crate is no longer one winning row. Currency always pays, and each
  // unique rolled its own independent chance, so a crate can carry none, one or
  // several items. `slotFinal` stays as the headline the reel lands on.
  const [slotFinal, setSlotFinal]     = useState(0)
  const [lootItemIdxs, setLootItemIdxs] = useState<number[]>([])
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
  // Full-raid-clear bonus XP, shown as its own callout on the loot stage so the
  // player knows the extra came from finishing the whole raid.
  const [bonusCallout, setBonusCallout] = useState<number | null>(null)
  const [levelUp, setLevelUp]           = useState<NavLevelUpInfo | null>(null)
  // Navigation Renown crossing (post-100). Watched centrally off navXP so it
  // fires no matter which award path (kill / clear-bonus / boss) bumped the XP.
  const [renownUp, setRenownUp]         = useState<RenownUpInfo | null>(null)
  const lastRenownRef                   = useRef(renownLevel('nav', initialExpeditionXP))
  useEffect(() => {
    const now = renownLevel('nav', navXP)
    if (now > lastRenownRef.current) {
      const gained = now - lastRenownRef.current
      setTimeout(() => setRenownUp({ skill: 'nav', toLevel: now, points: gained }), 900)
    }
    lastRenownRef.current = now
  }, [navXP])
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
  // Biggest single hit the player lands this run — reported to claimRaidLoot
  // for the "Biggest Hit" career stat.
  const maxHitRef             = useRef(0)
  const enemyHPRef            = useRef(0)
  const enemyHPMaxRef         = useRef(0)
  const phaseRef              = useRef<GamePhase>('idle')
  const playerActionElapsedRef = useRef(0)
  const playerReadyRef         = useRef(false)
  const reloadSlowRef          = useRef(false)
  const chargesRef            = useRef(1)
  const raidStartTimeRef      = useRef(0)
  // Fire-once guard for the raid_completions insert. The clear is
  // recorded the moment the boss dies (see handleEnemyDefeated) so a
  // failed loot-claim or a closed tab on the victory screen never
  // strands the player on a locked next node. The ref guarantees one
  // insert per run even if handleEnemyDefeated is re-entered.
  const clearRecordedRef      = useRef(false)
  // Achievement telemetry, aggregated across the whole raid (survives RaidCombat
  // remounts, which are per-fight). Reset when a run starts; read at boss-kill to
  // grant the challenge-run badges (iron_ruse / tight_quarters / dead_reckoning /
  // all_hands_legends). not_a_shot_fired is granted the instant it happens.
  const featTookDamageRef     = useRef(false)
  const featUsedAbilityRef    = useRef(false)
  const featMissedCritRef     = useRef(false)
  // Crate loot is granted at boss-kill (so closing the app on the loot screen
  // can't lose it). lootGrantedRef guarantees claimRaidLoot runs exactly once
  // per run (it adds doubloons every call); lootResultRef holds the result so
  // the Collect button can fire the purse-update event from it.
  const lootGrantedRef        = useRef(false)
  const lootResultRef         = useRef<Awaited<ReturnType<typeof claimRaidLoot>> | null>(null)
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

  // The current run's server token (minted at start). Threaded into every
  // awardRaidKill so the server can bound this run's kills to its real mob count.
  const runTokenRef = useRef<string | null>(null)

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
    clearRecordedRef.current     = false
    lootGrantedRef.current       = false
    lootResultRef.current        = null
    featTookDamageRef.current    = false
    featUsedAbilityRef.current   = false
    featMissedCritRef.current    = false

    resetEnemyForRound(0)

    raidStartTimeRef.current = performance.now()

    // Mint this run's server token (fire-and-forget — it resolves well before the
    // first kill). null on any hiccup, in which case awardRaidKill falls back to
    // its capped path, so a token failure never blocks the raid.
    runTokenRef.current = null
    startRaidRun(config.raidId).then(r => { runTokenRef.current = r.token }).catch(() => {})

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
    setLootAmount(0); setLootBase(0); setLootClaimed(false)
    // Tides: roll the run's drawn set on raid start. Effects + tokens
    // start empty (each retry rolls fresh). Pete + Krust have no
    // tides config so drawTides returns []; the modal never fires.
    if (config.tides) {
      const drawn = drawTides(config.tides.slots.length, config.tides.maxTier)
      setDrawnTides(drawn)
      drawnTidesRef.current = drawn
    } else {
      setDrawnTides([])
      drawnTidesRef.current = []
    }
    setActiveTideEffects([])
    setPendingTide(null)
    pendingTideAdvanceRef.current = null
    tidesFiredRef.current = new Set()
    setPendingReprieve(false)
    pendingReprieveAdvanceRef.current = null
    reprieveFiredRef.current = false
  }, [playerHPMax, resetEnemyForRound, config.tides, config.raidId])

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

  // ── Mid-battle exit guard ─────────────────────────────────────────────────
  // Any attempt to leave a live raid (tab bar, nav link, browser Back) is
  // intercepted and routed through the flee gamble in <RaidCombat /> instead
  // of being a free escape. beforeunload covers a hard refresh / tab close
  // with the browser's native prompt (the gamble can't run on a real unload).
  // Active only while phase === 'playing' (which spans all rounds — only the
  // boss kill / defeat leaves it), so the Back sentinel is pushed just once.
  const fleeNavRef = useRef<(() => void) | null>(null)
  const [fleeTick, setFleeTick] = useState(0)
  // ONCE A FLEE IS WON, THE GUARD STANDS DOWN.
  //
  // `phase` is still 'playing' at the moment a clean getaway navigates -- the
  // fight is only left behind once the route actually changes -- so without
  // this the guard is still armed during the transition and can catch the very
  // navigation it just granted. On iOS a swipe-back that completes during the
  // push fires another popstate, which re-arms the sentinel and signals ANOTHER
  // flee, dropping the player back into the fight holding a won roll. Repeat
  // and you get the reported "rolled successfully three times in a row and it
  // never let me out", ending in a death on the fourth.
  //
  // Set the instant a flee is granted, and checked by every handler below, so
  // an escape that has been earned can never be re-intercepted.
  const fledRef = useRef(false)
  /** Wrap a flee navigation so winning it disarms the guard before it runs. */
  const grantFlee = (nav: () => void) => () => { fledRef.current = true; nav() }
  useEffect(() => {
    if (phase !== 'playing') return
    window.history.pushState(null, '', window.location.href) // Back sentinel
    const signal = (nav: () => void) => { fleeNavRef.current = grantFlee(nav); setFleeTick(t => t + 1) }
    const onClickCapture = (e: MouseEvent) => {
      if (fledRef.current) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a) return
      const tgt = a.getAttribute('target')
      if (tgt && tgt !== '_self') return
      const href = a.getAttribute('href')
      if (!href || !href.startsWith('/')) return                 // same-app routes only
      if (href.split(/[?#]/)[0] === window.location.pathname) return // same page
      e.preventDefault()
      e.stopPropagation()
      signal(() => { if (onLeave) leaveRaid(); else router.push(href) })
    }
    const onPop = () => {
      if (fledRef.current) return                                // escape already won
      window.history.pushState(null, '', window.location.href)   // re-arm; stay put
      signal(() => leaveRaid())
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (fledRef.current) return   // don't warn about leaving a fight already fled
      e.preventDefault(); e.returnValue = ''
    }
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [phase, router])

  // Ship sank in this real raid: owe the tier-scaled repair fee. Fires
  // once; the player pays it from /expeditions before raiding again.
  const sinkReportedRef = useRef(false)
  useEffect(() => {
    if (phase === 'dead' && !sinkReportedRef.current) {
      sinkReportedRef.current = true
      reportRaidSink().catch(() => {})
    }
  }, [phase])

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

    // Boss kill → unified loot screen. The old 2-overlay flow (Round Clear
    // "Collect" → Open Loot Crate → Open Crate → Claim) is gone; we now
    // award the kill rewards immediately and jump straight to the loot
    // stage, which lives in the same battle-screen layout. See RaidLootStage.
    if (isBossKill) {
      setTimeout(async () => {
        setEnemySinking(false)
        setWinGold(gold); setWinXP(xp)
        // Roll loot + dollar amount up front so the stage can pre-position
        // the slot before the player taps Loot Chest.
        const crate = rollCrate(config.loot, ownedUniqueIds, config.uniqueShare, legendaryLootMult, lootFortuneMult, isChallengeRaid(config.raidId))
        // The reel lands on the RAREST item that dropped, so the headline is the
        // best thing in the crate rather than whichever index happened to sort
        // first. With no items it lands on the currency, which now always pays.
        const rarityRank = (i: number) => LOOT_RARITY_TIER[config.loot[i].rarity] ?? 1
        const final = crate.itemIdxs.length
          ? [...crate.itemIdxs].sort((a, b) => rarityRank(b) - rarityRank(a))[0]
          : Math.max(0, crate.currencyIdx)
        const base  = Math.floor(Math.random() * 301 + 300)
        // Tide doubloonsAtRaidEnd: sum all run-active deltas onto the
        // raw base BEFORE fortune scales it. Net result lands in the
        // slot machine total + the kill gold dispatched below.
        const tideDoubloons = activeTideEffects
          .filter((e): e is Extract<TideEffect, { kind: 'doubloonsAtRaidEnd' }> => e.kind === 'doubloonsAtRaidEnd')
          .reduce((s, e) => s + e.n, 0)
        const total = Math.max(0, Math.floor(base * fortuneMult) + tideDoubloons)
        setSlotFinal(final)
        setLootItemIdxs(crate.itemIdxs)
        setLootBase(base)
        setLootAmount(total)
        setWinIsBoss(true)
        // Challenge-mode boss trophies — unlock the badge HERE (right as the
        // boss sinks), not at loot-claim time. Sequencing matters: the
        // BadgeWatcher fires on the awardRaidKill `doubloons-changed` event
        // below, so the DB unlock has to land before that dispatch or the
        // celebration won't pop until something else triggers a re-check.
        // Map is intentionally small and inline so the relationship between
        // a challenge raidId and its badge is impossible to lose.
        const challengeBadgeId =
          config.raidId === 'corsairs_reckoning_challenge' ? 'corsairs_bane'
          : config.raidId === 'captain_krust_challenge'    ? 'ghost_ship'
          : null
        if (challengeBadgeId) {
          try { await unlockBadge(challengeBadgeId) } catch { /* badge unlock is best-effort */ }
        }
        // Challenge-run feat badges — read the raid-long telemetry refs at the
        // kill and grant HERE (awaited, before the doubloons-changed dispatch
        // below) so BadgeWatcher pops the celebration this run. Raid-specific
        // feats gate on config.raidId; the fleet flex checks ship + party.
        {
          const LEGEND_SLUGS = new Set(['catfish', 'doby_mick', 'mako', 'dole', 'coelacanth'])
          const manOWar = !!shipName && shipName.includes('Man-o-War')
          // All Hands, All Legends: Man-o-War + 5 legendary crew, every one Lv 100.
          const maxLegendsAboard = crewMembers.filter(c =>
            LEGEND_SLUGS.has(c.slug.toLowerCase()) && crewLevelFromXP(c.xp ?? 0) >= CREW_MAX_LEVEL,
          ).length
          const featBadges: string[] = []
          // startsWith so the (harder) challenge variants count too.
          if (manOWar && maxLegendsAboard >= 5) featBadges.push('all_hands_legends')
          if (config.raidId.startsWith('coffers_fleet') && !featTookDamageRef.current) featBadges.push('iron_ruse')
          if (config.raidId.startsWith('the_quartermaster') && !featUsedAbilityRef.current) featBadges.push('tight_quarters')
          if (config.raidId.startsWith('cartographer') && !featMissedCritRef.current) featBadges.push('dead_reckoning')
          for (const id of featBadges) {
            try { await unlockBadge(id) } catch { /* best-effort */ }
          }
        }
        // Persist the raid_completions row NOW (boss is dead) — not
        // inside claimRaidLoot, which used to be the only writer and
        // silently dropped the clear if the player closed the tab on
        // the loot screen or the loot grant failed. Fire-and-forget,
        // guarded by clearRecordedRef so we never insert twice for
        // the same run.
        const clearElapsedMs = performance.now() - raidStartTimeRef.current
        setClearTimeMs(clearElapsedMs)   // this run's time, for the victory screen
        if (!clearRecordedRef.current) {
          clearRecordedRef.current = true
          recordRaidClear(config.raidId, clearElapsedMs, runTokenRef.current ?? undefined)
            .then(t => { if (t) setClearTimes(t) })
            .catch(() => {
              // If the insert fails, clear the guard so the loot-claim
              // path can still try once as a fallback.
              clearRecordedRef.current = false
            })
        }
        // Grant the crate loot NOW (boss is dead) so it can never be lost if the
        // player closes the app on the loot screen before tapping Collect — the
        // same reason the clear above persists at kill. `total` + `final` are the
        // rolled doubloons + item index from just above. Fire-and-forget, guarded
        // so claimRaidLoot runs exactly once (it adds doubloons every call); on
        // failure the guard resets so the Collect button retries as a fallback.
        // The purse-update event is deferred to Collect (from lootResultRef) so
        // the Nav total ticks up in sync with the reveal, not mid-animation.
        if (!lootGrantedRef.current) {
          lootGrantedRef.current = true
          const lootElapsedMs = performance.now() - raidStartTimeRef.current
          claimRaidLoot(total, crate.itemIdxs.map(i => config.loot[i].id), lootElapsedMs, playerHPMax - playerHP, config.raidId)
            .then(res => {
              lootResultRef.current = res
              // THE REEL FOLLOWS THE SERVER. The currency half is drawn there
              // now, so the row shown when nothing unique dropped has to be the
              // row that was actually paid, or the reveal goes back to printing
              // a reward nobody received. Only when no unique landed: a unique
              // is still the headline and the client already knows which.
              if (!crate.itemIdxs.length && res.currencyId) {
                const idx = config.loot.findIndex(l => l.id === res.currencyId)
                if (idx >= 0) setSlotFinal(idx)
              }
              if (res.gemsGranted > 0) setLootGems(res.gemsGranted)
              // A gem row pays gems INSTEAD of coin, so the coin figure on the
              // reveal has to drop to nothing or it claims a purse that was
              // never handed over.
              setLootAmount(res.crateDoubloons)
            })
            .catch(() => { lootGrantedRef.current = false })
        }
        // Award the boss kill XP + the full-clear bonus (25% of the run's kill
        // XP) in one persisted call, but animate the bar in two steps: the kill
        // XP now, then the bonus a beat later, synced to the loot stage's "Full
        // clear bonus" log line.
        const bonus = raidCompletionBonusXp(config)
        try {
          const before = navXPRef.current
          const res = await awardRaidKill(xp + bonus, gold, runTokenRef.current ?? undefined)
          mergeCrewXPGrants(res.crewXP)
          const killTotal = res.newExpeditionXP - bonus
          const oldLevel = getLevelFromXP(before)
          const killLevel = getLevelFromXP(killTotal)
          navXPRef.current = killTotal
          setNavXP(killTotal)
          window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
          if (xp > 0) setXpPopup({ value: xp, id: Date.now() })
          if (killLevel > oldLevel) {
            // Surface the level-up overlay before the loot stage so the
            // celebration doesn't fight the chest reveal for attention.
            setTimeout(() => setLevelUp({ fromLevel: oldLevel, toLevel: killLevel }), 600)
          }
          // Second beat: fill the bonus into the bar and pop its own callout, so
          // the player sees the extra is for clearing the whole raid.
          if (bonus > 0) {
            setTimeout(() => {
              navXPRef.current = res.newExpeditionXP
              setNavXP(res.newExpeditionXP)
              setBonusCallout(bonus)
              const bonusLevel = getLevelFromXP(res.newExpeditionXP)
              if (bonusLevel > killLevel) {
                setTimeout(() => setLevelUp({ fromLevel: killLevel, toLevel: bonusLevel }), 700)
              }
            }, 1500)
          }
        } catch { /* save failed, still go to loot */ }
        phaseRef.current = 'loot'
        setPhase('loot')
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
    // Expire next-fight-scope tide effects now that the fight ended.
    // Boss-scope effects stay until the boss fight ends; allRemaining
    // effects stay until raid end. Shared with the Gauntlet host via
    // expireAfterFight so the two can't drift on what's one-shot.
    setActiveTideEffects(expireAfterFight)

    // ── THE INTERSTITIAL CHAIN ────────────────────────────────────────────────
    // Three things can stand between one kill and the next fight: a Tide, the Rest
    // Stop, and the boss's pre-fight dialogue. They used to be three independent
    // `if (...) return` blocks that each committed the round themselves, which meant
    // WHICHEVER FIRED FIRST SILENTLY CANCELLED THE OTHERS.
    //
    // That is not hypothetical. The Blockade runs a 7-mob sequence, so its Rest Stop
    // falls after kill floor(7/2) = 3 — and its tide slots are 3 and 6. The tide won
    // the race and returned, the round advanced past the halfway point, and the Rest
    // Stop condition (nextRound === halfway) could never match again. The whole raid
    // ran with no crew-ability refresh, and nothing anywhere said so. It was the only
    // raid in the game with an odd sequence, which is exactly why it was the only one
    // that broke: every other raid's halfway lands between its tide slots by luck.
    //
    // So they CHAIN now. Each gate hands off to the next instead of committing the
    // round, and only the last one through actually advances. Luck is no longer load
    // bearing, and an odd-length raid is no longer a trap.
    const advanceToNext = () => {
      setEnemySinking(false)
      const nextRound = roundRef.current + 1

      const commitRound = () => {
        roundRef.current = nextRound
        resetEnemyForRound(roundRef.current)
        setRoundDisplay(roundRef.current + 1)
        // Phase stays 'playing'; the key={`combat-r${roundDisplay}`} on
        // <RaidCombat /> remounts it fresh with the next enemy.
      }

      // Gate 4 (last): the pre-boss reprieve — a guaranteed catch-your-breath
      // choice right before the boss fight (heal / +damage / refresh an ability).
      const reprieveGate = () => {
        if (
          config.preBossReprieve &&
          !reprieveFiredRef.current &&
          isBossRound(nextRound, config.sequence.length)
        ) {
          reprieveFiredRef.current = true
          pendingReprieveAdvanceRef.current = commitRound
          setPendingReprieve(true)
          return
        }
        commitRound()
      }

      // Gate 3: the boss's pre-fight dialogue. Hands off to the reprieve, so the
      // don speaks, THEN you take your breath, THEN the fight begins.
      const bossGate = () => {
        if (
          isBossRound(nextRound, config.sequence.length) &&
          config.preFightDialogue && config.preFightDialogue.length > 0
        ) {
          pendingBossAdvanceRef.current = reprieveGate
          setBossDialoguePending(true)
          return
        }
        reprieveGate()
      }

      // Gate 2: the Rest Stop, once per raid, after the last fight of the first half.
      // Crew abilities reset on the player's confirm.
      const restGate = () => {
        if (
          !restStopFiredRef.current &&
          config.sequence.length >= 4 &&
          nextRound === Math.floor(config.sequence.length / 2)
        ) {
          restStopFiredRef.current = true
          pendingRestAdvanceRef.current = bossGate
          setRestStopPending(true)
          return
        }
        bossGate()
      }

      // Gate 1: a Tide. Slots are 1-indexed kill counts ("after the 3rd kill");
      // roundRef.current is the just-killed 0-indexed round, so kill count = +1.
      if (config.tides && drawnTidesRef.current.length > 0) {
        const killCount = roundRef.current + 1
        const slotIdx = config.tides.slots.indexOf(killCount)
        if (slotIdx >= 0 && !tidesFiredRef.current.has(slotIdx) && drawnTidesRef.current[slotIdx]) {
          tidesFiredRef.current.add(slotIdx)
          pendingTideAdvanceRef.current = restGate
          setPendingTide(drawnTidesRef.current[slotIdx])
          return
        }
      }
      restGate()
    }

    let res: Awaited<ReturnType<typeof awardRaidKill>> | null = null
    try { res = await awardRaidKill(xp, gold, runTokenRef.current ?? undefined) } catch { /* save failed */ }
    if (!res) { setTimeout(advanceToNext, 400); return }
    mergeCrewXPGrants(res.crewXP)

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
      const res = await awardRaidKill(winXP, winGold, runTokenRef.current ?? undefined)
      mergeCrewXPGrants(res.crewXP)
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
    // Per-raid battle backdrop: the boss round gets the escalated boss-fight
    // scene; mob rounds get the raid's location scene; both fall back to the
    // shared zone photo for challenge/side variants and the practice skirmish.
    // Challenge raids carry a suffixed raidId (…_challenge); the custom
    // location/boss backdrops are keyed by the BASE id, so resolve it first or
    // challenge fights fall through to the procedural zone backdrop.
    const bgRaidId = baseRaidIdOf(config.raidId)
    /**
     * ── THE WATER THIS FIGHT IS ACTUALLY ON ─────────────────────────────
     *
     * Ahead of every stock backdrop except a boss's own phase, because it is
     * the only one of them that is TRUE: you sailed up to this hull in a named
     * bay and the sea does not change on the way into the fight.
     *
     * A phase backdrop still wins. When Finn turns the sea under him that is
     * the whole point of the beat, and "where you are" stops being the most
     * important thing the picture has to say.
     *
     * Null for anything with no bay — the practice skirmish, the gauntlets,
     * anything opened from the node map — and those keep what they had.
     */
    const bay = bayOfRaid(bgRaidId)
    // OVER THE CHART, THE BAY PAINTS ITSELF. `bayWaterCss` exists to recreate
    // the chart's water where the chart is not; where it IS, the real thing is
    // already there, moving, with the boat on it.
    const bayBg = bay && !phaseBg && !overSea ? bayWaterCss(bay) : null

    const raidBg = overSea
      // A phase backdrop is the only one that still paints on the water: it is
      // the sea CHANGING, not a photograph of a different one.
      ? phaseBg ?? null
      : (
        // A boss phase backdrop (Finn) outranks everything: it is the whole point
        // that the sea changes under him as he escalates.
        phaseBg
        ?? (isBoss ? RAID_BOSS_BG[bgRaidId] : undefined)
        ?? RAID_LOCATION_BG[bgRaidId]
        ?? (config.zone ? RAID_ZONE_BG[config.zone] : null)
      )
    return (
      <>
      {/* Full-screen battle backdrop — the raid's location painted across the
          WHOLE screen (fixed), so it reads as the single battle backdrop and
          RaidCombat's container stays transparent (transparentBackdrop) to sit
          directly on it — no boxed second image over a different page image.
          zIndex -1: the whole page already lives inside PageTransition's
          `position:relative; zIndex:1` layer, which sits ABOVE the app-level
          ClientBackground (/raid1background). So even at -1 this covers that page
          image, while sitting BEHIND the in-flow combat content (no lifting
          needed) and leaving the fixed combat overlays untouched. */}
      {/* Phase backdrop cross-fade: the new sea comes up over the old, slow
          enough to read as weather turning rather than a cut. */}
      <style>{`@keyframes rg-bg-in { from { opacity: 0 } to { opacity: 1 } } .rg-bg-fade { animation: rg-bg-in 1.1s ease-out both; }`}</style>
      {/* THE BAY'S OWN WATER, when the fight is in one. A gradient rather than
          a photograph, because it is the same gradient the chart paints and a
          photograph of somewhere else is exactly what this replaces. */}
      {bayBg && (
        <div aria-hidden style={{
          position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none',
          background: bayBg,
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(4,8,14,0.18) 0%, rgba(4,8,14,0.34) 46%, rgba(3,5,10,0.66) 100%)' }} />
        </div>
      )}
      {!bayBg && raidBg && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
          {/* keyed on src so a phase swap mounts a NEW image and fades it up
              over the old one instead of hard-cutting the sea */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={raidBg} src={raidBg} alt="" className="rg-bg-fade" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(4,8,14,0.4) 0%, rgba(4,8,14,0.56) 46%, rgba(3,5,10,0.82) 100%)' }} />
        </div>
      )}
      <div className="raid-combat-region flex flex-col items-center gap-2 select-none" style={{
        userSelect: 'none',
        // Breathing gap so the bottom action buttons clear the fixed
        // MobileTabBar (~64px) + iOS home indicator + a comfort margin.
        // Height/scroll behavior lives in .raid-combat-region (browser =
        // natural document scroll, PWA = fixed-height internal scroller).
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)',
      }}>
        {/* Nav level bar — kept across all phases. NOTE: must NOT be
            position:sticky (or have transform/filter/will-change) — combined
            with framer-motion compositing inside RaidCombat, iOS Safari PWA
            mis-handles position:fixed for Nav header + MobileTabBar.
            See memory: feedback_pagetransition_ios_pwa.md */}
        <div style={{ width: '100%', flexShrink: 0 }}>
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
        <div style={{ width: '100%', padding: '0 0.5rem', flexShrink: 0 }}>
          {(() => {
            const baseEnemy = getEnemyForRound(roundRef.current, config)
            const currentEnemyId = baseEnemy.id
            const reward = config.killRewards[currentEnemyId]
            // Challenge-mode elite check. Resolved per round so each
            // encounter remount picks up the right scaled enemy + affix.
            const rolledAffix = getEliteAffixForRound(roundRef.current, config, eliteAffixesRef.current)
            // Baked affix — a named enforcer whose signature IS an affix (The
            // Leech's Vampiric, The Breaker's Ironclad). It applies in normal AND
            // challenge play and takes precedence over a random elite roll on the
            // same slot, so the enforcer keeps its identity. Baked enemies keep
            // their own stats (no ×1.5/×1.25 elite bump — challenge scaling via
            // scaleEnemy already handled the numbers); only a purely random elite
            // gets buildEliteEnemy.
            const bakedAffix = baseEnemy.affix ? AFFIXES[baseEnemy.affix] : undefined
            // Quartermaster challenge: fold this slot's random second affix onto
            // the enforcer's signature so it reads as a fresh elite each run.
            const bonusSlot = roundRef.current % (config.sequence.length + 1)
            const bonusAffixId = bakedAffix ? bonusAffixesRef.current[bonusSlot] : undefined
            const eliteAffix = bakedAffix
              ? (bonusAffixId ? mergeAffixes(bakedAffix, AFFIXES[bonusAffixId]) : bakedAffix)
              : rolledAffix
            // Stamp the raid's baseline gunnery accuracy onto the enemy (a
            // per-enemy `accuracy` still wins if set), so the dodge contest can
            // actually land shots through a high-nav captain's dodge. Hull is
            // folded in here: post-split the dodge contest is accuracy-only (no
            // hull term), so adding shipSpeed preserves the enemy's old
            // hull+accuracy total exactly.
            const enemyWithAccuracy = { ...baseEnemy, accuracy: (baseEnemy.accuracy ?? config.enemyAccuracy ?? 0) + baseEnemy.shipSpeed }
            const enemyForCombat = (rolledAffix && !bakedAffix)
              ? buildEliteEnemy(enemyWithAccuracy)
              : enemyWithAccuracy
            return (
              <RaidCombat
                key={`combat-r${roundDisplay}`}
                enemy={enemyForCombat}
                atmosphere={config.atmosphere}
                zoneBg={config.zone ? RAID_ZONE_BG[config.zone] : undefined}
                // The raid's location backdrop is painted full-screen behind the
                // whole combat region (above), so RaidCombat's own container stays
                // transparent and that single backdrop shows through — no boxed
                // second image.
                // `overSea` on its own is enough: with nothing painted behind
                // the fight, RaidCombat's own stage gradient and its scenery
                // chain would be the opaque layer instead.
                transparentBackdrop={!!raidBg || !!bayBg || overSea}
                overSea={overSea}
                anchors={anchors}
                onShipFx={onShipFx}
                affix={eliteAffix}
                isElite={!!eliteAffix}
                isBoss={isBoss}
                // 'dial' on the Finn finale: the whole fight is aimed on the
                // fishing dial instead of the bar (see BossRaidConfig.aimStyle).
                aimStyle={config.aimStyle}
                critStreakCfg={config.critStreak}
                defeatSequence={config.defeatSequence}
                bossDefeatedText={config.bossDefeatedText}
                dialAim={dialAim}
                onPhaseBg={setPhaseBg}
                shipImageUrl={shipImageUrl}
                shipFilter={shipFilter}
                shipName={shipName}
                playerLabel={username ?? shipName}
                playerCharacterColor={playerCharacterColor}
                playerEquippedHat={playerEquippedHat}
                playerAvatarBg={playerAvatarBg}
                playerAvatarBorder={playerAvatarBorder}
                playerHpMax={playerHPMax}
                playerHp={playerHP}
                shipMinDamage={shipMinDamage}
                shipSpeed={shipSpeed}
                totalPower={totalPower}
                totalNavigation={totalDodge}
                totalFortune={totalFortune}
                crateOdds={crateOdds}
                equippedRaidItems={equippedItems}
                classDamageMult={classDamageMult}
                shipClasses={shipClasses}
                equippedRepairKit={equippedRepairKit}
                killReward={reward ? { gold: reward.gold, xp: reward.xp } : undefined}
                onEnemyDefeated={handleEnemyDefeated}
                onPlayerDefeated={handlePlayerDefeated}
                onPlayerHit={(d) => { if (d > maxHitRef.current) { maxHitRef.current = d; recordRaidHit(d).catch(() => {}) } }}
                onDamageTaken={() => { featTookDamageRef.current = true }}
                onShotResolved={(isCrit) => { if (!isCrit) featMissedCritRef.current = true }}
                onNoShotKill={() => { unlockBadge('not_a_shot_fired').catch(() => {}); window.dispatchEvent(new Event('badges-may-have-changed')) }}
                anchorSaveAvailable={anchorSavesLeftRef.current > 0}
                onAnchorSave={() => { anchorSavesLeftRef.current = Math.max(0, anchorSavesLeftRef.current - 1) }}
                onLeave={grantFlee(() => leaveRaid())}
                riskyFlee
                fleeSignal={fleeTick}
                fleeNav={fleeNavRef.current}
                raidMods={raidMods}
                bonusChargeSlots={bonusChargeSlots}
                megaAugment={manowarAugment}
                tideEffects={activeTideEffects}
                crewMembers={crewMembers}
                usedAbilityIds={usedAbilityIds}
                onAbilityFired={(crewId) => { featUsedAbilityRef.current = true; setUsedAbilityIds(prev => {
                  if (prev.has(crewId)) return prev
                  const next = new Set(prev)
                  next.add(crewId)
                  return next
                }) }}
                usedRaidItemIds={usedRaidItemIds}
                onRaidItemUsed={(itemId) => setUsedRaidItemIds(prev => {
                  if (prev.has(itemId)) return prev
                  const next = new Set(prev)
                  next.add(itemId)
                  return next
                })}
                onRefreshAbility={(crewId) => setUsedAbilityIds(prev => {
                  if (!prev.has(crewId)) return prev
                  const next = new Set(prev)
                  next.delete(crewId)
                  return next
                })}
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
        <RenownUpOverlay info={renownUp} onDismiss={() => setRenownUp(null)} />

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

        {/* Rest Stop — halfway-through interstitial. Refreshes crew
            abilities (clears usedAbilityIds set) and gates the advance
            into the second-half fights, same shape as the boss-dialogue
            gate but a calmer narrative beat. Fires exactly once per raid. */}
        <AnimatePresence>
          {restStopPending && (
            <motion.div
              key="rest-stop-bg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 110,
                background: 'rgba(4,8,14,0.92)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1.5rem',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  width: '100%', maxWidth: 360,
                  background: 'linear-gradient(180deg, #1a1612 0%, #0b0807 100%)',
                  border: '1px solid rgba(240,192,64,0.32)',
                  borderRadius: 16,
                  padding: '1.2rem 1.15rem 1.1rem',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,225,170,0.06)',
                  textAlign: 'center',
                }}
              >
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.22em', color: '#c8aa6a', marginBottom: '0.55rem' }}>
                  Rest Stop
                </p>
                <p className="font-pirata" style={{ fontSize: '1.6rem', color: '#ecdcbd', lineHeight: 1.1, marginBottom: '0.6rem' }}>
                  The crew makes anchor.
                </p>
                <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(236,220,189,0.7)', lineHeight: 1.55, marginBottom: '1rem' }}>
                  Your crew rest, sharpen their tools, and prepare for the second leg.
                </p>
                <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0c040', marginBottom: '1.1rem' }}>
                  ✚ All crew abilities recharged.
                </p>
                <motion.button
                  onClick={() => {
                    setUsedAbilityIds(new Set())
                    setRestStopPending(false)
                    const fn = pendingRestAdvanceRef.current
                    pendingRestAdvanceRef.current = null
                    fn?.()
                  }}
                  whileTap={{ scale: 0.96 }}
                  className="font-cinzel font-700 uppercase"
                  style={{
                    width: '100%', padding: '0.78rem 0',
                    fontSize: '0.86rem', letterSpacing: '0.08em',
                    background: 'linear-gradient(180deg, #d9b563 0%, #a8842f 100%)',
                    border: '1px solid rgba(240,214,150,0.85)',
                    color: '#2a1c08', borderRadius: 10,
                    boxShadow: '0 4px 16px rgba(201,162,74,0.42), inset 0 1px 0 rgba(255,240,200,0.5)',
                    cursor: 'pointer',
                  }}
                >
                  Continue
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Boss pre-fight dialogue — RPG-style modal that runs before the
            boss round mounts. The advanceToNext path stashes the round
            advance in pendingBossAdvanceRef and sets bossDialoguePending;
            the modal's onComplete fires the advance. */}
        <AnimatePresence>
          {bossDialoguePending && config.preFightDialogue && (
            <BossDialogueModal
              boss={config.enemies[config.bossId]}
              raidTitle={config.raidTitle}
              lines={config.preFightDialogue}
              accent={config.dialogueAccent}
              playerLabel={username ?? shipName}
              playerCharacterColor={playerCharacterColor}
              playerEquippedHat={playerEquippedHat}
              playerAvatarBg={playerAvatarBg}
              playerAvatarBorder={playerAvatarBorder}
              onComplete={() => {
                setBossDialoguePending(false)
                const fn = pendingBossAdvanceRef.current
                pendingBossAdvanceRef.current = null
                fn?.()
              }}
            />
          )}
          {/* Tide modal: between-fight roguelike event. Picking a
              choice fires instant effects (heal) immediately and
              appends every non-instant effect to activeTideEffects
              so RaidCombat can read them on the next mount. */}
          {pendingTide && (
            <TideModal
              tide={pendingTide}
              onPicked={(choice: TideChoice) => {
                // Apply instant-now effects (heals) at pick-time. They
                // don't need to persist in activeTideEffects since they
                // resolve here; only durable effects need the array.
                let healDelta = 0
                let fullHealTriggered = false
                const persisted: TideEffect[] = []
                for (const e of choice.effects) {
                  if (e.kind === 'instantHeal') {
                    healDelta += e.n
                  } else if (e.kind === 'instantHealPct') {
                    healDelta += Math.round(e.pct * playerHPMax)
                  } else if (e.kind === 'fullHeal') {
                    fullHealTriggered = true
                  } else {
                    persisted.push(e)
                  }
                }
                if (fullHealTriggered) {
                  playerHPRef.current = playerHPMax
                  setPlayerHP(playerHPMax)
                } else if (healDelta !== 0) {
                  const next = Math.min(playerHPMax, Math.max(0, playerHPRef.current + healDelta))
                  playerHPRef.current = next
                  setPlayerHP(next)
                }
                if (persisted.length > 0) {
                  setActiveTideEffects(prev => [...prev, ...persisted])
                }
                setPendingTide(null)
                const fn = pendingTideAdvanceRef.current
                pendingTideAdvanceRef.current = null
                fn?.()
              }}
            />
          )}
          {pendingReprieve && (
            <TideModal
              tide={PRE_BOSS_REPRIEVE}
              theme="don"
              onPicked={(choice: TideChoice) => {
                // Heal / +damage picks ride the normal tide effect path.
                let healDelta = 0
                const persisted: TideEffect[] = []
                for (const e of choice.effects) {
                  if (e.kind === 'instantHealPct')      healDelta += Math.round(e.pct * playerHPMax)
                  else if (e.kind === 'instantHeal')    healDelta += e.n
                  else if (e.kind === 'fullHeal') { playerHPRef.current = playerHPMax; setPlayerHP(playerHPMax) }
                  else                                  persisted.push(e)
                }
                if (healDelta !== 0) {
                  const next = Math.min(playerHPMax, Math.max(0, playerHPRef.current + healDelta))
                  playerHPRef.current = next
                  setPlayerHP(next)
                }
                if (persisted.length > 0) setActiveTideEffects(prev => [...prev, ...persisted])
                // 'Rally a hand' — clear ONE random spent crew ability so it's
                // ready to fire again in the boss fight.
                if (choice.id === 'reprieve_ability') {
                  setUsedAbilityIds(prev => {
                    const spent = crewMembers.filter(c => prev.has(c.id))
                    if (spent.length === 0) return prev
                    const pick = spent[Math.floor(Math.random() * spent.length)]
                    const nextSet = new Set(prev)
                    nextSet.delete(pick.id)
                    return nextSet
                  })
                }
                setPendingReprieve(false)
                const fn = pendingReprieveAdvanceRef.current
                pendingReprieveAdvanceRef.current = null
                fn?.()
              }}
            />
          )}
        </AnimatePresence>
      </div>
      </>
    )
  }

  // ─── Loot phase: unified chest screen in the same battle-screen layout ───
  // Boss kill went straight here (skipping the old Round Clear → Open Crate
  // → Claim 3-click flow). Shows the kill narration in its action log,
  // hosts the chest reveal in the battle-stage area, and ends with a
  // Return to Port button that fires the claim + routes.
  if (phase === 'loot') {
    const bossEnemy = config.enemies[config.bossId]
    return (
      <div className="raid-combat-region flex flex-col items-center gap-2 select-none" style={{
        userSelect: 'none',
        // Same scroll behavior as the playing phase (see .raid-combat-region)
        // so the Return to Port button is always reachable.
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)',
        // The region only ever scrolls vertically; overflow-y:auto makes the
        // browser compute overflow-x to auto too, so any sub-pixel horizontal
        // bleed shows a stray scrollbar. Pin it off.
        overflowX: 'hidden',
        maxWidth: '100%',
      }}>
        <div style={{ width: '100%', flexShrink: 0 }}>
          <NavLevelBar xp={navXP} />
        </div>
        <div style={{ width: '100%', padding: '0 0.5rem', flexShrink: 0 }}>
          <RaidLootStage
            boss={bossEnemy}
            clearTimeMs={clearTimeMs}
            clearTimes={clearTimes}
            killGold={winGold}
            killXP={winXP}
            clearBonusXp={bonusCallout ?? 0}
            crewXP={Array.from(crewXPAccumRef.current.values())}
            loot={config.loot}
            slotFinal={slotFinal}
            itemIdxs={lootItemIdxs}
            lootAmount={lootAmount}
            lootGems={lootGems}
            fortuneMult={fortuneMult}
            lootFortuneMult={lootFortuneMult}
            shipImageUrl={shipImageUrl}
            shipFilter={shipFilter}
            shipName={shipName}
            playerLabel={username ?? shipName}
            playerCharacterColor={playerCharacterColor}
            playerEquippedHat={playerEquippedHat}
            playerAvatarBg={playerAvatarBg}
            playerAvatarBorder={playerAvatarBorder}
            playerHpMax={playerHPMax}
            playerHp={playerHP}
            claiming={lootClaimed}
            onClaim={async () => {
              if (lootClaimed) return
              setLootClaimed(true)
              const elapsedMs = performance.now() - raidStartTimeRef.current
              // Belt-and-braces: the boss-death recordRaidClear() is
              // the primary writer, but if that insert failed (network
              // blip, etc.) clearRecordedRef will be false. Retry once
              // here so the clear still lands as long as the player
              // reached the loot screen.
              if (!clearRecordedRef.current) {
                clearRecordedRef.current = true
                recordRaidClear(config.raidId, elapsedMs).catch(() => { clearRecordedRef.current = false })
              }
              // The crate loot was already granted at boss-kill, so Collect just
              // fires the purse-update event from the stored result and routes —
              // instant in the normal case. Fallback: if the kill-time grant
              // failed (lootGrantedRef reset), claim once here, capped so a stuck
              // network can't pin the player on "Saving…" (the claim still
              // finishes server-side; routing is expected once they've tapped).
              if (!lootGrantedRef.current) {
                lootGrantedRef.current = true
                try {
                  const res = await Promise.race([
                    claimRaidLoot(lootAmount, lootItemIdxs.map(i => config.loot[i].id), elapsedMs, playerHPMax - playerHP, config.raidId),
                    new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
                  ])
                  if (res) lootResultRef.current = res
                } catch { lootGrantedRef.current = false /* save failed, route anyway */ }
              }
              if (lootResultRef.current) {
                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: lootResultRef.current.newDoubloonTotal }))
              }
              leaveRaid()
            }}
          />
        </div>
        <NavLevelUpOverlay
          info={levelUp}
          onDismiss={() => setLevelUp(null)}
        />
        <RenownUpOverlay info={renownUp} onDismiss={() => setRenownUp(null)} />
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

      {/* ── Round clear / collect overlay ───────────────────────────────────
           Boss kills now skip this entirely and jump straight to the unified
           loot stage (see <RaidLootStage> below). This block is dead code as
           of that change but is left in place for now in case we re-introduce
           a non-boss "round clear" interstitial. It only renders if phase is
           'clear', which the boss kill flow no longer sets. */}
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
                    onPointerDown={() => leaveRaid()}
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
            style={{
              position: 'fixed', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(ellipse at center, rgba(6,12,20,0.86) 0%, rgba(2,4,8,0.96) 100%)',
              zIndex: 50, padding: '1.5rem',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.35 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: '1.75rem' }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.6rem', color: '#9a9488' }}>
                Ship Sunk
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '2.2rem', color: '#f87171', textShadow: '0 0 22px rgba(248,113,113,0.40)', letterSpacing: '0.02em' }}>
                Defeated
              </p>
            </motion.div>
            <motion.button
              onPointerDown={() => leaveRaid()}
              whileTap={{ scale: 0.97 }}
              className="font-cinzel font-700 uppercase tracking-[0.12em]"
              style={{
                padding: '14px 32px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderTop: '1px solid rgba(255,255,255,0.30)',
                borderRadius: 12,
                color: '#c8c4be',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Return to Port
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Old loot overlay removed — replaced by the in-place <RaidLootStage>
          early-return above. */}


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
      <RenownUpOverlay info={renownUp} onDismiss={() => setRenownUp(null)} />

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
              <CloseButton onClick={() => setShowCrewInfo(false)} size={28} />
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
        /* Note: enemy-sink keyframes used to live here as a legacy from
           the ripped voyage page, but nothing referenced them. The
           working sink animation is now driven by framer-motion inside
           RaidCombat.tsx (search: enemySinking). */
      `}</style>
    </div>
  )
}
