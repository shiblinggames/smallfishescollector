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
      {/* Warm halo behind the art */}
      <div aria-hidden style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 170, height: 120, background: 'radial-gradient(ellipse at center, rgba(240,192,64,0.24) 0%, transparent 68%)', pointerEvents: 'none' }} />
      {/* Trophy art, bobbing gently. */}
      <motion.div aria-hidden animate={{ y: [0, -4, 0, 3, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 6, left: '50%', x: '-50%', pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/contestsicon.webp" alt="" draggable={false} style={{ height: 130, width: 'auto', display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.55))' }} />
      </motion.div>
    </ScenicCard>
  )
}
