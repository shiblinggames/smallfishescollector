'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'

const GOLD = '#f0c040'
const TOKENS = ['🪙', '💎', '⚓', '🐚', '🐟', '💎', '🪙', '⚓', '💎']

/** Door card for Treasure Match (weekly Match-3) in the Chart Room.
 *  Scene: a little grid of treasures with a few gently pulsing — reads
 *  as "line up the loot". Shows whether the week's board is cleared. */
export default function TreasureMatchCard({ status, reward }: { status: 'active' | 'cleared'; reward: number }) {
  const cleared = status === 'cleared'
  return (
    <ScenicCard
      href="/charting"
      title="Treasure Match"
      gradient={['#3a2a12', '#231908', '#100a04']}
      accent="#d4a544"
    >
      <motion.div
        aria-hidden
        animate={{ opacity: [0.28, 0.46, 0.28] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 2, left: '50%', translateX: '-50%', width: 150, height: 110, background: 'radial-gradient(ellipse at center, rgba(240,200,110,0.32) 0%, transparent 70%)', pointerEvents: 'none' }}
      />
      <div aria-hidden style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gap: 5 }}>
        {TOKENS.map((t, i) => (
          <motion.div
            key={i}
            animate={{ scale: [1, i % 4 === 0 ? 1.18 : 1, 1] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.35 }}
            style={{
              width: 30, height: 30, borderRadius: 7, fontSize: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(212,165,68,0.14)', border: '1px solid rgba(212,165,68,0.4)',
            }}
          >
            {t}
          </motion.div>
        ))}
      </div>
      <span
        className="font-karla font-700"
        style={{
          position: 'absolute', top: 8, right: 10, fontSize: '0.58rem', letterSpacing: '0.04em',
          color: cleared ? GOLD : '#e0c890',
          background: 'rgba(14,10,4,0.72)', border: '1px solid rgba(212,165,68,0.45)',
          borderRadius: 999, padding: '0.2rem 0.55rem',
        }}
      >
        {cleared ? `Maxed · ${reward}/5` : 'This week'}
      </span>
    </ScenicCard>
  )
}
