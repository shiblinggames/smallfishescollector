'use client'

// Broadsides — private-testing ship PvP entry point on the Expeditions page
// (gated to PVP_TESTERS server-side + by the section render). Auto-lists your
// crew as quick-challenge targets, keeps active duels actionable, and tucks the
// W/L history behind a collapsible so it never grows into a wall of rows.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { createShipBattle, acceptShipBattle, declineShipBattle, type ShipBattleSummary } from '@/app/(app)/social/shipBattleActions'
import type { CrewMember } from '@/app/(app)/social/actions'

const ACCENT = '#f0c040'

export default function ShipDuels({ battles, wins, losses, friends }: { battles: ShipBattleSummary[]; wins: number; losses: number; friends: CrewMember[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [pending, startTransition] = useTransition()

  const incoming = battles.filter(b => b.status === 'pending' && !b.isChallenger)
  const sent = battles.filter(b => b.status === 'pending' && b.isChallenger)
  const active = battles.filter(b => b.status === 'active')
  const results = battles.filter(b => b.status === 'complete' || b.status === 'expired')
  const engaged = new Set([...incoming, ...sent, ...active].map(b => b.opponentUsername.toLowerCase()))
  const challengeable = friends.filter(f => !engaged.has(f.username.toLowerCase()))

  function challenge(username: string) {
    if (!username.trim() || pending) return
    setError(null)
    startTransition(async () => {
      const res = await createShipBattle(username.trim())
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
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>Broadsides</p>
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: ACCENT, background: `${ACCENT}1c`, border: `1px solid ${ACCENT}44`, borderRadius: 999, padding: '0.12rem 0.42rem' }}>Testing</span>
        </div>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#4ade80' }}>{wins}W</span> · <span style={{ color: '#f87171' }}>{losses}L</span>
        </p>
      </div>

      {/* Active / incoming — the actionable stuff stays up top */}
      {(incoming.length + active.length + sent.length) > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
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
        </div>
      )}

      {/* Challenge a friend */}
      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#7a7774', marginBottom: 6 }}>Challenge a captain</p>
      {challengeable.length > 0 ? (
        <div className="flex flex-col gap-1.5 mb-2">
          {challengeable.slice(0, 6).map(f => (
            <div key={f.username} className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.4rem 0.55rem' }}>
              <CharacterAvatar characterColor={f.characterColor} equippedHat={f.equippedHat} size={26} ringColor={f.avatarBorder ?? undefined} bgColor={f.avatarBg ?? undefined} />
              <p className="font-cinzel font-700 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: '#f0ede8' }}>{f.username}</p>
              <SmallBtn label="Challenge" color={ACCENT} disabled={pending} onClick={() => challenge(f.username)} />
            </div>
          ))}
        </div>
      ) : (
        <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#6a6764', marginBottom: 6 }}>Follow captains on the Crew page to quick-challenge them, or call one out by name.</p>
      )}

      {/* Search by name */}
      <div className="flex gap-2">
        <input value={name} onChange={e => { setName(e.target.value); setError(null) }} onKeyDown={e => e.key === 'Enter' && challenge(name)}
          placeholder="…or challenge by name" spellCheck={false}
          className="font-karla font-600" style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(4,7,12,0.7)', border: '1px solid rgba(255,255,255,0.14)', color: '#f0ede8', fontSize: '0.78rem', outline: 'none' }} />
        <motion.button onClick={() => challenge(name)} disabled={pending || !name.trim()} whileTap={pending || !name.trim() ? undefined : { scale: 0.96 }}
          className="font-karla font-700 uppercase tracking-[0.08em]" style={{ padding: '0.5rem 0.9rem', borderRadius: 10, background: name.trim() ? `linear-gradient(180deg, ${ACCENT}2c, ${ACCENT}14)` : 'rgba(255,255,255,0.05)', border: `1px solid ${name.trim() ? `${ACCENT}5a` : 'rgba(255,255,255,0.12)'}`, color: name.trim() ? ACCENT : '#6a6764', fontSize: '0.62rem', cursor: pending || !name.trim() ? 'default' : 'pointer' }}>
          {pending ? '…' : 'Go'}
        </motion.button>
      </div>
      {error && <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#f87171', marginTop: 6 }}>{error}</p>}

      {/* Record & history — collapsible, so it never grows into a wall of rows */}
      {results.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
          <button onClick={() => setShowHistory(v => !v)} className="font-karla font-700 uppercase tracking-[0.1em] flex items-center gap-1.5"
            style={{ fontSize: '0.56rem', color: '#9a948a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            History · {results.length}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9a948a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <AnimatePresence>
            {showHistory && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div className="flex flex-col gap-1.5 mt-2">
                  {results.slice(0, 20).map(b => (
                    <Row key={b.id} accent={b.iWon == null ? '#6a6764' : b.iWon ? '#4ade80' : '#f87171'} label={b.opponentUsername} sub={b.status === 'expired' ? 'Voided' : b.iWon ? 'Victory' : 'Defeat'} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
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
