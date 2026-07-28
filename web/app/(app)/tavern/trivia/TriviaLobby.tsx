'use client'

// The Parlor — the one front door for the trivia games, same
// skeleton as the Den lobby. The Captain's Board and Pirate King are
// live; Spin the Capstan is chalked up as coming soon.

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import BackButton from '@/components/BackButton'
import { ParlorHost, CrownIcon, ParlorPointsTicker } from './ParlorArt'
import ParlorClaim from './ParlorClaim'
import ParlorStanding from './ParlorStanding'
import CapstanCard from './CapstanCard'
import { TRIVIA_CATEGORIES, PIRATE_KING_RUNGS, type PirateKingStatus } from './constants'
import LobbyGuide, { type LobbyGuideStep } from '@/components/LobbyGuide'
import { GUIDES } from '@/lib/onboardingScenes'
import { markParlorGuideSeen } from './actions'

const GOLD = '#f0c040'

const PARLOR_GUIDE: LobbyGuideStep[] = [
  { coachId: 'parlor-rank', ...GUIDES.kat, text: "Both games build one *Parlor rank*. Climb it to collect gems at every tier." },
  { coachId: 'parlor-board', ...GUIDES.doby, text: "*The Captain's Board* gives you a trivia card a day. Right answers pay doubloons." },
  { coachId: 'parlor-king', ...GUIDES.kat, text: "*Pirate King* is a weekly prize ladder. Climb the rungs, then cash out or risk it all for the crown." },
]

export interface KingChip {
  status: PirateKingStatus
  rung: number
  doubloonsAwarded: number
}

const MEDAL = ['#f0c040', '#c9d2dc', '#cd7f32'] // gold · silver · bronze

export default function TriviaLobby({ boardPlayedToday, boardPlayedThisWeek, doubloonsThisWeek, king, parlorStreak, parlorPoints, parlorRankGemsClaimed, isCaptain, capstanSolved, topParlor, hasSeenGuide = true }: {
  boardPlayedToday: boolean
  boardPlayedThisWeek: number
  doubloonsThisWeek: number
  king: KingChip | null
  parlorStreak: number
  parlorPoints: number
  parlorRankGemsClaimed: number
  isCaptain: boolean
  capstanSolved: number
  topParlor: { username: string; points: number }[]
  hasSeenGuide?: boolean
}) {
  const kingChipText = king === null ? null
    : king.status === 'crowned' ? `Crowned · +${king.doubloonsAwarded} ⟡`
    : king.status === 'walked' ? `Walked · +${king.doubloonsAwarded} ⟡`
    : king.status === 'busted' ? (king.doubloonsAwarded > 0 ? `Sunk · +${king.doubloonsAwarded} ⟡` : 'Sunk')
    : `Rung ${king.rung} of ${PIRATE_KING_RUNGS}`
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header row. Side rails get equal flex so the title sits at
          the true center regardless of the link/balance widths. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BackButton href="/tavern" label="Tavern" />
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          The Parlor
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <ParlorPointsTicker value={parlorPoints} />
        </div>
      </div>

      {/* The host presides — a dashing crimson cavalier who runs the room. */}
      <div style={{ padding: '0.2rem 0.2rem 0.1rem' }}>
        <ParlorHost line="Welcome back to the Parlor. Sharpen your wits — the good stakes aren't just coin tonight." />
      </div>

      {/* Parlor Standing — the mastery rank you climb across both games. Points
          fill an XP bar toward the next rank; tap to see the whole ladder. */}
      <div data-coach="parlor-rank">
        <ParlorStanding points={parlorPoints} streak={parlorStreak} claimedGems={parlorRankGemsClaimed} />
      </div>

      {/* Collect any ranks your points have reached — the interactive gem claim. */}
      <ParlorClaim points={parlorPoints} claimedGems={parlorRankGemsClaimed} />

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        Doubloons for a right answer — and <span style={{ color: '#c084fc' }}>gems ◆</span> to collect each time you climb a Parlor rank. Fresh boards every Monday.
      </p>

      {/* The Captain's Board — live */}
      <div data-coach="parlor-board">
      <ScenicCard
        href="/tavern/trivia/board"
        title="The Captain's Board"
        gradient={['#241f48', '#161230', '#0a0818']}
        accent="#a78bfa"
        bgImage="/captainsboard-bg.jpg"
      >
        {/* Mini board scene: a 4x3 grid of glowing category tiles. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 16, left: '50%', transform: 'translateX(-50%)',
            display: 'grid', gridTemplateColumns: 'repeat(4, 44px)', gap: 6,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const cat = TRIVIA_CATEGORIES[i % 4]
            return (
              <motion.div
                key={i}
                animate={{ opacity: [0.45, 0.85, 0.45] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.45 }}
                className="font-cinzel font-700"
                style={{
                  height: 24, borderRadius: 6,
                  background: `${cat.color}14`,
                  border: `1px solid ${cat.color}50`,
                  color: cat.color,
                  fontSize: '0.6rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ⟡
              </motion.div>
            )
          })}
        </div>
        {/* Daily-card chip — one card a day off the weekly board */}
        <span
          className="font-karla font-700"
          style={{
            position: 'absolute', top: 8, right: 10,
            fontSize: '0.58rem', letterSpacing: '0.04em',
            color: boardPlayedToday ? (doubloonsThisWeek > 0 ? GOLD : '#9a9488') : '#a78bfa',
            background: 'rgba(10,8,24,0.7)',
            border: '1px solid rgba(167,139,250,0.3)',
            borderRadius: 999, padding: '0.2rem 0.55rem',
          }}
        >
          {boardPlayedToday
            ? (doubloonsThisWeek > 0 ? `Played · ${doubloonsThisWeek} ⟡ wk` : 'Played today')
            : 'Card ready'}
        </span>
      </ScenicCard>
      </div>

      {/* Pirate King — live */}
      <div data-coach="parlor-king">
      <ScenicCard
        href="/tavern/trivia/king"
        title="Pirate King"
        gradient={['#3a2c10', '#221a0c', '#0e0a06']}
        accent={GOLD}
        bgImage="/pirateking-bg.jpg"
      >
        {/* Mini ladder scene: prize rungs climbing to a crown. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 14, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'flex-end', gap: 7,
          }}
        >
          {[20, 100, 360, 1000].map((p, i) => (
            <div
              key={p}
              className="font-karla font-700"
              style={{
                width: 44, height: 18 + i * 9,
                borderRadius: 6,
                background: `${GOLD}${i === 3 ? '26' : '12'}`,
                border: `1px solid ${GOLD}${i === 3 ? '70' : '40'}`,
                color: i === 3 ? GOLD : '#c2a050',
                fontSize: '0.56rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {p} ⟡
            </div>
          ))}
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-flex', lineHeight: 1, marginLeft: 2, marginBottom: 38 }}
          >
            <CrownIcon size={26} color={GOLD} />
          </motion.span>
        </div>
        {/* Today's run chip */}
        {kingChipText && (
          <span
            className="font-karla font-700"
            style={{
              position: 'absolute', top: 8, right: 10,
              fontSize: '0.58rem', letterSpacing: '0.04em',
              color: king && king.doubloonsAwarded > 0 ? GOLD : '#9a9488',
              background: 'rgba(14,10,6,0.7)',
              border: `1px solid ${GOLD}4d`,
              borderRadius: 999, padding: '0.2rem 0.55rem',
            }}
          >
            {kingChipText}
          </span>
        )}
      </ScenicCard>
      </div>

      {/* Spin the Capstan — live, Captain-only */}
      <CapstanCard isMember={isCaptain} solved={capstanSolved} />

      {/* Top of the Parlor — the three deepest banks of parlor points. */}
      {topParlor.length > 0 && (
        <div style={{ borderRadius: 14, padding: '0.75rem 0.9rem 0.6rem', background: 'rgba(20,14,7,0.6)', border: '1px solid rgba(201,162,74,0.28)' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: '#e6d8b4', textAlign: 'center', letterSpacing: '0.02em', marginBottom: 8 }}>
            Top of the Parlor
          </p>
          {topParlor.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.34rem 0.1rem', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <span className="font-cinzel font-700" style={{ width: 18, textAlign: 'center', fontSize: '0.82rem', color: MEDAL[i] }}>{i + 1}</span>
              <span className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#d8cdb2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.username}</span>
              <span className="font-karla font-700 flex items-center" style={{ gap: 4, fontSize: '0.78rem', color: MEDAL[i], whiteSpace: 'nowrap' }}>
                {r.points.toLocaleString()} <span style={{ fontSize: '0.62rem', color: '#a8a090' }}>pts</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        The board and the King&apos;s ladder are rigged fresh each Monday; the Capstan hides three new phrases. Winnings land instantly.
      </p>

      <LobbyGuide
        show={!hasSeenGuide}
        steps={PARLOR_GUIDE}
        accent="#a78bfa"
        onSeen={() => { void markParlorGuideSeen().catch(() => {}) }}
      />
    </div>
  )
}
