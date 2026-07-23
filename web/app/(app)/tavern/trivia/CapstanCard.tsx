'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { openMembership } from '@/components/MembershipModal'
import { CAPSTAN_PUZZLES_PER_WEEK } from './constants'

const GOLD = '#f0c040'
const BRASS = '#c9a24a'

/** Door card for Spin the Capstan — a MEMBERS-ONLY Wheel-of-Fortune phrase game.
 *  Scene: a candlelit capstan wheel turning slowly. Non-members see a lock and the
 *  card opens the membership upsell instead of the game. */
export default function CapstanCard({ isMember, solved }: { isMember: boolean; solved: number }) {
  const allDone = solved >= CAPSTAN_PUZZLES_PER_WEEK
  return (
    <ScenicCard
      href={isMember ? '/tavern/trivia/capstan' : '#'}
      title="Spin the Capstan"
      gradient={['#3a2c10', '#221a0c', '#0e0a06']}
      accent={BRASS}
      onActivate={isMember ? undefined : openMembership}
    >
      {/* the turning capstan */}
      <motion.svg
        aria-hidden viewBox="0 0 120 120"
        style={{ position: 'absolute', top: 14, left: '50%', width: 108, height: 108, marginLeft: -54, opacity: isMember ? 1 : 0.42, filter: isMember ? undefined : 'grayscale(0.6)' }}
        animate={isMember ? { rotate: 360 } : undefined}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="60" cy="60" r="52" fill="#0c0906" stroke={BRASS} strokeWidth="3" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a0 = ((i * 30 - 15 - 90) * Math.PI) / 180
          const a1 = ((i * 30 + 15 - 90) * Math.PI) / 180
          const hazard = i % 5 === 2
          const x0 = 60 + 52 * Math.cos(a0), y0 = 60 + 52 * Math.sin(a0)
          const x1 = 60 + 52 * Math.cos(a1), y1 = 60 + 52 * Math.sin(a1)
          return <path key={i} d={`M60 60 L${x0} ${y0} A52 52 0 0 1 ${x1} ${y1} Z`} fill={hazard ? '#3a1512' : i % 2 ? '#2c2011' : '#3a2c16'} stroke="#0c0906" strokeWidth="0.8" />
        })}
        <circle cx="60" cy="60" r="15" fill="#2c2011" stroke={BRASS} strokeWidth="2" />
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i * 60 * Math.PI) / 180
          return <line key={i} x1="60" y1="60" x2={60 + 13 * Math.cos(a)} y2={60 + 13 * Math.sin(a)} stroke={BRASS} strokeWidth="2.4" strokeLinecap="round" />
        })}
        <circle cx="60" cy="60" r="4" fill={BRASS} />
      </motion.svg>

      <span
        className="font-karla font-700 uppercase"
        style={{
          position: 'absolute', top: 8, right: 10,
          fontSize: '0.56rem', letterSpacing: '0.06em',
          color: GOLD,
          background: 'rgba(14,10,6,0.72)',
          border: `1px solid ${GOLD}55`,
          borderRadius: 999, padding: '0.2rem 0.55rem',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        {!isMember && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        )}
        {isMember ? (allDone ? 'All solved' : `${solved}/${CAPSTAN_PUZZLES_PER_WEEK} this week`) : 'Captains'}
      </span>
    </ScenicCard>
  )
}
