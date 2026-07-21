'use client'

// The Minefield — a ship-themed weekly minesweeper, rebuilt mobile-first
// around native touch conventions: TAP a tile to reveal, LONG-PRESS to plant
// a flag (with a haptic), and TAP a revealed sounding whose mines are all
// flagged to "sweep" (chord) the rest around it. A segmented Reveal/Flag
// toggle backs up long-press for anyone who doesn't discover it. Pointer
// movement past a small threshold cancels the tap so the tall board still
// scrolls cleanly.
//
// Sweep a harbor of drifting sea mines: open water, read the soundings (mines
// bordering a tile), flag the mines, clear every safe tile. Strike a mine and
// she's lost — but the week's board resets and you try again. First clear of
// the week banks charting points toward the World Chart. Server-authoritative:
// the mine layout never reaches this client (you learn a mine only by busting
// on it, and a bust resets the board, so it can't be farmed for intel).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ChartingNav from '@/components/ChartingNav'
import { motion, AnimatePresence } from 'framer-motion'
import { revealCell, toggleFlag } from './minefieldActions'
import { neighborsOf } from './minefield'
import { type MinefieldState } from './minefieldConstants'
import { vibrate as haptic } from '@/lib/haptics'

const GOLD = '#f0c040'
// Soundings palette — ink tones tuned to read on the pale chart-paper tile.
const NUM_COLOR: Record<number, string> = {
  1: '#1f6fd6', 2: '#1f8a4c', 3: '#c0392b', 4: '#15357a',
  5: '#8a3b1f', 6: '#0f8a8a', 7: '#3a2a1a', 8: '#6a6258',
}

// ── Icons (SVG, never emoji) ─────────────────────────────────────────────
function FlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6.5 3v18" stroke="#d8cdb2" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.4 3.6h10.2l-2.9 3.7 2.9 3.7H7.4z" fill="#d23b34" stroke="#8c241f" strokeWidth="0.7" strokeLinejoin="round" />
    </svg>
  )
}
function MineIcon({ size = 22 }: { size?: number }) {
  // Classic spiky sea mine.
  const spikes = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {spikes.map(a => (
        <line key={a} x1="16" y1="16" x2={16 + 13 * Math.cos((a * Math.PI) / 180)} y2={16 + 13 * Math.sin((a * Math.PI) / 180)} stroke="#0c0c10" strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <circle cx="16" cy="16" r="8.5" fill="#15151c" stroke="#000" strokeWidth="1" />
      <circle cx="13" cy="13" r="2.4" fill="#5a5a68" />
    </svg>
  )
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
  const [flagMode, setFlagMode] = useState(false)
  const [boom, setBoom] = useState(false)
  const [mineAt, setMineAt] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [win, setWin] = useState<{ points: number } | null>(null)
  const [help, setHelp] = useState(false)
  const [mounted, setMounted] = useState(false)
  const busy = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  // Auto-open the how-to-play on first ever visit — minesweeper's learning
  // curve is exactly why this game was cut once; new captains get the rules
  // up front, returning ones never see it again.
  useEffect(() => {
    try {
      if (!localStorage.getItem('minefield_help_seen')) {
        setHelp(true)
        localStorage.setItem('minefield_help_seen', '1')
      }
    } catch { /* no-op */ }
  }, [])

  const cleared = status === 'cleared'
  const minesLeft = mineCount - flagged.size

  const applyRevealed = useCallback((tiles: { i: number; adj: number }[]) => {
    setAdjMap(new Map(tiles.map(t => [t.i, t.adj])))
  }, [])

  const handleWin = useCallback((points: number, newPuzzlePoints: number | null) => {
    if (newPuzzlePoints !== null) setPuzzlePoints(newPuzzlePoints)
    setWin({ points })
    haptic([0, 40, 45, 90])
  }, [])

  // One server reveal. Returns the outcome so chording can stop on bust/clear.
  const doReveal = useCallback(async (i: number): Promise<'ok' | 'bust' | 'clear' | 'skip'> => {
    if (busy.current) return 'skip'
    busy.current = true
    try {
      const r = await revealCell(i)
      if ('error' in r) { setMessage(r.error); return 'skip' }
      setBusts(r.busts)
      setStatus(r.status)
      if (r.busted) {
        // Flash the mine on the struck tile, then let the server's reset (the
        // opening region it returned) take over.
        setMineAt(i)
        setBoom(true)
        haptic([0, 30, 40, 70])
        setMessage('She struck a mine. The board resets — chart it again.')
        setTimeout(() => { setBoom(false); setMineAt(null); applyRevealed(r.revealed) }, 620)
        return 'bust'
      }
      applyRevealed(r.revealed)
      if (r.cleared) {
        handleWin(r.pointsWon, r.newPuzzlePoints)
        return 'clear'
      }
      haptic(12) // soft confirm when open water is swept
      return 'ok'
    } finally {
      busy.current = false
    }
  }, [applyRevealed, handleWin])

  const doFlag = useCallback((i: number) => {
    if (cleared || adjMap.has(i)) return
    setFlagged(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
    void toggleFlag(i)
  }, [cleared, adjMap])

  // Chord — tap a revealed sounding whose flagged neighbours match its number
  // to sweep every remaining unflagged neighbour at once (a wrong flag busts).
  const chord = useCallback(async (i: number) => {
    if (busy.current || cleared) return
    const adj = adjMap.get(i)
    if (!adj) return
    const nbs = neighborsOf(i, cols, rows)
    if (nbs.filter(n => flagged.has(n)).length !== adj) {
      setMessage('Flag all its mines first, then tap to sweep around it.')
      return
    }
    setMessage(null)
    const targets = nbs.filter(n => !flagged.has(n) && !adjMap.has(n))
    for (const t of targets) {
      const res = await doReveal(t)
      if (res === 'bust' || res === 'clear') break
    }
  }, [adjMap, flagged, cols, rows, cleared, doReveal])

  const handleTap = useCallback((i: number) => {
    if (cleared) return
    setMessage(null)
    if (adjMap.has(i)) { if ((adjMap.get(i) ?? 0) > 0) void chord(i); return }
    if (flagMode) { doFlag(i); return }
    if (flagged.has(i)) return // flagged — long-press / flag-mode to clear it
    void doReveal(i)
  }, [cleared, adjMap, flagMode, flagged, chord, doFlag, doReveal])

  // ── Touch/pointer press logic: tap vs long-press vs scroll ──────────────
  const press = useRef<{ i: number; x: number; y: number; t: ReturnType<typeof setTimeout> | null; moved: boolean; long: boolean } | null>(null)
  // Which tile is held down right now — drives the pressed-in visual.
  const [pressedIdx, setPressedIdx] = useState<number | null>(null)

  function onPointerDown(e: React.PointerEvent, i: number) {
    if (cleared) return
    setPressedIdx(i)
    haptic(7) // immediate tactile tick on press
    const t = setTimeout(() => {
      const p = press.current
      if (p && !p.moved) { p.long = true; doFlag(i); haptic([0, 14, 30, 18]) }
    }, 330)
    press.current = { i, x: e.clientX, y: e.clientY, t, moved: false, long: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = press.current
    if (!p || p.moved) return
    if (Math.abs(e.clientX - p.x) > 12 || Math.abs(e.clientY - p.y) > 12) {
      p.moved = true
      setPressedIdx(null) // started scrolling — release the press visual
      if (p.t) { clearTimeout(p.t); p.t = null }
    }
  }
  function onPointerUp(i: number) {
    const p = press.current
    press.current = null
    setPressedIdx(null)
    if (!p) return
    if (p.t) clearTimeout(p.t)
    if (p.moved || p.long) return // scrolled or already flagged via long-press
    handleTap(i)
  }
  function onPointerCancel() {
    const p = press.current
    if (p?.t) clearTimeout(p.t)
    press.current = null
    setPressedIdx(null)
  }

  // Board sized off a fixed tile target so it fits any phone but stays tappable.
  const boardW = `min(95vw, ${cols * 44}px)`

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <ChartingNav title="The Minefield" backHref="/tavern/chart-room" backLabel="Charting" points={puzzlePoints} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
        <button onClick={() => { haptic(8); setHelp(true) }} className="font-karla font-700 tap" aria-label="How to play"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.24rem 0.6rem', borderRadius: 999, background: 'rgba(196,169,106,0.12)', border: '1px solid rgba(196,169,106,0.4)', color: GOLD, cursor: 'pointer', fontSize: '0.6rem' }}>
          ? How to play
        </button>
      </div>

      {/* Instrument HUD — mines left + wrecks, styled like a ship's panel */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0.5rem', borderRadius: 12, background: 'linear-gradient(180deg, rgba(20,40,52,0.9), rgba(10,22,30,0.95))', border: '1px solid rgba(120,170,210,0.26)' }}>
          <FlagIcon size={17} />
          <span className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: cleared ? GOLD : '#dce8f2', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{cleared ? 0 : minesLeft}</span>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.1em', color: '#7d93a4' }}>mines left</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0.5rem', borderRadius: 12, background: 'linear-gradient(180deg, rgba(20,40,52,0.9), rgba(10,22,30,0.95))', border: '1px solid rgba(120,170,210,0.26)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="5" r="2.4" stroke="#b9a98a" strokeWidth="1.7" />
            <path d="M12 7.4V21M5 13a7 7 0 0 0 14 0M5 13H3m16 0h2M12 11h-3m3 0h3" stroke="#b9a98a" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#dce8f2', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{busts}</span>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.1em', color: '#7d93a4' }}>wrecks</span>
        </div>
      </div>

      {/* Charting points readout */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: '0.4rem 0.7rem', borderRadius: 10, background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)' }}>
        <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e6d8b4' }}>{puzzlePoints} charting pts</span>
      </div>

      {/* Board */}
      <motion.div
        onContextMenu={e => e.preventDefault()}
        animate={boom ? { x: [0, -7, 7, -5, 5, 0] } : {}}
        transition={{ duration: 0.45 }}
        style={{
          width: boardW, margin: '0 auto',
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4,
          padding: 7, borderRadius: 12,
          background: 'linear-gradient(180deg, #0c2030 0%, #07151f 100%)',
          border: `1.5px solid ${boom ? '#c0392b' : 'rgba(196,169,106,0.34)'}`,
          boxShadow: 'inset 0 0 22px rgba(0,0,0,0.55), 0 8px 22px rgba(0,0,0,0.5)',
          transition: 'border-color 0.2s',
          touchAction: 'pan-y',
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const open = adjMap.has(i)
          const adj = open ? adjMap.get(i)! : 0
          const isFlag = flagged.has(i)
          const isMine = mineAt === i
          const pressed = pressedIdx === i && !cleared
          // Unrevealed = a raised brass-and-steel deck plate (clearly a button).
          // Pressed = it sinks in. Revealed = recessed chart paper / open water.
          const unrevealedBg = pressed
            ? 'linear-gradient(180deg, #1b3949 0%, #102330 100%)'
            : 'linear-gradient(180deg, #3f677e 0%, #1d3a4c 55%, #16303f 100%)'
          const unrevealedShadow = pressed
            ? 'inset 0 3px 7px rgba(0,0,0,0.6)'
            : 'inset 0 2px 0 rgba(176,214,240,0.32), inset 0 -3px 6px rgba(0,0,0,0.5), 0 2px 3px rgba(0,0,0,0.45)'
          return (
            <button
              key={i}
              onPointerDown={e => onPointerDown(e, i)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(i)}
              onPointerCancel={onPointerCancel}
              disabled={cleared}
              style={{
                aspectRatio: '1 / 1', borderRadius: 6, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-cinzel), serif', fontWeight: 800,
                fontSize: 'clamp(0.72rem, 3.6vw, 1.1rem)', lineHeight: 1,
                cursor: cleared ? 'default' : 'pointer',
                WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
                border: open ? '1px solid rgba(120,170,210,0.12)' : `1px solid ${pressed ? 'rgba(120,170,210,0.3)' : 'rgba(170,212,245,0.4)'}`,
                background: isMine
                  ? 'radial-gradient(circle at 50% 50%, #ff7a59 0%, #c0392b 55%, #6a1a12 100%)'
                  : open
                    ? (adj === 0 ? 'rgba(20,52,66,0.55)' : 'linear-gradient(180deg, #efe3c4 0%, #e3d3ad 100%)')
                    : unrevealedBg,
                color: open ? (NUM_COLOR[adj] ?? '#1c140a') : '#dcefff',
                boxShadow: open
                  ? (adj === 0 ? 'inset 0 2px 6px rgba(0,0,0,0.5)' : 'inset 0 1px 0 rgba(255,255,255,0.5)')
                  : unrevealedShadow,
                transform: pressed ? 'scale(0.9)' : 'scale(1)',
                transition: 'transform 0.06s ease, box-shadow 0.06s ease, background 0.06s ease',
              }}
            >
              {isMine ? <MineIcon size={20} /> : open ? (adj > 0 ? adj : '') : isFlag ? <FlagIcon size={17} /> : ''}
            </button>
          )
        })}
      </motion.div>

      {/* Mode toggle — segmented Reveal / Flag (long-press flags in either) */}
      {!cleared && (
        <div style={{ alignSelf: 'center', display: 'inline-flex', padding: 3, borderRadius: 999, background: 'rgba(8,18,26,0.8)', border: '1px solid rgba(120,170,210,0.26)', gap: 3 }}>
          <button onClick={() => { haptic(8); setFlagMode(false) }} className="font-karla font-700 uppercase"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem', borderRadius: 999, letterSpacing: '0.06em', fontSize: '0.68rem', cursor: 'pointer', border: 'none', background: !flagMode ? 'rgba(120,170,210,0.22)' : 'transparent', color: !flagMode ? '#dce8f2' : '#7d93a4' }}>
            Reveal
          </button>
          <button onClick={() => { haptic(8); setFlagMode(true) }} className="font-karla font-700 uppercase"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem', borderRadius: 999, letterSpacing: '0.06em', fontSize: '0.68rem', cursor: 'pointer', border: 'none', background: flagMode ? `${GOLD}26` : 'transparent', color: flagMode ? GOLD : '#7d93a4' }}>
            <FlagIcon size={14} /> Flag
          </button>
        </div>
      )}

      <p className="font-karla" style={{ fontSize: '0.64rem', color: message ? '#e0b48a' : '#8f8672', textAlign: 'center', minHeight: '1.6rem', lineHeight: 1.45, padding: '0 0.5rem' }}>
        {message ?? (cleared
          ? 'Channel clear. Come back Monday for a fresh minefield.'
          : busts > 0
            ? `The board's the same all week — learn it. Long-press to flag a mine.`
            : 'Long-press a tile to flag it. A new minefield is laid every Monday.')}
      </p>

      {/* How-to-play sheet */}
      {mounted && createPortal(
        <AnimatePresence>
          {help && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHelp(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(4,8,14,0.84)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 470, background: 'linear-gradient(180deg, #16242e 0%, #0a151d 100%)', borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(196,169,106,0.34)', padding: '1.3rem 1.2rem calc(1.6rem + env(safe-area-inset-bottom))' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8', textAlign: 'center' }}>Sweeping the Minefield</p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#bcb29a', lineHeight: 1.5, textAlign: 'center', marginTop: 4 }}>
                  A harbor full of hidden sea mines. Chart a safe path through.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                  {[
                    { n: '1', t: 'Tap to reveal', d: 'Open a tile of water. Open every safe tile to clear the board.' },
                    { n: '2', t: 'Read the soundings', d: 'A number is how many mines touch that tile (the 8 around it). Use them to deduce where mines hide.' },
                    { n: '3', t: 'Long-press to flag', d: 'Hold a tile to plant a flag on a mine you have worked out. Or flip the Flag toggle and tap. The counter tracks mines left.' },
                    { n: '4', t: 'Tap a number to sweep', d: 'Once a number has all its mines flagged, tap it to clear every remaining tile around it at once.' },
                  ].map(s => (
                    <div key={s.n} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <div className="font-cinzel font-800" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${GOLD}1c`, border: `1px solid ${GOLD}66`, color: GOLD, fontSize: '0.8rem' }}>{s.n}</div>
                      <div>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#e8dcc2' }}>{s.t}</p>
                        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86', lineHeight: 1.45, marginTop: 1 }}>{s.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#cfc6b0', lineHeight: 1.5, textAlign: 'center', marginTop: 16 }}>
                  Strike a mine and the board resets — but it is the <span style={{ color: '#e8dcc2' }}>same board all week</span>, so each run you know more. First clear banks <span style={{ color: GOLD }}>+{initial.reward} charting points</span>.
                </p>
                <button onClick={() => { haptic(10); setHelp(false) }} className="font-cinzel font-700"
                  style={{ width: '100%', marginTop: 16, padding: '0.75rem', borderRadius: 12, fontSize: '0.9rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>
                  Cast off
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Win overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {win && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWin(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }} onClick={e => e.stopPropagation()}
                style={{ maxWidth: 340, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18, background: ['radial-gradient(ellipse 80% 60% at 50% 28%, rgba(196,169,106,0.16) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(20,40,55,0.97) 0%, rgba(8,18,26,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}6e`, boxShadow: `0 0 38px ${GOLD}26, inset 0 0 28px rgba(0,0,0,0.5)` }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>The channel is clear.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#dccba6', lineHeight: 1.5, marginTop: 8 }}>
                  Every mine charted, every safe tile swept. Fine navigating, captain.
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#7bbf7b', marginTop: 14 }}>+{win.points} charting points</p>
                <button onClick={() => setWin(null)} className="font-karla font-700 uppercase"
                  style={{ marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>
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
