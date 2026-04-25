'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { SHIPS } from '@/lib/ships'
import { buyShip } from '@/app/shipyard/actions'
import { EXPEDITION_SHIP_STATS, HULL_POINTS, STAT_ICONS, STAT_LABELS, STAT_DESCRIPTIONS } from '@/lib/expeditions'

const ShipViewer3D = dynamic(() => import('./ShipViewer3D'), { ssr: false })

export default function ShipyardClient({ shipTier: initialTier, doubloons: initialDoubloons }: { shipTier: number; doubloons: number }) {
  const [shipTier, setShipTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [statsModal, setStatsModal] = useState<number | null>(null)

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

  const activeShip = SHIPS[shipTier]

  return (
    <div className="px-6 max-w-sm sm:max-w-2xl mx-auto">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3 text-[0.65rem] sm:text-xs">
        Shipyard
      </p>

      {activeShip.modelUrl && (
        <div className="mb-5">
          <ShipViewer3D modelUrl={activeShip.modelUrl} color={activeShip.color} />
          <p className="font-cinzel font-700 text-center mt-2.5" style={{ fontSize: '0.85rem', color: activeShip.color }}>
            {activeShip.name}
          </p>
        </div>
      )}

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
              className="p-3 sm:p-5"
              style={{
                background: owned ? `${c}0d` : isNext && canAfford ? `${c}08` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${owned ? `${c}55` : isNext && canAfford ? `${c}40` : 'rgba(255,255,255,0.09)'}`,
                boxShadow: isActive ? `0 0 16px ${c}18` : isNext && canAfford ? `0 0 12px ${c}12` : 'none',
                borderRadius: 12,
                opacity: locked ? 0.3 : isPending && isNext ? 0.6 : 1,
                cursor: clickable ? 'pointer' : 'default',
                transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
              }}
            >
              <div className="flex items-start gap-3 sm:gap-5">
                <ShipIcon tier={ship.tier} color={c} owned={owned} isActive={isActive} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                      {ship.name}
                    </p>
                    {isActive && (
                      <span className="font-karla font-600 uppercase tracking-[0.12em] text-[0.52rem] sm:text-[0.6rem]" style={{ color: c }}>Active</span>
                    )}
                    {owned && !isActive && (
                      <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80] text-[0.52rem] sm:text-[0.6rem]">Owned</span>
                    )}
                  </div>
                  <p className="font-karla font-300 text-[#6a6764] text-xs sm:text-sm">{ship.description}</p>

                  {!locked && (
                    <button
                      onClick={e => { e.stopPropagation(); setStatsModal(ship.tier) }}
                      className="font-karla font-600 uppercase tracking-[0.08em] mt-2"
                      style={{ fontSize: '0.55rem', color: owned ? c : '#6a6764', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      View expedition stats →
                    </button>
                  )}

                  {isNext && (
                    <p className="font-karla font-600 mt-1.5 text-xs sm:text-sm" style={{ color: canAfford ? c : '#6a6764' }}>
                      {isPending ? 'Upgrading…' : canAfford ? '↑ Tap to upgrade' : `${(ship.cost - doubloons).toLocaleString()} ⟡ short`}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040] text-sm sm:text-base">
                      {ship.cost.toLocaleString()} ⟡
                    </p>
                  )}
                  <p className="font-karla font-600 text-xs sm:text-sm" style={{ color: owned ? c : '#4a4845' }}>
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
        <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
          Your fleet commands the sea.
        </p>
      )}

      {statsModal !== null && (
        <ShipStatsModal tier={statsModal} onClose={() => setStatsModal(null)} />
      )}
    </div>
  )
}

function ShipStatsModal({ tier, onClose }: { tier: number; onClose: () => void }) {
  const ship = SHIPS[tier]
  const stats = EXPEDITION_SHIP_STATS[tier]
  const hull = HULL_POINTS[tier] ?? 3
  const floor = tier + 1
  const statKeys = ['combat', 'navigation', 'durability', 'speed', 'luck'] as const
  const c = ship.color

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f0f0e',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '18px 18px 0 0',
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{ship.name}</p>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>Expedition stats</p>
          </div>
          <button onClick={onClose} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

          {/* Hull + crew summary */}
          <div className="flex gap-3">
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: c }}>{hull}</p>
              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 2 }}>Hull Points</p>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginTop: 4, lineHeight: 1.4 }}>How much damage your ship can take before sinking</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: c }}>{stats.crewSlots}</p>
              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 2 }}>Crew Slots</p>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginTop: 4, lineHeight: 1.4 }}>Cards you can assign before setting sail to boost your rolls</p>
            </div>
          </div>

          {/* How rolls work */}
          <div style={{ background: `${c}0a`, border: `1px solid ${c}25`, borderRadius: 10, padding: '0.75rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: c, marginBottom: 6 }}>How rolls work</p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#a0a09a', lineHeight: 1.55 }}>
              Each expedition event tests one of your stats. You roll randomly within your stat's range — a better ship means a higher floor and ceiling. Assigned crew add a bonus roll on top.
            </p>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-2">
            <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764' }}>Stat Rolls</p>
            {statKeys.map(stat => (
              <div key={stat} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.7rem 0.875rem' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
                    {STAT_ICONS[stat]} {STAT_LABELS[stat]}
                  </p>
                  <div style={{ background: `${c}15`, border: `1px solid ${c}30`, borderRadius: 6, padding: '0.15rem 0.5rem' }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: c }}>{floor}–{stats[stat]}</p>
                  </div>
                </div>
                <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.4 }}>{STAT_DESCRIPTIONS[stat]}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}

function ShipIcon({ tier, color, owned, isActive }: { tier: number; color: string; owned: boolean; isActive: boolean }) {
  const stroke = owned ? color : '#4a4845'
  const fill = owned ? color : '#4a4845'
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'

  const icons: Record<number, React.ReactNode> = {
    0: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 14 C3 14 5 18 12 18 C19 18 21 14 21 14"/>
        <path d="M5 14 L7 10 L17 10 L19 14"/>
        <line x1="8" y1="10" x2="6" y2="7"/>
        <line x1="16" y1="10" x2="18" y2="7"/>
      </svg>
    ),
    1: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 15 C4 19 20 19 22 15"/>
        <path d="M4 15 L6 11 L18 11 L20 15"/>
        <line x1="12" y1="11" x2="12" y2="5"/>
        <path d="M12 5 L16 9 L12 11"/>
      </svg>
    ),
    2: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 16 C4 20 20 20 22 16"/>
        <path d="M4 16 L6 12 L18 12 L20 16"/>
        <line x1="11" y1="12" x2="11" y2="4"/>
        <path d="M11 4 L18 10 L11 12"/>
        <line x1="8" y1="12" x2="6" y2="9"/>
      </svg>
    ),
    3: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 16 C4 20 20 20 22 16"/>
        <path d="M4 16 L6 12 L18 12 L20 16"/>
        <line x1="9" y1="12" x2="9" y2="4"/>
        <path d="M9 4 L15 9 L9 12"/>
        <line x1="16" y1="12" x2="16" y2="6"/>
        <path d="M16 6 L20 10 L16 12"/>
      </svg>
    ),
    4: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center p-2 sm:p-2.5"
      style={{
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: isActive ? `0 0 10px ${color}25` : 'none',
      }}
    >
      {icons[tier]}
    </div>
  )
}
