'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { MATCH_TOKENS } from '@/app/(app)/charting/constants'

// Token indices laid out 3x3, using the SAME crew fish art as the board.
const CELLS = [0, 1, 2, 3, 4, 5, 1, 4, 0]

/** The Chart Room's door into Treasure Match, the weekly match-three. */
export default function TreasureMatchCard({ status, reward }: { status: 'active' | 'cleared'; reward: number }) {
  const cleared = status === 'cleared'
  return (
    <ScenicCard
      href="/charting"
      title="Treasure Match"
      blurb="Swap two treasures to line up three of a kind. Clear the board for charting points."
      accent="#d4a544"
      chip={{ text: cleared ? `Cleared · ${reward}/5` : 'This week', lit: cleared }}
    >
      <div aria-hidden style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gap: 4 }}>
        {CELLS.map((ti, i) => {
          const tok = MATCH_TOKENS[ti] ?? MATCH_TOKENS[0]
          return (
            <motion.div
              key={i}
              animate={{ scale: [1, i % 4 === 0 ? 1.18 : 1, 1] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.35 }}
              style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tok.img} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </motion.div>
          )
        })}
      </div>
    </ScenicCard>
  )
}
