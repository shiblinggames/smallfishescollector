'use client'

// Mirror Run — a Zelda-style light-beam dungeon puzzle. Rotate '/' <-> '\\'
// mirror tiles to bend the lantern beam through EVERY lens in one path. Beam is
// hidden while planning (commit, tap Fire to test), limited fires (fireBudget)
// before the mirrors reset, a miss shows only which lenses lit. Solve = all
// lenses crossed → onSolved (solvePuzzleNode grants Nav XP).
//
// THE TRAVELLING BEAM IS DRAWN ON A <canvas> via ONE requestAnimationFrame loop
// (imperative). This is deliberate: every React/CSS/SVG-animation version of the
// "light travels" effect intermittently froze the iOS PWA webview. Canvas keeps
// the per-frame work off React and off the DOM entirely — React state changes
// only at the START and END of a fire, never per frame. The rAF handle is
// rigorously cancelled (new fire / rotate / unmount) so loops can't stack.

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
const HOT  = '#ffe9b0'

// ── Canvas beam painters (pure, no React) ───────────────────────────────────
type Pt = [number, number]
// Stroke only the portion of the path in distance window [from, to]. With
// from=0 this is the full trail; with from=to-tail it's a short "comet" streak
// so the WHOLE route is never drawn at once (you can't read it off one fire).
function strokeRange(ctx: CanvasRenderingContext2D, pts: Pt[], from: number, to: number) {
  if (to <= from || pts.length < 2) return
  const out: Pt[] = []
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    const segStart = acc, segEnd = acc + seg
    if (seg > 0 && segEnd >= from && segStart <= to) {
      const ra = Math.max(0, (from - segStart) / seg)
      const rb = Math.min(1, (to - segStart) / seg)
      out.push([ax + (bx - ax) * ra, ay + (by - ay) * ra])
      out.push([ax + (bx - ax) * rb, ay + (by - ay) * rb])
    }
    acc = segEnd
  }
  if (out.length < 2) return
  ctx.beginPath()
  ctx.moveTo(out[0][0], out[0][1])
  for (let i = 1; i < out.length; i++) ctx.lineTo(out[i][0], out[i][1])
  ctx.stroke()
}
function pointAt(pts: Pt[], dist: number): Pt {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (acc + seg >= dist) { const r = seg > 0 ? (dist - acc) / seg : 0; return [ax + (bx - ax) * r, ay + (by - ay) * r] }
    acc += seg
  }
  return pts[pts.length - 1]
}
// tail = length of the visible streak behind the head (undefined = full trail).
function paintBeam(canvas: HTMLCanvasElement, W: number, H: number, pts: Pt[], dist: number, color: string, head: boolean, tail?: number) {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.clearRect(0, 0, W, H)
  if (pts.length < 2 || dist <= 0) return
  const from = tail != null ? Math.max(0, dist - tail) : 0
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color
  ctx.globalAlpha = 0.18; ctx.lineWidth = 9;   strokeRange(ctx, pts, from, dist)
  ctx.globalAlpha = 0.95; ctx.lineWidth = 3.2; strokeRange(ctx, pts, from, dist)
  ctx.globalAlpha = 1
  if (head) {
    const p = pointAt(pts, dist)
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 11)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI * 2); ctx.fill()
  }
}

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

  const [revealed, setRevealed]   = useState(false)  // a finished fire is showing its result
  const [firing, setFiring]       = useState(false)  // beam is travelling (button locked)
  const [firesUsed, setFiresUsed] = useState(0)
  const [failed, setFailed]       = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelRaf = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  useEffect(() => () => { cancelRaf(); if (failTimer.current) clearTimeout(failTimer.current) }, [])

  const wallSet   = useMemo(() => new Set((lvl?.walls ?? []).map(w => `${w.x},${w.y}`)), [lvl])
  const mirrorSet = useMemo(() => new Set((lvl?.mirrors ?? []).map(m => `${m.x},${m.y}`)), [lvl])
  const fixedSet  = useMemo(() => new Set((lvl?.mirrors ?? []).filter(m => m.fixed).map(m => `${m.x},${m.y}`)), [lvl])

  // Trace: straight through lenses (must cross all), reflect off mirrors, die at
  // wall/edge, cycle-guard stops the instant a (cell,direction) repeats.
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

  // Beam path in PIXELS (for the canvas) + its length.
  const geo = useMemo(() => {
    if (!lvl) return { CELL: 0, W: 0, H: 0, ptsPx: [] as Pt[], lenPx: 0 }
    const CELL = Math.min(44, Math.floor(320 / Math.max(lvl.cols, lvl.rows)))
    const cells: Pt[] = []
    for (const s of trace.segs) {
      const inPt  = edgePoint(s.x, s.y, OPP[s.from])
      const ctr: Pt = [s.x + 0.5, s.y + 0.5]
      const outPt = edgePoint(s.x, s.y, s.to)
      if (cells.length === 0) cells.push(inPt)
      cells.push(ctr, outPt)
    }
    const ptsPx = cells.map(([x, y]) => [x * CELL, y * CELL] as Pt)
    let lenPx = 0
    for (let i = 1; i < ptsPx.length; i++) lenPx += Math.hypot(ptsPx[i][0] - ptsPx[i - 1][0], ptsPx[i][1] - ptsPx[i - 1][1])
    return { CELL, W: lvl.cols * CELL, H: lvl.rows * CELL, ptsPx, lenPx }
  }, [lvl, trace])
  const { CELL, W, H } = geo

  // Size the canvas to its box at device resolution (crisp), once per W/H.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !W || !H) return
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [W, H])

  // Solve resolves once a FIRED, finished layout crosses every lens.
  useEffect(() => {
    if (revealed && trace.hit && !solvedRef.current) {
      solvedRef.current = true
      vibrate([0, 30, 45, 70])
      const t = setTimeout(() => onSolvedRef.current(), 700)
      return () => clearTimeout(t)
    }
  }, [revealed, trace.hit])

  if (!lvl) return null
  const { source, targets } = lvl
  const budget = lvl.fireBudget ?? null
  const solved = revealed && trace.hit
  const missed = revealed && !trace.hit && !failed
  const locked = firing || failed
  const firesLeft = budget != null ? Math.max(0, budget - firesUsed) : null
  const targetSet = new Set(targets.map(t => `${t.x},${t.y}`))
  const litLens = (key: string) => revealed && trace.crossed.has(key)

  function clearCanvas() { const c = canvasRef.current; if (c) paintBeam(c, W, H, [], 0, HOT, false) }

  function rotate(key: string) {
    if (solvedRef.current || locked || fixedSet.has(key)) return
    vibrate(12)
    cancelRaf(); clearCanvas()
    setRevealed(false)
    setOrient(prev => ({ ...prev, [key]: prev[key] === '/' ? '\\' : '/' }))
  }

  function fire() {
    if (solvedRef.current || locked) return
    vibrate(18)
    const pts = geo.ptsPx
    const total = geo.lenPx
    const hit = trace.hit              // orient is locked through travel, so stable
    const used = firesUsed + 1
    setFiresUsed(used)
    setRevealed(false)                 // hide prior result while the beam travels
    setFiring(true)
    // Slow travel: ~0.42 px/ms, clamped. One rAF loop, imperative canvas paint.
    const dur = Math.min(1900, Math.max(650, total / 0.42))
    const start = performance.now()
    cancelRaf()
    const step = (now: number) => {
      const c = canvasRef.current
      if (!c) { rafRef.current = null; finish(hit, used); return }
      const t = total > 0 ? Math.min(1, (now - start) / dur) : 1
      paintBeam(c, W, H, pts, t * total, HOT, true)   // full persisting trail
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else { rafRef.current = null; finish(hit, used, pts) }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function finish(hit: boolean, used: number, pts?: Pt[]) {
    setFiring(false)
    setRevealed(true)                  // light the lenses it crossed / show result
    const c = canvasRef.current
    if (hit) {
      if (c && pts) paintBeam(c, W, H, pts, geo.lenPx, GOLD, false)  // full gold beam stays
      // solve handled by the effect on [revealed, trace.hit]
    } else {
      clearCanvas()                    // hide the path on a miss
      if (budget != null && used >= budget) {
        setFailed(true)
        failTimer.current = setTimeout(() => {
          cancelRaf(); clearCanvas()
          setOrient({ ...initialOrient }); setFiresUsed(0); setRevealed(false); setFailed(false)
        }, 1200)
      }
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
        {Array.from({ length: lvl.rows }).map((_, gy) =>
          Array.from({ length: lvl.cols }).map((_, gx) => {
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
                  <div style={{ position: 'relative', width: CELL, height: CELL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        {/* Travelling beam — painted imperatively on canvas (see header note). */}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
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
        {solved ? 'Lens Lit' : failed ? 'Resetting…' : firing ? 'Firing…' : revealed ? 'Fire Again' : 'Fire the Lantern'}
      </button>
    </div>
  )
}
