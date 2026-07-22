'use client'

// A single compact, scalable board selector for the leaderboards. Replaces the
// stacked section-tabs + board-pills chrome with one dropdown: the trigger shows
// the current board (accent + label + your rank); the menu lists every board
// grouped by category, so it scales to any number of boards without crowding.

import { useState, useRef, useEffect } from 'react'
import { BOARD_META, type BoardKey } from './boardUI'

const PODIUM: Record<number, string> = { 1: '#f0c040', 2: '#c0c8d4', 3: '#c47a3a' }
function podiumOf(rank: number | null): string | null {
  return rank != null && rank <= 3 ? PODIUM[rank] : null
}

export default function BoardPicker({
  groups, active, onSelect, rankOf,
}: {
  groups: { label: string; boards: BoardKey[] }[]
  active: BoardKey
  onSelect: (k: BoardKey) => void
  /** Optional — surfaces "Rank N" beside each board so you can scan where you sit. */
  rankOf?: (k: BoardKey) => number | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const meta = BOARD_META[active]
  const activeRank = rankOf?.(active) ?? null
  const activePodium = podiumOf(activeRank)

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: '1.25rem' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '0.7rem 0.85rem 0.7rem 0.95rem', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
          background: `linear-gradient(180deg, ${meta.accent}1a 0%, rgba(6,6,4,0.7) 100%)`,
          border: `1px solid ${meta.accent}55`, borderTop: `1px solid ${meta.accent}85`,
          boxShadow: `0 0 14px ${meta.accent}1f`,
        }}
      >
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: meta.accent, borderRadius: '12px 0 0 12px' }} />
        <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>🏆</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)' }}>Leaderboard</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f2efe8', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.label}</p>
        </div>
        {activeRank != null && (
          <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: activePodium ?? '#9a9488', flexShrink: 0 }}>Rank {activeRank}</span>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {/* Menu */}
      {open && (
        <div role="listbox" style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 30,
          maxHeight: 360, overflowY: 'auto', overscrollBehavior: 'contain',
          borderRadius: 14, padding: '0.4rem', background: 'linear-gradient(180deg, #0c1420 0%, #070c14 100%)',
          border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 46px rgba(0,0,0,0.6)',
        }}>
          {groups.map(g => (
            <div key={g.label} style={{ marginBottom: 4 }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.18em', color: 'rgba(196,169,106,0.85)', padding: '0.4rem 0.5rem 0.28rem' }}>{g.label}</p>
              {g.boards.map(k => {
                const b = BOARD_META[k]
                const isActive = k === active
                const r = rankOf?.(k) ?? null
                const pc = podiumOf(r)
                return (
                  <button
                    key={k}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => { onSelect(k); setOpen(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '0.5rem 0.55rem', borderRadius: 9,
                      background: isActive ? `${b.accent}1e` : 'transparent', border: `1px solid ${isActive ? `${b.accent}70` : 'transparent'}`,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: b.accent, flexShrink: 0, boxShadow: `0 0 6px ${b.accent}80` }} />
                    <span className="font-karla font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: isActive ? '#f2efe8' : '#c9c4bc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: pc ?? (r == null ? '#5a5856' : '#9a9488'), flexShrink: 0 }}>{r == null ? '—' : `#${r}`}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
