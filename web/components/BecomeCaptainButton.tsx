'use client'

// Reusable "Become a Captain" CTA. Styled to match the game's menu language —
// the translucent gold-tint fill, gold border, and light-gold Cinzel label used
// by the Den's "Buy chips" and the modal's "Set sail" — rather than a flat
// candy-gold web button. Opens the in-app membership popup.

import { motion } from 'framer-motion'
import { openMembership } from './MembershipModal'

// The Captain emblem = the Great White crew card art (Expeditions art, not the
// fishing sprite), served from the card-arts bucket.
const CAPTAIN_ART = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/Great_White_Shark.png`

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
      className="font-cinzel font-700 uppercase tracking-[0.08em]"
      style={{
        display: full ? 'flex' : 'inline-flex',
        width: full ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 9,
        padding: '0.7rem 1.15rem', borderRadius: 12,
        background: 'linear-gradient(180deg, rgba(240,192,64,0.24) 0%, rgba(196,169,106,0.11) 100%)',
        border: '1px solid rgba(240,192,64,0.5)', color: '#f0d695',
        fontSize: '0.78rem', cursor: 'pointer',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 12px rgba(0,0,0,0.3)',
        ...style,
      }}
    >
      <img src={CAPTAIN_ART} alt="" aria-hidden draggable={false} style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      <span>{label}</span>
    </motion.button>
  )
}
