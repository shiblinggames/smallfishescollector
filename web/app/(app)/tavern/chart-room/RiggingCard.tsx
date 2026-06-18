'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { openMembership } from '@/components/MembershipModal'

const GOLD = '#f0c040'
const ROPES = ['#e0524e', '#4f9bd0', '#46b46e']

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
      gradient={['#2a2f1a', '#1a1d10', '#0c0e08']}
      accent="#8aa85a"
      onActivate={isMember ? undefined : openMembership}
    >
      <svg aria-hidden viewBox="0 0 120 90" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 120, height: 90, opacity: isMember ? 1 : 0.4, filter: isMember ? undefined : 'grayscale(0.6)' }}>
        {[
          { c: ROPES[0], d: 'M22,20 C22,50 78,40 78,70', a: [22, 20], b: [78, 70] },
          { c: ROPES[1], d: 'M58,18 C90,18 90,60 60,68', a: [58, 18], b: [60, 68] },
          { c: ROPES[2], d: 'M30,72 C30,40 70,30 98,30', a: [30, 72], b: [98, 30] },
        ].map((r, i) => (
          <g key={i}>
            {/* dark rope edge */}
            <path d={r.d} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={3.7} strokeLinecap="round" opacity={0.85} />
            {/* rope body (breathes) */}
            <motion.path
              d={r.d} fill="none" stroke={r.c} strokeWidth={3} strokeLinecap="round" opacity={0.85}
              animate={isMember ? { opacity: [0.6, 0.95, 0.6] } : undefined}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
            />
            {/* twisted-hemp bands + light strands */}
            <path d={r.d} fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth={3} strokeLinecap="butt" strokeDasharray="1.1 2.2" opacity={0.5} />
            <path d={r.d} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={3} strokeLinecap="butt" strokeDasharray="0.55 2.75" strokeDashoffset={1.6} opacity={0.5} />
            <path d={r.d} fill="none" stroke="#ffffff" strokeWidth={0.7} strokeLinecap="round" opacity={0.2} />
            <circle cx={r.a[0]} cy={r.a[1]} r={5} fill={r.c} stroke="rgba(0,0,0,0.4)" strokeWidth={0.6} />
            <circle cx={r.b[0]} cy={r.b[1]} r={5} fill={r.c} stroke="rgba(0,0,0,0.4)" strokeWidth={0.6} />
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
