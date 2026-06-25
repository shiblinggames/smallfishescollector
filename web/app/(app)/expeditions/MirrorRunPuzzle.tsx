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
  const [fireSeq, setFireSeq]   = useState(0)      // bumps each fire to replay the travel
  const [drawn, setDrawn]       = useState(false)  // beam dash-draw has kicked off
  const [arrived, setArrived]   = useState(false)  // beam reached its end (lens or dead end)

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

  // Beam geometry — the polyline points (in cell units), its SVG string, and its
  // total pixel length (drives travel duration + the dash-draw). Adaptive CELL
  // keeps bigger grids on a phone (~300px wide cap).
  const geo = useMemo(() => {
    if (!lvl) return { CELL: 0, W: 0, H: 0, pts: [] as [number, number][], str: '', lenPx: 0 }
    const CELL = Math.min(46, Math.floor(300 / Math.max(lvl.cols, lvl.rows)))
    const pts: [number, number][] = []
    for (const s of trace.segs) {
      const inPt  = edgePoint(s.x, s.y, OPP[s.from])
      const ctr: [number, number] = [s.x + 0.5, s.y + 0.5]
      const outPt = edgePoint(s.x, s.y, s.to)
      if (pts.length === 0) pts.push(inPt)
      pts.push(ctr, outPt)
    }
    const str = pts.map(([px, py]) => `${px * CELL},${py * CELL}`).join(' ')
    let lenPx = 0
    for (let i = 1; i < pts.length; i++) lenPx += Math.hypot((pts[i][0] - pts[i - 1][0]) * CELL, (pts[i][1] - pts[i - 1][1]) * CELL)
    return { CELL, W: lvl.cols * CELL, H: lvl.rows * CELL, pts, str, lenPx }
  }, [lvl, trace])

  // Beam crawl speed ~0.85px/ms, clamped so short paths still read and long ones
  // don't drag. This is the whole "it travels" feel.
  const travelMs = Math.min(820, Math.max(300, Math.round(geo.lenPx / 0.85)))

  // On each fire, dash-draw the beam from the lantern to its end, then mark it
  // arrived — that lights the lens (or fizzles on a miss) and fires the haptic.
  useEffect(() => {
    if (!revealed) { setDrawn(false); setArrived(false); return }
    setDrawn(false); setArrived(false)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)))
    const t = setTimeout(() => {
      setArrived(true)
      vibrate(trace.hit ? [0, 30, 45, 70] : 16)
    }, travelMs)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [fireSeq, revealed, travelMs, trace.hit])

  // Solve resolves only once a FIRED beam has actually reached the lens.
  useEffect(() => {
    if (arrived && trace.hit && !solvedRef.current) {
      solvedRef.current = true
      const t = setTimeout(onSolved, 620) // savor the lit lens before the reveal
      return () => clearTimeout(t)
    }
  }, [arrived, trace.hit, onSolved])

  if (!lvl) return null
  const { cols, rows, source, target } = lvl
  const { CELL, W, H } = geo
  const solved    = arrived && trace.hit
  const missed    = arrived && !trace.hit
  const traveling = revealed && !arrived
  const btnOff    = solved || traveling
  // Hot white-gold while in flight; settles gold on a hit, red on a miss.
  const beamColor = !arrived ? '#ffe9b0' : trace.hit ? GOLD : '#e2674a'
  // Arrival burst anchor: lens center on a hit, the dead-end edge on a miss.
  const endPt: [number, number] | null =
    geo.pts.length === 0 ? null
    : trace.hit ? [(target.x + 0.5) * CELL, (target.y + 0.5) * CELL]
    : [geo.pts[geo.pts.length - 1][0] * CELL, geo.pts[geo.pts.length - 1][1] * CELL]

  // Turning any mirror hides the beam again — back to planning, no steer-by-sight.
  function rotate(key: string) {
    if (solvedRef.current || traveling || fixedSet.has(key)) return
    vibrate(12)
    setRevealed(false)
    setOrient(prev => ({ ...prev, [key]: prev[key] === '/' ? '\\' : '/' }))
  }

  function fire() {
    if (solvedRef.current || traveling) return
    vibrate(18)
    setDrawn(false); setArrived(false)
    setFireSeq(s => s + 1)
    setRevealed(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <style>{`@keyframes mrun-burst { 0% { transform: translate(-50%,-50%) scale(0.25); opacity: 0.9 } 70% { opacity: 0.5 } 100% { transform: translate(-50%,-50%) scale(2.3); opacity: 0 } }`}</style>
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
        {/* Beam overlay — fired beam shoots ALONG the path (dash-draw), then
            settles its colour on arrival. Transition is off while resetting so
            a re-fire snaps to hidden instead of un-drawing backwards. */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {revealed && geo.str && (
            <polyline
              points={geo.str} fill="none"
              stroke={beamColor}
              strokeOpacity={arrived ? (trace.hit ? 0.95 : 0.8) : 0.95}
              strokeWidth={arrived ? (trace.hit ? 5 : 3) : 3.5}
              strokeLinejoin="round" strokeLinecap="round"
              style={{
                strokeDasharray: geo.lenPx || 1,
                strokeDashoffset: drawn ? 0 : (geo.lenPx || 1),
                transition: drawn ? `stroke-dashoffset ${travelMs}ms linear` : 'none',
                filter: `drop-shadow(0 0 ${arrived && trace.hit ? 7 : 4}px ${beamColor})`,
              }}
            />
          )}
        </svg>
        {/* Arrival burst — gold flare on the lens, red fizzle on a dead end. */}
        {arrived && endPt && (
          <div key={fireSeq} style={{
            position: 'absolute', left: endPt[0], top: endPt[1],
            width: CELL * 1.1, height: CELL * 1.1, borderRadius: '50%', pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${trace.hit ? GOLD : '#e2674a'} 0%, transparent 68%)`,
            animation: 'mrun-burst 560ms ease-out forwards',
          }} />
        )}
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
      <button onClick={fire} disabled={btnOff}
        className="font-karla font-700"
        style={{
          padding: '9px 26px', borderRadius: 10, fontSize: '0.82rem', letterSpacing: '0.02em',
          color: btnOff ? '#6b7a52' : '#1a1206',
          background: btnOff ? 'rgba(120,130,150,0.18)' : `linear-gradient(180deg, ${GOLD} 0%, #e09c1c 100%)`,
          border: btnOff ? '1px solid rgba(150,160,180,0.25)' : '1px solid #f6c34a',
          boxShadow: btnOff ? 'none' : `0 2px 0 #b87d10, 0 0 14px ${GOLD}66`,
          cursor: btnOff ? 'default' : 'pointer',
          transition: 'all 0.15s',
        }}>
        {solved ? 'Lens Lit' : traveling ? 'Firing…' : revealed ? 'Fire Again' : 'Fire the Lantern'}
      </button>
    </div>
  )
}
