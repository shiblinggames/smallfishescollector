'use client'

// The blockade gate — a coin-or-stats check. The player either PAYS to skip, or
// FIRES one shot: the server rolls a straight (non-critical) hit from their real
// damage profile (ship + power + gear) and compares it to the threshold. No
// aiming. The sheet shows the player's stats + pass odds up front, then a
// suspenseful rolling-number animation settles on the shot before the verdict.

import { useEffect, useRef, useState } from 'react'
import type { RaidDpsCheck } from '@/lib/raidMap'
import { resolveDpsCheck, getDpsCheckPreview } from './raidMapActions'
import { vibrate } from '@/lib/haptics'

const GOLD = '#e8c879'
const GREEN = '#4ade80'
const RED = '#f87171'
const ORANGE = '#fb923c'

type ShotResult = Extract<Awaited<ReturnType<typeof resolveDpsCheck>>, { outcome: 'passed' | 'failed' }>
type Preview = Extract<Awaited<ReturnType<typeof getDpsCheckPreview>>, { passChance: number }>

// Color + label for a pass chance, matching the dice node's risk pills.
function oddsTier(pct: number): { label: string; color: string } {
  if (pct >= 75) return { label: 'Likely', color: GREEN }
  if (pct >= 45) return { label: 'Even', color: GOLD }
  if (pct >= 20) return { label: 'Risky', color: ORANGE }
  return { label: 'Long shot', color: RED }
}

export default function DpsCheckNode({
  nodeId, dpsCheck, doubloons, onResolved, onActed,
}: {
  nodeId: string
  dpsCheck: RaidDpsCheck
  doubloons: number
  /** Called once the player has seen the outcome and taps to continue. */
  onResolved: () => void
  /** Fires the moment the node is cleared server-side (shot resolved or paid),
   *  so the sheet refreshes the map on ANY close — not just the Sail On tap. */
  onActed?: () => void
}) {
  const [phase, setPhase] = useState<'choose' | 'confirm' | 'firing' | 'result'>('choose')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<ShotResult | null>(null)
  const [rollDisplay, setRollDisplay] = useState(0)
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    getDpsCheckPreview(nodeId).then(p => { if (!('error' in p)) setPreview(p) }).catch(() => {})
    return () => { timersRef.current.forEach(clearTimeout) }
  }, [nodeId])

  async function fire() {
    if (pending) return
    setErr(null)
    setPending(true)
    setPhase('firing')
    vibrate([0, 45, 30])   // cannon boom
    // Plausible spin range in final (post-multiplier) damage terms.
    const lo = preview ? Math.max(1, Math.round(preview.rangeMin * preview.mult)) : 10
    const hi = preview ? Math.max(lo + 1, Math.round(preview.rangeMax * preview.mult)) : 80
    const rnd = () => lo + Math.floor(Math.random() * (hi - lo + 1))
    // Spin fast while the server settles the real roll.
    let spinning = true
    const spin = () => { if (!spinning) return; setRollDisplay(rnd()); timersRef.current.push(window.setTimeout(spin, 55)) }
    spin()

    const res = await resolveDpsCheck(nodeId, 'shot')
    spinning = false
    if ('error' in res) { setPending(false); setErr(res.error); setPhase('choose'); return }
    if (res.outcome === 'paid') { onResolved(); return } // shouldn't happen for a shot
    onActed?.()   // node is cleared server-side now — any close should refresh the map

    // Decelerating ratchet onto the real damage, then hold + reveal the verdict.
    const finalDmg = res.damage
    const steps = [70, 95, 125, 165, 215, 280, 360]
    let i = 0
    const ratchet = () => {
      if (i >= steps.length) {
        setRollDisplay(finalDmg)
        vibrate(res.outcome === 'passed' ? [0, 45, 60, 45] : [0, 110])
        if ('doubloonsDelta' in res && res.doubloonsDelta !== 0) {
          window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
        }
        timersRef.current.push(window.setTimeout(() => { setPending(false); setResult(res); setPhase('result') }, 700))
        return
      }
      // Bias the last couple of ticks to the true value so it settles cleanly.
      setRollDisplay(i >= steps.length - 2 ? finalDmg : rnd())
      timersRef.current.push(window.setTimeout(ratchet, steps[i++]))
    }
    ratchet()
  }

  async function pay() {
    if (pending) return
    setErr(null)
    setPending(true)
    const res = await resolveDpsCheck(nodeId, 'pay')
    setPending(false)
    if ('error' in res) { setErr(res.error); return }
    onActed?.()
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
    onResolved()
  }

  // ── Confirm view — make the 20k stake explicit before firing ──────────────
  if (phase === 'confirm') {
    const tier = preview ? oddsTier(preview.passChance) : null
    return (
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <p className="font-cinzel font-700 uppercase tracking-[0.1em]" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>
          Fire one shot?
        </p>
        <div style={{ margin: '0.85rem auto 0', maxWidth: 300, background: `${RED}14`, border: `1px solid ${RED}44`, borderRadius: 12, padding: '0.85rem 0.9rem' }}>
          <p className="font-karla" style={{ fontSize: '0.86rem', lineHeight: 1.5, color: 'rgba(240,237,232,0.9)' }}>
            You get <span style={{ color: '#f4ecd8', fontWeight: 700 }}>one shot</span>. If you fall short of {dpsCheck.threshold} damage, the repairs cost you <span style={{ color: RED, fontWeight: 700 }}>{dpsCheck.failCost.toLocaleString()} ⟡</span>. There's no second try.
          </p>
          {preview && tier && (
            <p className="font-karla font-700" style={{ fontSize: '0.8rem', marginTop: '0.6rem', color: '#a89e86' }}>
              Your odds: <span style={{ color: tier.color, fontWeight: 800 }}>{preview.passChance}% · {tier.label}</span>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: '1rem' }}>
          <button
            onClick={() => setPhase('choose')}
            disabled={pending}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ flex: 1, padding: '0.85rem', borderRadius: 12, fontSize: '0.92rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#d8d4cf', cursor: pending ? 'default' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={fire}
            disabled={pending}
            className="font-cinzel font-800 uppercase tracking-[0.08em]"
            style={{ flex: 1, padding: '0.85rem', borderRadius: 12, fontSize: '0.92rem', background: `${RED}2a`, border: `1px solid ${RED}70`, color: '#ffb3b3', cursor: pending ? 'default' : 'pointer' }}
          >
            Fire
          </button>
        </div>
      </div>
    )
  }

  // ── Firing view — the suspenseful rolling number ──────────────────────────
  if (phase === 'firing') {
    return (
      <div style={{ padding: '1.6rem 0 1rem', textAlign: 'center' }}>
        <p className="font-cinzel font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.72rem', color: RED }}>
          Firing…
        </p>
        <p className="font-cinzel font-800" style={{ fontSize: '3.4rem', lineHeight: 1.05, color: '#f4ecd8', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 20px rgba(255,255,255,0.25)', marginTop: '0.4rem' }}>
          {rollDisplay.toLocaleString()}
        </p>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: '#a89e86', marginTop: 4 }}>
          needed {dpsCheck.threshold}
        </p>
      </div>
    )
  }

  // ── Result view ────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const passed = result.outcome === 'passed'
    const accent = passed ? GREEN : RED
    const bd = result.breakdown
    const hasMult = Math.abs(bd.mult - 1) > 0.001
    return (
      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <p className="font-cinzel font-800" style={{ fontSize: '3rem', lineHeight: 1, color: accent, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 20px ${accent}55` }}>
          {result.damage.toLocaleString()}
        </p>
        <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.92rem', color: accent, marginTop: '0.3rem' }}>
          {passed ? 'Gate blown open' : 'Not enough'}
        </p>
        {/* Calculation ledger — makes it plain the damage is built from your stats */}
        <div style={{ margin: '0.85rem auto 0', maxWidth: 268, textAlign: 'left', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '0.7rem 0.85rem', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <LedgerRow label="Your cannon (hit)" val={`${bd.rangeMin.toLocaleString()}–${bd.rangeMax.toLocaleString()}`} />
          <LedgerRow label="You rolled" val={bd.roll.toLocaleString()} />
          {hasMult && <LedgerRow label="Gear & class" val={`×${bd.mult.toFixed(2)}`} valColor={GOLD} />}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
          <LedgerRow label="Damage dealt" val={result.damage.toLocaleString()} valColor={accent} bold />
          <LedgerRow label="Needed to pass" val={result.threshold.toLocaleString()} />
        </div>
        <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'rgba(240,237,232,0.82)', marginTop: '0.7rem' }}>
          {passed
            ? 'The gate blows open and you sail straight through, free.'
            : 'The gate holds. You limp through under fire, and the repairs come out of your purse.'}
        </p>
        {!passed && 'doubloonsDelta' in result && result.doubloonsDelta !== 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.8rem' }}>
            <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.72rem', color: RED, background: `${RED}1f`, border: `1px solid ${RED}44`, borderRadius: 999, padding: '0.32rem 0.72rem' }}>
              {result.doubloonsDelta.toLocaleString()} ⟡
            </span>
          </div>
        )}
        <button
          data-any-key
          onClick={onResolved}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', marginTop: '1.1rem', padding: '0.8rem', borderRadius: 12, fontSize: '0.98rem', background: `${GOLD}26`, border: `1px solid ${GOLD}66`, color: GOLD, cursor: 'pointer' }}
        >
          Sail On →
        </button>
      </div>
    )
  }

  // ── Choose view ──────────────────────────────────────────────────────────
  const cantAfford = doubloons < dpsCheck.payCost          // can't cover the 10k pay
  const canShoot = doubloons >= dpsCheck.failCost          // must hold the 20k a miss would cost
  const hardLocked = cantAfford && !canShoot               // no coin for either way through
  const tier = preview ? oddsTier(preview.passChance) : null
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.5, color: 'rgba(240,237,232,0.8)', marginBottom: '0.8rem', textAlign: 'center' }}>
        Get past the locked gate. Fire one shot to blast it open, or pay to be let through.
      </p>

      {/* Stat + odds panel — what your shot can do, and the chance it clears. */}
      {preview && tier && (
        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '0.7rem 0.85rem', marginBottom: '0.8rem', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <LedgerRow label="Crew power" val={preview.power.toLocaleString()} />
          <LedgerRow label="Your shot (hit)" val={`${preview.rangeMin.toLocaleString()}–${preview.rangeMax.toLocaleString()}`} />
          {Math.abs(preview.mult - 1) > 0.001 && <LedgerRow label="Gear & class" val={`×${preview.mult.toFixed(2)}`} valColor={GOLD} />}
          <LedgerRow label="Needed to pass" val={preview.threshold.toLocaleString()} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.72rem', color: '#a89e86' }}>Your odds</span>
            <span className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: tier.color }}>{preview.passChance}% · {tier.label}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {/* Fire one shot — the damage check. Locked below the 20k a miss would cost. */}
        <button
          onClick={() => canShoot && setPhase('confirm')}
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
              ? <>One cannon shot at the gate. Deal <span style={{ color: GOLD }}>{dpsCheck.threshold}+</span> damage and you're through for free. Deal less and repairs cost you <span style={{ color: RED }}>{dpsCheck.failCost.toLocaleString()} ⟡</span>.</>
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

// One row of the stat / damage ledger (label left, value right).
function LedgerRow({ label, val, valColor, bold }: { label: string; val: string; valColor?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86' }}>{label}</span>
      <span className={bold ? 'font-cinzel font-800' : 'font-cinzel font-700'} style={{ fontSize: bold ? '1.1rem' : '0.84rem', color: valColor ?? '#f0ede8', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
    </div>
  )
}
