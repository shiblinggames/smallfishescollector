'use client'

// The Captain's Board — twelve cards chalked fresh each Monday (4 topics ×
// 3 tiers, 50 / 100 / 200 ⟡). You play ONE card a day: pick a card, commit
// (which reveals its question — no peeking first), and answer it. Over the
// week you take up to 7 of the 12. A wrong answer scuttles the card; the
// board resets Monday. Question modal portals to document.body (Nav's
// translateZ(0) would otherwise anchor fixed overlays to the header).

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { answerCaptainsTile, playCaptainsCard } from './actions'
import { ParlorHost, PARLOR, ParlorPointsTicker } from '../ParlorArt'
import {
  TRIVIA_CATEGORIES,
  TRIVIA_ANSWER_SECONDS,
  categoryMeta,
  parlorHostReaction,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

const DOUBLOON_COLOR = '#f0c040'
const GEM_COLOR = '#c084fc'
const DANGER = '#e0655a'

/** Project the server's remaining time onto the client clock: elapsed is measured
 *  server-side (serverNow − revealedAt) so clock skew can't cheat or void it. */
function deadlineFrom(revealedAt: string, serverNow: string): number {
  const elapsed = new Date(serverNow).getTime() - new Date(revealedAt).getTime()
  return Date.now() + Math.max(0, TRIVIA_ANSWER_SECONDS * 1000 - elapsed)
}

export default function CaptainsBoard({ initial, parlorPoints }: { initial: CaptainsBoardState; parlorPoints: number }) {
  const [tiles, setTiles] = useState<BoardTileClient[]>(initial.tiles)
  const [playedToday, setPlayedToday] = useState(initial.playedToday)
  const [picksAllowed, setPicksAllowed] = useState(initial.picksAllowed)
  const [picksToday, setPicksToday] = useState(initial.picksToday)
  const [committedKey, setCommittedKey] = useState<string | null>(initial.committedKey)
  const [doubloonsAwarded, setDoubloonsAwarded] = useState(initial.doubloonsAwarded)
  const [points, setPoints] = useState(parlorPoints)
  const [pendingPlay, setPendingPlay] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerTileResult | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [deadline, setDeadline] = useState<number | null>(
    initial.committedKey && initial.committedAt ? deadlineFrom(initial.committedAt, initial.serverNow) : null,
  )
  const [secondsLeft, setSecondsLeft] = useState(TRIVIA_ANSWER_SECONDS)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  // Resume a committed-but-unanswered card (e.g. refreshed mid-question).
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!resumedRef.current && initial.committedKey) {
      resumedRef.current = true
      setOpenKey(initial.committedKey)
    }
  }, [initial.committedKey])

  // Server prop changes (week rollover, another tab) reach optimistic state.
  useEffect(() => {
    setTiles(initial.tiles)
    setPlayedToday(initial.playedToday)
    setPicksAllowed(initial.picksAllowed)
    setPicksToday(initial.picksToday)
    setCommittedKey(initial.committedKey)
    setDoubloonsAwarded(initial.doubloonsAwarded)
    setDeadline(initial.committedKey && initial.committedAt ? deadlineFrom(initial.committedAt, initial.serverNow) : null)
  }, [initial])
  useEffect(() => { setPoints(parlorPoints) }, [parlorPoints])

  const openTile = openKey ? tiles.find(t => t.key === openKey) ?? null : null
  const answeredCount = tiles.filter(t => t.answered).length
  const awaitingAnswer = committedKey !== null

  function commitCard(key: string) {
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const r = await playCaptainsCard(key)
      if ('error' in r) { setError(r.error); setPendingPlay(null); return }
      setTiles(r.tiles)
      setPlayedToday(r.playedToday)
      setPicksAllowed(r.picksAllowed)
      setPicksToday(r.picksToday)
      setCommittedKey(r.committedKey)
      setDoubloonsAwarded(r.doubloonsAwarded)
      setPendingPlay(null)
      setOpenKey(key)          // straight into the question
      setResult(null)
      setChosen(null)
      setDeadline(r.committedAt ? deadlineFrom(r.committedAt, r.serverNow) : null)  // start the clock
    })
  }

  function tapTile(tile: BoardTileClient) {
    setError(null)
    if (tile.answered) { setOpenKey(tile.key); setResult(null); setChosen(null); return }  // review
    if (tile.key === committedKey) { setOpenKey(tile.key); setResult(null); setChosen(null); return }  // resume
    if (tile.spent) return                                                                  // forfeited, dead
    if (playedToday) return                                                                 // locked till tomorrow
    setPendingPlay(prev => prev === tile.key ? null : tile.key)                             // propose to play
  }

  // idx 0-3 is a real pick; -1 is the timeout sentinel (auto-fired at zero).
  function pickOption(idx: number) {
    if (!openTile || isPending || result || openTile.answered) return
    setError(null)
    setChosen(idx >= 0 ? idx : null)
    setDeadline(null)   // stop the clock the instant we commit
    startTransition(async () => {
      const r = await answerCaptainsTile(openTile.key, idx)
      if ('error' in r) { setError(r.error); setChosen(null); return }
      setResult(r)
      setDoubloonsAwarded(r.totalAwarded)
      setCommittedKey(null)
      setPoints(r.newPoints)
      if (r.newDoubloons !== null) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      }
      if (r.newGems !== null) {
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.newGems }))
      }
      setTiles(prev => prev.map(t => t.key === openTile.key
        ? { ...t, answered: { chosen: idx, correct: r.correct, correctIndex: r.correctIndex, explanation: r.explanation } }
        : t
      ))
    })
  }

  function closeModal() {
    setOpenKey(null); setResult(null); setChosen(null); setError(null)
  }

  const viewAnswered = openTile?.answered ?? null
  const shownCorrectIndex = result?.correctIndex ?? viewAnswered?.correctIndex ?? null
  const shownChosen = chosen ?? viewAnswered?.chosen ?? null
  const shownExplanation = result?.explanation ?? viewAnswered?.explanation ?? null
  const resolved = result !== null || viewAnswered !== null
  const pendingMeta = pendingPlay ? tiles.find(t => t.key === pendingPlay) : null

  // Answer countdown for the open, revealed, unanswered card. Auto-submits the
  // timeout sentinel at zero (the server judges the time either way).
  useEffect(() => {
    const live = openTile && openTile.question && !resolved && !openTile.answered && deadline !== null
    if (!live) return
    let fired = false
    const tick = () => {
      const ms = deadline - Date.now()
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)))
      if (ms <= 0 && !fired) { fired = true; pickOption(-1) }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // pickOption is stable while a card is open (openTile.key fixed until answered).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, resolved, deadline, openTile?.question])

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/trivia" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← The Parlor
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          The Captain&apos;s Board
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <ParlorPointsTicker value={points} />
        </div>
      </div>

      <div style={{ padding: '0.1rem 0.1rem 0.2rem' }}>
        <ParlorHost size={58} line={playedToday ? "Back tomorrow for your next card. The board keeps its secrets till then." : "Pick a card and I'll turn it over. Answer true and the coin — and the gems — are yours."} />
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        Twelve cards chalked fresh each Monday. {picksAllowed === 2 ? 'Captains play two a day' : 'Play one a day'} — pick a card and the clue is revealed; answer it for doubloons. The richer the card, the harder the question. Choose wisely.
      </p>

      {/* Gems now come from climbing your Parlor rank (a right answer here or in
          the King extends the shared streak) — the standing card in the lobby
          tracks it. A correct card also pays doubloons below. */}

      {/* The board — a candlelit card table: wood + brass, warm glow from above. */}
      <div style={{
        background: `radial-gradient(ellipse 90% 55% at 50% 0%, rgba(240,200,106,0.08) 0%, transparent 58%), linear-gradient(180deg, ${PARLOR.wood} 0%, ${PARLOR.woodDark} 62%, ${PARLOR.woodDeep} 100%)`,
        border: `1px solid ${PARLOR.brassDim}`,
        borderRadius: 16,
        padding: '0.9rem 0.7rem 1rem',
        boxShadow: '0 12px 34px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 40px rgba(0,0,0,0.35)',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
      }}>
        {TRIVIA_CATEGORIES.map(cat => (
          <div key={cat.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.5rem', letterSpacing: '0.08em', color: cat.color,
              textAlign: 'center', lineHeight: 1.2, minHeight: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {cat.label}
            </p>
            {tiles.filter(t => t.category === cat.key).sort((a, b) => a.tier - b.tier).map(tile => {
              const a = tile.answered
              const isCommitted = tile.key === committedKey
              const isProposed = pendingPlay === tile.key
              const isSpent = !!tile.spent
              // Tappable: answered (review), committed (resume), or — when you
              // haven't played today — any fresh (non-spent) card.
              const tappable = !!a || isCommitted || (!playedToday && !isSpent)
              // Dimmed when the card can't be played: forfeited, or the board's
              // locked for the day and this isn't the active / resolved card.
              const dim = isSpent || (playedToday && !a && !isCommitted)
              return (
                <motion.button
                  key={tile.key}
                  type="button"
                  whileTap={tappable ? { scale: 0.94 } : undefined}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  onClick={() => tapTile(tile)}
                  className="font-cinzel font-700"
                  style={{
                    height: 50, borderRadius: 10,
                    cursor: tappable ? 'pointer' : 'default',
                    opacity: dim ? 0.34 : 1,
                    background: a
                      ? a.correct ? 'rgba(52,211,153,0.1)' : 'rgba(224,112,112,0.06)'
                      : isCommitted ? `${cat.color}22`
                      : 'linear-gradient(180deg, rgba(240,224,190,0.07), rgba(240,224,190,0.02))',
                    border: a
                      ? a.correct ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(224,112,112,0.25)'
                      : isCommitted || isProposed ? `1px solid ${cat.color}`
                      : `1px solid ${cat.color}55`,
                    outline: isProposed ? `1px solid ${cat.color}` : 'none',
                    outlineOffset: 2,
                    color: a ? (a.correct ? '#7fd49a' : '#7a5a5a') : isSpent ? '#5a5750' : '#e8e2d4',
                    fontSize: (a && !a.correct) || isSpent ? '0.85rem' : '0.74rem',
                    transition: 'opacity 0.25s',
                  }}
                >
                  {a ? (a.correct ? `+${tile.value}` : '✕') : isSpent ? '–' : `${tile.value} ⟡`}
                </motion.button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Play-this-card confirm */}
      {pendingMeta && !playedToday && (
        <div style={{
          background: `linear-gradient(180deg, ${PARLOR.wood} 0%, ${PARLOR.woodDeep} 100%)`,
          border: `1px solid ${categoryMeta(pendingMeta.category).color}66`,
          borderRadius: 14, padding: '0.85rem 0.9rem',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e8e2d4', textAlign: 'center' }}>
            Play <span style={{ color: categoryMeta(pendingMeta.category).color }}>{categoryMeta(pendingMeta.category).label}</span> for {pendingMeta.value} ⟡?
          </p>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8478', textAlign: 'center', marginTop: 4 }}>
            This reveals the clue and is your card for today. You&apos;ll have {TRIVIA_ANSWER_SECONDS} seconds to answer.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => setPendingPlay(null)} className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{ flex: 1, padding: '0.6rem 0', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#9a9488', fontSize: '0.62rem', cursor: 'pointer' }}>
              Never mind
            </button>
            <button type="button" disabled={isPending} onClick={() => commitCard(pendingMeta.key)} className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{ flex: 1.4, padding: '0.6rem 0', borderRadius: 10, background: 'rgba(122,142,196,0.12)', border: '1px solid rgba(122,142,196,0.45)', color: '#aebde0', fontSize: '0.62rem', cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>
              Reveal &amp; play
            </button>
          </div>
        </div>
      )}

      {error && !openTile && (
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
      )}

      {/* Status line */}
      <p className="font-karla" style={{ fontSize: '0.68rem', color: playedToday && !awaitingAnswer ? DOUBLOON_COLOR : '#7a7470', textAlign: 'center', letterSpacing: '0.04em' }}>
        {awaitingAnswer
          ? 'Answer the card you revealed to finish.'
          : playedToday
            ? `Picks spent for today. ${doubloonsAwarded} ⟡ banked this week. Back tomorrow.`
            : `${picksAllowed - picksToday} pick${picksAllowed - picksToday === 1 ? '' : 's'} left today.${answeredCount > 0 ? ` ${answeredCount} played this week.` : ''}`}
      </p>

      {/* Question modal */}
      {mounted && openTile && openTile.question && openTile.options && createPortal(
        <AnimatePresence>
          <motion.div key="trivia-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem', perspective: 1400 }}
            onClick={resolved ? closeModal : undefined}
          >
            {/* The card turns face-up — a Y-axis flip as the host reveals the clue. */}
            <motion.div initial={{ rotateY: -82, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 34, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              onClick={e => e.stopPropagation()}
              style={{ position: 'relative', transformOrigin: '50% 50%', width: '100%', maxWidth: 420, maxHeight: '82vh', overflowY: 'auto', background: `radial-gradient(ellipse 92% 46% at 50% 0%, rgba(240,200,106,0.08), transparent 60%), linear-gradient(180deg, ${PARLOR.wood} 0%, ${PARLOR.woodDeep} 100%)`, border: `1px solid ${categoryMeta(openTile.category).color}66`, borderRadius: 18, padding: '1.2rem 1.1rem 1.1rem', boxShadow: '0 18px 50px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)' }}
            >
              {/* Close — X top-right once resolved (replaces the old full-width
                  "Back to the Board" bottom button; scrim-tap also dismisses). */}
              {resolved && (
                <button type="button" onClick={closeModal} aria-label="Close"
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', color: 'rgba(240,237,232,0.7)', cursor: 'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingRight: resolved ? 34 : 0 }}>
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: categoryMeta(openTile.category).color }}>
                  {categoryMeta(openTile.category).label} · tier {openTile.tier}
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: DOUBLOON_COLOR }}>
                  {openTile.value} ⟡
                </p>
              </div>

              <p className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.45, marginBottom: resolved ? 14 : 12 }}>
                {openTile.question}
              </p>

              {/* Answer countdown — drains while you decide; red in the last 5s. */}
              {!resolved && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                    <motion.div
                      animate={secondsLeft <= 5 ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
                      transition={secondsLeft <= 5 ? { duration: 0.7, repeat: Infinity } : { duration: 0.2 }}
                      style={{ height: '100%', width: `${Math.max(0, Math.min(1, secondsLeft / TRIVIA_ANSWER_SECONDS)) * 100}%`, background: secondsLeft <= 5 ? DANGER : DOUBLOON_COLOR, borderRadius: 999, transition: 'width 0.25s linear, background 0.3s', boxShadow: `0 0 8px ${(secondsLeft <= 5 ? DANGER : DOUBLOON_COLOR)}88` }}
                    />
                  </div>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: secondsLeft <= 5 ? DANGER : DOUBLOON_COLOR, minWidth: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{secondsLeft}s</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {openTile.options.map((opt, idx) => {
                  const isCorrect = resolved && shownCorrectIndex === idx
                  const isWrongPick = resolved && shownChosen === idx && shownCorrectIndex !== idx
                  const isPicked = !resolved && chosen === idx
                  return (
                    <button key={idx} type="button" disabled={resolved || isPending} onClick={() => pickOption(idx)} className="font-karla font-700"
                      style={{
                        textAlign: 'left', padding: '0.7rem 0.85rem', borderRadius: 12,
                        background: isCorrect ? 'rgba(52,211,153,0.14)' : isWrongPick ? 'rgba(224,112,112,0.12)' : isPicked ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.04)',
                        border: isCorrect ? '1px solid rgba(52,211,153,0.55)' : isWrongPick ? '1px solid rgba(224,112,112,0.5)' : isPicked ? '1px solid rgba(167,139,250,0.6)' : '1px solid rgba(255,255,255,0.1)',
                        color: isCorrect ? '#7fd49a' : isWrongPick ? '#e07070' : '#d8d2c4',
                        fontSize: '0.82rem', lineHeight: 1.35, cursor: resolved || isPending ? 'default' : 'pointer', opacity: isPending && !isPicked ? 0.55 : 1,
                      }}>
                      {opt}
                    </button>
                  )
                })}
              </div>

              {error && (
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center', marginTop: 10 }}>{error}</p>
              )}

              {resolved && (
                <div style={{ marginTop: 12 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', textAlign: 'center', color: (result?.correct ?? viewAnswered?.correct) ? '#7fd49a' : '#e07070' }}>
                    {(result?.correct ?? viewAnswered?.correct) ? `Well answered. +${openTile.value} ⟡` : result?.timedOut ? "Time's up." : 'Scuttled.'}
                  </p>
                  {result?.rankedUp && (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}
                      className="font-cinzel font-700"
                      style={{ fontSize: '0.86rem', textAlign: 'center', marginTop: 5, color: GEM_COLOR, textShadow: `0 0 14px ${GEM_COLOR}66` }}
                    >
                      New rank reached — collect your gems in the Parlor
                    </motion.p>
                  )}
                  {shownExplanation && (
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center', marginTop: 6 }}>
                      {shownExplanation}
                    </p>
                  )}
                  {/* The host reacts to the answer + your running streak. */}
                  {result && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <ParlorHost size={46} line={parlorHostReaction(result.correct, result.currentStreak, result.brokeStreak)} />
                      {result.pointsEarned > 0 && (
                        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: PARLOR.brass, textAlign: 'center', marginTop: 8 }}>
                          +{result.pointsEarned} pts toward your rank{result.currentStreak >= 4 ? ' · on a heater' : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
