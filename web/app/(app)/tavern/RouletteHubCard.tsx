'use client'

// Tavern hub card for Fish Roulette. Green-felt casino-table scene that
// reads as "the wheel" — a single big pocket dominates the card with a
// subtle spin-shimmer behind it. Themed to balance against the warm-red
// Blackjack card and the cool-blue Fish Slots card so the arcade row
// reads as three distinct tables at a glance.

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

const FELT_GREEN = '#0a3d2a'

export default function RouletteHubCard() {
  return (
    <ScenicCard
      href="/tavern/roulette"
      title="Fish Roulette"
      gradient={[FELT_GREEN, '#06241a', '#02110b']}
      accent="#f0c040"
    >
      {/* Felt sheen — soft green-gold halo. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.32, 0.55, 0.32] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          translateX: '-50%',
          width: 160,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(240,192,64,0.32) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* The wheel itself — single big numbered pocket that slowly
          rotates so the card always feels alive. Number doesn't change
          (purely cosmetic), but the rotation reads as "spinning". */}
      <motion.div
        aria-hidden
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          translateX: '-50%',
          width: 108,
          height: 108,
          borderRadius: '50%',
          background: `radial-gradient(circle at 50% 35%, #c2402e 0%, #c2402e 30%, ${FELT_GREEN} 32%, ${FELT_GREEN} 50%, #1a1a1a 52%, #1a1a1a 70%, #0a7a3a 72%, #0a7a3a 90%)`,
          border: '3px solid #1a0a04',
          boxShadow: '0 6px 18px rgba(0,0,0,0.6), inset 0 0 18px rgba(0,0,0,0.5)',
        }}
      />

      {/* Inner hub — counter-rotates slightly so the rim spins but the
          center stays anchored. Subtle 'ball pocket' hint at 12 o'clock. */}
      <motion.div
        aria-hidden
        animate={{ rotate: -360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          top: 14 + 27,
          left: '50%',
          translateX: '-50%',
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 35%, #2a1a08 0%, #060402 100%)',
          border: '2px solid #1a0a04',
          boxShadow: 'inset 0 0 8px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.5)',
        }}
      />
    </ScenicCard>
  )
}
