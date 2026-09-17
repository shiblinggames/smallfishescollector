'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** The Den's door into Fish Roulette. The wheel art tilts on the same
 *  cadence as the Blackjack table so the two read as a set. */
export default function RouletteHubCard() {
  return (
    <ScenicCard
      href="/tavern/roulette"
      title="Fish Roulette"
      blurb="Bet on a number, a color, odd or even, and let the wheel decide. A single number pays 35 to 1."
      accent="#7fd6a0"
    >
      <motion.img
        src="/roulette.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-1.4, 1.0, -1.4] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 6, left: '50%', translateX: '-50%', height: 86, objectFit: 'contain', transformOrigin: '50% 100%' }}
      />
    </ScenicCard>
  )
}
