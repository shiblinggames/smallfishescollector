'use client'

// ── OPPORTUNITY STRIP ────────────────────────────────────────────────────────
// The ongoing "what's worth your time" nudge, in the slot Captain's Orders vacates
// once onboarding latches. It surfaces the single highest-value actionable thing (see
// lib/expeditionOpportunities for the ranking), with a quiet way to page through the
// rest. When a captain is caught up it collapses to one calm line rather than
// vanishing, so the space reads as "handled", not broken.
//
// This is a SLIM BAR, not a card. The first version was a tall tinted card with a
// "What's Worth Your Time" eyebrow that neither blended with the page nor earned the
// height. This is one row: a tone-coloured edge, a title and a one-line detail, an
// arrow, and — only when there is more than one — a set of page dots. It sits above
// the hub cards and looks like it belongs to them.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { deriveOpportunities, type Opportunity, type OpportunityState, type OpportunityAction } from '@/lib/expeditionOpportunities'
import Link from 'next/link'

// One colour per tone. It rides the left edge and the little dot — enough to read the
// urgency, not enough to shout.
const TONE: Record<Opportunity['tone'], string> = {
  urgent:   '#ef4444',
  reward:   '#f0c040',
  progress: '#dca494',
  idle:     '#5eead4',
}

export default function OpportunityStrip({ state, onAction }: {
  state: OpportunityState
  onAction: (a: OpportunityAction) => void
}) {
  const list = deriveOpportunities(state)
  const [i, setI] = useState(0)

  // ── ALL CAUGHT UP — a calm line, not a gap ──────────────────────────────────
  if (list.length === 0) {
    return (
      <div style={{
        marginBottom: 12, padding: '0.6rem 0.85rem', borderRadius: 14,
        background: 'rgba(6,12,20,0.72)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6f8a84" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        <p className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#7a8a84' }}>
          All squared away, captain.
        </p>
      </div>
    )
  }

  const idx = Math.min(i, list.length - 1)
  const op = list[idx]
  const accent = TONE[op.tone]

  const content = (
    <AnimatePresence mode="wait">
      <motion.div key={op.id}
        initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.16 }}
        style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.9rem', color: '#f2ece0', lineHeight: 1.2 }}>
          {op.title}
        </p>
        <p className="font-karla font-600 truncate" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.3, marginTop: 1 }}>
          {op.detail}
        </p>
      </motion.div>
    </AnimatePresence>
  )

  // The action fills the row; the container is a plain div so the page dots (below)
  // are siblings, never nested inside a tap target.
  const rowInner = (
    <>
      <span aria-hidden style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: accent, boxShadow: `0 0 8px ${accent}88` }} />
      {content}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
    </>
  )

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    padding: '0.6rem 0.8rem', borderRadius: 14, cursor: 'pointer', textDecoration: 'none',
    background: 'rgba(6,12,20,0.72)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderLeft: `2px solid ${accent}`,
  }

  return (
    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      style={{ marginBottom: 12 }}>
      {op.action.kind === 'href'
        ? <Link href={op.action.href} className="tap" style={rowStyle}>{rowInner}</Link>
        : <button type="button" onClick={() => onAction(op.action)} className="tap" style={{ ...rowStyle, borderTopStyle: 'solid' }}>{rowInner}</button>}

      {/* HOW YOU SEE THE REST. Page dots said nothing and were 6px to hit. This is a
          real, labelled control: a count that says more exist, and a "Next" pill that
          plainly looks tappable. It advances and wraps. Sibling of the action row, so
          nothing is nested. */}
      {list.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: '0 0.2rem' }}>
          <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#7a756c' }}>
            {idx + 1} of {list.length}
          </span>
          <button type="button" onClick={() => setI(v => (v + 1) % list.length)}
            className="font-karla font-800 uppercase tracking-[0.08em] tap"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '0.32rem 0.7rem', borderRadius: 999, cursor: 'pointer',
              fontSize: '0.58rem', color: '#c8c2b6',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)',
            }}>
            {idx === list.length - 1 ? 'Back to top' : 'Next'}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              {idx === list.length - 1 ? <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.5 2.8M3 4v4h4" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
          </button>
        </div>
      )}
    </motion.div>
  )
}
