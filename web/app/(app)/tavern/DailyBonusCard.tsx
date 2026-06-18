'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Daily Bonus. Warm golden scene — a treasure
 *  chest glowing as if just lit from above. The chest "breathes" with
 *  a tiny scale pulse and a radiating glow behind it shimmers, like
 *  there's still loot inside waiting to be claimed. */
export default function DailyBonusCard() {
  return (
    <ScenicCard
      href="/tavern/daily-bonus"
      title="Login Bonus"
      gradient={['#3a2a0e', '#1f160a', '#0e0a06']}
      accent="#f0c040"
    >
      {/* Radial gold halo behind the chest — pulses on a slow loop to
          suggest the loot inside is "alive" / waiting. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.42, 0.65, 0.42], scale: [1, 1.08, 1] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          translateX: '-50%',
          width: 150,
          height: 140,
          background: 'radial-gradient(ellipse at center, rgba(240,192,64,0.42) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/dailybonus.png"
        alt=""
        aria-hidden
        animate={{ scale: [1, 1.025, 1] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          translateX: '-50%',
          height: 104,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6)) drop-shadow(0 0 10px rgba(240,192,64,0.4))',
          transformOrigin: '50% 60%',
        }}
      />
    </ScenicCard>
  )
}
