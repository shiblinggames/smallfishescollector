'use client'

import type React from 'react'

// Shared header chrome for every marketplace shop (Tackle, Shipyard, Redeem)
// and the in-shop section views. A tactile back pill on the left (same plate +
// gold edge as BackButton) and a centered Cinzel title. The live doubloon purse
// is NOT repeated here — the global Nav already carries it on every page.
//
// Two back modes: pass `href` to route somewhere (hub -> shop), or `onBack` to
// run a callback (the Tackle Shop's section -> landing, which is local state,
// not a route). One of the two should always be supplied.

import Link from 'next/link'
import { motion } from 'framer-motion'

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

const PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '0.42rem 0.72rem 0.42rem 0.55rem', borderRadius: 999,
  fontSize: '0.6rem', letterSpacing: '0.1em', color: '#e3d8bc',
  background: 'linear-gradient(180deg, rgba(40,32,17,0.9) 0%, rgba(20,15,8,0.92) 100%)',
  border: '1px solid rgba(196,169,106,0.5)',
  textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
  boxShadow: '0 2px 9px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
}

export default function ShopHeader({
  title, backLabel, href, onBack, accent = '#f0c040', badge, coach,
}: {
  /** `data-coach` handle on the BACK control, for a walkthrough that needs to
   *  point at the way out. A shop is a room somebody can get stuck in. */
  coach?: string
  title: string
  backLabel: string
  href?: string
  onBack?: () => void
  accent?: string
  /** Optional pill on the right. The Tackle Shop uses it to carry the player's
   *  Fishing level, since every gate in that shop is a fishing-level gate and the
   *  number was only visible back on the fishing screen. Generic on purpose: the
   *  Shipyard's gates are Nav levels and can use the same slot. */
  badge?: React.ReactNode
}) {
  const back = href ? (
    <motion.div whileTap={{ scale: 0.9 }} whileHover={{ y: -1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }} style={{ display: 'inline-flex' }}>
      <Link href={href} data-coach={coach} aria-label={`Back to ${backLabel}`} className="font-karla font-700 uppercase" style={PILL_STYLE}>
        <Chevron />{backLabel}
      </Link>
    </motion.div>
  ) : (
    <motion.button
      onClick={onBack}
      data-coach={coach}
      aria-label={`Back to ${backLabel}`}
      className="font-karla font-700 uppercase"
      whileTap={{ scale: 0.9 }} whileHover={{ y: -1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={PILL_STYLE}
    >
      <Chevron />{backLabel}
    </motion.button>
  )

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 36, marginBottom: 18 }}>
      {back}
      <p
        className="font-cinzel font-700"
        style={{
          position: 'absolute', left: 0, right: 0, textAlign: 'center',
          fontSize: '1.15rem', color: '#f4ecd8', letterSpacing: '0.03em',
          textShadow: `0 1px 3px rgba(0,0,0,0.7), 0 0 14px ${accent}40`,
          pointerEvents: 'none',
        }}
      >
        {title}
      </p>
      {badge ?? <span style={{ width: 1 }} />}
    </div>
  )
}
