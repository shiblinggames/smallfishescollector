'use client'

// Treasure Match — a ship-themed Match-3. Swap two adjacent treasures
// (drag OR tap) to line up 3+; they pop, everything drops, cascades chain
// with combo callouts + particle bursts. Your BEST score across the week
// maps to a tier of charting points (1-5); a bigger haul climbs the ladder.
// One seeded board a week (shared puzzle), unlimited retries. Engine runs
// client-side; the server tiers the score + banks the delta authoritatively.

import { memo, useRef, useState, useEffect, type CSSProperties } from 'react'
import { vibrate as haptic } from '@/lib/haptics'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { submitMatch } from './actions'
import { makeRng, initialBoard, resolveSwap, hasValidMove, reshuffle, areAdjacent, WILD } from './treasureMatch'
import { MATCH_TOKENS, MATCH_TIERS, MATCH_MAX_POINTS, WILD_DROP_CHANCE, pointsForScore, nextMatchTier, type MatchState } from './constants'
import ChartingNav from '@/components/ChartingNav'

const GOLD = '#f0c040'
const GREEN = '#7bf0b0'
// The main way to earn a Compass is now a 4-of-a-kind match (handled in the
// engine). This is just a small extra chance a freshly-dropped tile is a
// Compass — a touch of luck on top, kept low so wilds don't flood the board.
const WILD_RAINBOW = 'conic-gradient(from 210deg at 50% 50%, #ff7e1c, #ffd028, #0fd886, #2aa4ff, #bb55ff, #ff4631, #ff7e1c)'
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

interface Particle { id: number; x: number; y: number; dx: number; dy: number; color: string; size: number }
interface RunResult { score: number; best: number; tier: number; pointsWon: number; maxed: boolean }

// One board cell, memoized so a cascade tick only re-renders the handful of
// tiles whose state actually changed. Each normal tile is now a SINGLE baked
// gem <img> (shading/facets/bevel are in the pixels) — no runtime gradients,
// clip-paths, or stacked drop-shadow filters, which is what used to make the
// board lag on every cascade. Only the transient state adds a lightweight glow.
type Tok = typeof MATCH_TOKENS[number]
const Tile = memo(function Tile({ tok, isWild, isSel, isPop, isDrop, isCommit, isInvalid, fall }: {
  tok: Tok; isWild: boolean; isSel: boolean; isPop: boolean; isDrop: boolean; isCommit: boolean; isInvalid: boolean; fall: number
}) {
  // Single glow, applied only when the tile is in a transient state (the resting
  // state carries no filter at all, so 40+ idle tiles cost nothing to paint).
  const glow = isCommit
    ? `drop-shadow(0 0 7px #fff) drop-shadow(0 0 13px ${tok.color}) brightness(1.12)`
    : isSel ? `drop-shadow(0 0 8px ${tok.color}) brightness(1.08)`
    : isInvalid ? `drop-shadow(0 0 7px #d6392a) brightness(1.05)`
    : undefined
  return (
    <div style={{
      pointerEvents: 'none', position: 'relative', aspectRatio: '1 / 1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: isCommit ? 'scale(1.16)' : isSel ? 'scale(1.08)' : 'scale(1)',
      zIndex: isCommit ? 2 : undefined,
      transition: 'transform 0.13s cubic-bezier(.34,1.56,.64,1)',
      // `--tmf` = how many cells this tile actually fell, so tmSlide starts it
      // at the right height.
      ['--tmf' as string]: isDrop ? String(fall) : undefined,
      animation: isPop ? 'tmPop 0.19s ease forwards'
        : isDrop ? 'tmSlide 0.2s cubic-bezier(.2,.7,.4,1)'
        : undefined,
    } as CSSProperties}>
      {isWild ? (
        // Wild = a calm prismatic gem, rounded and STATIC (no pulse, no glow) —
        // it's a plain wildcard now, so it shouldn't shout over the board.
        <div aria-hidden style={{
          position: 'absolute', inset: '6%', borderRadius: '24%',
          background: WILD_RAINBOW, opacity: 0.92,
          boxShadow: 'inset 0 0 0 2px rgba(240,192,64,0.6), inset 0 -3px 7px rgba(0,0,0,0.35)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '24%',
            background: 'radial-gradient(circle at 32% 24%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.1) 26%, transparent 50%)',
          }} />
        </div>
      ) : (
        <img src={tok.img} alt="" draggable={false} style={{
          width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', filter: glow,
        }} />
      )}
    </div>
  )
})

// Per-result-cell fall distance (in cell-heights) for a clear, so each tile
// slides from where it actually was. Survivors fall by the cleared cells below
// them; new tiles drop in from above by the column's cleared count.
function computeFall(cleared: Set<number>, cols: number, rows: number): number[] {
  const fall = new Array(cols * rows).fill(0)
  for (let c = 0; c < cols; c++) {
    let numNew = 0
    for (let r = 0; r < rows; r++) if (cleared.has(r * cols + c)) numNew++
    if (numNew === 0) continue
    const survivors: number[] = []
    for (let r = rows - 1; r >= 0; r--) if (!cleared.has(r * cols + c)) survivors.push(r)
    for (let j = 0; j < survivors.length; j++) {
      const resultRow = rows - 1 - j
      fall[resultRow * cols + c] = resultRow - survivors[j]
    }
    for (let k = 0; k < numNew; k++) fall[k * cols + c] = numNew
  }
  return fall
}

export default function TreasureMatchGame({ initial }: { initial: MatchState }) {
  const { cols, rows, types, target, seed } = initial

  const rngRef = useRef(makeRng(seed))
  // THE MOVE LOG. The server replays this against the same seed and derives the
  // score itself, so the number on screen is never what gets submitted -- which
  // is the whole point: a score held in memory can be edited, a sequence of
  // swaps that has to actually resolve into matches cannot be faked without
  // solving the puzzle.
  const movesLogRef = useRef<[number, number][]>([])
  const [board, setBoard] = useState<number[]>(() => initialBoard(rngRef.current, cols, rows, types))
  const [score, setScore] = useState(0)
  const [movesLeft, setMovesLeft] = useState(initial.moves)
  const [selected, setSelected] = useState<number | null>(null)
  const [popping, setPopping] = useState<Set<number>>(new Set())
  const [invalid, setInvalid] = useState<[number, number] | null>(null)
  const [committed, setCommitted] = useState<[number, number] | null>(null)
  const [status, setStatus] = useState<'active' | 'cleared'>(initial.status)
  const [bestScore, setBestScore] = useState(initial.bestScore)
  const [banked, setBanked] = useState(initial.pointsAwarded)
  const [message, setMessage] = useState<string | null>(null)
  const [puzzlePoints, setPuzzlePoints] = useState(initial.puzzlePoints)
  const [result, setResult] = useState<RunResult | null>(null)
  const [mounted, setMounted] = useState(false)
  // Juice
  const [particles, setParticles] = useState<Particle[]>([])
  const [combo, setCombo] = useState<{ level: number; key: number } | null>(null)
  const [tierUp, setTierUp] = useState<{ points: number; key: number } | null>(null)
  const [dropping, setDropping] = useState<Set<number>>(new Set())
  const [dropFall, setDropFall] = useState<number[]>([])
  const [flash, setFlash] = useState<{ key: number; intensity: number } | null>(null)
  const [scoreFloat, setScoreFloat] = useState<{ amount: number; key: number } | null>(null)
  const [scorePulse, setScorePulse] = useState(0)
  const pid = useRef(0)

  const boardRef = useRef(board); useEffect(() => { boardRef.current = board }, [board])
  const scoreRef = useRef(score); useEffect(() => { scoreRef.current = score }, [score])
  const movesRef = useRef(movesLeft); useEffect(() => { movesRef.current = movesLeft }, [movesLeft])
  const bestRef = useRef(bestScore); useEffect(() => { bestRef.current = bestScore }, [bestScore])
  // Highest tier we've already celebrated this week — starts at what's banked
  // so retries don't re-celebrate points the player already holds.
  const shownTierRef = useRef(initial.pointsAwarded)
  const busyRef = useRef(false)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ cell: number; sx: number; sy: number; moved: boolean } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const cleared = status === 'cleared'
  const displayBest = Math.max(score, bestScore)
  const liveTier = pointsForScore(score)
  const nextT = nextMatchTier(score)
  const curTierScore = liveTier > 0 ? MATCH_TIERS[liveTier - 1].score : 0
  const nextScore = nextT ? nextT.score : target
  const segProgress = nextT ? Math.min(1, (score - curTierScore) / (nextScore - curTierScore)) : 1
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
    const sample = cells.length > 10 ? cells.filter((_, k) => k % 2 === 0) : cells
    for (const i of sample) {
      const ctr = cellCenter(i)
      if (!ctr) continue
      const color = (MATCH_TOKENS[boardRef.current[i]] ?? MATCH_TOKENS[0]).color
      const n = 3
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + Math.random() * 0.9
        const dist = 36 + Math.random() * 52
        // Alternate bright white sparks with bigger colored shards; an upward
        // bias so the burst arcs up before gravity (in the render) drops it.
        const spark = k % 2 === 0
        out.push({
          id: pid.current++, x: ctr.x, y: ctr.y,
          dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 22,
          color: spark ? '#ffffff' : color,
          size: spark ? 5 + Math.random() * 4 : 9 + Math.random() * 7,
        })
      }
    }
    setParticles(out)
  }

  function resetBoard() {
    rngRef.current = makeRng(seed)
    movesLogRef.current = []
    const nb = initialBoard(rngRef.current, cols, rows, types)
    boardRef.current = nb; setBoard(nb)
    scoreRef.current = 0; setScore(0)
    movesRef.current = initial.moves; setMovesLeft(initial.moves)
    shownTierRef.current = banked
    setSelected(null); setPopping(new Set()); setCommitted(null); setDropping(new Set()); setDropFall([])
    setCombo(null); setTierUp(null); setFlash(null); setResult(null); setMessage(null); setParticles([])
  }

  // Run ended (out of moves, or hit the top tier). Server tiers the best
  // score and banks the delta; we surface the result overlay.
  async function endRun(finalScore: number, perfect: boolean) {
    const r = await submitMatch(movesLogRef.current)
    if ('error' in r) {
      setResult({ score: finalScore, best: Math.max(finalScore, bestRef.current), tier: pointsForScore(Math.max(finalScore, bestRef.current)), pointsWon: 0, maxed: perfect })
      return
    }
    setBestScore(r.bestScore); bestRef.current = r.bestScore
    setBanked(r.tier); shownTierRef.current = Math.max(shownTierRef.current, r.tier)
    if (r.newPuzzlePoints !== null) setPuzzlePoints(r.newPuzzlePoints)
    if (r.maxed) setStatus('cleared')
    setResult({ score: finalScore, best: r.bestScore, tier: r.tier, pointsWon: r.pointsWon, maxed: r.maxed })
  }

  async function attemptSwap(a: number, b: number) {
    if (busyRef.current) return
    const cur = boardRef.current
    const usedWild = cur[a] === WILD || cur[b] === WILD
    const res = resolveSwap(cur, a, b, cols, rows, types, rngRef.current, WILD_DROP_CHANCE)
    setSelected(null)
    if (!res) { setInvalid([a, b]); haptic(10); await wait(230); setInvalid(null); return }

    busyRef.current = true
    // Logged only once the swap RESOLVES. An invalid swap returns above without
    // consuming a move or touching the RNG, so logging it would desync replay.
    movesLogRef.current.push([a, b])
    setCombo(null); setTierUp(null) // reset last move's callouts so this move restarts clean
    if (usedWild) haptic([0, 20, 30, 24]) // a soft flourish for playing the wildcard
    const newMoves = movesRef.current - 1
    movesRef.current = newMoves; setMovesLeft(newMoves)

    // Lock-in: the two committed tiles snap together with a white ring + thunk
    // haptic so the move reads as *committed* before anything pops.
    setCommitted([a, b]); haptic(22)
    boardRef.current = res.swapped; setBoard(res.swapped)
    await wait(95)
    setCommitted(null)
    await wait(25)

    let localScore = scoreRef.current
    for (let s = 0; s < res.steps.length; s++) {
      const step = res.steps[s]
      const cascade = s + 1
      // 1) charge + pop the matched tiles (bright flash, particle burst,
      //    a board-wide light pulse that brightens with the combo).
      setPopping(new Set(step.cleared))
      spawnBurst(step.cleared)
      setFlash({ key: pid.current++, intensity: Math.min(1, 0.4 + (cascade - 1) * 0.25 + (step.cleared.length >= 5 ? 0.2 : 0)) })
      if (cascade >= 2) { setCombo({ level: cascade, key: pid.current++ }); haptic([0, 18, 50, 18 + cascade * 6]) }
      else haptic(step.cleared.length >= 5 ? 22 : 12)
      setScoreFloat({ amount: step.gained, key: pid.current++ })
      // Hold for the pop, with a SMALL, CAPPED per-cascade lengthening so a
      // chain has a touch more weight without the old 4-second deep-chain drag.
      const big = step.cleared.length >= 5 ? 40 : 0
      await wait(160 + Math.min(cascade - 1, 3) * 20 + big)
      // 2) swap in the settled board; changed tiles slide down from their real
      //    fall height (tmSlide + per-tile --tmf).
      const before = boardRef.current
      setPopping(new Set())
      const fell = new Set<number>()
      for (let i = 0; i < step.resultBoard.length; i++) if (before[i] !== step.resultBoard[i]) fell.add(i)
      boardRef.current = step.resultBoard; setBoard(step.resultBoard)
      setDropFall(computeFall(new Set(step.cleared), cols, rows))
      setDropping(fell)
      localScore += step.gained; scoreRef.current = localScore; setScore(localScore)
      setScorePulse(p => p + 1)
      // settle beat — long enough for the slide (0.2s) to land, capped growth.
      await wait(205 + Math.min(cascade - 1, 3) * 12)
      setDropping(new Set())
    }
    setFlash(null); setParticles([]) // combo clears on the next move so its burst can finish
    busyRef.current = false

    const willEnd = localScore >= target || newMoves <= 0
    // Live tier-up: crossing a NEW tier (above what's banked) mid-run earns a
    // celebration. Skipped when the run is ending — the result overlay owns it.
    const liveT = pointsForScore(localScore)
    if (liveT > shownTierRef.current && !willEnd) {
      shownTierRef.current = liveT
      setCombo(null)
      setTierUp({ points: liveT, key: pid.current++ })
      haptic([0, 30, 40, 30])
    }

    if (localScore >= target) { haptic([12, 40, 12, 40, 30]); await endRun(localScore, true); return }
    if (newMoves <= 0) { await endRun(localScore, false); return }
    if (!hasValidMove(boardRef.current, cols, rows)) {
      const nb = reshuffle(rngRef.current, cols, rows, types)
      boardRef.current = nb; setBoard(nb); setMessage('No matches left — board reshuffled (free).')
    }
  }

  // Tap-tap swap (the safe path beside drag): first tap selects with a tick,
  // tap an adjacent tile to swap, tap elsewhere to move the selection.
  function tapCell(i: number) {
    if (selected === null) { haptic(6); setSelected(i); setMessage(null); return }
    if (selected === i) { setSelected(null); return }
    if (areAdjacent(selected, i, cols)) { void attemptSwap(selected, i) }
    else { haptic(6); setSelected(i) }
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
    if (busyRef.current || result !== null) return
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
    const tgt = neighborOf(d.cell, dir)
    setSelected(null)
    if (tgt !== null) void attemptSwap(d.cell, tgt)
  }
  function onPointerUp() {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (!d.moved) tapCell(d.cell)
  }

  const boardW = `min(96vw, 460px)`

  // Tier ladder — 5 pips, lit when the best score clears each threshold.
  function TierLadder({ compact = false }: { compact?: boolean }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${MATCH_TIERS.length}, 1fr)`, gap: compact ? 4 : 5 }}>
        {MATCH_TIERS.map(t => {
          const lit = displayBest >= t.score
          const isNext = !lit && nextScore === t.score
          return (
            <div key={t.points} style={{
              textAlign: 'center', borderRadius: 9, padding: compact ? '0.3rem 0.1rem' : '0.38rem 0.1rem',
              // Opaque panels so the tiers stay legible over the page's background art.
              background: lit ? `linear-gradient(180deg, ${GOLD}5e 0%, rgba(38,28,10,0.95) 100%)` : isNext ? 'rgba(58,46,20,0.95)' : 'rgba(16,12,7,0.92)',
              border: `1.5px solid ${lit ? `${GOLD}c0` : isNext ? `${GOLD}66` : 'rgba(196,169,106,0.22)'}`,
              boxShadow: lit ? `0 0 10px ${GOLD}40` : 'none',
              transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
            }}>
              <p className="font-cinzel font-700" style={{ fontSize: compact ? '0.78rem' : '0.9rem', lineHeight: 1, color: lit ? GOLD : isNext ? '#e6d6a6' : '#9a9078' }}>
                {t.points}<span style={{ fontSize: '0.6em', opacity: 0.75 }}>/5</span>
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.56rem', marginTop: 3, color: lit ? `${GOLD}dd` : isNext ? '#c2b288' : '#938a76', letterSpacing: '0.01em' }}>
                {t.score.toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <ChartingNav title="Treasure Match" backHref="/tavern/chart-room" backLabel="Charting" points={puzzlePoints} />

      {/* Bold HUD — Moves + Score. Solid dark panels so the readout stays
          legible over the painted background. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
        <div style={{ padding: '0.5rem 0.7rem', borderRadius: 12, textAlign: 'center', background: lowMoves ? 'linear-gradient(180deg, rgba(120,36,28,0.92), rgba(70,18,14,0.95))' : 'linear-gradient(180deg, rgba(40,32,16,0.94), rgba(17,13,7,0.96))', border: `1.5px solid ${lowMoves ? '#d6584a' : 'rgba(196,169,106,0.55)'}`, boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: lowMoves ? '#f4b6b6' : '#cdbf9e' }}>Moves</p>
          <motion.p key={`mv-${movesLeft}`} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="font-cinzel font-700" style={{ fontSize: '2rem', lineHeight: 1, color: lowMoves ? '#ff9e9e' : '#fbf3df' }}>{movesLeft}</motion.p>
        </div>
        <div style={{ padding: '0.5rem 0.8rem', borderRadius: 12, position: 'relative', background: 'linear-gradient(180deg, rgba(40,32,16,0.94), rgba(17,13,7,0.96))', border: '1.5px solid rgba(196,169,106,0.55)', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: '#cdbf9e' }}>Score</span>
            <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: liveTier > 0 ? GREEN : '#b1a886' }}>{liveTier}/5 earning</span>
          </div>
          <motion.p key={`sc-${scorePulse}`} animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 0.4, times: [0, 0.35, 1] }}
            className="font-cinzel font-700" style={{ fontSize: '2rem', lineHeight: 1, color: liveTier > 0 ? GREEN : GOLD, transformOrigin: 'left center' }}>{score.toLocaleString()}</motion.p>
          <div style={{ marginTop: 5, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(segProgress * 100)}%`, height: '100%', borderRadius: 3, background: nextT ? `linear-gradient(90deg,#c4a96a,${GOLD})` : `linear-gradient(90deg,#3fae78,${GREEN})`, transition: 'width 0.3s' }} />
          </div>
          <p className="font-karla font-600" style={{ fontSize: '0.56rem', marginTop: 3, color: '#b1a886', textAlign: 'right' }}>
            {nextT ? `${nextScore.toLocaleString()} → ${nextT.points}/5` : 'top tier reached'}
          </p>
          {/* score float */}
          <AnimatePresence>
            {scoreFloat && (
              <motion.span key={scoreFloat.key} initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: -16, scale: 1.1 }} exit={{ opacity: 0, y: -26 }} transition={{ duration: 0.6 }}
                onAnimationComplete={() => setScoreFloat(f => (f && f.key === scoreFloat.key ? null : f))}
                className="font-cinzel font-700" style={{ position: 'absolute', right: 12, top: 6, fontSize: '1rem', color: GREEN, textShadow: '0 1px 4px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
                +{scoreFloat.amount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tier ladder */}
      <TierLadder />

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
          const isWild = t === WILD
          return (
            <Tile
              key={i}
              // Compass borrows the star silhouette (token 7); its rainbow fill +
              // pulse are applied via isWild.
              tok={isWild ? MATCH_TOKENS[7] : (MATCH_TOKENS[t] ?? MATCH_TOKENS[0])}
              isWild={isWild}
              isSel={selected === i}
              isPop={popping.has(i)}
              isDrop={dropping.has(i)}
              fall={dropping.has(i) ? (dropFall[i] ?? 0) : 0}
              isCommit={committed !== null && (committed[0] === i || committed[1] === i)}
              isInvalid={!!invalid && (invalid[0] === i || invalid[1] === i)}
            />
          )
        })}

        {/* Board-wide light pulse on every clear — brightens with the combo.
            Keyed so it remounts (and the CSS animation restarts) each clear. */}
        {flash && (
          <div key={flash.key} aria-hidden style={{
            position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', zIndex: 1,
            background: `radial-gradient(ellipse at center, rgba(255,232,150,${0.5 * flash.intensity}) 0%, rgba(240,192,64,${0.26 * flash.intensity}) 42%, transparent 72%)`,
            animation: 'tmBoardFlash 0.5s ease-out forwards',
          }} />
        )}

      </div>

      {!cleared && board.includes(WILD) && (
        <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: GOLD, textAlign: 'center', textShadow: `0 0 10px ${GOLD}66` }}>
          A Compass is wild — swap it beside matching treasures to complete a line.
        </p>
      )}
      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#8f8672', textAlign: 'center' }}>
        {cleared
          ? `Maxed ${MATCH_MAX_POINTS}/5 this week — fresh board Monday.`
          : message ?? `Best ${displayBest.toLocaleString()} · ${banked}/5 banked`}
      </p>

      {/* Full-screen combo burst — viewport-centered, max impact. Keyed so the
          CSS animation restarts cleanly on each level (no double-fire). */}
      {mounted && createPortal(
        combo ? (
          <div key={combo.key} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 8800, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: 'min(120vw, 700px)', height: 'min(120vw, 700px)', borderRadius: '50%', animation: 'tmComboFlash 0.85s ease-out forwards', background: `radial-gradient(circle, ${GOLD}55 0%, ${GOLD}22 38%, transparent 66%)` }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'tmComboBurst 0.85s cubic-bezier(.2,.8,.3,1) forwards', transformOrigin: 'center' }}>
              <span className="font-cinzel font-700" style={{
                fontSize: 'clamp(2.8rem, 17vw, 6.5rem)', lineHeight: 0.92, color: '#fff', letterSpacing: '0.01em',
                textShadow: `0 0 22px ${GOLD}, 0 0 48px ${GOLD}, 0 0 80px ${GOLD}cc, 0 4px 10px rgba(0,0,0,0.85)`,
                WebkitTextStroke: `1.5px ${GOLD}`,
              }}>
                COMBO
              </span>
              <span className="font-cinzel font-700" style={{
                fontSize: 'clamp(3.4rem, 22vw, 8rem)', lineHeight: 0.9, marginTop: 2,
                color: GOLD, letterSpacing: '0.01em',
                textShadow: `0 0 26px ${GOLD}, 0 0 60px ${GOLD}aa, 0 4px 12px rgba(0,0,0,0.9)`,
              }}>
                ×{combo.level}
              </span>
              {combo.level >= 3 && (
                <span className="font-karla font-700 uppercase" style={{ marginTop: 8, fontSize: 'clamp(0.85rem, 4.5vw, 1.4rem)', letterSpacing: '0.28em', color: '#fff', textShadow: `0 0 14px ${GOLD}, 0 2px 6px rgba(0,0,0,0.9)` }}>
                  {combo.level >= 5 ? 'Plundered!' : 'Chain!'}
                </span>
              )}
            </div>
          </div>
        ) : null,
        document.body,
      )}

      {/* Tier-up burst — crossing a new charting-point tier mid-run. */}
      {mounted && createPortal(
        tierUp ? (
          <div key={tierUp.key} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 8800, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: 'min(120vw, 700px)', height: 'min(120vw, 700px)', borderRadius: '50%', animation: 'tmComboFlash 0.95s ease-out forwards', background: `radial-gradient(circle, ${GREEN}44 0%, ${GREEN}1c 38%, transparent 66%)` }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'tmComboBurst 0.95s cubic-bezier(.2,.8,.3,1) forwards', transformOrigin: 'center' }}>
              <span className="font-cinzel font-700" style={{ fontSize: 'clamp(4rem, 26vw, 9rem)', lineHeight: 0.85, color: GREEN, textShadow: `0 0 26px ${GREEN}, 0 0 60px ${GREEN}aa, 0 4px 12px rgba(0,0,0,0.9)` }}>
                {tierUp.points}<span style={{ fontSize: '0.5em', color: '#fff' }}>/5</span>
              </span>
              <span className="font-karla font-700 uppercase" style={{ marginTop: 6, fontSize: 'clamp(0.85rem, 4.5vw, 1.4rem)', letterSpacing: '0.26em', color: '#fff', textShadow: `0 0 14px ${GREEN}, 0 2px 6px rgba(0,0,0,0.9)` }}>
                Charting points secured
              </span>
            </div>
          </div>
        ) : null,
        document.body,
      )}

      {/* Particle bursts (portal, viewport coords) */}
      {mounted && createPortal(
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 8500, pointerEvents: 'none' }}>
          <AnimatePresence>
            {particles.map(p => (
              <motion.div key={p.id}
                initial={{ x: p.x, y: p.y, opacity: 1, scale: 0.6 }}
                animate={{ x: p.x + p.dx, y: [p.y, p.y + p.dy, p.y + p.dy + 72], opacity: [1, 1, 0], scale: [1.15, 1.1, 0.1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.72, ease: 'easeOut', times: [0, 0.42, 1] }}
                style={{ position: 'absolute', left: -p.size / 2, top: -p.size / 2, width: p.size, height: p.size, borderRadius: '50%', background: `radial-gradient(circle, ${p.color} 28%, ${p.color}00 72%)` }}
              />
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}

      {/* Run result overlay (out of moves OR maxed) */}
      {mounted && createPortal(
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,8,14,0.84)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                style={{ maxWidth: 360, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18, background: ['radial-gradient(ellipse 80% 60% at 50% 24%, rgba(196,169,106,0.14) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.96) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: result.maxed ? GREEN : GOLD }}>
                  {result.maxed ? 'Perfect haul — 5/5!' : result.pointsWon > 0 ? 'Tier up!' : 'Run complete'}
                </p>
                <p className="font-karla" style={{ fontSize: '0.74rem', color: '#dccba6', lineHeight: 1.5, marginTop: 6 }}>
                  This run {result.score.toLocaleString()} · best {result.best.toLocaleString()} this week.
                </p>

                <div style={{ marginTop: 14 }}><TierLadder compact /></div>

                <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: result.tier > 0 ? GREEN : '#9a9078', marginTop: 14 }}>
                  {result.tier}/5 charting points
                </p>
                {result.pointsWon > 0
                  ? <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: GOLD, marginTop: 2 }}>+{result.pointsWon} banked just now</p>
                  : <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a9078', marginTop: 2 }}>{result.maxed ? 'Maxed out for the week.' : 'Beat your best to bank more.'}</p>}

                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  {!result.maxed && (
                    <button onClick={resetBoard} className="font-cinzel font-700" style={{ flex: 1, padding: '0.6rem 0.6rem', borderRadius: 10, fontSize: '0.84rem', background: 'rgba(240,192,64,0.18)', border: `1px solid ${GOLD}88`, color: '#f4ecd8', cursor: 'pointer' }}>
                      Try Again
                    </button>
                  )}
                  <Link href="/tavern/chart-room" className="font-karla font-700 uppercase" style={{ flex: 1, padding: '0.65rem 0.6rem', borderRadius: 10, letterSpacing: '0.08em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Charting
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
