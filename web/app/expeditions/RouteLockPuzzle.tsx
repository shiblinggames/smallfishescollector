'use client'

// Rotate-to-connect route lock. Tap a chart piece to turn it 90°. The board is
// GENERATED — a random spanning-tree network at the configured size — so every
// play is a fresh tangle of junctions and dead-end drops.
//
// There is deliberately NO live "glow" showing how far you've connected from the
// harbour: that progress signal let players hill-climb the answer by guessing.
// Instead the only feedback is LOCAL and honest — every open lane-end that meets
// a wall or a closed neighbour gets a red frayed cap. You win when no end is
// left dangling (and the whole web connects). Fixing one fray often opens
// another, so you have to actually read the pieces, not flail. Win is checked
// here (no hidden answer to leak), recorded by the parent.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { RaidPuzzle, PuzzleEdge } from '@/lib/raidMap'

const GOLD = '#e8c879'   // the whole network, once it's whole
const INK = '#7f93a8'    // a charted lane (neutral)
const RED = '#d9685a'    // a frayed end (open to nothing)

const CW: Record<PuzzleEdge, PuzzleEdge> = { N: 'E', E: 'S', S: 'W', W: 'N' }
function rotateEdges(edges: PuzzleEdge[], r: number): PuzzleEdge[] {
  let out = edges
  const n = ((r % 4) + 4) % 4
  for (let i = 0; i < n; i++) out = out.map(e => CW[e])
  return out
}

const PT: Record<PuzzleEdge, [number, number]> = { N: [50, 4], E: [96, 50], S: [50, 96], W: [4, 50] }
const STEP: Record<PuzzleEdge, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
const OPP: Record<PuzzleEdge, PuzzleEdge> = { N: 'S', E: 'W', S: 'N', W: 'E' }

// A concrete, generated board: the tile shapes plus the harbour/mark anchors.
type Board = {
  cols: number
  rows: number
  tiles: { edges: PuzzleEdge[] }[]
  start: { col: number; row: number; edge: PuzzleEdge }
  end: { col: number; row: number; edge: PuzzleEdge }
}

// ── Board generation (randomized Prim's spanning tree) ──────────────────────
// A spanning tree connects every cell exactly once with no loops. Because it is
// a tree, "every cell reachable" forces every edge to line up (no leaks), so the
// all-connected win is always achievable. Prim's (frontier-random) branches a
// lot — plenty of T-junctions and dead-end drops — which is what makes it a real
// rotate-everything puzzle rather than a single corridor to trace.
function generateBoard(p: RaidPuzzle): Board {
  const { cols, rows, start, end } = p
  const N = cols * rows
  const at = (c: number, r: number) => r * cols + c
  const inTree = new Array<boolean>(N).fill(false)
  const sets = Array.from({ length: N }, () => new Set<PuzzleEdge>())

  type Cand = { to: number; from: number; dir: PuzzleEdge; back: PuzzleEdge }
  const candsOf = (idx: number): Cand[] => {
    const c = idx % cols, r = (idx - (idx % cols)) / cols
    const out: Cand[] = []
    if (r > 0)        out.push({ from: idx, to: at(c, r - 1), dir: 'N', back: 'S' })
    if (c < cols - 1) out.push({ from: idx, to: at(c + 1, r), dir: 'E', back: 'W' })
    if (r < rows - 1) out.push({ from: idx, to: at(c, r + 1), dir: 'S', back: 'N' })
    if (c > 0)        out.push({ from: idx, to: at(c - 1, r), dir: 'W', back: 'E' })
    return out
  }

  const seed = Math.floor(Math.random() * N)
  inTree[seed] = true
  let frontier: Cand[] = candsOf(seed).filter(c => !inTree[c.to])
  while (frontier.length) {
    const k = Math.floor(Math.random() * frontier.length)
    const cand = frontier[k]
    frontier.splice(k, 1)
    if (inTree[cand.to]) continue
    inTree[cand.to] = true
    sets[cand.from].add(cand.dir)
    sets[cand.to].add(cand.back)
    frontier = frontier.concat(candsOf(cand.to).filter(c => !inTree[c.to]))
  }

  // The harbour and the mark connect through the grid boundary, so stamp those
  // two boundary stubs onto their tiles (they have no neighbour that way, so no
  // conflict with the tree edges).
  sets[at(start.col, start.row)].add(start.edge)
  sets[at(end.col, end.row)].add(end.edge)

  return { cols, rows, start, end, tiles: sets.map(s => ({ edges: [...s] })) }
}

// ── Pure helpers over a Board (so the useState initializer can scramble) ─────
function openEdgesOf(b: Board, rots: number[], i: number): PuzzleEdge[] {
  return rotateEdges(b.tiles[i].edges, rots[i])
}

// The two legal boundary openings (harbour + mark): an outward edge here is NOT
// a leak. Everywhere else, an open edge must meet a neighbour.
function isLegalOpening(b: Board, i: number, e: PuzzleEdge): boolean {
  const startIdx = b.start.row * b.cols + b.start.col
  const endIdx = b.end.row * b.cols + b.end.col
  return (i === startIdx && e === b.start.edge) || (i === endIdx && e === b.end.edge)
}

// Frayed ends of one tile: open edges that hit a wall (not a legal opening) or a
// neighbour whose facing edge is closed. This is the ONLY feedback the player
// gets — local, honest, and free of any global "you're getting warmer" signal.
function fraysOf(b: Board, rots: number[], i: number): PuzzleEdge[] {
  const { cols, rows } = b
  const c = i % cols, r = (i - c) / cols
  const out: PuzzleEdge[] = []
  for (const e of openEdgesOf(b, rots, i)) {
    const [dc, dr] = STEP[e]
    const nc = c + dc, nr = r + dr
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
      if (!isLegalOpening(b, i, e)) out.push(e)        // dangles into open water
    } else {
      const nb = nr * cols + nc
      if (!openEdgesOf(b, rots, nb).includes(OPP[e])) out.push(e) // meets a closed neighbour
    }
  }
  return out
}

function reachableSet(b: Board, rots: number[]): Set<number> {
  const { cols, rows, start } = b
  const sIdx = start.row * cols + start.col
  const seen = new Set<number>()
  if (!openEdgesOf(b, rots, sIdx).includes(start.edge)) return seen
  const stack = [sIdx]
  seen.add(sIdx)
  while (stack.length) {
    const cur = stack.pop()!
    const c = cur % cols, r = (cur - c) / cols
    const oe = openEdgesOf(b, rots, cur)
    const step = (cond: boolean, nc: number, nr: number, need: PuzzleEdge) => {
      if (!cond || nc < 0 || nc >= cols || nr < 0 || nr >= rows) return
      const nb = nr * cols + nc
      if (!seen.has(nb) && openEdgesOf(b, rots, nb).includes(need)) { seen.add(nb); stack.push(nb) }
    }
    step(oe.includes('E'), c + 1, r, 'W')
    step(oe.includes('W'), c - 1, r, 'E')
    step(oe.includes('S'), c, r + 1, 'N')
    step(oe.includes('N'), c, r - 1, 'S')
  }
  return seen
}
// Solved = no frayed ends anywhere AND the whole network connects back to the
// harbour (the layout is a tree, so a leak-free board is the unique solution;
// the connectivity check is the rigorous gate that actually fires the win).
function solvedOf(b: Board, rots: number[]): boolean {
  for (let i = 0; i < b.tiles.length; i++) if (fraysOf(b, rots, i).length) return false
  return reachableSet(b, rots).size === b.tiles.length
}

function scramble(b: Board): number[] {
  let s = b.tiles.map(() => Math.floor(Math.random() * 4))
  for (let a = 0; a < 60 && solvedOf(b, s); a++) s = b.tiles.map(() => Math.floor(Math.random() * 4))
  return s
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
  // Generate a fresh tangled network once, then scramble it (never start on the
  // solved board, or the win would fire on mount and lock out every tap).
  const [board] = useState<Board>(() => generateBoard(puzzle))
  const { cols, tiles, start, end } = board
  const startIdx = start.row * cols + start.col
  const endIdx = end.row * cols + end.col

  const [rotations, setRotations] = useState<number[]>(() => scramble(board))
  const firedRef = useRef(false)

  // Frayed ends per tile (drawn in the unrotated frame at the open-edge point)
  // and the overall solved flag. No global reachability glow on purpose.
  const frays = useMemo(() => tiles.map((_, i) => fraysOf(board, rotations, i)), [board, tiles, rotations])
  const solved = useMemo(() => solvedOf(board, rotations), [board, rotations])

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
        maxWidth: cols >= 5 ? 360 : cols >= 4 ? 340 : 300, margin: '0 auto',
      }}>
        {tiles.map((tile, i) => {
          const stroke = solved ? GOLD : INK
          const d = tilePath(tile.edges)
          const tileFrays = frays[i]
          return (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              aria-label="Rotate chart piece"
              style={{
                position: 'relative', width: '100%', aspectRatio: '1', minHeight: 48, padding: 0,
                borderRadius: 9, cursor: firedRef.current ? 'default' : 'pointer',
                background: solved
                  ? 'linear-gradient(160deg, rgba(232,200,121,0.12), rgba(20,30,44,0.5))'
                  : 'linear-gradient(160deg, rgba(34,52,74,0.45), rgba(12,18,28,0.55))',
                border: `1px solid ${solved ? `${GOLD}66` : 'rgba(132,160,190,0.16)'}`,
                boxShadow: solved ? `0 0 12px ${GOLD}55` : 'none',
                transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
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
                  <path d={d} fill="none" stroke={solved ? `${GOLD}33` : 'rgba(120,150,180,0.12)'} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={stroke} strokeWidth={5.5} strokeLinecap="round" strokeDasharray="0.5 11" />
                  {tile.edges.length === 1 ? (
                    // a drop point (cache) — a ringed node you must supply
                    <>
                      <circle cx={50} cy={50} r={13} fill="none" stroke={stroke} strokeWidth={3} />
                      <circle cx={50} cy={50} r={7} fill={stroke} />
                    </>
                  ) : (
                    <circle cx={50} cy={50} r={4} fill={stroke} />
                  )}
                </svg>
              </div>

              {/* Frayed ends — drawn UNROTATED at the live open-edge points, so
                  they sit on whichever way the lane actually dangles right now. */}
              {tileFrays.length > 0 && (
                <svg viewBox="0 0 100 100" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {tileFrays.map(e => {
                    const [px, py] = PT[e]
                    const sx = 50 + (px - 50) * 0.78, sy = 50 + (py - 50) * 0.78
                    return (
                      <g key={e} stroke={RED} strokeWidth={3.2} strokeLinecap="round">
                        <line x1={sx - 4.5} y1={sy - 4.5} x2={sx + 4.5} y2={sy + 4.5} />
                        <line x1={sx - 4.5} y1={sy + 4.5} x2={sx + 4.5} y2={sy - 4.5} />
                      </g>
                    )
                  })}
                </svg>
              )}

              {i === startIdx && (
                <span aria-hidden style={{ position: 'absolute', pointerEvents: 'none', ...markerPos(start.edge) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={solved ? GOLD : INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="2.5" /><line x1="12" y1="22" x2="12" y2="7.5" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                  </svg>
                </span>
              )}
              {i === endIdx && (
                <span aria-hidden className="font-cinzel font-700" style={{ position: 'absolute', pointerEvents: 'none', fontSize: '1rem', color: solved ? GOLD : INK, ...markerPos(end.edge) }}>✕</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
        textAlign: 'center', marginTop: '0.85rem', fontSize: '0.62rem',
        color: solved ? GOLD : '#7a7875', transition: 'color 0.3s',
      }}>
        {solved
          ? 'The network is whole'
          : 'Turn the pieces so no lane ends in open water'}
      </p>
    </div>
  )
}
