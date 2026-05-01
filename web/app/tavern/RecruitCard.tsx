'use client'

import { useRouter } from 'next/navigation'

interface Props {
  packsAvailable: number
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s: React.CSSProperties = { position: 'absolute', width: 10, height: 10, borderColor: 'rgba(200,168,112,0.5)' }
  if (pos === 'tl') { s.top = 9; s.left = 9; s.borderTop = '1.5px solid'; s.borderLeft = '1.5px solid' }
  if (pos === 'tr') { s.top = 9; s.right = 9; s.borderTop = '1.5px solid'; s.borderRight = '1.5px solid' }
  if (pos === 'bl') { s.bottom = 9; s.left = 9; s.borderBottom = '1.5px solid'; s.borderLeft = '1.5px solid' }
  if (pos === 'br') { s.bottom = 9; s.right = 9; s.borderBottom = '1.5px solid'; s.borderRight = '1.5px solid' }
  return <div style={s} />
}

export default function RecruitCard({ packsAvailable }: Props) {
  const router = useRouter()
  const hasNotices = packsAvailable > 0

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push('/packs')}
      onKeyDown={e => e.key === 'Enter' && router.push('/packs')}
      style={{
        position: 'relative',
        background: '#0c0905',
        border: '1px solid rgba(200,168,112,0.28)',
        borderRadius: 14,
        padding: '1.35rem 1.25rem 1.2rem',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: 'inset 0 0 0 1px rgba(200,168,112,0.07), 0 0 28px rgba(200,168,112,0.05)',
      }}
    >
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {/* Header: rule — CREW NOTICE — rule  +  wax seal */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div style={{ flex: 1, height: 1, width: 20, background: 'rgba(200,168,112,0.25)' }} />
          <p className="font-cinzel font-700 tracking-[0.22em] uppercase" style={{ fontSize: '0.48rem', color: '#c8a870' }}>
            Crew Notice
          </p>
          <div style={{ flex: 1, height: 1, width: 20, background: 'rgba(200,168,112,0.25)' }} />
        </div>

        <div style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0, marginLeft: '0.75rem',
          background: hasNotices
            ? 'radial-gradient(circle at 38% 32%, #d4b07a 0%, #9a6e30 100%)'
            : 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${hasNotices ? 'rgba(200,168,112,0.55)' : 'rgba(255,255,255,0.08)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: hasNotices ? '#1a0e04' : '#3a3835' }}>
            {packsAvailable}
          </span>
        </div>
      </div>

      {/* Title */}
      <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
        Recruit Crew
      </p>

      {/* Status */}
      <p className="font-karla" style={{ fontSize: '0.72rem', color: hasNotices ? '#b09060' : '#4a4540', marginBottom: '1rem' }}>
        {hasNotices
          ? `${packsAvailable} notice${packsAvailable !== 1 ? 's' : ''} available`
          : 'No notices — visit the shop'}
      </p>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(200,168,112,0.1)', marginBottom: '1rem' }} />

      {/* 4 mini card backs */}
      <div className="flex justify-center items-end gap-2">
        {[-9, -3, 3, 9].map((deg, i) => (
          <div
            key={i}
            style={{
              width: 48, height: 68,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid rgba(200,168,112,0.25)',
              transform: `rotate(${deg}deg)`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              flexShrink: 0,
            }}
          >
            <img src="/cardbacknew.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
