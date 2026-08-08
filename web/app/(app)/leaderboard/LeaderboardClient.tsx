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
  tideRun: number | null
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
  tideRun: number | null
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
  tideRun: LeaderboardEntry[]
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
  'expedition', 'chartingPoints', 'parlorPoints', 'tideRun', 'blackjack', 'fishSlots', 'roulette',
  'species', 'trophies', 'fishSold', 'bountyPoints',
]

export default function LeaderboardClient({ fishing, perfectStreak, tideRun, chartingPoints, parlorPoints, fishSlots, blackjack, roulette, expedition, raidProgress, achievementPoints, species, fishSold, trophies, bountyPoints, myScores, myRanks, currentUserId, avatars }: Props) {
  const [activeTab, setActiveTab] = useState<BoardKey>('achievementPoints')

  // BoardKey → its data array + the player's score/rank for that board.
  const dataOf = (k: BoardKey): LeaderboardEntry[] =>
    k === 'fishingLevel' ? fishing
    : k === 'perfectStreak' ? perfectStreak
    : k === 'tideRun' ? tideRun
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
    : k === 'tideRun' ? myScores.tideRun
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
    : k === 'tideRun' ? myRanks.tideRun
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

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* One scalable dropdown, grouped by category, replacing the old
          section-tabs + board-pills chrome. */}
      <BoardPicker
        groups={groupBoards(AVAILABLE_BOARDS)}
        active={activeTab}
        onSelect={setActiveTab}
        rankOf={rankOf}
      />

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
      />
    </div>
  )
}
