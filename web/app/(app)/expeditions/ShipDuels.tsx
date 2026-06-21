'use client'

// PvP (ship duels) — opens inside the PvP hub-card modal on the Expeditions
// page. Admin-only for now (released to public but locked as "Coming Soon").
// Auto-lists your crew as quick-challenge targets, keeps active duels
// actionable, and tucks the W/L history behind a collapsible so it never
// grows into a wall of rows.

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { createShipBattle, acceptShipBattle, declineShipBattle, getShipBattles, type ShipBattleSummary } from '@/app/(app)/social/shipBattleActions'
import type { CrewMember } from '@/app/(app)/social/actions'

const ACCENT = '#f0c040'

export default function ShipDuels({ battles: initialBattles, wins: initialWins, losses: initialLosses, friends }: { battles: ShipBattleSummary[]; wins: number; losses: number; friends: CrewMember[] }) {
  const router = useRouter()
  const [battles, setBattles] = useState(initialBattles)
  const [wins, setWins] = useState(initialWins)
  const [losses, setLosses] = useState(initialLosses)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  // Poll so duel state (a challenge accepted, the opponent's move, a result)
  // reflects in near-real-time while you sit on the Expeditions page — no tab
  // switch needed. The app has no websockets; this matches its polling model.
  const refresh = useCallback(async () => {
    const r = await getShipBattles()
    setBattles(r.battles); setWins(r.wins); setLosses(r.losses)
  }, [])
  useEffect(() => {
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

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
      setPickerOpen(false)
      await refresh()
    })
  }
  function act(fn: () => Promise<{ ok: true } | { error: string }>) {
    startTransition(async () => {
      const res = await fn()
      if ('error' in res) { setError(res.error); return }
      await refresh()
    })
  }

  return (
    <div style={{ padding: '0.5rem 0.7rem 0.7rem' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#9a948a' }}>
          Your record
        </p>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#4ade80' }}>{wins}W</span> · <span style={{ color: '#f87171' }}>{losses}L</span>
        </p>
      </div>

      {/* Active / incoming — the actionable stuff stays up top */}
      {(incoming.length + active.length + sent.length) > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {incoming.map(b => (
            <Row key={b.id} accent={b.foeOnline ? '#4ade80' : '#fbbf24'} label={`${b.opponentUsername} challenges you`} sub={b.foeOnline ? 'Online now — accept for a live duel' : undefined}>
              <SmallBtn label="Accept" color="#4ade80" disabled={pending} onClick={() => act(() => acceptShipBattle(b.id))} />
              <SmallBtn label="Decline" color="#9a948a" disabled={pending} onClick={() => act(() => declineShipBattle(b.id))} />
            </Row>
          ))}
          {active.map(b => (
            <Row key={b.id} accent={b.foeOnline ? '#4ade80' : b.myTurn ? '#fbbf24' : '#94a3b8'} label={`${b.opponentUsername} · round ${b.round}`} sub={`${b.foeOnline ? 'Online · ' : ''}${b.myTurn ? 'Your move' : 'Waiting on them'}`}>
              <SmallBtn label={b.myTurn ? 'Play →' : 'View'} color={ACCENT} disabled={pending} onClick={() => router.push(`/social/shipbattle/${b.id}`)} />
            </Row>
          ))}
          {sent.map(b => (
            <Row key={b.id} accent="#6a6764" label={`Challenge sent to ${b.opponentUsername}`} sub="Waiting for them to accept" />
          ))}
        </div>
      )}

      {/* One compact button — the picker (search + scrollable friend list)
          opens in a modal so the section never grows with the friend count. */}
      <motion.button onClick={() => { setError(null); setPickerOpen(true) }} whileTap={{ scale: 0.98 }}
        className="font-karla font-700 uppercase tracking-[0.1em] w-full flex items-center justify-center gap-2"
        style={{ padding: '0.6rem', borderRadius: 11, background: `linear-gradient(180deg, ${ACCENT}24, ${ACCENT}10)`, border: `1px solid ${ACCENT}55`, color: ACCENT, fontSize: '0.68rem', cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Challenge a Captain
      </motion.button>
      {error && !pickerOpen && <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#f87171', marginTop: 6 }}>{error}</p>}

      <AnimatePresence>
        {pickerOpen && (
          <ChallengePicker friends={challengeable} pending={pending} error={error} onPick={challenge} onClose={() => { setPickerOpen(false); setError(null) }} />
        )}
      </AnimatePresence>

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

function ChallengePicker({ friends, pending, error, onPick, onClose }: {
  friends: CrewMember[]; pending: boolean; error: string | null; onPick: (username: string) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = query ? friends.filter(f => f.username.toLowerCase().includes(query)) : friends
  // Let the typed name be challenged directly even if they aren't in your crew.
  const exactInList = friends.some(f => f.username.toLowerCase() === query)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
      <motion.div onClick={e => e.stopPropagation()} initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}
        style={{ width: '100%', maxWidth: 380, background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)', border: `1px solid ${ACCENT}33`, borderRadius: 18, padding: '1rem', boxShadow: '0 18px 60px rgba(0,0,0,0.55)' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f4ecd8', marginBottom: 10 }}>Challenge a Captain</p>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && query && !exactInList) onPick(q.trim()) }}
          placeholder="Search your crew or type a name" spellCheck={false}
          className="font-karla font-600" style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, background: 'rgba(4,7,12,0.7)', border: '1px solid rgba(255,255,255,0.14)', color: '#f0ede8', fontSize: '0.82rem', outline: 'none', marginBottom: 10 }} />

        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Direct "challenge this exact name" option when the typed name isn't a listed friend */}
          {query && !exactInList && (
            <button onClick={() => onPick(q.trim())} disabled={pending} className="flex items-center gap-2"
              style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}44`, borderRadius: 10, padding: '0.5rem 0.6rem', cursor: pending ? 'default' : 'pointer', textAlign: 'left' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: `${ACCENT}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontSize: '0.8rem', flexShrink: 0 }}>@</span>
              <p className="font-cinzel font-700 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: '#f0ede8' }}>Challenge “{q.trim()}”</p>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', color: ACCENT }}>Go →</span>
            </button>
          )}
          {shown.map(f => (
            <button key={f.username} onClick={() => onPick(f.username)} disabled={pending} className="flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.4rem 0.55rem', cursor: pending ? 'default' : 'pointer', textAlign: 'left' }}>
              <CharacterAvatar characterColor={f.characterColor} equippedHat={f.equippedHat} size={28} ringColor={f.avatarBorder ?? undefined} bgColor={f.avatarBg ?? undefined} />
              <p className="font-cinzel font-700 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#f0ede8' }}>{f.username}</p>
              <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, fontSize: '0.56rem', color: ACCENT, background: `${ACCENT}1c`, border: `1px solid ${ACCENT}55`, borderRadius: 8, padding: '0.3rem 0.6rem' }}>Challenge</span>
            </button>
          ))}
          {shown.length === 0 && !query && (
            <p className="font-karla font-400 text-center" style={{ fontSize: '0.72rem', color: '#6a6764', padding: '1rem 0' }}>Follow captains on the Crew page to see them here, or type a name above.</p>
          )}
        </div>
        {error && <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#f87171', marginTop: 8 }}>{error}</p>}
      </motion.div>
    </motion.div>
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
