'use client'

import { useState } from 'react'
import {
  LeaderboardSection, BOARD_META,
  type LeaderboardEntry, type BoardKey, type AvatarMap,
} from './boardUI'

export type { LeaderboardEntry } from './boardUI'

interface MyScores {
  fishing: number
  perfectStreak: number
  tideRun: number
  fishSlots: number
  expedition: number
  crewStrength: number
}

interface MyRanks {
  fishing: number | null
  perfectStreak: number | null
  tideRun: number | null
  fishSlots: number | null
  expedition: number | null
  crewStrength: number | null
}

interface Props {
  fishing: LeaderboardEntry[]
  perfectStreak: LeaderboardEntry[]
  tideRun: LeaderboardEntry[]
  fishSlots: LeaderboardEntry[]
  expedition: LeaderboardEntry[]
  crewStrength: LeaderboardEntry[]
  myScores: MyScores
  myRanks: MyRanks
  currentUserId: string
  avatars: AvatarMap
}

type SectionKey = 'fishing' | 'expeditions' | 'tavern'

/** Master sections — each owns 2 boards. Section order = display order. */
const SECTIONS: Record<SectionKey, { label: string; boards: BoardKey[] }> = {
  fishing:     { label: 'Fishing',     boards: ['perfectStreak', 'fishingLevel'] },
  expeditions: { label: 'Expeditions', boards: ['expedition', 'crewStrength'] },
  tavern:      { label: 'Tavern',      boards: ['tideRun', 'fishSlots'] },
}

const PODIUM_COLORS: Record<number, string> = { 1: '#f0c040', 2: '#c0c8d4', 3: '#c47a3a' }
const NEUTRAL_TEXT = '#d8d4cf'
const NEUTRAL_BORDER = 'rgba(255,255,255,0.10)'
const NEUTRAL_BORDER_TOP = 'rgba(255,255,255,0.18)'

export default function LeaderboardClient({ fishing, perfectStreak, tideRun, fishSlots, expedition, crewStrength, myScores, myRanks, currentUserId, avatars }: Props) {
  const [section, setSection] = useState<SectionKey>('fishing')
  const [activeTab, setActiveTab] = useState<BoardKey>(SECTIONS.fishing.boards[0])

  // BoardKey → its data array + the player's score/rank for that board.
  const dataOf = (k: BoardKey): LeaderboardEntry[] =>
    k === 'fishingLevel' ? fishing
    : k === 'perfectStreak' ? perfectStreak
    : k === 'tideRun' ? tideRun
    : k === 'fishSlots' ? fishSlots
    : k === 'expedition' ? expedition
    : crewStrength
  const scoreOf = (k: BoardKey): number =>
    k === 'fishingLevel' ? myScores.fishing
    : k === 'perfectStreak' ? myScores.perfectStreak
    : k === 'tideRun' ? myScores.tideRun
    : k === 'fishSlots' ? myScores.fishSlots
    : k === 'expedition' ? myScores.expedition
    : myScores.crewStrength
  const rankOf = (k: BoardKey): number | null =>
    k === 'fishingLevel' ? myRanks.fishing
    : k === 'perfectStreak' ? myRanks.perfectStreak
    : k === 'tideRun' ? myRanks.tideRun
    : k === 'fishSlots' ? myRanks.fishSlots
    : k === 'expedition' ? myRanks.expedition
    : myRanks.crewStrength

  function selectSection(s: SectionKey) {
    setSection(s)
    setActiveTab(SECTIONS[s].boards[0])
  }

  const meta = BOARD_META[activeTab]

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* ── Section tabs ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: '0.6rem' }}>
        {(Object.keys(SECTIONS) as SectionKey[]).map(key => {
          const isActive = section === key
          return (
            <button
              key={key}
              onClick={() => selectSection(key)}
              className="font-cinzel font-700 uppercase tracking-[0.10em]"
              style={{
                padding: '0.55rem 0.5rem',
                borderRadius: 10,
                background: isActive
                  ? 'linear-gradient(180deg, rgba(240,192,64,0.20) 0%, rgba(240,192,64,0.05) 100%)'
                  : 'rgba(6,6,4,0.7)',
                border: `1px solid ${isActive ? 'rgba(240,192,64,0.48)' : NEUTRAL_BORDER}`,
                borderTop: `1px solid ${isActive ? 'rgba(240,192,64,0.78)' : NEUTRAL_BORDER_TOP}`,
                color: isActive ? '#f0c040' : NEUTRAL_TEXT,
                fontSize: '0.72rem',
                cursor: 'pointer',
                boxShadow: isActive ? '0 0 14px rgba(240,192,64,0.20)' : 'none',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {SECTIONS[key].label}
            </button>
          )
        })}
      </div>

      {/* ── Board pills for the active section ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: '1.25rem' }}>
        {SECTIONS[section].boards.map(key => {
          const b = BOARD_META[key]
          const isActive = activeTab === key
          const myRank = rankOf(key)
          const podiumColor = myRank != null && myRank <= 3 ? PODIUM_COLORS[myRank] : null
          const pillAccent  = podiumColor
          const teaser      = myRank == null ? '—' : `Rank ${myRank}`
          const teaserColor = podiumColor ?? (myRank == null ? '#5a5856' : '#9a9488')

          const borderColor = isActive
            ? (pillAccent ? `${pillAccent}90` : 'rgba(255,255,255,0.30)')
            : (pillAccent ? `${pillAccent}50` : NEUTRAL_BORDER)
          const borderTopColor = isActive
            ? (pillAccent ? `${pillAccent}c0` : 'rgba(255,255,255,0.42)')
            : (pillAccent ? `${pillAccent}70` : NEUTRAL_BORDER_TOP)
          const bgColor = isActive
            ? (pillAccent ? `${pillAccent}1a` : 'rgba(255,255,255,0.05)')
            : 'rgba(6,6,4,0.7)'
          const glow = isActive && pillAccent ? `0 0 12px ${pillAccent}35` : 'none'

          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '0.55rem 0.75rem 0.55rem 0.85rem',
                borderRadius: 10,
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderTop: `1px solid ${borderTopColor}`,
                boxShadow: glow,
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                textAlign: 'left',
                overflow: 'hidden',
              }}
            >
              {pillAccent && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: pillAccent, opacity: isActive ? 1 : 0.7,
                }} />
              )}
              <p className="font-karla font-700" style={{
                fontSize: '0.72rem',
                color: isActive ? '#f0ede8' : NEUTRAL_TEXT,
                lineHeight: 1.1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {b.label}
              </p>
              <p className="font-cinzel font-700" style={{
                fontSize: '0.74rem',
                color: teaserColor,
                lineHeight: 1,
                flexShrink: 0,
              }}>
                {teaser}
              </p>
            </button>
          )
        })}
      </div>

      {/* ── Active leaderboard ── */}
      <LeaderboardSection
        accent={meta.accent}
        unit={meta.unit}
        subUnit={meta.subUnit}
        showZone={meta.showZone}
        data={dataOf(activeTab)}
        myScore={scoreOf(activeTab)}
        currentUserId={currentUserId}
        avatars={avatars}
      />
    </div>
  )
}
