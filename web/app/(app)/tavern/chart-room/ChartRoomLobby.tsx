'use client'

// The Chart Room — the front door for the grid / navigation "thinker"
// games. Same lobby skeleton as the Den and the Parlor. The
// Quartermaster's Hold (daily sudoku) is live; Charting lives here too
// now (moved off the tavern home 2026-06-13).

import Link from 'next/link'
import HoldCard from './HoldCard'
import TreasureMatchCard from './TreasureMatchCard'
import RiggingCard from './RiggingCard'
import { DEN_PURSE_TIERS } from '../constants'

const GOLD = '#f0c040'

export default function ChartRoomLobby({ doubloons, holdStatus, holdDoubloonsToday, matchStatus, matchReward, riggingStatus, riggingReward, puzzlePoints }: {
  doubloons: number
  holdStatus: 'open' | 'locked' | 'done'
  holdDoubloonsToday: number
  matchStatus: 'active' | 'cleared'
  matchReward: number
  riggingStatus: 'active' | 'cleared'
  riggingReward: number
  puzzlePoints: number
}) {
  // Index of the highest tier the player has reached (their active cap).
  const currentIdx = DEN_PURSE_TIERS.reduce((acc, t, i) => (puzzlePoints >= t.points ? i : acc), 0)
  const nextTier = DEN_PURSE_TIERS[currentIdx + 1] ?? null

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
        A quiet corner for steady minds. Three puzzles, fresh every week.
      </p>

      {/* Den-purse progress — compact. Points (from the puzzles) raise
          your daily casino buy-in cap; the chips show the ladder. */}
      <div style={{
        padding: '0.7rem 0.85rem 0.75rem', borderRadius: 14,
        background: ['radial-gradient(ellipse 80% 70% at 50% 0%, rgba(196,169,106,0.12) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(44,34,16,0.55) 0%, rgba(26,19,9,0.65) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f4ecd8' }}>Den Purse</span>
          <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#cfc6b0' }}>
            <span className="font-cinzel" style={{ color: GOLD, fontSize: '1rem' }}>{puzzlePoints}</span> pts
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DEN_PURSE_TIERS.map((t, i) => {
            const reached = puzzlePoints >= t.points
            const isCurrent = i === currentIdx
            return (
              <div key={t.points} style={{
                flex: 1, padding: '0.5rem 0.2rem', borderRadius: 9, textAlign: 'center',
                background: isCurrent ? `${GOLD}26` : reached ? 'rgba(196,169,106,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isCurrent ? GOLD : reached ? 'rgba(196,169,106,0.32)' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: isCurrent ? `0 0 10px ${GOLD}33` : 'none',
              }}>
                <div className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: isCurrent ? GOLD : reached ? '#f4ecd8' : '#8f8676' }}>
                  {t.cap / 1000}k
                </div>
                <div className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.06em', marginTop: 2, color: isCurrent ? GOLD : reached ? '#7bbf7b' : '#8f8676' }}>
                  {isCurrent ? 'Now' : reached ? '✓' : `${t.points} pt`}
                </div>
              </div>
            )
          })}
        </div>
        <p className="font-karla" style={{ fontSize: '0.64rem', color: '#a89e86', textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
          Solve the puzzles for charting points → bigger daily casino purse (⟡/day).{nextTier ? ` ${nextTier.points - puzzlePoints} to ${nextTier.cap / 1000}k.` : ' Top purse reached.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <HoldCard status={holdStatus} doubloonsToday={holdDoubloonsToday} />
        <TreasureMatchCard status={matchStatus} reward={matchReward} />
        <RiggingCard status={riggingStatus} reward={riggingReward} />
      </div>

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        Fresh puzzles every Monday. Stow the hold clean for a bonus.
      </p>
    </div>
  )
}
