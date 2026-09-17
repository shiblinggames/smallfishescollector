'use client'

// ── THE WAY OUT OF A ROOM ───────────────────────────────────────────────────
//
// One pill, one definition. This shape existed twice, character for character,
// in BackButton and in ShopHeader, which is two places for one look to drift
// apart from itself. Everything that shows a way back now draws it from here.
//
// Two modes, and both are needed. `href` for a room you leave by going
// somewhere (nearly all of them). `onBack` for a view that is local state
// rather than a route, which is the Tackle Shop's section screens: they are not
// pages, so there is nothing to navigate to.

import type React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

const PILL: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '0.42rem 0.72rem 0.42rem 0.55rem', borderRadius: 999,
  fontSize: '0.6rem', letterSpacing: '0.1em', color: '#e3d8bc',
  background: 'linear-gradient(180deg, rgba(40,32,17,0.9) 0%, rgba(20,15,8,0.92) 100%)',
  border: '1px solid rgba(196,169,106,0.5)',
  textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
  boxShadow: '0 2px 9px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
}

const SPRING = { type: 'spring' as const, stiffness: 600, damping: 22 }

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f0c040"
      strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export default function BackPill({ label, href, onBack, coach }: {
  /** Where it goes, said plainly. "The Sea", "The Den", not "Back". */
  label: string
  href?: string
  onBack?: () => void
  /** `data-coach` handle, for a tour pointing at the way out. */
  coach?: string
}) {
  const inner = <><Chevron />{label}</>
  if (href) {
    return (
      <motion.div whileTap={{ scale: 0.9 }} whileHover={{ y: -1 }} transition={SPRING} style={{ display: 'inline-flex' }}>
        <Link href={href} data-coach={coach} aria-label={`Back to ${label}`}
          className="font-karla font-700 uppercase" style={PILL}>
          {inner}
        </Link>
      </motion.div>
    )
  }
  return (
    <motion.button type="button" onClick={onBack} data-coach={coach} aria-label={`Back to ${label}`}
      className="font-karla font-700 uppercase"
      whileTap={{ scale: 0.9 }} whileHover={{ y: -1 }} transition={SPRING} style={PILL}>
      {inner}
    </motion.button>
  )
}
