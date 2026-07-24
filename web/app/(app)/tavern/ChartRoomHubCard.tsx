'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'
import { ResetPill } from '@/components/ResetCountdown'

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
      badge={<ResetPill kind="weekly" prefix="New puzzles in" accent="#f0dcae" />}
    >
      {/* Warm lamp halo */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.34, 0.52, 0.36, 0.5, 0.34] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: 4, left: '50%', translateX: '-50%',
          width: 240, height: 140,
          background: 'radial-gradient(ellipse at center, rgba(240,190,90,0.24) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* The chart + sextant art, drifting gently. */}
      <motion.div aria-hidden animate={{ y: [0, -4, 0, 3, 0] }} transition={{ duration: 6.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 8, left: '50%', x: '-50%', pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chartingicon.webp" alt="" draggable={false} style={{ height: 128, width: 'auto', display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.5))' }} />
      </motion.div>
    </ScenicCard>
  )
}
