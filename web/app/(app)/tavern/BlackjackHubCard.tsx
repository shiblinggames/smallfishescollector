'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** The Den's door into Blackjack. The table art tilts slowly. (Named
 *  *HubCard* to keep clear of the BlackjackCard render fn inside
 *  Blackjack.tsx, which draws an actual playing card.) */
export default function BlackjackHubCard() {
  return (
    <ScenicCard
      href="/tavern/blackjack"
      title="Blackjack"
      blurb="Beat the dealer to 21. A natural pays three to two."
      accent="#d9534f"
    >
      <motion.img
        src="/blackjack.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-1.4, 1.0, -1.4] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 6, left: '50%', translateX: '-50%', height: 86, objectFit: 'contain', transformOrigin: '50% 100%' }}
      />
    </ScenicCard>
  )
}
