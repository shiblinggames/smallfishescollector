'use client'

// Lay the Rigging — a ship-themed Flow puzzle. Drag a rope from each
// cleat to its matching cleat, cover every deck plank, no rope crosses
// another. Ropes render as glowing SVG cords through the cell centers;
// cleats are glossy knobs; connecting a pair snaps taut with a pulse +
// haptic. Solve it (all pairs joined + every plank covered) to bank
// puzzle points toward your Den purse. One board a week.
//
// Server-authoritative: the solve is re-validated in submitRigging
// before any points are paid; the board ships only the endpoint pairs.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import BackButton from '@/components/BackButton'
import { motion, AnimatePresence } from 'framer-motion'
import { saveRiggingPaths, submitRigging } from './actions'
import { isSolved, neighborsOf } from './rigging'
import { RIGGING_PALETTE, type RiggingState } from './constants'
import { denDailyCap, nextDenTier } from '@/app/(app)/tavern/constants'

const GOLD = '#f0c040'

function haptic(pattern: number | number[]) {
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern) } catch { /* no-op */ }
}

export default function RiggingGame({ initial }: { initial: RiggingState }) {
  const { cols, rows, pairs } = initial
  const total = cols * rows

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
  const activeRef = useRef<number | null>(null)
  const [status, setStatus] = useState(initial.status)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [denCap, setDenCap] = useState(initial.denCap)
  const [flash, setFlash] = useState<{ color: number; key: number } | null>(null)
  const flashKey = useRef(0)
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
  const setActiveBoth = useCallback((c: number | null) => { activeRef.current = c; setActive(c) }, [])

  const cleared = status === 'cleared'

  const owner = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, cellsList] of Object.entries(paths)) {
      const color = Number(k)
      for (const cell of cellsList) m.set(cell, color)
    }
    return m
  }, [paths])

  const coverage = owner.size
  const isConnected = useCallback((color: number) => {
    const path = paths[color]
    if (!path || path.length < 2) return false
    const pair = pairs.find(p => p.color === color)!
    const ends = new Set([path[0], path[path.length - 1]])
    return ends.has(pair.a) && ends.has(pair.b)
  }, [paths, pairs])
  const connected = pairs.filter(p => isConnected(p.color)).length

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
      commit({ ...pathsRef.current, [epc]: [cell] }); setActiveBoth(epc); haptic(6); return
    }
    const own = pathsRef.current
    for (const [k, path] of Object.entries(own)) {
      const idx = path.indexOf(cell)
      if (idx >= 0) { commit({ ...own, [Number(k)]: path.slice(0, idx + 1) }); setActiveBoth(Number(k)); haptic(6); return }
    }
    setActiveBoth(null)
  }

  function extendTo(cell: number) {
    const act = activeRef.current
    if (act === null) return
    const own = pathsRef.current
    const path = own[act] ?? []
    if (path.length === 0) return
    const last = path[path.length - 1]
    if (cell === last) return
    if (path.length >= 2 && cell === path[path.length - 2]) { commit({ ...own, [act]: path.slice(0, -1) }); return }
    if (!neighborsOf(last, cols, rows).includes(cell)) return
    if (path.includes(cell)) return
    if (endpointColor.get(last) !== undefined && path.length >= 2) return // already at own cleat
    const epc = endpointColor.get(cell)
    if (epc !== undefined && epc !== act) return // can't run over another pair's cleat
    const next: Record<number, number[]> = { ...own }
    let cut = false
    for (const [k, p] of Object.entries(own)) {
      const color = Number(k)
      if (color === act) continue
      const idx = p.indexOf(cell)
      if (idx >= 0) { next[color] = p.slice(0, idx); cut = true }
    }
    next[act] = [...path, cell]
    commit(next)
    // Just completed this pair?
    const pair = pairs.find(p => p.color === act)!
    const ends = new Set([next[act][0], next[act][next[act].length - 1]])
    if (ends.has(pair.a) && ends.has(pair.b) && next[act].length >= 2) {
      flashKey.current++; setFlash({ color: act, key: flashKey.current }); haptic(18)
    } else {
      haptic(cut ? [4, 12] : 4)
    }
  }

  function endStroke() {
    if (activeRef.current === null) return
    setActiveBoth(null)
    const current = pathsRef.current
    if (cleared) return
    if (isSolved(cols, rows, pairs, current)) {
      haptic([12, 40, 12, 40, 20])
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
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveRiggingPaths(current) }, 600)
  }

  function resetAll() {
    if (cleared) return
    commit({}); setActiveBoth(null); haptic(10)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveRiggingPaths({}) }, 400)
  }

  const nextTier = useMemo(() => nextDenTier(puzzlePoints), [puzzlePoints])
  const boardW = `min(96vw, ${cols * 46}px)`
  const cx = (cell: number) => (cell % cols) + 0.5
  const cy = (cell: number) => Math.floor(cell / cols) + 0.5

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BackButton href="/tavern/chart-room" label="Charting" />
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
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e6d8b4' }}>{puzzlePoints} charting pts</span>
        <span style={{ color: '#6a6258' }}>·</span>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD }}>Den purse {denCap.toLocaleString()} ⟡/day</span>
        {nextTier && <span className="font-karla" style={{ fontSize: '0.62rem', color: '#9a9078' }}>({nextTier.points - puzzlePoints} → {nextTier.cap.toLocaleString()} ⟡)</span>}
      </div>

      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#cfc6b0', lineHeight: 1.5, textAlign: 'center' }}>
        Drag a rope from each cleat to its match. Cover every plank, no rope crossing another. Rig the whole deck for +{initial.reward} charting points.
      </p>

      {/* Board */}
      <div
        ref={gridRef}
        onPointerDown={e => { if (cleared) return; const c = cellFromEvent(e); if (c !== null) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); beginAt(c) } }}
        onPointerMove={e => { if (activeRef.current === null) return; const c = cellFromEvent(e); if (c !== null) extendTo(c) }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        style={{
          position: 'relative', width: boardW, aspectRatio: '1 / 1', margin: '0 auto', touchAction: 'none',
          borderRadius: 14, padding: 7,
          background: 'linear-gradient(180deg, #241a0e 0%, #140d06 100%)',
          border: '2px solid rgba(196,169,106,0.4)',
          boxShadow: '0 8px 22px rgba(0,0,0,0.5), inset 0 0 24px rgba(0,0,0,0.45)',
        }}
      >
        {/* Plank grid backdrop */}
        <div aria-hidden style={{ position: 'absolute', inset: 7, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, pointerEvents: 'none' }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ borderRadius: 5, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(196,169,106,0.1)' }} />
          ))}
        </div>

        {/* Rope + cleat overlay */}
        <svg aria-hidden viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 7, width: `calc(100% - 14px)`, height: `calc(100% - 14px)`, pointerEvents: 'none', overflow: 'visible' }}>
          {/* ropes */}
          {pairs.map(p => {
            const path = paths[p.color]
            if (!path || path.length < 2) return null
            const col = RIGGING_PALETTE[p.color]
            const pts = path.map(c => `${cx(c)},${cy(c)}`).join(' ')
            const isAct = active === p.color
            const done = isConnected(p.color)
            return (
              <g key={p.color}>
                {(isAct || done) && (
                  <polyline points={pts} fill="none" stroke={col} strokeWidth={0.66} strokeLinecap="round" strokeLinejoin="round" opacity={isAct ? 0.42 : 0.28} style={{ filter: 'blur(0.05px)' }} />
                )}
                {/* dark rope edge — gives the cord an outline + depth */}
                <polyline points={pts} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" opacity={done ? 0.95 : 0.8} />
                {/* rope body in the pair colour */}
                <polyline points={pts} fill="none" stroke={col} strokeWidth={0.4} strokeLinecap="round" strokeLinejoin="round" opacity={done ? 1 : 0.92} />
                {/* twisted-hemp texture: dark bands + offset light strands read
                    as the diagonal twist of a laid rope */}
                <polyline points={pts} fill="none" stroke="rgba(0,0,0,0.34)" strokeWidth={0.4} strokeLinecap="butt" strokeLinejoin="round" strokeDasharray="0.085 0.17" opacity={done ? 0.7 : 0.5} />
                <polyline points={pts} fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth={0.4} strokeLinecap="butt" strokeLinejoin="round" strokeDasharray="0.04 0.215" strokeDashoffset="0.12" opacity={done ? 0.6 : 0.42} />
                {/* top sheen — rounds the cord */}
                <polyline points={pts} fill="none" stroke="#ffffff" strokeWidth={0.09} strokeLinecap="round" strokeLinejoin="round" opacity={0.2} />
              </g>
            )
          })}
          {/* cleats */}
          {pairs.map(p => {
            const col = RIGGING_PALETTE[p.color]
            const done = isConnected(p.color)
            return [p.a, p.b].map((cell, idx) => (
              <g key={`${p.color}-${idx}`}>
                {done && <circle cx={cx(cell)} cy={cy(cell)} r={0.44} fill="none" stroke={col} strokeWidth={0.06} opacity={0.7} />}
                <circle cx={cx(cell)} cy={cy(cell)} r={0.34} fill={col} stroke="rgba(0,0,0,0.3)" strokeWidth={0.04} />
                <circle cx={cx(cell) - 0.08} cy={cy(cell) - 0.09} r={0.11} fill="#ffffff" opacity={0.55} />
              </g>
            ))
          })}
          {/* active head marker */}
          {active !== null && paths[active] && paths[active].length > 0 && (() => {
            const head = paths[active][paths[active].length - 1]
            return <circle cx={cx(head)} cy={cy(head)} r={0.2} fill="#ffffff" opacity={0.5} />
          })()}
          {/* connect pulse */}
          <AnimatePresence>
            {flash && [pairs.find(p => p.color === flash.color)!.a, pairs.find(p => p.color === flash.color)!.b].map((cell, idx) => (
              <motion.circle
                key={`${flash.key}-${idx}`}
                cx={cx(cell)} cy={cy(cell)} fill="none" stroke={RIGGING_PALETTE[flash.color]} strokeWidth={0.08}
                initial={{ r: 0.34, opacity: 0.8 }} animate={{ r: 0.85, opacity: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                onAnimationComplete={() => setFlash(f => (f && f.key === flash.key ? null : f))}
              />
            ))}
          </AnimatePresence>
        </svg>
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
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#cfc6b0', marginTop: 3 }}>Banked +{initial.reward} charting points. Fresh rigging next Monday.</p>
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
                <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#7bbf7b', marginTop: 14 }}>+{win.points} charting points</p>
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
