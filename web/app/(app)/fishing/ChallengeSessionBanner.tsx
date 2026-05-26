'use client'

import { useState, useEffect, useTransition } from 'react'
import { finishSession, type ActiveSession, type ChallengeType } from '@/app/(app)/social/challengeActions'

function typeLabel(t: ChallengeType) {
  if (t === 'most_fish') return 'fish caught'
  if (t === 'most_doubloons') return '⟡ earned'
  return 'perfects'
}

export default function ChallengeSessionBanner({ session }: { session: ActiveSession }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(session.endsAt).getTime() - Date.now()) / 1000))
  )
  const [finished, setFinished] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(id)
          setFinished(true)
          startTransition(async () => { await finishSession(session.challengeId) })
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [session.challengeId, secondsLeft])

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`
  const accent = '#fb923c'

  if (finished) return (
    <div style={{
      background: `${accent}18`, border: `1px solid ${accent}40`,
      borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
      <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: accent, flex: 1 }}>
        Challenge session over — {session.myScore} {typeLabel(session.challengeType)}
      </p>
    </div>
  )

  return (
    <div style={{
      background: `${accent}12`, border: `1px solid ${accent}35`,
      borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem',
    }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0, animation: 'pulse 2s infinite' }} />
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: accent }}>
              vs {session.opponentUsername}
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
              {session.myScore} {typeLabel(session.challengeType)}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: accent, lineHeight: 1 }}>
            {timeStr}
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            remaining
          </p>
        </div>
      </div>
    </div>
  )
}
