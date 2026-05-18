'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RaidNodeView } from '@/lib/raidMap'
import { claimMilestoneNode } from './raidMapActions'

const TYPE_ACCENT: Record<string, string> = {
  combat: '#f97316',
  milestone: '#c4a96a',
  shop: '#a78bfa',
}

function NodeIcon({ type, color }: { type: string; color: string }) {
  if (type === 'combat') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6M14.5 6.5L21 13M6 21l-3-3M9 3l12 12-3 3L6 6z" />
      </svg>
    )
  }
  if (type === 'shop') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l1.5-5h15L21 9M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 13h6" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 6.9H22l-6 4.5 2.3 7L12 16.9 5.7 20.4 8 13.4 2 8.9h7.6z" />
    </svg>
  )
}

function NodeCard({ view, doubloons }: { view: RaidNodeView; doubloons: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const { node, status, claimable, lockReason } = view
  const accent = TYPE_ACCENT[node.type] ?? '#c4a96a'
  const locked = status === 'locked'
  const cleared = status === 'cleared'

  const canEnterCombat = node.type === 'combat' && !locked && !!node.route
  const onClick = () => {
    if (canEnterCombat) router.push(node.route!)
  }

  function claim() {
    setErr(null)
    startTransition(async () => {
      const res = await claimMilestoneNode(node.id)
      if ('error' in res) { setErr(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      router.refresh()
    })
  }

  return (
    <div
      role={canEnterCombat ? 'button' : undefined}
      tabIndex={canEnterCombat ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (canEnterCombat && e.key === 'Enter') onClick() }}
      style={{
        position: 'relative',
        background: 'linear-gradient(135deg, rgba(14,12,10,0.92) 0%, rgba(8,7,6,0.92) 100%)',
        border: `1px solid ${cleared ? `${accent}55` : locked ? 'rgba(255,255,255,0.06)' : `${accent}33`}`,
        borderRadius: 14,
        padding: '0.9rem 1rem',
        opacity: locked ? 0.55 : 1,
        cursor: canEnterCombat ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}1a`, border: `1px solid ${accent}3a`,
        }}>
          {locked
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a5856" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            : <NodeIcon type={node.type} color={accent} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: locked ? 'rgba(240,237,232,0.6)' : '#f0ede8' }}>
              {node.label}
            </p>
            {cleared && (
              <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#4ade80', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 5, padding: '0.18rem 0.4rem', flexShrink: 0 }}>
                {node.type === 'combat' ? 'Cleared' : 'Done'}
              </span>
            )}
          </div>
          <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.45)', lineHeight: 1.45, marginTop: 3 }}>
            {node.flavor}
          </p>

          {/* Action / state row */}
          <div style={{ marginTop: 10 }}>
            {locked ? (
              <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5856' }}>
                🔒 {lockReason}
              </p>
            ) : node.type === 'combat' ? (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: accent, background: `${accent}1f`, border: `1px solid ${accent}40`, borderRadius: 6, padding: '0.25rem 0.6rem' }}>
                {cleared ? 'Farm →' : 'Enter →'}
              </span>
            ) : node.type === 'shop' ? (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#7a7875', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '0.25rem 0.6rem' }}>
                Coming soon
              </span>
            ) : node.milestone ? (
              claimable ? (
                <button
                  onClick={e => { e.stopPropagation(); claim() }}
                  disabled={pending}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                  style={{ fontSize: '0.6rem', color: '#1a0f02', background: accent, border: 'none', borderRadius: 8, padding: '0.4rem 0.9rem', cursor: pending ? 'wait' : 'pointer' }}
                >
                  {pending ? '…' : `Claim${node.milestone.rewardDoubloons ? ` · +${node.milestone.rewardDoubloons} ⟡` : ''}`}
                </button>
              ) : (
                <div>
                  <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8a8880' }}>
                    {Math.min(doubloons, node.milestone.amount).toLocaleString()} / {node.milestone.amount.toLocaleString()} ⟡
                  </p>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ height: '100%', width: `${Math.min(1, doubloons / node.milestone.amount) * 100}%`, background: accent, borderRadius: 2 }} />
                  </div>
                </div>
              )
            ) : null}
            {err && <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#f08a8a', marginTop: 6 }}>{err}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RaidsSection({ views, doubloons }: { views: RaidNodeView[]; doubloons: number }) {
  const [open, setOpen] = useState(true)
  const clearedCount = views.filter(v => v.status === 'cleared').length

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          marginBottom: open ? '0.7rem' : 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', letterSpacing: '0.04em' }}>Raids</span>
          <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764' }}>{clearedCount}/{views.length} cleared</span>
        </span>
        <span style={{ color: '#6a6764', fontSize: '0.9rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {views.map((v, i) => (
            <div key={v.node.id}>
              <NodeCard view={v} doubloons={doubloons} />
              {i < views.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                  <div style={{
                    width: 2, height: 18, borderRadius: 1,
                    background: v.status === 'cleared' ? 'rgba(196,169,106,0.6)' : 'rgba(255,255,255,0.1)',
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
