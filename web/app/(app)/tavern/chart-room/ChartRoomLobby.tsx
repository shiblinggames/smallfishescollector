'use client'

// The Chart Room — the front door for the grid / navigation "thinker"
// games. Same lobby skeleton as the Den and the Parlor. The
// Quartermaster's Hold (daily sudoku) is live; Charting lives here too
// now (moved off the tavern home 2026-06-13).

import HoldCard from './HoldCard'
import TreasureMatchCard from './TreasureMatchCard'
import MinefieldCard from './MinefieldCard'
import RiggingCard from './RiggingCard'
import WorldChartCard from './WorldChartCard'
import BackButton from '@/components/BackButton'

export default function ChartRoomLobby({ doubloons, holdStatus, holdDoubloonsToday, matchStatus, matchReward, minefieldStatus, minefieldReward, riggingStatus, riggingReward, puzzlePoints, chartingClaimed, isMember }: {
  doubloons: number
  holdStatus: 'open' | 'locked' | 'done'
  holdDoubloonsToday: number
  matchStatus: 'active' | 'cleared'
  matchReward: number
  minefieldStatus: 'active' | 'cleared'
  minefieldReward: number
  riggingStatus: 'active' | 'cleared'
  riggingReward: number
  puzzlePoints: number
  chartingClaimed: number[]
  isMember: boolean
}) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header — side rails get equal flex so the title sits centered. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BackButton href="/tavern" label="Tavern" />
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Charting
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        A quiet corner for steady minds. Four puzzles, fresh every week.
      </p>

      {/* The World Chart — the collectible the puzzles feed toward. */}
      <WorldChartCard points={puzzlePoints} claimed={chartingClaimed} />

      <div className="grid grid-cols-2 gap-3">
        <HoldCard status={holdStatus} doubloonsToday={holdDoubloonsToday} />
        <TreasureMatchCard status={matchStatus} reward={matchReward} />
        <MinefieldCard status={minefieldStatus} reward={minefieldReward} />
        <RiggingCard status={riggingStatus} reward={riggingReward} isMember={isMember} />
      </div>

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        Fresh puzzles every Monday. Stow the hold clean for a bonus.
      </p>
    </div>
  )
}
