'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Contests — the door into /tavern/contests, which
 *  tracks active community races + their winners. Warm gold "podium"
 *  scene: a trophy glow with a gentle shimmer, no hard motion. */
export default function ContestsHubCard({ hasNew = false }: { hasNew?: boolean }) {
  return (
    <ScenicCard
      href="/tavern/contests"
      title="Contests"
      gradient={['#3a2e12', '#241b0c', '#100c06']}
      accent="#f0c040"
    >
      {/* "New" pulse — shows until the player opens the Contests page (cleared
          by markContestsSeen). Re-arm by resetting has_seen_contests when a new
          contest launches. */}
      {hasNew && (
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.12, 1], boxShadow: ['0 0 8px rgba(240,192,64,0.6)', '0 0 16px rgba(240,192,64,0.95)', '0 0 8px rgba(240,192,64,0.6)'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="font-karla font-800 uppercase"
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 4,
            fontSize: '0.5rem', letterSpacing: '0.12em', color: '#1a1206',
            background: 'linear-gradient(180deg, #ffe793, #f0c040)',
            border: '1px solid #fff3c8', borderRadius: 999, padding: '2px 7px',
            pointerEvents: 'none',
          }}
        >
          New
        </motion.span>
      )}
      {/* Trophy glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 150,
          height: 110,
          background: 'radial-gradient(ellipse at center, rgba(240,192,64,0.26) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* The trophy, bobbing gently. */}
      <motion.span
        aria-hidden
        animate={{ y: [0, -5, 0, 3, 0] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          left: '50%', top: 24,
          x: '-50%',
          fontSize: '3rem',
          lineHeight: 1,
          textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 0 22px rgba(240,192,64,0.5)',
          pointerEvents: 'none',
        }}
      >
        🏆
      </motion.span>
      {/* Two small medals flanking, slower bob. */}
      {[
        { left: '26%', top: 58, emoji: '🥈', delay: 0.7, dur: 6.2 },
        { left: '74%', top: 58, emoji: '🥉', delay: 1.5, dur: 6.6 },
      ].map((m, i) => (
        <motion.span
          key={i}
          aria-hidden
          animate={{ y: [0, -4, 0, 2, 0] }}
          transition={{ duration: m.dur, repeat: Infinity, ease: 'easeInOut', delay: m.delay }}
          style={{
            position: 'absolute',
            left: m.left, top: m.top,
            x: '-50%',
            fontSize: '1.5rem',
            lineHeight: 1,
            opacity: 0.9,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }}
        >
          {m.emoji}
        </motion.span>
      ))}
    </ScenicCard>
  )
}
