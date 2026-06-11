'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Trivia Night — the single door into the trivia
 *  games (/tavern/trivia lobby), taking the slot Fish of the Day held.
 *  Deep violet study scene: three question marks in the category
 *  colors drifting like lantern light, gentle bob only (no hard
 *  motion on the hub). */
export default function TriviaHubCard() {
  return (
    <ScenicCard
      href="/tavern/trivia"
      title="Trivia Night"
      gradient={['#2a2050', '#191338', '#0c0a20']}
      accent="#a78bfa"
    >
      {/* Lantern glow behind the marks */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 150,
          height: 110,
          background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.22) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* Three question marks, staggered sizes and bob phases. */}
      {[
        { left: '24%', top: 36, size: '1.7rem', color: '#60a5fa', delay: 0, dur: 5.2 },
        { left: '50%', top: 20, size: '2.6rem', color: '#a78bfa', delay: 0.9, dur: 5.8 },
        { left: '74%', top: 42, size: '1.45rem', color: '#f0c040', delay: 1.7, dur: 5.5 },
      ].map((q, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="font-cinzel font-700"
          animate={{ y: [0, -5, 0, 3, 0] }}
          transition={{ duration: q.dur, repeat: Infinity, ease: 'easeInOut', delay: q.delay }}
          style={{
            position: 'absolute',
            left: q.left,
            top: q.top,
            // x (not a static transform) so the animated y doesn't
            // clobber the centering translate.
            x: '-50%',
            fontSize: q.size,
            lineHeight: 1,
            color: q.color,
            textShadow: `0 2px 10px rgba(0,0,0,0.7), 0 0 18px ${q.color}66`,
            pointerEvents: 'none',
          }}
        >
          ?
        </motion.span>
      ))}
    </ScenicCard>
  )
}
