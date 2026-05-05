'use client'

import { useState, useTransition } from 'react'
import { SHIPS } from '@/lib/ships'
import { buyShip, renameShip } from '@/app/shipyard/actions'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'

export default function ShipyardClient({ shipTier: initialTier, doubloons: initialDoubloons, shipName: initialShipName }: { shipTier: number; doubloons: number; shipName: string | null }) {
  const [shipTier, setShipTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [shipName, setShipName] = useState(initialShipName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(initialShipName ?? '')

  const activeShip = SHIPS[shipTier]

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

  function handleRename(name: string) {
    startTransition(async () => {
      const result = await renameShip(name)
      if (!('error' in result)) setShipName(name.trim().slice(0, 32))
    })
  }

  function submitRename() {
    const trimmed = nameInput.trim().slice(0, 32)
    if (trimmed) handleRename(trimmed)
    setEditingName(false)
  }

  const nextShip = shipTier < SHIPS.length - 1 ? SHIPS[shipTier + 1] : null
  const canAfford = nextShip ? doubloons >= nextShip.cost : false

  return (
    <div className="px-4 sm:px-6 max-w-sm sm:max-w-2xl mx-auto pb-16">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-4 text-[0.65rem] sm:text-xs">
        Shipyard
      </p>

      {/* Ship name — prominent rename section */}
      <div style={{
        background: 'rgba(8,8,6,0.82)',
        border: `1px solid ${activeShip.color}30`,
        borderRadius: 16,
        padding: '1.1rem 1.2rem',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activeShip.imageUrl} alt={activeShip.name} style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 2px 10px ${activeShip.color}44)` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: activeShip.color, marginBottom: 5 }}>Your Ship</p>
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
                maxLength={32}
                placeholder={activeShip.name}
                style={{
                  background: 'rgba(255,255,255,0.07)', border: `1px solid ${activeShip.color}55`,
                  borderRadius: 8, padding: '0.4rem 0.7rem',
                  color: '#f0ede8', fontSize: '1.15rem', fontFamily: 'Cinzel, serif', fontWeight: 700,
                  outline: 'none', flex: 1, minWidth: 0,
                }}
              />
              <button onClick={submitRename} style={{ background: `${activeShip.color}22`, border: `1px solid ${activeShip.color}55`, borderRadius: 7, padding: '0.38rem 0.8rem', color: activeShip.color, cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0 }} className="font-karla font-700">Save</button>
              <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5248', fontSize: '0.78rem', flexShrink: 0 }} className="font-karla">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f0ede8', lineHeight: 1 }}>
                {shipName ?? activeShip.name}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#5a4a30' }}>✎</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SHIPS.map((ship) => {
          const stats = EXPEDITION_SHIP_STATS[ship.tier]
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
                background: isActive ? `rgba(8,8,6,0.95)` : 'rgba(8,8,6,0.82)',
                border: `1px solid ${isActive ? `${c}60` : owned ? `${c}28` : 'rgba(255,255,255,0.1)'}`,
                boxShadow: isActive ? `0 0 24px ${c}28` : 'none',
                borderRadius: 16,
                padding: '0.9rem 0.75rem 0.8rem',
                opacity: 1,
                cursor: locked ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                transition: 'box-shadow 0.2s ease',
              }}
            >
              {/* Ship image */}
              <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ship.imageUrl}
                  alt={ship.name}
                  style={{
                    width: '85%', height: '100%', objectFit: 'contain',
                    filter: owned
                      ? `drop-shadow(0 4px 14px ${c}40)`
                      : locked
                        ? 'grayscale(1) brightness(0.25)'
                        : 'grayscale(0.6) brightness(0.55)',
                  }}
                />
              </div>

              {/* Name + status */}
              <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: owned ? '#f0ede8' : '#5a5755', lineHeight: 1.15, marginBottom: 4 }}>
                {ship.name}
              </p>

              {isActive && (
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: c, marginBottom: 8 }}>⬤ Active</span>
              )}
              {owned && !isActive && (
                <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4ade8088', marginBottom: 8 }}>✓ Owned</span>
              )}
              {!owned && !locked && (
                <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: canAfford && isNext ? c : '#4a4845', marginBottom: 8 }}>
                  {ship.cost.toLocaleString()} ⟡
                </p>
              )}
              {locked && (
                <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#5a5755', marginBottom: 8 }}>🔒 Upgrade to unlock</span>
              )}

              {/* Key stats */}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                <div style={{
                  flex: 1, background: owned ? `${c}0d` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${owned ? `${c}22` : 'rgba(255,255,255,0.09)'}`,
                  borderRadius: 8, padding: '0.45rem 0.3rem', textAlign: 'center',
                }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: owned ? c : '#6a6764', lineHeight: 1 }}>{ship.holdCapacity}</p>
                  <p className="font-karla font-600 uppercase" style={{ fontSize: '0.42rem', color: owned ? '#6a6764' : '#4a4845', letterSpacing: '0.08em', marginTop: 3 }}>Hold</p>
                </div>
                <div style={{
                  flex: 1, background: owned ? `${c}0d` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${owned ? `${c}22` : 'rgba(255,255,255,0.09)'}`,
                  borderRadius: 8, padding: '0.45rem 0.3rem', textAlign: 'center',
                }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: owned ? c : '#6a6764', lineHeight: 1 }}>{stats?.crewSlots ?? 1}</p>
                  <p className="font-karla font-600 uppercase" style={{ fontSize: '0.42rem', color: owned ? '#6a6764' : '#4a4845', letterSpacing: '0.08em', marginTop: 3 }}>Crew</p>
                </div>
              </div>
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0c0c0a',
          border: `1px solid ${c}30`,
          borderTop: `2px solid ${c}50`,
          borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: `0 -8px 40px ${c}18`,
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.4rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', lineHeight: 1.1 }}>{ship.name}</p>
              <p className="font-karla font-400" style={{ fontSize: '0.82rem', color: '#6a6764', marginTop: 5, lineHeight: 1.4 }}>{ship.description}</p>
            </div>
            <button onClick={onClose} style={{ color: '#5a5755', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', padding: '0.4rem', flexShrink: 0, marginTop: 2 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {isActive && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.68rem', color: c, background: `${c}14`, border: `1px solid ${c}35`, borderRadius: 20, padding: '0.3rem 0.9rem' }}>⬤ Your Active Ship</span>
            </div>
          )}
          {owned && !isActive && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.68rem', color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 20, padding: '0.3rem 0.9rem' }}>✓ Owned</span>
            </div>
          )}
          {isNext && (
            <button
              onClick={onBuy}
              disabled={!canAfford || isPending}
              style={{
                width: '100%', marginTop: 14,
                padding: '0.8rem', borderRadius: 10,
                background: canAfford ? `${c}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${canAfford ? `${c}55` : 'rgba(255,255,255,0.1)'}`,
                color: canAfford ? c : '#4a4845',
                cursor: canAfford ? 'pointer' : 'default',
                opacity: isPending ? 0.5 : 1,
              }}
              className="font-cinzel font-700"
            >
              <span style={{ fontSize: '1.0rem' }}>
                {isPending ? 'Upgrading…' : canAfford ? `Upgrade — ${ship.cost.toLocaleString()} ⟡` : `Need ${(ship.cost - doubloons).toLocaleString()} more ⟡`}
              </span>
            </button>
          )}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1.4rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Ship image */}
          <div style={{
            background: `radial-gradient(ellipse at 50% 60%, ${c}10 0%, rgba(8,8,6,0.6) 70%)`,
            border: `1px solid ${c}25`,
            borderRadius: 16, padding: '1.5rem 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ship.imageUrl} alt={ship.name}
              style={{ width: 180, height: 180, objectFit: 'contain', filter: owned ? `drop-shadow(0 6px 20px ${c}55)` : 'grayscale(1) brightness(0.35)' }}
            />
          </div>

          {/* Primary stats — hold & crew */}
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: 10 }}>Capacity</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Fish Hold', value: ship.holdCapacity, unit: 'fish slots', color: c, icon: '🐟' },
                { label: 'Crew', value: stats?.crewSlots ?? 1, unit: 'card slots', color: c, icon: '⚓' },
              ].map(s => (
                <div key={s.label} style={{ background: `${c}0c`, border: `1px solid ${c}28`, borderRadius: 12, padding: '1rem 0.75rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.3rem', lineHeight: 1, display: 'block', marginBottom: 6 }}>{s.icon}</span>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.62rem', color: '#8a8784', marginTop: 6 }}>{s.label}</p>
                  <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: '#4a4845', marginTop: 2 }}>{s.unit}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Combat stats */}
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: 10 }}>Combat</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'Hull HP',   value: stats?.durability ?? '—', color: '#60a5fa' },
                { label: 'Armor',     value: stats?.armor      ?? '—', color: '#4ade80' },
                { label: 'Speed',     value: stats?.speed      ?? '—', color: '#f0c040' },
                { label: 'Min Dmg',   value: stats?.minDamage  ?? '—', color: '#fb923c' },
              ].map(s => (
                <div key={s.label} style={{ background: `${s.color}08`, border: `1px solid ${s.color}28`, borderRadius: 10, padding: '0.75rem 0.4rem', textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginTop: 6 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#5a5755', marginTop: 12, lineHeight: 1.6 }}>
              <strong style={{ color: '#8a8784', fontWeight: 600 }}>Reload</strong> to stockpile charges (max 3). <strong style={{ color: '#8a8784', fontWeight: 600 }}>Fire</strong> spends 1 charge. <strong style={{ color: '#8a8784', fontWeight: 600 }}>Volley</strong> spends all 3 for double damage. <strong style={{ color: '#8a8784', fontWeight: 600 }}>Speed</strong> determines who fires first.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
