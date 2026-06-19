'use client'

// Ship Duels — private-testing entry point on the Expeditions page (gated to
// the PVP_TESTERS allowlist server-side + by the section render). Challenge a
// captain by name, accept/decline incoming, and jump into the battle screen.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createShipBattle, acceptShipBattle, declineShipBattle, type ShipBattleSummary } from '@/app/(app)/social/shipBattleActions'

const ACCENT = '#f0c040'

export default function ShipDuels({ battles, wins, losses }: { battles: ShipBattleSummary[]; wins: number; losses: number }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const incoming = battles.filter(b => b.status === 'pending' && !b.isChallenger)
  const sent = battles.filter(b => b.status === 'pending' && b.isChallenger)
  const active = battles.filter(b => b.status === 'active')
  const results = battles.filter(b => b.status === 'complete' || b.status === 'expired').slice(0, 6)

  function challenge() {
    if (!name.trim() || pending) return
    setError(null)
    startTransition(async () => {
      const res = await createShipBattle(name.trim())
      if ('error' in res) { setError(res.error); return }
      setName('')
      router.refresh()
    })
  }
  function act(fn: () => Promise<{ ok: true } | { error: string }>) {
    startTransition(async () => {
      const res = await fn()
      if ('error' in res) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{ background: 'rgba(8,12,18,0.78)', border: `1px solid ${ACCENT}33`, borderRadius: 16, padding: '1rem', marginBottom: '1.2rem' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="M9.5 17.5 21 6V3h-3L6.5 14.5" /><path d="m11 19-6-6" /><path d="m8 16-4 4" />
          </svg>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>Ship Duels</p>
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: ACCENT, background: `${ACCENT}1c`, border: `1px solid ${ACCENT}44`, borderRadius: 999, padding: '0.12rem 0.42rem' }}>Testing</span>
        </div>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#4ade80' }}>{wins}W</span> · <span style={{ color: '#f87171' }}>{losses}L</span>
        </p>
      </div>

      {/* Challenge form */}
      <div className="flex gap-2 mb-1">
        <input value={name} onChange={e => { setName(e.target.value); setError(null) }} onKeyDown={e => e.key === 'Enter' && challenge()}
          placeholder="Challenge a captain by name" spellCheck={false}
          className="font-karla font-600" style={{ flex: 1, minWidth: 0, padding: '0.55rem 0.7rem', borderRadius: 10, background: 'rgba(4,7,12,0.7)', border: '1px solid rgba(255,255,255,0.14)', color: '#f0ede8', fontSize: '0.82rem', outline: 'none' }} />
        <motion.button onClick={challenge} disabled={pending || !name.trim()} whileTap={pending || !name.trim() ? undefined : { scale: 0.96 }}
          className="font-karla font-700 uppercase tracking-[0.08em]" style={{ padding: '0.55rem 0.95rem', borderRadius: 10, background: name.trim() ? `linear-gradient(180deg, ${ACCENT}2c, ${ACCENT}14)` : 'rgba(255,255,255,0.05)', border: `1px solid ${name.trim() ? `${ACCENT}5a` : 'rgba(255,255,255,0.12)'}`, color: name.trim() ? ACCENT : '#6a6764', fontSize: '0.66rem', cursor: pending || !name.trim() ? 'default' : 'pointer' }}>
          {pending ? '…' : 'Challenge'}
        </motion.button>
      </div>
      {error && <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#f87171', marginBottom: 6 }}>{error}</p>}

      {/* Lists */}
      <div className="flex flex-col gap-1.5 mt-2">
        {incoming.map(b => (
          <Row key={b.id} accent="#fbbf24" label={`${b.opponentUsername} challenges you`}>
            <SmallBtn label="Accept" color="#4ade80" disabled={pending} onClick={() => act(() => acceptShipBattle(b.id))} />
            <SmallBtn label="Decline" color="#9a948a" disabled={pending} onClick={() => act(() => declineShipBattle(b.id))} />
          </Row>
        ))}
        {active.map(b => (
          <Row key={b.id} accent={b.myTurn ? '#4ade80' : '#94a3b8'} label={`${b.opponentUsername} · round ${b.round}`} sub={b.myTurn ? 'Your move' : 'Waiting on them'}>
            <SmallBtn label={b.myTurn ? 'Play →' : 'View'} color={ACCENT} disabled={pending} onClick={() => router.push(`/social/shipbattle/${b.id}`)} />
          </Row>
        ))}
        {sent.map(b => (
          <Row key={b.id} accent="#6a6764" label={`Challenge sent to ${b.opponentUsername}`} sub="Waiting for them to accept" />
        ))}
        {results.length > 0 && (
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#7a7774', marginTop: 6 }}>Recent</p>
        )}
        {results.map(b => (
          <Row key={b.id} accent={b.iWon == null ? '#6a6764' : b.iWon ? '#4ade80' : '#f87171'}
            label={b.opponentUsername}
            sub={b.status === 'expired' ? 'Voided' : b.iWon ? 'Victory' : 'Defeat'} />
        ))}
        {incoming.length + active.length + sent.length + results.length === 0 && (
          <p className="font-karla font-400 text-center" style={{ fontSize: '0.72rem', color: '#6a6764', padding: '0.5rem 0' }}>No duels yet. Call someone out.</p>
        )}
      </div>
    </div>
  )
}

function Row({ accent, label, sub, children }: { accent: string; label: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}30`, borderRadius: 10, padding: '0.5rem 0.65rem' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>{label}</p>
        {sub && <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#8a8784' }}>{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function SmallBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={disabled ? undefined : onClick} disabled={disabled} whileTap={disabled ? undefined : { scale: 0.95 }}
      className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, padding: '0.36rem 0.7rem', borderRadius: 8, background: `${color}1c`, border: `1px solid ${color}55`, color, fontSize: '0.56rem', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      {label}
    </motion.button>
  )
}
