'use client'

// THE VOYAGE SO FAR — every badge you own, in the order you earned it.
//
// The grid answers "what have I got left"; this answers "what did I do, and
// when". Same badges, read as a story instead of a checklist, which is the
// thing timestamps actually buy.
//
// TWO ERAS, and the split is the point. Everything earned before badge stamping
// shipped has no recoverable date, so it sits together at the foot of the rope
// as ONE chapter rather than being scattered through with invented days. It
// reads as seniority — the deep water you came up from — and it shrinks on its
// own as real dates accumulate above it.
//
// Perf: this can render 148 rows (dkmuppy today). Everything animated is
// transform/opacity, entrance only, and the reveal is capped so the last row of
// a long list is not waiting two seconds to appear.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { DIFFICULTY_META, type BadgeDifficulty } from '@/lib/badges'
import type { JourneyGoal } from './AchievementsClient'

const GOLD = '#c4a96a'

/** Group by the day it happened, newest first. A single day of play often lands
 *  several badges, and they belong together as one moment. */
function byDay(goals: JourneyGoal[]) {
  const days = new Map<string, { label: string; ts: number; goals: JourneyGoal[] }>()
  for (const g of goals) {
    if (!g.earnedAt) continue
    const d = new Date(g.earnedAt)
    const key = d.toISOString().slice(0, 10)
    const row = days.get(key)
    if (row) row.goals.push(g)
    else days.set(key, {
      label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      ts: d.getTime(),
      goals: [g],
    })
  }
  return [...days.values()].sort((a, b) => b.ts - a.ts)
}

function Pip({ color, image, label, difficulty, onTap }: {
  color: string; image?: string; label: string; difficulty?: BadgeDifficulty; onTap: () => void
}) {
  return (
    <button type="button" onClick={onTap}
      className="tap"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
        background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}33`,
        borderRadius: 12, padding: '0.5rem 0.6rem', cursor: 'pointer',
      }}>
      {image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={image} alt="" loading="lazy" decoding="async"
            style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 6px ${color}55)` }} />
        : <span aria-hidden style={{ width: 34, height: 34, borderRadius: '50%', border: `2px solid ${color}66`, flexShrink: 0 }} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.82rem', color: '#f0ede8', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {difficulty && (
          <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color }}>
            {DIFFICULTY_META[difficulty].label}
          </span>
        )}
      </span>
    </button>
  )
}

export default function BadgeTimeline({ goals, onOpen }: {
  /** Every badge-backed goal; the timeline picks the earned ones itself. */
  goals: JourneyGoal[]
  onOpen: (g: JourneyGoal) => void
}) {
  const earned = useMemo(() => goals.filter(g => g.done), [goals])
  const days = useMemo(() => byDay(earned), [earned])
  // 'earnedAt' present-but-null is the pre-stamping era. Undefined never
  // reaches here (those are unearned), but the check is written on the null so
  // it cannot silently swallow a future shape.
  const legacy = useMemo(() => earned.filter(g => g.earnedAt == null), [earned])
  const [showLegacy, setShowLegacy] = useState(false)

  if (earned.length === 0) {
    return (
      <p className="font-karla" style={{ fontSize: '0.78rem', color: '#8a8578', lineHeight: 1.6, padding: '1.4rem 0', textAlign: 'center' }}>
        Nothing on the rope yet. Earn a badge and it starts here.
      </p>
    )
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 18 }}>
      {/* THE ROPE. One line down the left, and every day hangs off it. */}
      <span aria-hidden style={{
        position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, borderRadius: 2,
        background: `linear-gradient(180deg, ${GOLD}aa 0%, ${GOLD}44 55%, rgba(120,110,90,0.25) 100%)`,
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {days.map((day, di) => (
          <motion.section key={day.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            // Capped stagger: 148 rows at 40ms each would take six seconds.
            transition={{ duration: 0.32, delay: Math.min(di * 0.05, 0.5), ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Knot on the rope. */}
            <span aria-hidden style={{
              position: 'absolute', left: 0, marginTop: 5, width: 12, height: 12, borderRadius: '50%',
              background: '#12100c', border: `2px solid ${GOLD}`, boxShadow: `0 0 10px ${GOLD}66`,
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#f4ecd8' }}>{day.label}</p>
              <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#8a8578', fontVariantNumeric: 'tabular-nums' }}>
                {day.goals.length} {day.goals.length === 1 ? 'badge' : 'badges'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {day.goals.map(g => (
                <Pip key={g.id}
                  color={g.difficulty ? DIFFICULTY_META[g.difficulty].color : GOLD}
                  image={g.badgeImage} label={g.label} difficulty={g.difficulty}
                  onTap={() => onOpen(g)} />
              ))}
            </div>
          </motion.section>
        ))}

        {/* THE DEEP WATER — everything from before the log was kept. Collapsed
            by default so it never buries the dated story above it. */}
        {legacy.length > 0 && (
          <section>
            <span aria-hidden style={{
              position: 'absolute', left: 1, marginTop: 5, width: 10, height: 10, borderRadius: '50%',
              background: '#12100c', border: '2px solid rgba(150,140,120,0.6)',
            }} />
            <button type="button" onClick={() => setShowLegacy(v => !v)}
              className="tap" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: 'rgba(200,192,175,0.85)' }}>
                Before the log was kept
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#8a8578', marginTop: 1 }}>
                {legacy.length} badges, earned before anyone was writing the dates down · {showLegacy ? 'hide' : 'show'}
              </p>
            </button>
            {showLegacy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                {legacy.map(g => (
                  <Pip key={g.id}
                    color={g.difficulty ? DIFFICULTY_META[g.difficulty].color : GOLD}
                    image={g.badgeImage} label={g.label} difficulty={g.difficulty}
                    onTap={() => onOpen(g)} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
