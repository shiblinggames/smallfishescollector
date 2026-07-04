'use client'

// The blockade DPS check — a coin-or-skill gate. The player either PAYS to slip
// in quiet, or RUNS the blockade: one cannon shot on a fast-sweeping aim bar
// (one shot, no crew tricks, crits count). The client only decides which zone
// the needle froze in and hands that to the server, which rolls the shot from
// the player's real damage profile and returns the damage + pass/fail. Land the
// threshold and you punch through free; fall short and you owe the repair bill.

import { useEffect, useRef, useState } from 'react'
import type { RaidDpsCheck } from '@/lib/raidMap'
import { resolveDpsCheck } from './raidMapActions'
import { vibrate } from '@/lib/haptics'

const GOLD = '#e8c879'
const GREEN = '#4ade80'
const RED = '#f87171'
const GREY = '#94a3b8'

// Aim zones as half-widths around the bar centre (0.5). Mirrors the real aim
// bar's feel: a wide graze band, a tighter hit band, a narrow gold crit core.
const CRIT_HALF = 0.014
const HIT_HALF = 0.06
const GRAZE_HALF = 0.10
const BASE_SPEED = 0.006 // needle sweep, per 60fps frame, before the barSpeed multiplier
const ZONE_SPEED = 0.004 // target ("ship") drift per frame — moves like a real fight, a touch slower than the needle

type AimZone = 'critical' | 'hit' | 'graze' | 'miss'
// Zone is measured off the DRIFTING target centre, not a fixed point.
function zoneFrom(pos: number, center: number): AimZone {
  const d = Math.abs(pos - center)
  if (d <= CRIT_HALF) return 'critical'
  if (d <= HIT_HALF) return 'hit'
  if (d <= GRAZE_HALF) return 'graze'
  return 'miss'
}

type ShotResult = Extract<Awaited<ReturnType<typeof resolveDpsCheck>>, { outcome: 'passed' | 'failed' }>

export default function DpsCheckNode({
  nodeId, dpsCheck, doubloons, onResolved,
}: {
  nodeId: string
  dpsCheck: RaidDpsCheck
  doubloons: number
  /** Called once the player has seen the outcome and taps to continue. */
  onResolved: () => void
}) {
  const [phase, setPhase] = useState<'choose' | 'aiming' | 'result'>('choose')
  const [result, setResult] = useState<ShotResult | null>(null)
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Aim-bar RAF state (imperative so it stays at 60fps without re-render).
  const needleRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(0)
  const dirRef = useRef(1)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const firedRef = useRef(false)
  // Drifting target (the "ship") + its band elements, moved imperatively.
  const zoneCenterRef = useRef(0.5)
  const zoneDirRef = useRef(1)
  const grazeElRef = useRef<HTMLDivElement>(null)
  const hitElRef = useRef<HTMLDivElement>(null)
  const critElRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function startAiming() {
    if (pending) return
    setErr(null)
    setPhase('aiming')
    posRef.current = 0
    dirRef.current = 1
    firedRef.current = false
    // Start the target at a random spot + direction so it can't be memorised.
    const zLo = GRAZE_HALF, zHi = 1 - GRAZE_HALF
    zoneCenterRef.current = zLo + Math.random() * (zHi - zLo)
    zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
    lastRef.current = performance.now()
    const speed = BASE_SPEED * dpsCheck.barSpeed
    const tick = (now: number) => {
      const dt = Math.min(now - lastRef.current, 50)
      lastRef.current = now
      const frames = dt / 16.67
      // Needle sweep.
      let p = posRef.current + speed * frames * dirRef.current
      if (p >= 1) { p = 1; dirRef.current = -1 }
      if (p <= 0) { p = 0; dirRef.current = 1 }
      posRef.current = p
      if (needleRef.current) needleRef.current.style.left = `${p * 100}%`
      // Target drift (the ship), bounded so the graze band stays on the bar.
      let z = zoneCenterRef.current + ZONE_SPEED * frames * zoneDirRef.current
      if (z >= zHi) { z = zHi; zoneDirRef.current = -1 }
      if (z <= zLo) { z = zLo; zoneDirRef.current = 1 }
      zoneCenterRef.current = z
      if (grazeElRef.current) grazeElRef.current.style.left = `${(z - GRAZE_HALF) * 100}%`
      if (hitElRef.current)   hitElRef.current.style.left   = `${(z - HIT_HALF) * 100}%`
      if (critElRef.current)  critElRef.current.style.left  = `${(z - CRIT_HALF) * 100}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function fire() {
    if (phase !== 'aiming' || firedRef.current) return
    firedRef.current = true
    cancelAnimationFrame(rafRef.current)
    const zone = zoneFrom(posRef.current, zoneCenterRef.current)
    vibrate(zone === 'critical' ? [0, 30, 40, 30] : 14)
    setPending(true)
    const res = await resolveDpsCheck(nodeId, 'shot', zone)
    setPending(false)
    if ('error' in res) { setErr(res.error); setPhase('choose'); return }
    if (res.outcome === 'paid') { onResolved(); return } // shouldn't happen for a shot
    if ('doubloonsDelta' in res && res.doubloonsDelta !== 0) {
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
    }
    vibrate(res.outcome === 'passed' ? [0, 40, 60, 40] : [0, 120])
    setResult(res)
    setPhase('result')
  }

  async function pay() {
    if (pending) return
    setErr(null)
    setPending(true)
    const res = await resolveDpsCheck(nodeId, 'pay')
    setPending(false)
    if ('error' in res) { setErr(res.error); return }
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
    onResolved()
  }

  // ── Result view ────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed = result.outcome === 'passed'
    const accent = passed ? GREEN : RED
    return (
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <p className="font-cinzel font-800" style={{ fontSize: '2.6rem', lineHeight: 1, color: accent, textShadow: `0 0 18px ${accent}66` }}>
          {result.damage.toLocaleString()}
        </p>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.64rem', color: '#a89e86', marginTop: 4 }}>
          damage · needed {result.threshold}
        </p>
        <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{ marginTop: '0.9rem', fontSize: '0.92rem', color: accent }}>
          {passed ? 'Gate blown open' : 'Not enough'}
        </p>
        <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'rgba(240,237,232,0.82)', marginTop: '0.45rem' }}>
          {passed
            ? 'Direct hit. The gate blows open and you sail straight through, free.'
            : 'The gate holds. You limp through under fire, and the repairs come out of your purse.'}
        </p>
        {!passed && 'doubloonsDelta' in result && result.doubloonsDelta !== 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.85rem' }}>
            <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.72rem', color: RED, background: `${RED}1f`, border: `1px solid ${RED}44`, borderRadius: 999, padding: '0.32rem 0.72rem' }}>
              {result.doubloonsDelta.toLocaleString()} ⟡
            </span>
          </div>
        )}
        <button
          onClick={onResolved}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', marginTop: '1.1rem', padding: '0.8rem', borderRadius: 12, fontSize: '0.98rem', background: `${GOLD}26`, border: `1px solid ${GOLD}66`, color: GOLD, cursor: 'pointer' }}
        >
          Sail On →
        </button>
      </div>
    )
  }

  // ── Aiming view ──────────────────────────────────────────────────────────
  if (phase === 'aiming') {
    return (
      <div style={{ marginTop: '1rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: '#a89e86', textAlign: 'center', marginBottom: '0.8rem' }}>
          Tap FIRE when the marker hits the gold
        </p>
        {/* Aim bar — a DRIFTING target (graze/hit/crit bands) + a sweeping needle,
            both moved imperatively by the RAF so it reads like a real fight. */}
        <div style={{ position: 'relative', height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <div ref={grazeElRef} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${(0.5 - GRAZE_HALF) * 100}%`, width: `${GRAZE_HALF * 2 * 100}%`, background: GREY, opacity: 0.18 }} />
          <div ref={hitElRef}   aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${(0.5 - HIT_HALF) * 100}%`,   width: `${HIT_HALF * 2 * 100}%`,   background: GREEN, opacity: 0.28 }} />
          <div ref={critElRef}  aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${(0.5 - CRIT_HALF) * 100}%`,  width: `${CRIT_HALF * 2 * 100}%`,  background: GOLD, opacity: 0.85 }} />
          {/* needle */}
          <div ref={needleRef} style={{ position: 'absolute', top: -2, bottom: -2, left: '0%', width: 3, marginLeft: -1.5, background: '#fff', boxShadow: '0 0 8px #fff', borderRadius: 2 }} />
        </div>
        <button
          onClick={fire}
          disabled={pending}
          className="font-cinzel font-800 uppercase tracking-[0.08em]"
          style={{ width: '100%', marginTop: '0.9rem', padding: '0.95rem', borderRadius: 12, fontSize: '1.05rem', background: pending ? 'rgba(255,255,255,0.08)' : `${RED}2a`, border: `1px solid ${RED}70`, color: pending ? '#8a8880' : '#ffb3b3', cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? 'Firing…' : 'FIRE'}
        </button>
      </div>
    )
  }

  // ── Choose view ──────────────────────────────────────────────────────────
  const cantAfford = doubloons < dpsCheck.payCost          // can't cover the 10k pay
  const canShoot = doubloons >= dpsCheck.failCost          // must hold the 20k a miss would cost
  const hardLocked = cantAfford && !canShoot               // no coin for either way through
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.5, color: 'rgba(240,237,232,0.8)', marginBottom: '0.8rem', textAlign: 'center' }}>
        Get past the locked gate. Fire one shot to blast it open, or pay to be let through.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* Fire one shot — the DPS check. Locked below the 20k a miss would cost. */}
        <button
          onClick={() => canShoot && startAiming()}
          disabled={pending || !canShoot}
          style={{ textAlign: 'left', padding: '0.9rem', borderRadius: 14, background: canShoot ? `${RED}18` : 'rgba(255,255,255,0.03)', border: `1px solid ${canShoot ? `${RED}55` : 'rgba(255,255,255,0.1)'}`, cursor: pending || !canShoot ? 'not-allowed' : 'pointer', opacity: canShoot ? 1 : 0.7 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>Fire One Shot</span>
            <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, fontSize: '0.62rem', color: canShoot ? '#ffb3b3' : '#f0a8a8', background: canShoot ? `${RED}22` : 'rgba(248,113,113,0.12)', border: `1px solid ${canShoot ? `${RED}55` : 'rgba(248,113,113,0.35)'}`, borderRadius: 999, padding: '0.28rem 0.6rem' }}>
              {canShoot ? 'free if you pass' : `needs ${dpsCheck.failCost.toLocaleString()} ⟡`}
            </span>
          </div>
          <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.45 }}>
            {canShoot
              ? <>Deal <span style={{ color: GOLD }}>{dpsCheck.threshold}+</span> damage in one shot and you're through for free. Deal less and repairs cost you <span style={{ color: RED }}>{dpsCheck.failCost.toLocaleString()} ⟡</span>.</>
              : <>You need <span style={{ color: RED }}>{dpsCheck.failCost.toLocaleString()} ⟡</span> in hand to risk the shot, since a miss costs that much in repairs.</>}
          </p>
        </button>

        {/* Pay to pass — skip the shot */}
        <button
          onClick={pay}
          disabled={pending || cantAfford}
          style={{ textAlign: 'left', padding: '0.9rem', borderRadius: 14, background: cantAfford ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)', border: `1px solid ${cantAfford ? 'rgba(255,255,255,0.1)' : `${GOLD}40`}`, cursor: pending || cantAfford ? 'not-allowed' : 'pointer', opacity: cantAfford ? 0.7 : 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>Pay to Pass</span>
            <span className="font-cinzel font-700" style={{ flexShrink: 0, fontSize: '0.9rem', color: cantAfford ? RED : GOLD }}>{dpsCheck.payCost.toLocaleString()} ⟡</span>
          </div>
          <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.45 }}>
            {cantAfford
              ? `You don't have ${dpsCheck.payCost.toLocaleString()} ⟡ to pay your way in.`
              : 'Pay the dockmaster and skip the shot. No risk.'}
          </p>
        </button>
      </div>
      {hardLocked && (
        <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0a8a8', marginTop: '0.8rem', textAlign: 'center', lineHeight: 1.45 }}>
          You need at least {dpsCheck.payCost.toLocaleString()} ⟡ to get through this gate. Go earn some coin and come back.
        </p>
      )}
      {err && <p className="font-karla" style={{ fontSize: '0.74rem', color: RED, marginTop: '0.7rem', textAlign: 'center' }}>{err}</p>}
    </div>
  )
}
