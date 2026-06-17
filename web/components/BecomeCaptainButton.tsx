'use client'

// Reusable, unmistakably-clickable "Become a Captain" CTA. A solid gold pill
// with a crown + dark high-contrast label, a soft glow, and a tap-press — used
// everywhere the old tiny gold text-links used to hide. Opens the in-app
// membership popup.

import { motion } from 'framer-motion'
import { openMembership } from './MembershipModal'

export default function BecomeCaptainButton({
  label = 'Become a Captain',
  full = false,
  style,
}: {
  label?: string
  full?: boolean
  style?: React.CSSProperties
}) {
  return (
    <motion.button
      type="button"
      onClick={openMembership}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      className="font-cinzel font-700"
      style={{
        display: full ? 'flex' : 'inline-flex',
        width: full ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 9,
        padding: '0.72rem 1.25rem', borderRadius: 999,
        background: 'linear-gradient(180deg, #ffe08a 0%, #f3c651 46%, #e0a52a 100%)',
        border: '1px solid #ffe9ab', color: '#3a2606',
        fontSize: '0.9rem', letterSpacing: '0.01em', cursor: 'pointer',
        boxShadow: '0 5px 16px rgba(240,192,64,0.36), inset 0 1px 0 rgba(255,255,255,0.6)',
        ...style,
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
        <path d="M3 18.2 1.5 7.6l5 3.5L12 4.4l5.5 6.7 5-3.5L21 18.2H3Zm0 1.6h18v1.8H3v-1.8Z" />
      </svg>
      <span>{label}</span>
    </motion.button>
  )
}
