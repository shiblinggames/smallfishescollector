'use client'

// ── OPPORTUNITY STRIP ────────────────────────────────────────────────────────
// The ongoing "what's worth your time" nudge, in the slot Captain's Orders vacates
// once onboarding latches. It surfaces the single highest-value actionable thing (see
// lib/expeditionOpportunities for the ranking), with a quiet way to page through the
// rest. When a captain is caught up it collapses to one calm line rather than
// vanishing, so the space reads as "handled", not broken.
//
// This is ONE fluid bar, not a card and not a strip-plus-box. The first version was a
// tall tinted card with a "What's Worth Your Time" eyebrow; a later one had a coloured
// dot and left edge that read as generic. This is a single neutral container: a title
// and a one-line detail fill it, and — only when there is more than one — a compact
// "n/N" advance control lives inside the same bar past a hairline divider. No dot, no
// coloured edge, one chevron. It sits above the hub cards and belongs to them.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { deriveOpportunities, type OpportunityState, type OpportunityAction } from '@/lib/expeditionOpportunities'
import Link from 'next/link'

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

  const content = (
    <AnimatePresence mode="wait">
      <motion.div key={op.id}
        initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.16 }}>
        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.9rem', color: '#f2ece0', lineHeight: 1.2 }}>
          {op.title}
        </p>
        <p className="font-karla font-600 truncate" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.3, marginTop: 1 }}>
          {op.detail}
        </p>
      </motion.div>
    </AnimatePresence>
  )

  // The action fills the left of the bar; it is transparent so the ONE outer container
  // is the whole visible shape. No dot, no coloured edge — just the bar.
  const actionStyle: React.CSSProperties = {
    display: 'block', flex: 1, minWidth: 0, textAlign: 'left', textDecoration: 'none',
    padding: '0.6rem 0.85rem', cursor: 'pointer', background: 'transparent', border: 'none',
  }

  return (
    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      style={{
        marginBottom: 12, display: 'flex', alignItems: 'stretch', overflow: 'hidden',
        borderRadius: 14, background: 'rgba(6,12,20,0.72)', border: '1px solid rgba(255,255,255,0.08)',
      }}>
      {op.action.kind === 'href'
        ? <Link href={op.action.href} className="tap" style={actionStyle}>{content}</Link>
        : <button type="button" onClick={() => onAction(op.action)} className="tap" style={actionStyle}>{content}</button>}

      {/* HOW YOU SEE THE REST — one compact control inside the same bar, past a hairline
          divider. Shows "n/N" and one chevron (a loop on the last), cycling and wrapping.
          Sibling of the action so nothing is nested in a tap target. */}
      {list.length > 1 && (
        <button type="button" onClick={() => setI(v => (v + 1) % list.length)}
          aria-label={idx === list.length - 1 ? 'Back to first suggestion' : 'Next suggestion'}
          className="tap"
          style={{
            flexShrink: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            padding: '0 0.75rem', cursor: 'pointer',
            background: 'transparent', border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          }}>
          <span className="font-karla font-800 tracking-[0.04em]" style={{ fontSize: '0.56rem', color: '#8a857c' }}>
            {idx + 1}/{list.length}
          </span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8c2b6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            {idx === list.length - 1 ? <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.5 2.8M3 4v4h4" /> : <path d="M9 6l6 6-6 6" />}
          </svg>
        </button>
      )}
    </motion.div>
  )
}
