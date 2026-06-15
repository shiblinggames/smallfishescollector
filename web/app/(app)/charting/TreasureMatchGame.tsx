'use client'

// Treasure Match — a ship-themed Match-3. Swap two adjacent treasures
// (drag OR tap) to line up 3+; they pop, everything drops, cascades chain
// with combo callouts + particle bursts. Reach the target score within
// the move limit to win. One seeded board a week (shared puzzle); first
// clear banks charting points. Engine runs client-side; the server awards
// the points on a claimed win.

import { useMemo, useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { submitMatch } from './actions'
import { makeRng, initialBoard, resolveSwap, hasValidMove, reshuffle, areAdjacent } from './treasureMatch'
import { MATCH_TOKENS, type MatchState } from './constants'
import { denDailyCap, nextDenTier } from '@/app/(app)/tavern/constants'

const GOLD = '#f0c040'
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
function haptic(p: number | number[]) { try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p) } catch { /* no-op */ } }

interface Particle { id: number; x: number; y: number; dx: number; dy: number; color: string }

export default function TreasureMatchGame({ initial }: { initial: MatchState }) {
  const { cols, rows, types, target, seed } = initial
  const total = cols * rows

  const rngRef = useRef(makeRng(seed))
  const [board, setBoard] = useState<number[]>(() => initialBoard(rngRef.current, cols, rows, types))
  const [score, setScore] = useState(0)
  const [movesLeft, setMovesLeft] = useState(initial.moves)
  const [selected, setSelected] = useState<number | null>(null)
  const [popping, setPopping] = useState<Set<number>>(new Set())
  const [invalid, setInvalid] = useState<[number, number] | null>(null)
  const [committed, setCommitted] = useState<[number, number] | null>(null)
  const [status, setStatus] = useState<'active' | 'cleared'>(initial.status)
  const [lost, setLost] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [denCap, setDenCap] = useState(initial.denCap)
  const [win, setWin] = useState<{ points: number; capUp: number | null } | null>(null)
  const [mounted, setMounted] = useState(false)
  // Juice
  const [particles, setParticles] = useState<Particle[]>([])
  const [combo, setCombo] = useState<{ level: number; key: number } | null>(null)
  const [scoreFloat, setScoreFloat] = useState<{ amount: number; key: number } | null>(null)
  const [scorePulse, setScorePulse] = useState(0)
  const pid = useRef(0)

  const boardRef = useRef(board); useEffect(() => { boardRef.current = board }, [board])
  const scoreRef = useRef(score); useEffect(() => { scoreRef.current = score }, [score])
  const movesRef = useRef(movesLeft); useEffect(() => { movesRef.current = movesLeft }, [movesLeft])
  const busyRef = useRef(false)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ cell: number; sx: number; sy: number; moved: boolean } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const nextTier = useMemo(() => nextDenTier(puzzlePoints), [puzzlePoints])
  const cleared = status === 'cleared'
  const progress = Math.min(1, score / target)
  const lowMoves = movesLeft <= 5

  // ── Juice helpers ──────────────────────────────────────────────────
  function cellCenter(i: number): { x: number; y: number } | null {
    const el = gridRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const cw = rect.width / cols, ch = rect.height / rows
    const r = Math.floor(i / cols), c = i % cols
    return { x: rect.left + (c + 0.5) * cw, y: rect.top + (r + 0.5) * ch }
  }
  function spawnBurst(cells: number[]) {
    const out: Particle[] = []
    const sample = cells.length > 8 ? cells.filter((_, k) => k % 2 === 0) : cells
    for (const i of sample) {
      const ctr = cellCenter(i)
      if (!ctr) continue
      const color = (MATCH_TOKENS[boardRef.current[i]] ?? MATCH_TOKENS[0]).color
      const n = 3
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + Math.random()
        const dist = 26 + Math.random() * 30
        out.push({ id: pid.current++, x: ctr.x, y: ctr.y, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 12, color })
      }
    }
    setParticles(out)
  }

  function resetBoard() {
    rngRef.current = makeRng(seed)
    const nb = initialBoard(rngRef.current, cols, rows, types)
    boardRef.current = nb; setBoard(nb)
    scoreRef.current = 0; setScore(0)
    movesRef.current = initial.moves; setMovesLeft(initial.moves)
    setSelected(null); setPopping(new Set()); setCommitted(null); setLost(false); setMessage(null); setParticles([])
  }

  async function finishWin(finalScore: number) {
    setStatus('cleared')
    const r = await submitMatch(finalScore, true)
    if ('error' in r) return
    if (r.pointsWon > 0 && r.newPuzzlePoints !== null) {
      setPuzzlePoints(r.newPuzzlePoints)
      setDenCap(denDailyCap(r.newPuzzlePoints))
      setWin({ points: r.pointsWon, capUp: r.capAfter > r.capBefore ? r.capAfter : null })
    } else {
      setWin({ points: 0, capUp: null })
    }
  }

  async function attemptSwap(a: number, b: number) {
    if (busyRef.current) return
    const cur = boardRef.current
    const res = resolveSwap(cur, a, b, cols, rows, types, rngRef.current)
    setSelected(null)
    if (!res) { setInvalid([a, b]); haptic(10); await wait(230); setInvalid(null); return }

    busyRef.current = true
    const newMoves = movesRef.current - 1
    movesRef.current = newMoves; setMovesLeft(newMoves)

    // Lock-in: the two committed tiles snap together with a white ring + thunk
    // haptic so the move reads as *committed* before anything pops.
    setCommitted([a, b]); haptic(22)
    boardRef.current = res.swapped; setBoard(res.swapped)
    await wait(210)
    setCommitted(null)
    await wait(70)

    let localScore = scoreRef.current
    for (let s = 0; s < res.steps.length; s++) {
      const step = res.steps[s]
      const cascade = s + 1
      setPopping(new Set(step.cleared))
      spawnBurst(step.cleared)
      if (cascade >= 2) { setCombo({ level: cascade, key: pid.current++ }); haptic([0, 18, 50, 18 + cascade * 6]) }
      else haptic(step.cleared.length >= 5 ? 22 : 12)
      setScoreFloat({ amount: step.gained, key: pid.current++ })
      // Dopamine delay: each successive cascade holds longer so the chain
      // builds weight instead of machine-gunning by. Big clears linger too.
      const big = step.cleared.length >= 5 ? 70 : 0
      await wait(300 + (cascade - 1) * 110 + big)
      setPopping(new Set())
      boardRef.current = step.resultBoard; setBoard(step.resultBoard)
      localScore += step.gained; scoreRef.current = localScore; setScore(localScore)
      setScorePulse(p => p + 1)
      // settle beat before the next link in the chain
      await wait(170 + (cascade - 1) * 70)
    }
    setParticles([])
    busyRef.current = false
    if (localScore >= target) { haptic([12, 40, 12, 40, 30]); await finishWin(localScore); return }
    if (newMoves <= 0) { setLost(true); return }
    if (!hasValidMove(boardRef.current, cols, rows)) {
      const nb = reshuffle(rngRef.current, cols, rows, types)
      boardRef.current = nb; setBoard(nb); setMessage('No matches left — board reshuffled (free).')
    }
  }

  function tapCell(i: number) {
    if (selected === null) { setSelected(i); setMessage(null); return }
    if (selected === i) { setSelected(null); return }
    if (areAdjacent(selected, i, cols)) { void attemptSwap(selected, i) }
    else { setSelected(i) }
  }

  function cellFromPoint(clientX: number, clientY: number): number | null {
    const el = gridRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left, y = clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
    const c = Math.min(cols - 1, Math.max(0, Math.floor((x / rect.width) * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor((y / rect.height) * rows)))
    return r * cols + c
  }
  function neighborOf(cell: number, dir: 'L' | 'R' | 'U' | 'D'): number | null {
    const r = Math.floor(cell / cols), c = cell % cols
    if (dir === 'L') return c > 0 ? cell - 1 : null
    if (dir === 'R') return c < cols - 1 ? cell + 1 : null
    if (dir === 'U') return r > 0 ? cell - cols : null
    return r < rows - 1 ? cell + cols : null
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busyRef.current || lost) return
    const cell = cellFromPoint(e.clientX, e.clientY)
    if (cell === null) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { cell, sx: e.clientX, sy: e.clientY, moved: false }
    setSelected(cell)
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d || d.moved || busyRef.current) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    const rect = gridRef.current?.getBoundingClientRect()
    const thresh = rect ? (rect.width / cols) * 0.4 : 16
    if (Math.hypot(dx, dy) < thresh) return
    d.moved = true
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')
    const target = neighborOf(d.cell, dir)
    setSelected(null)
    if (target !== null) void attemptSwap(d.cell, target)
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (!d.moved) tapCell(d.cell)
  }

  const boardW = `min(96vw, 460px)`

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern/chart-room" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Chart Room
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8', textAlign: 'center', whiteSpace: 'nowrap' }}>Treasure Match</p>
        <div style={{ flex: 1, minWidth: 0 }} />
      </div>

      {/* Bold HUD — Moves + Score */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
        <div style={{ padding: '0.5rem 0.7rem', borderRadius: 12, textAlign: 'center', background: lowMoves ? 'rgba(192,57,43,0.16)' : 'rgba(196,169,106,0.1)', border: `1.5px solid ${lowMoves ? '#c0392b' : 'rgba(196,169,106,0.3)'}` }}>
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.56rem', color: lowMoves ? '#f0a0a0' : '#a89878' }}>Moves</p>
          <motion.p key={`mv-${movesLeft}`} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="font-cinzel font-700" style={{ fontSize: '2rem', lineHeight: 1, color: lowMoves ? '#f08a8a' : '#f4ecd8' }}>{movesLeft}</motion.p>
        </div>
        <div style={{ padding: '0.5rem 0.8rem', borderRadius: 12, position: 'relative', background: 'rgba(196,169,106,0.1)', border: '1.5px solid rgba(196,169,106,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.56rem', color: '#a89878' }}>Score</span>
            <span className="font-karla" style={{ fontSize: '0.62rem', color: '#8f8672' }}>/ {target.toLocaleString()}</span>
          </div>
          <motion.p key={`sc-${scorePulse}`} animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 0.4, times: [0, 0.35, 1] }}
            className="font-cinzel font-700" style={{ fontSize: '2rem', lineHeight: 1, color: score >= target ? '#7bf0b0' : GOLD, transformOrigin: 'left center' }}>{score.toLocaleString()}</motion.p>
          <div style={{ marginTop: 5, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 3, background: progress >= 1 ? 'linear-gradient(90deg,#3fae78,#7bf0b0)' : `linear-gradient(90deg,#c4a96a,${GOLD})`, transition: 'width 0.3s' }} />
          </div>
          {/* score float */}
          <AnimatePresence>
            {scoreFloat && (
              <motion.span key={scoreFloat.key} initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: -16, scale: 1.1 }} exit={{ opacity: 0, y: -26 }} transition={{ duration: 0.6 }}
                onAnimationComplete={() => setScoreFloat(f => (f && f.key === scoreFloat.key ? null : f))}
                className="font-cinzel font-700" style={{ position: 'absolute', right: 12, top: 6, fontSize: '1rem', color: '#7bf0b0', textShadow: '0 1px 4px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
                +{scoreFloat.amount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.68rem', color: '#bcb29a', lineHeight: 1.4, textAlign: 'center' }}>
        Drag or tap to swap neighbors. Line up 3+ to clear. Reach {target.toLocaleString()} for +{initial.reward} charting points.
      </p>

      {/* Board */}
      <div
        ref={gridRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null }}
        style={{
          position: 'relative', width: boardW, aspectRatio: `${cols} / ${rows}`, margin: '0 auto', touchAction: 'none',
          display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4,
          padding: 7, borderRadius: 14,
          background: 'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(120,90,40,0.22) 0%, transparent 60%), linear-gradient(180deg, #1c140a 0%, #0e0a05 100%)',
          border: '2px solid rgba(196,169,106,0.34)', boxShadow: '0 8px 22px rgba(0,0,0,0.5), inset 0 0 22px rgba(0,0,0,0.4)',
        }}
      >
        {board.map((t, i) => {
          const tok = MATCH_TOKENS[t] ?? MATCH_TOKENS[0]
          const isSel = selected === i
          const isPop = popping.has(i)
          const isCommit = committed !== null && (committed[0] === i || committed[1] === i)
          const isInvalid = invalid && (invalid[0] === i || invalid[1] === i)
          return (
            <div
              key={i}
              style={{
                pointerEvents: 'none',
                aspectRatio: '1 / 1', borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'clamp(1.3rem, 7vw, 2rem)', lineHeight: 1,
                background: isInvalid ? 'rgba(192,57,43,0.55)' : isCommit ? `${tok.color}55` : `${tok.color}33`,
                border: `2px solid ${isCommit || isSel ? '#fff' : isInvalid ? '#c0392b' : `${tok.color}88`}`,
                boxShadow: isCommit
                  ? `0 0 18px #fff, 0 0 30px ${tok.color}, inset 0 0 14px ${tok.color}77`
                  : isSel ? `0 0 14px ${tok.color}, inset 0 0 10px ${tok.color}55` : `inset 0 1px 3px rgba(255,255,255,0.12)`,
                transform: isCommit ? 'scale(1.16)' : isSel ? 'scale(1.08)' : 'scale(1)',
                zIndex: isCommit ? 2 : undefined,
                transition: 'transform 0.13s cubic-bezier(.34,1.56,.64,1), background 0.12s, border-color 0.12s, box-shadow 0.12s',
                animation: isPop ? 'tmPop 0.26s ease forwards' : undefined,
              }}
            >
              <span aria-hidden style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>{tok.emoji}</span>
            </div>
          )
        })}

        {/* Combo callout — centered over the board */}
        <AnimatePresence>
          {combo && (
            <motion.div key={combo.key}
              initial={{ opacity: 0, scale: 0.3, rotate: -10 }}
              animate={{ opacity: [0, 1, 1, 1], scale: [0.3, 1.25, 1.05, 1.12], rotate: [-10, 2, 0, 0] }}
              exit={{ opacity: 0, scale: 1.5, y: -14 }}
              transition={{ duration: 0.62, times: [0, 0.32, 0.55, 1], ease: 'easeOut' }}
              onAnimationComplete={() => setTimeout(() => setCombo(c => (c && c.key === combo.key ? null : c)), 480)}
              style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <span className="font-cinzel font-700" style={{ fontSize: `clamp(1.7rem, ${9 + combo.level}vw, 3rem)`, color: '#fff', textShadow: `0 0 18px ${GOLD}, 0 0 34px ${GOLD}, 0 2px 6px rgba(0,0,0,0.85)`, letterSpacing: '0.03em', lineHeight: 1 }}>
                COMBO ×{combo.level}
              </span>
              {combo.level >= 3 && (
                <span className="font-karla font-700 uppercase" style={{ marginTop: 4, fontSize: 'clamp(0.6rem, 3vw, 0.85rem)', letterSpacing: '0.22em', color: GOLD, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                  {combo.level >= 5 ? 'Plundered!' : 'Chain!'}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#8f8672', textAlign: 'center' }}>
        {cleared ? 'Cleared this week — fresh board Monday.' : message ?? `${puzzlePoints} charting pts · Den purse ${denCap.toLocaleString()} ⟡/day${nextTier ? ` · ${nextTier.points - puzzlePoints} to ${nextTier.cap.toLocaleString()}` : ''}`}
      </p>

      {/* Particle bursts (portal, viewport coords) */}
      {mounted && createPortal(
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 8500, pointerEvents: 'none' }}>
          <AnimatePresence>
            {particles.map(p => (
              <motion.div key={p.id}
                initial={{ x: p.x, y: p.y, opacity: 1, scale: 1 }}
                animate={{ x: p.x + p.dx, y: p.y + p.dy, opacity: 0, scale: 0.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                style={{ position: 'absolute', left: -5, top: -5, width: 10, height: 10, borderRadius: '50%', background: p.color, boxShadow: `0 0 8px ${p.color}` }}
              />
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}

      {/* Out-of-moves overlay */}
      {mounted && createPortal(
        <AnimatePresence>
          {lost && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                style={{ maxWidth: 320, width: '100%', textAlign: 'center', padding: '1.5rem 1.3rem', borderRadius: 18, background: 'linear-gradient(180deg, rgba(40,30,14,0.96) 0%, rgba(20,14,7,0.98) 100%)', border: '1px solid rgba(196,169,106,0.4)' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#e0b48a' }}>Out of moves</p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#cfc6b0', marginTop: 8, lineHeight: 1.5 }}>You hauled {score.toLocaleString()} of {target.toLocaleString()}. Same board, fresh moves — give it another run.</p>
                <button onClick={resetBoard} className="font-cinzel font-700" style={{ marginTop: 16, padding: '0.6rem 1.6rem', borderRadius: 10, fontSize: '0.84rem', background: 'rgba(240,192,64,0.18)', border: `1px solid ${GOLD}88`, color: '#f4ecd8', cursor: 'pointer' }}>Try Again</button>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWin(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }} onClick={e => e.stopPropagation()}
                style={{ maxWidth: 340, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18, background: ['radial-gradient(ellipse 80% 60% at 50% 28%, rgba(196,169,106,0.14) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.96) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>Haul secured.</p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#dccba6', lineHeight: 1.5, marginTop: 8 }}>{score.toLocaleString()} aboard — target smashed. Fine work, captain.</p>
                {win.points > 0
                  ? <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#7bbf7b', marginTop: 14 }}>+{win.points} charting points</p>
                  : <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a9078', marginTop: 14 }}>Already banked this week — fresh board Monday.</p>}
                {win.capUp !== null && (
                  <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 300 }} className="font-cinzel font-700" style={{ marginTop: 12, padding: '0.5rem 0.7rem', borderRadius: 10, fontSize: '0.78rem', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55` }}>
                    Den purse raised to {win.capUp.toLocaleString()} ⟡/day!
                  </motion.p>
                )}
                <button onClick={() => setWin(null)} className="font-karla font-700 uppercase" style={{ marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>
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
