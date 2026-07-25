'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Blackjack. Velvet-red casino-table scene —
 *  the blackjack-table art sits over a warm red halo, with a slow
 *  gentle tilt so the card doesn't look dead. (Named *HubCard* to
 *  avoid colliding with the BlackjackCard render fn inside
 *  Blackjack.tsx that draws an actual playing card.) */
export default function BlackjackHubCard() {
  return (
    <ScenicCard
      href="/tavern/blackjack"
      title="Blackjack"
      gradient={['#4a1212', '#2a0808', '#100404']}
      accent="#c63838"
      bgImage="/blackjack-bg.jpg"
    >
      {/* Velvet sheen — the central red glow that feels like felt
          lit from above. Subtle pulse so the card doesn't look dead. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.34, 0.5, 0.34] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          translateX: '-50%',
          width: 160,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(198,56,56,0.42) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/blackjack.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-1.4, 1.0, -1.4] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          translateX: '-50%',
          height: 116,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
          transformOrigin: '50% 100%',
        }}
      />
    </ScenicCard>
  )
}
