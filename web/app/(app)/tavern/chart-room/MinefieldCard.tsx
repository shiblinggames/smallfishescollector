'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'

/** The Chart Room's door into the Minefield, the weekly minesweeper.
 *  Three mines bob on the water. */
export default function MinefieldCard({ status, reward }: { status: 'active' | 'cleared'; reward: number }) {
  const cleared = status === 'cleared'
  return (
    <ScenicCard
      href="/charting/minefield"
      title="The Minefield"
      blurb="Minesweeper on night water. The numbers count the mines beside them; flag every one and clear the rest."
      accent="#4f9bd0"
      chip={{ text: cleared ? `Cleared · +${reward} pts` : `This week · +${reward} pts`, lit: cleared }}
    >
      {[{ l: '30%', t: 30, d: 5.2, delay: 0 }, { l: '52%', t: 14, d: 6.1, delay: 0.7 }, { l: '72%', t: 38, d: 5.6, delay: 1.4 }].map((m, i) => (
        <motion.div
          key={i}
          aria-hidden
          animate={{ y: [0, -5, 0, 4, 0] }}
          transition={{ duration: m.d, repeat: Infinity, ease: 'easeInOut', delay: m.delay }}
          style={{ position: 'absolute', left: m.l, top: m.t, transform: 'translateX(-50%)' }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: '50%', position: 'relative',
            background: 'radial-gradient(circle at 35% 30%, #3a4a55 0%, #10181f 70%)',
            border: '1px solid rgba(120,170,210,0.35)',
          }}>
            {[0, 45, 90, 135].map(a => (
              <span key={a} style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 24, marginLeft: -1, marginTop: -12, background: 'rgba(150,180,205,0.4)', transform: `rotate(${a}deg)`, borderRadius: 1 }} />
            ))}
          </div>
        </motion.div>
      ))}
    </ScenicCard>
  )
}
