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

import { useEffect, useState, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { claimDailyReward, claimDailySweep } from '../fishing/dailyChallengeActions'
import { DAILY_SWEEP_GEMS, type DailyChallengeState } from '@/lib/dailyChallenges'
import { vibrate } from '@/lib/haptics'
import { flyCoinsToPurse } from '@/lib/coinFly'

const GOLD = '#f0c040'
const GREEN = '#7bf0b0'

export default function DailyOrders({ initial, canClaim = true }: {
  initial: DailyChallengeState | null
  /**
   * FALSE ON THE WATER.
   *
   * The chart shows these so you know what you are fishing FOR — a challenge
   * you cannot see is one you meet by accident — but the payout is the Tally
   * House's whole remaining job, and a reward you can take from anywhere makes
   * the island a formality. So: read anywhere, settle up ashore.
   */
  canClaim?: boolean
}) {
  const [state, setState] = useState(initial)
  const [busy, setBusy] = useState<number | 'sweep' | null>(null)
  /**
   * THE MOMENT A CLAIM LANDS.
   *
   * Claiming was a button that turned into the word "Claimed". The coin was
   * real and the row went quiet, which makes finishing a day's work feel like
   * dismissing a notification.
   *
   * `paid` is which row just paid and what it paid. It drives a light sweeping
   * across the row, the amount rising off it, and coins actually travelling to
   * the purse in the nav — the same flight every other payout in the game uses,
   * so this reads as being paid rather than as a local animation.
   */
  const [paid, setPaid] = useState<{ i: number | 'sweep'; amount: number; gems?: boolean } | null>(null)
  /**
   * The global prefers-reduced-motion rule in globals.css only reaches CSS
   * animations and transitions. Framer drives these from JS, so the one thing
   * here that never stops on its own — the pulse on a button holding money —
   * has to ask for itself. The payout flourishes still play: they are a single
   * short response to something the captain just did, which is the kind of
   * motion the preference is not asking anyone to remove.
   */
  const stillness = useReducedMotion()
  const [err, setErr] = useState('')
  const [, startTransition] = useTransition()

  if (!state || state.challenges.length === 0) return null

  const done = state.challenges.map((c, i) => (state.progress[i] ?? 0) >= c.target)
  const allDone = done.every(Boolean)
  const claimedAll = state.claimed.slice(0, state.challenges.length).every(Boolean)
  const canSweep = allDone && claimedAll && !state.sweepClaimed

  function claim(i: number, from?: DOMRect) {
    if (busy !== null) return
    const c = state?.challenges[i]
    setBusy(i); setErr(''); vibrate(10)
    startTransition(async () => {
      const res = await claimDailyReward(i as 0 | 1 | 2 | 3)
      setBusy(null)
      if ('error' in res) { setErr(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      // THE COIN LEAVES THE ROW AND ARRIVES IN THE PURSE. Fired from where the
      // button actually was, so it starts under the thumb that pressed it.
      // flyCoinsToPurse carries its own haptic and pops the nav pill on
      // arrival, which is what makes the number at the top feel earned rather
      // than merely different.
      if (from && !c?.crateReward) {
        flyCoinsToPurse({ x: from.left + from.width / 2, y: from.top + from.height / 2 }, c?.reward ?? 0)
      } else {
        vibrate([0, 20, 40, 30])
      }
      setPaid({ i, amount: c?.reward ?? 0 })
      setState(s => (s ? { ...s, claimed: s.claimed.map((cl, k) => (k === i ? true : cl)) } : s))
    })
  }

  /** Clears the payout flourish once it has played. One timer, replaced each
   *  time, so claiming three in a row does not leave three of them running. */
  useEffect(() => {
    if (!paid) return
    const t = setTimeout(() => setPaid(null), 1500)
    return () => clearTimeout(t)
  }, [paid])

  function sweep() {
    if (busy !== null) return
    setBusy('sweep'); setErr(''); vibrate(10)
    startTransition(async () => {
      const res = await claimDailySweep()
      setBusy(null)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 25, 45, 35, 20, 60])
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems }))
      setPaid({ i: 'sweep', amount: DAILY_SWEEP_GEMS, gems: true })
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
      {/* "HERE" DEPENDS ON WHERE YOU ARE READING IT. This said "come back here
          to collect" from the day it was written, which was true while the only
          place it could be read was the island. It is on the chart now, where
          "here" is open water and the sentence sends you nowhere. */}
      <p className="font-karla" style={{ fontSize: '0.82rem', color: '#bcb29a', lineHeight: 1.45, marginTop: 2 }}>
        Every cast counts toward these, wherever you make it.{' '}
        {canClaim ? 'Collect them here.' : 'Go to the Tally House to collect.'}
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
              // A CLAIMED ROW IS SETTLED, NOT SWITCHED OFF. It used to drop to
              // 55% opacity, which is how a DISABLED control looks — the row
              // read as unavailable rather than as done. Finished work should
              // look finished: the tint stays, the text stays legible, and the
              // tick is what says it is behind you.
              opacity: isClaimed ? 0.82 : 1,
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
              {/* ── THE PAYOUT, ACROSS THE ROW ──────────────────────────
                  A band of light travelling left to right, once. It is the row
                  itself acknowledging the claim rather than a badge appearing
                  beside it, which is the difference between the game reacting
                  and the game reporting. */}
              <AnimatePresence>
                {paid?.i === i && (
                  <motion.div key="sweep" aria-hidden
                    initial={{ x: '-110%' }} animate={{ x: '110%' }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.85, ease: [0.22, 0.61, 0.36, 1] }}
                    style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      background: `linear-gradient(105deg, transparent 0%, ${GOLD}00 30%, ${GOLD}3d 50%, ${GOLD}00 70%, transparent 100%)`,
                    }} />
                )}
              </AnimatePresence>

              {/* THE AMOUNT, LEAVING. It rises and fades from the right of the
                  row, where the button was, so the eye follows it up and out
                  toward the purse the coins are flying to. */}
              <AnimatePresence>
                {paid?.i === i && paid.amount > 0 && (
                  <motion.span key="amt" aria-hidden className="font-cinzel font-700"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -26 }}
                    transition={{ duration: 1.3, times: [0, 0.12, 0.6, 1], ease: 'easeOut' }}
                    style={{
                      position: 'absolute', right: 14, top: '50%', zIndex: 2,
                      fontSize: '1.05rem', color: GOLD, pointerEvents: 'none',
                      textShadow: `0 0 14px ${GOLD}99, 0 2px 8px rgba(0,0,0,0.9)`,
                    }}>+{paid.amount.toLocaleString()} ⟡</motion.span>
                )}
              </AnimatePresence>

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
                {!canClaim ? (
                  <span className="font-karla font-700 uppercase" style={{
                    fontSize: '0.66rem', letterSpacing: '0.1em', flexShrink: 0,
                    color: isClaimed ? '#8a8578' : isDone ? GREEN : 'rgba(255,255,255,0.32)',
                  }}>{isClaimed ? 'Claimed' : isDone ? 'Ready' : ''}</span>
                ) : isClaimed ? (
                  // THE TICK, and it draws itself the first time. A row that
                  // simply reads "Claimed" the instant you press is a receipt;
                  // one that gets ticked in front of you is an acknowledgement.
                  <motion.span
                    initial={paid?.i === i ? { scale: 0.4, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.1 }}
                    style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${GREEN}1f`, border: `1px solid ${GREEN}66`,
                    }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={GREEN}
                      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Claimed">
                      <motion.path d="M4 12.5l5.5 5.5L20 7"
                        initial={paid?.i === i ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.34, delay: 0.16, ease: 'easeOut' }} />
                    </svg>
                  </motion.span>
                ) : isDone ? (
                  // BREATHING WHILE IT WAITS. Subtle and slow — the house rule
                  // is that juice stays local and quiet — but a button holding
                  // money should not look identical to one that is not.
                  <motion.button
                    animate={busy === null && !stillness ? { scale: [1, 1.035, 1] } : { scale: 1 }}
                    transition={busy === null && !stillness
                      ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.15 }}
                    onClick={e => claim(i, e.currentTarget.getBoundingClientRect())} disabled={busy !== null}
                    className="font-karla font-700 uppercase tracking-[0.08em]"
                    style={{
                      flexShrink: 0, padding: '0.45rem 0.85rem', borderRadius: 9,
                      fontSize: '0.7rem', color: '#04120f', background: GREEN,
                      border: `1px solid ${GREEN}`, cursor: busy !== null ? 'default' : 'pointer',
                      opacity: busy === i ? 0.5 : 1,
                    }}>
                    {busy === i ? '…' : 'Claim'}
                  </motion.button>
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
        {canSweep && canClaim && (
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

      {/* THE SWEEP'S OWN MOMENT. Gems are the rarer currency and the sweep is
          the day's last beat, so it gets more than a line of text: the amount
          rises out of the middle of the panel with a violet bloom behind it.
          Once, then it is gone — the standing line below is what remains. */}
      <AnimatePresence>
        {paid?.i === 'sweep' && (
          <motion.div key="sweepfx" aria-hidden
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], scale: 1.06, y: -22 }}
            transition={{ duration: 1.4, times: [0, 0.12, 0.62, 1], ease: 'easeOut' }}
            style={{
              position: 'relative', height: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
            <span className="font-cinzel font-700" style={{
              position: 'absolute', fontSize: '1.5rem', color: '#e9d5ff', whiteSpace: 'nowrap',
              textShadow: '0 0 22px rgba(167,139,250,0.9), 0 2px 10px rgba(0,0,0,0.9)',
            }}>+{DAILY_SWEEP_GEMS} ◆</span>
          </motion.div>
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
