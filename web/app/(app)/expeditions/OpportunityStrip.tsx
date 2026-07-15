'use client'

// ── OPPORTUNITY STRIP ────────────────────────────────────────────────────────
// The ongoing "what's worth your time" guide, in the slot Captain's Orders vacates
// once onboarding latches. It shows the single highest-value actionable thing (see
// lib/expeditionOpportunities for the ranking), with a quiet way to page through the
// rest so nothing is hidden. When a captain is caught up it collapses to one calm line
// rather than vanishing, so the space reads as "handled", not broken.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { deriveOpportunities, type Opportunity, type OpportunityState, type OpportunityAction } from '@/lib/expeditionOpportunities'
import Link from 'next/link'

const TONE: Record<Opportunity['tone'], { accent: string; wash: string }> = {
  urgent:   { accent: '#ef4444', wash: 'rgba(220,38,38,0.14)' },
  reward:   { accent: '#f0c040', wash: 'rgba(240,192,64,0.12)' },
  progress: { accent: '#dca494', wash: 'rgba(220,164,148,0.12)' },
  idle:     { accent: '#5eead4', wash: 'rgba(94,234,212,0.10)' },
}

export default function OpportunityStrip({ state, onAction }: {
  state: OpportunityState
  onAction: (a: OpportunityAction) => void
}) {
  const list = deriveOpportunities(state)
  const [i, setI] = useState(0)

  // ── ALL CAUGHT UP ───────────────────────────────────────────────────────────
  // Not hidden. A calm line confirms the guide is working and there is genuinely
  // nothing pending, which is a small reward in itself.
  if (list.length === 0) {
    return (
      <div style={{
        marginBottom: 12, padding: '0.7rem 0.9rem', borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fd4c4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
        <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#8a9a94' }}>
          All squared away, captain. Nothing pending.
        </p>
      </div>
    )
  }

  const idx = Math.min(i, list.length - 1)
  const op = list[idx]
  const t = TONE[op.tone]
  const ctaStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 11,
    padding: '0.55rem 0.95rem', borderRadius: 10, fontSize: '0.78rem', cursor: 'pointer',
    textDecoration: 'none', border: 'none',
    color: '#14100a', background: `linear-gradient(180deg, ${t.accent}, ${t.accent}cc)`,
  }

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.5rem', color: `${t.accent}cc` }}>
          What&rsquo;s Worth Your Time
        </p>
        {list.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.preventDefault()}>
            {/* Page through the rest. Nothing is hidden, it is just ranked. */}
            <button type="button" aria-label="Previous" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setI(v => (v - 1 + list.length) % list.length) }}
              className="tap" style={{ background: 'none', border: 'none', color: `${t.accent}bb`, cursor: 'pointer', padding: 2, display: 'flex' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: '#8a8680', minWidth: 26, textAlign: 'center' }}>
              {idx + 1}/{list.length}
            </span>
            <button type="button" aria-label="Next" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setI(v => (v + 1) % list.length) }}
              className="tap" style={{ background: 'none', border: 'none', color: `${t.accent}bb`, cursor: 'pointer', padding: 2, display: 'flex' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={op.id}
          initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.2 }}>
          <p className="font-cinzel font-800" style={{ fontSize: '1.02rem', color: '#f4ecd8', lineHeight: 1.2, marginTop: 6 }}>
            {op.title}
          </p>
          <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b0a99c', lineHeight: 1.45, marginTop: 4 }}>
            {op.detail}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* The CTA is a REAL button/link, not a fake span inside a tappable card. The
          card used to be one big <button> with the paging chevrons nested inside it —
          a button within a button, invalid HTML, and taps near the arrows could fire
          the card's action instead of paging. Now the container is a plain div and the
          only interactive things are the paging controls and this one explicit CTA. */}
      {op.action.kind === 'href' ? (
        <Link href={op.action.href} className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
          style={ctaStyle}>
          {op.cta}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      ) : (
        <button type="button" onClick={() => onAction(op.action)} className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
          style={ctaStyle}>
          {op.cta}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}
    </>
  )

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      style={{
        marginBottom: 12, padding: '0.85rem 1rem 0.95rem', borderRadius: 16,
        background: `radial-gradient(ellipse at 0% 0%, ${t.wash} 0%, rgba(8,13,22,0.7) 72%)`,
        border: `1px solid ${t.accent}4a`,
      }}>
      {body}
    </motion.div>
  )
}
