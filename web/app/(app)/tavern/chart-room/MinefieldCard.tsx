'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'

const GOLD = '#f0c040'

/** Door card for The Minefield (weekly minesweeper) in the Chart Room.
 *  Dark-harbor scene: a few drifting mines bobbing on night water with a
 *  slow lantern sweep. Shows whether the week's board is cleared. */
export default function MinefieldCard({ status, reward }: { status: 'active' | 'cleared'; reward: number }) {
  const cleared = status === 'cleared'
  return (
    <ScenicCard
      href="/charting"
      title="The Minefield"
      gradient={['#123042', '#0b2030', '#06121c']}
      accent="#4f9bd0"
    >
      {/* Lantern sweep over the water */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.22, 0.42, 0.22] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: 0, left: '50%', translateX: '-50%',
          width: 170, height: 120,
          background: 'radial-gradient(ellipse at center, rgba(120,190,235,0.3) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Drifting mines */}
      {[{ l: '26%', t: 34, d: 5.2, delay: 0 }, { l: '52%', t: 22, d: 6.1, delay: 0.7 }, { l: '74%', t: 40, d: 5.6, delay: 1.4 }].map((m, i) => (
        <motion.div
          key={i}
          aria-hidden
          animate={{ y: [0, -5, 0, 4, 0] }}
          transition={{ duration: m.d, repeat: Infinity, ease: 'easeInOut', delay: m.delay }}
          style={{ position: 'absolute', left: m.l, top: m.t, transform: 'translateX(-50%)' }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #3a4a55 0%, #10181f 70%)',
            border: '1px solid rgba(120,170,210,0.35)',
            boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
            position: 'relative',
          }}>
            {/* spikes */}
            {[0, 45, 90, 135].map(a => (
              <span key={a} style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 24, marginLeft: -1, marginTop: -12, background: 'rgba(150,180,205,0.4)', transform: `rotate(${a}deg)`, borderRadius: 1 }} />
            ))}
          </div>
        </motion.div>
      ))}
      {/* Weekly status chip */}
      <span
        className="font-karla font-700"
        style={{
          position: 'absolute', top: 8, right: 10,
          fontSize: '0.58rem', letterSpacing: '0.04em',
          color: cleared ? GOLD : '#9ec4dd',
          background: 'rgba(6,18,28,0.72)',
          border: '1px solid rgba(120,170,210,0.4)',
          borderRadius: 999, padding: '0.2rem 0.55rem',
        }}
      >
        {cleared ? `Cleared · +${reward} pts` : 'This week'}
      </span>
    </ScenicCard>
  )
}
