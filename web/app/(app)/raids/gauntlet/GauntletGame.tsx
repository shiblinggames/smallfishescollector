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
  GAUNTLET_COOLDOWN_ROUNDS, TIDE_HEAL_HP_PCT,
  type GauntletFight, type GauntletRollState,
} from '@/lib/gauntlet'
import { drawTides, type TideEvent, type TideEffect, type TideChoice } from '@/lib/tides'
import { startGauntletRun, cashOutGauntlet, resolveGauntletDeath } from './actions'

type Phase = 'intro' | 'usedup' | 'fighting' | 'tide' | 'between' | 'reward' | 'dead'

type CashResult = Awaited<ReturnType<typeof cashOutGauntlet>>

const GOLD = '#f0c040'
const TEAL = '#5eead4'

function fmt(n: number) { return Math.round(n).toLocaleString() }

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
  const [reward, setReward] = useState<CashResult | null>(null)
  const [resolving, setResolving] = useState(false)

  // Guardrail counters live in refs (read inside combat callbacks).
  const rollStateRef = useRef<GauntletRollState>({ cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 })
  const roundsSinceTideRef = useRef(0)
  const playerHPRef = useRef(props.playerHPMax)
  const potRef = useRef(0)

  // Body-scroll lock in installed PWA only (keeps action buttons reachable —
  // same reasoning as RaidGame).
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

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
      setFight(generateFight(rollStateRef.current))
      setPhase('fighting')
      setStarting(false)
    })
  }

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

    // Crew/repair cooldown: abilities refresh every N cleared rounds.
    if (clearedNow % GAUNTLET_COOLDOWN_ROUNDS === 0) setUsedAbilityIds(new Set())

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

  function handlePlayerDefeated() {
    if (resolving) return
    setResolving(true)
    resolveGauntletDeath(rollStateRef.current.cleared).finally(() => {
      setResolving(false)
      setPhase('dead')
    })
  }

  function pushOn() {
    setFight(generateFight(rollStateRef.current))
    setPhase('fighting')
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
      <Shell>
        <Title sub="One run a day. How deep do you dare?">Davy Jones Gauntlet</Title>
        <div className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.5, color: '#c9c3b8', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p>Fight down through the deep. Every win drags up harder ships from the crews you have already faced, and the loot piles into one pot.</p>
          <p>After each fight you choose: <span style={{ color: GOLD }}>cash out</span> and bank the haul, or <span style={{ color: TEAL }}>push on</span> for a bigger one. The deeper you go the fatter it gets.</p>
          <p style={{ color: '#f8a5a5' }}>But if your ship sinks, the whole pot goes down with it. You keep nothing.</p>
          <p style={{ color: '#9a948a', fontSize: '0.74rem' }}>Starting spends your run for the day. Deepest so far: depth {props.deepest}.</p>
        </div>
        <button onClick={begin} disabled={starting} className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ marginTop: 18, width: '100%', padding: '0.95rem', borderRadius: 12, fontSize: '1rem', background: `${GOLD}22`, border: `1px solid ${GOLD}66`, color: GOLD, cursor: starting ? 'wait' : 'pointer' }}>
          {starting ? '…' : 'Brave the Locker →'}
        </button>
        <BackLink router={router} label="Not today" />
      </Shell>
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
    return (
      <Shell>
        <Title sub={`${r.chest.label} · depth ${r.depth}`}>Hauled Up</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          <RewardRow label="Doubloons" value={`+${fmt(r.bankedDoubloons)} ⟡`} color={GOLD} />
          <RewardRow label="Nav XP" value={`+${fmt(r.bankedXp)}`} color="#4ade80" />
          {r.gems > 0 && <RewardRow label="Gems" value={`+${fmt(r.gems)} ◆`} color="#a78bfa" />}
          {r.chest.potMult > 1 && (
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a948a', textAlign: 'center', marginTop: 2 }}>
              {r.chest.label} multiplied your haul ×{r.chest.potMult}.
            </p>
          )}
          {r.depth >= r.deepest && (
            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: TEAL, textAlign: 'center', marginTop: 4 }}>
              New deepest run: depth {r.depth}.
            </p>
          )}
        </div>
        <BackLink router={router} label="Back to the map" primary />
      </Shell>
    )
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
    const hpPct = Math.round((playerHP / props.playerHPMax) * 100)
    return (
      <Shell>
        <Title sub={`${cleared} ${cleared === 1 ? 'round' : 'rounds'} deep`}>Catch Your Breath</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          <div style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${GOLD}33`, borderRadius: 12, padding: '0.8rem 0.9rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#8a8880', marginBottom: 6 }}>If you cash out now</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <RewardRow label="Doubloons" value={`+${fmt(previewDoubloons)} ⟡`} color={GOLD} small />
              <RewardRow label="Nav XP" value={`+${fmt(previewXp)}`} color="#4ade80" small />
              {chest.gems > 0 && <RewardRow label="Gems" value={`+${chest.gems} ◆`} color="#a78bfa" small />}
            </div>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948a', marginTop: 7 }}>
              {chest.label}{chest.potMult > 1 ? ` · ×${chest.potMult} haul` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }} className="font-karla">
            <span style={{ color: '#9a948a' }}>Hull</span>
            <span style={{ color: hpPct < 30 ? '#f87171' : hpPct < 60 ? GOLD : '#4ade80' }}>{playerHP}/{props.playerHPMax} HP</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <button onClick={cashOut} disabled={resolving} className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 12, fontSize: '1rem', background: `${GOLD}22`, border: `1px solid ${GOLD}66`, color: GOLD, cursor: resolving ? 'wait' : 'pointer' }}>
            {resolving ? '…' : `Cash Out · ${fmt(previewDoubloons)} ⟡`}
          </button>
          <button onClick={pushOn} disabled={resolving} className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 12, fontSize: '1rem', background: `${TEAL}1f`, border: `1px solid ${TEAL}55`, color: TEAL, cursor: resolving ? 'wait' : 'pointer' }}>
            Push On → Depth {nextDepth}
          </button>
        </div>
      </Shell>
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

  // ── Fighting ──────────────────────────────────────────────────────────────
  if (phase === 'fighting' && fight) {
    return (
      <div className="raid-combat-region flex flex-col items-center gap-2 select-none"
        style={{ userSelect: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)' }}>
        <div style={{ width: '100%', flexShrink: 0, marginBottom: 2 }}>
          <DepthBar depth={fight.depth} pot={pot} isBoss={fight.isBoss} isElite={fight.isElite} affixName={fight.affix?.name} />
        </div>
        <div style={{ width: '100%' }}>
          <RaidCombat
            key={`gauntlet-r${fight.depth}`}
            enemy={fight.enemy}
            atmosphere="fog"
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

// ── Small presentational helpers ──────────────────────────────────────────────
function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col" style={{
      maxWidth: wide ? 460 : 420, margin: '0 auto', padding: '12px 0.25rem',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
    }}>
      {/* Solid dark panel so copy stays legible over the ocean background. */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(10,14,22,0.94) 0%, rgba(5,8,14,0.97) 100%)',
        border: `1px solid ${GOLD}26`,
        borderRadius: 18,
        padding: '1.25rem 1.2rem 1.4rem',
        boxShadow: '0 18px 54px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }}>
        {children}
      </div>
    </div>
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

function RewardRow({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span className="font-karla" style={{ fontSize: small ? '0.74rem' : '0.85rem', color: '#9a948a' }}>{label}</span>
      <span className="font-cinzel font-700" style={{ fontSize: small ? '0.9rem' : '1.05rem', color }}>{value}</span>
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

function DepthBar({ depth, pot, isBoss, isElite, affixName }: { depth: number; pot: number; isBoss: boolean; isElite: boolean; affixName?: string }) {
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
      <div className="flex items-baseline gap-1">
        <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#9a948a', letterSpacing: '0.08em' }}>POT</span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e8dfc8' }}>{fmt(pot)} ⟡</span>
      </div>
    </div>
  )
}
