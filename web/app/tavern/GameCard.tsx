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
  variant?: 'default' | 'featured'
}

function NailHead({ style }: { style?: React.CSSProperties }) {
  return (
    <div aria-hidden style={{
      position: 'absolute',
      width: 11, height: 11,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 35% 30%, #d4a84a, #6b4010)',
      boxShadow: '0 2px 5px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.22)',
      ...style,
    }} />
  )
}

export default function GameCard({ href, eyebrow, title, statusText, info, icon, completed, streak, variant = 'default' }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const done = !!completed
  const featured = variant === 'featured'

  // Wood grain: faint horizontal lines over warm amber-brown gradient
  const grain = featured
    ? 'repeating-linear-gradient(0deg, transparent 0px, transparent 4px, rgba(0,0,0,0.055) 4px, rgba(0,0,0,0.055) 5px)'
    : 'repeating-linear-gradient(0deg, transparent 0px, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 6px)'
  const woodBase = featured
    ? 'linear-gradient(172deg, #8c5c2a 0%, #6a3e16 38%, #7c4e22 68%, #532e0e 100%)'
    : 'linear-gradient(172deg, #7a5028 0%, #5e3a18 38%, #6b4620 68%, #4b2c10 100%)'

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
        style={{
          position: 'relative',
          background: `${grain}, ${woodBase}`,
          border: '1px solid #1e0e04',
          borderRadius: featured ? '10px' : '8px',
          padding: featured ? '1.5rem 1.1rem 1.1rem' : '1.45rem 0.9rem 0.9rem',
          cursor: 'pointer',
          opacity: done ? 0.68 : 1,
          userSelect: 'none',
          // Plank-edge bevel: lighter top, darker bottom, slight left highlight
          boxShadow: [
            'inset 0 1px 0 rgba(255,255,255,0.13)',
            'inset 0 -2px 0 rgba(0,0,0,0.45)',
            'inset 1px 0 0 rgba(255,255,255,0.07)',
            'inset -1px 0 0 rgba(0,0,0,0.3)',
            '0 6px 18px rgba(0,0,0,0.55)',
            featured ? '0 0 0 1px rgba(240,192,64,0.22)' : '',
          ].filter(Boolean).join(', '),
        }}
      >
        {/* Nails — single centered for default, two corner nails for featured */}
        {featured ? (
          <>
            <NailHead style={{ top: 8, left: 14 }} />
            <NailHead style={{ top: 8, right: 14 }} />
          </>
        ) : (
          <NailHead style={{ top: 8, left: '50%', transform: 'translateX(-50%)' }} />
        )}

        {/* Top row */}
        <div className="flex items-center gap-2 mb-2.5">
          <div style={{
            width: 32, height: 32,
            background: 'rgba(0,0,0,0.28)',
            border: '1px solid rgba(0,0,0,0.45)',
            borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            color: '#f0c040',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
          }}>
            {icon}
          </div>
          <p className="sg-eyebrow flex-1 truncate" style={{ color: 'rgba(200,155,90,0.6)' }}>{eyebrow}</p>
          {completed && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
            style={{ color: '#7a5830', flexShrink: 0, lineHeight: 1 }}
            aria-label="More info"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </button>
        </div>

        {/* Title — carved/painted look */}
        <p className="font-cinzel font-700" style={{
          fontSize: '0.88rem',
          lineHeight: 1.2,
          marginBottom: '0.3rem',
          color: '#f2e8d0',
          textShadow: '0 1px 3px rgba(0,0,0,0.65)',
        }}>
          {title}
        </p>

        {/* Status */}
        <p className="font-karla" style={{ fontSize: '0.72rem', lineHeight: 1.4, color: '#c8a878' }}>
          {statusText}
        </p>
        {!done && streak != null && streak > 0 && (
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
            background: 'rgba(0,0,0,0.70)',
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
