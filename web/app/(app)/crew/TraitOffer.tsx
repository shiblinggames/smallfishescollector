'use client'

// THE DRAW — what the Leviathan bunk brought up, against what the hand carries.
//
// This replaces a single before/after column that assumed the answer was
// obvious. It is not obvious any more: the draw is flat and whole, so most
// results are a step DOWN and the captain has to actually read two traits
// against each other before choosing. Three things the old panel never did:
//
//   SAYS WHICH IS WHICH.  Two headed columns, "Carries now" and "The draw",
//   rather than an unlabelled arrow that you had to infer direction from.
//
//   SPELLS OUT THE DELTA.  Every stat shows its own swing, and the NET row
//   totals it. "+4/+3/+3 -> +4/-2/0" is arithmetic the player should not have
//   to do under a decision they cannot undo.
//
//   ASKS TWICE.  Either choice arms a confirm rather than committing. Taking a
//   draw destroys the old trait and refusing spends the draw, so both are
//   one-way and neither should be a stray tap.
//
// The satisfaction is in the reveal order, not in effects: the hand's current
// trait is already on screen, the draw rises in beside it, then the deltas
// count in one stat at a time, then the verdict lands. You watch it be better
// or worse rather than being told.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

export type TraitStats = { power: number; dodge: number; fortune: number }

const STATS = [
  { key: 'power'   as const, label: 'PWR' },
  { key: 'dodge'   as const, label: 'DGE' },
  { key: 'fortune' as const, label: 'FTN' },
]

const UP = '#7fdfa3'
const DOWN = '#e88a8a'
const FLAT = 'rgba(255,255,255,0.4)'

const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
const net = (t: TraitStats) => t.power + t.dodge + t.fortune

/** One stat's swing, coloured by direction. */
function Delta({ d }: { d: number }) {
  if (d === 0) return <span style={{ fontSize: '0.62rem', color: FLAT }}>same</span>
  return (
    <span className="font-karla font-800" style={{ fontSize: '0.66rem', color: d > 0 ? UP : DOWN, fontVariantNumeric: 'tabular-nums' }}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)}
    </span>
  )
}

export default function TraitOffer({
  accent, before, after, beforeLabel, afterLabel, busy, onKeep, onTake,
}: {
  accent: string
  before: TraitStats
  after: TraitStats
  beforeLabel: string
  afterLabel: string
  busy: boolean
  onKeep: () => void
  onTake: () => void
}) {
  // Which answer is armed, if any. Null means neither has been asked yet.
  const [confirm, setConfirm] = useState<'keep' | 'take' | null>(null)
  // Reveal gate: the deltas count in after the draw column has arrived, so the
  // comparison reads as an event rather than appearing pre-solved.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 520)
    return () => clearTimeout(t)
  }, [])

  const netBefore = net(before)
  const netAfter = net(after)
  const netDelta = netAfter - netBefore
  const better = netDelta > 0

  function arm(which: 'keep' | 'take') {
    vibrate(12)
    setConfirm(which)
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* ── THE TWO COLUMNS ────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 13, overflow: 'hidden',
        border: `1px solid ${accent}4d`, background: 'rgba(0,0,0,0.34)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.2rem 1fr 3.1rem 1fr', alignItems: 'center', gap: 4, padding: '0.5rem 0.6rem 0.4rem', background: 'rgba(255,255,255,0.03)' }}>
          <span />
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
            Carries now
          </span>
          <span />
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.12em', color: accent, textAlign: 'center' }}>
            The draw
          </motion.span>
        </div>

        {/* Names, so the two traits are identified before any numbers. */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.2rem 1fr 3.1rem 1fr', alignItems: 'center', gap: 4, padding: '0 0.6rem 0.5rem' }}>
          <span />
          <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#e6dcc2', textAlign: 'center' }}>{beforeLabel}</span>
          <span />
          <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, type: 'spring', stiffness: 300, damping: 20 }}
            className="font-cinzel font-800" style={{ fontSize: '0.86rem', color: accent, textAlign: 'center' }}>{afterLabel}</motion.span>
        </div>

        {STATS.map((s, i) => {
          const b = before[s.key], a = after[s.key]
          const d = a - b
          return (
            <div key={s.key} style={{
              display: 'grid', gridTemplateColumns: '2.2rem 1fr 3.1rem 1fr', gap: 4, alignItems: 'center',
              padding: '0.3rem 0.6rem', borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)' }}>{s.label}</span>
              <span className="font-karla font-700" style={{ fontSize: '0.86rem', textAlign: 'center', color: '#e6dcc2', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(b)}
              </span>
              <span style={{ textAlign: 'center' }}>
                <AnimatePresence>
                  {shown && (
                    <motion.span key="d" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.11, type: 'spring', stiffness: 400, damping: 18 }}
                      style={{ display: 'inline-block' }}>
                      <Delta d={d} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.34 + i * 0.06 }}
                className="font-karla font-800" style={{ fontSize: '0.92rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: d > 0 ? UP : d < 0 ? DOWN : '#e6dcc2' }}>
                {fmt(a)}
              </motion.span>
            </div>
          )
        })}

        {/* NET. The one number that answers "is this better", so it is the
            loudest thing in the block and lands last. */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2.2rem 1fr 3.1rem 1fr', gap: 4, alignItems: 'center',
          padding: '0.4rem 0.6rem 0.5rem', borderTop: `1px solid ${accent}33`, background: 'rgba(255,255,255,0.03)',
        }}>
          <span className="font-karla font-800" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)' }}>NET</span>
          <span className="font-karla font-700" style={{ fontSize: '0.86rem', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(netBefore)}
          </span>
          <span style={{ textAlign: 'center' }}>
            <AnimatePresence>
              {shown && (
                <motion.span key="nd" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.36, type: 'spring', stiffness: 380, damping: 16 }}
                  style={{ display: 'inline-block' }}>
                  <Delta d={netDelta} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="font-cinzel font-800" style={{ fontSize: '1.02rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: netDelta > 0 ? UP : netDelta < 0 ? DOWN : '#e6dcc2' }}>
            {fmt(netAfter)}
          </motion.span>
        </div>
      </div>

      {/* The verdict in words, so the decision does not rest on reading a
          table under time pressure. */}
      <AnimatePresence>
        {shown && !confirm && (
          <motion.p key="verdict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 9, lineHeight: 1.45 }}>
            {netDelta === 0
              ? 'An even trade on paper. The split is what differs.'
              : better
              ? `The draw is stronger by ${Math.abs(netDelta)}.`
              : `The draw is weaker by ${Math.abs(netDelta)}.`}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── THE ANSWER, ASKED TWICE ────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {!confirm ? (
          <motion.div key="choose" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ delay: shown ? 0 : 0.6 }}
            style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button type="button" disabled={busy} onClick={() => arm('keep')}
              className="tap font-karla font-700 uppercase tracking-[0.08em]"
              style={{ flex: 1, padding: '0.72rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#cfcabf', fontSize: '0.74rem', cursor: 'pointer' }}>
              Keep {beforeLabel}
            </button>
            <button type="button" disabled={busy} onClick={() => arm('take')}
              className="tap font-karla font-700 uppercase tracking-[0.08em]"
              style={{ flex: 1, padding: '0.72rem', borderRadius: 10, border: `1px solid ${accent}99`, background: `${accent}26`, color: '#e9fbf8', fontSize: '0.74rem', cursor: 'pointer' }}>
              Take {afterLabel}
            </button>
          </motion.div>
        ) : (
          <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginTop: 11, padding: '0.7rem 0.75rem', borderRadius: 12, background: 'rgba(0,0,0,0.4)', border: `1px solid ${confirm === 'take' ? accent : 'rgba(255,255,255,0.22)'}` }}>
            {/* Names the thing that is destroyed, because both answers are
                one-way: taking overwrites the old trait, refusing spends the
                draw and the bunk has to be run again to see another. */}
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#e6dcc2', lineHeight: 1.45, textAlign: 'center' }}>
              {confirm === 'take'
                ? <>Take <span style={{ color: accent, fontWeight: 700 }}>{afterLabel}</span>? <span style={{ color: 'rgba(255,255,255,0.6)' }}>{beforeLabel} is gone for good.</span></>
                : <>Keep <span style={{ fontWeight: 700 }}>{beforeLabel}</span>? <span style={{ color: 'rgba(255,255,255,0.6)' }}>This draw is spent either way.</span></>}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
              <button type="button" disabled={busy} onClick={() => setConfirm(null)}
                className="tap font-karla font-700 uppercase tracking-[0.08em]"
                style={{ flex: 1, padding: '0.62rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: 'rgba(255,255,255,0.65)', fontSize: '0.7rem', cursor: 'pointer' }}>
                Back
              </button>
              <button type="button" disabled={busy}
                onClick={() => { vibrate(confirm === 'take' ? [18, 40, 26] : 14); (confirm === 'take' ? onTake : onKeep)() }}
                className="tap font-karla font-800 uppercase tracking-[0.08em]"
                style={{
                  flex: 1, padding: '0.62rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.7rem',
                  border: `1px solid ${confirm === 'take' ? accent : 'rgba(255,255,255,0.4)'}`,
                  background: confirm === 'take' ? `${accent}3a` : 'rgba(255,255,255,0.12)',
                  color: confirm === 'take' ? '#eafffb' : '#f0ede8',
                }}>
                {busy ? '...' : confirm === 'take' ? 'Yes, take it' : 'Yes, keep'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
