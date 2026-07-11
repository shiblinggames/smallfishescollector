'use client'

// Cargo Shuffle — the Chapter 4 Sokoban node (see RaidCargoPuzzle in
// lib/raidMap). Push powder crates onto their deck marks; crates only PUSH
// (never pull), one at a time. Three escalating rooms play in order; solving
// the last calls onSolved (the server grants Nav XP + clears the node).
//
// Controls are mobile-first: SWIPE anywhere on the board to step the sailor
// one tile in that direction (a swipe that pushes a crate steps both). Undo
// rewinds one move (and its cost); busting the move budget resets the room —
// planning beats brute force, same philosophy as Mirror Run's fire budget.
//
// Rendering is a DOM grid with GPU transforms only (discrete steps, spring
// transitions) — no RAF loop needed since nothing animates continuously; the
// iOS-PWA freeze lessons from Mirror Run don't apply to stepwise motion.

import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RaidCargoPuzzle } from '@/lib/raidMap'
import { vibrate, hapticTap, hapticReward } from '@/lib/haptics'

type Cell = { r: number; c: number }
const keyOf = (r: number, c: number) => r * 100 + c

interface RoomState {
  player: Cell
  crates: number[]        // keyOf positions
  moves: number
  history: { player: Cell; crates: number[] }[]
}

function parseRoom(grid: string[]) {
  const walls = new Set<number>()
  const plates = new Set<number>()
  const crates: number[] = []
  let player: Cell = { r: 0, c: 0 }
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === '#') walls.add(keyOf(r, c))
      if (ch === '@' || ch === '+') player = { r, c }
      if (ch === '$' || ch === '*') crates.push(keyOf(r, c))
      if (ch === '.' || ch === '*' || ch === '+') plates.add(keyOf(r, c))
    }
  })
  return { walls, plates, crates, player, rows: grid.length, cols: Math.max(...grid.map(r => r.length)) }
}

export default function CargoShufflePuzzle({ puzzle, onSolved }: { puzzle: RaidCargoPuzzle; onSolved: () => void }) {
  const [roomIdx, setRoomIdx] = useState(0)
  const room = puzzle.rooms[Math.min(roomIdx, puzzle.rooms.length - 1)]
  const parsed = useMemo(() => parseRoom(room.grid), [room])
  const [st, setSt] = useState<RoomState>(() => ({ player: parsed.player, crates: parsed.crates, moves: 0, history: [] }))
  const [bustKey, setBustKey] = useState(0)         // bumps on a budget bust (shake + reset)
  const [roomClearFx, setRoomClearFx] = useState(false)
  const solvedRef = useRef(false)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)

  // Reset state when the room changes (next room / replay).
  const roomRef = useRef(room)
  if (roomRef.current !== room) {
    roomRef.current = room
    solvedRef.current = false
    setSt({ player: parsed.player, crates: parsed.crates, moves: 0, history: [] })
  }

  const isSolved = (crates: number[]) => crates.every(k => parsed.plates.has(k))

  function step(dr: number, dc: number) {
    if (solvedRef.current || roomClearFx) return
    setSt(prev => {
      const nr = prev.player.r + dr, nc = prev.player.c + dc
      const nk = keyOf(nr, nc)
      if (parsed.walls.has(nk)) return prev
      let crates = prev.crates
      if (prev.crates.includes(nk)) {
        const bk = keyOf(nr + dr, nc + dc)
        if (parsed.walls.has(bk) || prev.crates.includes(bk)) return prev
        crates = prev.crates.map(k => (k === nk ? bk : k))
        vibrate(12)          // crate shoved — a heavier thud than a step
      } else {
        hapticTap()
      }
      const moves = prev.moves + 1
      const next: RoomState = {
        player: { r: nr, c: nc },
        crates,
        moves,
        history: [...prev.history, { player: prev.player, crates: prev.crates }],
      }
      if (isSolved(crates)) {
        solvedRef.current = true
        hapticReward()
        setTimeout(() => {
          if (roomIdx >= puzzle.rooms.length - 1) onSolved()
          else { setRoomClearFx(true); setTimeout(() => { setRoomClearFx(false); setRoomIdx(i => i + 1) }, 900) }
        }, 350)
        return next
      }
      if (moves >= room.moveBudget) {
        // Budget spent without a solve — the hold resets. Same reset-on-bust
        // teaching as Mirror Run: read the room, then commit.
        vibrate([0, 40, 30, 60])
        setBustKey(k => k + 1)
        setTimeout(() => setSt({ player: parsed.player, crates: parsed.crates, moves: 0, history: [] }), 420)
        return next
      }
      return next
    })
  }

  function undo() {
    if (solvedRef.current || roomClearFx) return
    hapticTap()
    setSt(prev => {
      const last = prev.history[prev.history.length - 1]
      if (!last) return prev
      return { player: last.player, crates: last.crates, moves: prev.moves - 1, history: prev.history.slice(0, -1) }
    })
  }

  function reset() {
    if (solvedRef.current || roomClearFx) return
    vibrate(10)
    setSt({ player: parsed.player, crates: parsed.crates, moves: 0, history: [] })
  }

  // Swipe input — one step per swipe, axis by dominant delta.
  function onPointerDown(e: React.PointerEvent) {
    swipeRef.current = { x: e.clientX, y: e.clientY }
  }
  function onPointerUp(e: React.PointerEvent) {
    const s = swipeRef.current
    swipeRef.current = null
    if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.hypot(dx, dy) < 18) return   // a tap, not a swipe
    if (Math.abs(dx) > Math.abs(dy)) step(0, dx > 0 ? 1 : -1)
    else step(dy > 0 ? 1 : -1, 0)
  }

  const CELL = `min(11.5vw, 46px)`
  const movesLeft = room.moveBudget - st.moves
  const low = movesLeft <= Math.ceil(room.moveBudget * 0.2)

  return (
    <div style={{ marginTop: '1.1rem' }}>
      {/* Header — room progress + the move budget (the real pressure). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875' }}>
          Hold {roomIdx + 1} of {puzzle.rooms.length}
        </p>
        <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: low ? '#f08a8a' : '#c4a96a' }}>
          {movesLeft} move{movesLeft === 1 ? '' : 's'} left
        </p>
      </div>

      {/* The hold. Swipe anywhere on it to step. */}
      <motion.div
        key={`room-${roomIdx}-${bustKey}`}
        initial={bustKey > 0 ? { x: 0 } : { opacity: 0, scale: 0.96 }}
        animate={bustKey > 0 ? { x: [0, -7, 6, -4, 2, 0], opacity: 1, scale: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{
          position: 'relative', touchAction: 'none', userSelect: 'none', margin: '0 auto',
          width: `calc(${CELL} * ${parsed.cols})`, height: `calc(${CELL} * ${parsed.rows})`,
          borderRadius: 10, overflow: 'hidden',
          background: 'rgba(30,22,12,0.55)', border: '1px solid rgba(196,169,106,0.3)',
        }}
      >
        {/* Static tiles: walls + deck marks. */}
        {room.grid.map((row, r) => row.split('').map((ch, c) => {
          const k = keyOf(r, c)
          if (ch === '#') {
            return <div key={k} style={{ position: 'absolute', left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})`, width: CELL, height: CELL, background: 'linear-gradient(180deg, #3a2c18, #241a0e)', border: '1px solid rgba(0,0,0,0.4)', boxSizing: 'border-box' }} />
          }
          if (parsed.plates.has(k)) {
            return (
              <div key={k} style={{ position: 'absolute', left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})`, width: CELL, height: CELL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '54%', height: '54%', borderRadius: 6, border: '2px dashed rgba(240,192,64,0.55)', boxShadow: 'inset 0 0 8px rgba(240,192,64,0.15)' }} />
              </div>
            )
          }
          return null
        }))}

        {/* Crates — spring between tiles; lit gold when seated on a mark. */}
        {st.crates.map((k, i) => {
          const r = Math.floor(k / 100), c = k % 100
          const seated = parsed.plates.has(k)
          return (
            <motion.div key={`crate-${i}`}
              animate={{ left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})` }}
              transition={{ type: 'spring', stiffness: 560, damping: 34 }}
              style={{ position: 'absolute', width: CELL, height: CELL, padding: '7%', boxSizing: 'border-box' }}
            >
              <div style={{
                width: '100%', height: '100%', borderRadius: 7,
                background: seated ? 'linear-gradient(180deg, #e8c879, #b8933f)' : 'linear-gradient(180deg, #8a6a3a, #5f4826)',
                border: `2px solid ${seated ? '#ffe9ad' : 'rgba(0,0,0,0.35)'}`,
                boxShadow: seated ? '0 0 12px rgba(240,192,64,0.6)' : 'inset 0 2px 0 rgba(255,255,255,0.12), 0 2px 5px rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: '62%', height: 2, background: 'rgba(0,0,0,0.28)', borderRadius: 2, transform: 'rotate(45deg)', position: 'absolute' }} />
                <div style={{ width: '62%', height: 2, background: 'rgba(0,0,0,0.28)', borderRadius: 2, transform: 'rotate(-45deg)', position: 'absolute' }} />
              </div>
            </motion.div>
          )
        })}

        {/* The sailor. */}
        <motion.div
          animate={{ left: `calc(${CELL} * ${st.player.c})`, top: `calc(${CELL} * ${st.player.r})` }}
          transition={{ type: 'spring', stiffness: 620, damping: 34 }}
          style={{ position: 'absolute', width: CELL, height: CELL, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}
        >
          <div style={{ fontSize: `calc(${CELL} * 0.58)`, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))', lineHeight: 1 }}>⚓</div>
        </motion.div>

        {/* Room-clear flash. */}
        <AnimatePresence>
          {roomClearFx && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,14,4,0.72)', zIndex: 3 }}>
              <p className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#f0c040', textShadow: '0 0 18px rgba(240,192,64,0.6)' }}>Hold secured</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Controls + how-to. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#8a8480', lineHeight: 1.4, maxWidth: '58%' }}>
          Swipe to move. Shove every crate onto a marked square — crates only push, never pull.
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={undo} disabled={st.history.length === 0}
            className="font-karla font-700 uppercase tracking-[0.08em]"
            style={{ padding: '0.45rem 0.8rem', borderRadius: 9, fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: st.history.length === 0 ? '#5a5856' : '#cfc9bf', cursor: st.history.length === 0 ? 'default' : 'pointer' }}>
            Undo
          </button>
          <button type="button" onClick={reset}
            className="font-karla font-700 uppercase tracking-[0.08em]"
            style={{ padding: '0.45rem 0.8rem', borderRadius: 9, fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfc9bf', cursor: 'pointer' }}>
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
