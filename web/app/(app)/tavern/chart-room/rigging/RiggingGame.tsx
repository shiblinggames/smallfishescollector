'use client'

// Lay the Rigging — a ship-themed Flow puzzle. Drag a rope from each
// cleat to its matching cleat, cover every deck plank, no rope crosses
// another. Solve it (all pairs joined + every plank covered) to bank
// puzzle points toward your Den purse. One board a week.
//
// Server-authoritative: the solve is re-validated in submitRigging
// before any points are paid; the board ships only the endpoint pairs.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { saveRiggingPaths, submitRigging } from './actions'
import { isSolved, neighborsOf } from './rigging'
import { RIGGING_PALETTE, type RiggingState } from './constants'
import { denDailyCap, nextDenTier } from '@/app/(app)/tavern/constants'

const GOLD = '#f0c040'

export default function RiggingGame({ initial }: { initial: RiggingState }) {
  const { cols, rows, pairs } = initial
  const total = cols * rows

  // cell → color for each endpoint, and the set of endpoint cells.
  const endpointColor = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of pairs) { m.set(p.a, p.color); m.set(p.b, p.color) }
    return m
  }, [pairs])

  const normInit = useMemo(() => {
    const out: Record<number, number[]> = {}
    for (const [k, v] of Object.entries(initial.paths ?? {})) out[Number(k)] = v as number[]
    return out
  }, [initial.paths])

  const [paths, setPathsState] = useState<Record<number, number[]>>(normInit)
  const pathsRef = useRef(paths)
  const [active, setActive] = useState<number | null>(null)
  const [status, setStatus] = useState(initial.status)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [denCap, setDenCap] = useState(initial.denCap)
  const [win, setWin] = useState<{ points: number; capUp: number | null } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [, startTransition] = useTransition()
  const gridRef = useRef<HTMLDivElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const commit = useCallback((next: Record<number, number[]>) => {
    pathsRef.current = next
    setPathsState(next)
  }, [])

  const cleared = status === 'cleared'

  // Owner color of each cell (paths are kept disjoint by the cut logic).
  const owner = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, cellsList] of Object.entries(paths)) {
      const color = Number(k)
      for (const cell of cellsList) m.set(cell, color)
    }
    return m
  }, [paths])

  const coverage = owner.size
  const connected = pairs.filter(p => {
    const path = paths[p.color]
    if (!path || path.length < 2) return false
    const ends = new Set([path[0], path[path.length - 1]])
    return ends.has(p.a) && ends.has(p.b)
  }).length

  function cellFromEvent(e: React.PointerEvent): number | null {
    const el = gridRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
    const c = Math.min(cols - 1, Math.max(0, Math.floor((x / rect.width) * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor((y / rect.height) * rows)))
    return r * cols + c
  }

  function beginAt(cell: number) {
    const epc = endpointColor.get(cell)
    if (epc !== undefined) {
      // Start this color fresh from the tapped cleat.
      const next = { ...pathsRef.current, [epc]: [cell] }
      commit(next); setActive(epc); return
    }
    const own = pathsRef.current
    for (const [k, path] of Object.entries(own)) {
      const idx = path.indexOf(cell)
      if (idx >= 0) {
        // Grab an existing rope mid-run; continue from here.
        const color = Number(k)
        const next = { ...own, [color]: path.slice(0, idx + 1) }
        commit(next); setActive(color); return
      }
    }
    setActive(null)
  }

  function extendTo(cell: number) {
    if (active === null) return
    const own = pathsRef.current
    const path = own[active] ?? []
    if (path.length === 0) return
    const last = path[path.length - 1]
    if (cell === last) return
    // Backtrack.
    if (path.length >= 2 && cell === path[path.length - 2]) {
      commit({ ...own, [active]: path.slice(0, -1) })
      return
    }
    if (!neighborsOf(last, cols, rows).includes(cell)) return
    if (path.includes(cell)) return // no self-cross
    // Can't extend past your own completed endpoint.
    if (endpointColor.get(last) !== undefined && path.length >= 2) return
    // Can't run over another pair's cleat.
    const epc = endpointColor.get(cell)
    if (epc !== undefined && epc !== active) return
    // Cut any other rope that occupies this cell.
    const next: Record<number, number[]> = { ...own }
    for (const [k, p] of Object.entries(own)) {
      const color = Number(k)
      if (color === active) continue
      const idx = p.indexOf(cell)
      if (idx >= 0) next[color] = p.slice(0, idx)
    }
    next[active] = [...path, cell]
    commit(next)
  }

  function endStroke() {
    if (active === null) return
    setActive(null)
    const current = pathsRef.current
    if (cleared) return
    if (isSolved(cols, rows, pairs, current)) {
      startTransition(async () => {
        const r = await submitRigging(current)
        if ('error' in r) return
        if (r.solved) {
          setStatus('cleared')
          if (r.newPuzzlePoints !== null) {
            setPuzzlePoints(r.newPuzzlePoints)
            setDenCap(denDailyCap(r.newPuzzlePoints))
            setWin({ points: r.pointsWon, capUp: r.capAfter > r.capBefore ? r.capAfter : null })
          } else if (r.pointsWon > 0) {
            setWin({ points: r.pointsWon, capUp: null })
          }
        }
      })
      return
    }
    // Debounced progress save.
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveRiggingPaths(current) }, 600)
  }

  function resetAll() {
    if (cleared) return
    commit({})
    setActive(null)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveRiggingPaths({}) }, 400)
  }

  const nextTier = useMemo(() => nextDenTier(puzzlePoints), [puzzlePoints])
  const boardW = `min(94vw, ${cols * 50}px)`

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/chart-room" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Chart Room
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Lay the Rigging
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: cleared ? GOLD : '#8f8672', whiteSpace: 'nowrap' }}>
            {cleared ? 'Rigged' : `${connected}/${pairs.length} ropes`}
          </span>
        </div>
      </div>

      {/* Points readout */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
        padding: '0.45rem 0.7rem', borderRadius: 10,
        background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)',
      }}>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e6d8b4' }}>{puzzlePoints} puzzle pts</span>
        <span style={{ color: '#6a6258' }}>·</span>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD }}>Den purse {denCap.toLocaleString()} ⟡/day</span>
        {nextTier && <span className="font-karla" style={{ fontSize: '0.62rem', color: '#9a9078' }}>({nextTier.points - puzzlePoints} → {nextTier.cap.toLocaleString()} ⟡)</span>}
      </div>

      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#cfc6b0', lineHeight: 1.5, textAlign: 'center' }}>
        Drag a rope from each cleat to its match. Cover every plank, no rope crossing another. Rig the whole deck for +{initial.reward} puzzle points.
      </p>

      {/* Board */}
      <div
        ref={gridRef}
        onPointerDown={e => { if (cleared) return; const c = cellFromEvent(e); if (c !== null) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); beginAt(c) } }}
        onPointerMove={e => { if (active === null) return; const c = cellFromEvent(e); if (c !== null) extendTo(c) }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        style={{
          width: boardW, aspectRatio: '1 / 1', margin: '0 auto', touchAction: 'none',
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3,
          padding: 6, borderRadius: 10,
          background: 'linear-gradient(180deg, #1a130a 0%, #0e0a05 100%)',
          border: '1.5px solid rgba(196,169,106,0.3)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const ep = endpointColor.get(i)
          const own = owner.get(i)
          const col = own !== undefined ? RIGGING_PALETTE[own] : null
          return (
            <div
              key={i}
              style={{
                position: 'relative', borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: col && ep === undefined ? `${col}cc` : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(196,169,106,0.12)',
                transition: 'background 0.08s',
              }}
            >
              {ep !== undefined && (
                <span style={{
                  width: '64%', height: '64%', borderRadius: '50%',
                  background: RIGGING_PALETTE[ep],
                  boxShadow: active === ep ? `0 0 10px ${RIGGING_PALETTE[ep]}` : '0 1px 3px rgba(0,0,0,0.5)',
                  border: '2px solid rgba(0,0,0,0.25)',
                }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="font-karla" style={{ fontSize: '0.64rem', color: '#8f8672' }}>{coverage}/{total} planks covered</span>
        {!cleared && (
          <button
            onClick={resetAll}
            className="font-karla font-700 uppercase"
            style={{ padding: '0.45rem 1.1rem', borderRadius: 999, letterSpacing: '0.08em', fontSize: '0.64rem', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)', color: '#c4bba6' }}
          >
            Coil ropes
          </button>
        )}
      </div>

      {cleared && (
        <div style={{ textAlign: 'center', padding: '0.8rem', background: `${GOLD}16`, border: `1px solid ${GOLD}4d`, borderRadius: 12 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: GOLD }}>Rigging laid</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#cfc6b0', marginTop: 3 }}>Banked +{initial.reward} puzzle points. Fresh rigging next Monday.</p>
        </div>
      )}

      {/* Win overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {win && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setWin(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
            >
              <motion.div
                initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                onClick={e => e.stopPropagation()}
                style={{
                  maxWidth: 340, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18,
                  background: ['radial-gradient(ellipse 80% 60% at 50% 28%, rgba(196,169,106,0.14) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.96) 0%, rgba(20,14,7,0.98) 100%)'].join(', '),
                  border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)',
                }}
              >
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>Rigging laid.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#dccba6', lineHeight: 1.5, marginTop: 8 }}>
                  Every line run true, every plank under rope. She&apos;s ready to sail.
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#7bbf7b', marginTop: 14 }}>+{win.points} puzzle points</p>
                {win.capUp !== null && (
                  <motion.p
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 300 }}
                    className="font-cinzel font-700"
                    style={{ marginTop: 12, padding: '0.5rem 0.7rem', borderRadius: 10, fontSize: '0.78rem', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55` }}
                  >
                    Den purse raised to {win.capUp.toLocaleString()} ⟡/day!
                  </motion.p>
                )}
                <button
                  onClick={() => setWin(null)}
                  className="font-karla font-700 uppercase"
                  style={{ marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}
                >
                  Back to the Deck
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
