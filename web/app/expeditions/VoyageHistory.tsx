'use client'

import { useState } from 'react'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageEvents'

export interface VoyageHistoryEntry {
  id: number
  route: string
  total_doubloons: number
  total_gems: number
  crew_lost: number[]
  created_at: string
  captains_log: string | null
}

interface Props {
  voyages: VoyageHistoryEntry[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function VoyageHistory({ voyages }: Props) {
  const [listOpen, setListOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  if (voyages.length === 0) return null

  return (
    <div style={{ marginTop: '0.85rem' }}>
      {/* Section header — toggles the whole list */}
      <button
        onClick={() => setListOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          marginBottom: listOpen ? '0.5rem' : 0,
        }}
      >
        <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#7a6848' }}>
          Recent Voyages
        </p>
        <span style={{ fontSize: '0.44rem', color: '#5a4a30', transform: listOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          ▼
        </span>
        <span className="font-karla" style={{ fontSize: '0.48rem', color: '#4a3a28' }}>
          ({voyages.length})
        </span>
      </button>

      {listOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {voyages.map(v => {
            const rc = ROUTE_CONFIGS[v.route as VoyageRoute]
            const isOpen = expanded === v.id
            const hasLog = !!v.captains_log

            return (
              <div
                key={v.id}
                style={{
                  background: 'rgba(12,10,6,0.55)',
                  border: `1px solid ${isOpen ? 'rgba(160,140,90,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : v.id)}
                  disabled={!hasLog}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    padding: '0.55rem 0.75rem',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    cursor: hasLog ? 'pointer' : 'default',
                    textAlign: 'left',
                  }}
                >
                  {/* Route color pip */}
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: rc?.color ?? '#7a6848',
                  }} />

                  {/* Route + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#c8b890', lineHeight: 1.2 }}>
                      {rc?.name ?? v.route}
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.52rem', color: '#6a5a40', marginTop: 1 }}>
                      {formatDate(v.created_at)}
                    </p>
                  </div>

                  {/* Loot */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexShrink: 0 }}>
                    {v.total_doubloons > 0 && (
                      <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#c8a840' }}>
                        +{v.total_doubloons} ⟡
                      </span>
                    )}
                    {v.total_gems > 0 && (
                      <span className="font-karla font-700" style={{ fontSize: '0.60rem', color: '#a78bfa' }}>
                        +{v.total_gems}💎
                      </span>
                    )}
                    {v.crew_lost.length > 0 && (
                      <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: '#f87171', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.20)', borderRadius: 4, padding: '0.1rem 0.3rem' }}>
                        -{v.crew_lost.length} crew
                      </span>
                    )}
                  </div>

                  {/* Expand chevron */}
                  {hasLog && (
                    <span style={{ fontSize: '0.5rem', color: '#5a4a30', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                      ▼
                    </span>
                  )}
                </button>

                {/* Log body */}
                {isOpen && hasLog && (
                  <div style={{
                    borderTop: '1px solid rgba(160,140,90,0.12)',
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(8,6,2,0.40)',
                  }}>
                    <p className="font-karla" style={{ fontSize: '0.62rem', color: '#b8a878', lineHeight: 1.75, fontStyle: 'italic' }}>
                      &ldquo;{v.captains_log}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
