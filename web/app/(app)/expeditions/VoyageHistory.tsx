'use client'

import { useState } from 'react'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'

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

function VoyageRow({ v }: { v: VoyageHistoryEntry }) {
  const rc = ROUTE_CONFIGS[v.route as VoyageRoute]
  const [open, setOpen] = useState(false)
  const hasLog = !!v.captains_log

  return (
    <div style={{
      background: 'rgba(12,10,6,0.55)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div
        onClick={hasLog ? () => setOpen(o => !o) : undefined}
        style={{
          width: '100%',
          padding: '0.55rem 0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          cursor: hasLog ? 'pointer' : 'default',
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: rc?.color ?? '#7a6848' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#c8b890', lineHeight: 1.2 }}>
            {rc?.name ?? v.route}
          </p>
          <p className="font-karla" style={{ fontSize: '0.64rem', color: '#6a5a40', marginTop: 1 }}>
            {formatDate(v.created_at)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexShrink: 0 }}>
          {v.total_doubloons > 0 && (
            <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#c8a840' }}>+{v.total_doubloons} ⟡</span>
          )}
          {v.total_gems > 0 && (
            <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#a78bfa' }}>+{v.total_gems} ◆</span>
          )}
          {v.crew_lost.length > 0 && (
            <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#f87171', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.20)', borderRadius: 4, padding: '0.1rem 0.3rem' }}>
              -{v.crew_lost.length} crew
            </span>
          )}
          {hasLog && (
            <span style={{ fontSize: '0.55rem', color: '#4a3f28', marginLeft: 2, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▼</span>
          )}
        </div>
      </div>

      {open && v.captains_log && (
        <div style={{ padding: '0 0.75rem 0.65rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="font-karla" style={{ fontSize: '0.7rem', color: '#8a7a5a', lineHeight: 1.6, fontStyle: 'italic', paddingTop: '0.5rem' }}>
            {v.captains_log}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Compact past-voyages section. Renders as a single clickable text line
 * ("Past voyages · N ▼") that expands inline to show the voyage rows.
 * Intended to live inside the current voyage panel, not as a separate
 * banner section beneath it.
 */
export default function VoyageHistory({ voyages }: Props) {
  const [open, setOpen] = useState(false)

  if (voyages.length === 0) return null

  return (
    <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}
      >
        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#9a8868' }}>
          Past voyages · {voyages.length}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#5a4a30', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem' }}>
          {voyages.map(v => <VoyageRow key={v.id} v={v} />)}
        </div>
      )}
    </div>
  )
}
