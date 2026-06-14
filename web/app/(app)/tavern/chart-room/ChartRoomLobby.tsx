'use client'

// The Chart Room — the front door for the grid / navigation "thinker"
// games. Same lobby skeleton as the Den and the Parlor. The
// Quartermaster's Hold (daily sudoku) is live; Charting lives here too
// now (moved off the tavern home 2026-06-13).

import Link from 'next/link'
import HoldCard from './HoldCard'
import MinefieldCard from './MinefieldCard'

export default function ChartRoomLobby({ doubloons, holdStatus, holdDoubloonsToday, minefieldStatus, minefieldReward }: {
  doubloons: number
  holdStatus: 'open' | 'locked' | 'done'
  holdDoubloonsToday: number
  minefieldStatus: 'active' | 'cleared'
  minefieldReward: number
}) {
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
