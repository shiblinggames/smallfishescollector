'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  href: string
  eyebrow: string
  title: string
  statusText: string
  info: string[]
  icon: React.ReactNode
  completed?: boolean
  streak?: number
}

export default function GameCard({ href, eyebrow, title, statusText, info, icon, completed, streak }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const dim = !!completed

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: `1px solid ${dim ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: '14px',
          padding: '0.875rem',
          cursor: 'pointer',
          opacity: dim ? 0.7 : 1,
          userSelect: 'none',
        }}
      >
        {/* Top row: icon · eyebrow · check · info */}
        <div className="flex items-center gap-2 mb-2.5">
          <div style={{
            width: 34, height: 34,
            background: dim ? 'rgba(255,255,255,0.06)' : 'rgba(240,192,64,0.08)',
            border: `1px solid ${dim ? 'rgba(255,255,255,0.13)' : 'rgba(240,192,64,0.18)'}`,
            borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            color: dim ? '#4a4845' : '#f0c040',
          }}>
            {icon}
          </div>
          <p className="sg-eyebrow flex-1 truncate" style={{ color: '#9a9488' }}>{eyebrow}</p>
          {completed && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
            style={{ color: '#4a4845', flexShrink: 0, lineHeight: 1 }}
            aria-label="More info"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </button>
        </div>

        {/* Title */}
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem', lineHeight: 1.2, marginBottom: '0.3rem' }}>
          {title}
        </p>

        {/* Status */}
        <p className="font-karla text-[#a0a09a]" style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
          {statusText}
        </p>
        {!completed && streak != null && streak > 0 && (
          <p className="font-karla font-600 mt-1" style={{ fontSize: '0.65rem', color: '#f0c040' }}>
            {streak}d streak
          </p>
        )}
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50,
            padding: '1.5rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1c1917',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '18px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '22rem',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>{eyebrow}</p>
                <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.1rem' }}>{title}</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ color: '#6a6764', lineHeight: 1, marginTop: 2, flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: '1rem' }} />
            <ul className="flex flex-col gap-2">
              {info.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span style={{ color: '#f0c040', fontSize: '0.5rem', lineHeight: '1.8rem', flexShrink: 0 }}>✦</span>
                  <span className="font-karla text-[#a0a09a]" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
