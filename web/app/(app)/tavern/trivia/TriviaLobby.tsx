'use client'

// The Parlor — the one front door for the trivia games, same
// skeleton as the Den lobby. The Captain's Board and Pirate King are
// live; Spin the Capstan is chalked up as coming soon.

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import RoomHeader from '@/components/RoomHeader'
import RoomIntro from '@/components/RoomIntro'
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
    <div style={{ maxWidth: 'var(--game-col)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header row. Side rails get equal flex so the title sits at
          the true center regardless of the link/balance widths. */}
      {/* The room's own header, shared with every other door off the Mainland. */}
      <RoomHeader title="The Parlor" backHref="/sea" backLabel="The Sea" accent="#dd8f79"
        right={<ParlorPointsTicker value={parlorPoints} />} />
      <RoomIntro>Trivia for doubloons. Every right answer also earns Parlor points, and points climb a rank ladder that pays gems.</RoomIntro>

      {/* The host presides — a dashing crimson cavalier who runs the room. */}
      <div style={{ padding: '0.2rem 0.2rem 0.1rem' }}>
        <ParlorHost line="Welcome back to the Parlor. Sharpen your wits. The good stakes aren't just coin tonight." />
      </div>

      {/* Parlor Standing — the mastery rank you climb across both games. Points
          fill an XP bar toward the next rank; tap to see the whole ladder. */}
      <div data-coach="parlor-rank">
        <ParlorStanding points={parlorPoints} streak={parlorStreak} claimedGems={parlorRankGemsClaimed} />
      </div>

      {/* Collect any ranks your points have reached — the interactive gem claim. */}
      <ParlorClaim points={parlorPoints} claimedGems={parlorRankGemsClaimed} />

      {/* The two live games and the Captains' third, two across like the
          Den's tables and the Chart Room's puzzles. */}
      <div className="grid grid-cols-2 gap-3">
      {/* The Captain's Board — live */}
      <ScenicCard
        coach="parlor-board"
        href="/tavern/trivia/board"
        title="The Captain's Board"
        blurb={`One trivia card a day off the week's board. A right answer pays doubloons.`}
        accent="#a78bfa"
        chip={{
          text: boardPlayedToday ? (doubloonsThisWeek > 0 ? `Played · ${doubloonsThisWeek} ⟡ wk` : 'Played today') : 'Card ready',
          lit: boardPlayedToday && doubloonsThisWeek > 0,
        }}
      >
        {/* Mini board scene: a 4x3 grid of glowing category tiles. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 10, left: '50%', transform: 'translateX(-50%)',
            display: 'grid', gridTemplateColumns: 'repeat(4, 34px)', gap: 5,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const cat = TRIVIA_CATEGORIES[i % 4]
            return (
              <motion.div
                key={i}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.45 }}
                className="font-cinzel font-700"
                style={{
                  height: 20, borderRadius: 5,
                  background: `${cat.color}30`,
                  border: `1px solid ${cat.color}99`,
                  color: cat.color,
                  fontSize: '0.56rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ⟡
              </motion.div>
            )
          })}
        </div>
      </ScenicCard>

      {/* Pirate King — live */}
      <ScenicCard
        coach="parlor-king"
        href="/tavern/trivia/king"
        title="Pirate King"
        blurb="A ladder of questions with a bigger prize on every rung. Walk with what you have, or climb for the crown."
        accent={GOLD}
        chip={kingChipText ? { text: kingChipText, lit: !!king && king.doubloonsAwarded > 0 } : undefined}
      >
        {/* Mini ladder scene: prize rungs climbing to a crown. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'flex-end', gap: 5,
          }}
        >
          {[20, 100, 360, 1000].map((p, i) => (
            <div
              key={p}
              className="font-karla font-700"
              style={{
                width: 36, height: 16 + i * 8,
                borderRadius: 5,
                background: `${GOLD}${i === 3 ? '4a' : '2e'}`,
                border: `1px solid ${GOLD}${i === 3 ? 'bb' : '88'}`,
                color: i === 3 ? GOLD : '#e6c86a',
                fontSize: '0.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {p} ⟡
            </div>
          ))}
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-flex', lineHeight: 1, marginLeft: 2, marginBottom: 34 }}
          >
            <CrownIcon size={22} color={GOLD} />
          </motion.span>
        </div>
      </ScenicCard>

      {/* Spin the Capstan — live, Captain-only */}
      <CapstanCard isMember={isCaptain} solved={capstanSolved} />
      </div>

      {/* Top of the Parlor — the three deepest banks of parlor points. */}
      {topParlor.length > 0 && (
        <div className="room-panel" style={{ padding: '0.75rem 0.9rem 0.6rem' }}>
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
