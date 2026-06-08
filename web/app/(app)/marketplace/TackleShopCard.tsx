'use client'

import { motion } from 'framer-motion'
import ScenicCard from '@/app/(app)/tavern/ScenicCard'

/** Marketplace card for Tackle Shop. Cyan-teal gradient — the rod
 *  itself sways gently as if cast just-so, pivoting at the handle
 *  (top of the image since the rod is rendered tip-down on the
 *  thumb). */
export default function TackleShopCard() {
  return (
    <ScenicCard
      href="/marketplace/tackle-shop"
      title="Tackle Shop"
      gradient={['#0e3038', '#0a1d24', '#040d12']}
      accent="#22d3ee"
    >
      <motion.div
        aria-hidden
        animate={{ opacity: [0.30, 0.46, 0.30] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 150,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.30) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/rod_legendary_thumb.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-2, 1.5, -2] }}
        transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          translateX: '-50%',
          height: 104,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))',
          transformOrigin: '50% 12%',
        }}
      />
    </ScenicCard>
  )
}
