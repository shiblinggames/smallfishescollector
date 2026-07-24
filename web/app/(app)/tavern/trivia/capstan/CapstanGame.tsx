'use client'

// Spin the Capstan — the Wheel-of-Fortune phrase game. Server-authoritative: the
// wheel is rolled server-side (spinCapstan returns the wedge to animate to), letters
// and solves are judged server-side, and the phrase arrives masked. This file owns
// only the feel — the spinning capstan, the phrase board, the pickers, the payout.

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BackButton from '@/components/BackButton'
import { ParlorHost, PARLOR, ParlorPointsTicker } from '../ParlorArt'
import { spinCapstan, callConsonant, buyVowel, solveCapstan } from './actions'
import {
  CAPSTAN_WHEEL,
  CAPSTAN_VOWEL_COST,
  CAPSTAN_MAX_STRIKES,
  CAPSTAN_VOWELS,
  capstanSolvePoints,
  type CapstanState,
  type CapstanPuzzleClient,
} from '../constants'

const GOLD = '#f0c040'
const HAZARD = '#d9614f'
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('')
const WEDGES = CAPSTAN_WHEEL.length
const PER = 360 / WEDGES

function vibrate(p: number | number[]) { try { navigator.vibrate?.(p) } catch { /* unsupported */ } }
function wedgeLabel(w: (typeof CAPSTAN_WHEEL)[number]): string {
  return w === 'overboard' ? 'OVER' : w === 'lose_turn' ? 'LOSE' : String(w)
}
function wedgeFill(w: (typeof CAPSTAN_WHEEL)[number], i: number): string {
  if (w === 'overboard' || w === 'lose_turn') return '#4a1a14'
  return i % 2 === 0 ? '#3a2b16' : '#4a3720'
}

export default function CapstanGame({ initial, parlorPoints }: { initial: CapstanState; parlorPoints: number }) {
  const router = useRouter()
  const [puzzles, setPuzzles] = useState(initial.puzzles)
  const [points, setPoints] = useState(parlorPoints)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const active = activeIndex === null ? null : puzzles.find(p => p.index === activeIndex) ?? null
  const update = (p: CapstanPuzzleClient) => setPuzzles(prev => prev.map(x => (x.index === p.index ? p : x)))

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BackButton href="/tavern/trivia" label="Parlor" />
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Spin the Capstan
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <ParlorPointsTicker value={points} />
        </div>
      </div>

      {active === null ? (
        <PuzzleSelect puzzles={puzzles} onPick={setActiveIndex} />
      ) : (
        <PuzzlePlay
          key={active.index}
          puzzle={active}
          onBack={() => setActiveIndex(null)}
          onUpdate={update}
          onPoints={setPoints}
          onDoubloons={d => { try { window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: d })) } catch { /* no-op */ } }}
        />
      )}
    </div>
  )
}

// ── Puzzle picker ───────────────────────────────────────────────────
function PuzzleSelect({ puzzles, onPick }: { puzzles: CapstanPuzzleClient[]; onPick: (i: number) => void }) {
  const solved = puzzles.filter(p => p.status === 'solved').length
  return (
    <>
      <div style={{ padding: '0.1rem' }}>
        <ParlorHost line="Three phrases hide in the capstan this week. Spin for stakes, call your letters, and solve before the sea claims your bank." />
      </div>
      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a8a090', textAlign: 'center' }}>
        {solved} of {puzzles.length} solved this week
      </p>
      {puzzles.map(p => {
        const done = p.status !== 'active'
        const started = p.called.length > 0 || p.strikes > 0 || p.bank > 0
        const solved = p.status === 'solved'
        const points = solved ? capstanSolvePoints(p.strikes) : 0
        return (
          <button
            key={p.index}
            onClick={() => onPick(p.index)}
            className="font-karla"
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.85rem 0.95rem', borderRadius: 14,
              background: solved ? `linear-gradient(180deg, ${GOLD}1e 0%, #130d08 70%)` : 'linear-gradient(180deg, #241a12 0%, #130d08 100%)',
              border: `1px solid ${solved ? `${GOLD}88` : p.status === 'failed' ? 'rgba(217,97,79,0.5)' : 'rgba(201,162,74,0.4)'}`,
              boxShadow: solved ? `0 0 16px ${GOLD}22, inset 0 1px 0 rgba(255,255,255,0.05)` : 'none',
              opacity: p.status === 'failed' ? 0.8 : 1,
            }}
          >
            <span aria-hidden style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: solved ? `radial-gradient(circle at 50% 35%, ${GOLD}, #6b4e12 92%)` : 'radial-gradient(circle at 50% 35%, #3a2c16, #12100a 92%)',
              border: `1.5px solid ${solved ? GOLD : PARLOR.brass}`,
              boxShadow: solved ? `0 0 12px ${GOLD}66` : 'none',
            }}>
              {solved ? <CheckIcon size={22} /> : p.status === 'failed' ? <XIcon size={20} /> : <CapstanGlyph size={22} />}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="font-karla font-700 uppercase" style={{ display: 'block', fontSize: '0.5rem', letterSpacing: '0.16em', color: '#a8a090' }}>{p.category}</span>
              <span className="font-cinzel font-700" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.98rem', color: solved ? GOLD : p.status === 'failed' ? HAZARD : '#f0e8d0', marginTop: 1 }}>
                {solved ? 'Solved' : p.status === 'failed' ? 'Lost to the deep' : started ? 'In progress' : 'Ready to play'}
                {solved && (
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: '#160f06', background: GOLD, borderRadius: 999, padding: '0.1rem 0.4rem' }}>Done</span>
                )}
              </span>
              <span className="font-karla" style={{ display: 'block', fontSize: '0.62rem', color: '#c2b9a4', marginTop: 1 }}>
                {solved
                  ? <>Banked <span style={{ color: GOLD }}>{p.earned.toLocaleString()} ⟡</span> · <span style={{ color: PARLOR.candle }}>+{points} pts</span></>
                  : p.status === 'failed'
                    ? 'No reward'
                    : <>{p.mask.length} words · {p.mask.reduce((n, w) => n + w.length, 0)} letters</>}
              </span>
            </span>
            {!done && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PARLOR.brass} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            )}
          </button>
        )
      })}
    </>
  )
}

// ── Active puzzle ───────────────────────────────────────────────────
function PuzzlePlay({ puzzle, onBack, onUpdate, onPoints, onDoubloons }: {
  puzzle: CapstanPuzzleClient
  onBack: () => void
  onUpdate: (p: CapstanPuzzleClient) => void
  onPoints: (n: number) => void
  onDoubloons: (total: number) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [wheelRot, setWheelRot] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const pendingSpin = useRef<Awaited<ReturnType<typeof spinCapstan>> | null>(null)
  const [toast, setToast] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null)
  const [showVowels, setShowVowels] = useState(false)
  const [showSolve, setShowSolve] = useState(false)
  const [guess, setGuess] = useState('')
  const [win, setWin] = useState<{ earned: number; points: number; rankedUp: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const done = puzzle.status !== 'active'
  const awaitingConsonant = puzzle.pendingValue !== null
  const flash = (kind: 'good' | 'bad' | 'info', text: string) => { setToast({ kind, text }); setTimeout(() => setToast(null), 2200) }

  function doSpin() {
    if (spinning || isPending || done || awaitingConsonant) return
    setError(null)
    setSpinning(true)
    startTransition(async () => {
      const r = await spinCapstan(puzzle.index)
      if ('error' in r) { setError(r.error); setSpinning(false); return }
      pendingSpin.current = r
      const target = r.wedgeIndex * PER   // wedge i is centered at i*PER (drawn from top, clockwise)
      setWheelRot(prev => {
        const base = prev - (prev % 360)
        return base + 360 * 5 + (360 - target)
      })
    })
  }

  function onSpinSettled() {
    const r = pendingSpin.current
    if (!r || 'error' in r) return
    pendingSpin.current = null
    setSpinning(false)
    onUpdate(r.puzzle)
    if (r.outcome === 'overboard') { vibrate([0, 60, 40, 120]); flash('bad', 'Overboard! Your round bank spills into the sea.') }
    else if (r.outcome === 'lose_turn') { vibrate([0, 40, 30, 80]); flash('bad', 'Lose a turn — a strike against you.') }
    else { vibrate(20); flash('info', `The capstan holds on ${r.wedge} ⟡. Call a consonant.`) }
  }

  function pickConsonant(letter: string) {
    if (isPending || spinning) return
    setError(null)
    startTransition(async () => {
      const r = await callConsonant(puzzle.index, letter)
      if ('error' in r) { setError(r.error); return }
      onUpdate(r.puzzle)
      if (r.count > 0) { vibrate(30); flash('good', `${r.count} × ${letter} — +${r.gained.toLocaleString()} ⟡ to the bank.`) }
      else { vibrate([0, 40, 30, 80]); flash('bad', `No ${letter}. A strike against you.`) }
    })
  }

  function pickVowel(letter: string) {
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const r = await buyVowel(puzzle.index, letter)
      if ('error' in r) { setError(r.error); return }
      setShowVowels(false)
      onUpdate(r.puzzle)
      if (r.count > 0) { vibrate(30); flash('good', `${r.count} × ${letter} revealed.`) }
      else { vibrate(20); flash('info', `No ${letter} — the fee's spent.`) }
    })
  }

  function submitSolve() {
    if (isPending || !guess.trim()) return
    setError(null)
    startTransition(async () => {
      const r = await solveCapstan(puzzle.index, guess)
      if ('error' in r) { setError(r.error); return }
      onUpdate(r.puzzle)
      setShowSolve(false)
      setGuess('')
      if (r.correct) {
        vibrate([0, 40, 60, 120])
        onPoints(r.newPoints)
        if (r.newDoubloons !== null) onDoubloons(r.newDoubloons)
        setWin({ earned: r.earned, points: r.pointsEarned, rankedUp: r.rankedUp })
      } else {
        vibrate([0, 50, 40, 100])
        flash('bad', 'Not the phrase. A strike against you.')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <button onClick={onBack} className="font-karla font-700 uppercase" style={{ alignSelf: 'flex-start', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#a8a090', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        ‹ All three puzzles
      </button>

      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.18em', color: PARLOR.brass, textAlign: 'center' }}>{puzzle.category}</p>

      {/* Phrase board */}
      <PhraseBoard mask={puzzle.mask} />

      {/* Bank + strikes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.1rem 0.2rem' }}>
        <span>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#a8a090' }}>Round bank</span>
          <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '1.35rem', color: GOLD, lineHeight: 1, textShadow: `0 0 12px ${GOLD}55` }}>{puzzle.bank.toLocaleString()} ⟡</span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#a8a090' }}>Strikes</span>
          <span style={{ display: 'flex', gap: 5, marginTop: 3, justifyContent: 'flex-end' }}>
            {Array.from({ length: CAPSTAN_MAX_STRIKES }).map((_, i) => (
              <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < puzzle.strikes ? HAZARD : 'transparent', border: `1.5px solid ${i < puzzle.strikes ? HAZARD : 'rgba(217,97,79,0.4)'}`, boxShadow: i < puzzle.strikes ? `0 0 8px ${HAZARD}88` : 'none' }} />
            ))}
          </span>
        </span>
      </div>

      {done ? (
        <ResultPanel puzzle={puzzle} onBack={onBack} />
      ) : (
        <>
          {/* The capstan wheel */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '0.2rem 0' }}>
            <Wheel rot={wheelRot} onSettled={onSpinSettled} spinning={spinning} />
          </div>

          {/* toast */}
          <div style={{ minHeight: 20, textAlign: 'center' }}>
            <AnimatePresence mode="wait">
              {toast && (
                <motion.p
                  key={toast.text}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="font-karla font-700"
                  style={{ fontSize: '0.72rem', color: toast.kind === 'good' ? '#7fd49a' : toast.kind === 'bad' ? HAZARD : PARLOR.candle }}
                >
                  {toast.text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          {awaitingConsonant ? (
            <div>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: '#e0cf9e', textAlign: 'center', marginBottom: 8 }}>
                Call a consonant · {puzzle.pendingValue} ⟡ each
              </p>
              <LetterGrid
                letters={CONSONANTS}
                disabled={puzzle.called}
                busy={isPending}
                onPick={pickConsonant}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionBtn label={spinning ? 'Spinning…' : 'Spin'} primary onClick={doSpin} disabled={spinning || isPending} />
              <ActionBtn
                label={`Vowel · ${CAPSTAN_VOWEL_COST} ⟡`}
                onClick={() => setShowVowels(true)}
                disabled={spinning || isPending || puzzle.bank < CAPSTAN_VOWEL_COST || CAPSTAN_VOWELS.every(v => puzzle.called.includes(v))}
              />
              <ActionBtn label="Solve" onClick={() => setShowSolve(true)} disabled={spinning || isPending} />
            </div>
          )}

          {error && <p className="font-karla" style={{ fontSize: '0.66rem', color: HAZARD, textAlign: 'center' }}>{error}</p>}

          <p className="font-karla" style={{ fontSize: '0.56rem', color: '#6f6b66', textAlign: 'center', lineHeight: 1.5 }}>
            Overboard wipes your round bank · Lose a Turn costs a strike · three strikes and the phrase is lost. Solve any time to bank it.
          </p>
        </>
      )}

      {/* Vowel picker */}
      <AnimatePresence>
        {showVowels && (
          <PickerSheet title={`Buy a vowel — ${CAPSTAN_VOWEL_COST} ⟡ from the bank`} onClose={() => setShowVowels(false)}>
            <LetterGrid letters={[...CAPSTAN_VOWELS]} disabled={puzzle.called} busy={isPending} onPick={pickVowel} wide />
          </PickerSheet>
        )}
      </AnimatePresence>

      {/* Solve input */}
      <AnimatePresence>
        {showSolve && (
          <PickerSheet title="Solve the phrase" onClose={() => setShowSolve(false)}>
            <input
              autoFocus
              value={guess}
              onChange={e => setGuess(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitSolve() }}
              placeholder="Type the whole phrase"
              className="font-cinzel"
              style={{ width: '100%', padding: '0.7rem 0.8rem', borderRadius: 10, background: '#12100a', border: `1px solid ${PARLOR.brass}66`, color: '#f0e8d0', fontSize: '1rem', textAlign: 'center', textTransform: 'uppercase', outline: 'none' }}
            />
            <ActionBtn label={isPending ? 'Solving…' : 'Lock it in'} primary onClick={submitSolve} disabled={isPending || !guess.trim()} full />
          </PickerSheet>
        )}
      </AnimatePresence>

      {/* Win celebration */}
      <AnimatePresence>
        {win && <WinOverlay puzzle={puzzle} win={win} onClose={() => { setWin(null); onBack() }} />}
      </AnimatePresence>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────
function PhraseBoard({ mask }: { mask: (string | null)[][] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 14px', padding: '0.9rem 0.7rem', borderRadius: 14, background: 'linear-gradient(180deg, #1a130b, #0e0a06)', border: `1px solid ${PARLOR.brass}33` }}>
      {mask.map((word, wi) => (
        <span key={wi} style={{ display: 'flex', gap: 4 }}>
          {word.map((cell, ci) => (
            <span
              key={ci}
              className="font-cinzel font-700"
              style={{
                width: 24, height: 30, borderRadius: 4, display: 'grid', placeItems: 'center',
                fontSize: '1rem', color: '#20160c',
                background: cell ? 'linear-gradient(180deg, #f3e6c6, #d8c299)' : 'rgba(255,255,255,0.04)',
                border: cell ? '1px solid rgba(0,0,0,0.25)' : `1px solid ${PARLOR.brass}44`,
                boxShadow: cell ? 'inset 0 -2px 4px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              {cell ?? ''}
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}

function Wheel({ rot, onSettled, spinning }: { rot: number; onSettled: () => void; spinning: boolean }) {
  const R = 92, cx = 100, cy = 100, labelR = 62
  const toXY = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  return (
    <div style={{ position: 'relative', width: 200, height: 210 }}>
      {/* pointer / pawl at top */}
      <svg width="26" height="20" viewBox="0 0 26 20" style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', zIndex: 2, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}>
        <path d="M13 20 L3 2 Q13 8 23 2 Z" fill={GOLD} stroke="#7a5a12" strokeWidth="1" />
      </svg>
      <motion.svg
        width="200" height="200" viewBox="0 0 200 200"
        style={{ position: 'absolute', top: 8, left: 0 }}
        animate={{ rotate: rot }}
        transition={{ duration: 2.4, ease: [0.17, 0.67, 0.14, 1] }}
        onAnimationComplete={() => { if (spinning) onSettled() }}
      >
        <circle cx={cx} cy={cy} r={R + 4} fill="#0c0906" stroke={PARLOR.brass} strokeWidth="3" />
        {CAPSTAN_WHEEL.map((w, i) => {
          const [x1, y1] = toXY(i * PER - PER / 2, R)
          const [x2, y2] = toXY(i * PER + PER / 2, R)
          const [lx, ly] = toXY(i * PER, labelR)
          const hazard = w === 'overboard' || w === 'lose_turn'
          return (
            <g key={i}>
              <path d={`M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z`} fill={wedgeFill(w, i)} stroke="#0c0906" strokeWidth="0.8" />
              <text
                x={lx} y={ly}
                fill={hazard ? '#ffab9d' : '#f8eed4'}
                stroke="#0c0906" strokeWidth={0.9} paintOrder="stroke"
                fontSize={hazard ? 8.5 : 11} fontWeight="800"
                textAnchor="middle" dominantBaseline="central"
                transform={`rotate(${i * PER} ${lx} ${ly})`}
                style={{ fontFamily: 'var(--font-cinzel), serif' }}
              >
                {wedgeLabel(w)}
              </text>
            </g>
          )
        })}
        {/* capstan hub with spokes */}
        <circle cx={cx} cy={cy} r={22} fill="#2c2011" stroke={PARLOR.brass} strokeWidth="2" />
        {Array.from({ length: 6 }).map((_, i) => {
          const [hx, hy] = toXY(i * 60, 20)
          return <line key={i} x1={cx} y1={cy} x2={hx} y2={hy} stroke={PARLOR.brass} strokeWidth="2.4" strokeLinecap="round" opacity={0.85} />
        })}
        <circle cx={cx} cy={cy} r={6} fill={PARLOR.brass} />
      </motion.svg>
    </div>
  )
}

function LetterGrid({ letters, disabled, busy, onPick, wide }: { letters: string[]; disabled: string[]; busy: boolean; onPick: (l: string) => void; wide?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 5 : 7}, 1fr)`, gap: 6 }}>
      {letters.map(l => {
        const off = disabled.includes(l)
        return (
          <button
            key={l}
            onClick={() => onPick(l)}
            disabled={off || busy}
            className="font-cinzel font-700"
            style={{
              aspectRatio: '1', borderRadius: 8, fontSize: '1.12rem', fontWeight: 800,
              cursor: off || busy ? 'default' : 'pointer',
              color: off ? '#6a5f4c' : '#fbf3dd',
              background: off ? 'rgba(255,255,255,0.02)' : 'linear-gradient(180deg, #4a381d, #2c2011)',
              border: `1px solid ${off ? 'rgba(255,255,255,0.06)' : '#b58b3e'}`,
              boxShadow: off ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
              textShadow: off ? 'none' : '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}

function ActionBtn({ label, onClick, disabled, primary, full }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean; full?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="font-cinzel font-700"
      style={{
        flex: full ? undefined : 1, width: full ? '100%' : undefined, marginTop: full ? 10 : 0,
        padding: '0.72rem 0.5rem', borderRadius: 12, fontSize: '0.9rem', fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        color: primary ? '#160f06' : '#fbf3dd',
        background: primary ? `linear-gradient(180deg, ${PARLOR.candle}, ${PARLOR.brass})` : 'linear-gradient(180deg, #4a381d, #2c2011)',
        border: `1px solid ${primary ? PARLOR.brass : '#b58b3e'}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        textShadow: primary ? 'none' : '0 1px 2px rgba(0,0,0,0.5)',
      }}
    >
      {label}
    </button>
  )
}

function PickerSheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(6,4,12,0.72)', backdropFilter: 'blur(3px)' }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, borderRadius: 18, padding: '1.1rem 1rem 1.2rem', background: 'linear-gradient(180deg, #241a12, #130d08)', border: `1px solid ${PARLOR.brass}55`, boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}
      >
        <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0e8d0', textAlign: 'center', marginBottom: 12 }}>{title}</p>
        {children}
      </motion.div>
    </motion.div>
  )
}

function ResultPanel({ puzzle, onBack }: { puzzle: CapstanPuzzleClient; onBack: () => void }) {
  const solved = puzzle.status === 'solved'
  const points = solved ? capstanSolvePoints(puzzle.strikes) : 0
  return (
    <div style={{ textAlign: 'center', padding: '0.6rem 0 0.2rem' }}>
      {solved ? (
        <>
          <span aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: '50%', background: `radial-gradient(circle at 50% 35%, ${GOLD}, #6b4e12 92%)`, border: `2px solid ${GOLD}`, boxShadow: `0 0 20px ${GOLD}66`, marginBottom: 8 }}>
            <CheckIcon size={30} />
          </span>
          <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: GOLD, textShadow: `0 0 16px ${GOLD}55` }}>Solved</p>
          <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#e7dcc4', marginTop: 2 }}>
            Banked <span style={{ color: GOLD }}>{puzzle.earned.toLocaleString()} ⟡</span> · <span style={{ color: PARLOR.candle }}>+{points} pts toward your rank</span>
          </p>
        </>
      ) : (
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: HAZARD }}>Lost to the deep</p>
      )}
      {puzzle.phrase && (
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0e8d0', marginTop: 8, letterSpacing: '0.04em' }}>{puzzle.phrase}</p>
      )}
      <button onClick={onBack} className="font-cinzel font-700" style={{ marginTop: 14, padding: '0.6rem 1.4rem', borderRadius: 12, background: 'linear-gradient(180deg, #2c2011, #1a130b)', border: `1px solid ${PARLOR.brass}55`, color: '#f0e8d0', fontSize: '0.82rem', cursor: 'pointer' }}>
        Back to the puzzles
      </button>
    </div>
  )
}

function WinOverlay({ puzzle, win, onClose }: { puzzle: CapstanPuzzleClient; win: { earned: number; points: number; rankedUp: boolean }; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(ellipse 90% 70% at 50% 40%, rgba(48,36,10,0.78), rgba(6,4,12,0.94))', backdropFilter: 'blur(3px)' }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 340, textAlign: 'center', borderRadius: 22, padding: '1.6rem 1.3rem', background: 'linear-gradient(180deg, #241a12, #130d08)', border: `1px solid ${GOLD}66`, boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 40px ${GOLD}22` }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.span key={i} aria-hidden
            initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: 0, x: Math.cos((i / 12) * Math.PI * 2) * 120, y: Math.sin((i / 12) * Math.PI * 2) * 70 - 8, scale: 1.1 }}
            transition={{ duration: 1.05, ease: 'easeOut' }}
            style={{ position: 'absolute', top: '38%', left: '50%', fontSize: '1.1rem', color: GOLD, textShadow: `0 0 10px ${GOLD}` }}
          >⟡</motion.span>
        ))}
        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.24em', color: '#a8a090' }}>Phrase Solved</p>
        <p className="font-cinzel font-800" style={{ fontSize: '2rem', color: GOLD, marginTop: 8, textShadow: `0 0 20px ${GOLD}` }}>+{win.earned.toLocaleString()} ⟡</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0e8d0', marginTop: 6 }}>{puzzle.phrase}</p>
        <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: PARLOR.candle, marginTop: 10 }}>+{win.points} pts toward your Parlor rank</p>
        {win.rankedUp && (
          <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#c084fc', marginTop: 4 }}>New rank reached — collect your gems in the Parlor</p>
        )}
        <button onClick={onClose} className="font-cinzel font-700" style={{ marginTop: 16, padding: '0.6rem 1.6rem', borderRadius: 12, background: `linear-gradient(180deg, ${PARLOR.candle}, ${PARLOR.brass})`, border: 'none', color: '#160f06', fontSize: '0.9rem', cursor: 'pointer' }}>
          Well done
        </button>
      </motion.div>
    </motion.div>
  )
}

function CheckIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5 L10 17.5 L19 7" stroke="#160f06" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 7 L17 17 M17 7 L7 17" stroke={HAZARD} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

function CapstanGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.5" fill="none" stroke={PARLOR.brass} strokeWidth="1.6" />
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i * 60 * Math.PI) / 180
        return <line key={i} x1={12 + 4.5 * Math.cos(a)} y1={12 + 4.5 * Math.sin(a)} x2={12 + 9 * Math.cos(a)} y2={12 + 9 * Math.sin(a)} stroke={PARLOR.brass} strokeWidth="1.6" strokeLinecap="round" />
      })}
      <circle cx="12" cy="12" r="1.6" fill={PARLOR.brass} />
    </svg>
  )
}
