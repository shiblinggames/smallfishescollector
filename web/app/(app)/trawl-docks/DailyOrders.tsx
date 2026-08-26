'use client'

// THE DAY'S ORDERS — the fishing daily challenges, at the Trawl Docks.
//
// They have always been ticking. Progress is written server-side inside
// `reelIn`, so every cast from the ocean hub has been counting toward them
// since the day the chart shipped — there was simply nowhere out here to SEE
// them, and a goal you cannot see is not a goal, it is a coincidence.
//
// They live here because this is already the island where crew work is handed
// out. A day's orders and a crew's orders are the same errand, and giving them
// two islands would be two trips for one idea.
//
// Claiming uses the fishing page's own actions. Two surfaces, one payout — the
// same rule as the collection drawer and the trawl panel.

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { claimDailyReward, claimDailySweep } from '../fishing/dailyChallengeActions'
import { DAILY_SWEEP_GEMS, type DailyChallengeState } from '@/lib/dailyChallenges'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const GREEN = '#7bf0b0'

export default function DailyOrders({ initial }: { initial: DailyChallengeState | null }) {
  const [state, setState] = useState(initial)
  const [busy, setBusy] = useState<number | 'sweep' | null>(null)
  const [err, setErr] = useState('')
  const [, startTransition] = useTransition()

  if (!state || state.challenges.length === 0) return null

  const done = state.challenges.map((c, i) => (state.progress[i] ?? 0) >= c.target)
  const allDone = done.every(Boolean)
  const claimedAll = state.claimed.slice(0, state.challenges.length).every(Boolean)
  const canSweep = allDone && claimedAll && !state.sweepClaimed

  function claim(i: number) {
    if (busy !== null) return
    setBusy(i); setErr(''); vibrate(10)
    startTransition(async () => {
      const res = await claimDailyReward(i as 0 | 1 | 2 | 3)
      setBusy(null)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 20, 40, 30])
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      setState(s => (s ? { ...s, claimed: s.claimed.map((c, k) => (k === i ? true : c)) } : s))
    })
  }

  function sweep() {
    if (busy !== null) return
    setBusy('sweep'); setErr(''); vibrate(10)
    startTransition(async () => {
      const res = await claimDailySweep()
      setBusy(null)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 25, 45, 35])
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems }))
      setState(s => (s ? { ...s, sweepClaimed: true } : s))
    })
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f4ecd8' }}>
          Today&apos;s Orders
        </p>
        <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#8a8068' }}>
          {done.filter(Boolean).length}/{state.challenges.length} done
        </span>
      </div>
      <p className="font-karla" style={{ fontSize: '0.82rem', color: '#bcb29a', lineHeight: 1.45, marginTop: 2 }}>
        Every cast counts toward these, wherever you make it. Come back here to
        collect.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {state.challenges.map((c, i) => {
          const p = Math.min(state.progress[i] ?? 0, c.target)
          const isDone = done[i]
          const isClaimed = state.claimed[i] === true
          const pct = Math.round((p / c.target) * 100)
          const accent = isClaimed ? 'rgba(255,255,255,0.2)' : isDone ? GREEN : GOLD
          return (
            <div key={i} style={{
              position: 'relative', overflow: 'hidden',
              padding: '0.7rem 0.8rem', borderRadius: 12,
              background: 'rgba(255,255,255,0.035)',
              border: `1px solid ${isDone && !isClaimed ? `${GREEN}55` : 'rgba(255,255,255,0.09)'}`,
              opacity: isClaimed ? 0.55 : 1,
            }}>
              {/* THE BAR IS THE BACKGROUND, not a separate track under the text.
                  A row that fills as you fish reads as progress at a glance;
                  a thin rule underneath reads as decoration. */}
              <div aria-hidden style={{
                position: 'absolute', inset: 0, width: `${pct}%`,
                background: isClaimed
                  ? 'rgba(255,255,255,0.03)'
                  : `linear-gradient(90deg, ${accent}1c, ${accent}0c)`,
                transition: 'width 400ms ease-out',
              }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-karla font-700 block" style={{
                    fontSize: '0.86rem', color: isClaimed ? '#8a8578' : '#f0ede8', lineHeight: 1.25,
                  }}>{c.label}</span>
                  <span className="font-karla font-600 block" style={{
                    fontSize: '0.72rem', color: 'rgba(190,212,228,0.55)', marginTop: 2,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {p}/{c.target}
                    {' · '}
                    {/* Master challenges pay a crate, not coin. Saying "0 ⟡"
                        would be true and useless. */}
                    {c.crateReward ? 'a supply crate' : `${c.reward.toLocaleString()} ⟡`}
                  </span>
                </span>
                {isClaimed ? (
                  <span className="font-karla font-700 uppercase" style={{
                    flexShrink: 0, fontSize: '0.66rem', letterSpacing: '0.1em',
                    color: 'rgba(255,255,255,0.3)',
                  }}>Claimed</span>
                ) : isDone ? (
                  <button onClick={() => claim(i)} disabled={busy !== null}
                    className="font-karla font-700 uppercase tracking-[0.08em]"
                    style={{
                      flexShrink: 0, padding: '0.45rem 0.85rem', borderRadius: 9,
                      fontSize: '0.7rem', color: '#04120f', background: GREEN,
                      border: `1px solid ${GREEN}`, cursor: busy !== null ? 'default' : 'pointer',
                      opacity: busy === i ? 0.5 : 1,
                    }}>
                    {busy === i ? '…' : 'Claim'}
                  </button>
                ) : (
                  <span className="font-karla font-700" style={{
                    flexShrink: 0, fontSize: '0.78rem', color: 'rgba(190,212,228,0.4)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{pct}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {canSweep && (
          <motion.button
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={sweep} disabled={busy !== null}
            className="font-cinzel font-700"
            style={{
              width: '100%', marginTop: 8, padding: '0.75rem', borderRadius: 12,
              fontSize: '0.92rem', color: '#e9d5ff',
              background: 'rgba(167,139,250,0.16)',
              border: '1px solid rgba(167,139,250,0.5)',
              cursor: busy !== null ? 'default' : 'pointer',
            }}>
            {busy === 'sweep' ? '…' : `Clean sweep · ${DAILY_SWEEP_GEMS} ◆`}
          </motion.button>
        )}
      </AnimatePresence>

      {state.sweepClaimed && (
        <p className="font-karla font-700" style={{
          fontSize: '0.74rem', color: GREEN, marginTop: 8, textAlign: 'center',
        }}>
          Every order filled. Back tomorrow.
        </p>
      )}

      {err && (
        <p className="font-karla font-600" style={{
          fontSize: '0.78rem', color: '#e6a0a0', marginTop: 8, lineHeight: 1.5,
        }}>{err}</p>
      )}
    </div>
  )
}
