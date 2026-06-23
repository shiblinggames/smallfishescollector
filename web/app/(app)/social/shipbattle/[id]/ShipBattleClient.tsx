'use client'

// Async Ship PvP — battle screen. The server owns all resolution
// (lib/shipBattle/resolver); this client takes the player's action + aim and
// ANIMATES the server-rolled round log so both captains see identical numbers.
// The aim bar, Lock button, crit/hit haptics + gold flash, aim-result badge,
// and ship shake/recoil are ported from the raid (RaidCombat.tsx) so the duel
// feels exactly like a raid fight.

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { raidDamageProfile } from '@/lib/expeditions'
import { getRaidItem } from '@/lib/raidItems'
import { getShipClass } from '@/lib/shipClasses'
import { submitBattleMove, getShipBattleState, getShipBattleSync, type ShipBattleState } from '@/app/(app)/social/shipBattleActions'
import { lastActionOf, type BattleAction, type ShotResult, type RoundStep, type BattleLoadout, type BattleAbility, type BattleCrew } from '@/lib/shipBattle/resolver'
import { GRAZE_W, HIT_W, CRIT_W, INDICATOR_SPEED, getShotResult } from '@/lib/shipBattle/aim'
import { CLASSES, currentMilestone, type CrewClass } from '@/lib/crewClasses'
import { vibrate } from '@/lib/haptics'

// One armed free Special (crew ability or repair kit). critMult > 1 only for
// Sharpshot (it widens the firing player's crit zone on their next shot).
type Armed =
  | { kind: 'crew'; crewId: number; classId: CrewClass; label: string; critMult: number }
  | { kind: 'repair'; label: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Ship shake / recoil keyframes — matched to the raid.
const CRIT_SHAKE = { x: [0, -10, 10, -8, 8, -4, 4, -2, 0], rotate: [0, -1.5, 1.5, -1, 1, -0.5, 0.3, 0, 0], transition: { duration: 0.6 } }
const HIT_SHAKE = { x: [0, -6, 6, -4, 3, -1, 0], rotate: [0, -1, 0.8, -0.5, 0.3, 0, 0], transition: { duration: 0.45 } }
const RECOIL = { x: [0, -14, 5, -2, 0], rotate: [0, -2, 0.6, 0, 0], transition: { duration: 0.4 } }

type UIPhase = 'await_input' | 'aiming' | 'waiting' | 'animating' | 'over'

export default function ShipBattleClient({ initial, id }: { initial: ShipBattleState; id: string }) {
  const [me] = useState(initial.me)
  const [foe] = useState(initial.foe)
  const [status, setStatus] = useState(initial.status)
  const [iWon, setIWon] = useState<boolean | null>(initial.iWon)
  const [myHp, setMyHp] = useState(initial.myHp)
  const [foeHp, setFoeHp] = useState(initial.foeHp)
  const [myCharges, setMyCharges] = useState(initial.myCharges)
  const [foeCharges, setFoeCharges] = useState(initial.foeCharges)
  const [myShield, setMyShield] = useState(initial.myShield ?? 0)
  const [foeShield, setFoeShield] = useState(initial.foeShield ?? 0)
  const [splat, setSplat] = useState<{ who: 'me' | 'foe'; dmg: number; crit: boolean; dodged: boolean; heal?: number; burn?: boolean; frozen?: boolean } | null>(null)
  const [log, setLog] = useState<{ id: number; text: string }[]>([{ id: 0, text: 'The duel begins.' }])
  const logId = useRef(1)
  const pushLog = useCallback((text: string) => setLog(prev => [...prev, { id: logId.current++, text }].slice(-24)), [])
  const [busy, setBusy] = useState(false)
  const [critFlash, setCritFlash] = useState(false)
  const [aimBadge, setAimBadge] = useState<ShotResult | null>(null)
  const [statsFor, setStatsFor] = useState<{ load: BattleLoadout; hp: number; you: boolean } | null>(null)
  const [foeOnline, setFoeOnline] = useState(false)
  const [myLastAction, setMyLastAction] = useState<BattleAction | null>(lastActionOf(initial.rounds, initial.side))
  // ── Specials slice — spent state, armed slot, chooser, Sharpshot aim widen ──
  const [myFx, setMyFx] = useState(initial.myFx)
  const [armed, setArmedState] = useState<Armed | null>(null)
  const armedRef = useRef<Armed | null>(null)
  const setArmed = useCallback((a: Armed | null) => { armedRef.current = a; setArmedState(a) }, [])
  const [chooserOpen, setChooserOpen] = useState(false)
  const [aimCritMult, setAimCritMult] = useState(1)
  const critMultRef = useRef(1)
  const hasSpecials = (me.crew?.length ?? 0) > 0 || !!me.repairKit
  // Highest round NUMBER animated (not array length — the rounds log is tail-
  // capped server-side, so length isn't monotonic).
  const playedRef = useRef(initial.round - 1)

  const myShip = useAnimation()
  const foeShip = useAnimation()

  const initialPhase: UIPhase = initial.status !== 'active' ? 'over' : initial.myMoveIn ? 'waiting' : 'await_input'
  const [phase, setPhase] = useState<UIPhase>(initialPhase)
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])
  const isChallenger = initial.side === 'challenger'

  const flashBar = useCallback((color: string) => {
    if (!flashEl.current) return
    flashEl.current.style.transition = 'none'
    flashEl.current.style.background = color
    flashEl.current.style.opacity = '0.85'
    requestAnimationFrame(() => {
      if (!flashEl.current) return
      flashEl.current.style.transition = 'opacity 0.4s ease'
      flashEl.current.style.opacity = '0'
    })
  }, [])

  // ── Animate any resolved round(s) we haven't shown (by round number) ──
  const animateFrom = useCallback(async (state: ShipBattleState) => {
    const mySide = isChallenger ? 'challenger' : 'opponent'
    const fresh = state.rounds.filter(r => r.round > playedRef.current).sort((a, b) => a.round - b.round)
    if (fresh.length > 0) setPhase('animating')
    for (const entry of fresh) {
      for (const s of entry.steps) {
        pushLog(s.log)
        const actorIsMe = (s.actor === 'challenger') === isChallenger
        const targetMyHp = isChallenger ? s.challengerHp : s.opponentHp
        const targetFoeHp = isChallenger ? s.opponentHp : s.challengerHp
        const targetMyCh = isChallenger ? s.challengerCharges : s.opponentCharges
        const targetFoeCh = isChallenger ? s.opponentCharges : s.challengerCharges
        const targetMyShield = isChallenger ? s.challengerShield : s.opponentShield
        const targetFoeShield = isChallenger ? s.opponentShield : s.challengerShield
        const setBars = () => { setMyHp(targetMyHp); setFoeHp(targetFoeHp); setMyCharges(targetMyCh); setFoeCharges(targetFoeCh); setMyShield(targetMyShield); setFoeShield(targetFoeShield) }
        if (s.fx) {
          // Status beat — burn tick / parry reflect / freeze. Lands on the
          // ACTOR side (the one experiencing the effect).
          if (s.fx === 'freeze') {
            setSplat({ who: actorIsMe ? 'me' : 'foe', dmg: 0, crit: false, dodged: false, frozen: true })
          } else if (s.damage > 0) {
            setSplat({ who: actorIsMe ? 'me' : 'foe', dmg: s.damage, crit: false, dodged: false, burn: s.fx === 'burn' })
            ;(actorIsMe ? myShip : foeShip).start(HIT_SHAKE)
            vibrate(s.fx === 'burn' ? 30 : [20, 40])
          }
          setBars()
          await sleep(680)
          setSplat(null)
          await sleep(160)
          continue
        }
        if (s.ability) {
          // Free Special cast — gentle beat, green heal splat if it healed.
          if (s.heal && s.heal > 0) setSplat({ who: actorIsMe ? 'me' : 'foe', dmg: 0, crit: false, dodged: false, heal: s.heal })
          setBars()
          await sleep(700)
          setSplat(null)
          await sleep(150)
          continue
        }
        if (s.action === 'fire' || s.action === 'volley') {
          // Firing ship recoils immediately; the impact lands a beat later.
          ;(actorIsMe ? myShip : foeShip).start(RECOIL)
          await sleep(300)
          if (s.dodged) {
            setSplat({ who: actorIsMe ? 'foe' : 'me', dmg: 0, crit: false, dodged: true })
          } else if (s.damage > 0) {
            setSplat({ who: actorIsMe ? 'foe' : 'me', dmg: s.damage, crit: s.crit, dodged: false })
            ;(actorIsMe ? foeShip : myShip).start(s.crit ? CRIT_SHAKE : HIT_SHAKE)
            if (s.crit) { setCritFlash(true); vibrate([40, 60, 80]); setTimeout(() => setCritFlash(false), 360) }
          }
          setBars()
          await sleep(820)
        } else {
          setBars()
          await sleep(720)
        }
        setSplat(null)
        await sleep(160)
      }
      playedRef.current = entry.round
    }
    // Reconcile to the authoritative state — covers the rare case where rounds
    // were tail-capped and we couldn't animate every step.
    playedRef.current = Math.max(playedRef.current, state.round - 1)
    setMyHp(state.myHp); setFoeHp(state.foeHp); setMyCharges(state.myCharges); setFoeCharges(state.foeCharges)
    setMyShield(state.myShield ?? 0); setFoeShield(state.foeShield ?? 0)
    setMyFx(state.myFx)
    setMyLastAction(lastActionOf(state.rounds, mySide))
    if (state.status !== 'active') {
      setStatus(state.status); setIWon(state.iWon); setPhase('over')
      pushLog(state.status === 'expired' ? 'The duel timed out.' : state.iWon ? 'Victory — their ship is sunk!' : 'Your ship is sunk.')
    } else if (state.myMoveIn) { setPhase('waiting'); pushLog(`Waiting for ${foe.username} to fire…`) }
    else { setPhase('await_input'); pushLog(`Round ${state.round} — your move.`) }
  }, [isChallenger, myShip, foeShip, pushLog, foe.username])

  // ── Single 3s tick (all phases) ──
  // Doubles as the presence ping (calling getShipBattleSync bumps my
  // last_active_at server-side) AND the resolve poll. Light sync only; the
  // heavy state (loadouts + round log) is pulled ONLY when a round resolved.
  // Runs every phase so my "online" stays fresh even while I'm choosing.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (phaseRef.current === 'over') return
      const sync = await getShipBattleSync(id)
      if (!alive || 'error' in sync) return
      setFoeOnline(sync.foeOnline)
      if (phaseRef.current === 'waiting') {
        if (sync.round - 1 > playedRef.current) {
          const full = await getShipBattleState(id)
          if (!alive || 'error' in full) return
          await animateFrom(full)
        } else if (sync.status !== 'active') { setStatus(sync.status); setIWon(sync.iWon); setPhase('over') }
      }
    }
    void tick()
    const t = setInterval(tick, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [id, animateFrom])

  async function submit(action: BattleAction, aimResult?: ShotResult) {
    if (busy) return
    // Resolve the armed free Special. Sharpshot only rides a fired shot; on a
    // reload/dodge it stays armed for a later turn. Others ride any action.
    const a = armedRef.current
    let ability: BattleAbility | undefined
    if (a?.kind === 'repair') ability = { kind: 'repair' }
    else if (a?.kind === 'crew' && !(a.classId === 'sharpshot' && action !== 'fire' && action !== 'volley')) ability = { kind: 'crew', crewId: a.crewId }

    setBusy(true)
    const res = await submitBattleMove(id, action, aimResult, ability)
    setBusy(false)
    if ('error' in res) { pushLog(res.error); return }
    if (ability) {
      // Optimistically spend it (server-confirmed on the next resolve).
      if (ability.kind === 'repair') { setMyFx(f => ({ ...f, usedRepair: true })) }
      else { const crewId = ability.crewId; setMyFx(f => ({ ...f, used: [...f.used, crewId] })) }
      setArmed(null)
    }
    const s = await getShipBattleState(id)
    if ('error' in s) return
    if (s.rounds.some(r => r.round > playedRef.current)) await animateFrom(s)
    else { setPhase('waiting'); pushLog(`Waiting for ${foe.username} to fire…`) }
  }

  // ── Aim bar RAF ──
  const fireRef = useRef(0), fireDir = useRef(1), zoneRef = useRef(0.5), zoneDir = useRef(1)
  const freezeRef = useRef(false)
  const indicatorEl = useRef<HTMLDivElement>(null)
  const zoneElRef = useRef<HTMLDivElement>(null)
  const flashEl = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [pendingAction, setPendingAction] = useState<'fire' | 'volley' | null>(null)

  useEffect(() => {
    if (phase !== 'aiming') return
    freezeRef.current = false
    fireRef.current = 0; fireDir.current = 1; zoneRef.current = 0.5; zoneDir.current = 1
    let last = performance.now()
    const ZONE_SPEED = foe.shipSpeed * 0.0008 * (1 / (1 + me.navigation * 0.015))
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50); last = now
      if (freezeRef.current) { rafRef.current = requestAnimationFrame(tick); return }
      const frames = dt / 16.67
      fireRef.current += INDICATOR_SPEED * frames * fireDir.current
      if (fireRef.current >= 1) { fireRef.current = 1; fireDir.current = -1 }
      if (fireRef.current <= 0) { fireRef.current = 0; fireDir.current = 1 }
      zoneRef.current += ZONE_SPEED * frames * zoneDir.current
      if (zoneRef.current >= 1 - HIT_W - GRAZE_W) { zoneRef.current = 1 - HIT_W - GRAZE_W; zoneDir.current = -1 }
      if (zoneRef.current <= HIT_W + GRAZE_W) { zoneRef.current = HIT_W + GRAZE_W; zoneDir.current = 1 }
      if (indicatorEl.current) {
        indicatorEl.current.style.left = `calc(${fireRef.current * 100}% - 2px)`
        const z = getShotResult(fireRef.current, zoneRef.current, critMultRef.current)
        indicatorEl.current.style.background = z === 'critical' ? '#fbbf24' : z === 'hit' ? '#4ade80' : z === 'graze' ? '#94a3b8' : '#fff'
      }
      if (zoneElRef.current) {
        zoneElRef.current.style.left = `${(zoneRef.current - HIT_W - GRAZE_W) * 100}%`
        zoneElRef.current.style.width = `${(HIT_W + GRAZE_W) * 2 * 100}%`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, foe.shipSpeed, me.navigation])

  function lock() {
    if (phase !== 'aiming' || freezeRef.current || !pendingAction) return
    freezeRef.current = true // WYSIWYG: judge the frozen frame
    const res = getShotResult(fireRef.current, zoneRef.current, critMultRef.current)
    const action = pendingAction
    setPendingAction(null)
    pushLog(`You ${action === 'volley' ? 'load a volley' : 'fire'} — ${res === 'miss' ? 'a miss' : res === 'critical' ? 'CRITICAL aim!' : res}.`)
    setAimBadge(res)
    flashBar(res === 'critical' ? 'rgba(251,191,36,0.9)' : res === 'hit' ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.6)')
    if (res === 'critical') { setCritFlash(true); vibrate([40, 60, 80]); setTimeout(() => setCritFlash(false), 380) }
    else if (res === 'hit') vibrate([30])
    const dur = res === 'critical' ? 720 : res === 'hit' ? 460 : res === 'graze' ? 320 : 220
    setTimeout(() => { setAimBadge(null); void submit(action, res) }, dur)
  }

  const myTurn = phase === 'await_input'
  const canFire = myCharges >= 1, canVolley = myCharges >= 3
  const critBandPct = (CRIT_W * aimCritMult / (HIT_W + GRAZE_W)) * 100

  // Enter the aim phase, applying the Sharpshot crit-zone widen if armed.
  const beginAim = (action: 'fire' | 'volley') => {
    const a = armedRef.current
    const mult = a?.kind === 'crew' && a.classId === 'sharpshot' ? a.critMult : 1
    critMultRef.current = mult
    setAimCritMult(mult)
    setPendingAction(action)
    setPhase('aiming')
  }

  return (
    <main className="min-h-screen pb-20" style={{ maxWidth: 520, margin: '0 auto', position: 'relative' }}>
      {/* Full-screen gold crit flash */}
      <AnimatePresence>
        {critFlash && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.55), rgba(251,191,36,0) 70%)', pointerEvents: 'none', zIndex: 60 }} />}
      </AnimatePresence>
      {/* Center aim-result badge */}
      <AnimatePresence>
        {aimBadge && (
          <motion.div initial={{ opacity: 0, scale: 0.6, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className="font-cinzel font-700" style={{ position: 'fixed', top: '38%', left: 0, right: 0, textAlign: 'center', zIndex: 61, pointerEvents: 'none', fontSize: aimBadge === 'critical' ? '2.6rem' : '2rem', color: aimBadge === 'critical' ? '#fbbf24' : aimBadge === 'hit' ? '#4ade80' : aimBadge === 'graze' ? '#94a3b8' : '#9aa3b2', textShadow: '0 3px 18px rgba(0,0,0,0.7)' }}>
            {aimBadge === 'critical' ? 'CRITICAL!' : aimBadge === 'hit' ? 'HIT!' : aimBadge === 'graze' ? 'Graze' : 'Miss'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tap-a-ship stats popup */}
      <AnimatePresence>
        {statsFor && <StatsPopup info={statsFor} onClose={() => setStatsFor(null)} />}
      </AnimatePresence>

      {/* Specials chooser */}
      <AnimatePresence>
        {chooserOpen && <SpecialChooser crew={me.crew ?? []} repairKit={me.repairKit ?? null} myFx={myFx}
          onPick={(a) => { setArmed(a); setChooserOpen(false) }} onClose={() => setChooserOpen(false)} />}
      </AnimatePresence>

      <div className="px-4 pt-4">
        <Link href="/expeditions" className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: '#9a948a' }}>← Expeditions</Link>
      </div>

      <ShipPanel load={foe} hp={foeHp} shield={foeShield} charges={foeCharges} accent="#f87171" top ctrl={foeShip} splat={splat?.who === 'foe' ? splat : null} onTap={() => setStatsFor({ load: foe, hp: foeHp, you: false })} online={foeOnline} />

      {/* Center: fixed combat log — last events scroll up like the raid log. */}
      <div className="px-4" style={{ marginTop: 8 }}>
        <LogBox lines={log} />
      </div>

      <div style={{ marginTop: 8 }}>
        <ShipPanel load={me} you hp={myHp} shield={myShield} charges={myCharges} accent="#5fd6ff" ctrl={myShip} splat={splat?.who === 'me' ? splat : null} onTap={() => setStatsFor({ load: me, hp: myHp, you: true })} />
      </div>

      {/* Bottom slot: action menu / aim bar+Lock / waiting / result */}
      <div className="px-4 mt-3">
        {phase === 'over' ? (
          <Result iWon={iWon} status={status} foe={foe.username} />
        ) : phase === 'waiting' ? (
          <div className="text-center" style={{ padding: '0.5rem 0' }}>
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }} className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#c0bdb8' }}>Waiting for {foe.username}…</motion.div>
            <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: foeOnline ? '#7fe0a0' : '#6a6764', marginTop: 4 }}>
              {foeOnline ? 'They’re online — choosing their move now.' : 'They’re away. The duel will continue when they return.'}
            </p>
          </div>
        ) : phase === 'aiming' ? (
          <>
            {/* Aim bar — raid AimBarInline */}
            <div style={{ background: '#04080e', border: '1px solid #1f2e42', borderRadius: 12, padding: '0.65rem 0.85rem', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#fbbf24' }}>Lock Your Shot</p>
                <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#5a7a9a' }}>Gold = Crit</p>
              </div>
              <div style={{ position: 'relative', height: 44, marginTop: 8, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, overflow: 'hidden' }}>
                <div ref={flashEl} style={{ position: 'absolute', inset: 0, opacity: 0, background: 'transparent', pointerEvents: 'none', zIndex: 5 }} />
                <div ref={zoneElRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 0, zIndex: 1 }}>
                  <div style={{ position: 'absolute', inset: '3px 0', background: 'rgba(148,163,184,0.15)', borderRadius: 4 }} />
                  <div style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${(GRAZE_W / (HIT_W + GRAZE_W)) * 50}%`, width: `${(HIT_W / (HIT_W + GRAZE_W)) * 100}%`, background: 'rgba(74,222,128,0.22)' }} />
                  <div style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${50 - critBandPct / 2}%`, width: `${critBandPct}%`, background: 'rgba(251,191,36,0.45)', borderRadius: 2 }} />
                  <div style={{ position: 'absolute', top: '20%', bottom: '20%', left: 'calc(50% - 1px)', width: 2, background: '#fbbf24' }} />
                </div>
                <div ref={indicatorEl} style={{ position: 'absolute', top: 2, bottom: 2, width: 4, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.6)', zIndex: 2 }} />
              </div>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a7a9a', textAlign: 'center', marginTop: 6 }}>Tap LOCK when the marker hits the gold center.</p>
            </div>
            <motion.button whileTap={{ scale: 0.96 }} onPointerDown={(e) => { e.preventDefault(); lock() }}
              className="font-cinzel font-700 uppercase tracking-[0.14em]"
              style={{ width: '100%', height: 58, borderRadius: 14, background: '#4ade80', color: '#0a1422', border: 'none', fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(74,222,128,0.35), inset 0 -3px 0 rgba(0,0,0,0.15)', touchAction: 'manipulation' }}>
              Lock Shot
            </motion.button>
          </>
        ) : myTurn ? (
          <>
            {hasSpecials && (
              <div className="flex items-center gap-2 mb-2">
                {armed ? (
                  <div className="flex items-center gap-2 flex-1" style={{ minWidth: 0, background: 'rgba(94,234,212,0.1)', border: '1px solid rgba(94,234,212,0.4)', borderRadius: 12, padding: '0.5rem 0.7rem' }}>
                    <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.1em', color: '#5eead4' }}>Special</span>
                    <span className="font-cinzel font-700 truncate" style={{ fontSize: '0.8rem', color: '#d6fff7' }}>{armed.label}</span>
                    <button onClick={() => setArmed(null)} className="ml-auto font-karla font-700" style={{ fontSize: '0.9rem', color: '#7fcabb', lineHeight: 1, padding: '0 0.2rem' }} aria-label="Clear special">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setChooserOpen(true)} disabled={busy} className="font-karla font-700 uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 flex-1"
                    style={{ padding: '0.55rem', borderRadius: 12, background: 'linear-gradient(180deg, rgba(94,234,212,0.16), rgba(94,234,212,0.07))', border: '1px solid rgba(94,234,212,0.4)', color: '#5eead4', fontSize: '0.66rem', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>✦</span> Specials
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <ActionBtn label="Reload" sub="+1 charge" color="#60a5fa" disabled={busy || myCharges >= 3} onClick={() => submit('reload')} />
              <ActionBtn label="Dodge" sub={myLastAction === 'dodge' ? 'on cooldown' : 'evade their shot'} color="#a78bfa" disabled={busy || myLastAction === 'dodge'} onClick={() => submit('dodge')} />
              <ActionBtn label="Fire" sub={canFire ? (armed?.kind === 'crew' && armed.critMult > 1 ? 'aim · wide crit' : 'aim · 1 charge') : 'no charge'} color="#f0c040" disabled={busy || !canFire} onClick={() => beginAim('fire')} />
              <ActionBtn label="Volley" sub={canVolley ? 'aim · 3 · 2×' : 'need 3'} color="#fb923c" disabled={busy || !canVolley} onClick={() => beginAim('volley')} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}

// Fixed-height combat log — newest line at the bottom, older lines scroll up
// and fade out the top, exactly like the raid log. Never flexes the layout.
function LogBox({ lines }: { lines: { id: number; text: string }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [lines])
  return (
    <div ref={ref} style={{ height: 108, overflow: 'hidden', background: '#04080e', border: '1px solid #1f2e42', borderRadius: 12, padding: '0.6rem 0.85rem', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 22px)', maskImage: 'linear-gradient(to bottom, transparent 0, #000 22px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: '100%', gap: 5 }}>
        {lines.map(l => (
          <motion.p key={l.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}
            className="font-karla font-500" style={{ fontSize: '0.74rem', color: '#cdd6e2', lineHeight: 1.3 }}>{l.text}</motion.p>
        ))}
      </div>
    </div>
  )
}

function ShipPanel({ load, you, hp, shield = 0, charges, accent, top, ctrl, splat, onTap, online }: {
  load: BattleLoadout; you?: boolean; hp: number; shield?: number; charges: number; accent: string; top?: boolean
  ctrl: ReturnType<typeof useAnimation>
  splat: { dmg: number; crit: boolean; dodged: boolean; heal?: number; burn?: boolean; frozen?: boolean } | null
  onTap: () => void
  online?: boolean
}) {
  const hpMax = load.hpMax
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, hpMax)) * 100))
  // Tidecaller shield — a cyan armor segment riding above the hull, scaled to
  // the same hull-max so its length reads against the HP bar.
  const shieldPct = Math.max(0, Math.min(100, (shield / Math.max(1, hpMax)) * 100))
  return (
    <div className="px-4" style={{ paddingTop: top ? 8 : 0 }}>
      <div onClick={onTap} style={{ position: 'relative', background: 'rgba(11,14,20,0.9)', border: `1px solid ${accent}40`, borderRadius: 14, padding: '0.7rem 0.9rem', cursor: 'pointer' }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <CharacterAvatar characterColor={load.characterColor ?? null} equippedHat={load.equippedHat ?? null} size={26} ringColor={load.avatarBorderColor ?? undefined} bgColor={load.avatarBgColor ?? undefined} />
            <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.92rem', color: '#f4ecd8' }}>{you ? `${load.username} (you)` : load.username}</p>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={`${accent}aa`} strokeWidth="2" aria-hidden style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            {online !== undefined && (
              <span className="flex items-center gap-1 flex-shrink-0" style={{ marginLeft: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? '#4ade80' : '#6a6764', boxShadow: online ? '0 0 6px #4ade80' : 'none' }} />
                <span className="font-karla font-600 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: online ? '#7fe0a0' : '#6a6764' }}>{online ? 'online' : 'away'}</span>
              </span>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {[0, 1, 2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < charges ? accent : 'rgba(255,255,255,0.12)', boxShadow: i < charges ? `0 0 6px ${accent}` : 'none' }} />)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative', flexShrink: 0, width: 96, height: 66 }}>
            <motion.div animate={ctrl} style={{ width: '100%', height: '100%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={load.shipImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 3px 10px ${accent}55)` }} />
            </motion.div>
            {/* Damage splat — large, centered ON the ship, like the raid hitsplats. */}
            <AnimatePresence>
              {splat && (
                <motion.div key={`${splat.dmg}-${splat.crit}-${splat.dodged}-${splat.heal ?? 0}-${splat.burn ? 'b' : ''}${splat.frozen ? 'f' : ''}`}
                  initial={{ opacity: 0, scale: 0.5, y: 4 }} animate={{ opacity: 1, scale: 1, y: -8 }} exit={{ opacity: 0, scale: 1.25, y: -16 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                  className="font-cinzel font-700"
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3,
                    fontSize: splat.frozen ? '1.05rem' : splat.heal || splat.burn ? '1.5rem' : splat.dodged ? '1.05rem' : splat.crit ? '2.1rem' : '1.6rem',
                    color: splat.frozen ? '#7dd3fc' : splat.burn ? '#fb923c' : splat.heal ? '#4ade80' : splat.dodged ? '#cbd5e1' : splat.crit ? '#fde047' : '#ffffff',
                    WebkitTextStroke: splat.frozen ? '1.5px rgba(8,47,73,0.9)' : splat.burn ? '1.5px rgba(124,45,18,0.95)' : splat.heal ? '1.5px rgba(6,78,38,0.9)' : splat.dodged ? undefined : '1.5px rgba(150,12,12,0.95)',
                    textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.6)' }}>
                  {splat.frozen ? 'FROZEN' : splat.heal ? `+${splat.heal}` : splat.dodged ? 'MISS' : `-${splat.dmg}${splat.crit ? '!' : ''}`}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <motion.div animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} style={{ height: '100%', background: pct > 50 ? '#4ade80' : pct > 22 ? '#fbbf24' : '#f87171' }} />
            </div>
            {/* Tidecaller shield bar — only present while a shield holds. */}
            <AnimatePresence>
              {shield > 0 && (
                <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: 6, marginTop: 3 }} exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  style={{ borderRadius: 4, background: 'rgba(125,211,252,0.14)', overflow: 'hidden', border: '1px solid rgba(125,211,252,0.3)' }}>
                  <motion.div animate={{ width: `${shieldPct}%` }} transition={{ type: 'spring', stiffness: 220, damping: 26 }} style={{ height: '100%', background: 'linear-gradient(90deg, #38bdf8, #7dd3fc)', boxShadow: '0 0 8px rgba(125,211,252,0.6)' }} />
                </motion.div>
              )}
            </AnimatePresence>
            <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#9a948a', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
              {hp} / {hpMax} hull{shield > 0 && <span style={{ color: '#7dd3fc' }}> · +{shield} shield</span>}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ label, sub, color, disabled, onClick }: { label: string; sub: string; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={disabled ? undefined : onClick} disabled={disabled} whileTap={disabled ? undefined : { scale: 0.97 }}
      className="font-karla font-700 uppercase tracking-[0.08em]"
      style={{ padding: '0.7rem 0.5rem', borderRadius: 12, textAlign: 'center', background: disabled ? 'rgba(255,255,255,0.04)' : `linear-gradient(180deg, ${color}26 0%, ${color}12 100%)`, border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `${color}5a`}`, color: disabled ? '#5a5654' : color, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      <div style={{ fontSize: '0.8rem' }}>{label}</div>
      <div className="font-karla font-400" style={{ fontSize: '0.54rem', color: disabled ? '#4a4845' : `${color}cc`, marginTop: 2, letterSpacing: '0.04em' }}>{sub}</div>
    </motion.button>
  )
}

function StatsPopup({ info, onClose }: { info: { load: BattleLoadout; hp: number; you: boolean }; onClose: () => void }) {
  const l = info.load
  const { hitMin, powerMax, critMax } = raidDamageProfile(l.totalPower, l.shipMinDamage, l.damagePct)
  const critMin = l.shipMinDamage * 2
  const speed = l.shipSpeed + l.navigation
  const defensePct = Math.round((1 - l.incomingDamageMult) * 100)
  const items = (l.equippedRaidItems ?? []).map(getRaidItem).filter((i): i is NonNullable<ReturnType<typeof getRaidItem>> => !!i)
  const classNames = Object.values(l.shipClasses ?? {}).map(c => getShipClass(c)?.name).filter((n): n is string => !!n)
  const rows: { label: string; value: string; color: string }[] = [
    { label: 'Hull', value: `${info.hp} / ${l.hpMax}`, color: '#4ade80' },
    { label: 'Damage', value: `${hitMin}–${powerMax}`, color: '#f87171' },
    { label: 'Crit Damage', value: `${critMin}–${critMax}`, color: '#fbbf24' },
    { label: 'Speed', value: String(speed), color: '#60a5fa' },
  ]
  if (defensePct > 0) rows.push({ label: 'Defense', value: `${defensePct}% less taken`, color: '#a78bfa' })
  if (l.critPct > 0) rows.push({ label: 'Crit Chance', value: `+${Math.round(l.critPct)}%`, color: '#fbbf24' })

  // Combat traits — the proc/trigger effects that actually fire in a duel, so
  // both captains can read the threat before committing a move.
  const pct = (n: number) => Math.round(n * 100)
  const traits: { name: string; value: string; desc: string; color: string }[] = []
  if (l.firstStrike) traits.push({ name: 'First Strike', value: '', desc: 'Always acts first each round.', color: '#fbbf24' })
  const dt = l.damageTakenPct ?? 0
  if (dt < 0) traits.push({ name: 'Bulwark', value: `${dt}%`, desc: 'Takes less damage from every hit.', color: '#a78bfa' })
  else if (dt > 0) traits.push({ name: 'Soft Shell', value: `+${dt}%`, desc: 'Takes extra damage from every hit.', color: '#f87171' })
  if ((l.parryChance ?? 0) > 0 && (l.parryReflectPct ?? 0) > 0) traits.push({ name: 'Parry', value: `${pct(l.parryChance!)}%`, desc: `On a clean dodge, turns ${pct(l.parryReflectPct!)}% of the shot back on you.`, color: '#67e8f9' })
  if ((l.burnChance ?? 0) > 0) traits.push({ name: 'Incendiary', value: `${pct(l.burnChance!)}%`, desc: 'Their hits can set you ablaze (burns 2 turns).', color: '#fb923c' })
  if ((l.freezeChance ?? 0) > 0) traits.push({ name: 'Frozen Shot', value: `${pct(l.freezeChance!)}%`, desc: 'Their hits can freeze you, costing your next turn.', color: '#7dd3fc' })
  if ((l.startChargeChance ?? 0) > 0) traits.push({ name: 'First Cut', value: `${pct(l.startChargeChance!)}%`, desc: 'May open the duel with a cannon already loaded.', color: '#cbd5e1' })
  if ((l.rampDamagePerTurn ?? 0) > 0) traits.push({ name: 'Escalation', value: `+${pct(l.rampDamagePerTurn!)}%/rd`, desc: 'Damage grows each round the duel drags on.', color: '#f472b6' })

  const crewSpecials = (l.crew ?? []).map(c => {
    const def = CLASSES[c.classId]
    const m = currentMilestone(def, c.level)
    return { id: c.id, name: c.name, label: def.shortLabel, color: def.color, desc: m?.desc ?? '' }
  }).filter(c => c.desc)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
      <motion.div onClick={e => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}
        style={{ width: '100%', maxWidth: 360, background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 20, padding: '1.1rem 1rem', boxShadow: '0 18px 60px rgba(0,0,0,0.55)', maxHeight: 'calc(100dvh - 4rem)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <CharacterAvatar characterColor={l.characterColor ?? null} equippedHat={l.equippedHat ?? null} size={52} ringColor={l.avatarBorderColor ?? undefined} bgColor={l.avatarBgColor ?? undefined} />
          <div style={{ minWidth: 0 }}>
            <p className="font-cinzel font-700 truncate" style={{ fontSize: '1.15rem', color: '#f4ecd8' }}>{l.username}{info.you ? ' (you)' : ''}</p>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.shipImageUrl} alt="" style={{ width: 40, height: 28, objectFit: 'contain' }} />
              <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a8aa0' }}>Tier {l.shipTier} hull</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {rows.map(r => (
            <div key={r.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.55rem 0.7rem' }}>
              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: '#7a8aa0' }}>{r.label}</p>
              <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: r.color, fontVariantNumeric: 'tabular-nums' }}>{r.value}</p>
            </div>
          ))}
        </div>
        {traits.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7a8aa0', marginBottom: 5 }}>Combat Traits</p>
            <div className="flex flex-col gap-1.5">
              {traits.map(t => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${t.color}33`, borderRadius: 10, padding: '0.4rem 0.6rem' }}>
                  <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: t.color }}>{t.name}</p>
                      {t.value && <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: t.color, fontVariantNumeric: 'tabular-nums' }}>{t.value}</span>}
                    </div>
                    <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: '#8a93a3', lineHeight: 1.35 }}>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {crewSpecials.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7a8aa0', marginBottom: 5 }}>Crew Specials {info.you ? '' : '(once each)'}</p>
            <div className="flex flex-col gap-1.5">
              {crewSpecials.map(c => (
                <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.color}33`, borderRadius: 10, padding: '0.45rem 0.65rem' }}>
                  <div className="flex items-center gap-1.5">
                    <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.74rem', color: '#f0ede8' }}>{c.name}</p>
                    <span className="font-karla font-700 uppercase flex-shrink-0" style={{ fontSize: '0.48rem', letterSpacing: '0.08em', color: c.color, background: `${c.color}1f`, borderRadius: 999, padding: '0.08rem 0.4rem' }}>{c.label}</span>
                  </div>
                  <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: '#8a93a3', lineHeight: 1.35, marginTop: 1 }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {classNames.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7a8aa0', marginBottom: 5 }}>Ship Classes</p>
            <div className="flex flex-wrap gap-1.5">
              {classNames.map((n, i) => <span key={i} className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#bfe3ff', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 999, padding: '0.14rem 0.5rem' }}>{n}</span>)}
            </div>
          </div>
        )}
        {items.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7a8aa0', marginBottom: 5 }}>Equipped Items</p>
            <div className="flex flex-col gap-1.5">
              {items.map(it => (
                <div key={it.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.45rem 0.65rem' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: '#f0ede8' }}>{it.name}</p>
                  <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#8a93a3', lineHeight: 1.4 }}>{it.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// Crew Specials + repair-kit chooser — mirrors the raid Special picker. Tap a
// card to ARM it; it fires on your next move (free, once per duel). Sharpshot
// only rides a shot; the rest ride any action.
function SpecialChooser({ crew, repairKit, myFx, onPick, onClose }: {
  crew: BattleCrew[]
  repairKit: { name: string; healMin: number; healMax: number } | null
  myFx: { used: number[]; usedRepair: boolean }
  onPick: (a: Armed) => void
  onClose: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem' }}>
      <motion.div onClick={e => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        style={{ width: '100%', maxWidth: 460, background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)', border: '1px solid rgba(94,234,212,0.22)', borderRadius: 20, padding: '1rem', boxShadow: '0 18px 60px rgba(0,0,0,0.6)', maxHeight: 'calc(100dvh - 5rem)', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-2.5">
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#d6fff7' }}>Crew Specials</p>
          <button onClick={onClose} className="font-karla font-700" style={{ fontSize: '1.1rem', color: '#7fcabb', lineHeight: 1 }} aria-label="Close">✕</button>
        </div>
        <p className="font-karla font-400 mb-3" style={{ fontSize: '0.64rem', color: '#7a8aa0', lineHeight: 1.4 }}>One free Special per round, once each per duel. It fires alongside your move.</p>

        <div className="flex flex-col gap-2">
          {crew.map(c => {
            const def = CLASSES[c.classId]
            const m = currentMilestone(def, c.level)
            const spent = myFx.used.includes(c.id)
            const critMult = m && 'critZoneMultiplier' in m ? 1 + m.critZoneMultiplier : 1
            return (
              <button key={c.id} disabled={spent || !m}
                onClick={() => m && onPick({ kind: 'crew', crewId: c.id, classId: c.classId, label: def.shortLabel, critMult })}
                className="text-left flex items-center gap-3"
                style={{ background: spent ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${spent ? 'rgba(255,255,255,0.08)' : def.color + '4d'}`, borderRadius: 12, padding: '0.6rem 0.75rem', cursor: spent ? 'default' : 'pointer', opacity: spent ? 0.5 : 1 }}>
                <span style={{ fontSize: '1.35rem', lineHeight: 1, flexShrink: 0, filter: spent ? 'grayscale(1)' : 'none' }}>{def.emoji}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center gap-1.5">
                    <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.84rem', color: '#f0ede8' }}>{c.name}</p>
                    <span className="font-karla font-700 uppercase flex-shrink-0" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: def.color, background: def.color + '1f', borderRadius: 999, padding: '0.08rem 0.4rem' }}>{def.shortLabel}</span>
                  </div>
                  <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#9aa3b2', lineHeight: 1.35, marginTop: 1 }}>{m?.desc ?? 'Locked.'}</p>
                </div>
                {spent && <span className="font-karla font-700 uppercase flex-shrink-0" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: '#6a6764' }}>Spent</span>}
              </button>
            )
          })}

          {repairKit && (
            <button disabled={myFx.usedRepair}
              onClick={() => onPick({ kind: 'repair', label: 'Repair Kit' })}
              className="text-left flex items-center gap-3"
              style={{ background: myFx.usedRepair ? 'rgba(255,255,255,0.02)' : 'rgba(74,222,128,0.06)', border: `1px solid ${myFx.usedRepair ? 'rgba(255,255,255,0.08)' : 'rgba(74,222,128,0.4)'}`, borderRadius: 12, padding: '0.6rem 0.75rem', cursor: myFx.usedRepair ? 'default' : 'pointer', opacity: myFx.usedRepair ? 0.5 : 1 }}>
              <span style={{ fontSize: '1.35rem', lineHeight: 1, flexShrink: 0, filter: myFx.usedRepair ? 'grayscale(1)' : 'none' }}>🛠️</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.84rem', color: '#f0ede8' }}>{repairKit.name}</p>
                <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#9aa3b2', lineHeight: 1.35, marginTop: 1 }}>Patch the hull for {repairKit.healMin}–{repairKit.healMax} HP. Once per duel.</p>
              </div>
              {myFx.usedRepair && <span className="font-karla font-700 uppercase flex-shrink-0" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: '#6a6764' }}>Spent</span>}
            </button>
          )}

          {crew.length === 0 && !repairKit && (
            <p className="font-karla font-400 text-center" style={{ fontSize: '0.7rem', color: '#7a8aa0', padding: '0.5rem 0' }}>No Specials available. Level crew to 10+ to unlock their ability.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function Result({ iWon, status, foe }: { iWon: boolean | null; status: string; foe: string }) {
  const voided = status === 'expired'
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
      <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: voided ? '#9a948a' : iWon ? '#fbbf24' : '#f87171', textShadow: '0 0 16px rgba(0,0,0,0.6)' }}>
        {voided ? 'Duel Voided' : iWon ? 'Victory!' : 'Defeated'}
      </p>
      <p className="font-karla font-400" style={{ fontSize: '0.75rem', color: '#9a948a', marginTop: 6 }}>
        {voided ? 'The duel timed out with no result.' : iWon ? `You sank ${foe}’s ship.` : `${foe} sent you to the depths.`}
      </p>
      <Link href="/expeditions" className="font-karla font-700 uppercase tracking-[0.1em] inline-block mt-4" style={{ fontSize: '0.66rem', padding: '0.55rem 1.4rem', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: '#e0ddd8', textDecoration: 'none' }}>
        Back to Expeditions
      </Link>
    </motion.div>
  )
}
