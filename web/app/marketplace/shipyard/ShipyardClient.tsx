'use client'

import { useState, useTransition } from 'react'
import { SHIPS } from '@/lib/ships'
import { buyShip } from '@/app/shipyard/actions'

export default function ShipyardClient({ shipTier: initialTier, doubloons: initialDoubloons }: { shipTier: number; doubloons: number }) {
  const [shipTier, setShipTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleBuyShip() {
    setError(null)
    startTransition(async () => {
      const result = await buyShip()
      if ('error' in result) {
        setError(result.error)
      } else {
        setShipTier(result.shipTier)
        setDoubloons(result.doubloons)
      }
    })
  }

  const nextShip = shipTier < SHIPS.length - 1 ? SHIPS[shipTier + 1] : null
  const canAfford = nextShip ? doubloons >= nextShip.cost : false

  return (
    <div className="px-6 max-w-sm mx-auto">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3" style={{ fontSize: '0.65rem' }}>
        Shipyard
      </p>
      <div className="flex flex-col gap-2.5 mb-6">
        {SHIPS.map((ship) => {
          const owned = ship.tier <= shipTier
          const isActive = ship.tier === shipTier
          const locked = ship.tier > shipTier + 1
          const isNext = ship.tier === shipTier + 1
          const clickable = isNext && canAfford && !isPending
          const c = ship.color

          return (
            <div
              key={ship.tier}
              onClick={clickable ? handleBuyShip : undefined}
              style={{
                background: owned ? `${c}0d` : isNext && canAfford ? `${c}08` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${owned ? `${c}55` : isNext && canAfford ? `${c}40` : 'rgba(255,255,255,0.05)'}`,
                boxShadow: isActive ? `0 0 16px ${c}18` : isNext && canAfford ? `0 0 12px ${c}12` : 'none',
                borderRadius: 12,
                padding: '0.75rem 0.875rem',
                opacity: locked ? 0.3 : isPending && isNext ? 0.6 : 1,
                cursor: clickable ? 'pointer' : 'default',
                transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
              }}
            >
              <div className="flex items-start gap-3">
                <ShipIcon tier={ship.tier} color={c} owned={owned} isActive={isActive} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: owned ? '#f0ede8' : '#6a6764' }}>
                      {ship.name}
                    </p>
                    {isActive && (
                      <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: c }}>Active</span>
                    )}
                    {owned && !isActive && (
                      <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.52rem' }}>Owned</span>
                    )}
                  </div>
                  <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.7rem' }}>{ship.description}</p>

                  {isNext && (
                    <p className="font-karla font-600 mt-1" style={{ fontSize: '0.65rem', color: canAfford ? c : '#6a6764' }}>
                      {isPending ? 'Upgrading…' : canAfford ? '↑ Tap to upgrade' : `${(ship.cost - doubloons).toLocaleString()} ⟡ short`}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.8rem' }}>
                      {ship.cost.toLocaleString()} ⟡
                    </p>
                  )}
                  <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: owned ? c : '#4a4845' }}>
                    {ship.dailyBonus > 0 ? `+${ship.dailyBonus} ⟡/day` : 'Base'}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mb-2">{error}</p>}
      {!nextShip && (
        <p className="font-karla font-300 text-[#8a8880] text-sm text-center">
          Your fleet commands the sea.
        </p>
      )}
    </div>
  )
}

function ShipIcon({ tier, color, owned, isActive }: { tier: number; color: string; owned: boolean; isActive: boolean }) {
  const stroke = owned ? color : '#4a4845'
  const fill = owned ? color : '#4a4845'
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.03)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.06)'

  const icons: Record<number, React.ReactNode> = {
    0: (
      // Rowboat — simple hull, two oars
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 14 C3 14 5 18 12 18 C19 18 21 14 21 14"/>
        <path d="M5 14 L7 10 L17 10 L19 14"/>
        <line x1="8" y1="10" x2="6" y2="7"/>
        <line x1="16" y1="10" x2="18" y2="7"/>
      </svg>
    ),
    1: (
      // Dinghy — rounder hull, small sail
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 15 C4 19 20 19 22 15"/>
        <path d="M4 15 L6 11 L18 11 L20 15"/>
        <line x1="12" y1="11" x2="12" y2="5"/>
        <path d="M12 5 L16 9 L12 11"/>
      </svg>
    ),
    2: (
      // Sloop — single mast with sail
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 16 C4 20 20 20 22 16"/>
        <path d="M4 16 L6 12 L18 12 L20 16"/>
        <line x1="11" y1="12" x2="11" y2="4"/>
        <path d="M11 4 L18 10 L11 12"/>
        <line x1="8" y1="12" x2="6" y2="9"/>
      </svg>
    ),
    3: (
      // Schooner — two masts
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 16 C4 20 20 20 22 16"/>
        <path d="M4 16 L6 12 L18 12 L20 16"/>
        <line x1="9" y1="12" x2="9" y2="4"/>
        <path d="M9 4 L15 9 L9 12"/>
        <line x1="16" y1="12" x2="16" y2="6"/>
        <path d="M16 6 L20 10 L16 12"/>
      </svg>
    ),
    4: (
      // Brigantine — two masts, square rigging
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 17 C3 21 21 21 23 17"/>
        <path d="M3 17 L5 13 L19 13 L21 17"/>
        <line x1="9" y1="13" x2="9" y2="3"/>
        <line x1="5" y1="7" x2="13" y2="7"/>
        <path d="M5 7 L9 13"/>
        <path d="M13 7 L9 13"/>
        <line x1="16" y1="13" x2="16" y2="5"/>
        <path d="M16 5 L20 10 L16 13"/>
      </svg>
    ),
    5: (
      // Galleon — wide hull, three masts, flags
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 17 C3 21 21 21 23 17"/>
        <path d="M2 17 L5 12 L19 12 L22 17"/>
        <line x1="8" y1="12" x2="8" y2="3"/>
        <path d="M8 3 L14 8 L8 12"/>
        <line x1="14" y1="12" x2="14" y2="5"/>
        <path d="M14 5 L19 9 L14 12"/>
        <line x1="5" y1="12" x2="5" y2="7"/>
        <path d="M5 7 L8 9 L5 11"/>
        <circle cx="8" cy="3" r="0.8" fill={fill} stroke="none"/>
      </svg>
    ),
    6: (
      // Man-o-War — imposing, multiple gun decks
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 17 C2 21 22 21 23 17"/>
        <path d="M2 17 L4 11 L20 11 L22 17"/>
        <line x1="4" y1="14" x2="2" y2="14"/>
        <line x1="20" y1="14" x2="22" y2="14"/>
        <line x1="8" y1="11" x2="8" y2="2"/>
        <line x1="5" y1="6" x2="11" y2="6"/>
        <line x1="5" y1="9" x2="11" y2="9"/>
        <line x1="14" y1="11" x2="14" y2="4"/>
        <path d="M14 4 L19 8 L14 11"/>
        <line x1="5" y1="11" x2="5" y2="6"/>
        <path d="M5 6 L8 8 L5 10"/>
        <circle cx="8" cy="2" r="0.9" fill={fill} stroke="none"/>
      </svg>
    ),
  }

  return (
    <div style={{
      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
      background: bg,
      border: `1px solid ${border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: isActive ? `0 0 10px ${color}25` : 'none',
    }}>
      {icons[tier]}
    </div>
  )
}
