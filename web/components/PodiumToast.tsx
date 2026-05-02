'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface PodiumNotif {
  category: string
  position: number
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = ['#f0c040', '#c8c8c8', '#cd8c4a']
const ORDINALS = ['1st', '2nd', '3rd']

export default function PodiumToast({ notif, onDone }: { notif: PodiumNotif | null; onDone: () => void }) {
  const [visible, setVisible] = useState(false)
  const router = useRouter()
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!notif) return
    setVisible(false)
    const show = setTimeout(() => setVisible(true), 50)
    const hide = setTimeout(() => setVisible(false), 5800)
    const exit = setTimeout(() => onDoneRef.current(), 6300)
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(exit) }
  }, [notif])

  if (!notif) return null

  const idx = notif.position - 1
  const medal = MEDALS[idx] ?? '🏆'
  const color = MEDAL_COLORS[idx] ?? '#f0c040'
  const ordinal = ORDINALS[idx] ?? `${notif.position}th`

  return (
    <div style={{
      position: 'fixed',
      bottom: '7rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      pointerEvents: 'auto',
    }}>
      <div
        onClick={() => router.push('/leaderboard')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem 0.75rem 0.875rem',
          background: 'rgba(20,18,16,0.97)',
          border: `1px solid ${color}45`,
          borderRadius: '14px',
          boxShadow: `0 4px 28px rgba(0,0,0,0.6), 0 0 24px ${color}18`,
          width: 'max-content',
          maxWidth: 'calc(100vw - 3rem)',
          cursor: 'pointer',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(10px)',
        }}
      >
        <span style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>{medal}</span>
        <div style={{ minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color, marginBottom: '0.2rem' }}>
            You&apos;re on the podium!
          </p>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem', lineHeight: 1.2 }}>
            {ordinal} · {notif.category}
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764', marginTop: '0.15rem' }}>
            Tap to view leaderboard →
          </p>
        </div>
      </div>
    </div>
  )
}
