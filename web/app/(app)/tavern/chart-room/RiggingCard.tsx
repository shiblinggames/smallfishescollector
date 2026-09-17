'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { openMembership } from '@/components/MembershipModal'
import { RIGGING_PALETTE } from './rigging/constants'

// Same weathered palette as the board: crimson, ocean, bottle green.
const ROPES = [RIGGING_PALETTE[0], RIGGING_PALETTE[3], RIGGING_PALETTE[5]]

/** The Chart Room's door into Lay the Rigging, the weekly flow puzzle.
 *  CAPTAINS ONLY: anyone else sees the lock and the card opens the
 *  membership sheet instead of the deck. */
export default function RiggingCard({ status, reward, isMember }: { status: 'active' | 'cleared'; reward: number; isMember: boolean }) {
  const cleared = status === 'cleared'
  return (
    <ScenicCard
      href={isMember ? '/tavern/chart-room/rigging' : '#'}
      title="Lay the Rigging"
      blurb="Run a rope from each cleat to its match. Cover every plank, cross nothing. Captains only."
      accent="#b98a3e"
      onActivate={isMember ? undefined : openMembership}
      chip={isMember
        ? { text: cleared ? `Rigged · +${reward} pts` : 'This week', lit: cleared }
        : { text: 'Captains', locked: true }}
    >
      <svg aria-hidden viewBox="0 0 120 90" style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', width: 120, height: 90, opacity: isMember ? 1 : 0.45 }}>
        {[
          { c: ROPES[0], d: 'M22,20 C22,50 78,40 78,70', a: [22, 20], b: [78, 70] },
          { c: ROPES[1], d: 'M58,18 C90,18 90,60 60,68', a: [58, 18], b: [60, 68] },
          { c: ROPES[2], d: 'M30,72 C30,40 70,30 98,30', a: [30, 72], b: [98, 30] },
        ].map((r, i) => (
          <g key={i}>
            <path d={r.d} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={4} strokeLinecap="round" transform="translate(1.4 2)" />
            <path d={r.d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={4} strokeLinecap="round" />
            <motion.path
              d={r.d} fill="none" stroke={r.c} strokeWidth={2.9} strokeLinecap="round"
              animate={isMember ? { opacity: [0.72, 1, 0.72] } : undefined}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
            />
            {[r.a, r.b].map((p, j) => (
              <g key={j}>
                <circle cx={p[0]} cy={p[1]} r={5.4} fill="#1c130b" />
                <circle cx={p[0]} cy={p[1]} r={4.3} fill="none" stroke="#b98a3e" strokeWidth={1.2} opacity={0.9} />
                <circle cx={p[0]} cy={p[1]} r={2.5} fill={r.c} stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />
                <circle cx={p[0] - 0.8} cy={p[1] - 1} r={0.8} fill="#ffffff" opacity={0.4} />
              </g>
            ))}
          </g>
        ))}
      </svg>
    </ScenicCard>
  )
}
