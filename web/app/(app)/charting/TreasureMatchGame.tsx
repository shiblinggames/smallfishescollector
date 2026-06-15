'use client'

// Treasure Match — a ship-themed Match-3. Swap two adjacent treasures to
// line up 3+ of a kind; they clear, everything drops, and cascades chain.
// Hit the target score within the move limit to win. One seeded board a
// week (shared puzzle); first clear banks charting points.
//
// The board is deterministic from the week's seed; the engine runs
// client-side and the server awards the points on a claimed win.

import { useMemo, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { submitMatch } from './actions'
import { makeRng, initialBoard, resolveSwap, hasValidMove, reshuffle, areAdjacent } from './treasureMatch'
import { MATCH_TOKENS, type MatchState } from './constants'
import { denDailyCap, nextDenTier } from '@/app/(app)/tavern/constants'

const GOLD = '#f0c040'
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
function haptic(p: number | number[]) { try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p) } catch { /* no-op */ } }

export default function TreasureMatchGame({ initial }: { initial: MatchState }) {
  const { cols, rows, types, target, seed } = initial
  const total = cols * rows

  const rngRef = useRef(makeRng(seed))
  const [board, setBoard] = useState<number[]>(() => initialBoard(rngRef.current, cols, rows, types))
  const [score, setScore] = useState(0)
  const [movesLeft, setMovesLeft] = useState(initial.moves)
  const [selected, setSelected] = useState<number | null>(null)
  const [popping, setPopping] = useState<Set<number>>(new Set())
  const [invalid, setInvalid] = useState<[number, number] | null>(null)
  const [status, setStatus] = useState<'active' | 'cleared'>(initial.status)
  const [lost, setLost] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [denCap, setDenCap] = useState(initial.denCap)
  const [win, setWin] = useState<{ points: number; capUp: number | null } | null>(null)
  const [mounted, setMounted] = useState(false)

  // Refs mirror the live values for the async swap resolver.
  const boardRef = useRef(board); useEffect(() => { boardRef.current = board }, [board])
  const scoreRef = useRef(score); useEffect(() => { scoreRef.current = score }, [score])
  const movesRef = useRef(movesLeft); useEffect(() => { movesRef.current = movesLeft }, [movesLeft])
  const busyRef = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  const nextTier = useMemo(() => nextDenTier(puzzlePoints), [puzzlePoints])
  const cleared = status === 'cleared'
  const progress = Math.min(1, score / target)

  function resetBoard() {
    rngRef.current = makeRng(seed)
    const nb = initialBoard(rngRef.current, cols, rows, types)
    boardRef.current = nb; setBoard(nb)
    scoreRef.current = 0; setScore(0)
    movesRef.current = initial.moves; setMovesLeft(initial.moves)
    setSelected(null); setPopping(new Set()); setLost(false); setMessage(null)
  }

  async function finishWin(finalScore: number) {
    setStatus('cleared')
    const r = await submitMatch(finalScore, true)
    if ('error' in r) return
    if (r.pointsWon > 0 && r.newPuzzlePoints !== null) {
      setPuzzlePoints(r.newPuzzlePoints)
      setDenCap(denDailyCap(r.newPuzzlePoints))
      setWin({ points: r.pointsWon, capUp: r.capAfter > r.capBefore ? r.capAfter : null })
    } else {
      setWin({ points: 0, capUp: null })
    }
  }

  async function attemptSwap(a: number, b: number) {
    if (busyRef.current) return
    const cur = boardRef.current
    const res = resolveSwap(cur, a, b, cols, rows, types, rngRef.current)
    setSelected(null)
    if (!res) { setInvalid([a, b]); haptic(8); await wait(230); setInvalid(null); return }

    busyRef.current = true
    const newMoves = movesRef.current - 1
    movesRef.current = newMoves; setMovesLeft(newMoves)

    boardRef.current = res.swapped; setBoard(res.swapped)
    await wait(150)

    let localScore = scoreRef.current
    for (const step of res.steps) {
      setPopping(new Set(step.cleared)); haptic(step.gained > 60 ? 16 : 8)
      await wait(200)
      setPopping(new Set())
      boardRef.current = step.resultBoard; setBoard(step.resultBoard)
      localScore += step.gained; scoreRef.current = localScore; setScore(localScore)
      await wait(160)
    }

    busyRef.current = false
    if (localScore >= target) { haptic([12, 40, 12, 40, 20]); await finishWin(localScore); return }
    if (newMoves <= 0) { setLost(true); return }
    if (!hasValidMove(boardRef.current, cols, rows)) {
      const nb = reshuffle(rngRef.current, cols, rows, types)
      boardRef.current = nb; setBoard(nb); setMessage('No matches left — board reshuffled (free).')
    }
  }

  function onCell(i: number) {
    if (busyRef.current || lost) return
    if (selected === null) { setSelected(i); setMessage(null); return }
    if (selected === i) { setSelected(null); return }
    if (areAdjacent(selected, i, cols)) { void attemptSwap(selected, i) }
    else { setSelected(i) }
  }

  const boardW = `min(96vw, ${cols * 46}px)`

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/chart-room" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Chart Room
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Treasure Match
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: cleared ? GOLD : '#8f8672', whiteSpace: 'nowrap' }}>
            {cleared ? 'Cleared' : `${movesLeft} moves`}
          </span>
        </div>
      </div>

      {/* Points readout */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: '0.4rem 0.7rem', borderRadius: 10, background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)' }}>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e6d8b4' }}>{puzzlePoints} charting pts</span>
        <span style={{ color: '#6a6258' }}>·</span>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD }}>Den purse {denCap.toLocaleString()} ⟡/day</span>
        {nextTier && <span className="font-karla" style={{ fontSize: '0.62rem', color: '#9a9078' }}>({nextTier.points - puzzlePoints} → {nextTier.cap.toLocaleString()} ⟡)</span>}
      </div>

      {/* Score / target progress */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#a89878' }}>Haul</span>
          <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: score >= target ? '#7bbf7b' : '#f4ecd8' }}>{score.toLocaleString()} <span style={{ color: '#8f8672', fontSize: '0.7rem' }}>/ {target.toLocaleString()}</span></span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.35)', overflow: 'hidden', border: '1px solid rgba(196,169,106,0.2)' }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 4, background: progress >= 1 ? 'linear-gradient(90deg,#3fae78,#7bf0b0)' : `linear-gradient(90deg,#c4a96a,${GOLD})`, transition: 'width 0.3s' }} />
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#cfc6b0', lineHeight: 1.45, textAlign: 'center' }}>
        Swap two neighbors to line up 3+. Reach {target.toLocaleString()} to win +{initial.reward} charting points.
      </p>

      {/* Board */}
      <div style={{
        position: 'relative', width: boardW, aspectRatio: `${cols} / ${rows}`, margin: '0 auto',
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3,
        padding: 6, borderRadius: 12,
        background: 'linear-gradient(180deg, #1a130a 0%, #0e0a05 100%)',
        border: '1.5px solid rgba(196,169,106,0.3)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
      }}>
        {board.map((t, i) => {
          const tok = MATCH_TOKENS[t] ?? MATCH_TOKENS[0]
          const isSel = selected === i
          const isPop = popping.has(i)
          const isInvalid = invalid && (invalid[0] === i || invalid[1] === i)
          return (
            <button
              key={i}
              onClick={() => onCell(i)}
              style={{
                aspectRatio: '1 / 1', borderRadius: 8, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'clamp(1rem, 5vw, 1.5rem)', lineHeight: 1,
                background: isInvalid ? 'rgba(192,57,43,0.5)' : `${tok.color}2e`,
                border: `1.5px solid ${isSel ? '#fff' : isInvalid ? '#c0392b' : `${tok.color}77`}`,
                boxShadow: isSel ? `0 0 10px ${tok.color}` : 'none',
                transform: isPop ? 'scale(0.1)' : isSel ? 'scale(1.06)' : 'scale(1)',
                opacity: isPop ? 0 : 1,
                transition: 'transform 0.18s ease, opacity 0.18s ease, background 0.12s, border-color 0.12s',
                cursor: 'pointer',
              }}
            >
              <span aria-hidden>{tok.emoji}</span>
            </button>
          )
        })}
      </div>

      <p className="font-karla" style={{ fontSize: '0.64rem', color: message ? '#e0b48a' : '#8f8672', textAlign: 'center', minHeight: '1rem', lineHeight: 1.4 }}>
        {message ?? (cleared ? 'Cleared this week — fresh board Monday.' : 'A new board is dealt every Monday.')}
      </p>

      {/* Out-of-moves overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {lost && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                style={{ maxWidth: 320, width: '100%', textAlign: 'center', padding: '1.5rem 1.3rem', borderRadius: 18, background: 'linear-gradient(180deg, rgba(40,30,14,0.96) 0%, rgba(20,14,7,0.98) 100%)', border: '1px solid rgba(196,169,106,0.4)' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#e0b48a' }}>Out of moves</p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#cfc6b0', marginTop: 8, lineHeight: 1.5 }}>You hauled {score.toLocaleString()} of {target.toLocaleString()}. Same board, fresh moves — give it another run.</p>
                <button onClick={resetBoard} className="font-cinzel font-700" style={{ marginTop: 16, padding: '0.6rem 1.6rem', borderRadius: 10, fontSize: '0.84rem', background: 'rgba(240,192,64,0.18)', border: `1px solid ${GOLD}88`, color: '#f4ecd8', cursor: 'pointer' }}>Try Again</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Win overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {win && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWin(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }} onClick={e => e.stopPropagation()}
                style={{ maxWidth: 340, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18, background: ['radial-gradient(ellipse 80% 60% at 50% 28%, rgba(196,169,106,0.14) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.96) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>Haul secured.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#dccba6', lineHeight: 1.5, marginTop: 8 }}>{score.toLocaleString()} aboard — target smashed. Fine work, captain.</p>
                {win.points > 0
                  ? <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#7bbf7b', marginTop: 14 }}>+{win.points} charting points</p>
                  : <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a9078', marginTop: 14 }}>Already banked this week — fresh board Monday.</p>}
                {win.capUp !== null && (
                  <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 300 }} className="font-cinzel font-700" style={{ marginTop: 12, padding: '0.5rem 0.7rem', borderRadius: 10, fontSize: '0.78rem', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55` }}>
                    Den purse raised to {win.capUp.toLocaleString()} ⟡/day!
                  </motion.p>
                )}
                <button onClick={() => setWin(null)} className="font-karla font-700 uppercase" style={{ marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>
                  Back to the Deck
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
