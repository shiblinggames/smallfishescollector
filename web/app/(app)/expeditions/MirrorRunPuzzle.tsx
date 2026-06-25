'use client'

// Mirror Run — a Zelda-style light-beam dungeon puzzle. A signal-lantern fires
// a beam across the grid; the player taps mirror tiles to rotate them ('/' <->
// '\\') to bend the beam through EVERY lens at once. The beam is hidden while
// planning (commit a layout, tap Fire to test — no steer-by-sight), you get a
// limited number of fires (fireBudget) before the mirrors reset, and a miss
// shows only WHICH lenses lit, not the path. Solve = all lenses crossed in one
// fired path → onSolved (solvePuzzleNode grants Nav XP). Pure client logic.
//
// NO per-fire animation. The beam is drawn INSTANTLY on fire. Every "beam
// travels along the path" variant (stroke-dashoffset, then opacity sweep)
// intermittently froze the iOS PWA webview; the instant version is the only one
// confirmed stable. Keep it instant. Transitions + rare solve-only keyframes
// (lens flare/bounce) are fine — per-fire keyframed elements are not.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RaidPuzzle, MirrorOrient, BeamDir } from '@/lib/raidMap'
import { vibrate } from '@/lib/haptics'

const REFLECT: Record<MirrorOrient, Record<BeamDir, BeamDir>> = {
  '/':  { right: 'up',   up: 'right', left: 'down', down: 'left' },
  '\\': { right: 'down', down: 'right', left: 'up',  up: 'left' },
}
const STEP: Record<BeamDir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
}
const OPP: Record<BeamDir, BeamDir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
function edgePoint(x: number, y: number, d: BeamDir): [number, number] {
  if (d === 'up')    return [x + 0.5, y]
  if (d === 'down')  return [x + 0.5, y + 1]
  if (d === 'left')  return [x, y + 0.5]
  return [x + 1, y + 0.5] // right
}

const GOLD = '#fbbf24'
const RED  = '#e2674a'

export default function MirrorRunPuzzle({ puzzle, onSolved }: { puzzle: RaidPuzzle; onSolved: () => void }) {
  const lvl = puzzle.mirror
  const initialOrient = useMemo(() => {
    const o: Record<string, MirrorOrient> = {}
    lvl?.mirrors.forEach(m => { o[`${m.x},${m.y}`] = m.init })
    return o
  }, [lvl])
  const [orient, setOrient] = useState<Record<string, MirrorOrient>>(() => ({ ...initialOrient }))
  const solvedRef = useRef(false)
  const onSolvedRef = useRef(onSolved)
  useEffect(() => { onSolvedRef.current = onSolved })

  const [revealed, setRevealed]   = useState(false)  // a fired beam is showing
  const [firesUsed, setFiresUsed] = useState(0)      // toward fireBudget
  const [failed, setFailed]       = useState(false)  // out of fires → resetting
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (failTimer.current) clearTimeout(failTimer.current) }, [])

  const wallSet   = useMemo(() => new Set((lvl?.walls ?? []).map(w => `${w.x},${w.y}`)), [lvl])
  const mirrorSet = useMemo(() => new Set((lvl?.mirrors ?? []).map(m => `${m.x},${m.y}`)), [lvl])
  const fixedSet  = useMemo(() => new Set((lvl?.mirrors ?? []).filter(m => m.fixed).map(m => `${m.x},${m.y}`)), [lvl])

  // Trace the beam: passes STRAIGHT through lenses (must cross all), reflects off
  // mirrors, dies at a wall/edge, and a cycle guard stops the instant a
  // (cell,direction) state repeats (a looping layout would otherwise run long).
  const trace = useMemo(() => {
    const segs: { x: number; y: number; from: BeamDir; to: BeamDir }[] = []
    if (!lvl) return { segs, hit: false, crossed: new Set<string>() }
    const { cols, rows, source, targets } = lvl
    const need = new Set(targets.map(t => `${t.x},${t.y}`))
    const crossed = new Set<string>()
    const seen = new Set<string>()
    let x = source.x, y = source.y
    let dir: BeamDir = source.dir
    const cap = cols * rows * 4
    for (let i = 0; i < cap; i++) {
      const key = `${x},${y}`
      const entry = dir
      if (!(i === 0 && x === source.x && y === source.y) && mirrorSet.has(key)) {
        dir = REFLECT[orient[key] ?? '/'][dir]
      }
      if (need.has(key)) crossed.add(key)
      segs.push({ x, y, from: entry, to: dir })
      const state = `${x},${y},${dir}`
      if (seen.has(state)) break
      seen.add(state)
      const { dx, dy } = STEP[dir]
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break
      if (wallSet.has(`${nx},${ny}`)) break
      x = nx; y = ny
    }
    return { segs, hit: crossed.size === need.size, crossed }
  }, [lvl, orient, mirrorSet, wallSet])

  const geo = useMemo(() => {
    if (!lvl) return { CELL: 0, W: 0, H: 0, str: '' }
    const CELL = Math.min(44, Math.floor(320 / Math.max(lvl.cols, lvl.rows)))
    const pts: [number, number][] = []
    for (const s of trace.segs) {
      const inPt  = edgePoint(s.x, s.y, OPP[s.from])
      const ctr: [number, number] = [s.x + 0.5, s.y + 0.5]
      const outPt = edgePoint(s.x, s.y, s.to)
      if (pts.length === 0) pts.push(inPt)
      pts.push(ctr, outPt)
    }
    const str = pts.map(([px, py]) => `${px * CELL},${py * CELL}`).join(' ')
    return { CELL, W: lvl.cols * CELL, H: lvl.rows * CELL, str }
  }, [lvl, trace])

  // Solve resolves once a FIRED layout crosses every lens.
  useEffect(() => {
    if (revealed && trace.hit && !solvedRef.current) {
      solvedRef.current = true
      vibrate([0, 30, 45, 70])
      const t = setTimeout(() => onSolvedRef.current(), 700)
      return () => clearTimeout(t)
    }
  }, [revealed, trace.hit])

  if (!lvl) return null
  const { cols, rows, source, targets } = lvl
  const { CELL, W, H } = geo
  const budget = lvl.fireBudget ?? null
  const solved = revealed && trace.hit
  const missed = revealed && !trace.hit && !failed
  const locked = failed
  const firesLeft = budget != null ? Math.max(0, budget - firesUsed) : null
  const targetSet = new Set(targets.map(t => `${t.x},${t.y}`))
  const litLens = (key: string) => revealed && trace.crossed.has(key)

  function rotate(key: string) {
    if (solvedRef.current || locked || fixedSet.has(key)) return
    vibrate(12)
    setRevealed(false)
    setOrient(prev => ({ ...prev, [key]: prev[key] === '/' ? '\\' : '/' }))
  }

  function fire() {
    if (solvedRef.current || locked) return
    vibrate(18)
    const used = firesUsed + 1
    setFiresUsed(used)
    setRevealed(true)
    // Out of fires without a hit → reset the mirrors so guessing loses to
    // planning. (Solve, when trace.hit, is handled by the effect above.)
    if (budget != null && !trace.hit && used >= budget) {
      setFailed(true)
      failTimer.current = setTimeout(() => {
        setOrient({ ...initialOrient })
        setFiresUsed(0)
        setRevealed(false)
        setFailed(false)
      }, 1150)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <style>{`
        @keyframes mrun-lens-pop { 0% { transform: translate(-50%,-50%) scale(0.45); opacity: 0.8 } 100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0 } }
        @keyframes mrun-lens-bounce { 0% { transform: scale(0.7) } 55% { transform: scale(1.2) } 100% { transform: scale(1) } }
      `}</style>
      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a948a', textAlign: 'center', lineHeight: 1.5 }}>
        Plan one beam path that passes through <b style={{ color: '#c9c2b6' }}>all {targets.length} lenses</b>, then fire the lantern. The beam stays dark until you fire.
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
            const isTarget = targetSet.has(key)
            const lit      = isTarget && litLens(key)
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
                  <div style={{ width: '58%', height: '58%', borderRadius: '50%', border: `2px solid ${lit ? GOLD : '#5a7a9a'}`, background: lit ? `radial-gradient(circle, ${GOLD}cc 0%, transparent 70%)` : 'rgba(90,122,154,0.18)', boxShadow: lit ? `0 0 22px ${GOLD}` : 'none', transition: 'background 0.2s, box-shadow 0.2s, border-color 0.2s', animation: solved ? 'mrun-lens-bounce 460ms ease-out' : undefined }} />
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
                      // CSS rotate is clockwise: +45deg draws "/", -45deg draws "\".
                      transform: `rotate(${orient[key] === '/' ? 45 : -45}deg)`,
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
        {/* Beam — drawn instantly, and ONLY on a solve (gold). On a miss the
            path is hidden; you get only which lenses lit. */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {solved && geo.str && (
            <>
              <polyline points={geo.str} fill="none" stroke={GOLD} strokeOpacity={0.2}
                strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={geo.str} fill="none" stroke={GOLD}
                strokeOpacity={0.95} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
        </svg>
        {/* Lens flare — a ring that expands + fades from each lens on solve. */}
        {solved && targets.map((t, i) => (
          <div key={i} style={{
            position: 'absolute', left: (t.x + 0.5) * CELL, top: (t.y + 0.5) * CELL,
            width: CELL * 1.3, height: CELL * 1.3, borderRadius: '50%', pointerEvents: 'none',
            border: `2px solid ${GOLD}`, transform: 'translate(-50%, -50%)',
            animation: 'mrun-lens-pop 520ms ease-out forwards',
          }} />
        ))}
      </div>

      {/* Status line */}
      <div style={{ minHeight: 18 }}>
        {missed && (
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: RED, textAlign: 'center', margin: 0 }}>
            Lit {trace.crossed.size} of {targets.length} lenses. Turn the mirrors and fire again.
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
        {solved ? 'Lens Lit' : failed ? 'Resetting…' : revealed ? 'Fire Again' : 'Fire the Lantern'}
      </button>
    </div>
  )
}
