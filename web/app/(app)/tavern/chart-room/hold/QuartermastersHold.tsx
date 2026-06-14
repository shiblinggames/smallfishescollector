'use client'

// The Quartermaster's Hold — a 9x9 cargo-manifest sudoku. Pack the hold
// so no deck (row), hull section (column), or bay (3x3) carries two of
// the same lot. Three holds a day (Skiff / Galleon / Dreadnought); the
// first solve of each pays out, with a bonus for stowing clean (no
// tally). Server-authoritative: the solution never reaches this client.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import BalanceTicker from '../../trivia/BalanceTicker'
import { saveHoldProgress, tallyHold, submitHold } from './actions'
import {
  HOLD_DIFFICULTIES, HOLD_META, HOLD_SIZE, holdPayout,
  type HoldDifficulty, type HoldState, type HoldPuzzleClient,
} from './constants'

const GOLD = '#f0c040'
const INK = '#1c140a'
const ENTRY = '#2f6fd6'
const WRONG = '#c0392b'

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

export default function QuartermastersHold({ initial, doubloons }: { initial: HoldState; doubloons: number }) {
  const puzzleMap = useMemo(() => {
    const m = {} as Record<HoldDifficulty, HoldPuzzleClient>
    for (const p of initial.puzzles) m[p.difficulty] = p
    return m
  }, [initial])

  const [active, setActive] = useState<HoldDifficulty>('easy')
  const [boards, setBoards] = useState<Record<HoldDifficulty, Board>>(() => {
    const out = {} as Record<HoldDifficulty, Board>
    for (const p of initial.puzzles) out[p.difficulty] = boardFromGivens(p.givens, p.progress)
    return out
  })
  const [solved, setSolved] = useState<Record<HoldDifficulty, { doubloons: number; clean: boolean } | null>>(() => {
    const out = {} as Record<HoldDifficulty, { doubloons: number; clean: boolean } | null>
    for (const p of initial.puzzles) out[p.difficulty] = p.solved
    return out
  })
  const [hints, setHints] = useState<Record<HoldDifficulty, number>>(() => {
    const out = {} as Record<HoldDifficulty, number>
    for (const p of initial.puzzles) out[p.difficulty] = p.hintsUsed
    return out
  })

  const [selected, setSelected] = useState<number | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [wrong, setWrong] = useState<boolean[] | null>(null)
  const [balance, setBalance] = useState(doubloons)
  const [doubloonsAwarded, setDoubloonsAwarded] = useState(initial.doubloonsAwarded)
  const [message, setMessage] = useState<string | null>(null)
  const [win, setWin] = useState<{ doubloons: number; clean: boolean } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setBalance(doubloons) }, [doubloons])

  const puzzle = puzzleMap[active]
  const board = boards[active]
  const givens = puzzle.givens
  const isGiven = useCallback((i: number) => givens[i] !== '.', [givens])
  const isSolved = solved[active] !== null
  const entries = board.entries
  const boardStr = entries.map(c => c || '.').join('')
  const isFull = !boardStr.includes('.')

  // ── Autosave (debounced) ──────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isSolved) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveHoldProgress(active, boardStr) }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardStr, active, isSolved])

  function mutateBoard(fn: (b: Board) => Board) {
    setBoards(prev => ({ ...prev, [active]: fn(prev[active]) }))
    setWrong(null)
    setMessage(null)
  }

  function placeDigit(d: number) {
    if (selected === null || isGiven(selected) || isSolved) return
    const i = selected
    if (notesMode) {
      if (entries[i]) return // erase the value first to pencil in
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
      // Clear matching pencil marks from peers (row / col / box).
      if (next[i]) {
        for (let j = 0; j < 81; j++) {
          if (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)) {
            notes[j] = notes[j].filter(x => x !== d)
          }
        }
      }
      return { entries: next, notes }
    })
  }

  function erase() {
    if (selected === null || isGiven(selected) || isSolved) return
    const i = selected
    mutateBoard(b => {
      const entries2 = b.entries.slice(); entries2[i] = ''
      const notes = b.notes.map(n => n.slice()); notes[i] = []
      return { entries: entries2, notes }
    })
  }

  function doTally() {
    if (isPending || isSolved) return
    setMessage(null)
    startTransition(async () => {
      const r = await tallyHold(active, boardStr)
      if ('error' in r) { setMessage(r.error); return }
      setWrong(r.wrong)
      setHints(prev => ({ ...prev, [active]: r.hintsUsed }))
      const wrongCount = r.wrong.filter(Boolean).length
      setMessage(wrongCount === 0 ? 'Manifest checks out so far. No bad cargo.' : `${wrongCount} lot${wrongCount > 1 ? 's' : ''} stowed wrong. (Tally used — no clean bonus.)`)
    })
  }

  function doSubmit() {
    if (isPending || isSolved || !isFull) return
    setMessage(null)
    startTransition(async () => {
      const r = await submitHold(active, boardStr)
      if ('error' in r) { setMessage(r.error); return }
      if (!r.correct) {
        setWrong(r.wrong ?? null)
        setMessage('She lists — some lots are stowed wrong. Find them and try again.')
        return
      }
      setSolved(prev => ({ ...prev, [active]: { doubloons: r.doubloonsWon, clean: r.clean } }))
      setDoubloonsAwarded(prev => prev + r.doubloonsWon)
      if (r.newDoubloons !== null) {
        setBalance(prev => prev + r.doubloonsWon)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
      }
      setWin({ doubloons: r.doubloonsWon, clean: r.clean })
    })
  }

  // ── Render helpers ────────────────────────────────────────────────
  const selVal = selected !== null ? entries[selected] : ''
  const placedCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of entries) if (e) c[e] = (c[e] ?? 0) + 1
    return c
  }, [entries])

  const cleanStill = hints[active] === 0

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/chart-room" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Chart Room
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          The Quartermaster&apos;s Hold
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <BalanceTicker value={balance} glyph="⟡" color={GOLD} />
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#c2b9a4', lineHeight: 1.5, textAlign: 'center' }}>
        Pack her even: no deck, hull section, or bay may carry two of the same lot.
      </p>

      {/* Difficulty picker */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {HOLD_DIFFICULTIES.map(d => {
          const meta = HOLD_META[d]
          const s = solved[d]
          const isActive = d === active
          return (
            <button
              key={d}
              onClick={() => { setActive(d); setSelected(null); setWrong(null); setMessage(null) }}
              className="font-cinzel font-700"
              style={{
                padding: '0.5rem 0.2rem', borderRadius: 10, cursor: 'pointer',
                background: isActive ? `${meta.accent}1f` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? meta.accent : 'rgba(196,169,106,0.2)'}`,
                color: isActive ? meta.accent : '#b8b0a2',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: '0.82rem' }}>{meta.label}</span>
              <span className="font-karla font-700" style={{ fontSize: '0.55rem', color: s ? GOLD : (isActive ? `${meta.accent}cc` : '#7a7672') }}>
                {s ? `✓ +${s.doubloons} ⟡` : `${meta.payout} ⟡`}
              </span>
            </button>
          )
        })}
      </div>

      {/* Board */}
      <div style={{
        position: 'relative',
        width: 'min(92vw, 384px)', aspectRatio: '1 / 1', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)',
        background: 'linear-gradient(180deg, #efe4c8 0%, #e6d8b6 100%)',
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
          const cell = board.notes[i]
          return (
            <div
              key={i}
              onClick={() => { if (!isSolved) setSelected(i) }}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRight: `${colOf(i) % 3 === 2 && colOf(i) !== 8 ? 2 : 0.5}px solid ${colOf(i) % 3 === 2 && colOf(i) !== 8 ? INK : 'rgba(28,20,10,0.28)'}`,
                borderBottom: `${rowOf(i) % 3 === 2 && rowOf(i) !== 8 ? 2 : 0.5}px solid ${rowOf(i) % 3 === 2 && rowOf(i) !== 8 ? INK : 'rgba(28,20,10,0.28)'}`,
                background: isWrong ? 'rgba(192,57,43,0.22)'
                  : isSel ? 'rgba(240,192,64,0.4)'
                  : sameVal ? 'rgba(47,111,214,0.16)'
                  : peer ? 'rgba(28,20,10,0.07)'
                  : 'transparent',
                cursor: isSolved ? 'default' : 'pointer',
              }}
            >
              {val ? (
                <span
                  className="font-cinzel"
                  style={{
                    fontSize: 'clamp(0.9rem, 4.4vw, 1.35rem)',
                    fontWeight: given ? 700 : 600,
                    color: isWrong ? WRONG : given ? INK : ENTRY,
                  }}
                >
                  {val}
                </span>
              ) : cell.length > 0 ? (
                <div style={{ position: 'absolute', inset: 2, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
                  {Array.from({ length: 9 }).map((__, n) => (
                    <span key={n} className="font-karla" style={{ fontSize: 'clamp(0.4rem, 1.7vw, 0.55rem)', color: 'rgba(28,20,10,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      {cell.includes(n + 1) ? n + 1 : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {isSolved ? (
        <div style={{
          textAlign: 'center', padding: '0.8rem',
          background: `${GOLD}14`, border: `1px solid ${GOLD}44`, borderRadius: 12,
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: GOLD }}>Hold stowed</p>
          <p className="font-karla" style={{ fontSize: '0.7rem', color: '#c2b9a4', marginTop: 3 }}>
            {solved[active]!.clean ? 'Stowed clean. ' : ''}The quartermaster paid {solved[active]!.doubloons} ⟡. Come back tomorrow for a fresh hold.
          </p>
        </div>
      ) : (
        <>
          {/* Number pad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4 }}>
            {Array.from({ length: 9 }).map((_, n) => {
              const d = n + 1
              const exhausted = (placedCounts[String(d)] ?? 0) >= 9
              return (
                <button
                  key={d}
                  onClick={() => placeDigit(d)}
                  disabled={selected === null}
                  className="font-cinzel font-700"
                  style={{
                    aspectRatio: '1 / 1', borderRadius: 8,
                    background: exhausted ? 'rgba(255,255,255,0.02)' : 'rgba(240,192,64,0.08)',
                    border: `1px solid ${exhausted ? 'rgba(255,255,255,0.06)' : 'rgba(240,192,64,0.28)'}`,
                    color: exhausted ? '#5a5650' : '#f0e8d0',
                    fontSize: '1.05rem',
                    cursor: selected === null ? 'default' : 'pointer',
                    opacity: selected === null ? 0.55 : 1,
                  }}
                >
                  {d}
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
                padding: '0.6rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.66rem', cursor: 'pointer',
                background: notesMode ? 'rgba(47,111,214,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${notesMode ? ENTRY : 'rgba(255,255,255,0.12)'}`,
                color: notesMode ? '#9cc2ff' : '#b8b0a2',
              }}
            >
              Pencil {notesMode ? 'On' : 'Off'}
            </button>
            <button
              onClick={erase}
              disabled={selected === null}
              className="font-karla font-700 uppercase"
              style={{
                padding: '0.6rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.66rem',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#b8b0a2',
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
                padding: '0.7rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.66rem',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(196,169,106,0.3)', color: '#d8c9a4',
                cursor: isPending ? 'default' : 'pointer',
              }}
            >
              Tally Cargo
            </button>
            <button
              onClick={doSubmit}
              disabled={isPending || !isFull}
              className="font-cinzel font-700"
              style={{
                padding: '0.7rem', borderRadius: 10, fontSize: '0.84rem',
                background: isFull ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isFull ? '#34d399' : 'rgba(255,255,255,0.1)'}`,
                color: isFull ? '#6ee7b7' : '#6a6660',
                cursor: isPending || !isFull ? 'default' : 'pointer',
              }}
            >
              Stow the Hold
            </button>
          </div>

          <p className="font-karla" style={{ fontSize: '0.62rem', color: cleanStill ? '#6f9a6f' : '#8a8276', textAlign: 'center', minHeight: '1rem' }}>
            {message ?? (cleanStill ? `Clean so far — solve with no tally for +${holdPayout(active, true) - HOLD_META[active].payout} ⟡ bonus.` : 'Tally used this hold — clean bonus forfeit.')}
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
                  background: ['radial-gradient(ellipse 80% 60% at 50% 30%, rgba(196,169,106,0.12) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(48,36,18,0.95) 0%, rgba(20,14,7,0.97) 100%)'].join(', '),
                  border: `1px solid ${GOLD}55`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)',
                }}
              >
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>The hold sits even.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#d8c9a4', lineHeight: 1.5, marginTop: 8 }}>
                  {win.clean ? 'Stowed clean — not a single tally called.' : 'A fair stow.'} The quartermaster counts out your share.
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0e8d0', marginTop: 14 }}>
                  +{win.doubloons} ⟡
                </p>
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
