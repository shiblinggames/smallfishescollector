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
import { submitBattleMove, getShipBattleState, type ShipBattleState } from '@/app/(app)/social/shipBattleActions'
import type { BattleAction, ShotResult, RoundStep, BattleLoadout } from '@/lib/shipBattle/resolver'

// Aim-bar geometry — verbatim from RaidCombat so the skill window is identical.
const GRAZE_W = 0.038, HIT_W = 0.06, CRIT_W = 0.012, INDICATOR_SPEED = 0.006
function getShotResult(pos: number, zoneCenter: number): ShotResult {
  if (pos >= zoneCenter - CRIT_W && pos <= zoneCenter + CRIT_W) return 'critical'
  if (pos >= zoneCenter - HIT_W && pos <= zoneCenter + HIT_W) return 'hit'
  if (pos >= zoneCenter - HIT_W - GRAZE_W && pos <= zoneCenter + HIT_W + GRAZE_W) return 'graze'
  return 'miss'
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const vibrate = (p: number | number[]) => { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) { try { navigator.vibrate(p) } catch {} } }

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
  const [splat, setSplat] = useState<{ who: 'me' | 'foe'; dmg: number; crit: boolean; dodged: boolean } | null>(null)
  const [log, setLog] = useState<{ id: number; text: string }[]>([{ id: 0, text: 'The duel begins.' }])
  const logId = useRef(1)
  const pushLog = useCallback((text: string) => setLog(prev => [...prev, { id: logId.current++, text }].slice(-24)), [])
  const [busy, setBusy] = useState(false)
  const [critFlash, setCritFlash] = useState(false)
  const [aimBadge, setAimBadge] = useState<ShotResult | null>(null)
  const [statsFor, setStatsFor] = useState<{ load: BattleLoadout; hp: number; you: boolean } | null>(null)
  const playedRef = useRef(initial.rounds.length)

  const myShip = useAnimation()
  const foeShip = useAnimation()

  const initialPhase: UIPhase = initial.status !== 'active' ? 'over' : initial.myMoveIn ? 'waiting' : 'await_input'
  const [phase, setPhase] = useState<UIPhase>(initialPhase)
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

  // ── Animate any resolved round(s) we haven't shown ──
  const animateFrom = useCallback(async (state: ShipBattleState) => {
    if (state.rounds.length <= playedRef.current) return
    setPhase('animating')
    for (let i = playedRef.current; i < state.rounds.length; i++) {
      for (const s of state.rounds[i].steps) {
        pushLog(s.log)
        const actorIsMe = (s.actor === 'challenger') === isChallenger
        const targetMyHp = isChallenger ? s.challengerHp : s.opponentHp
        const targetFoeHp = isChallenger ? s.opponentHp : s.challengerHp
        const targetMyCh = isChallenger ? s.challengerCharges : s.opponentCharges
        const targetFoeCh = isChallenger ? s.opponentCharges : s.challengerCharges
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
          setMyHp(targetMyHp); setFoeHp(targetFoeHp); setMyCharges(targetMyCh); setFoeCharges(targetFoeCh)
          await sleep(820)
        } else {
          setMyCharges(targetMyCh); setFoeCharges(targetFoeCh)
          await sleep(720)
        }
        setSplat(null)
        await sleep(160)
      }
    }
    playedRef.current = state.rounds.length
    if (state.status !== 'active') {
      setStatus(state.status); setIWon(state.iWon); setPhase('over')
      pushLog(state.status === 'expired' ? 'The duel timed out.' : state.iWon ? 'Victory — their ship is sunk!' : 'Your ship is sunk.')
    } else if (state.myMoveIn) { setPhase('waiting'); pushLog(`Waiting for ${foe.username} to fire…`) }
    else { setPhase('await_input'); pushLog(`Round ${state.round} — your move.`) }
  }, [isChallenger, myShip, foeShip, pushLog, foe.username])

  // ── Poll while waiting on the opponent ──
  useEffect(() => {
    if (phase !== 'waiting') return
    let alive = true
    const t = setInterval(async () => {
      const s = await getShipBattleState(id)
      if (!alive || 'error' in s) return
      if (s.rounds.length > playedRef.current) await animateFrom(s)
      else if (s.status !== 'active') { setStatus(s.status); setIWon(s.iWon); setPhase('over') }
    }, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [phase, id, animateFrom])

  async function submit(action: BattleAction, aimResult?: ShotResult) {
    if (busy) return
    setBusy(true)
    const res = await submitBattleMove(id, action, aimResult)
    setBusy(false)
    if ('error' in res) { pushLog(res.error); return }
    const s = await getShipBattleState(id)
    if ('error' in s) return
    if (s.rounds.length > playedRef.current) await animateFrom(s)
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
        const z = getShotResult(fireRef.current, zoneRef.current)
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
    const res = getShotResult(fireRef.current, zoneRef.current)
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
  const critBandPct = (CRIT_W / (HIT_W + GRAZE_W)) * 100

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

      <div className="px-4 pt-4">
        <Link href="/expeditions" className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: '#9a948a' }}>← Expeditions</Link>
      </div>

      <ShipPanel load={foe} hp={foeHp} charges={foeCharges} accent="#f87171" top ctrl={foeShip} splat={splat?.who === 'foe' ? splat : null} onTap={() => setStatsFor({ load: foe, hp: foeHp, you: false })} />

      {/* Center: fixed combat log — last events scroll up like the raid log. */}
      <div className="px-4" style={{ marginTop: 8 }}>
        <LogBox lines={log} />
      </div>

      <div style={{ marginTop: 8 }}>
        <ShipPanel load={me} you hp={myHp} charges={myCharges} accent="#5fd6ff" ctrl={myShip} splat={splat?.who === 'me' ? splat : null} onTap={() => setStatsFor({ load: me, hp: myHp, you: true })} />
      </div>

      {/* Bottom slot: action menu / aim bar+Lock / waiting / result */}
      <div className="px-4 mt-3">
        {phase === 'over' ? (
          <Result iWon={iWon} status={status} foe={foe.username} />
        ) : phase === 'waiting' ? (
          <div className="text-center" style={{ padding: '0.5rem 0' }}>
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }} className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#c0bdb8' }}>Waiting for {foe.username}…</motion.div>
            <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#6a6764', marginTop: 4 }}>Your move is locked. Check back when they’ve fired.</p>
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
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn label="Reload" sub="+1 charge" color="#60a5fa" disabled={busy || myCharges >= 3} onClick={() => submit('reload')} />
            <ActionBtn label="Dodge" sub="evade their shot" color="#a78bfa" disabled={busy} onClick={() => submit('dodge')} />
            <ActionBtn label="Fire" sub={canFire ? 'aim · 1 charge' : 'no charge'} color="#f0c040" disabled={busy || !canFire} onClick={() => { setPendingAction('fire'); setPhase('aiming') }} />
            <ActionBtn label="Volley" sub={canVolley ? 'aim · 3 · 2×' : 'need 3'} color="#fb923c" disabled={busy || !canVolley} onClick={() => { setPendingAction('volley'); setPhase('aiming') }} />
          </div>
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

function ShipPanel({ load, you, hp, charges, accent, top, ctrl, splat, onTap }: {
  load: BattleLoadout; you?: boolean; hp: number; charges: number; accent: string; top?: boolean
  ctrl: ReturnType<typeof useAnimation>
  splat: { dmg: number; crit: boolean; dodged: boolean } | null
  onTap: () => void
}) {
  const hpMax = load.hpMax
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, hpMax)) * 100))
  return (
    <div className="px-4" style={{ paddingTop: top ? 8 : 0 }}>
      <div onClick={onTap} style={{ position: 'relative', background: 'rgba(11,14,20,0.9)', border: `1px solid ${accent}40`, borderRadius: 14, padding: '0.7rem 0.9rem', cursor: 'pointer' }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <CharacterAvatar characterColor={load.characterColor ?? null} equippedHat={load.equippedHat ?? null} size={26} ringColor={load.avatarBorderColor ?? undefined} bgColor={load.avatarBgColor ?? undefined} />
            <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.92rem', color: '#f4ecd8' }}>{you ? `${load.username} (you)` : load.username}</p>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={`${accent}aa`} strokeWidth="2" aria-hidden style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
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
                <motion.div key={`${splat.dmg}-${splat.crit}-${splat.dodged}`}
                  initial={{ opacity: 0, scale: 0.5, y: 4 }} animate={{ opacity: 1, scale: 1, y: -8 }} exit={{ opacity: 0, scale: 1.25, y: -16 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                  className="font-cinzel font-700"
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3,
                    fontSize: splat.dodged ? '1.05rem' : splat.crit ? '2.1rem' : '1.6rem',
                    color: splat.dodged ? '#cbd5e1' : splat.crit ? '#fde047' : '#ffffff',
                    WebkitTextStroke: splat.dodged ? undefined : '1.5px rgba(150,12,12,0.95)',
                    textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.6)' }}>
                  {splat.dodged ? 'MISS' : `-${splat.dmg}${splat.crit ? '!' : ''}`}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <motion.div animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} style={{ height: '100%', background: pct > 50 ? '#4ade80' : pct > 22 ? '#fbbf24' : '#f87171' }} />
            </div>
            <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#9a948a', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{hp} / {hpMax} hull</p>
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
