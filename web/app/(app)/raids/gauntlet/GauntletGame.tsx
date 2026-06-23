'use client'

// Davy Jones Gauntlet host. Owns the push-your-luck meta-loop (depth, pot,
// cash-out vs push-on, the daily gate) and mounts the existing RaidCombat
// engine one fight at a time. No combat rewrite: RaidCombat fights a single
// generated enemy, hands back the player's remaining HP, and we carry it into
// the next fight. Bosses / elites / Tides fire on the randomized guardrails in
// lib/gauntlet. The pot is only banked on cash-out; a wipe loses everything.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import RaidCombat from '../RaidCombat'
import TideModal from '../TideModal'
import { getShipSkin } from '@/lib/shipSkins'
import type { RaidMods } from '@/lib/expeditions'
import type { RaidCrewMember } from '../actions'
import {
  generateFight, advanceRollState, shouldFireTide, chestForDepth,
  CURSE_DEPTHS, drawCurse, BOON_DEPTHS, drawBoons,
  DROWNED_FILTER, bandForDepth, davyTaunt,
  GAUNTLET_COOLDOWN_ROUNDS, TIDE_HEAL_HP_PCT, GAUNTLET_COOLDOWN_HOURS,
  CHEST_TIERS, chestCannonDropChance, estimatePotForDepth,
  type GauntletFight, type GauntletRollState, type GauntletCurse, type GauntletBoon,
} from '@/lib/gauntlet'
import { drawTides, expireAfterFight, type TideEvent, type TideEffect, type TideChoice } from '@/lib/tides'
import { startGauntletRun, cashOutGauntlet, resolveGauntletDeath, getGauntletUpgradeState, claimGauntletUpgrade, markGauntletIntroSeen } from './actions'
import { GAUNTLET_UPGRADES, bonusChargeSlots, gauntletRunHpMult, gauntletCurseDelay } from '@/lib/gauntletUpgrades'
import { getSpecialItem } from '@/lib/specialItems'
import { buySpecialItem } from '@/app/(app)/fishing/actions'
import { getRaidItem, getActiveEffects } from '@/lib/raidItems'
import LeaderboardModal from '@/components/LeaderboardModal'
import { vibrate } from '@/lib/haptics'
import { getXPProgress, MAX_LEVEL } from '@/lib/expeditionLevel'

type Phase = 'intro' | 'usedup' | 'descending' | 'fighting' | 'tide' | 'curse' | 'boon' | 'between' | 'reward' | 'dead'

type CashResult = Awaited<ReturnType<typeof cashOutGauntlet>>

const GOLD = '#f0c040'
const TEAL = '#5eead4'

// Davy Jones himself — the gauntlet's face. Drives both the intro centerpiece
// and the descent transition.
const MAW_IMG = '/davyjones.png'

function fmt(n: number) { return Math.round(n).toLocaleString() }

// The deep gets heavier the further you fall. RaidCombat's sky/water palette
// shifts with depth: murk (fog) → cold gloom (overcast) → the blood-dark
// bottom (sunset). Depth 12 also unlocks tier-2 Tides, so the dread palette
// lands exactly when the run turns truly dangerous.
function atmosphereForDepth(depth: number): 'fog' | 'overcast' | 'sunset' {
  if (depth >= 12) return 'sunset'
  if (depth >= 6) return 'overcast'
  return 'fog'
}

export interface GauntletGameProps {
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
  equippedItems: string[]
  classDamageMult: number
  classDoubloonMult: number
  shipClasses: Record<string, string>
  equippedRepairKit: string
  playerCharacterColor: string | null
  playerEquippedHat: string | null
  playerAvatarBg: string | null
  playerAvatarBorder: string | null
  raidMods: RaidMods
  /** Extra player cannonball slots from claimed Locker Upgrades. */
  bonusChargeSlots: number
  /** Claimed Locker Upgrade ids — drives the run-scoped perks (Diving Bell,
   *  Calm Before…). */
  gauntletUpgrades: string[]
  deepest: number
  /** Fathoms balance — the Gauntlet's meta-currency, spent in the Locker. */
  fathoms: number
  available: boolean
  /** ISO time the next run unlocks (cooldown), or null when available now. */
  nextAt: string | null
  /** Whether the player has seen the first-time explainer. */
  hasSeenIntro: boolean
  /** #1 deepest cashed-out descender across all captains, or null if none yet. */
  topDescender: { name: string; depth: number } | null
}

export default function GauntletGame(props: GauntletGameProps) {
  const router = useRouter()
  const shipFilter = props.equippedShipSkin ? getShipSkin(props.equippedShipSkin)?.filter ?? 'none' : 'none'
  // Diving Bell (Run Upgrade) lifts the player's max HP for the whole run; every
  // HP reference below uses this boosted ceiling rather than the raw stat.
  const hpMax = Math.round(props.playerHPMax * gauntletRunHpMult(props.gauntletUpgrades))

  const [phase, setPhase] = useState<Phase>(props.available ? 'intro' : 'usedup')
  const [starting, setStarting] = useState(false)
  // When the next run unlocks (cooldown). Set from props, or refreshed if a
  // start attempt races the cooldown.
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(props.nextAt)
  // Ticks the cooldown countdown on the locked screen (every 30s is plenty).
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (phase !== 'usedup') return
    const t = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(t)
  }, [phase])

  // Run state
  const [playerHP, setPlayerHP] = useState(hpMax)
  const [pot, setPot] = useState(0)
  const [bossesDefeated, setBossesDefeated] = useState(0)
  const [fight, setFight] = useState<GauntletFight | null>(null)
  const [activeTideEffects, setActiveTideEffects] = useState<TideEffect[]>([])
  const [usedAbilityIds, setUsedAbilityIds] = useState<Set<number>>(new Set())
  const [pendingTide, setPendingTide] = useState<TideEvent | null>(null)
  // Curses — the Locker's escalating, permanent run modifiers.
  const [activeCurses, setActiveCurses] = useState<GauntletCurse[]>([])
  const [pendingCurse, setPendingCurse] = useState<GauntletCurse | null>(null)
  const activeCursesRef = useRef<GauntletCurse[]>([])
  // Boons — drafted, stacking, the player's answer to the curses.
  const [activeBoons, setActiveBoons] = useState<GauntletBoon[]>([])
  const [pendingBoons, setPendingBoons] = useState<GauntletBoon[] | null>(null)
  // Tapped boon/curse on the breather screen → details popup.
  const [detailEffect, setDetailEffect] = useState<
    { kind: 'boon' | 'curse'; name: string; desc: string; detail: string; flavor: string; count: number } | null
  >(null)
  const [reward, setReward] = useState<CashResult | null>(null)
  const [resolving, setResolving] = useState(false)
  // Fathoms salvaged from a sunk run (the meta-currency still pays for the dive).
  const [deathFathoms, setDeathFathoms] = useState(0)
  // The Locker — two separate shops, each opened to its own section:
  // 'run' = perks for the descent itself, 'shore' = upgrades for the wider game.
  const [shopSection, setShopSection] = useState<'run' | 'shore' | null>(null)
  const [haulOpen, setHaulOpen] = useState(false)
  // First-timer explainer. Auto-opens once (server flag), reopenable via the
  // "How it works" link.
  const [introOpen, setIntroOpen] = useState(!props.hasSeenIntro)

  // Guardrail counters live in refs (read inside combat callbacks).
  const rollStateRef = useRef<GauntletRollState>({ cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 })
  const roundsSinceTideRef = useRef(0)
  const playerHPRef = useRef(hpMax)
  const potRef = useRef(0)
  // Lethal-save charges (Quartermaster's Anchor etc.) — a per-RUN pool that
  // survives the per-fight RaidCombat remounts, decremented when one fires.
  // Reset each run in begin().
  const anchorSavesLeftRef = useRef(
    getActiveEffects(props.equippedItems).filter(e => e.type === 'lethal_save').reduce((a, e) => a + e.value, 0),
  )
  // Extra cannonball slots from claimed Locker Upgrades. Seeded from the server
  // prop but kept in state so a purchase mid-session applies without a refresh.
  const [bonusSlots, setBonusSlots] = useState(props.bonusChargeSlots)

  // Body-scroll lock in installed PWA only, and ONLY during combat (keeps the
  // action buttons reachable — same reasoning as RaidGame). The meta screens
  // (intro/cooldown/between/reward/dead) are taller and must stay scrollable.
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return
    if (phase !== 'fighting' && phase !== 'tide') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [phase])

  function dismissIntro() {
    setIntroOpen(false)
    if (!props.hasSeenIntro) markGauntletIntroSeen().catch(() => {})
  }

  function begin() {
    if (starting) return
    setStarting(true)
    startGauntletRun().then(res => {
      if (!res.started) { if (res.nextAt) setCooldownUntil(res.nextAt); setPhase('usedup'); setStarting(false); return }
      // Fresh run.
      rollStateRef.current = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
      roundsSinceTideRef.current = 0
      playerHPRef.current = hpMax
      potRef.current = 0
      setPlayerHP(hpMax)
      setPot(0)
      setBossesDefeated(0)
      setActiveTideEffects([])
      setUsedAbilityIds(new Set())
      setActiveCurses([]); activeCursesRef.current = []
      setPendingCurse(null)
      setActiveBoons([]); setPendingBoons(null)
      anchorSavesLeftRef.current = getActiveEffects(props.equippedItems)
        .filter(e => e.type === 'lethal_save').reduce((a, e) => a + e.value, 0)
      setFight(generateFight(rollStateRef.current))
      setPhase('descending')
      setStarting(false)
    })
  }

  // The descent beat: a short fall-into-the-dark interstitial before each fight
  // so dropping deeper reads as a real plunge, not a hard cut. Fight is already
  // generated by the time we land here; we just hold the cut for a moment.
  useEffect(() => {
    if (phase !== 'descending') return
    // Hold longer on depths where Davy speaks, so his taunt is readable.
    const hasTaunt = fight ? davyTaunt(fight.depth) !== null : false
    const t = setTimeout(() => setPhase('fighting'), hasTaunt ? 3000 : 1350)
    return () => clearTimeout(t)
  }, [phase, fight])

  function handleEnemyDefeated(remainingHp: number) {
    const f = fight
    if (!f) return
    playerHPRef.current = remainingHp
    setPlayerHP(remainingHp)
    potRef.current += f.potContribution
    setPot(potRef.current)
    if (f.isBoss) setBossesDefeated(b => b + 1)

    rollStateRef.current = advanceRollState(rollStateRef.current, f)
    const clearedNow = rollStateRef.current.cleared

    // Expire one-shot ("next enemy") tide effects now that this fight ended,
    // so e.g. the half-health tide hits only the next ship, not every ship
    // for the rest of the run. Same rule the boss-raid host uses.
    setActiveTideEffects(expireAfterFight)

    // Crew/repair cooldown: abilities refresh every N cleared rounds.
    if (clearedNow % GAUNTLET_COOLDOWN_ROUNDS === 0) setUsedAbilityIds(new Set())

    // Curse milestone — descending INTO a CURSE_DEPTH imposes a new curse.
    // Takes priority over a tide this round so the two interstitials never
    // stack; the tide pity counter still ticks so recovery isn't starved.
    // Calm Before (Run Upgrade) pushes every curse one or more depths deeper.
    const nextDepth = clearedNow + 1
    if (CURSE_DEPTHS.includes(nextDepth - gauntletCurseDelay(props.gauntletUpgrades))) {
      const curse = drawCurse(activeCursesRef.current.map(c => c.id))
      if (curse) {
        roundsSinceTideRef.current += 1
        setPendingCurse(curse)
        setPhase('curse')
        return
      }
    }

    // Boon draft — descending past a BOON_DEPTH lets the player claim a power.
    // Offset from curse depths so the run alternates gift and toll; also takes
    // priority over a tide this round so interstitials never stack.
    if (BOON_DEPTHS.includes(nextDepth)) {
      roundsSinceTideRef.current += 1
      setPendingBoons(drawBoons(3))
      setPhase('boon')
      return
    }

    // Tide between rounds (guardrail pity floor).
    if (shouldFireTide({ roundsSinceTide: roundsSinceTideRef.current })) {
      roundsSinceTideRef.current = 0
      setPendingTide(drawGauntletTide(clearedNow, remainingHp, hpMax))
      setPhase('tide')
    } else {
      roundsSinceTideRef.current += 1
      setPhase('between')
    }
  }

  // Apply a freshly-imposed curse, then drop into the breather screen. Curse
  // effects ride the same active-effect channel the Tides use (they're
  // allRemaining, so they persist + apply for free).
  function applyCurse(curse: GauntletCurse) {
    const next = [...activeCursesRef.current, curse]
    activeCursesRef.current = next
    setActiveCurses(next)
    if (curse.effects && curse.effects.length > 0) {
      setActiveTideEffects(prev => [...prev, ...curse.effects!])
    }
    setPendingCurse(null)
    setPhase('between')
  }

  // Claim a drafted boon — its effect rides the active-effect channel (run-wide,
  // so it persists + stacks), then drop into the breather.
  function applyBoon(boon: GauntletBoon) {
    setActiveBoons(prev => [...prev, boon])
    setActiveTideEffects(prev => [...prev, boon.effect])
    setPendingBoons(null)
    setPhase('between')
  }

  function handlePlayerDefeated() {
    if (resolving) return
    setResolving(true)
    resolveGauntletDeath(rollStateRef.current.cleared).then(res => {
      if (res?.ok) setDeathFathoms(res.earnedFathoms)
    }).finally(() => {
      setResolving(false)
      setPhase('dead')
    })
  }

  function pushOn() {
    // Crushing Depth (and any future drain curse): the hull sheds a slice of
    // max HP before each new fight. Clamped to leave at least 1 — the curse
    // squeezes how deep you can go, but the sea never lands the kill itself.
    const drainPct = activeCursesRef.current.reduce((a, c) => a + (c.hpDrainPct ?? 0), 0)
    if (drainPct > 0) {
      const drained = Math.max(1, Math.round(playerHPRef.current - hpMax * drainPct))
      playerHPRef.current = drained
      setPlayerHP(drained)
    }
    setFight(generateFight(rollStateRef.current))
    setPhase('descending')
  }

  function cashOut() {
    if (resolving) return
    setResolving(true)
    cashOutGauntlet(rollStateRef.current.cleared, potRef.current).then(res => {
      setResolving(false)
      setReward(res)
      setPhase('reward')
      // NOTE: the purse tick (doubloons-changed / gems-changed) is deliberately
      // NOT fired here — it fires when the player cracks the chest open, so the
      // top purse counts up in sync with the chest reveal (see GauntletReward).
    })
  }

  // ── Intro ──────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto',
          padding: '6px 0.85rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          {/* Kicker + title */}
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.34em', color: TEAL, marginTop: 6 }}>
            The Endless Descent
          </p>
          <h1 className="font-cinzel font-800" style={{ fontSize: '1.95rem', color: '#f3ead2', lineHeight: 1.08, marginTop: 8, textShadow: '0 0 26px rgba(240,192,64,0.32)' }}>
            Davy Jones Gauntlet
          </h1>
          <p className="font-karla" style={{ fontSize: '0.82rem', color: '#9a948a', marginTop: 6 }}>
            One descent at a time. How deep do you dare?
          </p>

          {/* The maw — the hole you drop into */}
          <div style={{ position: 'relative', width: 196, height: 196, margin: '14px auto 4px' }}>
            <div style={{ position: 'absolute', inset: -26, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,192,64,0.26) 0%, rgba(94,234,212,0.12) 42%, transparent 70%)', animation: 'gauntPulse 4.2s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MAW_IMG} alt="" loading="eager" decoding="async"
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 10px 32px rgba(0,0,0,0.75))', animation: 'gauntDrift 6s ease-in-out infinite' }} />
          </div>

          {/* Deepest descent — the record to beat (Greater-Rift style) */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 6,
            padding: '0.45rem 1.1rem', borderRadius: 999,
            background: 'rgba(240,192,64,0.08)', border: `1px solid ${GOLD}3a`,
          }}>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.18em', color: '#9a948a' }}>Deepest Descent</span>
            <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: GOLD, lineHeight: 1 }}>
              {props.deepest > 0 ? `Depth ${props.deepest}` : 'Uncharted'}
            </span>
          </div>

          {/* The name to beat — #1 deepest cashed-out descender of all. */}
          {props.topDescender && (
            <p className="font-karla" style={{ fontSize: '0.7rem', color: '#9a948a', marginTop: 9 }}>
              Deepest of all captains: <span className="font-700" style={{ color: TEAL }}>{props.topDescender.name}</span>, Depth {props.topDescender.depth}
            </p>
          )}

          {/* Leaderboard — deepest cashed-out descent across all captains. */}
          <div style={{ marginTop: props.topDescender ? 6 : 9 }}>
            <LeaderboardModal boards={['gauntletDepth']} title="Deepest Descent" label="View the Ranks" />
          </div>

          {/* Descend — the start. Big and obvious. */}
          <button onClick={begin} disabled={starting} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{
              marginTop: 20, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem',
              color: GOLD, background: `linear-gradient(180deg, ${GOLD}2a, ${GOLD}10)`,
              border: `1px solid ${GOLD}70`, cursor: starting ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              boxShadow: `0 0 22px ${GOLD}22`,
              animation: starting ? 'none' : 'gauntCta 2.6s ease-in-out infinite',
            }}>
            {starting ? 'Diving…' : (
              <>Descend
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>
              </>
            )}
          </button>
          {GAUNTLET_COOLDOWN_HOURS > 0 && (
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a766e', marginTop: 8 }}>
              Each descent starts the {GAUNTLET_COOLDOWN_HOURS}-hour cooldown.
            </p>
          )}

          {/* Fathoms purse — the shop currency, sitting right above the shops. */}
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 7 }}>
            <span className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: TEAL, lineHeight: 1 }}>{fmt(props.fathoms)}</span>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.16em', color: '#8aa39e' }}>Fathoms to spend</span>
          </div>

          {/* Secondary doors: the rewards guide + the two Fathoms shops. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <ActionTile
              color={TEAL}
              onClick={() => setHaulOpen(true)}
              label="The Haul"
              line="What you earn"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 4 7a1.6 1.6 0 0 1 1.5-1h13A1.6 1.6 0 0 1 20 7l1 2.5" /><rect x="3" y="9.5" width="18" height="9.5" rx="1.6" /><path d="M3 13.2h18" /><rect x="10.5" y="11.4" width="3" height="3.6" rx="0.6" fill="currentColor" stroke="none" /></svg>}
            />
            <ActionTile
              color="#c4a0e8"
              onClick={() => setShopSection('run')}
              label="Run Upgrades"
              line="For the descent"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l6 6 6-6" /><path d="M6 12l6 6 6-6" /></svg>}
            />
            <ActionTile
              color={GOLD}
              onClick={() => setShopSection('shore')}
              label="Ship & Shore"
              line="Beyond the Gauntlet"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v15" /><path d="M5 11l7-4 7 4" /><path d="M4 14c1.6 2.5 4.5 4 8 4s6.4-1.5 8-4" /><path d="M9 5.5h6" /></svg>}
            />
          </div>

          <button onClick={() => setIntroOpen(true)} className="font-karla font-600 tap"
            style={{ marginTop: 14, background: 'none', border: 'none', color: '#8a8480', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            How it works
          </button>

          <BackLink router={router} label="Not today" />
        </div>
        {introOpen && <GauntletIntroModal onClose={dismissIntro} firstTime={!props.hasSeenIntro} />}
        {haulOpen && <HaulModal deepest={props.deepest} doubloonMult={props.classDoubloonMult} onClose={() => setHaulOpen(false)} />}
        {shopSection && <LockerUpgradesModal section={shopSection} onClose={() => setShopSection(null)} onClaimed={(owned) => setBonusSlots(bonusChargeSlots(owned))} />}
      </>
    )
  }

  if (phase === 'usedup') {
    const untilMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0
    const remMs = Math.max(0, untilMs - nowTick)
    const h = Math.floor(remMs / 3_600_000)
    const m = Math.floor((remMs % 3_600_000) / 60_000)
    const remLabel = h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`
    const ready = remMs <= 0
    return (
      <Shell>
        <Title sub={ready ? 'The deep is ready for you again.' : 'The Locker won’t take you again so soon.'}>
          {ready ? 'Back to the Brink' : 'Catch Your Breath'}
        </Title>
        <p className="font-karla" style={{ fontSize: '0.85rem', color: '#c9c3b8', lineHeight: 1.5 }}>
          {ready
            ? <>The sea has settled. Drop in again whenever you’re ready. Deepest so far: depth {props.deepest}.</>
            : <>You braved the Locker recently. Another descent unlocks in <strong style={{ color: '#e8c879' }}>{remLabel}</strong>. Deepest so far: depth {props.deepest}.</>
          }
        </p>
        {ready ? (
          <button
            onClick={begin}
            disabled={starting}
            className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 12, fontSize: '1rem', background: 'rgba(232,200,121,0.2)', border: '1px solid rgba(232,200,121,0.55)', color: '#e8c879', cursor: 'pointer' }}
          >
            {starting ? 'Descending…' : 'Descend Again →'}
          </button>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setShopSection('run')} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ flex: 1, padding: '0.8rem', borderRadius: 13, fontSize: '0.74rem', color: TEAL, background: `${TEAL}14`, border: `1px solid ${TEAL}55`, cursor: 'pointer' }}>
            Run Upgrades
          </button>
          <button onClick={() => setShopSection('shore')} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ flex: 1, padding: '0.8rem', borderRadius: 13, fontSize: '0.74rem', color: GOLD, background: `${GOLD}14`, border: `1px solid ${GOLD}55`, cursor: 'pointer' }}>
            Ship & Shore
          </button>
        </div>
        <BackLink router={router} label="Back to the map" primary={!ready} />
        {shopSection && <LockerUpgradesModal section={shopSection} onClose={() => setShopSection(null)} onClaimed={(owned) => setBonusSlots(bonusChargeSlots(owned))} />}
      </Shell>
    )
  }

  // ── Reward (cash out) ───────────────────────────────────────────────────
  if (phase === 'reward') {
    const r = reward
    if (!r || !r.ok) {
      return (
        <Shell>
          <Title sub="Nothing banked.">Run Over</Title>
          <BackLink router={router} label="Back to the map" primary />
        </Shell>
      )
    }
    return <GauntletReward r={r} onBack={() => router.push('/expeditions')} />
  }

  // ── Dead ────────────────────────────────────────────────────────────────
  if (phase === 'dead') {
    const cleared = rollStateRef.current.cleared
    const diedAt = cleared + 1
    const lost = potRef.current
    const newRecord = cleared > 0 && cleared > props.deepest
    const best = Math.max(cleared, props.deepest)
    const CRIMSON = '#ef4444'
    return (
      <>
        <AbyssBackdrop />
        {/* Crimson death wash bleeding up from the deep, over the abyss. */}
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 120% 75% at 50% 112%, ${CRIMSON}24 0%, ${CRIMSON}10 34%, transparent 66%)` }} />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '10px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          {/* Davy claims it — drowned, looming, sinking in from above. */}
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: 188, height: 188, margin: '14px auto 2px' }}
          >
            <div style={{ position: 'absolute', inset: -22, borderRadius: '50%', background: `radial-gradient(circle, ${CRIMSON}30 0%, rgba(120,20,20,0.14) 42%, transparent 70%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img src={MAW_IMG} alt="" loading="eager" decoding="async"
              animate={{ y: [0, -5, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `${DROWNED_FILTER} drop-shadow(0 10px 30px rgba(0,0,0,0.8)) drop-shadow(0 0 22px ${CRIMSON}40)` }} />
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: CRIMSON }}>
            The Locker Takes It
          </motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.24, type: 'spring', stiffness: 240, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '1.95rem', color: '#f3d6d6', lineHeight: 1.08, marginTop: 6, textShadow: `0 0 26px ${CRIMSON}3a` }}>
            You Sank
          </motion.h1>
          <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 6 }}>
            Dragged under at depth {diedAt} · {cleared} {cleared === 1 ? 'round' : 'rounds'} deep
          </p>

          {/* The pot lost — the cost of pushing too far. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.4 }}
            style={{ marginTop: 16, padding: '1rem 1rem 0.95rem', borderRadius: 16, background: `radial-gradient(ellipse at 50% 0%, ${CRIMSON}14 0%, rgba(8,13,22,0.5) 74%)`, border: `1px solid ${CRIMSON}40`, boxShadow: `inset 0 0 24px ${CRIMSON}0e, 0 14px 40px rgba(0,0,0,0.45)` }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: `${CRIMSON}cc` }}>Gone to the Deep</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#e08a8a', lineHeight: 1.05, marginTop: 5, textShadow: `0 0 18px ${CRIMSON}33` }}>
              {fmt(lost)} <span style={{ fontSize: '1.1rem' }}>⟡</span>
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a8480', marginTop: 4 }}>
              and as much Nav XP, sunk with your ship.
            </p>
          </motion.div>

          {/* Silver lining — depth still counts. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ marginTop: 14 }}>
            {newRecord ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.4rem 0.9rem', borderRadius: 999, background: `${TEAL}14`, border: `1px solid ${TEAL}55` }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>
                <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: TEAL }}>New deepest — depth {cleared}</span>
              </div>
            ) : (
              <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#7a766e' }}>Deepest run: depth {best}</p>
            )}
            {deathFathoms > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '0.36rem 0.85rem', borderRadius: 999, background: `${TEAL}0e`, border: `1px solid ${TEAL}3a` }}>
                <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8aa39e' }}>Salvaged</span>
                <span className="font-cinzel font-800" style={{ fontSize: '0.85rem', color: TEAL }}>+{fmt(deathFathoms)} Fathoms</span>
              </div>
            )}
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8480', marginTop: 8, lineHeight: 1.45 }}>
              The pot is lost, but how deep you reached is not. The Fathoms you earned and any depth unlocks you tore loose are yours to keep.
            </p>
          </motion.div>

          <div style={{ marginTop: 22 }}>
            <BackLink router={router} label="Back to the map" primary />
          </div>
        </div>
      </>
    )
  }

  // ── Between rounds: cash out or push on ──────────────────────────────────
  if (phase === 'between') {
    const cleared = rollStateRef.current.cleared
    const nextDepth = cleared + 1
    const chest = chestForDepth(cleared)
    const previewDoubloons = Math.round(pot * chest.potMult * props.classDoubloonMult)
    const previewXp = Math.round(pot * chest.potMult)
    const hpPct = Math.max(0, Math.min(100, Math.round((playerHP / hpMax) * 100)))
    const hpColor = hpPct < 30 ? '#f87171' : hpPct < 60 ? GOLD : '#4ade80'
    const band = bandForDepth(cleared)
    const boonCounts = Object.values(activeBoons.reduce<Record<string, { boon: GauntletBoon; n: number }>>((acc, b) => {
      acc[b.id] = { boon: b, n: (acc[b.id]?.n ?? 0) + 1 }
      return acc
    }, {}))
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '10px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: TEAL, marginTop: 12 }}>
            Catch Your Breath
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#cfc9bf', marginTop: 7 }}>
            {cleared} {cleared === 1 ? 'round' : 'rounds'} deep · {band.name}
          </p>

          {/* The haul on the line — the push-your-luck centerpiece. */}
          <div style={{
            marginTop: 16, padding: '1.15rem 1rem 1.05rem', borderRadius: 18,
            background: `radial-gradient(ellipse at 50% 0%, ${GOLD}1c 0%, rgba(8,13,22,0.55) 74%)`,
            border: `1px solid ${GOLD}40`,
            boxShadow: `inset 0 0 28px ${GOLD}10, 0 14px 40px rgba(0,0,0,0.45)`,
          }}>
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: `${GOLD}aa` }}>
              The Haul on the Line
            </p>
            <p className="font-cinzel font-800" style={{ fontSize: '2.15rem', color: GOLD, lineHeight: 1.05, marginTop: 5, textShadow: `0 0 26px ${GOLD}44` }}>
              {fmt(previewDoubloons)} <span style={{ fontSize: '1.35rem' }}>⟡</span>
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#9a948a', marginTop: 6 }}>
              +{fmt(previewXp)} Nav XP{chest.gems > 0 ? ` · +${chest.gems} ◆` : ''} · {chest.label}{chest.potMult > 1 ? ` ×${chest.potMult}` : ''}
            </p>
          </div>

          {/* Hull bar */}
          <div style={{ marginTop: 14, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#8a8880' }}>Hull</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: hpColor }}>{playerHP} / {hpMax}</span>
            </div>
            <div style={{ height: 9, borderRadius: 5, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <motion.div initial={{ width: `${hpPct}%` }} animate={{ width: `${hpPct}%` }} transition={{ duration: 0.4 }}
                style={{ height: '100%', background: `linear-gradient(90deg, ${hpColor}aa, ${hpColor})`, boxShadow: `0 0 8px ${hpColor}88` }} />
            </div>
          </div>

          {/* Powers + Curses tallies — each chip taps to a plain-English detail. */}
          {(boonCounts.length > 0 || activeCurses.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14, textAlign: 'left' }}>
              {boonCounts.length > 0 && (
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: TEAL, marginBottom: 5 }}>
                    Powers Claimed · {activeBoons.length} <span style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: 0 }}>· tap for details</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {boonCounts.map(({ boon, n }) => (
                      <button key={boon.id} className="font-karla font-700 tap"
                        onClick={() => setDetailEffect({ kind: 'boon', name: boon.name, desc: boon.desc, detail: boon.detail, flavor: boon.flavor, count: n })}
                        style={{ cursor: 'pointer', fontSize: '0.58rem', padding: '0.2rem 0.55rem', borderRadius: 999, background: `${TEAL}14`, border: `1px solid ${TEAL}3a`, color: '#aef3e6' }}>
                        {boon.name}{n > 1 ? ` ×${n}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {activeCurses.length > 0 && (
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#f87171', marginBottom: 5 }}>
                    The Locker&rsquo;s Curses · {activeCurses.length} <span style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: 0 }}>· tap for details</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {activeCurses.map(c => (
                      <button key={c.id} className="font-karla font-700 tap"
                        onClick={() => setDetailEffect({ kind: 'curse', name: c.name, desc: c.desc, detail: c.detail, flavor: c.flavor, count: 1 })}
                        style={{ cursor: 'pointer', fontSize: '0.58rem', padding: '0.2rem 0.55rem', borderRadius: 999, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.38)', color: '#fca5a5' }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* The fork */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            <button onClick={cashOut} disabled={resolving} className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
              style={{ width: '100%', padding: '1rem', borderRadius: 14, fontSize: '1rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`, border: `1px solid ${GOLD}66`, cursor: resolving ? 'wait' : 'pointer', boxShadow: `0 0 20px ${GOLD}1f` }}>
              {resolving ? '…' : `Haul Up · ${fmt(previewDoubloons)} ⟡`}
            </button>
            <button onClick={pushOn} disabled={resolving} className="font-cinzel font-700 uppercase tracking-[0.06em] tap"
              style={{ width: '100%', padding: '0.95rem', borderRadius: 14, fontSize: '1rem', background: `${TEAL}1c`, border: `1px solid ${TEAL}66`, color: TEAL, cursor: resolving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Push On to Depth {nextDepth}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#7a766e', marginTop: 2 }}>
              Push on and the whole haul sinks with you if your ship goes down.
            </p>
          </div>
        </div>

        {/* Detail popup — plain-English explanation of a tapped power / curse. */}
        <AnimatePresence>
          {detailEffect && (() => {
            const isBoon = detailEffect.kind === 'boon'
            const accent = isBoon ? TEAL : '#f87171'
            const fg = isBoon ? '#aef3e6' : '#fca5a5'
            return (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                onClick={() => setDetailEffect(null)}
                style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
               <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
                <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: '1.2rem 1.15rem 1.1rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${accent}55`, boxShadow: `0 0 44px ${accent}22, 0 18px 50px rgba(0,0,0,0.6)` }}>
                  <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.5rem', color: `${accent}cc` }}>
                    {isBoon ? 'Your Power' : 'The Locker’s Curse'}
                  </p>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: '#f5f2ec', lineHeight: 1.15, marginTop: 5 }}>
                    {detailEffect.name}{detailEffect.count > 1 ? <span style={{ color: accent }}> ×{detailEffect.count}</span> : null}
                  </p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '0.3rem 0.8rem', borderRadius: 999, background: `${accent}1c`, border: `1px solid ${accent}55` }}>
                    <span aria-hidden style={{ fontSize: '0.68rem', color: accent }}>{isBoon ? '▲' : '▼'}</span>
                    <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: fg }}>{detailEffect.desc}</span>
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'rgba(245,242,236,0.82)', marginTop: 12 }}>
                    {detailEffect.detail}
                  </p>
                  {detailEffect.count > 1 && (
                    <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: accent, marginTop: 8 }}>
                      You hold {detailEffect.count} of these, and the effect stacks.
                    </p>
                  )}
                  <p className="font-karla" style={{ fontSize: '0.74rem', fontStyle: 'italic', color: 'rgba(245,242,236,0.5)', lineHeight: 1.5, marginTop: 12 }}>
                    {detailEffect.flavor}
                  </p>
                  <button onClick={() => setDetailEffect(null)} className="font-karla font-700 uppercase tracking-[0.1em] tap"
                    style={{ marginTop: 16, width: '100%', padding: '0.75rem', borderRadius: 12, fontSize: '0.72rem', background: `${accent}1c`, border: `1px solid ${accent}55`, color: fg, cursor: 'pointer' }}>
                    Got It
                  </button>
                </motion.div>
               </div>
              </motion.div>
            )
          })()}
        </AnimatePresence>
      </>
    )
  }

  // ── Tide interstitial ────────────────────────────────────────────────────
  if (phase === 'tide' && pendingTide) {
    return (
      <TideModal
          tide={pendingTide}
          onPicked={(choice: TideChoice) => {
            let healDelta = 0
            let fullHealTriggered = false
            const persisted: TideEffect[] = []
            for (const e of choice.effects) {
              if (e.kind === 'instantHeal') healDelta += e.n
              else if (e.kind === 'fullHeal') fullHealTriggered = true
              else if (e.kind === 'doubloonsAtRaidEnd') { potRef.current = Math.max(0, potRef.current + e.n); setPot(potRef.current) }
              else persisted.push(e)
            }
            if (fullHealTriggered) { playerHPRef.current = hpMax; setPlayerHP(hpMax) }
            else if (healDelta !== 0) {
              const next = Math.min(hpMax, Math.max(0, playerHPRef.current + healDelta))
              playerHPRef.current = next; setPlayerHP(next)
            }
            if (persisted.length > 0) setActiveTideEffects(prev => [...prev, ...persisted])
            setPendingTide(null)
            setPhase('between')
          }}
        />
    )
  }

  // ── Curse interstitial — the Locker imposes a permanent run modifier ────────
  if (phase === 'curse' && pendingCurse) {
    const c = pendingCurse
    const CRIM = '#f87171'
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '8px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.32em', color: CRIM, marginTop: 14 }}>
            The Locker Curses You
          </p>

          {/* Crimson sigil */}
          <div style={{ position: 'relative', width: 124, height: 124, margin: '16px auto 6px' }}>
            <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', background: `radial-gradient(circle, ${CRIM}33 0%, transparent 68%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
            <svg width="124" height="124" viewBox="0 0 24 24" fill={CRIM} style={{ position: 'relative', filter: `drop-shadow(0 6px 22px ${CRIM}55)` }} aria-hidden>
              <path d="M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.2 2.8 5.4.4.3.7.8.7 1.3V18a1.6 1.6 0 0 0 1.6 1.6h.4l.5-1.6h-1l-.4-1.4h1.6L11 18l.5 1.6h1L13 18l.4-1.4H15l-.4 1.4h-1l.5 1.6h.4A1.6 1.6 0 0 0 16.1 18v-1.3c0-.5.3-1 .7-1.3C18.4 14.2 20 12.5 20 10a8 8 0 0 0-8-8Z" />
              <circle cx="9" cy="10.5" r="1.7" fill="#0a0e16" />
              <circle cx="15" cy="10.5" r="1.7" fill="#0a0e16" />
            </svg>
          </div>

          <h1 className="font-cinzel font-800" style={{ fontSize: '1.85rem', color: '#fdecec', lineHeight: 1.08, marginTop: 6, textShadow: `0 0 24px ${CRIM}44` }}>
            {c.name}
          </h1>
          {/* What it actually does, in plain words — the headline, not buried in flavor. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '0.32rem 0.85rem', borderRadius: 999, background: `${CRIM}1c`, border: `1px solid ${CRIM}55` }}>
            <span aria-hidden style={{ fontSize: '0.7rem', color: CRIM }}>▼</span>
            <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#fca5a5' }}>{c.desc}</span>
          </div>
          <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'rgba(253,236,236,0.7)', marginTop: 12, padding: '0 0.4rem' }}>
            {c.detail}
          </p>
          <p className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(253,236,236,0.5)', fontStyle: 'italic', marginTop: 10, padding: '0 0.4rem' }}>
            {c.flavor}
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#9a948a', marginTop: 12 }}>
            It holds for the rest of the descent. {activeCurses.length + 1} {activeCurses.length === 0 ? 'curse' : 'curses'} now upon you.
          </p>

          <button onClick={() => applyCurse(c)} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{
              marginTop: 22, width: '100%', padding: '1.02rem', borderRadius: 14, fontSize: '1.02rem',
              color: CRIM, background: `linear-gradient(180deg, ${CRIM}26, ${CRIM}0f)`,
              border: `1px solid ${CRIM}66`, cursor: 'pointer',
              boxShadow: `0 0 20px ${CRIM}1f`,
            }}>
            Bear It · Descend
          </button>
        </div>
      </>
    )
  }

  // ── Boon draft — claim one of three powers ──────────────────────────────────
  if (phase === 'boon' && pendingBoons) {
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto',
          padding: '8px 0.85rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.32em', color: TEAL, marginTop: 14 }}>
            A Gift From the Deep
          </p>
          <h1 className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#eafffb', lineHeight: 1.1, marginTop: 8, textShadow: `0 0 22px ${TEAL}33` }}>
            Claim a Power
          </h1>
          <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 6, marginBottom: 16 }}>
            It holds for the rest of the descent. Stack it to go deeper.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingBoons.map((b, idx) => {
              const owned = activeBoons.filter(x => x.id === b.id).length
              return (
                <motion.button
                  key={b.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.08, duration: 0.3 }}
                  whileTap={{ scale: 0.975 }}
                  onClick={() => applyBoon(b)}
                  className="tap"
                  style={{
                    position: 'relative', textAlign: 'left',
                    padding: '0.85rem 0.95rem 0.85rem 1.05rem', borderRadius: 13,
                    background: `linear-gradient(180deg, ${TEAL}12, rgba(255,255,255,0.012))`,
                    border: `1px solid ${TEAL}38`, color: '#e7f6f2', cursor: 'pointer', overflow: 'hidden',
                  }}
                >
                  <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${TEAL}, ${TEAL}33)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p className="font-cinzel font-700" style={{ flex: 1, fontSize: '0.98rem', color: '#aef3e6', lineHeight: 1.2 }}>{b.name}</p>
                    {owned > 0 && (
                      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: `${TEAL}cc`, background: `${TEAL}1c`, border: `1px solid ${TEAL}44`, borderRadius: 999, padding: '0.12rem 0.4rem' }}>
                        Owned ×{owned}
                      </span>
                    )}
                    <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.6rem', padding: '0.18rem 0.5rem', borderRadius: 999, background: 'rgba(74,222,128,0.13)', border: '1px solid rgba(74,222,128,0.42)', color: '#86efac', whiteSpace: 'nowrap' }}>
                      ▲ {b.desc}
                    </span>
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(231,246,242,0.66)', lineHeight: 1.45, fontStyle: 'italic' }}>
                    {b.flavor}
                  </p>
                </motion.button>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // ── Descent transition ─────────────────────────────────────────────────────
  if (phase === 'descending') {
    const d = fight?.depth ?? 1
    const band = bandForDepth(d)
    const taunt = davyTaunt(d)
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, minHeight: '60vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '2rem 1rem',
        }}>
          <motion.div initial={{ opacity: 0, y: -22, scale: 0.86 }} animate={{ opacity: 0.92, y: 0, scale: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MAW_IMG} alt="" loading="eager" decoding="async"
              style={{ width: 104, height: 104, objectFit: 'contain', filter: 'drop-shadow(0 8px 26px rgba(0,0,0,0.7))' }} />
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.4 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.34em', color: TEAL, marginTop: 16 }}>
            {d === 1 ? 'Into the Locker' : 'Deeper Still'}
          </motion.p>
          <motion.p initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 230, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '2.4rem', color: GOLD, lineHeight: 1, marginTop: 8, textShadow: '0 0 28px rgba(240,192,64,0.4)' }}>
            Depth {d}
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.45 }}
            className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#cfc9bf', marginTop: 7, letterSpacing: '0.02em' }}>
            {band.name}
          </motion.p>
          {taunt && (
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}
              className="font-karla" style={{ maxWidth: 320, fontSize: '0.78rem', fontStyle: 'italic', color: 'rgba(94,234,212,0.82)', lineHeight: 1.5, marginTop: 16 }}>
              &ldquo;{taunt}&rdquo;
              <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ display: 'block', fontSize: '0.5rem', color: 'rgba(94,234,212,0.5)', marginTop: 6 }}>Davy Jones</span>
            </motion.p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 18 }}>
            {[0, 1, 2].map(i => (
              <motion.svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                initial={{ opacity: 0.12 }} animate={{ opacity: [0.12, 0.85, 0.12] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}>
                <path d="M6 9l6 6 6-6" />
              </motion.svg>
            ))}
          </div>
        </div>
      </>
    )
  }

  // ── Fighting ──────────────────────────────────────────────────────────────
  if (phase === 'fighting' && fight) {
    return (
      <div className="raid-combat-region flex flex-col items-center gap-2 select-none"
        style={{ userSelect: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)' }}>
        <div style={{ width: '100%', flexShrink: 0, marginBottom: 2 }}>
          <DepthBar depth={fight.depth} pot={pot} isBoss={fight.isBoss} isElite={fight.isElite} affixName={fight.affix?.name} curses={activeCurses.length} />
        </div>
        <div style={{ width: '100%' }}>
          <RaidCombat
            key={`gauntlet-r${fight.depth}`}
            enemy={fight.enemy}
            atmosphere={atmosphereForDepth(fight.depth)}
            enemyArtFilter={DROWNED_FILTER}
            bonusChargeSlots={bonusSlots}
            anchorSaveAvailable={anchorSavesLeftRef.current > 0}
            onAnchorSave={() => { anchorSavesLeftRef.current = Math.max(0, anchorSavesLeftRef.current - 1) }}
            affix={fight.affix}
            isElite={fight.isElite}
            isBoss={fight.isBoss}
            shipImageUrl={props.shipImageUrl}
            shipFilter={shipFilter}
            shipName={props.shipName}
            playerLabel={props.username ?? props.shipName}
            playerCharacterColor={props.playerCharacterColor}
            playerEquippedHat={props.playerEquippedHat}
            playerAvatarBg={props.playerAvatarBg}
            playerAvatarBorder={props.playerAvatarBorder}
            playerHpMax={hpMax}
            playerHp={playerHP}
            shipMinDamage={props.shipMinDamage}
            shipSpeed={props.shipSpeed}
            totalPower={props.totalPower}
            totalNavigation={props.totalDodge}
            totalFortune={props.totalFortune}
            equippedRaidItems={props.equippedItems}
            classDamageMult={props.classDamageMult}
            shipClasses={props.shipClasses}
            equippedRepairKit={props.equippedRepairKit}
            onEnemyDefeated={handleEnemyDefeated}
            onPlayerDefeated={handlePlayerDefeated}
            onLeave={() => { resolveGauntletDeath(rollStateRef.current.cleared).finally(() => router.push('/expeditions')) }}
            raidMods={props.raidMods}
            tideEffects={activeTideEffects}
            crewMembers={props.crewMembers}
            usedAbilityIds={usedAbilityIds}
            onAbilityFired={(crewId) => setUsedAbilityIds(prev => {
              if (prev.has(crewId)) return prev
              const next = new Set(prev); next.add(crewId); return next
            })}
            usedAbilitySub="Used — back soon."
            openingNote={fight.depth > 1 && (fight.depth - 1) % GAUNTLET_COOLDOWN_ROUNDS === 0 ? 'Your crew catch their breath. Abilities refreshed.' : undefined}
          />
        </div>
      </div>
    )
  }

  return null
}

// ── Tide draw with low-HP heal weighting ──────────────────────────────────────
function drawGauntletTide(depth: number, hp: number, hpMax: number): TideEvent {
  const maxTier = depth >= 12 ? 2 : 1
  const candidates = drawTides(4, maxTier as 1 | 2)
  const lowHp = hp / hpMax < TIDE_HEAL_HP_PCT
  if (lowHp) {
    const healing = candidates.filter(t =>
      t.choices.some(c => c.effects.some(e => e.kind === 'instantHeal' || e.kind === 'fullHeal' || e.kind === 'startOfFightHeal')))
    if (healing.length > 0) return healing[Math.floor(Math.random() * healing.length)]
  }
  return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0]
}

// ── Cash-out chest reveal ─────────────────────────────────────────────────────
// Hauling up is the payoff of the whole push-your-luck loop, so it gets a real
// chest-opening moment: the depth-tiered crate sits closed, you tap to crack it,
// a burst of light + haptic + SFX fires, and the haul counts up out of it.
type RewardOk = Extract<CashResult, { ok: true }>

// One chest sprite for the whole Locker (Davy's chest); the tiers are told
// apart by the reveal EFFECTS, not the art — `color` tints the glow/rays and
// the tier number drives how big the burst gets (see ChestOpenFx).
const DAVY_CHEST = { closed: '/davychestclosed.png', open: '/davychestopen.png' }
const CHEST_ART: Record<number, { closed: string; open: string; color: string }> = {
  1: { ...DAVY_CHEST, color: '#c08a4e' },
  2: { ...DAVY_CHEST, color: '#9fb0bf' },
  3: { ...DAVY_CHEST, color: '#f0c040' },
  4: { ...DAVY_CHEST, color: '#7fdce8' },
  5: { ...DAVY_CHEST, color: '#a78bfa' },
}

// rAF count-up for the reward numbers (easeOutCubic). Holds at 0 until `run`
// flips true, so the chest can reveal first and THEN the numbers tick up.
function CountUp({ to, dur = 850, run = true }: { to: number; dur?: number; run?: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run || to <= 0) { setN(0); return }
    let raf = 0, start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / dur)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, dur, run])
  return <>{n.toLocaleString()}</>
}

function RewardLine({ label, to, suffix = '', color, delay, run }: { label: string; to: number; suffix?: string; color: string; delay: number; run: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.45rem 0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#9a948a' }}>{label}</span>
      <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', color }}>+<CountUp to={to} run={run} />{suffix}</span>
    </motion.div>
  )
}

// Tier-scaled chest-open effect. Same chest sprite at every tier; the richer
// chests open louder — more mote spray, rotating light rays from tier 2, and a
// second shock ring from tier 4. Deterministic (no random) so it reads the same
// every haul. Sits absolutely inside the 200x200 chest box.
function ChestOpenFx({ tier, color }: { tier: number; color: string }) {
  const count = tier * 4
  const motes = Array.from({ length: count }, (_, n) => {
    const ang = (Math.PI * 2 * n) / count + (n % 2) * 0.32
    const dist = 64 + (n % 4) * 18
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, size: 3 + (n % 3), dur: 0.6 + (n % 4) * 0.1, delay: (n % 3) * 0.04 }
  })
  return (
    <>
      {/* Rotating rays — appear from tier 2, brighter/denser up the ladder */}
      {tier >= 2 && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
          animate={{ opacity: [0, Math.min(0.7, 0.32 + tier * 0.09), 0], scale: 1.5, rotate: 80 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: -34, borderRadius: '50%', pointerEvents: 'none', mixBlendMode: 'screen',
            background: `conic-gradient(from 0deg, ${color}00, ${color}66, ${color}00, ${color}66, ${color}00, ${color}66, ${color}00${tier >= 4 ? `, ${color}66, ${color}00, ${color}66, ${color}00` : ''})`,
          }}
        />
      )}
      {/* Mote spray — count scales with tier */}
      {motes.map((m, n) => (
        <motion.div
          key={n}
          aria-hidden
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: m.x, y: m.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: m.dur, delay: m.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: m.size, height: m.size, marginLeft: -m.size / 2, marginTop: -m.size / 2, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, pointerEvents: 'none' }}
        />
      ))}
      {/* Second shock ring — only the richest chests (tier 4-5) */}
      {tier >= 4 && (
        <motion.div
          aria-hidden
          initial={{ scale: 0.3, opacity: 0.85 }}
          animate={{ scale: 2.7, opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.12, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 24px ${color}`, pointerEvents: 'none' }}
        />
      )}
    </>
  )
}

// How long the chest "reveals" before the haul starts ticking into your purse.
const REVEAL_DELAY = 900

function GauntletReward({ r, onBack }: { r: RewardOk; onBack: () => void }) {
  const [opened, setOpened] = useState(false)
  // Counting starts a beat AFTER opening: chest cracks + reveals, then the
  // doubloons / XP increment (count-up + purse tick + bar fill).
  const [counting, setCounting] = useState(false)
  const art = CHEST_ART[r.chest.tier] ?? CHEST_ART[1]
  const newBest = r.depth >= r.deepest

  // Nav level + XP bar — the banked XP visibly flows into the bar as the chest
  // opens. Old XP is derived (new total minus this haul's gain).
  const oldXp = Math.max(0, r.newExpeditionXP - r.bankedXp)
  const oldProg = getXPProgress(oldXp)
  const newProg = getXPProgress(r.newExpeditionXP)
  const leveledUp = newProg.level > oldProg.level
  const barEnd = newProg.level >= MAX_LEVEL ? 1 : newProg.progress
  // Bar fill: before counting it sits at the pre-haul progress. On counting it
  // sweeps forward; on a level-up it fills the old level to full, snaps to
  // empty, then fills into the new level (so it never visually runs backwards).
  const barAnimate = !counting
    ? { width: `${Math.round(oldProg.progress * 100)}%` }
    : leveledUp
      ? { width: [`${Math.round(oldProg.progress * 100)}%`, '100%', '0%', `${Math.round(barEnd * 100)}%`] }
      : { width: `${Math.round(barEnd * 100)}%` }
  const barTransition = counting && leveledUp
    ? { duration: 1.7, times: [0, 0.4, 0.42, 1], ease: 'easeOut' as const }
    : { duration: 1, ease: 'easeOut' as const }

  function open() {
    if (opened) return
    setOpened(true)
    const grand = r.chest.tier >= 4    // the richest chests open louder
    vibrate(grand ? [0, 40, 35, 70, 35, 95] : [0, 30, 55, 45])
    import('@/lib/fishingMusic').then(m => m.playChestSfx(grand)).catch(() => {})
    // Let the chest reveal first, THEN start everything incrementing: the
    // count-ups, the purse tick (the Nav listens for these), and the XP bar.
    window.setTimeout(() => {
      setCounting(true)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      if (r.gems > 0) window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.newGems }))
      // A second haptic punch when the bar reaches the new level.
      if (leveledUp) window.setTimeout(() => vibrate([0, 45, 70, 45]), 1000)
    }, REVEAL_DELAY)
  }

  return (
    <>
      <AbyssBackdrop />
      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
        padding: '10px 0.95rem', textAlign: 'center',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
      }}>
        {!opened ? (
          <>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.3em', color: TEAL, marginTop: 16 }}>
              You Climbed Back Into the Light
            </p>
            <div style={{ position: 'relative', width: 200, height: 200, margin: '20px auto 6px' }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}33 0%, transparent 68%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src={art.closed} alt="" loading="eager" decoding="async"
                animate={{ y: [0, -6, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 26px ${art.color}44)` }} />
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: art.color, lineHeight: 1.1, marginTop: 4, textShadow: `0 0 22px ${art.color}44` }}>
              {r.chest.label}
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a948a', marginTop: 5 }}>
              Hauled up from depth {r.depth}{r.chest.potMult > 1 ? ` · ×${r.chest.potMult} haul` : ''}
            </p>
            <button onClick={open} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
              style={{ marginTop: 24, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`, border: `1px solid ${GOLD}66`, cursor: 'pointer', boxShadow: `0 0 20px ${GOLD}1f` }}>
              Crack It Open
            </button>
          </>
        ) : (
          <>
            <div style={{ position: 'relative', width: 200, height: 200, margin: '16px auto 4px' }}>
              {/* Burst of light on open — bigger for the richer chests */}
              <motion.div aria-hidden initial={{ scale: 0.2, opacity: 0.85 }} animate={{ scale: 2.4 + r.chest.tier * 0.4, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}cc 0%, ${art.color}33 35%, transparent 70%)` }} />
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}33 0%, transparent 68%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
              {/* Tier-scaled spray / rays / shock ring */}
              <ChestOpenFx tier={r.chest.tier} color={art.color} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src={art.open} alt="" loading="eager" decoding="async"
                initial={{ scale: 0.55 }} animate={{ scale: [0.55, 1.16, 1] }} transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 30px ${art.color}66)` }} />
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: TEAL }}>
              Hauled Up
            </motion.p>
            <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 240, damping: 18 }}
              className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: art.color, lineHeight: 1.1, marginTop: 4, textShadow: `0 0 22px ${art.color}44` }}>
              {r.chest.label}
            </motion.p>

            <div style={{ marginTop: 16, textAlign: 'left', background: 'rgba(0,0,0,0.3)', border: `1px solid ${GOLD}26`, borderRadius: 14, padding: '0.5rem 0.85rem 0.7rem' }}>
              <RewardLine label="Doubloons" to={r.bankedDoubloons} suffix=" ⟡" color={GOLD} delay={0.2} run={counting} />
              <RewardLine label="Nav XP" to={r.bankedXp} color="#4ade80" delay={0.32} run={counting} />
              {r.gems > 0 && <RewardLine label="Gems" to={r.gems} suffix=" ◆" color="#a78bfa" delay={0.44} run={counting} />}
              {r.earnedFathoms > 0 && <RewardLine label="Fathoms" to={r.earnedFathoms} suffix=" Fathoms" color={TEAL} delay={0.56} run={counting} />}
            </div>

            {/* Nav level + XP bar — the banked Nav XP flows into the bar as the
                chest opens, and the level pops if you crossed one. */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.35 }}
              style={{ marginTop: 14, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#7fa8d8' }}>Navigation</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  {leveledUp && counting && (
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 320, damping: 16 }}
                      className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#cfe2ff', background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.55)', borderRadius: 999, padding: '0.12rem 0.45rem', boxShadow: '0 0 12px rgba(96,165,250,0.35)' }}>
                      Level Up · {oldProg.level} → {newProg.level}
                    </motion.span>
                  )}
                  <span className="font-cinzel font-800" style={{ fontSize: '0.85rem', color: '#cfe2ff' }}>Lv {counting ? newProg.level : oldProg.level}</span>
                </div>
              </div>
              <div style={{ height: 9, borderRadius: 5, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <motion.div initial={{ width: `${Math.round(oldProg.progress * 100)}%` }} animate={barAnimate} transition={barTransition}
                  style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', boxShadow: '0 0 8px rgba(96,165,250,0.7)' }} />
              </div>
              <p className="font-karla" style={{ fontSize: '0.56rem', color: '#7a766e', marginTop: 4 }}>
                {newProg.level >= MAX_LEVEL ? 'Max level' : counting ? `${Math.round(newProg.progress * 100)}% to Lv ${newProg.level + 1}` : `${Math.round(oldProg.progress * 100)}% to Lv ${oldProg.level + 1}`}
              </p>
            </motion.div>

            {newBest && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: TEAL, marginTop: 12 }}>
                New deepest descent — depth {r.depth}.
              </motion.p>
            )}

            {/* Davy cannon chest drops — the rare chase. */}
            {r.droppedItems.map((id, i) => {
              const item = getRaidItem(id)
              if (!item) return null
              return (
                <motion.div key={id} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 12, background: 'rgba(232,200,121,0.10)', border: '1px solid rgba(232,200,121,0.55)', boxShadow: '0 0 22px rgba(232,200,121,0.18)' }}>
                  {item.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={item.image} alt="" style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }} />
                    : null}
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#e8c879' }}>Rare drop · equip from Manage Ship</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f5ecd6', lineHeight: 1.1 }}>{item.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#b0aaa0', lineHeight: 1.35, marginTop: 1 }}>{item.description}</p>
                  </div>
                </motion.div>
              )
            })}

            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              onClick={onBack} className="font-karla font-600 tap"
              style={{ marginTop: 18, width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfc9bf', cursor: 'pointer' }}>
              Back to the map
            </motion.button>
          </>
        )}
      </div>
    </>
  )
}

// ── Modal scrim ───────────────────────────────────────────────────────────────
// One backdrop for the popup modals. PORTALED to <body> so it escapes any
// transformed ancestor (PageTransition / Nav) — otherwise `position: fixed`
// anchors to that ancestor instead of the viewport and the overflow scroll
// can't reach the bottom (see [[feedback-transform-breaks-fixed-positioning]]).
// Centers content when it fits and scrolls from the top when it's taller than
// the screen (the min-height wrapper sidesteps the flexbox centered-overflow
// clip). Respects iOS safe areas + momentum scroll. Click the scrim to close.
function ModalScrim({ zIndex, onClose, bg = 'rgba(2,6,12,0.85)', blur = 'blur(4px)', children }: {
  zIndex: number; onClose: () => void; bg?: string; blur?: string; children: React.ReactNode
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex, background: bg, backdropFilter: blur, WebkitBackdropFilter: blur, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ── Haul modal ────────────────────────────────────────────────────────────────
// "What's down there" — a popup on the intro so a player can see the chest
// ladder, a rough doubloon/XP estimate for their reach, and the named-item chase
// BEFORE committing a descent (and burning the cooldown).
function HaulModal({ deepest, doubloonMult, onClose }: { deepest: number; doubloonMult: number; onClose: () => void }) {
  // The floor guide lights up the rows the player can already reach; before any
  // run, treat depth 8 as a realistic first goal.
  const target = deepest > 0 ? deepest : 8
  const cannons = ['davys_heavy_cannon', 'davys_hand_cannon']
    .map(getRaidItem)
    .filter((it): it is NonNullable<ReturnType<typeof getRaidItem>> => !!it)
  const shallowOdds = Math.round(chestCannonDropChance(1) * 1000) / 10
  const deepOdds = Math.round(chestCannonDropChance(5) * 100)

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${TEAL}3a`, boxShadow: `0 0 44px ${TEAL}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.2rem 1.1rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${TEAL}cc` }}>What&apos;s Down There</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>The Haul</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ marginTop: 12, textAlign: 'left' }}>
              {/* Plain-English intro — the whole loop in one breath. */}
              <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b8b2a6', lineHeight: 1.5 }}>
                Every ship you sink grows <span style={{ color: GOLD, fontWeight: 700 }}>one pot</span>. Cash out at any depth to bank it as doubloons, plus the same amount in Nav XP. The deeper you go, the bigger it gets — but sink first and you lose the lot.
              </p>

              {/* Fathoms — the always-earned half, distinct from the gambled pot. */}
              <div style={{ marginTop: 11, padding: '0.6rem 0.7rem', borderRadius: 10, background: `${TEAL}0c`, border: `1px solid ${TEAL}30` }}>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b8b2a6', lineHeight: 1.5 }}>
                  Every dive also pays <span style={{ color: TEAL, fontWeight: 700 }}>Fathoms</span> — one for each depth you reach, <span style={{ color: TEAL, fontWeight: 700 }}>kept even if you sink</span>. Spend them in the Locker&apos;s two shops on permanent upgrades.
                </p>
              </div>

              {/* Floor guide — concrete earnings at each floor (no multipliers).
                  Sampled at a depth inside each chest's band; rows you can already
                  reach are lit gold. */}
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginTop: 14, marginBottom: 6 }}>What you bank by depth</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {CHEST_TIERS.map(c => {
                  const d = c.minDepth === 0 ? 5 : c.minDepth + 2
                  const pot = estimatePotForDepth(d)
                  const rowDoubloons = Math.round(pot * c.potMult * doubloonMult)
                  const reached = target >= d
                  return (
                    <div key={c.tier} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.4rem 0.6rem', borderRadius: 9, background: reached ? `${GOLD}10` : 'rgba(255,255,255,0.02)', border: `1px solid ${reached ? `${GOLD}33` : 'rgba(255,255,255,0.06)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                        <span className="font-karla font-700" style={{ fontSize: '0.55rem', color: reached ? GOLD : '#6b6760', flexShrink: 0, width: 48 }}>Depth {d}</span>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: reached ? '#f0ede8' : '#7a766e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: reached ? GOLD : '#6b6760' }}>~{fmt(rowDoubloons)} ⟡</span>
                        {c.gems > 0 && <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: reached ? '#a78bfa' : '#5a5566' }}>+{c.gems} ◆</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#7a766e', marginTop: 5, lineHeight: 1.4 }}>
                The deeper you cash out, the bigger the haul. Plus the same in Nav XP. Sink before you cash out and it all goes to the deep.
              </p>

              {/* The named chase */}
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginTop: 12, marginBottom: 6 }}>The Chase — rare from any chest</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cannons.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.45rem 0.55rem', borderRadius: 9, background: 'rgba(140,90,210,0.08)', border: '1px solid rgba(150,110,220,0.28)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.image ?? undefined} alt="" loading="lazy" decoding="async" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }} />
                    <div style={{ minWidth: 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#e9ddff', lineHeight: 1.1 }}>{it.name}</p>
                      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#9a93a8', lineHeight: 1.3, marginTop: 1 }}>{it.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="font-karla" style={{ fontSize: '0.64rem', color: '#8a8480', marginTop: 7, lineHeight: 1.4 }}>
                Each can drop from any chest you crack, from about {shallowOdds}% up shallow to {deepOdds}% in Davy Jones&apos; Locker. Land both and forge them into the Grand Cannon.
              </p>
        </div>
      </motion.div>
    </ModalScrim>
  )
}

// ── Action tile ───────────────────────────────────────────────────────────────
// The three intro choices. `primary` (Descend) carries the gold pulse so it
// reads as the start button; the others open their panels.
function ActionTile({ color, icon, label, line, primary, disabled, onClick }: {
  color: string; icon: React.ReactNode; label: string; line: string; primary?: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className="tap"
      style={{
        flex: 1, minWidth: 0, padding: '0.95rem 0.25rem 0.8rem', borderRadius: 14,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, textAlign: 'center',
        cursor: disabled ? 'wait' : 'pointer',
        background: primary ? `linear-gradient(180deg, ${color}2e, ${color}10)` : `${color}10`,
        border: `1px solid ${color}${primary ? '70' : '38'}`,
        boxShadow: primary ? `0 0 22px ${color}1f` : 'none',
        animation: primary && !disabled ? 'gauntCta 2.6s ease-in-out infinite' : 'none',
      }}>
      <span style={{ color }}>{icon}</span>
      <span className="font-cinzel font-800 uppercase" style={{ fontSize: '0.76rem', letterSpacing: '0.02em', color: primary ? color : '#f0ede8', lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
      <span className="font-karla" style={{ fontSize: '0.58rem', color: '#9a948a', lineHeight: 1.25 }}>{line}</span>
    </button>
  )
}

// ── First-time explainer ──────────────────────────────────────────────────────
// A short, noob-proof "how this works" for the Gauntlet. Auto-opens once;
// reopenable via "How it works".
function GauntletIntroModal({ onClose, firstTime }: { onClose: () => void; firstTime: boolean }) {
  const steps: { color: string; title: string; text: string; icon: React.ReactNode }[] = [
    { color: TEAL, title: 'Descend the Locker', text: 'Drop in and fight ship after ship. Each one deeper hits harder.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg> },
    { color: GOLD, title: 'One pot grows', text: 'Every ship you sink swells a single pot of doubloons and Nav XP.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="2.6" /><path d="M5 6.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /><path d="M5 11.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /></svg> },
    { color: '#f87171', title: 'Cash out or sink', text: 'Haul the pot up any time to bank it. Go under first and it all sinks with you.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 4 3 7 7 8 4-1 7-4 7-8a8 8 0 0 0-8-8z" /><circle cx="9" cy="10" r="1.4" fill="#120a12" /><circle cx="15" cy="10" r="1.4" fill="#120a12" /></svg> },
    { color: TEAL, title: 'Earn Fathoms', text: 'Every dive pays Fathoms — one for each depth you reach, kept even if you sink. They never go to the deep.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M7 10.6c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.1-0.9 2.8-0.4" /><path d="M7 14c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.1-0.9 2.8-0.4" /></svg> },
    { color: GOLD, title: 'Two shops to spend them', text: 'Run Upgrades sharpen your dives. Ship & Shore is permanent power for your raids, voyages, and fishing.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="6.5" ry="2.4" /><path d="M5.5 6v4c0 1.3 2.9 2.4 6.5 2.4S18.5 11.3 18.5 10V6" /><path d="M5.5 10v4c0 1.3 2.9 2.4 6.5 2.4s6.5-1.1 6.5-2.4v-4" /><path d="M5.5 14v4c0 1.3 2.9 2.4 6.5 2.4s6.5-1.1 6.5-2.4v-4" /></svg> },
  ]
  return (
    <ModalScrim zIndex={1400} onClose={onClose} bg="rgba(2,6,12,0.88)" blur="blur(5px)">
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 250, damping: 23 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, borderRadius: 20, background: 'linear-gradient(180deg, rgba(12,18,30,0.99), rgba(6,9,16,0.99))', border: `1px solid ${TEAL}3a`, boxShadow: `0 0 50px ${TEAL}22, 0 18px 50px rgba(0,0,0,0.65)`, padding: '1.3rem 1.15rem 1.15rem', textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 6px' }}>
          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: `radial-gradient(circle, ${GOLD}22 0%, ${TEAL}12 45%, transparent 72%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MAW_IMG} alt="" loading="eager" decoding="async" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.7))' }} />
        </div>
        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.3em', color: TEAL }}>The Davy Jones Gauntlet</p>
        <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#f3ead2', lineHeight: 1.1, marginTop: 5 }}>How the descent works</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16, textAlign: 'left' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.6rem 0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: `${s.color}1c`, border: `1px solid ${s.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>{s.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#f0ede8', lineHeight: 1.1 }}>{s.title}</p>
                <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.35, marginTop: 1 }}>{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
          style={{ marginTop: 18, width: '100%', padding: '0.95rem', borderRadius: 13, fontSize: '0.95rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`, border: `1px solid ${GOLD}66`, cursor: 'pointer' }}>
          {firstTime ? 'Into the Locker' : 'Got it'}
        </button>
      </motion.div>
    </ModalScrim>
  )
}

// Visual for the Extra Cannonball Rack — the raid cannonball pips (same gold
// dots as the in-combat ChargesRow) going from the standard 3 to 4, with the
// new reserve pip pulsing teal so the gain is obvious at a glance.
function CannonballRackDemo() {
  function Pip({ extra }: { extra?: boolean }) {
    return (
      <motion.div
        aria-hidden
        animate={extra ? { scale: [1, 1.16, 1], boxShadow: [`0 0 6px rgba(251,191,36,0.5)`, `0 0 12px ${TEAL}, 0 0 7px rgba(251,191,36,0.85)`, `0 0 6px rgba(251,191,36,0.5)`] } : undefined}
        transition={extra ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ width: 14, height: 14, borderRadius: '50%', background: '#fbbf24', border: `1px solid ${extra ? TEAL : '#fbbf24'}`, boxShadow: extra ? `0 0 10px ${TEAL}` : '0 0 6px rgba(251,191,36,0.5)' }}
      />
    )
  }
  return (
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0.7rem 0.5rem', borderRadius: 10, background: 'rgba(4,8,14,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{[0, 1, 2].map(i => <Pip key={i} />)}</div>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: '#8a8480', marginTop: 7 }}>Standard · 3</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8480" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{[0, 1, 2].map(i => <Pip key={i} />)}<Pip extra /></div>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: TEAL, marginTop: 7 }}>With Rack · 4</p>
      </div>
    </div>
  )
}

// ── Locker Upgrades ───────────────────────────────────────────────────────────
// Permanent perks bought with Fathoms, each gated by how deep you've gone. Split
// into two counters: "Run Upgrades" (scope 'gauntlet' — sharpen the descent) and
// "Hauled to Shore" (scope account/world + the Auto Catcher special item — power
// for the wider game). Server-validated on claim (depth + cost + prereq + no
// double); the panel just reflects state and disables what you can't take yet.
type LockerState = { deepest: number; fathoms: number; owned: string[]; hasAutoCatcher: boolean; hasAutoCaster: boolean }
/** A purchasable row in the Locker — either a Gauntlet upgrade or a special
 *  item (the Auto Catcher) — normalized so both render through one card. */
type ShopEntry = {
  id: string; name: string; description: string; depthRequired: number; cost: number
  scope: string; owned: boolean; lockNote: string | null; demo: boolean; special: boolean
}

function LockerUpgradesModal({ section, onClose, onClaimed }: { section: 'run' | 'shore'; onClose: () => void; onClaimed?: (owned: string[]) => void }) {
  const [state, setState] = useState<LockerState | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { getGauntletUpgradeState().then(setState) }, [])

  async function claim(id: string, special: boolean) {
    if (claiming) return
    setClaiming(id); setErr(null)
    if (special) {
      // Special items (Auto Catcher) are bought via buySpecialItem, which sets
      // its own profile column — refetch to pick up the new owned + Fathoms.
      const res = await buySpecialItem(id)
      setClaiming(null)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 30, 50, 40])
      const fresh = await getGauntletUpgradeState(); setState(fresh)
    } else {
      const res = await claimGauntletUpgrade(id)
      setClaiming(null)
      if ('error' in res) { setErr(res.error); return }
      setState(s => (s ? { ...s, fathoms: res.fathoms, owned: res.owned } : s))
      onClaimed?.(res.owned)
      vibrate([0, 30, 50, 40])
    }
  }

  // One renderer for both kinds of row.
  function Card({ e }: { e: ShopEntry }) {
    if (!state) return null
    const depthMet = state.deepest >= e.depthRequired
    const canAfford = state.fathoms >= e.cost
    const busy = claiming === e.id
    const prereqLocked = !!e.lockNote && !e.owned
    const claimable = !e.owned && depthMet && canAfford && !prereqLocked && !busy
    return (
      <div style={{ borderRadius: 14, padding: '0.85rem 0.9rem', background: e.owned ? `${TEAL}10` : 'rgba(255,255,255,0.03)', border: `1px solid ${e.owned ? `${TEAL}45` : 'rgba(255,255,255,0.1)'}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f0ede8' }}>{e.name}</p>
          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: depthMet ? '#7fd49a' : '#d8a14a', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {depthMet ? `Depth ${e.depthRequired} ✓` : `Depth ${state.deepest}/${e.depthRequired}`}
          </span>
        </div>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#b0aaa0', lineHeight: 1.45, marginTop: 5 }}>{e.description}</p>
        {e.demo && <CannonballRackDemo />}
        {prereqLocked && <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#caa05a', marginTop: 7 }}>{e.lockNote}</p>}
        <button
          type="button"
          onClick={claimable ? () => claim(e.id, e.special) : undefined}
          disabled={!claimable}
          className="font-cinzel font-700 uppercase tracking-[0.06em] tap"
          style={{
            marginTop: 10, width: '100%', padding: '0.7rem', borderRadius: 11, fontSize: '0.74rem',
            cursor: claimable ? 'pointer' : 'default',
            color: e.owned ? TEAL : claimable ? TEAL : '#6a6764',
            background: e.owned ? `${TEAL}1a` : claimable ? `${TEAL}1c` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${e.owned ? `${TEAL}55` : claimable ? `${TEAL}66` : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          {busy ? 'Claiming…'
            : e.owned ? 'Unlocked ✓'
            : !depthMet ? `Reach Depth ${e.depthRequired}`
            : prereqLocked ? 'Auto Caster needed'
            : !canAfford ? `Need ${fmt(e.cost)} Fathoms`
            : `Claim · ${fmt(e.cost)} Fathoms`}
        </button>
      </div>
    )
  }

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${TEAL}3a`, boxShadow: `0 0 44px ${TEAL}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.2rem 1.1rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${TEAL}cc` }}>The Locker</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>{section === 'run' ? 'Run Upgrades' : 'Ship & Shore'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a948a', marginTop: 6, lineHeight: 1.45 }}>
          {section === 'run'
            ? 'Perks that sharpen the descent itself — they only matter inside the Gauntlet. Bought with Fathoms.'
            : 'Permanent power you carry topside — into raids, voyages, and fishing. Bought with Fathoms, earned by descending.'}
        </p>

        {state === null ? (
          <p className="font-karla" style={{ fontSize: '0.8rem', color: '#7a766e', textAlign: 'center', padding: '2rem 0' }}>Reading the ledger…</p>
        ) : (() => {
            const upgrades: ShopEntry[] = GAUNTLET_UPGRADES.map(u => ({
              id: u.id, name: u.name, description: u.description, depthRequired: u.depthRequired,
              cost: u.cost, scope: u.scope, owned: state.owned.includes(u.id), lockNote: null,
              demo: u.id === 'cannonball_rack', special: false,
            }))
            const ac = getSpecialItem('auto_catcher')
            const autoCatcher: ShopEntry | null = ac ? {
              id: 'auto_catcher', name: ac.name, description: ac.description,
              depthRequired: ac.requiresGauntletDepth ?? 5, cost: ac.costFathoms ?? 0,
              scope: 'world', owned: state.hasAutoCatcher,
              lockNote: state.hasAutoCaster ? null : 'Buy the Auto Caster in the fishing shop first.',
              demo: false, special: true,
            } : null
            const runShop = upgrades.filter(e => e.scope === 'gauntlet')
            const shoreShop = [...upgrades.filter(e => e.scope !== 'gauntlet'), ...(autoCatcher ? [autoCatcher] : [])]
            const entries = section === 'run' ? runShop : shoreShop
            return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 14px', padding: '0.4rem 0', borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: '#8a8480' }}>Your Fathoms</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: TEAL }}>{fmt(state.fathoms)} Fathoms</span>
            </div>

            {entries.length === 0
              ? <p className="font-karla" style={{ fontSize: '0.78rem', color: '#7a766e', textAlign: 'center', padding: '1.5rem 0' }}>Nothing in this shop yet — more coming.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{entries.map(e => <Card key={e.id} e={e} />)}</div>}

            {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#fca5a5', textAlign: 'center', marginTop: 12 }}>{err}</p>}
          </>
            )
          })()}
      </motion.div>
    </ModalScrim>
  )
}

// ── Atmosphere ────────────────────────────────────────────────────────────────
// The Gauntlet is the endgame descent, so every meta screen sits over a living
// abyss: a dim surface glow up top fading to pitch black, drifting god-rays, and
// motes rising from the deep. CSS-only (transform/opacity) so it stays cheap on
// mobile / iOS PWA. Keyframes are injected once via the backdrop's <style>.
const ABYSS_KEYFRAMES = `
@keyframes gauntRise { 0% { transform: translateY(0); opacity: 0 } 12% { opacity: 0.55 } 88% { opacity: 0.4 } 100% { transform: translateY(-360px); opacity: 0 } }
@keyframes gauntPulse { 0%, 100% { opacity: 0.38; transform: scale(1) } 50% { opacity: 0.78; transform: scale(1.07) } }
@keyframes gauntDrift { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
@keyframes gauntShaft { 0%, 100% { opacity: 0.14 } 50% { opacity: 0.3 } }
@keyframes gauntCta { 0%, 100% { box-shadow: 0 0 0 1px rgba(240,192,64,0.5), 0 0 20px rgba(240,192,64,0.22) } 50% { box-shadow: 0 0 0 1px rgba(240,192,64,0.75), 0 0 34px rgba(240,192,64,0.42) } }
`

// Deterministic so SSR + client agree (no Math.random in render).
const MOTES = [
  { left: 12, size: 3, dur: 9,  delay: 0 },
  { left: 22, size: 2, dur: 12, delay: 2 },
  { left: 34, size: 4, dur: 8,  delay: 1 },
  { left: 45, size: 2, dur: 11, delay: 4 },
  { left: 53, size: 3, dur: 10, delay: 0.5 },
  { left: 64, size: 2, dur: 13, delay: 3 },
  { left: 72, size: 4, dur: 9,  delay: 1.5 },
  { left: 81, size: 3, dur: 11, delay: 2.5 },
  { left: 90, size: 2, dur: 10, delay: 5 },
  { left: 7,  size: 2, dur: 14, delay: 6 },
  { left: 58, size: 2, dur: 9,  delay: 7 },
]

function AbyssBackdrop() {
  return (
    <>
      <style>{ABYSS_KEYFRAMES}</style>
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
        background: 'radial-gradient(ellipse 130% 80% at 50% -12%, rgba(34,64,98,0.55) 0%, rgba(10,20,34,0.62) 36%, rgba(2,5,10,0.97) 76%), #02040a',
      }}>
        {/* God-rays from the surface */}
        <div style={{ position: 'absolute', top: '-12%', left: '20%', width: 130, height: '95%', transform: 'rotate(9deg)', filter: 'blur(10px)', background: 'linear-gradient(to bottom, rgba(120,180,220,0.18), transparent 68%)', animation: 'gauntShaft 7s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '-12%', left: '62%', width: 100, height: '95%', transform: 'rotate(-7deg)', filter: 'blur(10px)', background: 'linear-gradient(to bottom, rgba(120,180,220,0.13), transparent 64%)', animation: 'gauntShaft 9s ease-in-out infinite', animationDelay: '1.5s' }} />
        {/* Motes rising from the deep */}
        {MOTES.map((m, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: -10, left: `${m.left}%`,
            width: m.size, height: m.size, borderRadius: '50%',
            background: 'rgba(150,200,230,0.55)', boxShadow: '0 0 6px rgba(150,200,230,0.55)',
            animation: `gauntRise ${m.dur}s linear ${m.delay}s infinite`,
          }} />
        ))}
        {/* Vignette to keep the focus center */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 42%, transparent 48%, rgba(0,0,0,0.6) 100%)' }} />
      </div>
    </>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────
function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <AbyssBackdrop />
      <div className="flex flex-col" style={{
        position: 'relative', zIndex: 1,
        maxWidth: wide ? 460 : 420, margin: '0 auto', padding: '12px 0.25rem',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
      }}>
        {/* Dark panel so copy stays legible over the abyss; slightly translucent
            now so the atmosphere bleeds through behind it. */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(10,14,22,0.86) 0%, rgba(5,8,14,0.93) 100%)',
          border: `1px solid ${GOLD}33`,
          borderRadius: 18,
          padding: '1.25rem 1.2rem 1.4rem',
          boxShadow: '0 18px 54px rgba(0,0,0,0.6), inset 0 1px 0 rgba(240,192,64,0.08)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}>
          {children}
        </div>
      </div>
    </>
  )
}

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 14, marginTop: 8 }}>
      <h1 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f0ece4', letterSpacing: '0.02em' }}>{children}</h1>
      {sub && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function BackLink({ router, label, primary }: { router: ReturnType<typeof useRouter>; label: string; primary?: boolean }) {
  return (
    <button onClick={() => router.push('/expeditions')} className="font-karla font-600"
      style={{
        marginTop: 16, width: '100%', padding: primary ? '0.85rem' : '0.7rem', borderRadius: 12, fontSize: '0.85rem',
        background: primary ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: primary ? '1px solid rgba(255,255,255,0.14)' : 'none',
        color: primary ? '#cfc9bf' : '#8a8880', cursor: 'pointer',
      }}>
      {label}
    </button>
  )
}

function DepthBar({ depth, pot, isBoss, isElite, affixName, curses }: { depth: number; pot: number; isBoss: boolean; isElite: boolean; affixName?: string; curses: number }) {
  const tag = isBoss ? 'BOSS' : isElite ? `ELITE${affixName ? ` · ${affixName}` : ''}` : null
  const tagColor = isBoss ? '#f87171' : '#c084fc'
  return (
    <div className="flex items-center justify-between"
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${GOLD}28`, borderRadius: 14, padding: '0.4rem 0.8rem' }}>
      <div className="flex items-baseline gap-1.5">
        <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: GOLD + 'bb', letterSpacing: '0.1em' }}>DEPTH</span>
        <span className="font-cinzel font-800" style={{ fontSize: '1rem', color: GOLD, lineHeight: 1 }}>{depth}</span>
        {tag && <span className="font-cinzel font-700" style={{ fontSize: '0.56rem', color: tagColor, letterSpacing: '0.06em', marginLeft: 4 }}>{tag}</span>}
      </div>
      <div className="flex items-center gap-2.5">
        {curses > 0 && (
          <span className="flex items-baseline gap-1" title={`${curses} curse${curses === 1 ? '' : 's'} active`}>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', color: '#f8717199', letterSpacing: '0.08em' }}>CURSED</span>
            <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f87171', lineHeight: 1 }}>{curses}</span>
          </span>
        )}
        <span className="flex items-baseline gap-1">
          <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#9a948a', letterSpacing: '0.08em' }}>POT</span>
          <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e8dfc8' }}>{fmt(pot)} ⟡</span>
        </span>
      </div>
    </div>
  )
}
