'use client'

// The Captain's Board — daily 4x3 trivia board. Tap a tile, weigh the
// question, answer true to bank its gems; a wrong answer scuttles the
// tile for the day. Question modal portals to document.body (Nav's
// translateZ(0) would otherwise anchor fixed overlays to the header).

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { answerCaptainsTile } from './actions'
import {
  TRIVIA_CATEGORIES,
  categoryMeta,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

const GEM_COLOR = '#c084fc'

export default function CaptainsBoard({ initial }: { initial: CaptainsBoardState }) {
  const [tiles, setTiles] = useState<BoardTileClient[]>(initial.tiles)
  const [gemsAwarded, setGemsAwarded] = useState(initial.gemsAwarded)
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
    setGemsAwarded(initial.gemsAwarded)
  }, [initial])

  const answeredCount = tiles.filter(t => t.answered).length
  const allDone = answeredCount === tiles.length && tiles.length > 0
  const openTile = openKey ? tiles.find(t => t.key === openKey) ?? null : null

  function pickOption(idx: number) {
    if (!openTile || isPending || result || openTile.answered) return
    setError(null)
    setChosen(idx)
    startTransition(async () => {
      const r = await answerCaptainsTile(openTile.key, idx)
      if ('error' in r) { setError(r.error); setChosen(null); return }
      setResult(r)
      setGemsAwarded(r.totalAwarded)
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

  // Reopening an already-answered tile shows its resolved state.
  const viewAnswered = openTile?.answered ?? null
  const shownCorrectIndex = result?.correctIndex ?? viewAnswered?.correctIndex ?? null
  const shownChosen = chosen ?? viewAnswered?.chosen ?? null
  const shownExplanation = result?.explanation ?? viewAnswered?.explanation ?? null
  const resolved = result !== null || viewAnswered !== null

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
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: gemsAwarded > 0 ? GEM_COLOR : '#7a7672' }}>
          +{gemsAwarded} ◆
        </span>
      </div>

      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center' }}>
        Twelve questions chalked fresh each day. Answer true to bank the gems. A wrong answer scuttles the tile until tomorrow.
      </p>

      {/* The board: 4 category columns x 3 value tiles */}
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
              return (
                <motion.button
                  key={tile.key}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  onClick={() => { setOpenKey(tile.key); setResult(null); setChosen(null); setError(null) }}
                  className="font-cinzel font-700"
                  style={{
                    height: 50, borderRadius: 10, cursor: 'pointer',
                    background: a
                      ? a.correct ? 'rgba(52,211,153,0.1)' : 'rgba(224,112,112,0.06)'
                      : 'rgba(167,139,250,0.08)',
                    border: a
                      ? a.correct ? '1px solid rgba(52,211,153,0.4)' : '1px solid rgba(224,112,112,0.25)'
                      : `1px solid ${cat.color}55`,
                    color: a
                      ? a.correct ? '#7fd49a' : '#7a5a5a'
                      : '#e8e2d4',
                    fontSize: a && !a.correct ? '0.85rem' : '0.8rem',
                  }}
                >
                  {a ? (a.correct ? `+${tile.value}` : '✕') : `${tile.value} ◆`}
                </motion.button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Progress / completion line */}
      <p className="font-karla" style={{ fontSize: '0.68rem', color: allDone ? GEM_COLOR : '#7a7470', textAlign: 'center', letterSpacing: '0.04em' }}>
        {allDone
          ? `The board is swept. ${gemsAwarded} ◆ banked today. A new board is chalked at midnight.`
          : `${answeredCount} of ${tiles.length} answered`}
      </p>

      {/* Question modal */}
      {mounted && openTile && createPortal(
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
                  {categoryMeta(openTile.category).label}
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: GEM_COLOR }}>
                  {openTile.value} ◆
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
                      ? `Well answered. +${openTile.value} ◆`
                      : 'Scuttled.'}
                  </p>
                  {shownExplanation && (
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center', marginTop: 6 }}>
                      {shownExplanation}
                    </p>
                  )}
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
