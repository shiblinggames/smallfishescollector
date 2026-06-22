'use client'

// Tavern hub card for the Casino — the single door into Blackjack /
// Fish Slots / Fish Roulette, which share one chip purse via the
// /tavern/casino lobby. Velvet-red card-room scene. The card is a half
// card on the Games row now, so instead of posing all three tables at
// once (too busy at that width) it rotates through one game at a time
// with a slow crossfade — a lazy 9s dwell per game so it reads as
// ambient scenery, not a slideshow.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScenicCard from './ScenicCard'
import { ResetPill } from '@/components/ResetCountdown'

const TABLES = ['/blackjack.png', '/roulette.png', '/fishslots.png'] as const

export default function CasinoHubCard({ capped = false }: { capped?: boolean }) {
  const [tableIdx, setTableIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTableIdx(i => (i + 1) % TABLES.length), 9000)
    return () => clearInterval(t)
  }, [])

  return (
    <ScenicCard
      href="/tavern/casino"
      title="The Den"
      gradient={['#4a1212', '#2a0808', '#100404']}
      accent="#c63838"
      badge={capped ? <ResetPill kind="daily" prefix="Cap resets in" accent="#f3c6c6" /> : undefined}
    >
      {/* Velvet sheen — felt lit from above, slow pulse. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.34, 0.5, 0.34] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          translateX: '-50%',
          width: 220,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(198,56,56,0.42) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* One table at a time, slow crossfade between the three games.
          Both images render absolute in the same spot during the swap
          so the scene never jumps. */}
      <AnimatePresence>
        <motion.img
          key={tableIdx}
          src={TABLES[tableIdx]}
          alt=""
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            bottom: 42,
            left: '50%',
            // x (not a static transform) so framer's opacity tween
            // doesn't clobber the centering translate.
            x: '-50%',
            height: 96,
            objectFit: 'contain',
            filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
            pointerEvents: 'none',
          }}
        />
      </AnimatePresence>
    </ScenicCard>
  )
}
