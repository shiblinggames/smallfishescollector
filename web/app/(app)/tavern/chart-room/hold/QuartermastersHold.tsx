'use client'

// The Quartermaster's Hold — a 9x9 cargo-manifest sudoku. Pack the hold
// so no deck (row), hull section (column), or bay (3x3) carries two of
// the same lot. ONE hold a day: pick a difficulty (Skiff / Galleon /
// Dreadnought), lock it in, and stow it. Solving pays doubloons (+ a
// clean bonus for no tally) AND banks permanent puzzle points that raise
// your Den gambling purse. Server-authoritative: the solution never
// reaches this client.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import BalanceTicker from '../../trivia/BalanceTicker'
import { lockHold, saveHoldProgress, tallyHold, submitHold } from './actions'
import {
  HOLD_DIFFICULTIES, HOLD_META, HOLD_SIZE, holdPayout, holdPoints,
  type HoldDifficulty, type HoldState, type HoldPuzzleClient,
} from './constants'

const GOLD = '#f0c040'
const INK = '#1c140a'
const ENTRY = '#1f5fc9'
const WRONG = '#c0392b'
const CONFLICT = '#d98a2b'

type Board = { entries: string[]; notes: number[][] }

function boardFromGivens(givens: string, progress: string | null): Board {
  const src = progress ?? givens
  return {
    entries: src.split('').map(c => (c === '.' ? '' : c)),
    notes: Array.from({ length: 81 }, () => []),
  }
}

const rowOf = (i: number) => Math.floor(i / HOLD_SIZE)
const colOf = (i: number) => i % HOLD_SIZE
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

// Cell index lists for each of the 27 units (9 rows, 9 cols, 9 boxes).
const UNITS: number[][] = (() => {
  const u: number[][] = []
  for (let r = 0; r < 9; r++) u.push([...Array(9)].map((_, c) => r * 9 + c))
  for (let c = 0; c < 9; c++) u.push([...Array(9)].map((_, r) => r * 9 + c))
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const cells: number[] = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br * 3 + r) * 9 + bc * 3 + c)
    u.push(cells)
  }
  return u
})()

export default function QuartermastersHold({ initial, doubloons }: { initial: HoldState; doubloons: number }) {
  const puzzleMap = useMemo(() => {
    const m = {} as Record<HoldDifficulty, HoldPuzzleClient>
    for (const p of initial.puzzles) m[p.difficulty] = p
    return m
  }, [initial])

  const [locked, setLocked] = useState<HoldDifficulty | null>(initial.lockedDifficulty)
  const [pendingChoice, setPendingChoice] = useState<HoldDifficulty | null>(null)
  const [board, setBoard] = useState<Board | null>(() => {
    if (!initial.lockedDifficulty) return null
    const p = puzzleMap[initial.lockedDifficulty]
    return boardFromGivens(p.givens, p.progress)
  })
  const [solved, setSolved] = useState<{ doubloons: number; clean: boolean } | null>(
    initial.lockedDifficulty ? (puzzleMap[initial.lockedDifficulty].solved) : null,
  )
  const [hints, setHints] = useState(initial.lockedDifficulty ? puzzleMap[initial.lockedDifficulty].hintsUsed : 0)

  const [selected, setSelected] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [wrong, setWrong] = useState<boolean[] | null>(null)
  const [popIdx, setPopIdx] = useState<number | null>(null)
  const [flashCells, setFlashCells] = useState<Set<number>>(new Set())
  const [balance, setBalance] = useState(doubloons)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [denCap, setDenCap] = useState(initial.denCap)
  const [message, setMessage] = useState<string | null>(null)
  const [win, setWin] = useState<{ doubloons: number; clean: boolean; points: number; capUp: number | null } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setBalance(doubloons) }, [doubloons])

  const puzzle = locked ? puzzleMap[locked] : null
  const givens = puzzle?.givens ?? ''
  const isGiven = useCallback((i: number) => givens[i] !== '.', [givens])
  const entries = board?.entries ?? []
  const boardStr = entries.map(c => c || '.').join('')
  const isFull = board !== null && !boardStr.includes('.')
  const cleanStill = hints === 0

  // Merged value at a cell (given or player entry).
  const valAt = useCallback((i: number) => (givens[i] !== '.' ? givens[i] : entries[i]), [givens, entries])

  // Real-time conflict detection — any value duplicated within its row,
  // column, or box. Instant feedback so a mistake reads immediately.
  const conflicts = useMemo(() => {
    const bad = new Set<number>()
    if (!board) return bad
    for (const unit of UNITS) {
      const seen = new Map<string, number[]>()
      for (const i of unit) {
        const v = givens[i] !== '.' ? givens[i] : entries[i]
        if (!v) continue
        const arr = seen.get(v) ?? []
        arr.push(i); seen.set(v, arr)
      }
      for (const arr of seen.values()) if (arr.length > 1) arr.forEach(i => bad.add(i))
    }
    return bad
  }, [board, entries, givens])

  // Flash a unit gold the moment it's completed correctly (full + no
  // duplicates). Subtle, localized juice per the house rules.
  const completedRef = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!board) return
    const nowComplete = new Set<number>()
    UNITS.forEach((unit, idx) => {
      const vals = unit.map(i => (givens[i] !== '.' ? givens[i] : entries[i]))
      if (vals.every(v => v) && new Set(vals).size === 9) nowComplete.add(idx)
    })
    const fresh: number[] = []
    nowComplete.forEach(idx => { if (!completedRef.current.has(idx)) fresh.push(...UNITS[idx]) })
    completedRef.current = nowComplete
    if (fresh.length) {
      const set = new Set(fresh)
      setFlashCells(set)
      const t = setTimeout(() => setFlashCells(new Set()), 620)
      return () => clearTimeout(t)
    }
  }, [board, entries, givens])

  // Autosave (debounced).
  useEffect(() => {
    if (!locked || solved || !board) return
    const t = setTimeout(() => { void saveHoldProgress(locked, boardStr) }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardStr, locked, solved])

  function mutateBoard(fn: (b: Board) => Board) {
    setBoard(prev => (prev ? fn(prev) : prev))
    setWrong(null)
    setMessage(null)
  }

  function placeDigit(d: number) {
    if (selected === null || !board || isGiven(selected) || solved) return
    const i = selected
    if (notesMode) {
      if (entries[i]) return
      mutateBoard(b => {
        const notes = b.notes.map(n => n.slice())
        const cell = notes[i]
        notes[i] = cell.includes(d) ? cell.filter(x => x !== d) : [...cell, d].sort()
        return { ...b, notes }
      })
      return
    }
    mutateBoard(b => {
      const next = b.entries.slice()
      next[i] = next[i] === String(d) ? '' : String(d)
      const notes = b.notes.map(n => n.slice())
      notes[i] = []
      if (next[i]) {
        for (let j = 0; j < 81; j++) {
          if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) {
            notes[j] = notes[j].filter(x => x !== d)
          }
        }
      }
      return { entries: next, notes }
    })
    setPopIdx(i)
    setTimeout(() => setPopIdx(p => (p === i ? null : p)), 180)
  }

  function erase() {
    if (selected === null || !board || isGiven(selected) || solved) return
    const i = selected
    mutateBoard(b => {
      const entries2 = b.entries.slice(); entries2[i] = ''
      const notes = b.notes.map(n => n.slice()); notes[i] = []
      return { entries: entries2, notes }
    })
  }

  function confirmLock() {
    if (!pendingChoice || isPending) return
    const choice = pendingChoice
    startTransition(async () => {
      const r = await lockHold(choice)
      if ('error' in r) { setMessage(r.error); setPendingChoice(null); return }
      setLocked(r.lockedDifficulty)
      const p = puzzleMap[r.lockedDifficulty]
      setBoard(boardFromGivens(p.givens, p.progress))
      setSolved(p.solved)
      setHints(p.hintsUsed)
      setPendingChoice(null)
      setSelected(null)
    })
  }

  function doTally() {
    if (isPending || solved || !locked) return
    setMessage(null)
    startTransition(async () => {
      const r = await tallyHold(locked, boardStr)
      if ('error' in r) { setMessage(r.error); return }
      setWrong(r.wrong)
      setHints(r.hintsUsed)
      const n = r.wrong.filter(Boolean).length
      setMessage(n === 0 ? 'Manifest checks out so far — no bad cargo.' : `${n} lot${n > 1 ? 's' : ''} stowed wrong. (Tally used — clean bonus forfeit.)`)
    })
  }

  function doSubmit() {
    if (isPending || solved || !isFull || !locked) return
    setMessage(null)
    startTransition(async () => {
      const r = await submitHold(locked, boardStr)
      if ('error' in r) { setMessage(r.error); return }
      if (!r.correct) {
        setWrong(r.wrong ?? null)
        setMessage('She lists — some lots are stowed wrong. Find them and try again.')
        return
      }
      setSolved({ doubloons: r.doubloonsWon, clean: r.clean })
      setPuzzlePoints(r.newPuzzlePoints)
      setDenCap(r.capAfter)
      if (r.newDoubloons !== null) {
        setBalance(prev => prev + r.doubloonsWon)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      }
      setWin({ doubloons: r.doubloonsWon, clean: r.clean, points: r.pointsWon, capUp: r.capAfter > r.capBefore ? r.capAfter : null })
    })
  }

  const placedCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (let i = 0; i < 81; i++) { const v = valAt(i); if (v) c[v] = (c[v] ?? 0) + 1 }
    return c
  }, [valAt])

  const selVal = selected !== null ? valAt(selected) : ''

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/chart-room" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Chart Room
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f4ecd8', textAlign: 'center', whiteSpace: 'nowrap' }}>
          The Quartermaster&apos;s Hold
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <BalanceTicker value={balance} glyph="⟡" color={GOLD} />
        </div>
      </div>

      {/* Puzzle-points / Den purse perk readout */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
        padding: '0.5rem 0.7rem', borderRadius: 10,
        background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)',
      }}>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e6d8b4' }}>
          {puzzlePoints} puzzle pts
        </span>
        <span style={{ color: '#6a6258' }}>·</span>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD }}>
          Den purse {denCap.toLocaleString()} ⟡/day
        </span>
        {initial.nextTier && puzzlePoints < initial.nextTier.points && (
          <span className="font-karla" style={{ fontSize: '0.62rem', color: '#9a9078' }}>
            ({initial.nextTier.points - puzzlePoints} pts → {initial.nextTier.cap.toLocaleString()} ⟡)
          </span>
        )}
      </div>

      {/* ── No hold locked: choose today's ── */}
      {!locked ? (
        <>
          <p className="font-karla" style={{ fontSize: '0.78rem', color: '#cfc6b0', lineHeight: 1.55, textAlign: 'center' }}>
            Choose one hold to stow today. The other two close till midnight — harder holds pay more doubloons and more puzzle points.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {HOLD_DIFFICULTIES.map(d => {
              const meta = HOLD_META[d]
              const sel = pendingChoice === d
              return (
                <button
                  key={d}
                  onClick={() => setPendingChoice(sel ? null : d)}
                  style={{
                    textAlign: 'left', padding: '0.85rem 1rem', borderRadius: 14, cursor: 'pointer',
                    background: sel ? `${meta.accent}1f` : 'rgba(255,255,255,0.035)',
                    border: `1.5px solid ${sel ? meta.accent : 'rgba(196,169,106,0.22)'}`,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: sel ? meta.accent : '#f0e8d2' }}>{meta.label}</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#a89e86', marginTop: 2 }}>
                      {meta.givens} lots pre-stowed · {d === 'easy' ? 'gentle' : d === 'medium' ? 'a real puzzle' : 'for hardened minds'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: GOLD }}>{meta.payout} ⟡</p>
                    <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: meta.accent, marginTop: 2 }}>+{meta.points} pts</p>
                  </div>
                </button>
              )
            })}
          </div>
          {pendingChoice && (
            <button
              onClick={confirmLock}
              disabled={isPending}
              className="font-cinzel font-700"
              style={{
                padding: '0.8rem', borderRadius: 12, fontSize: '0.9rem', cursor: isPending ? 'default' : 'pointer',
                background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.45)', color: '#bcd4ff',
              }}
            >
              Lock in the {HOLD_META[pendingChoice].label} for today
            </button>
          )}
          {message && <p className="font-karla" style={{ fontSize: '0.7rem', color: '#d98a8a', textAlign: 'center' }}>{message}</p>}
        </>
      ) : (
        <>
          {/* Locked difficulty banner */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: HOLD_META[locked].accent }}>
              {HOLD_META[locked].label}
            </span>
            <span className="font-karla" style={{ fontSize: '0.62rem', color: '#8f8672' }}>
              · today&apos;s hold
            </span>
          </div>

          {/* Board */}
          <div style={{
            position: 'relative',
            width: 'min(92vw, 396px)', aspectRatio: '1 / 1', margin: '0 auto',
            display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)',
            background: 'linear-gradient(180deg, #f3e9cf 0%, #e9dcba 100%)',
            border: `2.5px solid ${INK}`, borderRadius: 8, overflow: 'hidden',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
          }}>
            {Array.from({ length: 81 }).map((_, i) => {
              const given = isGiven(i)
              const val = given ? givens[i] : entries[i]
              const isSel = selected === i
              const peer = selected !== null && !isSel && (rowOf(selected) === rowOf(i) || colOf(selected) === colOf(i) || boxOf(selected) === boxOf(i))
              const sameVal = !!selVal && val === selVal
              const isWrong = wrong?.[i]
              const isConflict = !isWrong && conflicts.has(i)
              const flash = flashCells.has(i)
              const cell = board!.notes[i]
              const bg = isWrong ? 'rgba(192,57,43,0.28)'
                : flash ? 'rgba(240,192,64,0.55)'
                : isSel ? 'rgba(240,192,64,0.42)'
                : isConflict ? 'rgba(217,138,43,0.22)'
                : sameVal ? 'rgba(31,95,201,0.18)'
                : peer ? 'rgba(28,20,10,0.08)'
                : 'transparent'
              return (
                <div
                  key={i}
                  onClick={() => { if (!solved) setSelected(i) }}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: `${colOf(i) % 3 === 2 && colOf(i) !== 8 ? 2 : 0.5}px solid ${colOf(i) % 3 === 2 && colOf(i) !== 8 ? INK : 'rgba(28,20,10,0.32)'}`,
                    borderBottom: `${rowOf(i) % 3 === 2 && rowOf(i) !== 8 ? 2 : 0.5}px solid ${rowOf(i) % 3 === 2 && rowOf(i) !== 8 ? INK : 'rgba(28,20,10,0.32)'}`,
                    background: bg,
                    transition: 'background 0.18s',
                    cursor: solved ? 'default' : 'pointer',
                  }}
                >
                  {val ? (
                    <span
                      className="font-cinzel"
                      style={{
                        fontSize: 'clamp(1rem, 4.7vw, 1.45rem)',
                        fontWeight: given ? 800 : 600,
                        color: isWrong ? WRONG : isConflict ? CONFLICT : given ? INK : ENTRY,
                        transform: popIdx === i ? 'scale(1.28)' : 'scale(1)',
                        transition: 'transform 0.16s cubic-bezier(.34,1.7,.5,1)',
                      }}
                    >
                      {val}
                    </span>
                  ) : cell.length > 0 ? (
                    <div style={{ position: 'absolute', inset: 2, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
                      {Array.from({ length: 9 }).map((__, n) => (
                        <span key={n} className="font-karla font-700" style={{ fontSize: 'clamp(0.42rem, 1.8vw, 0.6rem)', color: 'rgba(28,20,10,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                          {cell.includes(n + 1) ? n + 1 : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {solved ? (
            <div style={{
              textAlign: 'center', padding: '0.9rem',
              background: `${GOLD}16`, border: `1px solid ${GOLD}4d`, borderRadius: 12,
            }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: GOLD }}>Hold stowed</p>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: '#cfc6b0', marginTop: 4, lineHeight: 1.5 }}>
                {solved.clean ? 'Stowed clean. ' : ''}The quartermaster paid {solved.doubloons} ⟡. Your puzzle points stand at {puzzlePoints}. Fresh holds at midnight.
              </p>
            </div>
          ) : (
            <>
              {/* Number pad with remaining counts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4 }}>
                {Array.from({ length: 9 }).map((_, n) => {
                  const d = n + 1
                  const remaining = 9 - (placedCounts[String(d)] ?? 0)
                  const done = remaining <= 0
                  return (
                    <button
                      key={d}
                      onClick={() => placeDigit(d)}
                      disabled={selected === null}
                      className="font-cinzel font-700"
                      style={{
                        position: 'relative', aspectRatio: '1 / 1', borderRadius: 8,
                        background: done ? 'rgba(255,255,255,0.02)' : 'rgba(240,192,64,0.1)',
                        border: `1px solid ${done ? 'rgba(255,255,255,0.06)' : 'rgba(240,192,64,0.32)'}`,
                        color: done ? '#5a5650' : '#f4ecd8',
                        fontSize: '1.1rem',
                        cursor: selected === null ? 'default' : 'pointer',
                        opacity: selected === null ? 0.55 : 1,
                      }}
                    >
                      {d}
                      {!done && (
                        <span className="font-karla font-700" style={{ position: 'absolute', bottom: 1, right: 3, fontSize: '0.46rem', color: 'rgba(240,192,64,0.7)' }}>{remaining}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Tools */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <button
                  onClick={() => setNotesMode(m => !m)}
                  className="font-karla font-700 uppercase"
                  style={{
                    padding: '0.62rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.68rem', cursor: 'pointer',
                    background: notesMode ? 'rgba(31,95,201,0.22)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${notesMode ? ENTRY : 'rgba(255,255,255,0.14)'}`,
                    color: notesMode ? '#a8c8ff' : '#c4bba6',
                  }}
                >
                  Pencil {notesMode ? 'On' : 'Off'}
                </button>
                <button
                  onClick={erase}
                  disabled={selected === null}
                  className="font-karla font-700 uppercase"
                  style={{
                    padding: '0.62rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.68rem',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: '#c4bba6',
                    cursor: selected === null ? 'default' : 'pointer', opacity: selected === null ? 0.55 : 1,
                  }}
                >
                  Erase
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
                <button
                  onClick={doTally}
                  disabled={isPending}
                  className="font-karla font-700 uppercase"
                  style={{
                    padding: '0.72rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.68rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(196,169,106,0.34)', color: '#e0d2ad',
                    cursor: isPending ? 'default' : 'pointer',
                  }}
                >
                  Tally Cargo
                </button>
                <motion.button
                  onClick={doSubmit}
                  disabled={isPending || !isFull}
                  animate={isFull ? { boxShadow: ['0 0 0px rgba(52,211,153,0)', '0 0 14px rgba(52,211,153,0.5)', '0 0 0px rgba(52,211,153,0)'] } : {}}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="font-cinzel font-700"
                  style={{
                    padding: '0.72rem', borderRadius: 10, fontSize: '0.88rem',
                    background: isFull ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isFull ? '#34d399' : 'rgba(255,255,255,0.1)'}`,
                    color: isFull ? '#8ef0c0' : '#6a6660',
                    cursor: isPending || !isFull ? 'default' : 'pointer',
                  }}
                >
                  Stow the Hold
                </motion.button>
              </div>

              <p className="font-karla" style={{ fontSize: '0.66rem', color: message ? '#e0b48a' : (cleanStill ? '#7bbf7b' : '#a89e86'), textAlign: 'center', minHeight: '1rem', lineHeight: 1.4 }}>
                {message ?? (cleanStill ? `Stow it clean (no tally) for +${holdPayout(locked, true) - HOLD_META[locked].payout} ⟡ and +1 puzzle point.` : 'Tally used this hold — clean bonus forfeit.')}
              </p>
            </>
          )}
        </>
      )}

      {/* Win overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {win && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setWin(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
            >
              <motion.div
                initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                onClick={e => e.stopPropagation()}
                style={{
                  maxWidth: 340, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18,
                  background: ['radial-gradient(ellipse 80% 60% at 50% 28%, rgba(196,169,106,0.14) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(48,36,18,0.96) 0%, rgba(20,14,7,0.98) 100%)'].join(', '),
                  border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)',
                }}
              >
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>The hold sits even.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#dccba6', lineHeight: 1.5, marginTop: 8 }}>
                  {win.clean ? 'Stowed clean — not a single tally called.' : 'A fair stow.'} The quartermaster counts out your share.
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f4ecd8', marginTop: 14 }}>+{win.doubloons} ⟡</p>
                <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#7bbf7b', marginTop: 6 }}>+{win.points} puzzle point{win.points > 1 ? 's' : ''}</p>
                {win.capUp !== null && (
                  <motion.p
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 300 }}
                    className="font-cinzel font-700"
                    style={{ marginTop: 12, padding: '0.5rem 0.7rem', borderRadius: 10, fontSize: '0.78rem', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55` }}
                  >
                    Den purse raised to {win.capUp.toLocaleString()} ⟡/day!
                  </motion.p>
                )}
                <button
                  onClick={() => setWin(null)}
                  className="font-karla font-700 uppercase"
                  style={{ marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}
                >
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
