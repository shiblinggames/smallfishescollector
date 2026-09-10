'use client'

// ── THE CREW DISC, TOP RIGHT ────────────────────────────────────────────────
//
// The way to arrange sailing with somebody, from the deck.
//
// ── WHY IT IS BACK ──────────────────────────────────────────────────────────
//
// `CrewPanel` has always argued that this button has to be always-there, and
// then at some point the button was removed and only the argument was left:
// `crewOpen` was never set true by anything, so the panel was mounted and
// unreachable, and `pendingPacts()` was fetched into a counter that nothing
// rendered. The whole sailing-together feature had no door on the one screen
// it happens on — you had to go to the Tavern or /social to ask anybody.
//
// The panel's own reasoning, unchanged and now true again: you could not find
// out that nobody was about, because the absence of a button is not an answer,
// it is an absence. And you could not do anything about it, because the only
// way to arrange to sail with somebody was to already be sailing with them.
//
// ── AND IT CARRIES A COUNT ──────────────────────────────────────────────────
//
// Somebody asking to sail with you is a person waiting on an answer and it goes
// stale. That is the one thing on this disc allowed to be loud, and it is a
// NUMBER rather than a dot because "two people are waiting" and "somebody is
// waiting" are different amounts of rude to leave sitting.
//
// Quiet at zero, like the haul beside it.

import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

const SEA = 'rgba(180,214,232'
/** Somebody is waiting on you. Deliberately NOT the haul's gold: two discs
 *  side by side lighting up in the same colour read as one alert with two
 *  halves rather than as two different things wanting different answers. */
const ASK = 'rgba(143,214,196'

export default function SeaCrew({ size, top, right, count, onOpen }: {
  size: number
  top: number
  /** Where its right edge sits. The caller lays the run out from the corner
   *  inwards — see the note on the right-hand run in SeaMap. */
  right: number
  /** How many captains have asked to sail with you and are still waiting. */
  count: number
  onOpen: () => void
}) {
  const waiting = count > 0
  return (
    <div data-no-steer
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'absolute', top, right, zIndex: 40 }}>
      <button type="button"
        aria-label={waiting
          ? `Your crew, ${count} asking to sail with you`
          : 'Your crew'}
        title="Your crew"
        onClick={() => { vibrate(8); onOpen() }}
        style={{
          position: 'relative',
          width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: waiting ? 'rgba(14,34,30,0.86)' : 'rgba(8,16,24,0.72)',
          border: `1px solid ${waiting ? `${ASK},0.55)` : `${SEA},0.22)`}`,
          color: waiting ? `${ASK},0.95)` : `${SEA},0.72)`,
          backdropFilter: 'blur(2px)',
        }}>
        {/* THE PULSE, on the ring only — the same treatment the haul uses, for
            the same reason: the icon inside stays legible and the disc never
            changes size and shoves the gear about. Transform and opacity, so
            it composites and cannot cost a frame on the chart under it. */}
        <AnimatePresence>
          {waiting && (
            <motion.span aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.5, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              style={{
                position: 'absolute', inset: -2, borderRadius: '50%',
                border: `1px solid ${ASK},0.9)`, pointerEvents: 'none',
              }} />
          )}
        </AnimatePresence>

        {/* TWO FIGURES, drawn, not an emoji. Same language as every other disc
            on this chart: one line weight, one viewBox, stroke only. */}
        <svg width={Math.round(size * 0.54)} height={Math.round(size * 0.54)}
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20v-1.2A4.8 4.8 0 0 1 7.8 14h2.4a4.8 4.8 0 0 1 4.8 4.8V20" />
          <path d="M16.2 5.3a3.2 3.2 0 0 1 0 5.9" />
          <path d="M17.6 14.2A4.8 4.8 0 0 1 21 18.8V20" />
        </svg>

        {/* THE COUNT. Sat on the disc's own edge rather than inside it, so it
            never crowds the figures, and only ever a numeral — a badge that
            says nothing is a badge people learn to stop seeing. */}
        {waiting && (
          <span aria-hidden className="font-karla font-800"
            style={{
              position: 'absolute', top: -3, right: -3,
              minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.66rem', lineHeight: 1,
              background: 'rgba(10,26,23,0.96)',
              border: `1px solid ${ASK},0.75)`,
              color: `${ASK},1)`,
            }}>{count > 9 ? '9+' : count}</span>
        )}
      </button>
    </div>
  )
}
