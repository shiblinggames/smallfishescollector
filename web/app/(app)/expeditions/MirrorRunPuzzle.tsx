'use client'

// Mirror Run — a Zelda-style light-beam dungeon puzzle. A signal-lantern fires
// a beam across the grid; the player taps mirror tiles to rotate them between
// '/' and '\\', bending the beam around walls onto the target lens. The beam is
// hidden while planning: you commit a layout and tap Fire to test it (no
// steer-by-sight). You get a limited number of fires (fireBudget) — burn them
// all without lighting the lens and the mirrors reset, so guessing loses to
// planning. A FIRED beam that reaches the lens solves it (onSolved →
// solvePuzzleNode grants Nav XP). Pure client logic; no server validation.
//
// ANIMATION SAFETY: the "beam travels along the path" effect is a STAGGERED
// per-segment OPACITY reveal (each short sub-segment fades in on a delay) — all
// compositor-cheap. It does NOT animate SVG geometry (stroke-dashoffset/dasharray)
// or use a CSS filter: an earlier version that did froze the whole iOS PWA
// webview after repeated fires (see feedback_perf_debugging). The fire budget
// also bounds how many reveals ever run. Keep it opacity/transform-only.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RaidPuzzle, MirrorOrient, BeamDir } from '@/lib/raidMap'
import { vibrate } from '@/lib/haptics'

// How a mirror bends an incoming beam. '/' swaps right<->up and left<->down;
// '\\' swaps right<->down and left<->up.
const REFLECT: Record<MirrorOrient, Record<BeamDir, BeamDir>> = {
  '/':  { right: 'up',   up: 'right', left: 'down', down: 'left' },
  '\\': { right: 'down', down: 'right', left: 'up',  up: 'left' },
}
const STEP: Record<BeamDir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
}
const OPP: Record<BeamDir, BeamDir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
// Edge-midpoint a beam EXITS toward, in cell units (cell (x,y) spans [x..x+1]).
function edgePoint(x: number, y: number, d: BeamDir): [number, number] {
  if (d === 'up')    return [x + 0.5, y]
  if (d === 'down')  return [x + 0.5, y + 1]
  if (d === 'left')  return [x, y + 0.5]
  return [x + 1, y + 0.5] // right
}

const GOLD = '#fbbf24'
const RED  = '#e2674a'
const HOT  = '#ffe9b0' // beam colour in flight, before it settles

export default function MirrorRunPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const lvl = puzzle.mirror
  const initialOrient = useMemo(() => {
    const o: Record<string, MirrorOrient> = {}
    lvl?.mirrors.forEach(m => { o[`${m.x},${m.y}`] = m.init })
    return o
  }, [lvl])
  const [orient, setOrient] = useState<Record<string, MirrorOrient>>(() => ({ ...initialOrient }))
  const solvedRef = useRef(false)
  // onSolved kept in a ref so the solve effect doesn't depend on its identity —
  // the parent recreates it every render, and depending on it would let a stray
  // re-render's cleanup cancel the pending solve timeout (puzzle never completes).
  const onSolvedRef = useRef(onSolved)
  useEffect(() => { onSolvedRef.current = onSolved })

  const [revealed, setRevealed] = useState(false)  // a beam is fired + showing
  const [fireSeq, setFireSeq]   = useState(0)       // re-keys the travel animation
  const [arrived, setArrived]   = useState(false)   // beam reached its end
  const [firesUsed, setFiresUsed] = useState(0)     // toward fireBudget
  const [failed, setFailed]     = useState(false)   // out of fires → resetting

  const wallSet   = useMemo(() => new Set((lvl?.walls ?? []).map(w => `${w.x},${w.y}`)), [lvl])
  const mirrorSet = useMemo(() => new Set((lvl?.mirrors ?? []).map(m => `${m.x},${m.y}`)), [lvl])
  const fixedSet  = useMemo(() => new Set((lvl?.mirrors ?? []).filter(m => m.fixed).map(m => `${m.x},${m.y}`)), [lvl])

  // Trace the beam from the lantern, reflecting off mirrors, until it hits the
  // target (solved), a wall, the grid edge, or loops out (step cap).
  const trace = useMemo(() => {
    const segs: { x: number; y: number; from: BeamDir; to: BeamDir }[] = []
    if (!lvl) return { segs, hit: false }
    const { cols, rows, source, target } = lvl
    let x = source.x, y = source.y
    let dir: BeamDir = source.dir
    let hit = false
    const cap = cols * rows * 4
    for (let i = 0; i < cap; i++) {
      const key = `${x},${y}`
      const entry = dir
      if (!(i === 0 && x === source.x && y === source.y) && mirrorSet.has(key)) {
        dir = REFLECT[orient[key] ?? '/'][dir]
      }
      segs.push({ x, y, from: entry, to: dir })
      if (x === target.x && y === target.y) { hit = true; break }
      const { dx, dy } = STEP[dir]
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break
      if (wallSet.has(`${nx},${ny}`)) break
      x = nx; y = ny
    }
    return { segs, hit }
  }, [lvl, orient, mirrorSet, wallSet])

  // Beam geometry — polyline points (cell units), pixel length, SVG string.
  // Adaptive CELL keeps bigger grids on a phone (~300px wide cap).
  const geo = useMemo(() => {
    if (!lvl) return { CELL: 0, W: 0, H: 0, pts: [] as [number, number][], lenPx: 0, str: '' }
    const CELL = Math.min(44, Math.floor(320 / Math.max(lvl.cols, lvl.rows)))
    const pts: [number, number][] = []
    for (const s of trace.segs) {
      const inPt  = edgePoint(s.x, s.y, OPP[s.from])
      const ctr: [number, number] = [s.x + 0.5, s.y + 0.5]
      const outPt = edgePoint(s.x, s.y, s.to)
      if (pts.length === 0) pts.push(inPt)
      pts.push(ctr, outPt)
    }
    let lenPx = 0
    for (let i = 1; i < pts.length; i++) lenPx += Math.hypot((pts[i][0] - pts[i - 1][0]) * CELL, (pts[i][1] - pts[i - 1][1]) * CELL)
    const str = pts.map(([px, py]) => `${px * CELL},${py * CELL}`).join(' ')
    return { CELL, W: lvl.cols * CELL, H: lvl.rows * CELL, pts, lenPx, str }
  }, [lvl, trace])

  // Travel time scales with path length (~0.85px/ms), clamped.
  const travelMs = Math.min(1100, Math.max(360, Math.round(geo.lenPx / 0.85)))
  const budget = lvl?.fireBudget ?? null

  // Each fire: let the beam travel, then mark it arrived (lens flare / haptic /
  // solve / fire-budget check all hang off arrival).
  useEffect(() => {
    if (!revealed) { setArrived(false); return }
    setArrived(false)
    const t = setTimeout(() => setArrived(true), travelMs)
    return () => clearTimeout(t)
  }, [fireSeq, revealed, travelMs])

  // Arrival outcome: solve on a hit, else (if the fire budget is spent) reset
  // the mirrors so the player re-plans rather than brute-forcing.
  useEffect(() => {
    if (!arrived) return
    if (trace.hit) {
      if (!solvedRef.current) {
        solvedRef.current = true
        vibrate([0, 30, 45, 70])
        const t = setTimeout(() => onSolvedRef.current(), 720)
        return () => clearTimeout(t)
      }
      return
    }
    vibrate(16)
    if (budget != null && firesUsed >= budget) {
      setFailed(true)
      const t = setTimeout(() => {
        setOrient({ ...initialOrient })
        setFiresUsed(0)
        setRevealed(false)
        setArrived(false)
        setFailed(false)
      }, 1150)
      return () => clearTimeout(t)
    }
  }, [arrived, trace.hit, budget, firesUsed, initialOrient])

  if (!lvl) return null
  const { cols, rows, source, target } = lvl
  const { CELL, W, H } = geo
  const solved    = arrived && trace.hit
  const missed    = arrived && !trace.hit && !failed
  const traveling = revealed && !arrived
  const locked    = traveling || failed
  const beamColor = !arrived ? HOT : trace.hit ? GOLD : RED
  const firesLeft = budget != null ? Math.max(0, budget - firesUsed) : null

  // Pixel sub-segments of the beam, each with a reveal delay proportional to its
  // distance along the path — this is the "light advances through the maze".
  const ppts = geo.pts.map(([x, y]) => [x * CELL, y * CELL] as [number, number])
  const segments: { x1: number; y1: number; x2: number; y2: number; delay: number }[] = []
  {
    let acc = 0
    for (let i = 1; i < ppts.length; i++) {
      const d = Math.hypot(ppts[i][0] - ppts[i - 1][0], ppts[i][1] - ppts[i - 1][1])
      segments.push({ x1: ppts[i - 1][0], y1: ppts[i - 1][1], x2: ppts[i][0], y2: ppts[i][1], delay: geo.lenPx > 0 ? (acc / geo.lenPx) * travelMs : 0 })
      acc += d
    }
  }

  // Turning any mirror hides the beam again — back to planning, no steer-by-sight.
  function rotate(key: string) {
    if (solvedRef.current || locked || fixedSet.has(key)) return
    vibrate(12)
    setRevealed(false)
    setOrient(prev => ({ ...prev, [key]: prev[key] === '/' ? '\\' : '/' }))
  }

  function fire() {
    if (solvedRef.current || locked) return
    vibrate(18)
    setFiresUsed(n => n + 1)
    setFireSeq(s => s + 1)
    setRevealed(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {/* One-shot, compositor-only juice (opacity/transform). NO per-frame SVG
          geometry or filters — that's what froze iOS PWA. See feedback_perf_debugging. */}
      <style>{`
        @keyframes mrun-seg { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mrun-lens-pop { 0% { transform: translate(-50%,-50%) scale(0.45); opacity: 0.8 } 100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0 } }
        @keyframes mrun-lens-bounce { 0% { transform: scale(0.7) } 55% { transform: scale(1.2) } 100% { transform: scale(1) } }
      `}</style>
      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a948a', textAlign: 'center', lineHeight: 1.5 }}>
        Turn the mirrors to plan the beam&apos;s path, then fire the lantern. The beam stays dark until you fire.
      </p>
      <div style={{ position: 'relative', width: W, height: H, borderRadius: 12, overflow: 'hidden', background: '#0a1320', border: '1px solid #1f2e42', boxShadow: 'inset 0 0 26px rgba(0,0,0,0.5)' }}>
        {/* Grid cells */}
        {Array.from({ length: rows }).map((_, gy) =>
          Array.from({ length: cols }).map((_, gx) => {
            const key = `${gx},${gy}`
            const isWall   = wallSet.has(key)
            const isMirror = mirrorSet.has(key)
            const isFixed  = fixedSet.has(key)
            const isSource = gx === source.x && gy === source.y
            const isTarget = gx === target.x && gy === target.y
            return (
              <div key={key}
                onClick={isMirror && !isFixed ? () => rotate(key) : undefined}
                style={{
                  position: 'absolute', left: gx * CELL, top: gy * CELL, width: CELL, height: CELL,
                  boxSizing: 'border-box', borderRight: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isMirror && !isFixed && !solved ? 'pointer' : 'default',
                  background: isWall ? 'rgba(120,130,150,0.18)' : 'transparent',
                }}>
                {isWall && <div style={{ width: '64%', height: '64%', borderRadius: 5, background: 'rgba(150,160,180,0.32)', border: '1px solid rgba(180,190,210,0.25)' }} />}
                {isSource && (
                  <div style={{ width: '58%', height: '58%', borderRadius: '50%', background: `radial-gradient(circle, ${GOLD} 0%, ${GOLD}66 55%, transparent 75%)`, boxShadow: `0 0 12px ${GOLD}aa` }} />
                )}
                {isTarget && (
                  <div style={{ width: '58%', height: '58%', borderRadius: '50%', border: `2px solid ${solved ? GOLD : '#5a7a9a'}`, background: solved ? `radial-gradient(circle, ${GOLD}cc 0%, transparent 70%)` : 'rgba(90,122,154,0.18)', boxShadow: solved ? `0 0 22px ${GOLD}` : 'none', transition: 'background 0.25s, box-shadow 0.25s', animation: solved ? 'mrun-lens-bounce 460ms ease-out' : undefined }} />
                )}
                {isMirror && (
                  <div style={{
                    position: 'relative', width: CELL, height: CELL,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {!isFixed && <div style={{ position: 'absolute', width: '70%', height: '70%', borderRadius: '50%', background: 'rgba(205,214,226,0.07)', border: '1px solid rgba(205,214,226,0.14)' }} />}
                    <div style={{
                      width: isFixed ? 4 : 3, height: '70%', borderRadius: 2,
                      background: isFixed ? '#566173' : (solved ? GOLD : '#dbe3ee'),
                      transform: `rotate(${orient[key] === '/' ? -45 : 45}deg)`,
                      transition: 'transform 0.18s cubic-bezier(.34,1.4,.5,1)',
                      boxShadow: isFixed ? 'none' : '0 0 7px rgba(219,227,238,0.6)',
                      opacity: isFixed ? 0.85 : 1,
                    }} />
                  </div>
                )}
              </div>
            )
          }),
        )}
        {/* Beam overlay. In flight: staggered per-segment opacity reveal (the
            light advancing). Arrived: a static halo + core polyline (glow at
            rest). Neither animates SVG geometry or uses a filter. */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {revealed && (arrived
            ? (
              <>
                <polyline points={geo.str} fill="none" stroke={beamColor} strokeOpacity={0.2}
                  strokeWidth={solved ? 11 : 8} strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={geo.str} fill="none" stroke={beamColor}
                  strokeOpacity={solved ? 0.95 : 0.82} strokeWidth={solved ? 4 : 2.5}
                  strokeLinejoin="round" strokeLinecap="round" />
              </>
            )
            : (
              <g key={fireSeq}>
                {segments.map((s, i) => (
                  <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                    stroke={beamColor} strokeWidth={3.5} strokeLinecap="round"
                    style={{ opacity: 0, animation: 'mrun-seg 110ms ease-out forwards', animationDelay: `${s.delay}ms` }} />
                ))}
              </g>
            )
          )}
        </svg>
        {/* Lens flare — a single ring that expands + fades when the beam lands. */}
        {solved && (
          <div style={{
            position: 'absolute', left: (target.x + 0.5) * CELL, top: (target.y + 0.5) * CELL,
            width: CELL * 1.3, height: CELL * 1.3, borderRadius: '50%', pointerEvents: 'none',
            border: `2px solid ${GOLD}`, transform: 'translate(-50%, -50%)',
            animation: 'mrun-lens-pop 520ms ease-out forwards',
          }} />
        )}
      </div>

      {/* Status line */}
      <div style={{ minHeight: 18 }}>
        {missed && (
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: RED, textAlign: 'center', margin: 0 }}>
            The beam misses the lens. Turn the mirrors and fire again.
          </p>
        )}
        {failed && (
          <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: RED, textAlign: 'center', margin: 0 }}>
            Out of fires. The mirrors reset — plan it through.
          </p>
        )}
        {solved && (
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: GOLD, textAlign: 'center', margin: 0 }}>
            The beam strikes true.
          </p>
        )}
      </div>

      {/* Fire budget pips */}
      {budget != null && !solved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: '#7d8694' }}>Fires</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: budget }).map((_, i) => {
              const spent = i >= (firesLeft ?? 0)
              return <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: spent ? 'rgba(120,130,150,0.22)' : GOLD, boxShadow: spent ? 'none' : `0 0 5px ${GOLD}99`, transition: 'background 0.2s, box-shadow 0.2s' }} />
            })}
          </div>
        </div>
      )}

      <button onClick={fire} disabled={solved || locked}
        className="font-karla font-700"
        style={{
          padding: '9px 26px', borderRadius: 10, fontSize: '0.82rem', letterSpacing: '0.02em',
          color: (solved || locked) ? '#6b7a52' : '#1a1206',
          background: (solved || locked) ? 'rgba(120,130,150,0.18)' : `linear-gradient(180deg, ${GOLD} 0%, #e09c1c 100%)`,
          border: (solved || locked) ? '1px solid rgba(150,160,180,0.25)' : '1px solid #f6c34a',
          boxShadow: (solved || locked) ? 'none' : `0 2px 0 #b87d10, 0 0 14px ${GOLD}66`,
          cursor: (solved || locked) ? 'default' : 'pointer',
          transition: 'all 0.15s',
        }}>
        {solved ? 'Lens Lit' : failed ? 'Resetting…' : traveling ? 'Firing…' : revealed ? 'Fire Again' : 'Fire the Lantern'}
      </button>
    </div>
  )
}
