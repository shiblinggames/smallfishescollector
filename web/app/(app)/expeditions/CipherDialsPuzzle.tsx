'use client'

// Cipher-dials puzzle (the coupled-rotation cousin of the beacon chain). A
// Finndicate manifest is sealed behind a row of wax dials, rigged so no single
// turn ever gives the code away: turning one dial also turns the dials on either
// side of it. Line every seal to the brass index at the top (all at position 0)
// at once and the manifest reads true.
//
// Like the beacon chain it's scrambled from the solved state (all aligned) with
// random turns, so it's always solvable but has no greedy path: a turn can knock
// two seals out of line for every one it fixes, which forces real parity/modular
// reasoning. Win is checked here; the parent records it via solvePuzzleNode.
//
// State is the CUMULATIVE turn count per dial (not mod), so a dial only ever
// rotates forward and never snaps backwards mid-animation. Aligned = count is a
// whole multiple of `positions`.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RaidPuzzle } from '@/lib/raidMap'

const LIT = '#e8c879'   // an aligned seal
const DARK = '#3c4654'  // an unaligned seal

function vibrate(p: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p)
}

// Turn dial i one step: also turns its immediate neighbours (endpoints couple
// only the one neighbour they have).
function turnAt(state: number[], n: number, i: number): number[] {
  const next = state.slice()
  const bump = (j: number) => { if (j >= 0 && j < n) next[j] = next[j] + 1 }
  bump(i - 1); bump(i); bump(i + 1)
  return next
}

// Scramble from the aligned board with random turns. Retry until it isn't
// already solved (at least one seal off the index), so it's never a giveaway.
function makeDials(n: number, positions: number, turns: number): number[] {
  let best = new Array<number>(n).fill(0)
  for (let attempt = 0; attempt < 16; attempt++) {
    let s = new Array<number>(n).fill(0)
    for (let t = 0; t < turns; t++) s = turnAt(s, n, Math.floor(Math.random() * n))
    if (s.some(v => v % positions !== 0)) return s
    best = s
  }
  return best
}

export default function CipherDialsPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const n = puzzle.dials ?? 5
  const positions = puzzle.positions ?? 3
  const scrambleTurns = puzzle.scrambleTurns ?? 9
  const stepDeg = 360 / positions

  const [state, setState] = useState<number[]>(() => makeDials(n, positions, scrambleTurns))
  const firedRef = useRef(false)

  const solved = useMemo(() => state.every(v => v % positions === 0), [state, positions])
  const alignedCount = useMemo(() => state.reduce((c, v) => c + (v % positions === 0 ? 1 : 0), 0), [state, positions])

  useEffect(() => {
    if (!solved || firedRef.current) return
    firedRef.current = true
    vibrate([30, 50, 70])
    const t = setTimeout(onSolved, 1100)
    return () => clearTimeout(t)
  }, [solved, onSolved])

  function turn(i: number) {
    if (firedRef.current) return
    vibrate(8)
    setState(s => turnAt(s, n, i))
  }

  // Tick marks around each dial (one per glyph position).
  const ticks = Array.from({ length: positions }, (_, k) => k * stepDeg)

  return (
    <div style={{ marginTop: '0.4rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
        padding: '0 12px', flexWrap: 'wrap', maxWidth: 360, margin: '0 auto',
      }}>
        {state.map((count, i) => {
          const aligned = count % positions === 0
          return (
            <button
              key={i}
              type="button"
              onClick={() => turn(i)}
              aria-label={aligned ? 'Sealed to the index' : 'Off the index'}
              aria-pressed={aligned}
              style={{
                position: 'relative', width: 56, height: 56, padding: 0, flexShrink: 0,
                borderRadius: '50%', cursor: firedRef.current ? 'default' : 'pointer',
                background: aligned
                  ? 'radial-gradient(circle at 50% 42%, rgba(232,200,121,0.26), rgba(20,28,40,0.6) 72%)'
                  : 'linear-gradient(160deg, rgba(30,40,56,0.6), rgba(10,15,24,0.65))',
                border: `1px solid ${aligned ? `${LIT}77` : 'rgba(132,160,190,0.16)'}`,
                boxShadow: aligned ? `0 0 14px ${LIT}3a, inset 0 0 9px ${LIT}1f` : 'inset 0 0 8px rgba(0,0,0,0.45)',
                transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
                touchAction: 'manipulation',
              }}
            >
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
                {/* outer ring */}
                <circle cx={50} cy={50} r={38} fill="none" stroke={aligned ? `${LIT}55` : 'rgba(132,160,190,0.2)'} strokeWidth={2} />
                {/* glyph tick marks */}
                {ticks.map((deg, k) => (
                  <line
                    key={k}
                    x1={50} y1={14} x2={50} y2={20}
                    stroke={aligned ? `${LIT}99` : DARK} strokeWidth={2.5} strokeLinecap="round"
                    transform={`rotate(${deg} 50 50)`}
                  />
                ))}
                {/* brass index marker at 12 o'clock (the target) */}
                <path d="M50 4 L46 12 L54 12 Z" fill={LIT} opacity={aligned ? 1 : 0.85} />
                {/* the rotating seal pointer — forward-only rotation by cumulative turns */}
                <g style={{ transform: `rotate(${count * stepDeg}deg)`, transformOrigin: '50px 50px', transition: 'transform 0.36s cubic-bezier(0.34,1.4,0.5,1)' }}>
                  <line x1={50} y1={50} x2={50} y2={24} stroke={aligned ? LIT : '#8aa0be'} strokeWidth={4} strokeLinecap="round" />
                  <circle cx={50} cy={24} r={5} fill={aligned ? LIT : '#8aa0be'} />
                </g>
                {/* hub */}
                <circle cx={50} cy={50} r={6} fill={aligned ? LIT : DARK} stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} />
              </svg>
            </button>
          )
        })}
      </div>

      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
        textAlign: 'center', marginTop: '0.95rem', fontSize: '0.62rem',
        color: solved ? LIT : '#7a7875', transition: 'color 0.3s',
      }}>
        {solved
          ? 'The cipher reads true'
          : `${alignedCount} / ${state.length} sealed · line every dial to the index`}
      </p>
    </div>
  )
}
