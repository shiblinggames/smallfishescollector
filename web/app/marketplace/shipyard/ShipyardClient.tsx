'use client'

import { useState, useTransition } from 'react'
import { SHIPS } from '@/lib/ships'
import { buyShip } from '@/app/shipyard/actions'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'

export default function ShipyardClient({ shipTier: initialTier, doubloons: initialDoubloons }: { shipTier: number; doubloons: number }) {
  const [shipTier, setShipTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)

  function handleBuyShip() {
    setError(null)
    startTransition(async () => {
      const result = await buyShip()
      if ('error' in result) {
        setError(result.error)
      } else {
        setShipTier(result.shipTier)
        setDoubloons(result.doubloons)
        setSelectedTier(result.shipTier)
      }
    })
  }

  const nextShip = shipTier < SHIPS.length - 1 ? SHIPS[shipTier + 1] : null
  const canAfford = nextShip ? doubloons >= nextShip.cost : false

  return (
    <div className="px-4 sm:px-6 max-w-sm sm:max-w-2xl mx-auto pb-16">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-4 text-[0.65rem] sm:text-xs">
        Shipyard
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SHIPS.map((ship) => {
          const owned = ship.tier <= shipTier
          const isActive = ship.tier === shipTier
          const locked = ship.tier > shipTier + 1
          const isNext = ship.tier === shipTier + 1
          const c = ship.color

          return (
            <div
              key={ship.tier}
              onClick={() => !locked && setSelectedTier(ship.tier)}
              style={{
                background: 'rgba(8,8,6,0.82)',
                border: `1px solid ${isActive ? `${c}55` : 'rgba(255,255,255,0.14)'}`,
                boxShadow: isActive ? `0 0 18px ${c}30` : 'none',
                borderRadius: 12,
                padding: '0.7rem 0.65rem',
                opacity: locked ? 0.5 : 1,
                cursor: locked ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                transition: 'box-shadow 0.2s ease',
              }}
            >
              {/* Ship image */}
              <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4%' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ship.imageUrl}
                  alt={ship.name}
                  style={{
                    width: '100%', height: '100%', objectFit: 'contain',
                    filter: owned ? 'none' : 'grayscale(1) brightness(0.4)',
                  }}
                />
              </div>

              {/* Name + status */}
              <div>
                <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: owned ? '#f0ede8' : '#6a6764', lineHeight: 1.2 }}>
                  {ship.name}
                </p>
                {isActive && (
                  <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: c }}>Active</span>
                )}
                {owned && !isActive && (
                  <span className="font-karla font-300 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#4ade80' }}>Owned</span>
                )}
                {!owned && !locked && (
                  <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: canAfford && isNext ? c : '#6a6764' }}>
                    {ship.cost.toLocaleString()} ⟡
                  </p>
                )}
              </div>

              {/* Hold capacity */}
              <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: owned ? `${c}bb` : '#3a3835' }}>
                {ship.holdCapacity} fish hold
              </p>
            </div>
          )
        })}
      </div>

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mt-4">{error}</p>}
      {!nextShip && (
        <p className="font-karla font-300 text-[#a0a09a] text-sm text-center mt-6">
          Your fleet commands the sea.
        </p>
      )}

      {selectedTier !== null && (
        <ShipDetailModal
          tier={selectedTier}
          shipTier={shipTier}
          doubloons={doubloons}
          isPending={isPending}
          onBuy={handleBuyShip}
          onClose={() => setSelectedTier(null)}
        />
      )}
    </div>
  )
}

function ShipDetailModal({
  tier, shipTier, doubloons, isPending, onBuy, onClose,
}: {
  tier: number
  shipTier: number
  doubloons: number
  isPending: boolean
  onBuy: () => void
  onClose: () => void
}) {
  const ship = SHIPS[tier]
  const stats = EXPEDITION_SHIP_STATS[tier]
  const c = ship.color
  const owned = tier <= shipTier
  const isActive = tier === shipTier
  const isNext = tier === shipTier + 1
  const canAfford = doubloons >= ship.cost

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
          width: '100%', maxWidth: 480, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.05rem' }}>{ship.name}</p>
            <p className="font-karla" style={{ fontSize: '0.65rem', color: '#6a6764', marginTop: 2 }}>{ship.description}</p>
          </div>
          <button onClick={onClose} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">

          {/* Ship image */}
          <div style={{
            background: 'rgba(8,8,6,0.82)', border: `1px solid ${c}30`,
            borderRadius: 12, padding: '1.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 40px ${c}15`,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ship.imageUrl} alt={ship.name}
              style={{ width: 160, height: 160, objectFit: 'contain', filter: owned ? 'none' : 'grayscale(1) brightness(0.45)' }}
            />
          </div>

          {/* Fishing + crew quick stats */}
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4a6a8a', marginBottom: 8 }}>Fishing</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Fish Hold', value: ship.holdCapacity, unit: 'fish', color: c },
                { label: 'Crew Slots', value: stats?.crewSlots ?? 1, unit: 'cards', color: c },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(8,8,6,0.82)', border: `1px solid ${c}25`, borderRadius: 10, padding: '0.7rem', textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#6a6764', marginTop: 4 }}>{s.label}</p>
                  <p className="font-karla" style={{ fontSize: '0.5rem', color: '#4a4845', marginTop: 2 }}>{s.unit}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Combat stats */}
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4a6a8a', marginBottom: 8 }}>Combat</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'HP',       value: stats?.durability ?? '—', color: '#60a5fa' },
                { label: 'Armor',    value: stats?.armor      ?? '—', color: '#4ade80' },
                { label: 'Speed',    value: stats?.speed      ?? '—', color: '#f0c040' },
                { label: 'Min Shot', value: stats?.minDamage  ?? '—', color: '#fb923c' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(8,8,6,0.82)', border: `1px solid ${s.color}22`, borderRadius: 10, padding: '0.6rem 0.4rem', textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.45rem', color: '#6a6764', marginTop: 4 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginTop: 8, lineHeight: 1.5 }}>
              Reload to stockpile charges (max 3). Fire spends 1 charge (×1 dmg) — Volley spends all 3 (×2 dmg). Defend reduces incoming damage and enables dodging. Speed determines who fires first.
            </p>
          </div>

          {/* Status / buy */}
          {isActive && (
            <p className="font-karla font-600 uppercase tracking-[0.1em] text-center" style={{ fontSize: '0.7rem', color: c }}>✓ Active Ship</p>
          )}
          {owned && !isActive && (
            <p className="font-karla font-300 uppercase tracking-[0.1em] text-center" style={{ fontSize: '0.7rem', color: '#4ade80' }}>✓ Owned</p>
          )}
          {isNext && (
            <button onClick={onBuy} disabled={!canAfford || isPending} className="btn-ghost w-full disabled:opacity-30">
              {isPending ? 'Upgrading…' : canAfford ? `Upgrade · ${ship.cost.toLocaleString()} ⟡` : `${(ship.cost - doubloons).toLocaleString()} ⟡ short`}
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
