'use client'

// Davy Jones Gauntlet host. Owns the push-your-luck meta-loop (depth, pot,
// cash-out vs push-on, the daily gate) and mounts the existing RaidCombat
// engine one fight at a time. No combat rewrite: RaidCombat fights a single
// generated enemy, hands back the player's remaining HP, and we carry it into
// the next fight. Bosses / elites / Tides fire on the randomized guardrails in
// lib/gauntlet. The pot is only banked on cash-out; a wipe loses everything.

import { useEffect, useRef, useState } from 'react'
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
  GAUNTLET_COOLDOWN_ROUNDS, TIDE_HEAL_HP_PCT,
  type GauntletFight, type GauntletRollState, type GauntletCurse, type GauntletBoon,
} from '@/lib/gauntlet'
import { drawTides, expireAfterFight, type TideEvent, type TideEffect, type TideChoice } from '@/lib/tides'
import { startGauntletRun, cashOutGauntlet, resolveGauntletDeath } from './actions'
import { getRaidItem } from '@/lib/raidItems'
import { vibrate } from '@/lib/haptics'

type Phase = 'intro' | 'usedup' | 'descending' | 'fighting' | 'tide' | 'curse' | 'boon' | 'between' | 'reward' | 'dead'

type CashResult = Awaited<ReturnType<typeof cashOutGauntlet>>

const GOLD = '#f0c040'
const TEAL = '#5eead4'

// The maw art. Swap this one constant when bespoke "Locker" art lands —
// it drives both the intro centerpiece and the descent transition.
const MAW_IMG = '/raid4_gulletmaw.png'

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
  deepest: number
  available: boolean
  /** ISO time the next run unlocks (cooldown), or null when available now. */
  nextAt: string | null
}

export default function GauntletGame(props: GauntletGameProps) {
  const router = useRouter()
  const shipFilter = props.equippedShipSkin ? getShipSkin(props.equippedShipSkin)?.filter ?? 'none' : 'none'

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
  const [playerHP, setPlayerHP] = useState(props.playerHPMax)
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

  // Guardrail counters live in refs (read inside combat callbacks).
  const rollStateRef = useRef<GauntletRollState>({ cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 })
  const roundsSinceTideRef = useRef(0)
  const playerHPRef = useRef(props.playerHPMax)
  const potRef = useRef(0)

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

  function begin() {
    if (starting) return
    setStarting(true)
    startGauntletRun().then(res => {
      if (!res.started) { if (res.nextAt) setCooldownUntil(res.nextAt); setPhase('usedup'); setStarting(false); return }
      // Fresh run.
      rollStateRef.current = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
      roundsSinceTideRef.current = 0
      playerHPRef.current = props.playerHPMax
      potRef.current = 0
      setPlayerHP(props.playerHPMax)
      setPot(0)
      setBossesDefeated(0)
      setActiveTideEffects([])
      setUsedAbilityIds(new Set())
      setActiveCurses([]); activeCursesRef.current = []
      setPendingCurse(null)
      setActiveBoons([]); setPendingBoons(null)
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
    const nextDepth = clearedNow + 1
    if (CURSE_DEPTHS.includes(nextDepth)) {
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
      setPendingTide(drawGauntletTide(clearedNow, remainingHp, props.playerHPMax))
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
    resolveGauntletDeath(rollStateRef.current.cleared).finally(() => {
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
      const drained = Math.max(1, Math.round(playerHPRef.current - props.playerHPMax * drainPct))
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
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
      }
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
            One descent a day. How deep do you dare?
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

          {/* The three rules of the descent */}
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <StakeTile
              color={TEAL}
              label="Descend"
              line="Each depth drags up a deadlier ship."
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>}
            />
            <StakeTile
              color={GOLD}
              label="Hoard"
              line="Every kill swells one pot."
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="2.6" /><path d="M5 6.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /><path d="M5 11.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /></svg>}
            />
            <StakeTile
              color="#f87171"
              label="Or Sink"
              line="Go under and the pot sinks with you."
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.2 2.8 5.4.4.3.7.8.7 1.3V18a1.6 1.6 0 0 0 1.6 1.6h.4l.5-1.6h-1l-.4-1.4h1.6L11 18l.5 1.6h1L13 18l.4-1.4H15l-.4 1.4h-1l.5 1.6h.4A1.6 1.6 0 0 0 16.1 18v-1.3c0-.5.3-1 .7-1.3C18.4 14.2 20 12.5 20 10a8 8 0 0 0-8-8Z" /><circle cx="9" cy="10.5" r="1.6" fill="#0a0e16" /><circle cx="15" cy="10.5" r="1.6" fill="#0a0e16" /></svg>}
            />
          </div>

          {/* The descent itself */}
          <button onClick={begin} disabled={starting} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{
              marginTop: 22, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem',
              color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`,
              border: `1px solid ${GOLD}66`, cursor: starting ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              animation: starting ? 'none' : 'gauntCta 2.6s ease-in-out infinite',
            }}>
            {starting ? 'Descending…' : (
              <>Brave the Locker
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </>
            )}
          </button>
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#7a766e', marginTop: 10 }}>
            Starting spends today&rsquo;s descent.
          </p>
          <BackLink router={router} label="Not today" />
        </div>
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
        <BackLink router={router} label="Back to the map" primary={!ready} />
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
    return (
      <Shell>
        <Title sub={`You went down at depth ${rollStateRef.current.cleared + 1}.`}>The Locker Takes It</Title>
        <p className="font-karla" style={{ fontSize: '0.85rem', color: '#f8a5a5', lineHeight: 1.5 }}>
          Your ship sank with the whole pot aboard. {fmt(potRef.current)} ⟡ and as much XP, gone to the deep. You cleared {rollStateRef.current.cleared} {rollStateRef.current.cleared === 1 ? 'round' : 'rounds'}.
        </p>
        <BackLink router={router} label="Back to the map" primary />
      </Shell>
    )
  }

  // ── Between rounds: cash out or push on ──────────────────────────────────
  if (phase === 'between') {
    const cleared = rollStateRef.current.cleared
    const nextDepth = cleared + 1
    const chest = chestForDepth(cleared)
    const previewDoubloons = Math.round(pot * chest.potMult * props.classDoubloonMult)
    const previewXp = Math.round(pot * chest.potMult)
    const hpPct = Math.max(0, Math.min(100, Math.round((playerHP / props.playerHPMax) * 100)))
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
              <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: hpColor }}>{playerHP} / {props.playerHPMax}</span>
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
                style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
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
            if (fullHealTriggered) { playerHPRef.current = props.playerHPMax; setPlayerHP(props.playerHPMax) }
            else if (healDelta !== 0) {
              const next = Math.min(props.playerHPMax, Math.max(0, playerHPRef.current + healDelta))
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
            playerHpMax={props.playerHPMax}
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

const CHEST_ART: Record<number, { closed: string; open: string; color: string }> = {
  1: { closed: '/crateclosed.png',        open: '/crateopen.png',        color: '#c08a4e' },
  2: { closed: '/metalcrateclosed.png',   open: '/metalcrateopen.png',   color: '#9fb0bf' },
  3: { closed: '/goldcrateclosed.png',    open: '/goldcrateopen.png',    color: '#f0c040' },
  4: { closed: '/diamondcrateclosed.png', open: '/diamondcrateopen.png', color: '#7fdce8' },
  5: { closed: '/diamondcrateclosed.png', open: '/diamondcrateopen.png', color: '#a78bfa' },
}

// rAF count-up for the reward numbers (easeOutCubic). App-side, so Date/rAF are fine.
function CountUp({ to, dur = 850 }: { to: number; dur?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (to <= 0) { setN(0); return }
    let raf = 0, start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / dur)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, dur])
  return <>{n.toLocaleString()}</>
}

function RewardLine({ label, to, suffix = '', color, delay }: { label: string; to: number; suffix?: string; color: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.45rem 0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#9a948a' }}>{label}</span>
      <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', color }}>+<CountUp to={to} />{suffix}</span>
    </motion.div>
  )
}

function GauntletReward({ r, onBack }: { r: RewardOk; onBack: () => void }) {
  const [opened, setOpened] = useState(false)
  const art = CHEST_ART[r.chest.tier] ?? CHEST_ART[1]
  const newBest = r.depth >= r.deepest

  function open() {
    if (opened) return
    setOpened(true)
    vibrate([0, 30, 55, 45])
    import('@/lib/fishingMusic').then(m => m.playForgeSfx(false)).catch(() => {})
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
              {/* Burst of light on open */}
              <motion.div aria-hidden initial={{ scale: 0.2, opacity: 0.85 }} animate={{ scale: 3, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}cc 0%, ${art.color}33 35%, transparent 70%)` }} />
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}33 0%, transparent 68%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
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
              <RewardLine label="Doubloons" to={r.bankedDoubloons} suffix=" ⟡" color={GOLD} delay={0.2} />
              <RewardLine label="Nav XP" to={r.bankedXp} color="#4ade80" delay={0.32} />
              {r.gems > 0 && <RewardLine label="Gems" to={r.gems} suffix=" ◆" color="#a78bfa" delay={0.44} />}
            </div>

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

// One "rule of the descent" tile for the intro — reads like a rift modifier.
function StakeTile({ color, icon, label, line }: { color: string; icon: React.ReactNode; label: string; line: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, borderRadius: 12, border: `1px solid ${color}33`, background: `${color}0e`, padding: '0.7rem 0.45rem 0.65rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.64rem', letterSpacing: '0.08em', color: '#f0ece4', lineHeight: 1 }}>{label}</p>
      <p className="font-karla" style={{ fontSize: '0.58rem', color: '#9a948a', lineHeight: 1.3 }}>{line}</p>
    </div>
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
