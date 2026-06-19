'use client'

// Pronounced Become-a-Captain banner for the tavern home. A full-width,
// clearly-tappable card (Captain portrait, headline, value line, and a gold
// "Unlock" pill) framed around unlocking the full game; opens the purchase
// popup. Members instead see a small thanks.

import { motion } from 'framer-motion'
import { openMembership } from './MembershipModal'

const GOLD = '#f0c040'
// Great White crew card art (Expeditions), from the card-arts bucket.
const CAPTAIN_ART = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/Great_White_Shark.png`

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
      {/* Captain crew portrait — the great white. Rounded-rect frame (not a
          circle) so the full bust + hat + coat shows without clipping. */}
      <div style={{
        flexShrink: 0, width: 54, height: 54, borderRadius: 13, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, #20465f 0%, #0b1923 80%)',
        border: `1.5px solid ${GOLD}aa`,
        boxShadow: `0 3px 11px rgba(0,0,0,0.5), 0 0 12px ${GOLD}22, inset 0 0 10px rgba(0,0,0,0.4)`,
      }}>
        <img src={CAPTAIN_ART} alt="" aria-hidden draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      </div>

      {/* Copy */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-800" style={{ fontSize: '1rem', color: '#f5ecd6', lineHeight: 1.15 }}>
          Become a Captain
        </p>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b3a98f', lineHeight: 1.35, marginTop: 2 }}>
          Unlock the full game · <span className="font-700" style={{ color: GOLD }}>$9.99</span> once, yours forever
        </p>
      </div>

      {/* Join pill */}
      <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '0.5rem 0.9rem', borderRadius: 10,
        background: 'linear-gradient(180deg, rgba(240,192,64,0.26) 0%, rgba(196,169,106,0.12) 100%)',
        border: `1px solid ${GOLD}88`, color: '#f0d695', fontSize: '0.7rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
      }}>
        Unlock
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </motion.button>
  )
}
