'use client'

// The Minefield — a ship-themed weekly minesweeper. Sweep a harbor of
// drifting sea mines: reveal open water, read the soundings (mines
// bordering a tile), flag the mines, clear every safe tile. Strike a
// mine and she's lost — but the week's board resets and you try again.
// First clear of the week banks puzzle points toward your Den purse.
// Server-authoritative: the mine layout never reaches this client.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { revealCell, toggleFlag } from './actions'
import { type MinefieldState } from './constants'
import { denDailyCap, nextDenTier } from '@/app/(app)/tavern/constants'

const GOLD = '#f0c040'
// Classic adjacency palette, tuned to read on the light "open water" tile.
const NUM_COLOR: Record<number, string> = {
  1: '#1f6fd6', 2: '#1f8a4c', 3: '#c0392b', 4: '#15357a',
  5: '#8a3b1f', 6: '#0f8a8a', 7: '#3a2a1a', 8: '#6a6258',
}

export default function Minefield({ initial }: { initial: MinefieldState }) {
  const { cols, rows, mineCount } = initial
  const total = cols * rows

  const [adjMap, setAdjMap] = useState<Map<number, number>>(
    () => new Map(initial.revealed.map(t => [t.i, t.adj])),
  )
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set(initial.flagged))
  const [status, setStatus] = useState(initial.status)
  const [busts, setBusts] = useState(initial.busts)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [denCap, setDenCap] = useState(initial.denCap)
  const [flagMode, setFlagMode] = useState(false)
  const [boom, setBoom] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [win, setWin] = useState<{ points: number; capUp: number | null } | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const busy = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  const cleared = status === 'cleared'
  const minesLeft = mineCount - flagged.size

  function applyRevealed(tiles: { i: number; adj: number }[]) {
    setAdjMap(new Map(tiles.map(t => [t.i, t.adj])))
  }

  function tapTile(i: number) {
    if (cleared || busy.current) return
    if (adjMap.has(i)) return // already open water
    if (flagMode) { doFlag(i); return }
    if (flagged.has(i)) return // flagged — unflag first
    busy.current = true
    setMessage(null)
    startTransition(async () => {
      const r = await revealCell(i)
      busy.current = false
      if ('error' in r) { setMessage(r.error); return }
      applyRevealed(r.revealed)
      setBusts(r.busts)
      setStatus(r.status)
      if (r.busted) {
        setBoom(true); setTimeout(() => setBoom(false), 450)
        setMessage('Boom — she struck a mine. The board resets; chart it again.')
        return
      }
      if (r.cleared) {
        if (r.newPuzzlePoints !== null) {
          const capBefore = denCap
          const capAfter = denDailyCap(r.newPuzzlePoints)
          setPuzzlePoints(r.newPuzzlePoints)
          setDenCap(capAfter)
          setWin({ points: r.pointsWon, capUp: capAfter > capBefore ? capAfter : null })
        } else {
          setWin({ points: r.pointsWon, capUp: null })
        }
      }
    })
  }

  function doFlag(i: number) {
    if (cleared || adjMap.has(i)) return
    // Optimistic toggle, server persists.
    setFlagged(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
    void toggleFlag(i)
  }

  const nextTier = useMemo(() => nextDenTier(puzzlePoints), [puzzlePoints])

  // Tile size derived from a fixed board width so it fits any phone.
  const boardW = `min(94vw, ${cols * 44}px)`

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
          The Minefield
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: cleared ? GOLD : '#8f8672', whiteSpace: 'nowrap' }}>
            {cleared ? 'Cleared' : `${minesLeft} mines`}
          </span>
        </div>
      </div>

      {/* Puzzle points / Den purse readout */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
        padding: '0.45rem 0.7rem', borderRadius: 10,
        background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)',
      }}>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e6d8b4' }}>{puzzlePoints} charting pts</span>
        <span style={{ color: '#6a6258' }}>·</span>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD }}>Den purse {denCap.toLocaleString()} ⟡/day</span>
        {nextTier && (
          <span className="font-karla" style={{ fontSize: '0.62rem', color: '#9a9078' }}>
            ({nextTier.points - puzzlePoints} → {nextTier.cap.toLocaleString()} ⟡)
          </span>
        )}
      </div>

      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#cfc6b0', lineHeight: 1.5, textAlign: 'center' }}>
        Reveal open water. A number is how many mines border that tile. Flag the mines, clear every safe tile. Fresh board each week — clear it for +{initial.reward} charting points.
      </p>

      {/* Board */}
      <motion.div
        animate={boom ? { x: [0, -6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.42 }}
        style={{
          width: boardW, margin: '0 auto',
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2,
          padding: 6, borderRadius: 10,
          background: 'linear-gradient(180deg, #0c2030 0%, #07151f 100%)',
          border: `1.5px solid ${boom ? '#c0392b' : 'rgba(120,170,210,0.3)'}`,
          boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
          transition: 'border-color 0.2s',
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const open = adjMap.has(i)
          const adj = open ? adjMap.get(i)! : 0
          const isFlag = flagged.has(i)
          return (
            <button
              key={i}
              onClick={() => tapTile(i)}
              disabled={cleared}
              style={{
                aspectRatio: '1 / 1', borderRadius: 4, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-cinzel), serif', fontWeight: 800,
                fontSize: 'clamp(0.7rem, 3.4vw, 1.05rem)', lineHeight: 1,
                cursor: cleared ? 'default' : 'pointer',
                border: open ? '1px solid rgba(120,170,210,0.18)' : '1px solid rgba(140,185,225,0.28)',
                background: open
                  ? (adj === 0 ? 'rgba(150,195,225,0.12)' : 'rgba(190,220,240,0.92)')
                  : 'linear-gradient(180deg, #1e4258 0%, #143245 100%)',
                color: open ? (NUM_COLOR[adj] ?? '#1c140a') : '#cfe6f5',
                boxShadow: open ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
            >
              {open ? (adj > 0 ? adj : '') : (isFlag ? '⚑' : '')}
            </button>
          )
        })}
      </motion.div>

      {/* Flag-mode toggle */}
      {!cleared && (
        <button
          onClick={() => setFlagMode(m => !m)}
          className="font-karla font-700 uppercase"
          style={{
            alignSelf: 'center', padding: '0.55rem 1.4rem', borderRadius: 999, letterSpacing: '0.08em', fontSize: '0.7rem', cursor: 'pointer',
            background: flagMode ? 'rgba(240,192,64,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${flagMode ? GOLD : 'rgba(255,255,255,0.16)'}`,
            color: flagMode ? GOLD : '#c4bba6',
          }}
        >
          {flagMode ? '⚑ Flag mode ON' : 'Tap to reveal · switch to flag'}
        </button>
      )}

      <p className="font-karla" style={{ fontSize: '0.64rem', color: message ? '#e0b48a' : '#8f8672', textAlign: 'center', minHeight: '1rem', lineHeight: 1.4 }}>
        {message ?? (cleared ? `Channel clear. Come back Monday for a fresh minefield.` : busts > 0 ? `Wrecks so far: ${busts}. The board's the same all week — learn it.` : 'A new minefield is laid every Monday.')}
      </p>

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
                  background: ['radial-gradient(ellipse 80% 60% at 50% 28%, rgba(196,169,106,0.14) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(20,40,55,0.97) 0%, rgba(8,18,26,0.98) 100%)'].join(', '),
                  border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)',
                }}
              >
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>The channel is clear.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#dccba6', lineHeight: 1.5, marginTop: 8 }}>
                  Every mine charted, every safe tile swept. Fine navigating, captain.
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
