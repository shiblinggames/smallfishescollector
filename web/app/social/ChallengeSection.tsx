'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createChallenge, acceptChallenge, declineChallenge, startSession,
  type PendingChallenge, type ChallengeType,
} from './challengeActions'

const DURATIONS = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
]

const TYPES: { key: ChallengeType; label: string; desc: string }[] = [
  { key: 'most_fish',     label: 'Most Fish',     desc: 'Catch the most fish' },
  { key: 'most_doubloons', label: 'Most Doubloons', desc: 'Earn the most ⟡ from fish value' },
  { key: 'most_perfects', label: 'Most Perfects',  desc: 'Land the most perfect catches' },
]

const WAGERS = [0, 50, 100, 500]

function typeLabel(t: ChallengeType) {
  if (t === 'most_fish') return 'most fish'
  if (t === 'most_doubloons') return 'most ⟡'
  return 'most perfects'
}

function durationLabel(s: number) {
  if (s < 60) return `${s}s`
  return `${s / 60}m`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface CreateModalProps {
  targetUsername: string
  myDoubloons: number
  onClose: () => void
  onCreated: () => void
}

function CreateChallengeModal({ targetUsername, myDoubloons, onClose, onCreated }: CreateModalProps) {
  const [duration, setDuration] = useState(300)
  const [type, setType] = useState<ChallengeType>('most_fish')
  const [wager, setWager] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)

  function submit() {
    setLoading(true)
    setError('')
    startTransition(async () => {
      const result = await createChallenge(targetUsername, duration, type, wager, message)
      if ('error' in result) {
        setError(result.error)
        setLoading(false)
      } else {
        onCreated()
      }
    })
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0f0d0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px 18px 0 0', padding: '1.5rem', width: '100%', maxWidth: 480, paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.95rem' }}>
            Challenge {targetUsername}
          </p>
          <button onClick={onClose} style={{ color: '#4a4845', lineHeight: 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Duration */}
        <p className="font-karla font-600 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Duration</p>
        <div className="flex gap-2 mb-4">
          {DURATIONS.map(d => (
            <button
              key={d.seconds}
              onClick={() => setDuration(d.seconds)}
              className="flex-1 font-karla font-700"
              style={{
                padding: '0.5rem', borderRadius: 8, fontSize: '0.72rem',
                background: duration === d.seconds ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${duration === d.seconds ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: duration === d.seconds ? '#f0c040' : '#6a6764',
                cursor: 'pointer',
              }}
            >{d.label}</button>
          ))}
        </div>

        {/* Type */}
        <p className="font-karla font-600 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Challenge Type</p>
        <div className="flex flex-col gap-2 mb-4">
          {TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className="flex items-center gap-3 text-left"
              style={{
                padding: '0.6rem 0.75rem', borderRadius: 8,
                background: type === t.key ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${type === t.key ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.07)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: type === t.key ? '#f0c040' : '#3a3835', flexShrink: 0 }} />
              <div>
                <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: type === t.key ? '#f0c040' : '#a0a09a' }}>{t.label}</p>
                <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#4a4845' }}>{t.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Wager */}
        <p className="font-karla font-600 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Wager (optional)</p>
        <div className="flex gap-2 mb-4">
          {WAGERS.map(w => (
            <button
              key={w}
              onClick={() => setWager(w)}
              className="flex-1 font-karla font-700"
              disabled={w > myDoubloons}
              style={{
                padding: '0.5rem', borderRadius: 8, fontSize: '0.68rem',
                background: wager === w ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${wager === w ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: wager === w ? '#f0c040' : w > myDoubloons ? '#3a3835' : '#6a6764',
                cursor: w > myDoubloons ? 'not-allowed' : 'pointer',
              }}
            >{w === 0 ? 'None' : `${w} ⟡`}</button>
          ))}
        </div>

        {/* Message */}
        <p className="font-karla font-600 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Message (optional)</p>
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Trash talk or friendly nudge…"
          maxLength={100}
          className="sg-input font-karla w-full mb-4"
          style={{ fontSize: '0.82rem' }}
        />

        {error && <p className="font-karla mb-3" style={{ fontSize: '0.7rem', color: '#f87171' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{
            padding: '0.75rem', borderRadius: 10, fontSize: '0.7rem',
            background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.4)',
            color: '#f0c040', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Sending…' : 'Send Challenge'}
        </button>
      </div>
    </div>
  )
}

interface Props {
  challenges: PendingChallenge[]
  wlRecord: { wins: number; losses: number; ties: number }
  myDoubloons: number
  myBait: number
}

function BaitWarning({ myBait }: { myBait: number }) {
  if (myBait >= 10) return null
  const color = myBait === 0 ? '#f87171' : '#fb923c'
  const label = myBait === 0 ? 'No bait' : `${myBait} bait (low)`
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.35rem 0.65rem', borderRadius: 8, marginBottom: 8,
      background: myBait === 0 ? 'rgba(248,113,113,0.08)' : 'rgba(251,146,60,0.08)',
      border: `1px solid ${color}30`,
    }}>
      <span className="font-karla font-600" style={{ fontSize: '0.58rem', color }}>{label}</span>
      <a href="/marketplace/tackle-shop#bait" className="font-karla font-700"
        style={{ fontSize: '0.58rem', color, textDecoration: 'none', opacity: 0.85 }}>
        Buy more →
      </a>
    </div>
  )
}

export default function ChallengeSection({ challenges, wlRecord, myDoubloons, myBait }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const incoming = challenges.filter(c => c.isIncoming && (c.status === 'pending' || c.status === 'challenger_done'))
  const outgoing = challenges.filter(c => !c.isIncoming && c.status === 'pending')
  const myTurn = challenges.filter(c => c.isIncoming && c.status === 'challenger_done')
  const active = challenges.filter(c =>
    c.status === 'both_active' ||
    (c.isIncoming && c.status === 'challenged_active') ||
    (!c.isIncoming && c.status === 'challenger_active')
  )
  const readyToStart = challenges.filter(c => c.isIncoming && (c.status === 'challenger_done' || c.status === 'challenger_active'))
  const complete = challenges.filter(c => c.status === 'complete')

  const pendingCount = incoming.filter(c => c.status === 'pending').length + myTurn.length

  function handleAccept(id: string) {
    setLoadingId(id)
    startTransition(async () => {
      await acceptChallenge(id)
      router.refresh()
      setLoadingId(null)
    })
  }

  function handleDecline(id: string) {
    setLoadingId(id)
    startTransition(async () => {
      await declineChallenge(id)
      router.refresh()
      setLoadingId(null)
    })
  }

  function handleStart(id: string) {
    setLoadingId(id)
    startTransition(async () => {
      await startSession(id)
      router.push('/fishing')
    })
  }

  const totalGames = wlRecord.wins + wlRecord.losses + wlRecord.ties

  return (
    <div className="flex flex-col gap-6">

      {/* W-L record */}
      {totalGames > 0 && (
        <div style={{ background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '1rem' }}>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Challenge Record</p>
          <div className="flex gap-6">
            <div>
              <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#4ade80', lineHeight: 1 }}>{wlRecord.wins}</p>
              <p className="font-karla font-400" style={{ fontSize: '0.55rem', color: '#4a4845', marginTop: 2 }}>Wins</p>
            </div>
            <div>
              <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f87171', lineHeight: 1 }}>{wlRecord.losses}</p>
              <p className="font-karla font-400" style={{ fontSize: '0.55rem', color: '#4a4845', marginTop: 2 }}>Losses</p>
            </div>
            {wlRecord.ties > 0 && (
              <div>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#6a6764', lineHeight: 1 }}>{wlRecord.ties}</p>
                <p className="font-karla font-400" style={{ fontSize: '0.55rem', color: '#4a4845', marginTop: 2 }}>Ties</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Incoming challenges needing response */}
      {incoming.filter(c => c.status === 'pending').length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.52rem', color: '#9a9488' }}>
            Incoming Challenges · {incoming.filter(c => c.status === 'pending').length}
          </p>
          <div style={{ background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
            {incoming.filter(c => c.status === 'pending').map((c, i, arr) => (
              <div key={c.id} style={{ padding: '0.9rem 1rem', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div>
                    <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>
                      {c.challengerUsername}
                    </p>
                    <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764', marginTop: 2 }}>
                      {durationLabel(c.durationSeconds)} · {typeLabel(c.challengeType)}{c.wager > 0 ? ` · ${c.wager} ⟡ wager` : ''}
                    </p>
                    {c.message && (
                      <p className="font-karla font-400 italic mt-1" style={{ fontSize: '0.65rem', color: '#8a8070' }}>
                        "{c.message}"
                      </p>
                    )}
                  </div>
                  <p className="font-karla font-300 shrink-0" style={{ fontSize: '0.55rem', color: '#3a3835', marginTop: 2 }}>
                    {timeAgo(c.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleAccept(c.id)}
                    disabled={loadingId === c.id}
                    className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{ flex: 1, padding: '0.45rem', borderRadius: 8, fontSize: '0.6rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80', cursor: 'pointer', opacity: loadingId === c.id ? 0.5 : 1 }}
                  >
                    {loadingId === c.id ? '…' : 'Accept'}
                  </button>
                  <button
                    onClick={() => handleDecline(c.id)}
                    disabled={loadingId === c.id}
                    className="font-karla font-600"
                    style={{ padding: '0.45rem 0.75rem', borderRadius: 8, fontSize: '0.6rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#4a4845', cursor: 'pointer' }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready to fish — challenger done, your turn */}
      {readyToStart.length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.52rem', color: '#fb923c' }}>
            Your Turn
          </p>
          <div style={{ background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 14, overflow: 'hidden' }}>
            {readyToStart.map((c, i, arr) => (
              <div key={c.id} style={{ padding: '0.9rem 1rem', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <p className="font-karla font-700 mb-0.5" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>
                  vs {c.challengerUsername}
                </p>
                <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764' }}>
                  {durationLabel(c.durationSeconds)} · {typeLabel(c.challengeType)}{c.wager > 0 ? ` · ${c.wager} ⟡` : ''}
                </p>
                {c.status === 'challenger_active' && (
                  <p className="font-karla font-600 mb-3" style={{ fontSize: '0.6rem', color: '#fb923c', marginTop: 4 }}>
                    🎣 Challenger is fishing now — start simultaneously
                  </p>
                )}
                {c.status === 'challenger_done' && (
                  <p className="font-karla font-600 mb-3" style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 4 }}>
                    Challenger finished — now it&apos;s your turn
                  </p>
                )}
                <BaitWarning myBait={myBait} />
                <button
                  onClick={() => handleStart(c.id)}
                  disabled={loadingId === c.id}
                  className="font-karla font-700 uppercase tracking-[0.1em] w-full"
                  style={{ padding: '0.5rem', borderRadius: 8, fontSize: '0.62rem', background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.4)', color: '#fb923c', cursor: 'pointer', opacity: loadingId === c.id ? 0.5 : 1 }}
                >
                  {loadingId === c.id ? '…' : 'Start Your Session →'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In Progress — active session running */}
      {active.length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.52rem', color: '#fb923c' }}>
            In Progress
          </p>
          <div style={{ background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 14, overflow: 'hidden' }}>
            {active.map((c, i, arr) => {
              const opponentName = c.isIncoming ? c.challengerUsername : c.challengedUsername
              return (
                <div key={c.id} style={{ padding: '0.9rem 1rem', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c', flexShrink: 0, animation: 'pulse 2s infinite' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>vs {opponentName}</p>
                    <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: 2 }}>
                      {durationLabel(c.durationSeconds)} · {typeLabel(c.challengeType)}{c.wager > 0 ? ` · ${c.wager} ⟡` : ''} · session underway
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Outgoing — waiting for opponent */}
      {outgoing.length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
            Waiting on Response
          </p>
          <div style={{ background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
            {outgoing.map((c, i, arr) => (
              <div key={c.id} style={{ padding: '0.9rem 1rem', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#a0a09a' }}>{c.challengedUsername}</p>
                  <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#4a4845', marginTop: 2 }}>
                    {durationLabel(c.durationSeconds)} · {typeLabel(c.challengeType)}
                  </p>
                </div>
                <p className="font-karla font-300 shrink-0" style={{ fontSize: '0.55rem', color: '#3a3835' }}>{timeAgo(c.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start your own session (challenger who hasn't gone yet) */}
      {challenges.filter(c => !c.isIncoming && (c.status === 'pending' || c.status === 'accepted') && !c.challengerFinishedAt).map(c => (
        <div key={`start-${c.id}`} style={{ background: 'rgba(4,10,20,0.6)', border: `1px solid ${c.status === 'accepted' ? 'rgba(74,222,128,0.25)' : 'rgba(240,192,64,0.2)'}`, borderRadius: 14, padding: '1rem' }}>
          <p className="font-karla font-700 mb-0.5" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>
            Challenge sent to {c.challengedUsername}
            {c.status === 'accepted' && (
              <span className="font-karla font-600 ml-2" style={{ fontSize: '0.58rem', color: '#4ade80', verticalAlign: 'middle' }}>Accepted!</span>
            )}
          </p>
          <p className="font-karla font-400 mb-3" style={{ fontSize: '0.65rem', color: '#6a6764' }}>
            {durationLabel(c.durationSeconds)} · {typeLabel(c.challengeType)} — start your session whenever you&apos;re ready
          </p>
          <BaitWarning myBait={myBait} />
          <button
            onClick={() => handleStart(c.id)}
            disabled={loadingId === c.id}
            className="font-karla font-700 uppercase tracking-[0.1em] w-full"
            style={{ padding: '0.5rem', borderRadius: 8, fontSize: '0.62rem', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.35)', color: '#f0c040', cursor: 'pointer', opacity: loadingId === c.id ? 0.5 : 1 }}
          >
            {loadingId === c.id ? '…' : 'Start Your Session →'}
          </button>
        </div>
      ))}

      {/* Completed */}
      {complete.length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Recent Results</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {complete.slice(0, 5).map((c) => {
              const won = c.winnerId === c.myId
              const tied = c.winnerId === null
              const opponentName = c.isIncoming ? c.challengerUsername : c.challengedUsername
              const myScore = c.myScore
              const opponentScore = c.opponentScore ?? 0
              const outcomeColor = tied ? '#9ca3af' : won ? '#4ade80' : '#f87171'
              const payout = c.wager > 0
                ? tied ? `${c.wager} ⟡ returned` : won ? `+${c.wager * 2} ⟡` : `−${c.wager} ⟡`
                : null
              const scoreUnit = c.challengeType === 'most_fish' ? 'fish' : c.challengeType === 'most_doubloons' ? '⟡' : 'perfects'
              return (
                <div key={c.id} style={{
                  background: won ? 'rgba(74,222,128,0.06)' : tied ? 'rgba(156,163,175,0.05)' : 'rgba(248,113,113,0.06)',
                  border: `1px solid ${outcomeColor}30`,
                  borderRadius: 14, overflow: 'hidden',
                  boxShadow: won ? '0 0 24px rgba(74,222,128,0.1)' : 'none',
                }}>
                  {/* Outcome header */}
                  <div style={{
                    padding: '0.65rem 1rem',
                    borderBottom: `1px solid ${outcomeColor}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <p className="font-cinzel font-700" style={{
                      fontSize: '1rem', color: outcomeColor, lineHeight: 1,
                      textShadow: won ? '0 0 18px rgba(74,222,128,0.55)' : 'none',
                    }}>
                      {tied ? 'Tie' : won ? 'Victory' : 'Defeat'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {payout && <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: outcomeColor }}>{payout}</span>}
                      <span className="font-karla font-300" style={{ fontSize: '0.55rem', color: '#4a4845' }}>{timeAgo(c.createdAt)}</span>
                    </div>
                  </div>
                  {/* Details + scores */}
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: '#6a6764', marginBottom: 8 }}>
                      vs {opponentName} · {durationLabel(c.durationSeconds)} · {typeLabel(c.challengeType)}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${won && !tied ? `${outcomeColor}35` : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '0.4rem 0.6rem' }}>
                        <p className="font-karla font-400" style={{ fontSize: '0.52rem', color: '#4a4845', marginBottom: 2 }}>You</p>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: won && !tied ? outcomeColor : '#f0ede8', lineHeight: 1 }}>{myScore}</p>
                        <p className="font-karla font-300" style={{ fontSize: '0.5rem', color: '#4a4845', marginTop: 1 }}>{scoreUnit}</p>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${!won && !tied ? `${outcomeColor}35` : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '0.4rem 0.6rem' }}>
                        <p className="font-karla font-400" style={{ fontSize: '0.52rem', color: '#4a4845', marginBottom: 2 }}>{opponentName}</p>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: !won && !tied ? outcomeColor : '#f0ede8', lineHeight: 1 }}>{opponentScore}</p>
                        <p className="font-karla font-300" style={{ fontSize: '0.5rem', color: '#4a4845', marginTop: 1 }}>{scoreUnit}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function ChallengeButton({ username, myDoubloons, onCreated, hasActiveChallenge }: { username: string; myDoubloons: number; onCreated: () => void; hasActiveChallenge?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => { if (!hasActiveChallenge) setOpen(true) }}
        disabled={hasActiveChallenge}
        className="font-karla font-600 uppercase tracking-[0.1em]"
        style={{ fontSize: '0.52rem', padding: '0.28rem 0.6rem', borderRadius: 6, background: hasActiveChallenge ? 'rgba(255,255,255,0.04)' : 'rgba(240,192,64,0.08)', border: `1px solid ${hasActiveChallenge ? 'rgba(255,255,255,0.1)' : 'rgba(240,192,64,0.25)'}`, color: hasActiveChallenge ? '#4a4845' : '#f0c040', cursor: hasActiveChallenge ? 'default' : 'pointer', flexShrink: 0 }}
      >
        {hasActiveChallenge ? 'Active' : 'Challenge'}
      </button>
      {open && (
        <CreateChallengeModal
          targetUsername={username}
          myDoubloons={myDoubloons}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); onCreated() }}
        />
      )}
    </>
  )
}
