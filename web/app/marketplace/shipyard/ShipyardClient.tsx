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
                border: `1px solid ${isActive ? `${c}55` : owned ? `${c}35` : isNext && canAfford ? `${c}40` : 'rgba(255,255,255,0.14)'}`,
                boxShadow: isActive ? `0 0 16px ${c}18` : 'none',
                borderRadius: 12,
                padding: '0.85rem 0.75rem',
                opacity: locked ? 0.3 : 1,
                cursor: locked ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'box-shadow 0.2s ease',
              }}
            >
              {/* Ship image */}
              <div style={{ width: '100%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8%' }}>
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

  const statDefs = [
    { key: 'durability' as const, label: 'Durability', icon: '🛡', color: '#60a5fa', description: 'Total HP your ship can absorb before sinking' },
    { key: 'speed'      as const, label: 'Speed',      icon: '⚡', color: '#f0c040', description: 'Initiative bonus — higher speed fires first' },
    { key: 'armor'      as const, label: 'Armor',      icon: '⚓', color: '#4ade80', description: 'Flat damage reduction on every hit you take' },
  ]

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
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{ship.name}</p>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>{ship.description}</p>
          </div>
          <button onClick={onClose} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

          {/* Large ship image */}
          <div style={{
            background: 'rgba(8,8,6,0.82)',
            border: `1px solid ${c}30`,
            borderRadius: 12,
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 40px ${c}15`,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ship.imageUrl}
              alt={ship.name}
              style={{ width: 180, height: 180, objectFit: 'contain', filter: owned ? 'none' : 'grayscale(1) brightness(0.45)' }}
            />
          </div>

          {/* Crew slots */}
          <div style={{ background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: c }}>{stats?.crewSlots ?? 1}</p>
            <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 2 }}>Crew Slots</p>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginTop: 4, lineHeight: 1.4 }}>Cards you can bring into battle to boost Power, Dodge, and Fortune</p>
          </div>

          {/* Combat stats */}
          <div className="flex flex-col gap-2">
            <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764' }}>Combat Stats</p>
            {statDefs.map(s => (
              <div key={s.key} style={{ background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, padding: '0.7rem 0.875rem' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
                    {s.icon} {s.label}
                  </p>
                  <div style={{ background: `${s.color}15`, border: `1px solid ${s.color}30`, borderRadius: 6, padding: '0.15rem 0.5rem' }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: s.color }}>{stats?.[s.key] ?? '—'}</p>
                  </div>
                </div>
                <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.4 }}>{s.description}</p>
              </div>
            ))}
          </div>

          {/* How combat works */}
          <div style={{ background: `${c}0a`, border: `1px solid ${c}25`, borderRadius: 10, padding: '0.75rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: c, marginBottom: 6 }}>How combat works</p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#a0a09a', lineHeight: 1.55 }}>
              Each round you choose Reload, Fire, or Defend. Stockpile charges for bigger shots — 3 charges deals 5× base damage. Speed determines who fires first when both sides shoot.
            </p>
          </div>

          {/* Buy / status */}
          {isActive && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.7rem', color: c }}>✓ Active Ship</span>
            </div>
          )}
          {owned && !isActive && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <span className="font-karla font-300 uppercase tracking-[0.1em]" style={{ fontSize: '0.7rem', color: '#4ade80' }}>✓ Owned</span>
            </div>
          )}
          {isNext && (
            <button
              onClick={onBuy}
              disabled={!canAfford || isPending}
              className="btn-ghost w-full disabled:opacity-30"
            >
              {isPending ? 'Upgrading…' : canAfford ? `Upgrade · ${ship.cost.toLocaleString()} ⟡` : `${(ship.cost - doubloons).toLocaleString()} ⟡ short`}
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
