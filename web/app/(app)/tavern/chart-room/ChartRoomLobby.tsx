'use client'

// The Chart Room — the front door for the grid / navigation "thinker"
// games. Same lobby skeleton as the Den and the Parlor. The
// Quartermaster's Hold (daily sudoku) is live; Charting lives here too
// now (moved off the tavern home 2026-06-13).

import Link from 'next/link'
import HoldCard from './HoldCard'
import MinefieldCard from './MinefieldCard'
import { DEN_PURSE_TIERS } from '../constants'

const GOLD = '#f0c040'

export default function ChartRoomLobby({ doubloons, holdStatus, holdDoubloonsToday, minefieldStatus, minefieldReward, puzzlePoints, denCap, nextTier }: {
  doubloons: number
  holdStatus: 'open' | 'locked' | 'done'
  holdDoubloonsToday: number
  minefieldStatus: 'active' | 'cleared'
  minefieldReward: number
  puzzlePoints: number
  denCap: number
  nextTier: { points: number; cap: number } | null
}) {
  // Progress bar runs from the tier the player has cleared to the next.
  const prevPoints = [...DEN_PURSE_TIERS].reverse().find(t => puzzlePoints >= t.points)?.points ?? 0
  const span = nextTier ? Math.max(1, nextTier.points - prevPoints) : 1
  const fill = nextTier ? Math.min(1, (puzzlePoints - prevPoints) / span) : 1

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header — side rails get equal flex so the title sits centered. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Tavern
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          The Chart Room
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        A quiet corner for steady minds. Balance a hold by day, sweep the minefield by week.
      </p>

      {/* Puzzle-points + Den-purse progress — both games feed this. */}
      <div style={{
        padding: '0.9rem 1rem', borderRadius: 14,
        background: ['radial-gradient(ellipse 80% 70% at 50% 0%, rgba(196,169,106,0.12) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.5) 0%, rgba(24,18,8,0.6) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#a89878' }}>Puzzle Points</span>
          <span className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: GOLD }}>{puzzlePoints}</span>
        </div>
        <div style={{ marginTop: 8, height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.35)', overflow: 'hidden', border: '1px solid rgba(196,169,106,0.18)' }}>
          <div style={{ width: `${Math.round(fill * 100)}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg, #c4a96a, ${GOLD})`, transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 7 }}>
          <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: GOLD }}>Den purse {denCap.toLocaleString()} ⟡/day</span>
          <span className="font-karla" style={{ fontSize: '0.62rem', color: '#9a9078' }}>
            {nextTier ? `${nextTier.points - puzzlePoints} pts → ${nextTier.cap.toLocaleString()} ⟡` : 'Top purse reached'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <HoldCard status={holdStatus} doubloonsToday={holdDoubloonsToday} />
        <MinefieldCard status={minefieldStatus} reward={minefieldReward} />
      </div>

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        The hold is restocked fresh at midnight. Stow it clean for a bonus.
      </p>
    </div>
  )
}
