'use client'

// Mirror Run — a Zelda-style light-beam dungeon puzzle. Rotate '/' <-> '\\'
// mirror tiles to bend the lantern beam through EVERY lens in one fired shot.
// PRISM tiles SPLIT the beam into two perpendicular branches, so the beam is a
// branching TREE you can't trace at a glance — and the branches share the trunk
// mirrors, so fixing one arm can break another. Beam hidden while planning,
// limited fires (fireBudget) before the mirrors reset, a miss shows only which
// lenses lit. Solve = all lenses crossed by any branch → onSolved (Nav XP).
//
// The travelling beam tree is drawn on a <canvas> via ONE requestAnimationFrame
// loop (imperative paint). Deliberate: every React/CSS/SVG-animation version of
// the travel effect intermittently froze the iOS PWA webview. Canvas keeps the
// per-frame work off React + off the DOM; state changes only at fire start/end.
// rAF handle is cancelled on new-fire / rotate / unmount so loops can't stack.

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
// A prism splits an incoming beam into the two PERPENDICULAR directions.
const PERP: Record<BeamDir, [BeamDir, BeamDir]> = {
  right: ['up', 'down'], left: ['up', 'down'], up: ['left', 'right'], down: ['left', 'right'],
}

const GOLD = '#fbbf24'
const RED  = '#e2674a'
const HOT  = '#ffe9b0'

type Pt = [number, number]
type Stroke = { pts: Pt[]; startPx: number }

function polylineLen(pts: Pt[]) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l }
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
function strokeUpTo(ctx: CanvasRenderingContext2D, pts: Pt[], to: number) {
  if (to <= 0 || pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (acc + seg <= to) { ctx.lineTo(bx, by); acc += seg }
    else { const r = seg > 0 ? (to - acc) / seg : 0; ctx.lineTo(ax + (bx - ax) * r, ay + (by - ay) * r); break }
  }
  ctx.stroke()
}
// Paint the beam TREE up to a global front distance: each branch draws from its
// own start (the prism it split from) once the front passes it; a glowing head
// rides every branch that's still advancing.
function paintTree(canvas: HTMLCanvasElement, W: number, H: number, strokes: Stroke[], front: number, color: string, head: boolean) {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.clearRect(0, 0, W, H)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color
  for (const s of strokes) {
    const vis = front - s.startPx
    if (vis <= 0) continue
    ctx.globalAlpha = 0.18; ctx.lineWidth = 9;   strokeUpTo(ctx, s.pts, vis)
    ctx.globalAlpha = 0.95; ctx.lineWidth = 3.2; strokeUpTo(ctx, s.pts, vis)
  }
  ctx.globalAlpha = 1
  if (head) {
    for (const s of strokes) {
      const vis = front - s.startPx
      if (vis <= 0 || vis >= polylineLen(s.pts)) continue
      const p = pointAt(s.pts, vis)
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 11)
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI * 2); ctx.fill()
    }
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

  const [revealed, setRevealed]   = useState(false)
  const [firing, setFiring]       = useState(false)
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
  const prismSet  = useMemo(() => new Set((lvl?.prisms ?? []).map(p => `${p.x},${p.y}`)), [lvl])

  // Multi-beam trace: reflect at mirrors, SPLIT at prisms into two perpendicular
  // beams, pass through lenses (must cross all). Returns the beam-tree strokes
  // (cell-unit polylines + start distance) for drawing. Global (cell,dir) seen
  // set + guard bound the whole tree (cycles can't run away).
  const trace = useMemo(() => {
    if (!lvl) return { strokes: [] as { pts: Pt[]; startDist: number }[], hit: false, crossed: new Set<string>() }
    const { cols, rows, source, targets } = lvl
    const need = new Set(targets.map(t => `${t.x},${t.y}`))
    const crossed = new Set<string>()
    const seen = new Set<string>()
    const strokes: { pts: Pt[]; startDist: number }[] = []
    const queue: { x: number; y: number; dir: BeamDir; first: boolean; startDist: number }[] =
      [{ x: source.x, y: source.y, dir: source.dir, first: true, startDist: 0 }]
    let guard = cols * rows * 16
    while (queue.length && guard-- > 0) {
      const b = queue.shift()!
      let x = b.x, y = b.y, dir = b.dir, first = b.first
      const pts: Pt[] = [[x + 0.5, y + 0.5]]
      let len = 0
      while (guard-- > 0) {
        const key = `${x},${y}`
        if (!first && mirrorSet.has(key)) dir = REFLECT[orient[key] ?? '/'][dir]
        if (!first && prismSet.has(key)) {
          for (const nd of PERP[dir]) queue.push({ x, y, dir: nd, first: true, startDist: b.startDist + len })
          break
        }
        if (need.has(key)) crossed.add(key)
        const state = `${x},${y},${dir}`
        if (seen.has(state)) break
        seen.add(state)
        first = false
        const { dx, dy } = STEP[dir]
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break
        if (wallSet.has(`${nx},${ny}`)) break
        x = nx; y = ny; len += 1
        pts.push([x + 0.5, y + 0.5])
      }
      if (pts.length >= 2) strokes.push({ pts, startDist: b.startDist })
    }
    return { strokes, hit: crossed.size === need.size, crossed }
  }, [lvl, orient, mirrorSet, wallSet, prismSet])

  const geo = useMemo(() => {
    if (!lvl) return { CELL: 0, W: 0, H: 0, strokes: [] as Stroke[], totalPx: 0 }
    const CELL = Math.min(44, Math.floor(320 / Math.max(lvl.cols, lvl.rows)))
    const strokes: Stroke[] = trace.strokes.map(s => ({ pts: s.pts.map(([x, y]) => [x * CELL, y * CELL] as Pt), startPx: s.startDist * CELL }))
    let totalPx = 0
    for (const s of strokes) totalPx = Math.max(totalPx, s.startPx + polylineLen(s.pts))
    return { CELL, W: lvl.cols * CELL, H: lvl.rows * CELL, strokes, totalPx }
  }, [lvl, trace])
  const { CELL, W, H } = geo

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !W || !H) return
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [W, H])

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

  function clearCanvas() { const c = canvasRef.current; if (c) paintTree(c, W, H, [], 0, HOT, false) }

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
    const strokes = geo.strokes
    const total = geo.totalPx
    const hit = trace.hit
    const used = firesUsed + 1
    setFiresUsed(used)
    setRevealed(false)
    setFiring(true)
    const dur = Math.min(2100, Math.max(700, total / 0.42))
    const start = performance.now()
    cancelRaf()
    const step = (now: number) => {
      const c = canvasRef.current
      if (!c) { rafRef.current = null; finish(hit, used); return }
      const t = total > 0 ? Math.min(1, (now - start) / dur) : 1
      paintTree(c, W, H, strokes, t * total, HOT, true)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else { rafRef.current = null; finish(hit, used, strokes) }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function finish(hit: boolean, used: number, strokes?: Stroke[]) {
    setFiring(false)
    setRevealed(true)
    const c = canvasRef.current
    if (hit) {
      if (c && strokes) paintTree(c, W, H, strokes, geo.totalPx, GOLD, false)
    } else {
      clearCanvas()
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
        Bend the beam through <b style={{ color: '#c9c2b6' }}>all {targets.length} lenses</b> — the prism splits it in two, so both branches must land. Plan it, then fire.
      </p>
      <div style={{ position: 'relative', width: W, height: H, borderRadius: 12, overflow: 'hidden', background: '#0a1320', border: '1px solid #1f2e42', boxShadow: 'inset 0 0 26px rgba(0,0,0,0.5)' }}>
        {Array.from({ length: lvl.rows }).map((_, gy) =>
          Array.from({ length: lvl.cols }).map((_, gx) => {
            const key = `${gx},${gy}`
            const isWall   = wallSet.has(key)
            const isMirror = mirrorSet.has(key)
            const isFixed  = fixedSet.has(key)
            const isPrism  = prismSet.has(key)
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
                {isPrism && (
                  <div style={{ width: '52%', height: '52%', transform: 'rotate(45deg)', borderRadius: 4, background: 'linear-gradient(135deg, rgba(125,211,252,0.85), rgba(56,189,248,0.35))', border: '1.5px solid rgba(186,230,253,0.9)', boxShadow: '0 0 10px rgba(125,211,252,0.6)' }} />
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
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
        {solved && targets.map((t, i) => (
          <div key={i} style={{
            position: 'absolute', left: (t.x + 0.5) * CELL, top: (t.y + 0.5) * CELL,
            width: CELL * 1.3, height: CELL * 1.3, borderRadius: '50%', pointerEvents: 'none',
            border: `2px solid ${GOLD}`, transform: 'translate(-50%, -50%)',
            animation: 'mrun-lens-pop 520ms ease-out forwards',
          }} />
        ))}
      </div>

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
