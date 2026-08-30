'use client'

// WHO YOU SAIL WITH, from the deck.
//
// One panel behind one always-there button, covering the whole relationship:
// who is on the water right now, who has asked to sail with you, who you have
// asked, and who you could ask.
//
// ── WHY IT IS ALWAYS THERE ──────────────────────────────────────────────────
//
// The old readout appeared only when somebody was already out, which made it
// useless for the two things people actually want from it. You could not find
// out that nobody was about — the absence of a button is not an answer, it is
// an absence — and you could not do anything about it, because the only way to
// arrange to sail with somebody was to already be sailing with them.
//
// It shows a count when there is one and sits quietly at zero, but it is always
// somewhere you can press.
//
// ── THE LIST ITSELF LIVES IN components/PactBoard ───────────────────────────
//
// The tavern is the social room now and holds the same board, so what is left
// here is the SHELL: the overlay, the chart's steering guard, and the title. A
// second copy of accept/withdraw/part-ways would drift the week somebody added
// a state, and the two would then disagree about a relationship while sitting
// in the same game.

import { motion, AnimatePresence } from 'framer-motion'
import PactBoard from '@/components/PactBoard'

export default function CrewPanel({
  open, onClose, atSea, onChanged,
}: {
  open: boolean
  onClose: () => void
  /** Usernames currently on the water, from the chart's own poll — so the
   *  panel and the boats never disagree about who is out. */
  atSea: Set<string>
  /** A pact changed hands. The chart re-polls immediately so Accept puts the
   *  boat on the water NOW, not at the next twenty-second tick. */
  onChanged?: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          // The chart under this steers on pointerdown and CAPTURES the pointer
          // for the rest of the gesture, so an overlay without this both sails
          // the boat and never receives its own click. See PopupShell.
          data-no-steer
          style={{
            position: 'fixed', inset: 0, zIndex: 9200,
            background: 'rgba(3,8,14,0.86)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}>
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(100%, 400px)', maxHeight: '80vh', overflowY: 'auto',
              background: 'rgba(8,14,22,0.98)',
              border: '1px solid rgba(180,214,232,0.28)',
              borderRadius: 16, padding: '1rem 1.1rem',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#e8f2ea', margin: 0 }}>
                Sailing crew
              </p>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(180,214,232,0.22)',
                  color: 'rgba(226,238,246,0.8)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: 0,
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <PactBoard atSea={atSea} onChanged={onChanged} active={open} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
