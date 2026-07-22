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
import ChartingNav from '@/components/ChartingNav'

const MEDAL = ['#f0c040', '#c9d2dc', '#cd7f32'] // gold · silver · bronze

export default function ChartRoomLobby({ holdSolved, holdDoubloonsToday, matchStatus, matchReward, minefieldStatus, minefieldReward, riggingStatus, riggingReward, puzzlePoints, chartingClaimed, topCharters, isMember }: {
  holdSolved: number
  holdDoubloonsToday: number
  matchStatus: 'active' | 'cleared'
  matchReward: number
  minefieldStatus: 'active' | 'cleared'
  minefieldReward: number
  riggingStatus: 'active' | 'cleared'
  riggingReward: number
  puzzlePoints: number
  chartingClaimed: number[]
  topCharters: { username: string; points: number }[]
  isMember: boolean
}) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <ChartingNav title="Charting" backHref="/tavern" backLabel="Tavern" points={puzzlePoints} />

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        A quiet corner for steady minds. Four puzzles, fresh every week.
      </p>

      {/* The World Chart — the collectible the puzzles feed toward. */}
      <WorldChartCard points={puzzlePoints} claimed={chartingClaimed} />

      <div className="grid grid-cols-2 gap-3">
        <HoldCard solvedCount={holdSolved} doubloonsToday={holdDoubloonsToday} />
        <TreasureMatchCard status={matchStatus} reward={matchReward} />
        <MinefieldCard status={minefieldStatus} reward={minefieldReward} />
        <RiggingCard status={riggingStatus} reward={riggingReward} isMember={isMember} />
      </div>

      {/* Top charters — the three deepest banks of charting points. */}
      {topCharters.length > 0 && (
        <div style={{ borderRadius: 14, padding: '0.75rem 0.9rem 0.6rem', background: 'rgba(20,14,7,0.6)', border: '1px solid rgba(196,169,106,0.28)' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: '#e6d8b4', textAlign: 'center', letterSpacing: '0.02em', marginBottom: 8 }}>
            Top Charters
          </p>
          {topCharters.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.34rem 0.1rem', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <span className="font-cinzel font-700" style={{ width: 18, textAlign: 'center', fontSize: '0.82rem', color: MEDAL[i] }}>{i + 1}</span>
              <span className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#d8cdb2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.username}</span>
              <span className="font-karla font-700 flex items-center" style={{ gap: 4, fontSize: '0.78rem', color: MEDAL[i], whiteSpace: 'nowrap' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill={MEDAL[i]} aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                {r.points.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        Fresh puzzles every Monday. Stow the hold clean for a bonus.
      </p>
    </div>
  )
}
