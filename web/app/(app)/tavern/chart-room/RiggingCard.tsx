'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { openMembership } from '@/components/MembershipModal'
import { RIGGING_PALETTE } from './rigging/constants'

const GOLD = '#f0c040'
// Same weathered palette as the board — crimson, ocean, bottle green.
const ROPES = [RIGGING_PALETTE[0], RIGGING_PALETTE[3], RIGGING_PALETTE[5]]

/** Door card for Lay the Rigging (weekly Flow) in the Chart Room — a
 *  MEMBERS-ONLY puzzle. Scene: colored cleats joined by gently swaying ropes.
 *  Non-members see a lock treatment and the card routes to the membership
 *  page instead of the puzzle. */
export default function RiggingCard({ status, reward, isMember }: { status: 'active' | 'cleared'; reward: number; isMember: boolean }) {
  const cleared = status === 'cleared'
  return (
    <ScenicCard
      href={isMember ? '/tavern/chart-room/rigging' : '#'}
      title="Lay the Rigging"
      gradient={['#4a3320', '#2e2011', '#12100a']}
      accent="#b98a3e"
      bgImage="/rigging-bg.jpg"
      onActivate={isMember ? undefined : openMembership}
    >
      <svg aria-hidden viewBox="0 0 120 90" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 120, height: 90, opacity: isMember ? 1 : 0.4, filter: isMember ? undefined : 'grayscale(0.6)' }}>
        {[
          { c: ROPES[0], d: 'M22,20 C22,50 78,40 78,70', a: [22, 20], b: [78, 70] },
          { c: ROPES[1], d: 'M58,18 C90,18 90,60 60,68', a: [58, 18], b: [60, 68] },
          { c: ROPES[2], d: 'M30,72 C30,40 70,30 98,30', a: [30, 72], b: [98, 30] },
        ].map((r, i) => (
          <g key={i}>
            {/* rope shadow cast on the deck */}
            <path d={r.d} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={4} strokeLinecap="round" transform="translate(1.4 2)" />
            {/* dark rope edge */}
            <path d={r.d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={4} strokeLinecap="round" />
            {/* solid rope body (breathes) */}
            <motion.path
              d={r.d} fill="none" stroke={r.c} strokeWidth={2.9} strokeLinecap="round"
              animate={isMember ? { opacity: [0.72, 1, 0.72] } : undefined}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
            />
            {/* brass rope-grommet anchors at both ends */}
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
      <span
        className="font-karla font-700 uppercase"
        style={{
          position: 'absolute', top: 8, right: 10,
          fontSize: '0.56rem', letterSpacing: '0.06em',
          color: isMember ? (cleared ? GOLD : '#bcd09a') : GOLD,
          background: 'rgba(10,14,6,0.72)',
          border: `1px solid ${isMember ? 'rgba(138,168,90,0.45)' : `${GOLD}66`}`,
          borderRadius: 999, padding: '0.2rem 0.55rem',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        {!isMember && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        )}
        {isMember ? (cleared ? `Rigged · +${reward} pts` : 'This week') : 'Captains'}
      </span>
    </ScenicCard>
  )
}
