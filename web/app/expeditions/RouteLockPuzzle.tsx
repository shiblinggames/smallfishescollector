'use client'

// Rotate-to-connect route lock (a "pipes" puzzle). Tap a chart piece to spin
// it 90°; the lane glows gold as far as it connects from the harbour. Solve it
// by linking an unbroken route from the start edge to the end mark. The win is
// pure connectivity (no hidden answer), checked here; the parent persists it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { RaidPuzzle, PuzzleEdge } from '@/lib/raidMap'

const ACCENT = '#e0b358'   // matches the puzzle node accent
const DIM = '#4a5460'

const CW: Record<PuzzleEdge, PuzzleEdge> = { N: 'E', E: 'S', S: 'W', W: 'N' }
function rotateEdges(edges: PuzzleEdge[], r: number): PuzzleEdge[] {
  let out = edges
  const n = ((r % 4) + 4) % 4
  for (let i = 0; i < n; i++) out = out.map(e => CW[e])
  return out
}

// Center→edge endpoints in the 0..100 tile viewBox (slightly inset).
const EDGE_PT: Record<PuzzleEdge, [number, number]> = {
  N: [50, 3], E: [97, 50], S: [50, 97], W: [3, 50],
}

export default function RouteLockPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const { cols, rows, tiles, start, end } = puzzle
  const idx = (c: number, r: number) => r * cols + c
  const startIdx = idx(start.col, start.row)
  const endIdx = idx(end.col, end.row)

  const [rotations, setRotations] = useState<number[]>(() => tiles.map(() => 0))
  const firedRef = useRef(false)

  const openEdges = (i: number, rots: number[]) => rotateEdges(tiles[i].edges, rots[i])

  // Cells reachable from the start edge via matched open edges.
  function reachable(rots: number[]): Set<number> {
    const seen = new Set<number>()
    if (!openEdges(startIdx, rots).includes(start.edge)) return seen
    const stack = [startIdx]
    seen.add(startIdx)
    while (stack.length) {
      const cur = stack.pop()!
      const c = cur % cols, r = Math.floor(cur / cols)
      const oe = openEdges(cur, rots)
      const step = (cond: boolean, nc: number, nr: number, need: PuzzleEdge) => {
        if (!cond || nc < 0 || nc >= cols || nr < 0 || nr >= rows) return
        const nb = idx(nc, nr)
        if (!seen.has(nb) && openEdges(nb, rots).includes(need)) { seen.add(nb); stack.push(nb) }
      }
      step(oe.includes('E'), c + 1, r, 'W')
      step(oe.includes('W'), c - 1, r, 'E')
      step(oe.includes('S'), c, r + 1, 'N')
      step(oe.includes('N'), c, r - 1, 'S')
    }
    return seen
  }
  const isSolved = (rots: number[]) =>
    openEdges(endIdx, rots).includes(end.edge) && reachable(rots).has(endIdx)

  // Scramble on mount — never hand the player an already-solved board.
  useEffect(() => {
    let scr: number[] = tiles.map(() => Math.floor(Math.random() * 4))
    for (let a = 0; a < 25 && isSolved(scr); a++) scr = tiles.map(() => Math.floor(Math.random() * 4))
    setRotations(scr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reached = useMemo(() => reachable(rotations), [rotations]) // eslint-disable-line react-hooks/exhaustive-deps
  const solved = useMemo(() => isSolved(rotations), [rotations])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!solved || firedRef.current) return
    firedRef.current = true
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([30, 50, 70])
    const t = setTimeout(onSolved, 1100) // let the lane finish glowing
    return () => clearTimeout(t)
  }, [solved, onSolved])

  function tap(i: number) {
    if (firedRef.current) return
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
    setRotations(rs => { const n = [...rs]; n[i] = (n[i] + 1) % 4; return n })
  }

  return (
    <div style={{ marginTop: '0.4rem' }}>
      <div style={{
        position: 'relative', overflow: 'visible',
        padding: '0 22px', // gutters for the harbour / mark badges
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6,
        maxWidth: 320, margin: '0 auto',
      }}>
        {tiles.map((_, i) => {
          const lit = reached.has(i)
          const stroke = lit ? ACCENT : DIM
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              aria-label="Rotate chart piece"
              style={{
                position: 'relative', aspectRatio: '1', width: '100%', padding: 0,
                borderRadius: 10, cursor: firedRef.current ? 'default' : 'pointer',
                background: lit ? 'rgba(224,179,88,0.10)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${lit ? `${ACCENT}66` : 'rgba(255,255,255,0.09)'}`,
                boxShadow: solved && lit ? `0 0 12px ${ACCENT}66` : 'none',
                transition: 'background 0.2s, border-color 0.2s, box-shadow 0.3s',
                touchAction: 'manipulation',
              }}
            >
              <motion.svg
                viewBox="0 0 100 100"
                animate={{ rotate: rotations[i] * 90 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                style={{ width: '100%', height: '100%', display: 'block' }}
              >
                {tiles[i].edges.map(e => {
                  const [x, y] = EDGE_PT[e]
                  return <line key={e} x1={50} y1={50} x2={x} y2={y} stroke={stroke} strokeWidth={13} strokeLinecap="round" />
                })}
                <circle cx={50} cy={50} r={9} fill={stroke} />
              </motion.svg>

              {/* Harbour entry on the start tile (fixed, doesn't rotate) */}
              {i === startIdx && (
                <span aria-hidden style={{ position: 'absolute', left: -20, top: '50%', transform: 'translateY(-50%)', color: reached.has(startIdx) ? ACCENT : DIM }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              )}
              {/* The mark on the end tile (fixed) */}
              {i === endIdx && (
                <span aria-hidden className="font-cinzel font-700" style={{ position: 'absolute', right: -18, top: '50%', transform: 'translateY(-50%)', fontSize: '0.95rem', color: solved ? ACCENT : DIM }}>✕</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
        textAlign: 'center', marginTop: '0.8rem', fontSize: '0.62rem',
        color: solved ? ACCENT : '#7a7875', transition: 'color 0.3s',
      }}>
        {solved ? 'The lane runs unbroken' : 'Tap a piece to turn it · link the harbour to the mark'}
      </p>
    </div>
  )
}
