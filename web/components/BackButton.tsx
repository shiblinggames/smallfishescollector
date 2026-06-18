'use client'

// Shared tactile back button for the tavern (and game) headers. Replaces the
// old tiny "← Tavern" text links: a real pill with a chevron, a dark plate +
// gold edge so it reads over any background, and a springy press so it feels
// like a button you can tap.

import Link from 'next/link'
import { motion } from 'framer-motion'

export default function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <motion.div
      whileTap={{ scale: 0.9 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{ display: 'inline-flex' }}
    >
      <Link
        href={href}
        aria-label={`Back to ${label}`}
        className="font-karla font-700 uppercase"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '0.42rem 0.72rem 0.42rem 0.55rem', borderRadius: 999,
          fontSize: '0.6rem', letterSpacing: '0.1em', color: '#e3d8bc',
          background: 'linear-gradient(180deg, rgba(40,32,17,0.9) 0%, rgba(20,15,8,0.92) 100%)',
          border: '1px solid rgba(196,169,106,0.5)',
          textDecoration: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 2px 9px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {label}
      </Link>
    </motion.div>
  )
}
