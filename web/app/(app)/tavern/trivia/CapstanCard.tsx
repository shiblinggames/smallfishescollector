'use client'

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { openMembership } from '@/components/MembershipModal'
import { CAPSTAN_PUZZLES_PER_WEEK } from './constants'

const BRASS = '#c9a24a'

/** The Parlor's door into Spin the Capstan, the phrase game. CAPTAINS
 *  ONLY: anyone else sees the lock and the card opens the membership sheet. */
export default function CapstanCard({ isMember, solved }: { isMember: boolean; solved: number }) {
  const allDone = solved >= CAPSTAN_PUZZLES_PER_WEEK
  return (
    <ScenicCard
      href={isMember ? '/tavern/trivia/capstan' : '#'}
      title="Spin the Capstan"
      blurb="Spin for a stake, call a letter, and guess the hidden phrase before three strikes. Captains only."
      accent={BRASS}
      onActivate={isMember ? undefined : openMembership}
      chip={isMember
        ? { text: allDone ? 'All solved' : `${solved}/${CAPSTAN_PUZZLES_PER_WEEK} this week`, lit: allDone }
        : { text: 'Captains', locked: true }}
    >
      <motion.svg
        aria-hidden viewBox="0 0 120 120"
        style={{ position: 'absolute', top: 4, left: '50%', width: 88, height: 88, marginLeft: -44, opacity: isMember ? 1 : 0.45 }}
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
    </ScenicCard>
  )
}
