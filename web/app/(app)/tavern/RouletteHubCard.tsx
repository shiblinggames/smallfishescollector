'use client'

// Tavern hub card for Fish Roulette. Green-felt casino-table scene —
// the roulette-table art over a green-gold halo. Themed to balance
// against the warm-red Blackjack card and the cool-blue Fish Slots
// card so the arcade row reads as three distinct tables at a glance.

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

      {/* The roulette-table art — gentle tilt matching the Blackjack
          card so the Den tables read as a set. */}
      <motion.img
        src="/roulette.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-1.4, 1.0, -1.4] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          translateX: '-50%',
          height: 116,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
          transformOrigin: '50% 100%',
        }}
      />
    </ScenicCard>
  )
}
