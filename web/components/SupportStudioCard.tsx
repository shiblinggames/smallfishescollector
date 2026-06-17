'use client'

// Pronounced "support the studio" banner for the tavern home. A full-width,
// clearly-tappable card — crown badge, headline, value line, and a gold "Join"
// pill — that opens the membership popup. Members instead see a small thanks.

import { motion } from 'framer-motion'
import { openMembership } from './MembershipModal'

const GOLD = '#f0c040'

export default function SupportStudioCard({ isPremium }: { isPremium: boolean }) {
  if (isPremium) {
    return (
      <p className="font-karla text-center" style={{ fontSize: '0.74rem', color: '#8a8270' }}>
        Thanks for being a Captain — you keep our indie studio afloat. ⚓
      </p>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={openMembership}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
      style={{
        position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 13,
        padding: '0.95rem 1rem', borderRadius: 16, overflow: 'hidden',
        background: [
          'radial-gradient(120% 140% at 0% 0%, rgba(240,192,64,0.20) 0%, transparent 55%)',
          'linear-gradient(180deg, #221a0c 0%, #161009 100%)',
        ].join(', '),
        border: `1px solid ${GOLD}55`,
        boxShadow: `0 6px 20px rgba(0,0,0,0.4), 0 0 22px ${GOLD}14, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      {/* Captain crew portrait — the great white */}
      <div style={{
        flexShrink: 0, width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 32%, #1f4360 0%, #0b1923 100%)',
        border: `1.5px solid ${GOLD}aa`,
        boxShadow: `0 3px 11px rgba(0,0,0,0.5), 0 0 12px ${GOLD}22, inset 0 0 10px rgba(0,0,0,0.4)`,
      }}>
        <img src="/fish/great-white-shark.png" alt="" aria-hidden draggable={false} style={{ width: '90%', height: '90%', objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      </div>

      {/* Copy */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-800" style={{ fontSize: '1rem', color: '#f5ecd6', lineHeight: 1.15 }}>
          Become a Captain
        </p>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b3a98f', lineHeight: 1.35, marginTop: 2 }}>
          Support our indie studio · <span className="font-700" style={{ color: GOLD }}>$9.99</span> once, perks for life
        </p>
      </div>

      {/* Join pill */}
      <span className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '0.5rem 0.9rem', borderRadius: 999,
        background: 'linear-gradient(180deg, #ffe08a 0%, #f3c651 46%, #e0a52a 100%)',
        border: '1px solid #ffe9ab', color: '#3a2606', fontSize: '0.72rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
      }}>
        Join
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </motion.button>
  )
}
