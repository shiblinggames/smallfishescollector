'use client'

// The Captain's Board — lock in one of four category columns, then
// answer its three clues in any order, Jeopardy-style (50 / 100 /
// 150 ⟡; the richer the clue, the harder the question). A wrong
// answer scuttles the clue but the rest stay open. Question modal
// portals to document.body (Nav's translateZ(0) would otherwise
// anchor fixed overlays to the header).

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { answerCaptainsTile, lockCaptainsColumn } from './actions'
import BalanceTicker from '../BalanceTicker'
import {
  TRIVIA_CATEGORIES,
  categoryMeta,
  type TriviaCategoryKey,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

const DOUBLOON_COLOR = '#f0c040'

export default function CaptainsBoard({ initial, doubloons }: { initial: CaptainsBoardState; doubloons: number }) {
  const [tiles, setTiles] = useState<BoardTileClient[]>(initial.tiles)
  const [lockedCategory, setLockedCategory] = useState<TriviaCategoryKey | null>(initial.lockedCategory)
  const [doubloonsAwarded, setDoubloonsAwarded] = useState(initial.doubloonsAwarded)
  const [balance, setBalance] = useState(doubloons)
  const [pendingLock, setPendingLock] = useState<TriviaCategoryKey | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerTileResult | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  // Server prop changes (revisit after midnight rollover, another tab
  // answered) must reach the optimistic state.
  useEffect(() => {
    setTiles(initial.tiles)
    setLockedCategory(initial.lockedCategory)
    setDoubloonsAwarded(initial.doubloonsAwarded)
  }, [initial])
  useEffect(() => { setBalance(doubloons) }, [doubloons])

  const columnTiles = lockedCategory
    ? tiles.filter(t => t.category === lockedCategory).sort((a, b) => a.tier - b.tier)
    : []
  const answeredCount = columnTiles.filter(t => t.answered).length
  const allDone = lockedCategory !== null && answeredCount === 3
  const openTile = openKey ? tiles.find(t => t.key === openKey) ?? null : null

  function lockColumn(category: TriviaCategoryKey) {
    if (isPending || lockedCategory) return
    setError(null)
    startTransition(async () => {
      const r = await lockCaptainsColumn(category)
      if ('error' in r) { setError(r.error); setPendingLock(null); return }
      setTiles(r.tiles)
      setLockedCategory(r.lockedCategory)
      setDoubloonsAwarded(r.doubloonsAwarded)
      setPendingLock(null)
    })
  }

  function tapColumn(category: TriviaCategoryKey) {
    if (lockedCategory) return
    setError(null)
    setPendingLock(prev => prev === category ? null : category)
  }

  function tapTile(tile: BoardTileClient) {
    if (!lockedCategory) { tapColumn(tile.category); return }
    if (tile.category !== lockedCategory) return
    setOpenKey(tile.key)
    setResult(null)
    setChosen(null)
    setError(null)
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
      if (r.doubloonsWon > 0) setBalance(prev => prev + r.doubloonsWon)
      setTiles(prev => prev.map(t => t.key === openTile.key
        ? { ...t, answered: { chosen: idx, correct: r.correct, correctIndex: r.correctIndex, explanation: r.explanation } }
        : t
      ))
    })
  }

  function closeModal() {
    setOpenKey(null)
    setResult(null)
    setChosen(null)
    setError(null)
  }

  // Reopening an already-answered clue shows its resolved state.
  const viewAnswered = openTile?.answered ?? null
  const shownCorrectIndex = result?.correctIndex ?? viewAnswered?.correctIndex ?? null
  const shownChosen = chosen ?? viewAnswered?.chosen ?? null
  const shownExplanation = result?.explanation ?? viewAnswered?.explanation ?? null
  const resolved = result !== null || viewAnswered !== null
  // Another clue left in the column? Offer the lowest-value one as a
  // shortcut; the player can always close and pick freely instead.
  const nextAfterOpen = openTile && lockedCategory
    ? columnTiles.find(t => !t.answered && t.key !== openTile.key) ?? null
    : null

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header row, same skeleton as the Den lobby */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Link href="/tavern/trivia" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none' }}>
          ← The Parlor
        </Link>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', flex: 1 }}>
          The Captain&apos;s Board
        </p>
        <BalanceTicker value={balance} glyph="⟡" color={DOUBLOON_COLOR} />
      </div>

      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center' }}>
        Four topics chalked fresh each day. Lock in one column and take its three clues in any order; the richer the clue, the harder the question. A wrong answer scuttles the clue, the rest stay open.
      </p>

      {/* The board: 4 category columns x 3 clue tiles */}
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
        {TRIVIA_CATEGORIES.map(cat => {
          const isLocked = lockedCategory === cat.key
          const isOut = lockedCategory !== null && !isLocked
          const isProposed = pendingLock === cat.key
          return (
            <div
              key={cat.key}
              onClick={() => tapColumn(cat.key)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
                opacity: isOut ? 0.32 : 1,
                cursor: lockedCategory ? 'default' : 'pointer',
                borderRadius: 10,
                outline: isProposed ? `1px solid ${cat.color}` : 'none',
                outlineOffset: 3,
                transition: 'opacity 0.25s',
              }}
            >
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.5rem', letterSpacing: '0.08em', color: cat.color,
                textAlign: 'center', lineHeight: 1.2, minHeight: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {cat.label}
              </p>
              {tiles.filter(t => t.category === cat.key).sort((a, b) => a.tier - b.tier).map(tile => {
                const a = tile.answered
                const isOpenable = isLocked && !a
                return (
                  <motion.button
                    key={tile.key}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    onClick={e => { e.stopPropagation(); tapTile(tile) }}
                    className="font-cinzel font-700"
                    style={{
                      height: 50, borderRadius: 10,
                      cursor: isOut ? 'default' : 'pointer',
                      background: a
                        ? a.correct ? 'rgba(52,211,153,0.1)' : 'rgba(224,112,112,0.06)'
                        : isOpenable ? `${cat.color}1f`
                        : 'rgba(167,139,250,0.08)',
                      border: a
                        ? a.correct ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(224,112,112,0.25)'
                        : isOpenable ? `1px solid ${cat.color}`
                        : `1px solid ${cat.color}55`,
                      color: a
                        ? a.correct ? '#7fd49a' : '#7a5a5a'
                        : '#e8e2d4',
                      fontSize: a && !a.correct ? '0.85rem' : '0.74rem',
                    }}
                  >
                    {a ? (a.correct ? `+${tile.value}` : '✕') : `${tile.value} ⟡`}
                  </motion.button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Lock-in confirm */}
      {!lockedCategory && pendingLock && (
        <div style={{
          background: 'linear-gradient(180deg, #1a1830 0%, #0d0c1c 100%)',
          border: `1px solid ${categoryMeta(pendingLock).color}66`,
          borderRadius: 14, padding: '0.85rem 0.9rem',
        }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e8e2d4', textAlign: 'center' }}>
            Lock in <span style={{ color: categoryMeta(pendingLock).color }}>{categoryMeta(pendingLock).label}</span>?
          </p>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8478', textAlign: 'center', marginTop: 4 }}>
            The other columns close until tomorrow.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setPendingLock(null)}
              className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{
                flex: 1, padding: '0.6rem 0', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#9a9488', fontSize: '0.62rem', cursor: 'pointer',
              }}
            >
              Never mind
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => lockColumn(pendingLock)}
              className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{
                flex: 1.4, padding: '0.6rem 0', borderRadius: 10,
                background: 'rgba(122,142,196,0.12)',
                border: '1px solid rgba(122,142,196,0.45)',
                color: '#aebde0', fontSize: '0.62rem', cursor: 'pointer',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              Lock it in
            </button>
          </div>
        </div>
      )}

      {error && !openTile && (
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
      )}

      {/* Progress / completion line */}
      <p className="font-karla" style={{ fontSize: '0.68rem', color: allDone ? DOUBLOON_COLOR : '#7a7470', textAlign: 'center', letterSpacing: '0.04em' }}>
        {!lockedCategory
          ? 'Tap a column to lock it in.'
          : allDone
            ? `The column is swept. ${doubloonsAwarded} ⟡ banked today. A new board is chalked at midnight.`
            : `${answeredCount} of 3 clues answered`}
      </p>

      {/* Question modal */}
      {mounted && openTile && openTile.question && openTile.options && createPortal(
        <AnimatePresence>
          <motion.div
            key="trivia-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(2,4,10,0.78)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.2rem',
            }}
            onClick={resolved ? closeModal : undefined}
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420,
                maxHeight: '82vh', overflowY: 'auto',
                background: 'linear-gradient(180deg, #1a1830 0%, #0d0c1c 100%)',
                border: `1px solid ${categoryMeta(openTile.category).color}66`,
                borderRadius: 18,
                padding: '1.2rem 1.1rem 1.1rem',
                boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: categoryMeta(openTile.category).color }}>
                  {categoryMeta(openTile.category).label} · clue {openTile.tier} of 3
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
                    <button
                      key={idx}
                      type="button"
                      disabled={resolved || isPending}
                      onClick={() => pickOption(idx)}
                      className="font-karla font-700"
                      style={{
                        textAlign: 'left',
                        padding: '0.7rem 0.85rem', borderRadius: 12,
                        background: isCorrect ? 'rgba(52,211,153,0.14)'
                          : isWrongPick ? 'rgba(224,112,112,0.12)'
                          : isPicked ? 'rgba(167,139,250,0.14)'
                          : 'rgba(255,255,255,0.04)',
                        border: isCorrect ? '1px solid rgba(52,211,153,0.55)'
                          : isWrongPick ? '1px solid rgba(224,112,112,0.5)'
                          : isPicked ? '1px solid rgba(167,139,250,0.6)'
                          : '1px solid rgba(255,255,255,0.1)',
                        color: isCorrect ? '#7fd49a' : isWrongPick ? '#e07070' : '#d8d2c4',
                        fontSize: '0.82rem', lineHeight: 1.35,
                        cursor: resolved || isPending ? 'default' : 'pointer',
                        opacity: isPending && !isPicked ? 0.55 : 1,
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

              {resolved && (
                <div style={{ marginTop: 12 }}>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '0.9rem', textAlign: 'center',
                    color: (result?.correct ?? viewAnswered?.correct) ? '#7fd49a' : '#e07070',
                  }}>
                    {(result?.correct ?? viewAnswered?.correct)
                      ? `Well answered. +${openTile.value} ⟡`
                      : 'Scuttled.'}
                  </p>
                  {shownExplanation && (
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center', marginTop: 6 }}>
                      {shownExplanation}
                    </p>
                  )}
                  {result && nextAfterOpen ? (
                    <button
                      type="button"
                      onClick={() => { setOpenKey(nextAfterOpen.key); setResult(null); setChosen(null); setError(null) }}
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
                      Next clue · {nextAfterOpen.value} ⟡
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={closeModal}
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
                      Back to the Board
                    </button>
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
