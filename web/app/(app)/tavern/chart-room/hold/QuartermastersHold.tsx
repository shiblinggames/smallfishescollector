'use client'

// The Quartermaster's Hold — a 9x9 cargo-manifest sudoku. Pack the hold
// so no deck (row), hull section (column), or bay (3x3) carries two of
// the same lot. FOUR holds a week now (Skiff / Galleon / Dreadnought /
// Man-o-War), all open — play them in any order, stow any or all. Solving
// pays doubloons (+ a clean bonus for no tally) AND banks permanent
// charting points toward the World Chart. Server-authoritative: the
// solution never reaches this client.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import ChartingNav from '@/components/ChartingNav'
import { motion, AnimatePresence } from 'framer-motion'
import { saveHoldProgress, tallyHold, submitHold } from './actions'
import {
  HOLD_DIFFICULTIES, HOLD_META, HOLD_SIZE, holdPayout,
  type HoldDifficulty, type HoldState, type HoldPuzzleClient,
} from './constants'

const GOLD = '#f0c040'
const INK = '#1c140a'
const ENTRY = '#1f5fc9'
const WRONG = '#c0392b'
const CONFLICT = '#d98a2b'

type Board = { entries: string[]; notes: number[][] }
type SolvedResult = { doubloons: number; clean: boolean }

/** Pencil marks serialise as 81 comma-separated digit runs. They used to be
 *  left out of the save entirely, so pen survived a reload and pencil did not,
 *  which is a rough deal on a puzzle where the pencil work IS the thinking. */
const notesToStr = (notes: number[][]) => notes.map(n => n.join('')).join(',')
function notesFromStr(s: string | null): number[][] {
  const empty = () => Array.from({ length: 81 }, () => [] as number[])
  if (!s) return empty()
  const parts = s.split(',')
  if (parts.length !== 81) return empty()
  return parts.map(p => p.split('').map(Number).filter(n => n >= 1 && n <= 9))
}

function boardFromGivens(givens: string, progress: string | null, notes: string | null = null): Board {
  const src = progress ?? givens
  return {
    entries: src.split('').map(c => (c === '.' ? '' : c)),
    notes: notesFromStr(notes),
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

export default function QuartermastersHold({ initial }: { initial: HoldState }) {
  const puzzleMap = useMemo(() => {
    const m = {} as Record<HoldDifficulty, HoldPuzzleClient>
    for (const p of initial.puzzles) m[p.difficulty] = p
    return m
  }, [initial])

  // Which hold is on the bench right now — freely switchable. Default to
  // the first unsolved hold, else the first difficulty (all stowed).
  const [selected, setSelected] = useState<HoldDifficulty>(
    () => HOLD_DIFFICULTIES.find(d => !puzzleMap[d].solved) ?? HOLD_DIFFICULTIES[0],
  )

  // Per-difficulty working boards, solved results, and tally counts — kept
  // for all four so switching tabs preserves each hold's state.
  const [boards, setBoards] = useState<Record<HoldDifficulty, Board>>(() => {
    const m = {} as Record<HoldDifficulty, Board>
    for (const d of HOLD_DIFFICULTIES) m[d] = boardFromGivens(puzzleMap[d].givens, puzzleMap[d].progress, puzzleMap[d].notes)
    return m
  })
  const [solvedMap, setSolvedMap] = useState<Record<HoldDifficulty, SolvedResult | null>>(() => {
    const m = {} as Record<HoldDifficulty, SolvedResult | null>
    for (const d of HOLD_DIFFICULTIES) m[d] = puzzleMap[d].solved
    return m
  })
  const [hintsMap, setHintsMap] = useState<Record<HoldDifficulty, number>>(() => {
    const m = {} as Record<HoldDifficulty, number>
    for (const d of HOLD_DIFFICULTIES) m[d] = puzzleMap[d].hintsUsed
    return m
  })

  const [selCell, setSelCell] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [wrong, setWrong] = useState<boolean[] | null>(null)
  const [popIdx, setPopIdx] = useState<number | null>(null)
  const [flashCells, setFlashCells] = useState<Set<number>>(new Set())
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [message, setMessage] = useState<string | null>(null)
  const [win, setWin] = useState<{ doubloons: number; clean: boolean; points: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  const puzzle = puzzleMap[selected]
  const givens = puzzle.givens
  const board = boards[selected]
  const solved = solvedMap[selected]
  const hints = hintsMap[selected]
  const isGiven = useCallback((i: number) => givens[i] !== '.', [givens])
  const entries = board.entries
  const boardStr = entries.map(c => c || '.').join('')
  const notesStr = notesToStr(board.notes)
  const isFull = !boardStr.includes('.')
  const cleanStill = hints === 0

  // Merged value at a cell (given or player entry).
  const valAt = useCallback((i: number) => (givens[i] !== '.' ? givens[i] : entries[i]), [givens, entries])

  // Real-time conflict detection — any value duplicated within its row,
  // column, or box. Instant feedback so a mistake reads immediately.
  const conflicts = useMemo(() => {
    const bad = new Set<number>()
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
  }, [entries, givens])

  // Flash a unit gold the moment it's completed correctly (full + no
  // duplicates). Subtle, localized juice per the house rules. Suppressed
  // on a tab switch so an already-complete unit doesn't flash on load.
  const completedRef = useRef<Set<number>>(new Set())
  const skipFlashRef = useRef(false)
  useEffect(() => {
    const nowComplete = new Set<number>()
    UNITS.forEach((unit, idx) => {
      const vals = unit.map(i => (givens[i] !== '.' ? givens[i] : entries[i]))
      if (vals.every(v => v) && new Set(vals).size === 9) nowComplete.add(idx)
    })
    const fresh: number[] = []
    nowComplete.forEach(idx => { if (!completedRef.current.has(idx)) fresh.push(...UNITS[idx]) })
    completedRef.current = nowComplete
    if (skipFlashRef.current) { skipFlashRef.current = false; return }
    if (fresh.length) {
      const set = new Set(fresh)
      setFlashCells(set)
      const t = setTimeout(() => setFlashCells(new Set()), 620)
      return () => clearTimeout(t)
    }
  }, [entries, givens])

  // Autosave (debounced) — keyed to the hold on the bench.
  useEffect(() => {
    if (solved) return
    const t = setTimeout(() => { void saveHoldProgress(selected, boardStr, notesStr) }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardStr, notesStr, selected, solved])

  function pickDifficulty(d: HoldDifficulty) {
    if (d === selected) return
    skipFlashRef.current = true
    setSelected(d)
    setSelCell(null)
    setWrong(null)
    setMessage(null)
    setNotesMode(false)
    setFlashCells(new Set())
  }

  function mutateBoard(fn: (b: Board) => Board) {
    setBoards(prev => ({ ...prev, [selected]: fn(prev[selected]) }))
    setWrong(null)
    setMessage(null)
  }

  function placeDigit(d: number) {
    if (selCell === null || isGiven(selCell) || solved) return
    const i = selCell
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
    if (selCell === null || isGiven(selCell) || solved) return
    const i = selCell
    mutateBoard(b => {
      const entries2 = b.entries.slice(); entries2[i] = ''
      const notes = b.notes.map(n => n.slice()); notes[i] = []
      return { entries: entries2, notes }
    })
  }

  function doTally() {
    if (isPending || solved) return
    setMessage(null)
    startTransition(async () => {
      const r = await tallyHold(selected, boardStr)
      if ('error' in r) { setMessage(r.error); return }
      setWrong(r.wrong)
      setHintsMap(prev => ({ ...prev, [selected]: r.hintsUsed }))
      const n = r.wrong.filter(Boolean).length
      setMessage(n === 0 ? 'Manifest checks out so far — no bad cargo.' : `${n} lot${n > 1 ? 's' : ''} stowed wrong. (Tally used — clean bonus forfeit.)`)
    })
  }

  function doSubmit() {
    if (isPending || solved || !isFull) return
    setMessage(null)
    startTransition(async () => {
      const r = await submitHold(selected, boardStr)
      if ('error' in r) { setMessage(r.error); return }
      if (!r.correct) {
        setWrong(r.wrong ?? null)
        setMessage('She lists — some lots are stowed wrong. Find them and try again.')
        return
      }
      setSolvedMap(prev => ({ ...prev, [selected]: { doubloons: r.doubloonsWon, clean: r.clean } }))
      setPuzzlePoints(r.newPuzzlePoints)
      if (r.newDoubloons !== null) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      }
      setWin({ doubloons: r.doubloonsWon, clean: r.clean, points: r.pointsWon })
    })
  }

  const placedCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (let i = 0; i < 81; i++) { const v = valAt(i); if (v) c[v] = (c[v] ?? 0) + 1 }
    return c
  }, [valAt])

  const selVal = selCell !== null ? valAt(selCell) : ''
  const selMeta = HOLD_META[selected]

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <ChartingNav title="The Hold" backHref="/tavern/chart-room" backLabel="Charting" points={puzzlePoints} />

      {/* Difficulty picker — all four holds open, tap to switch. No lock. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {HOLD_DIFFICULTIES.map(d => {
          const meta = HOLD_META[d]
          const isSel = selected === d
          const isSolved = !!solvedMap[d]
          return (
            <button
              key={d}
              onClick={() => pickDifficulty(d)}
              style={{
                padding: '0.5rem 0.55rem', borderRadius: 11, cursor: 'pointer',
                // Selected = an OPAQUE dark panel with a strong accent tint (was a
                // translucent wash that vanished against the page's background art).
                background: isSel
                  ? `linear-gradient(180deg, ${meta.accent}59 0%, rgba(20,15,8,0.96) 100%)`
                  : 'linear-gradient(180deg, rgba(34,27,14,0.92), rgba(16,12,7,0.94))',
                border: `${isSel ? 2 : 1.5}px solid ${isSel ? meta.accent : 'rgba(196,169,106,0.32)'}`,
                boxShadow: isSel ? `0 2px 12px ${meta.accent}55` : '0 2px 8px rgba(0,0,0,0.35)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: isSel ? '#fff7e6' : '#f0e8d2' }}>
                {meta.label}
              </span>
              <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: isSolved ? meta.accent : '#a89e86' }}>
                {isSolved ? `✓ Stowed · ${meta.points} pt${meta.points > 1 ? 's' : ''}` : `${meta.points} pt${meta.points > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
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
          const isSel = selCell === i
          const peer = selCell !== null && !isSel && (rowOf(selCell) === rowOf(i) || colOf(selCell) === colOf(i) || boxOf(selCell) === boxOf(i))
          const sameVal = !!selVal && val === selVal
          const isWrong = wrong?.[i]
          const isConflict = !isWrong && conflicts.has(i)
          const flash = flashCells.has(i)
          const cell = board.notes[i]
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
              onClick={() => { if (!solved) setSelCell(i) }}
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
          <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: GOLD }}>{selMeta.label} stowed</p>
          <p className="font-karla" style={{ fontSize: '0.74rem', color: '#cfc6b0', marginTop: 4, lineHeight: 1.5 }}>
            {solved.clean ? 'Stowed clean. ' : ''}The quartermaster paid {solved.doubloons} ⟡. Your charting points stand at {puzzlePoints}. Pick another hold up top, or come back Monday for fresh cargo.
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
                  disabled={selCell === null}
                  className="font-cinzel font-700"
                  style={{
                    position: 'relative', aspectRatio: '1 / 1', borderRadius: 8,
                    // Opaque panels so the digits stay legible over the page's art.
                    background: done ? 'rgba(22,16,9,0.88)' : 'linear-gradient(180deg, rgba(60,46,20,0.95), rgba(34,25,12,0.96))',
                    border: `1px solid ${done ? 'rgba(196,169,106,0.2)' : 'rgba(240,192,64,0.6)'}`,
                    color: done ? '#6a6152' : '#f9f0d8',
                    fontSize: '1.1rem',
                    cursor: selCell === null ? 'default' : 'pointer',
                    opacity: selCell === null ? 0.7 : 1,
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
                background: notesMode ? 'linear-gradient(180deg, rgba(31,95,201,0.5), rgba(18,40,80,0.92))' : 'rgba(32,24,13,0.92)',
                border: `1px solid ${notesMode ? ENTRY : 'rgba(196,169,106,0.36)'}`,
                color: notesMode ? '#cfe1ff' : '#d8cdb2',
              }}
            >
              Pencil {notesMode ? 'On' : 'Off'}
            </button>
            <button
              onClick={erase}
              disabled={selCell === null}
              className="font-karla font-700 uppercase"
              style={{
                padding: '0.62rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.68rem',
                background: 'rgba(32,24,13,0.92)', border: '1px solid rgba(196,169,106,0.36)', color: '#d8cdb2',
                cursor: selCell === null ? 'default' : 'pointer', opacity: selCell === null ? 0.6 : 1,
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
                background: 'rgba(32,24,13,0.92)', border: '1px solid rgba(196,169,106,0.5)', color: '#eaddb8',
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
                background: isFull ? 'linear-gradient(180deg, rgba(52,211,153,0.4), rgba(14,54,40,0.95))' : 'rgba(24,20,12,0.9)',
                border: `1px solid ${isFull ? '#34d399' : 'rgba(196,169,106,0.24)'}`,
                color: isFull ? '#c8ffe6' : '#8a8272',
                cursor: isPending || !isFull ? 'default' : 'pointer',
              }}
            >
              Stow the Hold
            </motion.button>
          </div>

          <p className="font-karla" style={{ fontSize: '0.66rem', color: message ? '#e0b48a' : (cleanStill ? '#7bbf7b' : '#a89e86'), textAlign: 'center', minHeight: '1rem', lineHeight: 1.4 }}>
            {message ?? (cleanStill ? `Stow it clean (no tally) for +${holdPayout(selected, true) - HOLD_META[selected].payout} ⟡.` : 'Tally used this hold — clean bonus forfeit.')}
          </p>
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
                <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#7bbf7b', marginTop: 6 }}>+{win.points} charting point{win.points > 1 ? 's' : ''}</p>
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
