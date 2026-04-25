'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { STAT_ICONS, STAT_LABELS, STAT_DESCRIPTIONS, type ExpeditionShipStats } from '@/lib/expeditions'
import { SHIPS } from '@/lib/ships'

const ShipViewer3D = dynamic(() => import('@/app/marketplace/shipyard/ShipViewer3D'), { ssr: false })

const STATS = ['combat', 'navigation', 'durability', 'speed', 'luck'] as const

export default function ShipInfoPanel({ ship, shipTier }: { ship: ExpeditionShipStats; shipTier: number }) {
  const shipDef = SHIPS[shipTier]
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        marginBottom: '1.25rem',
        overflow: 'hidden',
      }}
    >
      {/* 3D ship viewer */}
      {shipDef?.modelUrl && (
        <ShipViewer3D modelUrl={shipDef.modelUrl} color={shipDef.color} height={160} />
      )}

      {/* Header row — always visible, click to expand */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.875rem 1rem', textAlign: 'left' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 2 }}>
              Your Ship
            </p>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem' }}>
              {ship.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {STATS.map(stat => (
                <div key={stat} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.7rem', lineHeight: 1 }}>{STAT_ICONS[stat]}</p>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.72rem' }}>{ship[stat]}</p>
                </div>
              ))}
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded: full stat breakdown */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '0.875rem 1rem' }}>
          <div className="flex flex-col gap-3 mb-4">
            {STATS.map(stat => (
              <div key={stat} className="flex items-start gap-3">
                <div style={{ width: 90, flexShrink: 0 }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
                    {STAT_ICONS[stat]} {STAT_LABELS[stat]}
                  </p>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1rem' }}>{ship[stat]}</p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a0a09a', lineHeight: 1.6, paddingTop: 1 }}>
                  {STAT_DESCRIPTIONS[stat]}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
              {ship.crewSlots} crew slots
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
