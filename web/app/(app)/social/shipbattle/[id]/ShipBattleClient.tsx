'use client'

// Async Ship PvP — battle screen (v1). The server owns ALL resolution
// (lib/shipBattle/resolver); this client only (a) takes the player's action +
// aim skill input and submits it, and (b) ANIMATES the server-rolled round log
// so both captains see identical numbers. The aim bar is ported from the raid
// (RaidCombat.tsx) so the skill feel matches; everything else is purpose-built
// and far simpler because there are no client-side rolls.

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { submitBattleMove, getShipBattleState, type ShipBattleState } from '@/app/(app)/social/shipBattleActions'
import type { BattleAction, ShotResult, RoundStep } from '@/lib/shipBattle/resolver'

// Aim-bar geometry — verbatim from RaidCombat so the skill window is identical.
const GRAZE_W = 0.038, HIT_W = 0.06, CRIT_W = 0.012, INDICATOR_SPEED = 0.006
function getShotResult(pos: number, zoneCenter: number): ShotResult {
  if (pos >= zoneCenter - CRIT_W && pos <= zoneCenter + CRIT_W) return 'critical'
  if (pos >= zoneCenter - HIT_W && pos <= zoneCenter + HIT_W) return 'hit'
  if (pos >= zoneCenter - HIT_W - GRAZE_W && pos <= zoneCenter + HIT_W + GRAZE_W) return 'graze'
  return 'miss'
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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
  const [round, setRound] = useState(initial.round)
  const [splat, setSplat] = useState<{ who: 'me' | 'foe'; dmg: number; crit: boolean; dodged: boolean } | null>(null)
  const [logLine, setLogLine] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const playedRef = useRef(initial.rounds.length)

  const initialPhase: UIPhase =
    initial.status !== 'active' ? 'over' : initial.myMoveIn ? 'waiting' : 'await_input'
  const [phase, setPhase] = useState<UIPhase>(initialPhase)

  const isChallenger = initial.side === 'challenger'
  // Map a resolved step's challenger/opponent fields to me/foe.
  const stepMine = useCallback(<T,>(s: RoundStep, c: T, o: T): T => (isChallenger ? c : o), [isChallenger])

  // ── Animate any round(s) the server resolved that we haven't shown ──
  const animateFrom = useCallback(async (state: ShipBattleState) => {
    const rounds = state.rounds
    if (rounds.length <= playedRef.current) return
    setPhase('animating')
    for (let i = playedRef.current; i < rounds.length; i++) {
      for (const s of rounds[i].steps) {
        setLogLine(s.log)
        const targetMyHp = stepMine(s, s.challengerHp, s.opponentHp)
        const targetFoeHp = stepMine(s, s.opponentHp, s.challengerHp)
        const targetMyCh = stepMine(s, s.challengerCharges, s.opponentCharges)
        const targetFoeCh = stepMine(s, s.opponentCharges, s.challengerCharges)
        if (s.damage > 0 || s.dodged) {
          // The actor fired at the OTHER side.
          const actorIsMe = (s.actor === 'challenger') === isChallenger
          setSplat({ who: actorIsMe ? 'foe' : 'me', dmg: s.damage, crit: s.crit, dodged: s.dodged })
        }
        setMyHp(targetMyHp); setFoeHp(targetFoeHp)
        setMyCharges(targetMyCh); setFoeCharges(targetFoeCh)
        await sleep(1050)
        setSplat(null)
        await sleep(180)
      }
    }
    playedRef.current = rounds.length
    setRound(state.round)
    setLogLine('')
    if (state.status !== 'active') { setStatus(state.status); setIWon(state.iWon); setPhase('over') }
    else setPhase(state.myMoveIn ? 'waiting' : 'await_input')
  }, [isChallenger, stepMine])

  // ── Poll while waiting on the opponent ──
  useEffect(() => {
    if (phase !== 'waiting') return
    let alive = true
    const tick = async () => {
      const s = await getShipBattleState(id)
      if (!alive || 'error' in s) return
      if (s.rounds.length > playedRef.current) { await animateFrom(s) }
      else if (s.status !== 'active') { setStatus(s.status); setIWon(s.iWon); setPhase('over') }
    }
    const t = setInterval(tick, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [phase, id, animateFrom])

  // ── Submit a non-aim action (reload / dodge) ──
  async function submit(action: BattleAction, aimResult?: ShotResult) {
    if (busy) return
    setBusy(true)
    const res = await submitBattleMove(id, action, aimResult)
    setBusy(false)
    if ('error' in res) { setLogLine(res.error); return }
    const s = await getShipBattleState(id)
    if ('error' in s) return
    if (s.rounds.length > playedRef.current) await animateFrom(s)
    else setPhase('waiting')
  }

  // ── Aim bar ──
  const fireRef = useRef(0.5), fireDir = useRef(1), zoneRef = useRef(0.5), zoneDir = useRef(1)
  const freezeRef = useRef(false)
  const needleEl = useRef<HTMLDivElement>(null)
  const zoneEl = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [pendingAction, setPendingAction] = useState<'fire' | 'volley' | null>(null)

  useEffect(() => {
    if (phase !== 'aiming') return
    freezeRef.current = false
    fireRef.current = 0; fireDir.current = 1
    zoneRef.current = 0.5; zoneDir.current = 1
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
      if (needleEl.current) {
        needleEl.current.style.left = `calc(${fireRef.current * 100}% - 2px)`
        const z = getShotResult(fireRef.current, zoneRef.current)
        needleEl.current.style.background = z === 'critical' ? '#fbbf24' : z === 'hit' ? '#4ade80' : z === 'graze' ? '#94a3b8' : 'rgba(255,255,255,0.5)'
      }
      if (zoneEl.current) {
        zoneEl.current.style.left = `${(zoneRef.current - HIT_W - GRAZE_W) * 100}%`
        zoneEl.current.style.width = `${(HIT_W + GRAZE_W) * 2 * 100}%`
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, foe.shipSpeed, me.navigation])

  function lock() {
    if (phase !== 'aiming' || freezeRef.current || !pendingAction) return
    freezeRef.current = true // WYSIWYG: judge the frozen frame
    const result = getShotResult(fireRef.current, zoneRef.current)
    const action = pendingAction
    setPendingAction(null)
    setLogLine(result === 'miss' ? 'Missed!' : result === 'critical' ? 'Critical hit!' : result === 'graze' ? 'Grazing shot.' : 'Solid hit.')
    setTimeout(() => { void submit(action, result) }, 650)
  }

  const myTurn = phase === 'await_input'
  const canFire = myCharges >= 1, canVolley = myCharges >= 3

  return (
    <main className="min-h-screen pb-20" style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="px-4 pt-4">
        <Link href="/social" className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: '#9a948a' }}>← Crew</Link>
      </div>

      {/* Opponent */}
      <ShipPanel name={foe.username} hp={foeHp} hpMax={foe.hpMax} charges={foeCharges} img={foe.shipImageUrl} accent="#f87171" top
        splat={splat?.who === 'foe' ? splat : null} />

      {/* Center: round / log / aim / result */}
      <div style={{ minHeight: 132, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 1rem', position: 'relative' }}>
        {phase === 'over' ? (
          <Result iWon={iWon} status={status} foe={foe.username} />
        ) : phase === 'aiming' ? (
          <div style={{ width: '100%' }} onPointerDown={(e) => { e.preventDefault(); lock() }}>
            <p className="font-karla font-700 uppercase text-center" style={{ fontSize: '0.6rem', letterSpacing: '0.14em', color: '#fbbf24', marginBottom: 8 }}>Tap to fire</p>
            <div style={{ position: 'relative', height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', overflow: 'hidden', cursor: 'pointer' }}>
              <div ref={zoneEl} style={{ position: 'absolute', top: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(148,163,184,0.25), rgba(74,222,128,0.3) 35%, rgba(251,191,36,0.55) 50%, rgba(74,222,128,0.3) 65%, rgba(148,163,184,0.25))' }} />
              <div ref={needleEl} style={{ position: 'absolute', top: -3, bottom: -3, width: 4, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.7)' }} />
            </div>
          </div>
        ) : phase === 'waiting' ? (
          <div className="text-center">
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }} className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#c0bdb8' }}>
              Waiting for {foe.username}…
            </motion.div>
            <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#6a6764', marginTop: 4 }}>Your move is locked in. Come back when they’ve fired.</p>
          </div>
        ) : (
          <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e6e1d6', minHeight: 22 }}>{logLine || `Round ${round} — choose your move`}</p>
        )}
      </div>

      {/* Me */}
      <ShipPanel name={`${me.username} (you)`} hp={myHp} hpMax={me.hpMax} charges={myCharges} img={me.shipImageUrl} accent="#5fd6ff"
        splat={splat?.who === 'me' ? splat : null} />

      {/* Action picker */}
      {myTurn && (
        <div className="px-4 mt-3 grid grid-cols-2 gap-2">
          <ActionBtn label="Reload" sub="+1 charge" color="#60a5fa" disabled={busy || myCharges >= 3} onClick={() => submit('reload')} />
          <ActionBtn label="Dodge" sub="evade their shot" color="#a78bfa" disabled={busy} onClick={() => submit('dodge')} />
          <ActionBtn label="Fire" sub={canFire ? 'aim · 1 charge' : 'no charge'} color="#f0c040" disabled={busy || !canFire} onClick={() => { setPendingAction('fire'); setPhase('aiming') }} />
          <ActionBtn label="Volley" sub={canVolley ? 'aim · 3 charges · 2×' : 'need 3'} color="#fb923c" disabled={busy || !canVolley} onClick={() => { setPendingAction('volley'); setPhase('aiming') }} />
        </div>
      )}
    </main>
  )
}

function ShipPanel({ name, hp, hpMax, charges, img, accent, top, splat }: {
  name: string; hp: number; hpMax: number; charges: number; img: string; accent: string; top?: boolean
  splat: { dmg: number; crit: boolean; dodged: boolean } | null
}) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, hpMax)) * 100))
  return (
    <div className="px-4" style={{ paddingTop: top ? 8 : 0 }}>
      <div style={{ position: 'relative', background: 'rgba(11,14,20,0.9)', border: `1px solid ${accent}40`, borderRadius: 14, padding: '0.7rem 0.9rem' }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.92rem', color: '#f4ecd8', maxWidth: '60%' }}>{name}</p>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < charges ? accent : 'rgba(255,255,255,0.12)', boxShadow: i < charges ? `0 0 6px ${accent}` : 'none' }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="" style={{ width: 78, height: 56, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 3px 10px ${accent}55)` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <motion.div animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 200, damping: 28 }}
                style={{ height: '100%', background: pct > 50 ? '#4ade80' : pct > 22 ? '#fbbf24' : '#f87171' }} />
            </div>
            <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#9a948a', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{hp} / {hpMax} hull</p>
          </div>
        </div>
        <AnimatePresence>
          {splat && (
            <motion.div key={`${splat.dmg}-${splat.crit}-${splat.dodged}`} initial={{ opacity: 0, y: 0, scale: 0.7 }} animate={{ opacity: 1, y: -18, scale: 1 }} exit={{ opacity: 0 }}
              className="font-cinzel font-700" style={{ position: 'absolute', right: 18, top: '40%', fontSize: splat.crit ? '1.5rem' : '1.2rem', color: splat.dodged ? '#94a3b8' : splat.crit ? '#fbbf24' : '#f87171', textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
              {splat.dodged ? 'evaded' : `-${splat.dmg}${splat.crit ? '!' : ''}`}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ActionBtn({ label, sub, color, disabled, onClick }: { label: string; sub: string; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={disabled ? undefined : onClick} disabled={disabled} whileTap={disabled ? undefined : { scale: 0.97 }}
      className="font-karla font-700 uppercase tracking-[0.08em]"
      style={{
        padding: '0.7rem 0.5rem', borderRadius: 12, textAlign: 'center',
        background: disabled ? 'rgba(255,255,255,0.04)' : `linear-gradient(180deg, ${color}26 0%, ${color}12 100%)`,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `${color}5a`}`,
        color: disabled ? '#5a5654' : color, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}>
      <div style={{ fontSize: '0.8rem' }}>{label}</div>
      <div className="font-karla font-400" style={{ fontSize: '0.54rem', color: disabled ? '#4a4845' : `${color}cc`, marginTop: 2, letterSpacing: '0.04em' }}>{sub}</div>
    </motion.button>
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
      <Link href="/social" className="font-karla font-700 uppercase tracking-[0.1em] inline-block mt-4"
        style={{ fontSize: '0.66rem', padding: '0.55rem 1.4rem', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: '#e0ddd8', textDecoration: 'none' }}>
        Back to Crew
      </Link>
    </motion.div>
  )
}
