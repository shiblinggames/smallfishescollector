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
import { vibrate } from '@/lib/haptics'

const LIT = '#e8c879'   // an aligned seal
const DARK = '#3c4654'  // an unaligned seal

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
      {/* Unaligned dials breathe so it's obvious they're live + tappable. */}
      <style>{`@keyframes cipherBreathe {
        0%, 100% { box-shadow: inset 0 0 9px rgba(0,0,0,0.45), 0 0 0 rgba(232,200,121,0); }
        50%      { box-shadow: inset 0 0 9px rgba(0,0,0,0.45), 0 0 13px rgba(232,200,121,0.4); }
      }`}</style>

      <p className="font-karla" style={{ textAlign: 'center', fontSize: '0.74rem', lineHeight: 1.5, color: 'rgba(240,237,232,0.72)', maxWidth: 300, margin: '0 auto 0.9rem' }}>
        Tap a dial to turn it. Turning one nudges the dials beside it. Line every seal to the <span style={{ color: LIT }}>gold mark</span> up top.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 8,
        maxWidth: 392, margin: '0 auto', padding: '0 6px',
      }}>
        {state.map((count, i) => {
          const aligned = count % positions === 0
          return (
            <button
              key={i}
              type="button"
              onClick={() => turn(i)}
              aria-label={aligned ? 'Sealed to the index' : 'Off the index, tap to turn'}
              aria-pressed={aligned}
              style={{
                position: 'relative', width: '100%', aspectRatio: '1', padding: 0,
                borderRadius: '50%', cursor: firedRef.current ? 'default' : 'pointer',
                background: aligned
                  ? 'radial-gradient(circle at 50% 40%, rgba(232,200,121,0.30), rgba(18,26,38,0.7) 72%)'
                  : 'radial-gradient(circle at 50% 38%, rgba(42,54,72,0.72), rgba(10,15,24,0.78) 75%)',
                border: `2px solid ${aligned ? LIT : 'rgba(150,180,210,0.42)'}`,
                boxShadow: aligned ? `0 0 16px ${LIT}45, inset 0 0 10px ${LIT}22` : 'inset 0 0 9px rgba(0,0,0,0.45)',
                animation: aligned || firedRef.current ? 'none' : 'cipherBreathe 2.4s ease-in-out infinite',
                transition: 'background 0.3s, border-color 0.3s',
                touchAction: 'manipulation',
              }}
            >
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
                {/* rotate-hint arc + arrowhead — signals the dial turns */}
                <g opacity={aligned ? 0.22 : 0.55}>
                  <path d="M30 75 A 26 26 0 0 0 70 75" fill="none" stroke={aligned ? LIT : '#9fb6d2'} strokeWidth={3} strokeLinecap="round" />
                  <path d="M70 75 l-1 -7 l7 3 z" fill={aligned ? LIT : '#9fb6d2'} />
                </g>
                {/* outer ring */}
                <circle cx={50} cy={50} r={38} fill="none" stroke={aligned ? `${LIT}55` : 'rgba(150,180,210,0.3)'} strokeWidth={2} />
                {/* glyph tick marks */}
                {ticks.map((deg, k) => (
                  <line
                    key={k}
                    x1={50} y1={13} x2={50} y2={21}
                    stroke={aligned ? `${LIT}aa` : DARK} strokeWidth={3} strokeLinecap="round"
                    transform={`rotate(${deg} 50 50)`}
                  />
                ))}
                {/* brass index marker at 12 o'clock (the target) */}
                <path d="M50 2 L45 12 L55 12 Z" fill={LIT} opacity={aligned ? 1 : 0.9} />
                {/* the rotating seal pointer — forward-only rotation by cumulative turns */}
                <g style={{ transform: `rotate(${count * stepDeg}deg)`, transformOrigin: '50px 50px', transition: 'transform 0.4s cubic-bezier(0.34,1.45,0.5,1)' }}>
                  <line x1={50} y1={52} x2={50} y2={22} stroke={aligned ? LIT : '#c9d8ea'} strokeWidth={5} strokeLinecap="round" />
                  <circle cx={50} cy={22} r={6} fill={aligned ? LIT : '#c9d8ea'} />
                </g>
                {/* hub */}
                <circle cx={50} cy={50} r={7} fill={aligned ? LIT : '#54647a'} stroke="rgba(0,0,0,0.45)" strokeWidth={1.5} />
              </svg>
            </button>
          )
        })}
      </div>

      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
        textAlign: 'center', marginTop: '1rem', fontSize: '0.62rem',
        color: solved ? LIT : '#7a7875', transition: 'color 0.3s',
      }}>
        {solved ? 'The cipher reads true' : `${alignedCount} / ${state.length} sealed`}
      </p>
    </div>
  )
}
