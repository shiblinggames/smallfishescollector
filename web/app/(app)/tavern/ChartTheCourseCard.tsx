'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Chart the Course. Warm sepia / lamp-lit scene
 *  — the chart unrolled on a navigator's desk by candlelight. Subtle
 *  flicker on a soft warm halo behind it so the room feels lived-in. */
export default function ChartTheCourseCard() {
  return (
    <ScenicCard
      href="/charting"
      title="Chart the Course"
      gradient={['#3a2510', '#1f1408', '#0f0905']}
      accent="#e3a857"
    >
      {/* Candle-flicker halo. Lower-amplitude than the Daily Bonus
          breathe so it reads as flame-light, not a heartbeat. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.32, 0.5, 0.36, 0.48, 0.32] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          translateX: '-50%',
          width: 160,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(240,180,80,0.32) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/chartthecourse.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-0.6, 0.4, -0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          translateX: '-50%',
          height: 104,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))',
          transformOrigin: '50% 100%',
        }}
      />
    </ScenicCard>
  )
}
