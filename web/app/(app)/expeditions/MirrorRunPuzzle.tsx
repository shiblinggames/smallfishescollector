'use client'

// Mirror Run — a Zelda-style light-beam dungeon puzzle. A signal-lantern fires
// a beam across the grid; the player taps mirror tiles to rotate them between
// '/' and '\\', bending the beam around walls onto the target lens. When the
// traced beam reaches the lens the puzzle is solved (onSolved → solvePuzzleNode
// grants the Nav XP). Pure client logic; no server validation (PvE, XP-only).

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

export default function MirrorRunPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const lvl = puzzle.mirror
  const [orient, setOrient] = useState<Record<string, MirrorOrient>>(() => {
    const o: Record<string, MirrorOrient> = {}
    lvl?.mirrors.forEach(m => { o[`${m.x},${m.y}`] = m.init })
    return o
  })
  const solvedRef = useRef(false)
  // The beam is hidden while planning. The player commits a layout and taps
  // Fire to test it; only then is the beam traced + shown. This is the whole
  // difficulty: you can't steer the beam by sight, you have to plan the path.
  const [revealed, setRevealed] = useState(false)

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

  // Solve only resolves once the player has FIRED a correct layout. Setting the
  // mirrors right while planning isn't enough; they have to commit and fire.
  useEffect(() => {
    if (revealed && trace.hit && !solvedRef.current) {
      solvedRef.current = true
      vibrate([0, 30, 45, 70])
      const t = setTimeout(onSolved, 750) // let the lit beam land before the reveal
      return () => clearTimeout(t)
    }
  }, [revealed, trace.hit, onSolved])

  if (!lvl) return null
  const { cols, rows, source, target } = lvl
  // Adaptive cell size so bigger grids still fit a phone (~300px wide cap).
  const CELL = Math.min(46, Math.floor(300 / Math.max(cols, rows)))
  const W = cols * CELL, H = rows * CELL
  const solved = revealed && trace.hit
  const missed = revealed && !trace.hit

  // Turning any mirror hides the beam again — back to planning, no steer-by-sight.
  function rotate(key: string) {
    if (solvedRef.current || fixedSet.has(key)) return
    vibrate(12)
    setRevealed(false)
    setOrient(prev => ({ ...prev, [key]: prev[key] === '/' ? '\\' : '/' }))
  }

  function fire() {
    if (solvedRef.current) return
    vibrate(18)
    setRevealed(true)
  }

  // Beam polyline points (in cell units) — entry edge → center → exit edge per seg.
  const beamPts: [number, number][] = []
  for (const s of trace.segs) {
    const inPt  = edgePoint(s.x, s.y, OPP[s.from])
    const ctr: [number, number] = [s.x + 0.5, s.y + 0.5]
    const outPt = edgePoint(s.x, s.y, s.to)
    if (beamPts.length === 0) beamPts.push(inPt)
    beamPts.push(ctr, outPt)
  }
  const beamStr = beamPts.map(([px, py]) => `${px * CELL},${py * CELL}`).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
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
                  <div style={{ width: '58%', height: '58%', borderRadius: '50%', border: `2px solid ${solved ? GOLD : '#5a7a9a'}`, background: solved ? `radial-gradient(circle, ${GOLD}cc 0%, transparent 70%)` : 'rgba(90,122,154,0.18)', boxShadow: solved ? `0 0 18px ${GOLD}` : 'none', transition: 'all 0.3s' }} />
                )}
                {isMirror && (
                  <div style={{
                    position: 'relative', width: CELL, height: CELL,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {/* Bright tappable mirrors get a faint disc so they read as
                        interactive; fixed maze mirrors stay flat + dull. */}
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
        {/* Beam overlay — only drawn after the player fires the lantern. */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {revealed && beamStr && (
            <polyline points={beamStr} fill="none" stroke={solved ? GOLD : '#e2674a'} strokeOpacity={solved ? 0.9 : 0.78} strokeWidth={solved ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${solved ? 7 : 4}px ${solved ? GOLD : '#e2674a'})` }} />
          )}
        </svg>
      </div>

      {/* Fire / status. The beam is dark until fired; a miss shows the path it
          DID take so the player can re-plan, then any mirror turn hides it. */}
      <div style={{ minHeight: 18 }}>
        {missed && (
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#e2674a', textAlign: 'center', margin: 0 }}>
            The beam misses the lens. Turn the mirrors and fire again.
          </p>
        )}
        {solved && (
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: GOLD, textAlign: 'center', margin: 0 }}>
            The beam strikes true.
          </p>
        )}
      </div>
      <button onClick={fire} disabled={solved}
        className="font-karla font-700"
        style={{
          padding: '9px 26px', borderRadius: 10, fontSize: '0.82rem', letterSpacing: '0.02em',
          color: solved ? '#6b7a52' : '#1a1206',
          background: solved ? 'rgba(120,130,150,0.18)' : `linear-gradient(180deg, ${GOLD} 0%, #e09c1c 100%)`,
          border: solved ? '1px solid rgba(150,160,180,0.25)' : '1px solid #f6c34a',
          boxShadow: solved ? 'none' : `0 2px 0 #b87d10, 0 0 14px ${GOLD}66`,
          cursor: solved ? 'default' : 'pointer',
          transition: 'all 0.15s',
        }}>
        {solved ? 'Lens Lit' : revealed ? 'Fire Again' : 'Fire the Lantern'}
      </button>
    </div>
  )
}
