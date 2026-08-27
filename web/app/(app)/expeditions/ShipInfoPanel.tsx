'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type ShipStats } from '@/lib/expeditions'
import { getShip } from '@/lib/ships'
import ShipViewer3D from '@/app/(app)/marketplace/shipyard/ShipViewer3D'

const SHIP_STATS = [
  { key: 'durability' as const, label: 'Durability', icon: '🛡', color: '#60a5fa', max: 80 },
  { key: 'speed'      as const, label: 'Speed',      icon: '⚡', color: '#f0c040', max: 10 },
]

export default function ShipInfoPanel({ ship, shipTier }: { ship: ShipStats; shipTier: number }) {
  const shipDef = getShip(shipTier)
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      marginBottom: '1.25rem',
      overflow: 'hidden',
    }}>
      <ShipViewer3D imageUrl={shipDef?.imageUrl} color={shipDef?.color ?? '#a07858'} height={150} />

      {/* Collapsed header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.875rem 1rem 0.75rem', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#4a4845', marginBottom: 2 }}>
              Your Ship
            </p>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.95rem' }}>
              {ship.name}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Mini stat pips */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {SHIP_STATS.map(s => (
                <div key={s.key} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.65rem', lineHeight: 1, marginBottom: 1 }}>{s.icon}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.65rem', color: s.color }}>{ship[s.key]}</p>
                </div>
              ))}
            </div>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded stat bars */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0.875rem 1rem 0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '0.875rem' }}>
            {SHIP_STATS.map(s => {
              const pct = Math.round((ship[s.key] / s.max) * 100)
              return (
                <div key={s.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#a0a09a' }}>
                      {s.icon} {s.label}
                    </span>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: s.color }}>{ship[s.key]}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, width: `${pct}%`,
                      background: s.color,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845' }}>
              {ship.crewSlots} crew slot{ship.crewSlots !== 1 ? 's' : ''}
            </p>
            <Link
              href="/marketplace/shipyard"
              className="font-karla font-600 uppercase tracking-[0.08em]"
              style={{ fontSize: '0.58rem', color: '#6a6764', textDecoration: 'none' }}
            >
              Upgrade at Shipyard →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
