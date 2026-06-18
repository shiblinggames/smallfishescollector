'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

const GOLD = '#e3a857'

/** Tavern hub door for The Chart Room — the grid / navigation thinkers'
 *  room (the Quartermaster's Hold sudoku + Charting). Parchment-and-
 *  lamplight scene: a chart grid ruled in gold with a slow drifting
 *  compass rose, full-width hero on its own row. CSS-only scene so it
 *  ships without waiting on bespoke art. */
export default function ChartRoomHubCard() {
  return (
    <ScenicCard
      href="/tavern/chart-room"
      title="Charting"
      gradient={['#3a2c14', '#221a0c', '#0f0a05']}
      accent={GOLD}
    >
      {/* Warm lamp halo */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.3, 0.5, 0.34, 0.48, 0.3] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: 0, left: '50%', translateX: '-50%',
          width: 260, height: 150,
          background: 'radial-gradient(ellipse at center, rgba(240,190,90,0.26) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Ruled chart grid */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(${GOLD}1f 1px, transparent 1px), linear-gradient(90deg, ${GOLD}1f 1px, transparent 1px)`,
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 35%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 35%, black 30%, transparent 75%)',
          pointerEvents: 'none',
        }}
      />
      {/* Drifting compass rose */}
      <motion.span
        aria-hidden
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute', top: 30, left: '50%', translateX: '-50%',
          fontSize: '3.6rem', lineHeight: 1, opacity: 0.5,
          filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.5))',
        }}
      >
        🧭
      </motion.span>
    </ScenicCard>
  )
}
