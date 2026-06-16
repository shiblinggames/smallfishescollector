'use client'

// Beacon-chain puzzle (Lights Out). The smuggler's lane is marked by signal
// beacons wired as a tamper failsafe: lighting one flips the beacons beside it
// (self + orthogonal neighbours). Light the WHOLE chain at once to read the
// heading.
//
// The board is scrambled by applying random taps to the solved (all-lit) state,
// so it is ALWAYS solvable but has no greedy/hill-climb path — a tap can put out
// as many beacons as it lights, so guessing gets you nowhere and you have to
// reason about parity. Win (every beacon lit) is checked here, recorded by the
// parent.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RaidPuzzle } from '@/lib/raidMap'

const LIT = '#e8c879'    // a burning beacon
const DARK = '#3c4654'   // a dark lantern

function vibrate(p: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p)
}

// Tap i: flip the beacon and its orthogonal neighbours.
function toggleAt(state: boolean[], cols: number, rows: number, i: number): boolean[] {
  const c = i % cols, r = (i - c) / cols
  const next = state.slice()
  const flip = (cc: number, rr: number) => {
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return
    next[rr * cols + cc] = !next[rr * cols + cc]
  }
  flip(c, r); flip(c - 1, r); flip(c + 1, r); flip(c, r - 1); flip(c, r + 1)
  return next
}

// Scramble from the solved (all-lit) board with random taps. Retry until the
// board is meaningfully tangled (enough dark beacons that it is not a one- or
// two-tap giveaway).
function makeBoard(cols: number, rows: number, taps: number): boolean[] {
  const N = cols * rows
  const minDark = Math.max(6, Math.floor(N * 0.35))
  let best: boolean[] = new Array<boolean>(N).fill(true)
  for (let attempt = 0; attempt < 16; attempt++) {
    let s = new Array<boolean>(N).fill(true)
    for (let t = 0; t < taps; t++) s = toggleAt(s, cols, rows, Math.floor(Math.random() * N))
    const dark = s.reduce((n, lit) => n + (lit ? 0 : 1), 0)
    if (dark >= minDark) return s
    if (dark > best.reduce((n, lit) => n + (lit ? 0 : 1), 0)) best = s
  }
  return best
}

export default function BeaconChainPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const cols = puzzle.cols ?? 4
  const rows = puzzle.rows ?? 4
  const scrambleTaps = puzzle.scrambleTaps ?? 12
  const [state, setState] = useState<boolean[]>(() => makeBoard(cols, rows, scrambleTaps))
  const firedRef = useRef(false)

  const solved = useMemo(() => state.every(Boolean), [state])
  const litCount = useMemo(() => state.reduce((n, lit) => n + (lit ? 1 : 0), 0), [state])

  useEffect(() => {
    if (!solved || firedRef.current) return
    firedRef.current = true
    vibrate([30, 50, 70])
    const t = setTimeout(onSolved, 1100)
    return () => clearTimeout(t)
  }, [solved, onSolved])

  function tap(i: number) {
    if (firedRef.current) return
    vibrate(8)
    setState(s => toggleAt(s, cols, rows, i))
  }

  return (
    <div style={{ marginTop: '0.4rem' }}>
      <div style={{
        padding: '0 20px',
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8,
        maxWidth: cols >= 5 ? 340 : 300, margin: '0 auto',
      }}>
        {state.map((lit, i) => (
          <button
            key={i}
            type="button"
            onClick={() => tap(i)}
            aria-label={lit ? 'Lit beacon' : 'Dark beacon'}
            aria-pressed={lit}
            style={{
              position: 'relative', width: '100%', aspectRatio: '1', minHeight: 46, padding: 0,
              borderRadius: 12, cursor: firedRef.current ? 'default' : 'pointer',
              background: lit
                ? 'radial-gradient(circle at 50% 42%, rgba(232,200,121,0.30), rgba(20,28,40,0.55) 72%)'
                : 'linear-gradient(160deg, rgba(30,40,56,0.55), rgba(10,15,24,0.6))',
              border: `1px solid ${lit ? `${LIT}66` : 'rgba(132,160,190,0.14)'}`,
              boxShadow: lit ? `0 0 14px ${LIT}40, inset 0 0 10px ${LIT}1f` : 'inset 0 0 8px rgba(0,0,0,0.4)',
              transition: 'background 0.22s, border-color 0.22s, box-shadow 0.22s',
              touchAction: 'manipulation',
            }}
          >
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
              {/* lantern body */}
              <circle cx={50} cy={50} r={20}
                fill={lit ? LIT : 'none'} stroke={lit ? `${LIT}` : DARK} strokeWidth={lit ? 0 : 4} />
              {lit ? (
                <>
                  <circle cx={50} cy={50} r={20} fill="none" stroke="#fff6df" strokeWidth={2} opacity={0.65} />
                  <circle cx={44} cy={43} r={6} fill="#fff8e6" opacity={0.85} />
                </>
              ) : (
                <circle cx={50} cy={50} r={7} fill={DARK} />
              )}
            </svg>
          </button>
        ))}
      </div>

      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
        textAlign: 'center', marginTop: '0.95rem', fontSize: '0.62rem',
        color: solved ? LIT : '#7a7875', transition: 'color 0.3s',
      }}>
        {solved
          ? 'The chain blazes as one'
          : `${litCount} / ${state.length} lit · light every beacon at once`}
      </p>
    </div>
  )
}
