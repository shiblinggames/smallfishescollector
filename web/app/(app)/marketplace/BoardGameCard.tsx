'use client'

import { motion } from 'framer-motion'
import ScenicCard from '@/app/(app)/tavern/ScenicCard'

/** Marketplace card for the Seas the Booty physical board game.
 *  Purple-magenta gradient — the box art rocks gently with a slight
 *  tilt suggesting a card or box being shown off / handed forward.
 *  External link (Shopify product page). */
export default function BoardGameCard() {
  return (
    <ScenicCard
      href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
      title="Board Game"
      gradient={['#2c1a4a', '#170e2c', '#0a0518']}
      accent="#a78bfa"
      external
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 170,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.36) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/physicalboardgame.webp"
        alt=""
        aria-hidden
        animate={{ rotate: [-2.2, 1.6, -2.2], y: [0, -2, 0] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          translateX: '-50%',
          height: 110,
          objectFit: 'contain',
          filter: 'drop-shadow(0 7px 14px rgba(0,0,0,0.6))',
          transformOrigin: '50% 100%',
        }}
      />
    </ScenicCard>
  )
}
