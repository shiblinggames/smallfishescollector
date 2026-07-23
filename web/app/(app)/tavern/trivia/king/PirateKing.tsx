'use client'

// Pirate King — Millionaire-style ladder. Ten questions, prizes climb,
// walk away whenever you like or risk the climb; a wrong answer drops
// you to the last safe haven. One run a WEEK (fresh ladder each
// Monday), one 50/50 lifeline. Pays doubloons.

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { answerKingRung, spendKingFiftyFifty, walkKingAway } from './actions'
import BalanceTicker from '../BalanceTicker'
import { ParlorHost, CrownIcon, PARLOR } from '../ParlorArt'
import {
  PIRATE_KING_PRIZES,
  PIRATE_KING_HAVENS,
  parlorHostReaction,
  kingHavenValue,
  type PirateKingState,
  type PirateKingStatus,
  type KingQuestionClient,
  type AnswerKingResult,
} from '../constants'

const GOLD = '#f0c040'

export default function PirateKing({ initial, doubloons }: { initial: PirateKingState; doubloons: number }) {
  const [status, setStatus] = useState<PirateKingStatus>(initial.status)
  const [rung, setRung] = useState(initial.rung)
  const [doubloonsAwarded, setDoubloonsAwarded] = useState(initial.doubloonsAwarded)
  const [balance, setBalance] = useState(doubloons)
  const [fiftyUsed, setFiftyUsed] = useState(initial.fiftyUsed)
  const [current, setCurrent] = useState<KingQuestionClient | null>(initial.current)
  const [result, setResult] = useState<AnswerKingResult | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [walkConfirm, setWalkConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Server prop changes (midnight rollover, another tab played) must
  // reach the optimistic state.
  useEffect(() => {
    setStatus(initial.status)
    setRung(initial.rung)
    setDoubloonsAwarded(initial.doubloonsAwarded)
    setFiftyUsed(initial.fiftyUsed)
    setCurrent(initial.current)
    setResult(null)
    setChosen(null)
    setWalkConfirm(false)
  }, [initial])
  useEffect(() => { setBalance(doubloons) }, [doubloons])

  const resolved = result !== null
  // While a result is up, `rung` already advanced; the question on
  // screen was the previous rung.
  const questionRung = resolved ? (result.correct ? rung - 1 : rung) : rung
  const prize = PIRATE_KING_PRIZES[Math.min(questionRung, PIRATE_KING_PRIZES.length - 1)]
  const banked = rung >= 1 ? PIRATE_KING_PRIZES[rung - 1] : 0
  const havenIfWrong = kingHavenValue(questionRung)

  function pickOption(idx: number) {
    if (!current || isPending || resolved || status !== 'active') return
    if (current.removed.includes(idx)) return
    setError(null)
    setWalkConfirm(false)
    setChosen(idx)
    startTransition(async () => {
      const r = await answerKingRung(rung, idx)
      if ('error' in r) { setError(r.error); setChosen(null); return }
      setResult(r)
      setStatus(r.status)
      setRung(r.rung)
      setDoubloonsAwarded(r.doubloonsAwarded)
      // Payouts land only at terminal states; tick the purse up then
      // and keep the Nav header in step.
      if (r.newDoubloons !== null) {
        setBalance(prev => prev + r.doubloonsAwarded)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      }
      // The crown also banks gems — tick the Nav's gem purse.
      if (r.newGems !== null) {
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.newGems }))
      }
    })
  }

  function climbOn() {
    if (!result?.next) return
    setCurrent(result.next)
    setResult(null)
    setChosen(null)
    setWalkConfirm(false)
  }

  function spendFifty() {
    if (fiftyUsed || isPending || resolved || status !== 'active') return
    setError(null)
    startTransition(async () => {
      const r = await spendKingFiftyFifty()
      if ('error' in r) { setError(r.error); return }
      setFiftyUsed(true)
      setCurrent(prev => prev ? { ...prev, removed: r.removed } : prev)
    })
  }

  function walk() {
    if (isPending || status !== 'active' || rung < 1) return
    if (!walkConfirm) { setWalkConfirm(true); return }
    setError(null)
    startTransition(async () => {
      const r = await walkKingAway()
      if ('error' in r) { setError(r.error); setWalkConfirm(false); return }
      setStatus('walked')
      setDoubloonsAwarded(r.doubloonsAwarded)
      if (r.newDoubloons !== null) {
        setBalance(prev => prev + r.doubloonsAwarded)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      }
      setResult(null)
      setCurrent(null)
      setWalkConfirm(false)
    })
  }

  // Terminal summary (reload after the run, or a walk just landed).
  const showSummary = status !== 'active' && !result

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header row, same skeleton as the board. Side rails get equal
          flex so the title sits at the true center. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/trivia" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← The Parlor
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Pirate King
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <BalanceTicker value={balance} glyph="⟡" color={GOLD} />
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        One run a week. Ten questions, each worth more than the last. Walk away with your winnings any time, or climb on. A wrong answer drops you to the last haven.
      </p>

      {/* Prize ladder — a candlelit brass rail; the live rung pulses harder the
          higher the stakes climb. */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', gap: 4,
        background: `radial-gradient(ellipse 80% 120% at 100% 50%, rgba(240,192,64,0.09), transparent 55%), linear-gradient(180deg, ${PARLOR.wood} 0%, ${PARLOR.woodDeep} 100%)`,
        border: `1px solid ${PARLOR.brassDim}`,
        borderRadius: 12, padding: '0.5rem 0.45rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        {PIRATE_KING_PRIZES.map((p, i) => {
          const r = i + 1
          const passed = rung >= r
          const isCurrent = status === 'active' && !resolved && rung === i
          const isHaven = (PIRATE_KING_HAVENS as readonly number[]).includes(r)
          // Tension climbs with the stakes: the live rung's pulse gets stronger
          // and faster near the crown.
          const tension = r / PIRATE_KING_PRIZES.length
          const spread = Math.round(7 + tension * 15)
          return (
            <motion.div
              key={r}
              className="font-karla font-700"
              animate={isCurrent ? { boxShadow: [`0 0 0px ${GOLD}00`, `0 0 ${spread}px ${GOLD}cc`, `0 0 0px ${GOLD}00`], scale: [1, 1.05, 1] } : undefined}
              transition={isCurrent ? { duration: 1.6 - tension * 0.7, repeat: Infinity, ease: 'easeInOut' } : undefined}
              style={{
                flex: 1, minWidth: 0, textAlign: 'center',
                padding: '0.3rem 0', borderRadius: 7,
                fontSize: '0.54rem', letterSpacing: '0.02em',
                background: isCurrent ? 'rgba(240,192,64,0.2)'
                  : passed ? 'rgba(52,211,153,0.1)'
                  : 'rgba(255,255,255,0.03)',
                border: isCurrent ? `1px solid ${GOLD}`
                  : isHaven ? '1px solid rgba(240,192,64,0.45)'
                  : passed ? '1px solid rgba(52,211,153,0.3)'
                  : '1px solid rgba(255,255,255,0.07)',
                color: isCurrent ? GOLD : passed ? '#7fd49a' : isHaven ? '#c2a050' : '#6f6b66',
              }}
            >
              {p}
              {isHaven && (
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', margin: '1px auto 0' }}>
                  <circle cx="12" cy="5" r="2" /><path d="M12 22V8M5 12a7 7 0 0 0 14 0M5 12H3m16 0h2" />
                </svg>
              )}
            </motion.div>
          )
        })}
      </div>

      {showSummary ? (
        /* ── Run over: the summary card ── */
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: `radial-gradient(ellipse 90% 55% at 50% 0%, rgba(240,200,106,0.09), transparent 60%), linear-gradient(180deg, ${PARLOR.wood} 0%, ${PARLOR.woodDeep} 100%)`,
          border: `1px solid ${status === 'crowned' ? GOLD : PARLOR.brassDim}`,
          borderRadius: 16, padding: '1.6rem 1.1rem',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        }}>
          {status === 'crowned' && (
            <>
              {/* Crowning spotlight — a golden shaft behind the crown. */}
              <motion.div aria-hidden
                initial={{ opacity: 0 }} animate={{ opacity: [0.5, 0.85, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', inset: 0, borderRadius: 16, pointerEvents: 'none', background: `radial-gradient(ellipse 70% 55% at 50% 12%, ${GOLD}2e, transparent 60%)` }} />
              <div style={{ position: 'relative' }}>
                <motion.div
                  initial={{ scale: 0.4, opacity: 0, y: -6 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 14 }}
                  style={{ display: 'inline-flex', marginBottom: 6 }}
                >
                  <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'inline-flex' }}>
                    <CrownIcon size={54} color={GOLD} />
                  </motion.span>
                </motion.div>
                <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: GOLD, letterSpacing: '0.04em', textShadow: `0 0 22px ${GOLD}77` }}>Pirate King</p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#c8c0ae', lineHeight: 1.55, marginTop: 8 }}>
                  All ten answered true. The crown and {doubloonsAwarded} ⟡ are yours until the next ladder is rigged — and a run like that sends your Parlor rank soaring.
                </p>
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
                  <ParlorHost size={58} line="A perfect ladder. I've hosted a hundred captains and crowned a handful — you're one of them now." />
                </div>
              </div>
            </>
          )}
          {status === 'walked' && (
            <>
              <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>⟡</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#e8e2d4' }}>Walked with the winnings</p>
              <p className="font-karla" style={{ fontSize: '0.76rem', color: '#c8c0ae', lineHeight: 1.55, marginTop: 8 }}>
                You stepped off at rung {rung} and banked {doubloonsAwarded} ⟡. A wise captain knows when the wind turns.
              </p>
            </>
          )}
          {status === 'busted' && (
            <>
              <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>🌊</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#e07070' }}>The run is sunk</p>
              <p className="font-karla" style={{ fontSize: '0.76rem', color: '#c8c0ae', lineHeight: 1.55, marginTop: 8 }}>
                {doubloonsAwarded > 0
                  ? `The haven held ${doubloonsAwarded} ⟡ for you. The rest went down with the question.`
                  : 'Nothing banked this run. The first haven sits at rung 4.'}
              </p>
            </>
          )}
          <p className="font-karla" style={{ fontSize: '0.64rem', color: '#7a7470', marginTop: 14 }}>
            A new ladder is rigged on Monday.
          </p>
          <Link
            href="/tavern/trivia"
            className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{
              display: 'block', marginTop: 14,
              padding: '0.7rem 0', borderRadius: 12,
              background: 'rgba(122,142,196,0.12)',
              border: '1px solid rgba(122,142,196,0.45)',
              color: '#aebde0',
              fontSize: '0.68rem', textDecoration: 'none',
            }}
          >
            Back to the Parlor
          </Link>
        </div>
      ) : current && (
        /* ── The question card ── */
        <div style={{
          background: `radial-gradient(ellipse 92% 46% at 50% 0%, rgba(240,200,106,0.07), transparent 60%), linear-gradient(180deg, ${PARLOR.wood} 0%, ${PARLOR.woodDeep} 100%)`,
          border: `1px solid ${GOLD}55`,
          borderRadius: 16, padding: '1.1rem 1rem 1rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: GOLD }}>
              Question {questionRung + 1} of {PIRATE_KING_PRIZES.length}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: GOLD }}>
              {prize} ⟡
            </p>
          </div>

          <p className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.45, marginBottom: 14 }}>
            {current.question}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.options.map((opt, idx) => {
              const struck = current.removed.includes(idx)
              const isCorrect = result !== null && result.correctIndex === idx
              const isWrongPick = result !== null && chosen === idx && result.correctIndex !== idx
              const isPicked = !resolved && chosen === idx
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={resolved || isPending || struck}
                  onClick={() => pickOption(idx)}
                  className="font-karla font-700"
                  style={{
                    textAlign: 'left',
                    padding: '0.7rem 0.85rem', borderRadius: 12,
                    background: isCorrect ? 'rgba(52,211,153,0.14)'
                      : isWrongPick ? 'rgba(224,112,112,0.12)'
                      : isPicked ? 'rgba(240,192,64,0.12)'
                      : 'rgba(255,255,255,0.04)',
                    border: isCorrect ? '1px solid rgba(52,211,153,0.55)'
                      : isWrongPick ? '1px solid rgba(224,112,112,0.5)'
                      : isPicked ? `1px solid ${GOLD}88`
                      : '1px solid rgba(255,255,255,0.1)',
                    color: isCorrect ? '#7fd49a' : isWrongPick ? '#e07070' : struck ? '#4a4742' : '#d8d2c4',
                    fontSize: '0.82rem', lineHeight: 1.35,
                    textDecoration: struck ? 'line-through' : 'none',
                    opacity: struck ? 0.5 : isPending && !isPicked ? 0.55 : 1,
                    cursor: resolved || isPending || struck ? 'default' : 'pointer',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>

          {error && (
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center', marginTop: 10 }}>{error}</p>
          )}

          {result === null ? (
            /* Lifeline + walk row */
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                disabled={fiftyUsed || isPending}
                onClick={spendFifty}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  flex: 1, padding: '0.6rem 0', borderRadius: 10,
                  background: fiftyUsed ? 'rgba(255,255,255,0.03)' : 'rgba(96,165,250,0.1)',
                  border: fiftyUsed ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(96,165,250,0.45)',
                  color: fiftyUsed ? '#4a4742' : '#8ab4f0',
                  fontSize: '0.62rem',
                  cursor: fiftyUsed || isPending ? 'default' : 'pointer',
                  textDecoration: fiftyUsed ? 'line-through' : 'none',
                }}
              >
                50 / 50
              </button>
              <button
                type="button"
                disabled={rung < 1 || isPending}
                onClick={walk}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  flex: 1.4, padding: '0.6rem 0', borderRadius: 10,
                  background: walkConfirm ? 'rgba(240,192,64,0.16)' : rung < 1 ? 'rgba(255,255,255,0.03)' : 'rgba(122,142,196,0.1)',
                  border: walkConfirm ? `1px solid ${GOLD}` : rung < 1 ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(122,142,196,0.4)',
                  color: walkConfirm ? GOLD : rung < 1 ? '#4a4742' : '#aebde0',
                  fontSize: '0.62rem',
                  cursor: rung < 1 || isPending ? 'default' : 'pointer',
                }}
              >
                {walkConfirm ? `Sure? Bank ${banked} ⟡` : rung < 1 ? 'Walk away' : `Walk with ${banked} ⟡`}
              </button>
            </div>
          ) : (
            /* Result panel */
            <div style={{ marginTop: 12 }}>
              {/* The host reacts to the answer + your Parlor streak. */}
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <ParlorHost size={46} line={parlorHostReaction(result.correct, result.currentStreak, result.brokeStreak)} />
                {result.pointsEarned > 0 && (
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: PARLOR.brass, textAlign: 'center', marginTop: 8 }}>
                    +{result.pointsEarned} pts toward your rank{result.currentStreak >= 4 ? ' · on a heater' : ''}
                  </p>
                )}
                {result.gemsWon > 0 && (
                  <motion.p initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}
                    className="font-cinzel font-700" style={{ fontSize: '0.92rem', textAlign: 'center', marginTop: 8, color: '#c084fc', textShadow: '0 0 14px rgba(192,132,252,0.55)' }}>
                    Ranked up! +{result.gemsWon} ◆
                  </motion.p>
                )}
              </div>
              {result.correct ? (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', textAlign: 'center', color: '#7fd49a' }}>
                    {result.status === 'crowned' ? 'Crowned. All ten answered.' : `Well answered. ${PIRATE_KING_PRIZES[rung - 1]} ⟡ on the line.`}
                  </p>
                  {result.explanation && (
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center', marginTop: 6 }}>
                      {result.explanation}
                    </p>
                  )}
                  {result.status === 'crowned' ? (
                    <button
                      type="button"
                      onClick={() => setResult(null)}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{
                        width: '100%', marginTop: 12,
                        padding: '0.7rem 0', borderRadius: 12,
                        background: 'rgba(240,192,64,0.14)',
                        border: `1px solid ${GOLD}88`,
                        color: GOLD,
                        fontSize: '0.68rem', cursor: 'pointer',
                      }}
                    >
                      Claim the crown · +{doubloonsAwarded} ⟡
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={walk}
                        className="font-karla font-700 uppercase tracking-[0.08em]"
                        style={{
                          flex: 1, padding: '0.7rem 0', borderRadius: 12,
                          background: walkConfirm ? 'rgba(240,192,64,0.16)' : 'rgba(122,142,196,0.1)',
                          border: walkConfirm ? `1px solid ${GOLD}` : '1px solid rgba(122,142,196,0.4)',
                          color: walkConfirm ? GOLD : '#aebde0',
                          fontSize: '0.64rem', cursor: 'pointer',
                        }}
                      >
                        {walkConfirm ? `Sure? Bank ${banked} ⟡` : `Walk with ${banked} ⟡`}
                      </button>
                      <button
                        type="button"
                        onClick={climbOn}
                        className="font-karla font-700 uppercase tracking-[0.08em]"
                        style={{
                          flex: 1.2, padding: '0.7rem 0', borderRadius: 12,
                          background: 'rgba(52,211,153,0.12)',
                          border: '1px solid rgba(52,211,153,0.5)',
                          color: '#7fd49a',
                          fontSize: '0.64rem', cursor: 'pointer',
                        }}
                      >
                        Climb on · {PIRATE_KING_PRIZES[rung]} ⟡
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', textAlign: 'center', color: '#e07070' }}>
                    The run is sunk.
                  </p>
                  {result.explanation && (
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center', marginTop: 6 }}>
                      {result.explanation}
                    </p>
                  )}
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: havenIfWrong > 0 ? GOLD : '#7a7470', textAlign: 'center', marginTop: 8 }}>
                    {doubloonsAwarded > 0
                      ? `The haven held ${doubloonsAwarded} ⟡ for you.`
                      : 'Nothing banked. The first haven sits at rung 4.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{
                      width: '100%', marginTop: 12,
                      padding: '0.7rem 0', borderRadius: 12,
                      background: 'rgba(122,142,196,0.12)',
                      border: '1px solid rgba(122,142,196,0.45)',
                      color: '#aebde0',
                      fontSize: '0.68rem', cursor: 'pointer',
                    }}
                  >
                    So it goes
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'active' && !resolved && (
        <p className="font-karla" style={{ fontSize: '0.64rem', color: '#7a7470', textAlign: 'center', letterSpacing: '0.04em' }}>
          {havenIfWrong > 0
            ? `Miss here and the haven keeps ${havenIfWrong} ⟡ for you.`
            : 'No haven yet. Miss here and nothing is banked.'}
        </p>
      )}
    </div>
  )
}
