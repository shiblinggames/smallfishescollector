'use client'

// Rotate-to-connect route lock. Tap a chart piece to turn it 90°; the charted
// sea-route (a dotted lane on water) lights gold as far as it connects from the
// harbour. The chart branches — T-junctions and dead-end false trails — so you
// have to find the real lane and link it, unbroken, from the harbour to the
// mark. Win is pure connectivity (no hidden answer); checked here, recorded by
// the parent.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { RaidPuzzle, PuzzleEdge } from '@/lib/raidMap'

const GOLD = '#e8c879'   // a connected, charted lane
const DIM = '#566374'    // an unconnected segment (faded ink)

const CW: Record<PuzzleEdge, PuzzleEdge> = { N: 'E', E: 'S', S: 'W', W: 'N' }
function rotateEdges(edges: PuzzleEdge[], r: number): PuzzleEdge[] {
  let out = edges
  const n = ((r % 4) + 4) % 4
  for (let i = 0; i < n; i++) out = out.map(e => CW[e])
  return out
}

const PT: Record<PuzzleEdge, [number, number]> = { N: [50, 4], E: [96, 50], S: [50, 96], W: [4, 50] }

// ── Pure helpers (so the useState initializer can scramble safely) ──────────
function openEdgesOf(p: RaidPuzzle, rots: number[], i: number): PuzzleEdge[] {
  return rotateEdges(p.tiles[i].edges, rots[i])
}
function reachableSet(p: RaidPuzzle, rots: number[]): Set<number> {
  const { cols, rows, start } = p
  const sIdx = start.row * cols + start.col
  const seen = new Set<number>()
  if (!openEdgesOf(p, rots, sIdx).includes(start.edge)) return seen
  const stack = [sIdx]
  seen.add(sIdx)
  while (stack.length) {
    const cur = stack.pop()!
    const c = cur % cols, r = (cur - c) / cols
    const oe = openEdgesOf(p, rots, cur)
    const step = (cond: boolean, nc: number, nr: number, need: PuzzleEdge) => {
      if (!cond || nc < 0 || nc >= cols || nr < 0 || nr >= rows) return
      const nb = nr * cols + nc
      if (!seen.has(nb) && openEdgesOf(p, rots, nb).includes(need)) { seen.add(nb); stack.push(nb) }
    }
    step(oe.includes('E'), c + 1, r, 'W')
    step(oe.includes('W'), c - 1, r, 'E')
    step(oe.includes('S'), c, r + 1, 'N')
    step(oe.includes('N'), c, r - 1, 'S')
  }
  return seen
}
function solvedOf(p: RaidPuzzle, rots: number[]): boolean {
  const eIdx = p.end.row * p.cols + p.end.col
  return openEdgesOf(p, rots, eIdx).includes(p.end.edge) && reachableSet(p, rots).has(eIdx)
}

// SVG path for a tile's BASE edges. 2 opposite = a line, 2 adjacent = a curved
// turn, anything else (junction / dead-end) = spokes from the centre.
function tilePath(edges: PuzzleEdge[]): string {
  if (edges.length === 2) {
    const [a, b] = edges
    const [x1, y1] = PT[a], [x2, y2] = PT[b]
    const opposite = (a === 'N' && b === 'S') || (a === 'S' && b === 'N') || (a === 'E' && b === 'W') || (a === 'W' && b === 'E')
    return opposite ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} Q50 50 ${x2} ${y2}`
  }
  return edges.map(e => { const [x, y] = PT[e]; return `M50 50 L${x} ${y}` }).join(' ')
}

function markerPos(edge: PuzzleEdge): CSSProperties {
  switch (edge) {
    case 'W': return { left: -17, top: '50%', transform: 'translateY(-50%)' }
    case 'E': return { right: -17, top: '50%', transform: 'translateY(-50%)' }
    case 'N': return { top: -17, left: '50%', transform: 'translateX(-50%)' }
    case 'S': return { bottom: -17, left: '50%', transform: 'translateX(-50%)' }
  }
}

export default function RouteLockPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const { cols, tiles, start, end } = puzzle
  const startIdx = start.row * cols + start.col
  const endIdx = end.row * cols + end.col

  // Scramble up-front (never start on the solved board, or the win would fire
  // on mount and lock out every tap).
  const [rotations, setRotations] = useState<number[]>(() => {
    let s = tiles.map(() => Math.floor(Math.random() * 4))
    for (let a = 0; a < 40 && solvedOf(puzzle, s); a++) s = tiles.map(() => Math.floor(Math.random() * 4))
    return s
  })
  const firedRef = useRef(false)

  const reached = useMemo(() => reachableSet(puzzle, rotations), [puzzle, rotations])
  const solved = useMemo(() => solvedOf(puzzle, rotations), [puzzle, rotations])

  useEffect(() => {
    if (!solved || firedRef.current) return
    firedRef.current = true
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([30, 50, 70])
    const t = setTimeout(onSolved, 1100)
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
        position: 'relative',
        padding: '0 20px',
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6,
        maxWidth: cols >= 4 ? 340 : 300, margin: '0 auto',
      }}>
        {tiles.map((tile, i) => {
          const lit = reached.has(i)
          const stroke = lit ? GOLD : DIM
          const d = tilePath(tile.edges)
          return (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              aria-label="Rotate chart piece"
              style={{
                position: 'relative', width: '100%', aspectRatio: '1', minHeight: 56, padding: 0,
                borderRadius: 9, cursor: firedRef.current ? 'default' : 'pointer',
                background: lit
                  ? 'linear-gradient(160deg, rgba(232,200,121,0.12), rgba(20,30,44,0.5))'
                  : 'linear-gradient(160deg, rgba(34,52,74,0.45), rgba(12,18,28,0.55))',
                border: `1px solid ${lit ? `${GOLD}66` : 'rgba(132,160,190,0.16)'}`,
                boxShadow: solved && lit ? `0 0 12px ${GOLD}55` : 'none',
                transition: 'background 0.2s, border-color 0.2s, box-shadow 0.3s',
                touchAction: 'manipulation', overflow: 'visible',
              }}
            >
              {/* Route art rotates; pointer-events off so taps hit the button. */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                transform: `rotate(${rotations[i] * 90}deg)`, transformOrigin: '50% 50%',
                transition: 'transform 0.25s cubic-bezier(0.34,1.3,0.5,1)',
              }}>
                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
                  <path d={d} fill="none" stroke={lit ? `${GOLD}33` : 'rgba(120,150,180,0.14)'} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={stroke} strokeWidth={5.5} strokeLinecap="round" strokeDasharray="0.5 11" />
                  <circle cx={50} cy={50} r={4} fill={stroke} />
                </svg>
              </div>

              {i === startIdx && (
                <span aria-hidden style={{ position: 'absolute', pointerEvents: 'none', ...markerPos(start.edge) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={reached.has(startIdx) ? GOLD : DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="2.5" /><line x1="12" y1="22" x2="12" y2="7.5" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                  </svg>
                </span>
              )}
              {i === endIdx && (
                <span aria-hidden className="font-cinzel font-700" style={{ position: 'absolute', pointerEvents: 'none', fontSize: '1rem', color: solved ? GOLD : DIM, ...markerPos(end.edge) }}>✕</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
        textAlign: 'center', marginTop: '0.85rem', fontSize: '0.62rem',
        color: solved ? GOLD : '#7a7875', transition: 'color 0.3s',
      }}>
        {solved ? 'The lane runs unbroken' : 'Tap a piece to turn it · chart the route from harbour to mark'}
      </p>
    </div>
  )
}
