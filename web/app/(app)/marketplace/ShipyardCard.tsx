'use client'

import { motion } from 'framer-motion'
import ScenicCard from '@/app/(app)/tavern/ScenicCard'

/** Marketplace card for Shipyard. Sunset-orange gradient framing the
 *  Man o' War like it's docked at the end of the day. Subtle bigger-
 *  ship bob (more weight, slower than Tide Run's smaller skiff) so
 *  the vessel feels massive but still on the water. */
export default function ShipyardCard() {
  return (
    <ScenicCard
      href="/marketplace/shipyard"
      title="Shipyard"
      gradient={['#3a1f0e', '#1f1208', '#0f0805']}
      accent="#fb923c"
    >
      {/* Sunset glow — warm halo behind the ship suggesting late-day
          dockside light. Steady (no pulse) since the ship itself is
          the moving element here. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 170,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(251,146,60,0.34) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/models/man-o-war_v2.png"
        alt=""
        aria-hidden
        animate={{
          y:      [0,    -3,   0,    2,   0],
          rotate: [-1.0, 0.6, -0.3, 0.8, -1.0],
        }}
        transition={{
          duration: 5.8,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.28, 0.55, 0.78, 1],
        }}
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          translateX: '-50%',
          height: 108,
          objectFit: 'contain',
          filter: 'drop-shadow(0 7px 14px rgba(0,0,0,0.6))',
          transformOrigin: '50% 82%',
        }}
      />
    </ScenicCard>
  )
}
