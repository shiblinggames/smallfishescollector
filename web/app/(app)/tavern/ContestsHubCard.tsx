'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** The Tavern's door into /tavern/contests: the races against every other
 *  captain. The trophy bobs; the "New" chip shows until the page is opened. */
export default function ContestsHubCard({ hasNew = false }: { hasNew?: boolean }) {
  return (
    <ScenicCard
      href="/tavern/contests"
      title="Contests"
      blurb="Races against every other captain. First to the mark takes the prize, for keeps."
      accent="#f0c040"
      chip={hasNew ? { text: 'New', lit: true } : undefined}
    >
      <motion.div aria-hidden animate={{ y: [0, -4, 0, 3, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: 4, left: '50%', x: '-50%', pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/contestsicon.webp" alt="" draggable={false} style={{ height: 88, width: 'auto', display: 'block', objectFit: 'contain' }} />
      </motion.div>
    </ScenicCard>
  )
}
