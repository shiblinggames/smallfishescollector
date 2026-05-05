'use client'

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
  art?: string
  accent?: string
}

export default function GameCard({ href, eyebrow, title, statusText, icon, completed, streak, variant = 'default', art, accent = '#f0c040' }: Props) {
  const router = useRouter()
  const done = !!completed
  const featured = variant === 'featured'

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
      style={{
        display: 'flex', alignItems: 'stretch', gap: '1rem',
        background: featured ? 'rgba(6,12,20,0.92)' : 'rgba(6,12,20,0.92)',
        border: `1px solid ${done ? 'rgba(255,255,255,0.08)' : featured ? `${accent}40` : `${accent}28`}`,
        borderTop: `1px solid ${done ? 'rgba(255,255,255,0.08)' : featured ? `${accent}66` : `${accent}44`}`,
        borderRadius: 20,
        padding: '1.3rem 1.4rem 1.25rem',
        cursor: 'pointer',
        opacity: done ? 0.55 : 1,
        userSelect: 'none',
        transition: 'opacity 0.15s',
      }}
    >
      {/* Left: text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 mb-2">
          <div style={{
            width: 28, height: 28,
            background: `${accent}10`,
            border: `1px solid ${accent}22`,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            color: accent,
          }}>
            {icon}
          </div>
          <p className="font-karla font-600 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.56rem', color: accent + 'cc', flex: 1 }}>
            {eyebrow}
          </p>
          {done && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
        </div>

        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.2, marginBottom: '0.35rem' }}>
          {title}
        </p>

        <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#b0ada8', lineHeight: 1.5 }}>
          {statusText}
        </p>

        {!done && streak != null && streak > 0 && (
          <p className="font-karla font-600 mt-1.5" style={{ fontSize: '0.65rem', color: accent }}>
            {streak}d streak
          </p>
        )}
      </div>

      {/* Right: image */}
      {art && (
        <div style={{
          flexShrink: 0, width: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src={art}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: 110,
              objectFit: 'contain',
              opacity: done ? 0.4 : 0.88,
              filter: `drop-shadow(0 2px 8px ${accent}22)`,
            }}
          />
        </div>
      )}
    </div>
  )
}
