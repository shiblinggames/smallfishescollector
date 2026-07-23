'use client'

// The Parlor — the one front door for the trivia games, same
// skeleton as the Den lobby. The Captain's Board and Pirate King are
// live; Spin the Capstan is chalked up as coming soon.

import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import BackButton from '@/components/BackButton'
import { ParlorHost, CrownIcon } from './ParlorArt'
import { TRIVIA_CATEGORIES, PIRATE_KING_RUNGS, parlorRank, type PirateKingStatus } from './constants'

const GOLD = '#f0c040'

export interface KingChip {
  status: PirateKingStatus
  rung: number
  doubloonsAwarded: number
}

export default function TriviaLobby({ doubloons, boardPlayedToday, boardPlayedThisWeek, doubloonsThisWeek, king, parlorStreak, parlorBestStreak }: {
  doubloons: number
  boardPlayedToday: boolean
  boardPlayedThisWeek: number
  doubloonsThisWeek: number
  king: KingChip | null
  parlorStreak: number
  parlorBestStreak: number
}) {
  const { rank, next } = parlorRank(parlorBestStreak)
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
          <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
      </div>

      {/* The host presides — a dashing crimson cavalier who runs the room. */}
      <div style={{ padding: '0.2rem 0.2rem 0.1rem' }}>
        <ParlorHost line="Welcome back to the Parlor. Sharpen your wits — the good stakes aren't just coin tonight." />
      </div>

      {/* Parlor Standing — the mastery rank you climb by answering right across
          both games. One streak, one record, one title to show off. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.75rem 0.9rem', borderRadius: 14, background: 'linear-gradient(180deg, #201a12 0%, #120d08 100%)', border: '1px solid rgba(201,162,74,0.4)', boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        {/* bright rank-coloured rail so the tier reads even at grey ranks */}
        <span aria-hidden style={{ width: 4, alignSelf: 'stretch', borderRadius: 3, background: rank.color, boxShadow: `0 0 10px ${rank.color}` }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#a8a090' }}>Parlor Standing</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: rank.color, lineHeight: 1.1, marginTop: 2, textShadow: `0 0 12px ${rank.color}66` }}>{rank.title}</p>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: '#c2b9a4', marginTop: 3 }}>
            Best streak {parlorBestStreak}{next ? <> · next: <span style={{ color: next.color }}>{next.title}</span> at {next.at} → <span style={{ color: '#c084fc' }}>+{next.gems} ◆</span></> : ' · top rank, all gems earned'}
          </p>
        </div>
        {parlorStreak > 0 && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: GOLD, lineHeight: 1, textShadow: `0 0 14px ${GOLD}66` }}>{parlorStreak}</p>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: '#a8a090', marginTop: 2 }}>on a roll</p>
          </div>
        )}
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        Doubloons for a right answer — and <span style={{ color: '#c084fc' }}>gems ◆</span> every time you climb a Parlor rank. Fresh boards every Monday.
      </p>

      {/* The Captain's Board — live */}
      <ScenicCard
        href="/tavern/trivia/board"
        title="The Captain's Board"
        gradient={['#241f48', '#161230', '#0a0818']}
        accent="#a78bfa"
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

      {/* Pirate King — live */}
      <ScenicCard
        href="/tavern/trivia/king"
        title="Pirate King"
        gradient={['#3a2c10', '#221a0c', '#0e0a06']}
        accent={GOLD}
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

      {/* Coming soon shelf */}
      <div
        style={{
          position: 'relative', height: 92, borderRadius: 18, overflow: 'hidden',
          background: 'linear-gradient(180deg, #15131f 0%, #0b0a12 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '0.9rem 0.85rem',
          opacity: 0.82,
        }}
      >
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#b8b2a4' }}>Spin the Capstan</p>
        <p className="font-karla" style={{ fontSize: '0.66rem', color: '#6f6b66', lineHeight: 1.45, marginTop: 4 }}>
          Spin for stakes, call your letters, solve the phrase. A Captain-only game.
        </p>
        <span
          className="font-karla font-700 uppercase"
          style={{
            position: 'absolute', top: 12, right: 12,
            fontSize: '0.54rem', letterSpacing: '0.1em', whiteSpace: 'nowrap',
            color: GOLD,
            border: `1px solid ${GOLD}55`,
            borderRadius: 999, padding: '0.22rem 0.6rem',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Captains · Soon
        </span>
      </div>

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        Both the board and the King&apos;s ladder are rigged fresh each Monday. Play one board card a day; winnings land instantly.
      </p>
    </div>
  )
}
