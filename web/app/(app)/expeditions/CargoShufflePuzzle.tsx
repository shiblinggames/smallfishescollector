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
  // Blocked step (wall / immovable crate) — a rejected swipe used to do
  // NOTHING, which read as dead input. Now the sailor jabs toward the block.
  const [bump, setBump] = useState<{ dr: number; dc: number; key: number } | null>(null)
  // Deadlock warning — a crate shoved into a corner (off its mark) can never
  // move again, and without this the room just FEELS unsolvable. Detected on
  // every push; sticks until Undo/Reset frees it.
  const [stuck, setStuck] = useState(false)
  const [roomClearFx, setRoomClearFx] = useState(false)
  const solvedRef = useRef(false)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)

  // Reset state when the room changes (next room / replay).
  const roomRef = useRef(room)
  if (roomRef.current !== room) {
    roomRef.current = room
    solvedRef.current = false
    setStuck(false)
    setSt({ player: parsed.player, crates: parsed.crates, moves: 0, history: [] })
  }

  const isSolved = (crates: number[]) => crates.every(k => parsed.plates.has(k))

  // Corner deadlock: a crate off its mark with a wall on a vertical AND a
  // horizontal side can never be pushed again — the room is dead.
  const isDeadlocked = (k: number) => {
    if (parsed.plates.has(k)) return false
    const r = Math.floor(k / 100), c = k % 100
    const w = (rr: number, cc: number) => parsed.walls.has(keyOf(rr, cc))
    return (w(r - 1, c) || w(r + 1, c)) && (w(r, c - 1) || w(r, c + 1))
  }

  function step(dr: number, dc: number) {
    if (solvedRef.current || roomClearFx) return
    setSt(prev => {
      const nr = prev.player.r + dr, nc = prev.player.c + dc
      const nk = keyOf(nr, nc)
      if (parsed.walls.has(nk)) {
        vibrate(8)
        setBump({ dr, dc, key: Date.now() })
        return prev
      }
      let crates = prev.crates
      if (prev.crates.includes(nk)) {
        const bk = keyOf(nr + dr, nc + dc)
        if (parsed.walls.has(bk) || prev.crates.includes(bk)) {
          vibrate(8)
          setBump({ dr, dc, key: Date.now() })
          return prev
        }
        crates = prev.crates.map(k => (k === nk ? bk : k))
        if (isDeadlocked(bk)) {
          // Jammed a crate into a corner — say so, loudly, instead of letting
          // the player conclude the room is unsolvable.
          vibrate([0, 30, 40, 30])
          setStuck(true)
        } else {
          vibrate(12)        // crate shoved — a heavier thud than a step
        }
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
        setTimeout(() => { setStuck(false); setSt({ player: parsed.player, crates: parsed.crates, moves: 0, history: [] }) }, 420)
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
      setStuck(last.crates.some(isDeadlocked))
      return { player: last.player, crates: last.crates, moves: prev.moves - 1, history: prev.history.slice(0, -1) }
    })
  }

  function reset() {
    if (solvedRef.current || roomClearFx) return
    vibrate(10)
    setStuck(false)
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

  // Fit-to-room cell size: the widest room (9 cols) was overflowing the sheet
  // at a fixed 11.5vw/cell. Cap the BOARD at ~84vw and split it across the
  // room's columns, so every room sits centered with margin to spare.
  const CELL = `min(${(84 / parsed.cols).toFixed(2)}vw, 46px)`
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

      {/* Deadlock callout — without this, a cornered crate reads as "the
          puzzle is unsolvable" instead of "I need to Undo". */}
      <AnimatePresence>
        {stuck && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="font-karla font-700"
            style={{ fontSize: '0.64rem', color: '#f08a8a', textAlign: 'center', marginBottom: 8 }}>
            A crate is jammed in a corner — Undo or Reset to free it.
          </motion.p>
        )}
      </AnimatePresence>

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
          background: '#140c06', border: '1px solid rgba(196,169,106,0.4)',
          boxShadow: 'inset 0 0 26px rgba(0,0,0,0.6), 0 4px 14px rgba(0,0,0,0.4)',
        }}
      >
        {/* Static tiles. Readability is the whole game here: FLOOR = warm lit
            deck planks (checkered so distances read at a glance), WALL = near-
            black raised timber, so the room's shape is unmistakable — the old
            board painted both a similar dark brown and later rooms read as
            noise. Deck marks are bright gold stencils on the floor. */}
        {room.grid.map((row, r) => row.split('').map((ch, c) => {
          const k = keyOf(r, c)
          if (ch === '#') {
            return (
              <div key={k} style={{
                position: 'absolute', left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})`,
                width: CELL, height: CELL, boxSizing: 'border-box',
                background: 'linear-gradient(180deg, #221709, #120a04)',
                boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.05), inset 0 -2px 0 rgba(0,0,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.5)',
              }} />
            )
          }
          const light = (r + c) % 2 === 0
          return (
            <div key={k} style={{
              position: 'absolute', left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})`,
              width: CELL, height: CELL, boxSizing: 'border-box',
              background: light
                ? 'linear-gradient(180deg, #6d5130 0%, #5f4629 100%)'
                : 'linear-gradient(180deg, #614729 0%, #543d23 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {parsed.plates.has(k) && (
                <div style={{
                  width: '62%', height: '62%', borderRadius: 4,
                  border: '2px solid rgba(240,192,64,0.85)',
                  background: 'rgba(240,192,64,0.10)',
                  boxShadow: '0 0 10px rgba(240,192,64,0.3), inset 0 0 8px rgba(240,192,64,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: '26%', height: '26%', background: 'rgba(240,192,64,0.75)', transform: 'rotate(45deg)', borderRadius: 1 }} />
                </div>
              )}
            </div>
          )
        }))}

        {/* Crates — kept deliberately SIMPLE: a square wooden box, a frame,
            two plank lines. Spring between tiles; relights gold when seated. */}
        {st.crates.map((k, i) => {
          const r = Math.floor(k / 100), c = k % 100
          const seated = parsed.plates.has(k)
          const slat = seated ? 'rgba(120,86,10,0.4)' : 'rgba(0,0,0,0.28)'
          return (
            <motion.div key={`crate-${i}`}
              animate={{ left: `calc(${CELL} * ${c})`, top: `calc(${CELL} * ${r})` }}
              transition={{ type: 'spring', stiffness: 560, damping: 34 }}
              style={{ position: 'absolute', width: CELL, height: CELL, zIndex: 1 }}
            >
              <div style={{
                position: 'absolute', inset: '8%', borderRadius: 3, overflow: 'hidden',
                background: seated
                  ? 'linear-gradient(180deg, #ecd084, #c09a42)'
                  : 'linear-gradient(180deg, #a87c46, #7d5a30)',
                border: `2px solid ${seated ? '#8a6a20' : '#3e2a12'}`, boxSizing: 'border-box',
                boxShadow: seated
                  ? '0 0 14px rgba(240,192,64,0.65), inset 0 2px 0 rgba(255,255,255,0.3)'
                  : 'inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.25), 0 3px 6px rgba(0,0,0,0.5)',
              }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '33%', height: 1.5, background: slat }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: '66%', height: 1.5, background: slat }} />
              </div>
            </motion.div>
          )
        })}

        {/* The sailor — a brass-ringed deck token with a drawn ship's WHEEL
            (SVG, no emoji/anchor), so it reads as YOUR piece at the helm. */}
        <motion.div
          animate={{ left: `calc(${CELL} * ${st.player.c})`, top: `calc(${CELL} * ${st.player.r})` }}
          transition={{ type: 'spring', stiffness: 620, damping: 34 }}
          style={{ position: 'absolute', width: CELL, height: CELL, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none' }}
        >
          <motion.div
            key={bump?.key ?? 'idle'}
            animate={{ x: [0, (bump?.dc ?? 0) * 5, 0], y: [0, (bump?.dr ?? 0) * 5, 0] }}
            transition={{ duration: 0.16 }}
            style={{
            width: '74%', height: '74%', borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #3d5a7a, #182840)',
            border: '2px solid #c4a96a',
            boxShadow: '0 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25), 0 0 10px rgba(196,169,106,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="66%" height="66%" viewBox="0 0 24 24" fill="none" stroke="#f0e6c8" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" />
              <circle cx="12" cy="12" r="6.4" strokeWidth="2" />
              <circle cx="12" cy="12" r="2.2" fill="#f0e6c8" stroke="none" />
            </svg>
          </motion.div>
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
