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
import BalanceTicker from '../BalanceTicker'
import {
  TRIVIA_CATEGORIES,
  categoryMeta,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

const DOUBLOON_COLOR = '#f0c040'

export default function CaptainsBoard({ initial, doubloons }: { initial: CaptainsBoardState; doubloons: number }) {
  const [tiles, setTiles] = useState<BoardTileClient[]>(initial.tiles)
  const [playedToday, setPlayedToday] = useState(initial.playedToday)
  const [picksAllowed, setPicksAllowed] = useState(initial.picksAllowed)
  const [picksToday, setPicksToday] = useState(initial.picksToday)
  const [committedKey, setCommittedKey] = useState<string | null>(initial.committedKey)
  const [doubloonsAwarded, setDoubloonsAwarded] = useState(initial.doubloonsAwarded)
  const [balance, setBalance] = useState(doubloons)
  const [pendingPlay, setPendingPlay] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerTileResult | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
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
  }, [initial])
  useEffect(() => { setBalance(doubloons) }, [doubloons])

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

  function pickOption(idx: number) {
    if (!openTile || isPending || result || openTile.answered) return
    setError(null)
    setChosen(idx)
    startTransition(async () => {
      const r = await answerCaptainsTile(openTile.key, idx)
      if ('error' in r) { setError(r.error); setChosen(null); return }
      setResult(r)
      setDoubloonsAwarded(r.totalAwarded)
      setCommittedKey(null)
      if (r.doubloonsWon > 0) setBalance(prev => prev + r.doubloonsWon)
      if (r.newDoubloons !== null) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
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
          <BalanceTicker value={balance} glyph="⟡" color={DOUBLOON_COLOR} />
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        Twelve cards chalked fresh each Monday. {picksAllowed === 2 ? 'Captains play two a day' : 'Play one a day'} — pick a card and the clue is revealed; answer it for doubloons. The richer the card, the harder the question. Choose wisely.
      </p>

      {/* The board: 4 category columns × 3 cards */}
      <div style={{
        background: 'linear-gradient(180deg, #16142a 0%, #0b0a18 100%)',
        border: '1px solid rgba(167,139,250,0.25)',
        borderRadius: 16,
        padding: '0.9rem 0.7rem 1rem',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
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
                      : 'rgba(167,139,250,0.08)',
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
          background: 'linear-gradient(180deg, #1a1830 0%, #0d0c1c 100%)',
          border: `1px solid ${categoryMeta(pendingMeta.category).color}66`,
          borderRadius: 14, padding: '0.85rem 0.9rem',
        }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e8e2d4', textAlign: 'center' }}>
            Play <span style={{ color: categoryMeta(pendingMeta.category).color }}>{categoryMeta(pendingMeta.category).label}</span> for {pendingMeta.value} ⟡?
          </p>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8478', textAlign: 'center', marginTop: 4 }}>
            This reveals the clue and is your card for today.
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
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}
            onClick={resolved ? closeModal : undefined}
          >
            <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={e => e.stopPropagation()}
              style={{ position: 'relative', width: '100%', maxWidth: 420, maxHeight: '82vh', overflowY: 'auto', background: 'linear-gradient(180deg, #1a1830 0%, #0d0c1c 100%)', border: `1px solid ${categoryMeta(openTile.category).color}66`, borderRadius: 18, padding: '1.2rem 1.1rem 1.1rem', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' }}
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

              <p className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.45, marginBottom: 14 }}>
                {openTile.question}
              </p>

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
                    {(result?.correct ?? viewAnswered?.correct) ? `Well answered. +${openTile.value} ⟡` : 'Scuttled.'}
                  </p>
                  {shownExplanation && (
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center', marginTop: 6 }}>
                      {shownExplanation}
                    </p>
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
