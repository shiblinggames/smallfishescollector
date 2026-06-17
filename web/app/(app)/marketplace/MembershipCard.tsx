'use client'

import { motion } from 'framer-motion'
import ScenicCard from '@/app/(app)/tavern/ScenicCard'
import { openMembership } from '@/components/MembershipModal'

/** Marketplace card for the Membership upsell. Warm gold scene that
 *  reads as treasure / value — the membership art breathes gently
 *  with a syncing gold halo behind it. Title swaps to "You're a
 *  Member" once premium is active so the card still feels meaningful
 *  for existing members instead of always pitching them. External
 *  link (Shopify product page), so ScenicCard opens it in a new tab. */
export default function MembershipCard({ isPremium }: { isPremium: boolean }) {
  return (
    <ScenicCard
      href="#"
      title={isPremium ? "You're a Member" : 'Membership'}
      gradient={['#3a2a0e', '#1f160a', '#0e0a06']}
      accent="#f0c040"
      onActivate={isPremium ? () => {} : openMembership}
    >
      <motion.div
        aria-hidden
        animate={{ opacity: [0.40, 0.62, 0.40], scale: [1, 1.06, 1] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 160,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(240,192,64,0.42) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/membership.png"
        alt=""
        aria-hidden
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          translateX: '-50%',
          height: 106,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.55)) drop-shadow(0 0 12px rgba(240,192,64,0.4))',
        }}
      />
    </ScenicCard>
  )
}
