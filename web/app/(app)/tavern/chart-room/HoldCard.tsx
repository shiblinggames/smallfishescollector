'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'

const GOLD = '#f0c040'
const CELL = 9

/** The Chart Room's door into the Hold: a 9x9 cargo sudoku, four a week.
 *  The scene is the manifest itself, a few lots already stowed. */
export default function HoldCard({ solvedCount, doubloonsToday }: { solvedCount: number; doubloonsToday: number }) {
  const chip = solvedCount >= 4 ? `All 4 stowed · +${doubloonsToday} ⟡`
    : solvedCount > 0 ? `${solvedCount}/4 stowed`
    : '4 new holds'
  return (
    <ScenicCard
      href="/tavern/chart-room/hold"
      title="The Hold"
      blurb="Sudoku with cargo: every row, column and bay holds each lot once. Four holds a week, doubloons for each."
      accent="#c4a96a"
      chip={{ text: chip, lit: solvedCount >= 4 }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          display: 'grid', gridTemplateColumns: `repeat(9, ${CELL}px)`, gridTemplateRows: `repeat(9, ${CELL}px)`, gap: 1,
        }}
      >
        {Array.from({ length: 81 }).map((_, i) => {
          const lit = [10, 12, 20, 28, 34, 40, 48, 56, 60, 68, 70].includes(i)
          return (
            <motion.div
              key={i}
              animate={lit ? { opacity: [0.7, 1, 0.7] } : undefined}
              transition={lit ? { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.4 } : undefined}
              className="font-cinzel font-700"
              style={{
                width: CELL, height: CELL, borderRadius: 2,
                background: lit ? `${GOLD}44` : 'rgba(10,7,2,0.45)',
                border: `0.5px solid ${lit ? `${GOLD}99` : 'rgba(196,169,106,0.3)'}`,
                color: GOLD, fontSize: '0.38rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {lit ? ((i % 9) + 1) : ''}
            </motion.div>
          )
        })}
      </div>
    </ScenicCard>
  )
}
