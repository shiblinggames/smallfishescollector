'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Recruit Crew. Warm amber tavern-interior
 *  scene — the crew lineup lit by a lantern hanging just out of
 *  frame. Soft pulse on the warm halo so the room feels alive
 *  (someone's behind the bar). */
export default function RecruitCrewCard() {
  return (
    <ScenicCard
      href="/packs"
      title="Recruit Crew"
      gradient={['#3a2a18', '#1e1610', '#0d0905']}
      accent="#c8a870"
    >
      {/* Lantern glow — gentle pulse, slightly warmer hue than the
          card's parchment-gold accent so the light reads as flame. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.32, 0.46, 0.32], scale: [1, 1.04, 1] }}
        transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 4,
          left: '50%',
          translateX: '-50%',
          width: 160,
          height: 130,
          background: 'radial-gradient(ellipse at center top, rgba(232,180,108,0.38) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/recruitcrew.png"
        alt=""
        aria-hidden
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          translateX: '-50%',
          height: 106,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
        }}
      />
    </ScenicCard>
  )
}
