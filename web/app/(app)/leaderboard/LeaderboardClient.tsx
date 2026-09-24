'use client'

import { useState } from 'react'
import {
  LeaderboardSection, BOARD_META, groupBoards,
  type LeaderboardEntry, type BoardKey, type AvatarMap,
} from './boardUI'
import BoardPicker from './BoardPicker'

export type { LeaderboardEntry } from './boardUI'

interface MyScores {
  // null = player has no entry on this board (no row in the underlying
  // view). A number (incl. 0 or negative on the signed-score Den
  // boards) means they have a rank and the "you" tile renders.
  fishing: number | null
  perfectStreak: number | null
  chartingPoints: number | null
  parlorPoints: number | null
  fishSlots: number | null
  blackjack: number | null
  roulette: number | null
  expedition: number | null
  raidProgress: number | null
  achievementPoints: number | null
  species: number | null
  fishSold: number | null
  trophies: number | null
  bountyPoints: number | null
}

interface MyRanks {
  fishing: number | null
  perfectStreak: number | null
  chartingPoints: number | null
  parlorPoints: number | null
  fishSlots: number | null
  blackjack: number | null
  roulette: number | null
  expedition: number | null
  raidProgress: number | null
  achievementPoints: number | null
  species: number | null
  fishSold: number | null
  trophies: number | null
  bountyPoints: number | null
}

interface Props {
  fishing: LeaderboardEntry[]
  perfectStreak: LeaderboardEntry[]
  chartingPoints: LeaderboardEntry[]
  parlorPoints: LeaderboardEntry[]
  fishSlots: LeaderboardEntry[]
  blackjack: LeaderboardEntry[]
  roulette: LeaderboardEntry[]
  expedition: LeaderboardEntry[]
  raidProgress: LeaderboardEntry[]
  achievementPoints: LeaderboardEntry[]
  species: LeaderboardEntry[]
  fishSold: LeaderboardEntry[]
  trophies: LeaderboardEntry[]
  bountyPoints: LeaderboardEntry[]
  myScores: MyScores
  myRanks: MyRanks
  currentUserId: string
  avatars: AvatarMap
}

// Every board this page has data for, in a sensible reading order. groupBoards
// slots each into its category for the picker (add a board once, in boardUI's
// LEADERBOARD_SECTIONS, and it appears here automatically).
const AVAILABLE_BOARDS: BoardKey[] = [
  'achievementPoints', 'perfectStreak', 'fishingLevel', 'raidProgress',
  'expedition', 'chartingPoints', 'parlorPoints', 'blackjack', 'fishSlots', 'roulette',
  'species', 'trophies', 'fishSold', 'bountyPoints',
]

export default function LeaderboardClient({ fishing, perfectStreak, chartingPoints, parlorPoints, fishSlots, blackjack, roulette, expedition, raidProgress, achievementPoints, species, fishSold, trophies, bountyPoints, myScores, myRanks, currentUserId, avatars }: Props) {
  const [activeTab, setActiveTab] = useState<BoardKey>('achievementPoints')

  // BoardKey → its data array + the player's score/rank for that board.
  const dataOf = (k: BoardKey): LeaderboardEntry[] =>
    k === 'fishingLevel' ? fishing
    : k === 'perfectStreak' ? perfectStreak
    : k === 'chartingPoints' ? chartingPoints
    : k === 'parlorPoints' ? parlorPoints
    : k === 'fishSlots' ? fishSlots
    : k === 'blackjack' ? blackjack
    : k === 'roulette' ? roulette
    : k === 'expedition' ? expedition
    : k === 'achievementPoints' ? achievementPoints
    : k === 'species' ? species
    : k === 'fishSold' ? fishSold
    : k === 'trophies' ? trophies
    : k === 'bountyPoints' ? bountyPoints
    : raidProgress
  const scoreOf = (k: BoardKey): number | null =>
    k === 'fishingLevel' ? myScores.fishing
    : k === 'perfectStreak' ? myScores.perfectStreak
    : k === 'chartingPoints' ? myScores.chartingPoints
    : k === 'parlorPoints' ? myScores.parlorPoints
    : k === 'fishSlots' ? myScores.fishSlots
    : k === 'blackjack' ? myScores.blackjack
    : k === 'roulette' ? myScores.roulette
    : k === 'expedition' ? myScores.expedition
    : k === 'achievementPoints' ? myScores.achievementPoints
    : k === 'species' ? myScores.species
    : k === 'fishSold' ? myScores.fishSold
    : k === 'trophies' ? myScores.trophies
    : k === 'bountyPoints' ? myScores.bountyPoints
    : myScores.raidProgress
  const rankOf = (k: BoardKey): number | null =>
    k === 'fishingLevel' ? myRanks.fishing
    : k === 'perfectStreak' ? myRanks.perfectStreak
    : k === 'chartingPoints' ? myRanks.chartingPoints
    : k === 'parlorPoints' ? myRanks.parlorPoints
    : k === 'fishSlots' ? myRanks.fishSlots
    : k === 'blackjack' ? myRanks.blackjack
    : k === 'roulette' ? myRanks.roulette
    : k === 'expedition' ? myRanks.expedition
    : k === 'achievementPoints' ? myRanks.achievementPoints
    : k === 'species' ? myRanks.species
    : k === 'fishSold' ? myRanks.fishSold
    : k === 'trophies' ? myRanks.trophies
    : k === 'bountyPoints' ? myRanks.bountyPoints
    : myRanks.raidProgress

  const meta = BOARD_META[activeTab]
  const groups = groupBoards(AVAILABLE_BOARDS)
  const myRank = rankOf(activeTab)
  const myScore = scoreOf(activeTab)
  const PODIUM: Record<number, string> = { 1: '#f0c040', 2: '#c0c8d4', 3: '#c47a3a' }

  return (
    <div style={{ paddingBottom: '2rem' }} className="lb-layout">

      {/* ── THE BOARDS ── a sidebar on a desktop, grouped, each with where you
          stand on it, so the whole spread reads without opening anything. */}
      <nav className="lb-side" aria-label="Boards">
        {groups.map(g => (
          <div key={g.label} style={{ marginBottom: 10 }}>
            <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: 'rgba(196,169,106,0.8)', padding: '0 0.4rem 0.3rem' }}>{g.label}</p>
            {g.boards.map(k => {
              const b = BOARD_META[k]
              const on = k === activeTab
              const r = rankOf(k)
              return (
                <button key={k} type="button" onClick={() => setActiveTab(k)} className="tap"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.46rem 0.55rem', borderRadius: 9,
                    background: on ? `${b.accent}1f` : 'transparent', border: `1px solid ${on ? `${b.accent}88` : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: b.accent, flexShrink: 0 }} />
                  <span className="font-karla font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: on ? '#f2efe8' : '#c9c4bc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: r != null && r <= 3 ? PODIUM[r] : r == null ? '#5a5856' : '#9a9488', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r == null ? '' : `#${r}`}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div style={{ minWidth: 0 }}>
      {/* The dropdown stays for a phone. */}
      <div className="lb-picker">
        <BoardPicker
          groups={groups}
          active={activeTab}
          onSelect={setActiveTab}
          rankOf={rankOf}
        />
      </div>

      {/* ── THE BOARD'S HEAD, AND WHERE YOU STAND ── always, not only when you
          are outside the top fifty. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12,
        padding: '0.75rem 0.95rem', borderRadius: 14,
        background: `linear-gradient(180deg, ${meta.accent}16, rgba(8,8,6,0.5))`, border: `1px solid ${meta.accent}44`,
      }}>
        <p className="font-cinzel font-800" style={{ flex: 1, minWidth: 0, fontSize: '1.2rem', color: '#f4efe4', lineHeight: 1.1 }}>{meta.label}</p>
        <span className="font-karla font-700" style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '0.35rem 0.75rem', borderRadius: 999,
          background: 'rgba(0,0,0,0.3)', border: `1px solid ${myRank != null && myRank <= 3 ? PODIUM[myRank] : 'rgba(255,255,255,0.12)'}`,
          fontSize: '0.78rem', color: '#e6e1d6', fontVariantNumeric: 'tabular-nums',
        }}>
          {myRank != null && myScore != null ? (
            <>You <span className="font-cinzel font-800" style={{ color: myRank <= 3 ? PODIUM[myRank] : meta.accent }}>#{myRank}</span> <span style={{ opacity: 0.75 }}>{meta.unit(myScore)}</span></>
          ) : 'Not on this board yet'}
        </span>
      </div>

      {/* ── Active leaderboard ── */}
      <LeaderboardSection
        accent={meta.accent}
        unit={meta.unit}
        subUnit={meta.subUnit}
        showZone={meta.showZone}
        valueColor={meta.valueColor}
        data={dataOf(activeTab)}
        myScore={scoreOf(activeTab)}
        currentUserId={currentUserId}
        avatars={avatars}
        // The best captains, shown whole, on every board now: the podium is
        // the best-looking thing on this page and it was on one of fourteen.
        stage
      />
      </div>
    </div>
  )
}
