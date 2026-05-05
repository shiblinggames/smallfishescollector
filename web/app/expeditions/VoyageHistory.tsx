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

function VoyageRow({ v, defaultOpen }: { v: VoyageHistoryEntry; defaultOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const rc = ROUTE_CONFIGS[v.route as VoyageRoute]
  const hasLog = !!v.captains_log

  return (
    <div style={{
      background: 'rgba(12,10,6,0.55)',
      border: `1px solid ${isOpen ? 'rgba(160,140,90,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      <button
        onClick={() => hasLog && setIsOpen(o => !o)}
        disabled={!hasLog}
        style={{
          width: '100%', background: 'none', border: 'none',
          padding: '0.55rem 0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          cursor: hasLog ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: rc?.color ?? '#7a6848' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#c8b890', lineHeight: 1.2 }}>
            {rc?.name ?? v.route}
          </p>
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a5a40', marginTop: 1 }}>
            {formatDate(v.created_at)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexShrink: 0 }}>
          {v.total_doubloons > 0 && (
            <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#c8a840' }}>+{v.total_doubloons} ⟡</span>
          )}
          {v.total_gems > 0 && (
            <span className="font-karla font-700" style={{ fontSize: '0.75rem', color: '#a78bfa' }}>+{v.total_gems}💎</span>
          )}
          {v.crew_lost.length > 0 && (
            <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#f87171', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.20)', borderRadius: 4, padding: '0.1rem 0.3rem' }}>
              -{v.crew_lost.length} crew
            </span>
          )}
        </div>

        {hasLog && (
          <span style={{ fontSize: '0.6rem', color: '#5a4a30', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
        )}
      </button>

      {isOpen && hasLog && (
        <div style={{ borderTop: '1px solid rgba(160,140,90,0.12)', padding: '0.75rem 0.875rem', background: 'rgba(8,6,2,0.40)' }}>
          <p className="font-karla" style={{ fontSize: '0.82rem', color: '#b8a878', lineHeight: 1.8, fontStyle: 'italic' }}>
            &ldquo;{v.captains_log}&rdquo;
          </p>
        </div>
      )}
    </div>
  )
}

export default function VoyageHistory({ voyages }: Props) {
  const [olderOpen, setOlderOpen] = useState(false)

  if (voyages.length === 0) return null

  const [latest, ...older] = voyages

  return (
    <div style={{ marginTop: '0.85rem' }}>
      <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.68rem', color: '#7a6848', marginBottom: '0.6rem' }}>
        Recent Voyages
      </p>

      {/* Most recent — log open by default */}
      <VoyageRow v={latest} defaultOpen={true} />

      {/* Older entries — behind a toggle */}
      {older.length > 0 && (
        <div style={{ marginTop: '0.35rem' }}>
          <button
            onClick={() => setOlderOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', padding: '0.35rem 0', cursor: 'pointer' }}
          >
            <span className="font-karla" style={{ fontSize: '0.68rem', color: '#5a4a30' }}>
              {olderOpen ? 'Hide' : `Show ${older.length} older`}
            </span>
            <span style={{ fontSize: '0.58rem', color: '#5a4a30', transform: olderOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
          </button>

          {olderOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {older.map(v => <VoyageRow key={v.id} v={v} defaultOpen={false} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
