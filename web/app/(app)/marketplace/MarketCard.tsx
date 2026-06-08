'use client'

import { motion } from 'framer-motion'
import ScenicCard from '@/app/(app)/tavern/ScenicCard'

/** Marketplace hero card for Fish Market. Hero placement (the only
 *  card in its row, sized taller than the upgrade/shop pairs) — deep
 *  ocean gradient, Blue Marlin drifting across the scene like a fish
 *  cruising past the player. Slight diagonal drift + soft y-bob so
 *  the motion reads as swimming, not vibrating. */
export default function MarketCard({ marlinUrl }: { marlinUrl: string }) {
  return (
    <ScenicCard
      href="/tavern/market"
      title="Fish Market"
      gradient={['#0e2c44', '#0a1b2e', '#040a14']}
      accent="#38bdf8"
      height={188}
    >
      {/* Deep-water shimmer — a soft blue halo behind the marlin so
          it reads as suspended mid-water rather than floating in
          empty space. Slow scale envelope so the depth feels alive. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.32, 0.5, 0.32], scale: [1, 1.04, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '70%',
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(56,189,248,0.32) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* Marlin — swims slowly in place with a gentle drift + bob.
          Times skewed so the keyframes feel organic, not metronomic. */}
      <motion.img
        src={marlinUrl}
        alt=""
        aria-hidden
        animate={{
          x: [-6, 6, -3, 4, -6],
          y: [0, -4, 0, 3, 0],
          rotate: [-1.2, 1.4, -0.4, 1.0, -1.2],
        }}
        transition={{
          duration: 7.2,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.26, 0.52, 0.78, 1],
        }}
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          translateX: '-50%',
          height: 120,
          objectFit: 'contain',
          filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.55))',
        }}
      />
    </ScenicCard>
  )
}
