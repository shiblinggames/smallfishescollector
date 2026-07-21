'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for The Parlor — the single door into the trivia
 *  games (/tavern/trivia lobby). A painted pirate quiz-board floats on
 *  the deep-violet study gradient, gentle bob only. */
export default function TriviaHubCard() {
  return (
    <ScenicCard
      href="/tavern/trivia"
      title="The Parlor"
      gradient={['#2a2050', '#191338', '#0c0a20']}
      accent="#a78bfa"
    >
      {/* Lantern halo behind the board */}
      <div aria-hidden style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 180, height: 120, background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.24) 0%, transparent 68%)', pointerEvents: 'none' }} />
      {/* The quiz board, bobbing gently. */}
      <motion.div aria-hidden animate={{ y: [0, -4, 0, 3, 0] }} transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 18, left: '50%', x: '-50%', pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/parloricon.webp" alt="" draggable={false} style={{ height: 108, width: 'auto', display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.55))' }} />
      </motion.div>
    </ScenicCard>
  )
}
