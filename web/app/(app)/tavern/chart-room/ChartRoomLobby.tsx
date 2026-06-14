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

export default function ChartRoomLobby({ doubloons, holdStatus, holdDoubloonsToday, minefieldStatus, minefieldReward, puzzlePoints }: {
  doubloons: number
  holdStatus: 'open' | 'locked' | 'done'
  holdDoubloonsToday: number
  minefieldStatus: 'active' | 'cleared'
  minefieldReward: number
  puzzlePoints: number
}) {
  // Index of the highest tier the player has reached (their active cap).
  const currentIdx = DEN_PURSE_TIERS.reduce((acc, t, i) => (puzzlePoints >= t.points ? i : acc), 0)

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

      {/* Puzzle points + the full Den-purse upgrade chain. Both games
          feed puzzle points; this is what they buy. */}
      <div style={{
        padding: '0.9rem 1rem 1rem', borderRadius: 14,
        background: ['radial-gradient(ellipse 80% 70% at 50% 0%, rgba(196,169,106,0.12) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.5) 0%, rgba(24,18,8,0.6) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#a89878' }}>Puzzle Points</span>
          <span className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: GOLD }}>{puzzlePoints}</span>
        </div>
        <p className="font-karla" style={{ fontSize: '0.66rem', color: '#b8af9a', lineHeight: 1.5, marginTop: 4 }}>
          Solve the Hold and the Minefield to bank puzzle points. They permanently raise your <span style={{ color: GOLD }}>Den purse</span> — the most doubloons you can buy into the casino each day.
        </p>

        {/* Upgrade ladder */}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {DEN_PURSE_TIERS.map((t, i) => {
            const reached = puzzlePoints >= t.points
            const isCurrent = i === currentIdx
            const last = i === DEN_PURSE_TIERS.length - 1
            return (
              <div key={t.points} style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                {/* rail + node */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                    background: isCurrent ? GOLD : reached ? `${GOLD}99` : 'rgba(8,12,16,0.8)',
                    border: `1.5px solid ${reached ? GOLD : 'rgba(196,169,106,0.4)'}`,
                    boxShadow: isCurrent ? `0 0 8px ${GOLD}` : 'none',
                  }} />
                  {!last && <span style={{ flex: 1, width: 2, background: reached ? `${GOLD}55` : 'rgba(196,169,106,0.18)', marginTop: 2, minHeight: 14 }} />}
                </div>
                {/* row */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: last ? 0 : 12 }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: reached ? '#f0e8d2' : '#8a8272' }}>
                    {t.cap.toLocaleString()} ⟡<span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#8a8272' }}>/day</span>
                  </span>
                  <span className="font-karla font-700" style={{ fontSize: '0.6rem', letterSpacing: '0.04em',
                    color: isCurrent ? GOLD : reached ? '#7bbf7b' : '#9a9078' }}>
                    {isCurrent ? 'CURRENT' : reached ? 'Unlocked' : t.points === 0 ? 'Start' : `${t.points - puzzlePoints} pts to go`}
                  </span>
                </div>
              </div>
            )
          })}
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
