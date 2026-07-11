'use client'

// Tumbler Lock — the Chapter 4 Rush-Hour node (see RaidTumblerPuzzle in
// lib/raidMap). Drag iron bars along their axis to clear a path so the gold
// BOLT can run out the right edge of its row. One SLIDE = one bar moved (any
// distance); busting the slide budget resets the stage. Three stages play in
// order; solving the last calls onSolved.
//
// Drag is 1:1 under the finger: at drag start we compute the bar's free range
// (other bars fixed), clamp live movement to it, and snap to the nearest cell
// on release — a changed resting cell costs one slide. GPU transforms only.

import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RaidTumblerPuzzle } from '@/lib/raidMap'
import { vibrate, hapticTap, hapticReward } from '@/lib/haptics'

interface Bar { id: string; axis: 'h' | 'v'; r: number; c: number; len: number }

function parseStage(grid: string[]): { bars: Bar[]; rows: number; cols: number } {
  const cells: Record<string, [number, number][]> = {}
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch !== '.') (cells[ch] ??= []).push([r, c])
    }
  })
  const bars = Object.entries(cells).map(([id, cs]) => {
    cs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const axis: 'h' | 'v' = new Set(cs.map(x => x[0])).size === 1 ? 'h' : 'v'
    return { id, axis, r: cs[0][0], c: cs[0][1], len: cs.length }
  })
  return { bars, rows: grid.length, cols: Math.max(...grid.map(r => r.length)) }
}

export default function TumblerLockPuzzle({ puzzle, onSolved }: { puzzle: RaidTumblerPuzzle; onSolved: () => void }) {
  const [stageIdx, setStageIdx] = useState(0)
  const stage = puzzle.stages[Math.min(stageIdx, puzzle.stages.length - 1)]
  const parsed = useMemo(() => parseStage(stage.grid), [stage])
  const [bars, setBars] = useState<Bar[]>(parsed.bars)
  const [moves, setMoves] = useState(0)
  const [bustKey, setBustKey] = useState(0)
  const [stageClearFx, setStageClearFx] = useState(false)
  const [boltOut, setBoltOut] = useState(false)
  const solvedRef = useRef(false)
  const boardRef = useRef<HTMLDivElement>(null)
  // Live drag: bar id + start pointer + start cell + free range + px offset.
  const dragRef = useRef<{ id: string; startX: number; startY: number; minOff: number; maxOff: number; off: number } | null>(null)
  const [dragTick, setDragTick] = useState(0)   // re-render while dragging

  const stageRef = useRef(stage)
  if (stageRef.current !== stage) {
    stageRef.current = stage
    solvedRef.current = false
    setBars(parsed.bars)
    setMoves(0)
    setBoltOut(false)
  }

  const cellPx = () => (boardRef.current?.clientWidth ?? 300) / parsed.cols

  function occupancy(except?: string): Set<string> {
    const occ = new Set<string>()
    for (const b of bars) {
      if (b.id === except) continue
      for (let i = 0; i < b.len; i++) occ.add(`${b.r + (b.axis === 'v' ? i : 0)},${b.c + (b.axis === 'h' ? i : 0)}`)
    }
    return occ
  }

  function freeRange(bar: Bar): { min: number; max: number } {
    const occ = occupancy(bar.id)
    let min = 0, max = 0
    // negative direction
    for (let s = 1; ; s++) {
      const r = bar.axis === 'v' ? bar.r - s : bar.r
      const c = bar.axis === 'h' ? bar.c - s : bar.c
      if (r < 0 || c < 0 || occ.has(`${r},${c}`)) break
      min = -s
    }
    // positive direction
    for (let s = 1; ; s++) {
      const r = bar.axis === 'v' ? bar.r + bar.len - 1 + s : bar.r
      const c = bar.axis === 'h' ? bar.c + bar.len - 1 + s : bar.c
      if ((bar.axis === 'v' ? r >= parsed.rows : c >= parsed.cols) || occ.has(`${r},${c}`)) break
      max = s
    }
    return { min, max }
  }

  function boltClear(next: Bar[]): boolean {
    const bolt = next.find(b => b.id === 'Z')!
    const occ = new Set<string>()
    for (const b of next) {
      if (b.id === 'Z') continue
      for (let i = 0; i < b.len; i++) occ.add(`${b.r + (b.axis === 'v' ? i : 0)},${b.c + (b.axis === 'h' ? i : 0)}`)
    }
    for (let x = bolt.c + bolt.len; x < parsed.cols; x++) if (occ.has(`${bolt.r},${x}`)) return false
    return true
  }

  function onBarPointerDown(e: React.PointerEvent, bar: Bar) {
    if (solvedRef.current || stageClearFx) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const { min, max } = freeRange(bar)
    dragRef.current = { id: bar.id, startX: e.clientX, startY: e.clientY, minOff: min, maxOff: max, off: 0 }
    hapticTap()
  }
  function onBarPointerMove(e: React.PointerEvent, bar: Bar) {
    const d = dragRef.current
    if (!d || d.id !== bar.id) return
    const px = cellPx()
    const raw = bar.axis === 'h' ? (e.clientX - d.startX) / px : (e.clientY - d.startY) / px
    const clamped = Math.max(d.minOff, Math.min(d.maxOff, raw))
    if (clamped !== d.off) { d.off = clamped; setDragTick(t => t + 1) }
  }
  function onBarPointerUp(bar: Bar) {
    const d = dragRef.current
    if (!d || d.id !== bar.id) return
    dragRef.current = null
    const snapped = Math.round(d.off)
    setDragTick(t => t + 1)
    if (snapped === 0) return
    vibrate(12)
    setBars(prev => {
      const next = prev.map(b => b.id === bar.id
        ? { ...b, r: b.r + (b.axis === 'v' ? snapped : 0), c: b.c + (b.axis === 'h' ? snapped : 0) }
        : b)
      const m = moves + 1
      setMoves(m)
      if (boltClear(next)) {
        solvedRef.current = true
        hapticReward()
        setBoltOut(true)
        setTimeout(() => {
          if (stageIdx >= puzzle.stages.length - 1) onSolved()
          else { setStageClearFx(true); setTimeout(() => { setStageClearFx(false); setStageIdx(i => i + 1) }, 900) }
        }, 620)
      } else if (m >= stage.moveBudget) {
        vibrate([0, 40, 30, 60])
        setBustKey(k => k + 1)
        setTimeout(() => { setBars(parsed.bars); setMoves(0) }, 420)
      }
      return next
    })
  }

  const CELL = `min(13.5vw, 52px)`
  const left = stage.moveBudget - moves
  const low = left <= Math.ceil(stage.moveBudget * 0.2)
  void dragTick // (referenced so the live-drag re-render isn't tree-shaken)

  return (
    <div style={{ marginTop: '1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875' }}>
          Tumbler {stageIdx + 1} of {puzzle.stages.length}
        </p>
        <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: low ? '#f08a8a' : '#c4a96a' }}>
          {left} slide{left === 1 ? '' : 's'} left
        </p>
      </div>

      <motion.div
        key={`stage-${stageIdx}-${bustKey}`}
        ref={boardRef}
        initial={bustKey > 0 ? { x: 0 } : { opacity: 0, scale: 0.96 }}
        animate={bustKey > 0 ? { x: [0, -7, 6, -4, 2, 0], opacity: 1, scale: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          position: 'relative', touchAction: 'none', userSelect: 'none', margin: '0 auto',
          width: `calc(${CELL} * ${parsed.cols})`, height: `calc(${CELL} * ${parsed.rows})`,
          borderRadius: 12, overflow: 'hidden',
          background: 'linear-gradient(160deg, rgba(28,24,16,0.75), rgba(14,12,8,0.85))',
          border: '1px solid rgba(196,169,106,0.35)',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        {/* Cell grid lines (subtle) + the exit notch on the bolt's row. */}
        {Array.from({ length: parsed.rows * parsed.cols }).map((_, i) => {
          const r = Math.floor(i / parsed.cols), c = i % parsed.cols
          return <div key={i} style={{ position: 'absolute', left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})`, width: CELL, height: CELL, boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.03)' }} />
        })}
        {(() => {
          const bolt = bars.find(b => b.id === 'Z')
          return bolt ? (
            <div style={{ position: 'absolute', right: -1, top: `calc(${CELL} * ${bolt.r} + ${CELL} * 0.22)`, width: 5, height: `calc(${CELL} * 0.56)`, background: '#f0c040', borderRadius: 3, boxShadow: '0 0 10px rgba(240,192,64,0.8)' }} />
          ) : null
        })()}

        {/* Bars. The bolt is gold; the rest are iron. Dragging is 1:1 within
            the free range; snap + move-count on release. */}
        {bars.map(bar => {
          const d = dragRef.current
          const off = d && d.id === bar.id ? d.off : 0
          const isBolt = bar.id === 'Z'
          const x = `calc(${CELL} * ${bar.c + (bar.axis === 'h' ? off : 0)})`
          const y = `calc(${CELL} * ${bar.r + (bar.axis === 'v' ? off : 0)})`
          return (
            <motion.div
              key={`${stageIdx}-${bar.id}`}
              onPointerDown={(e) => onBarPointerDown(e, bar)}
              onPointerMove={(e) => onBarPointerMove(e, bar)}
              onPointerUp={() => onBarPointerUp(bar)}
              onPointerCancel={() => onBarPointerUp(bar)}
              animate={isBolt && boltOut
                ? { left: `calc(${CELL} * ${parsed.cols + 1})`, top: y }
                : { left: x, top: y }}
              transition={d && d.id === bar.id ? { duration: 0 } : { type: 'spring', stiffness: 620, damping: 38 }}
              style={{
                position: 'absolute', zIndex: isBolt ? 3 : 2,
                width: `calc(${CELL} * ${bar.axis === 'h' ? bar.len : 1})`,
                height: `calc(${CELL} * ${bar.axis === 'v' ? bar.len : 1})`,
                padding: 4, boxSizing: 'border-box', cursor: 'grab', willChange: 'left, top',
              }}
            >
              <div style={{
                width: '100%', height: '100%', borderRadius: 8,
                background: isBolt
                  ? 'linear-gradient(180deg, #f0ce6d, #c49a34)'
                  : 'linear-gradient(180deg, #5a6270, #363c46)',
                border: `1.5px solid ${isBolt ? '#ffe9ad' : 'rgba(255,255,255,0.18)'}`,
                boxShadow: isBolt
                  ? '0 0 12px rgba(240,192,64,0.5), inset 0 2px 0 rgba(255,255,255,0.3)'
                  : 'inset 0 2px 0 rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                {/* rivets */}
                {Array.from({ length: bar.len }).map((_, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: isBolt ? 'rgba(120,86,10,0.7)' : 'rgba(0,0,0,0.4)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25)' }} />
                ))}
              </div>
            </motion.div>
          )
        })}

        <AnimatePresence>
          {stageClearFx && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,14,4,0.72)', zIndex: 4 }}>
              <p className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#f0c040', textShadow: '0 0 18px rgba(240,192,64,0.6)' }}>Tumbler thrown</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#8a8480', lineHeight: 1.4, maxWidth: '62%' }}>
          Drag the bars along their grooves until the gold bolt can run out the right side.
        </p>
        <button type="button" onClick={() => { if (!solvedRef.current && !stageClearFx) { vibrate(10); setBars(parsed.bars); setMoves(0) } }}
          className="font-karla font-700 uppercase tracking-[0.08em]"
          style={{ padding: '0.45rem 0.8rem', borderRadius: 9, fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfc9bf', cursor: 'pointer' }}>
          Reset
        </button>
      </div>
    </div>
  )
}
