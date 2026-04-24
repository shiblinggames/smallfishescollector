'use client'

import { useState } from 'react'
import type { Achievement } from '@/lib/achievements'

const ICON_SVG: Record<string, React.ReactNode> = {
  pack: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
    </svg>
  ),
  fish: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 12c.94-3.46 4.94-6 10.5-6-3 3.46-3 8.54 0 12-5.56 0-9.56-2.54-10.5-6z"/>
      <path d="M18 6L2 12l16 6"/>
    </svg>
  ),
  star: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  anchor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>
  ),
  coin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v2m0 8v2m-3-7h6"/>
    </svg>
  ),
  crown: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 19l3-10 4.5 4.5L12 4l2.5 9.5L19 9l3 10H2z"/>
    </svg>
  ),
  scroll: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
    </svg>
  ),
  trophy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4V4h16v5h-2"/>
      <path d="M6 4v5a6 6 0 0 0 12 0V4"/>
      <line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
    </svg>
  ),
  hook: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v9"/>
      <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
      <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  ship: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l1.5 3h15L21 17"/>
      <path d="M3 17c2 1 4.5 1.5 9 1.5S19 18 21 17"/>
      <path d="M12 2v11"/>
      <path d="M5 10l7 4 7-4"/>
      <path d="M8 6l4-4 4 4"/>
    </svg>
  ),
}

interface Category {
  cat: string
  label: string
  achievements: Achievement[]
}

interface Props {
  byCategory: Category[]
  unlocked: string[]
}

function CategorySection({ cat, label, achievements, unlockedSet }: Category & { unlockedSet: Set<string> }) {
  const catUnlocked = achievements.filter(a => unlockedSet.has(a.key)).length
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between mb-3"
        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
      >
        <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>
          {label}
        </p>
        <div className="flex items-center gap-2">
          <p className="font-karla font-300 text-[#4a4845]" style={{ fontSize: '0.6rem' }}>
            {catUnlocked} / {achievements.length}
          </p>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {achievements.map(a => {
            const done = unlockedSet.has(a.key)
            return (
              <div
                key={a.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.875rem',
                  padding: '0.875rem 1rem',
                  background: done ? 'rgba(240,192,64,0.05)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${done ? 'rgba(240,192,64,0.18)' : 'rgba(255,255,255,0.09)'}`,
                  borderRadius: '12px',
                  opacity: done ? 1 : 0.45,
                }}
              >
                <div style={{
                  width: 36, height: 36, flexShrink: 0,
                  background: done ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${done ? 'rgba(240,192,64,0.25)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: '9px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: done ? '#f0c040' : '#6a6764',
                }}>
                  {ICON_SVG[a.icon]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: done ? '#f0ede8' : '#a0a09a' }}>
                    {a.name}
                  </p>
                  <p className="font-karla font-300 text-[#6a6764] mt-0.5" style={{ fontSize: '0.72rem', lineHeight: 1.45 }}>
                    {a.description}
                  </p>
                </div>
                {done && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AchievementsClient({ byCategory, unlocked }: Props) {
  const unlockedSet = new Set(unlocked)

  return (
    <div className="flex flex-col gap-8">
      {byCategory.map(({ cat, label, achievements }) => (
        <CategorySection
          key={cat}
          cat={cat}
          label={label}
          achievements={achievements}
          unlockedSet={unlockedSet}
        />
      ))}
    </div>
  )
}
