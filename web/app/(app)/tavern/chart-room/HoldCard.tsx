'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'

const GOLD = '#f0c040'

/** Door card for The Quartermaster's Hold inside the Chart Room lobby.
 *  Parchment manifest scene: a faint cargo grid with a few lit lots and
 *  a slow drifting glow, so it reads as a half-stowed hold. Shows the
 *  day's progress chip (N/3 holds stowed + ⟡ banked). */
export default function HoldCard({ solvedCount, doubloonsToday }: { solvedCount: number; doubloonsToday: number }) {
  return (
    <ScenicCard
      href="/tavern/chart-room/hold"
      title="The Hold"
      gradient={['#3a2f14', '#221a0c', '#100a04']}
      accent="#c4a96a"
    >
      {/* Lantern wash over the manifest */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.28, 0.46, 0.28] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: 2, left: '50%', translateX: '-50%',
          width: 150, height: 120,
          background: 'radial-gradient(ellipse at center, rgba(240,200,110,0.3) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Faint 9x9 cargo grid */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
          display: 'grid', gridTemplateColumns: 'repeat(9, 11px)', gridTemplateRows: 'repeat(9, 11px)', gap: 1,
        }}
      >
        {Array.from({ length: 81 }).map((_, i) => {
          const lit = [10, 12, 20, 28, 34, 40, 48, 56, 60, 68, 70].includes(i)
          return (
            <motion.div
              key={i}
              animate={lit ? { opacity: [0.4, 0.85, 0.4] } : undefined}
              transition={lit ? { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.4 } : undefined}
              className="font-cinzel font-700"
              style={{
                width: 11, height: 11, borderRadius: 2,
                background: lit ? `${GOLD}22` : 'rgba(196,169,106,0.05)',
                border: `0.5px solid ${lit ? `${GOLD}55` : 'rgba(196,169,106,0.18)'}`,
                color: GOLD, fontSize: '0.42rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {lit ? ((i % 9) + 1) : ''}
            </motion.div>
          )
        })}
      </div>
      {/* Day progress chip */}
      <span
        className="font-karla font-700"
        style={{
          position: 'absolute', top: 8, right: 10,
          fontSize: '0.58rem', letterSpacing: '0.04em',
          color: doubloonsToday > 0 ? GOLD : '#9a9488',
          background: 'rgba(14,10,4,0.7)',
          border: '1px solid rgba(196,169,106,0.35)',
          borderRadius: 999, padding: '0.2rem 0.55rem',
        }}
      >
        {solvedCount >= 3 ? `Done · +${doubloonsToday} ⟡` : `${solvedCount}/3 stowed`}
      </span>
    </ScenicCard>
  )
}
