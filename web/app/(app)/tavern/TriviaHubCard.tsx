'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'
import { ResetPill } from '@/components/ResetCountdown'
import { HOST_ART } from './trivia/ParlorArt'

/** Tavern hub card for The Parlor — the single door into the trivia
 *  games (/tavern/trivia lobby). The Parlor's host (the Aristocrat) presides,
 *  framed by three floating question marks so the card reads as a quiz game. */
export default function TriviaHubCard() {
  const ACCENT = '#a78bfa'
  return (
    <ScenicCard
      href="/tavern/trivia"
      title="The Parlor"
      gradient={['#2a2050', '#191338', '#0c0a20']}
      accent={ACCENT}
      bgImage="/parlor-bg.jpg"
      badge={<ResetPill kind="weekly" prefix="New boards in" accent="#d9ccf7" />}
    >
      {/* Lantern halo behind the host */}
      <div aria-hidden style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 180, height: 120, background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.26) 0%, transparent 68%)', pointerEvents: 'none' }} />

      {/* The host — the Aristocrat — bobbing gently. */}
      <motion.div aria-hidden animate={{ y: [0, -4, 0, 3, 0] }} transition={{ duration: 6.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 14, left: '50%', x: '-50%', pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HOST_ART} alt="" draggable={false} style={{ height: 112, width: 'auto', display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.55))' }} />
      </motion.div>

      {/* Three question marks framing the host — the quiz-game tell. Each
          floats on its own gentle cadence in the Parlor's violet. */}
      {[
        { left: '20%', top: 20, size: 26, delay: 0, dur: 3.4, dim: 0.9 },
        { left: '50%', top: 6, size: 34, delay: 0.5, dur: 3.9, dim: 1 },
        { left: '80%', top: 24, size: 26, delay: 1.0, dur: 3.6, dim: 0.9 },
      ].map((q, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="font-cinzel font-700"
          animate={{ y: [0, -6, 0], opacity: [q.dim * 0.7, q.dim, q.dim * 0.7] }}
          transition={{ duration: q.dur, repeat: Infinity, ease: 'easeInOut', delay: q.delay }}
          style={{
            position: 'absolute', top: q.top, left: q.left, transform: 'translateX(-50%)',
            fontSize: q.size, lineHeight: 1, color: ACCENT, pointerEvents: 'none',
            textShadow: `0 0 12px ${ACCENT}88, 0 2px 4px rgba(0,0,0,0.6)`,
          }}
        >
          ?
        </motion.span>
      ))}
    </ScenicCard>
  )
}
