'use client'

import { useEffect, useRef, useState } from 'react'
import { ACHIEVEMENT_MAP } from '@/lib/achievements'

interface Props {
  keys: string[]
  onDone?: () => void
}

const ICON_SVG: Record<string, React.ReactNode> = {
  pack: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
    </svg>
  ),
  fish: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 12c.94-3.46 4.94-6 10.5-6-3 3.46-3 8.54 0 12-5.56 0-9.56-2.54-10.5-6z"/>
      <path d="M18 6L2 12l16 6"/>
    </svg>
  ),
  star: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  anchor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>
  ),
  coin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v2m0 8v2m-3-7h6"/>
    </svg>
  ),
  crown: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 19l3-10 4.5 4.5L12 4l2.5 9.5L19 9l3 10H2z"/>
    </svg>
  ),
  scroll: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
    </svg>
  ),
  trophy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4V4h16v5h-2"/>
      <path d="M6 4v5a6 6 0 0 0 12 0V4"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
    </svg>
  ),
}

function ToastItem({ achievementKey, onExit }: { achievementKey: string; onExit: () => void }) {
  const [visible, setVisible] = useState(false)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 50)
    const hide = setTimeout(() => setVisible(false), 3800)
    const exit = setTimeout(() => onExitRef.current(), 4300)
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(exit) }
  }, [])

  const achievement = ACHIEVEMENT_MAP[achievementKey]
  if (!achievement) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'rgba(20,18,16,0.95)',
        border: '1px solid rgba(240,192,64,0.3)',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        maxWidth: 320,
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        background: 'rgba(240,192,64,0.1)',
        border: '1px solid rgba(240,192,64,0.25)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#f0c040',
      }}>
        {ICON_SVG[achievement.icon]}
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#f0c040', marginBottom: 2 }}>
          Achievement Unlocked
        </p>
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.82rem' }}>{achievement.name}</p>
        <p className="font-karla font-300 text-[#a0a09a]" style={{ fontSize: '0.72rem' }}>{achievement.description}</p>
      </div>
    </div>
  )
}

export default function AchievementToast({ keys, onDone }: Props) {
  const [queue, setQueue] = useState<string[]>(keys)

  useEffect(() => {
    setQueue(keys)
  }, [keys])

  if (queue.length === 0) return null

  const current = queue[0]

  return (
    <div style={{
      position: 'fixed',
      bottom: '7rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      alignItems: 'center',
    }}>
      <ToastItem
        key={current}
        achievementKey={current}
        onExit={() => {
          setQueue(q => {
            const next = q.slice(1)
            if (next.length === 0) onDone?.()
            return next
          })
        }}
      />
    </div>
  )
}
