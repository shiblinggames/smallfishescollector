'use client'

import { useRouter } from 'next/navigation'

interface Props {
  packsAvailable: number
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
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(8,14,22,0.98) 0%, rgba(28,20,10,0.95) 100%)',
        border: '1px solid rgba(200,168,112,0.5)',
        borderTop: '2px solid rgba(200,168,112,0.8)',
        borderRadius: 20,
        padding: '1.4rem 1.5rem 1.3rem',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex', alignItems: 'stretch', gap: '1rem',
        boxShadow: '0 0 40px rgba(200,168,112,0.14), inset 0 0 60px rgba(200,168,112,0.03)',
      }}
    >
      {/* Left: text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.18em]"
          style={{ fontSize: '0.56rem', color: 'rgba(200,168,112,0.7)', marginBottom: '0.45rem', letterSpacing: '0.2em' }}>
          Crew Notice
        </p>
        <p className="font-cinzel font-700"
          style={{ fontSize: '1.25rem', color: '#f0ede8', lineHeight: 1.15, marginBottom: '0.45rem', letterSpacing: '0.02em' }}>
          Recruit Crew
        </p>
        <p className="font-karla font-400"
          style={{ fontSize: '0.74rem', lineHeight: 1.5, color: hasNotices ? 'rgba(200,168,112,0.85)' : '#5a5450' }}>
          {hasNotices
            ? `${packsAvailable} notice${packsAvailable !== 1 ? 's' : ''} waiting`
            : 'No notices — visit the shop'}
        </p>
      </div>

      {/* Right: image */}
      <div style={{
        flexShrink: 0, width: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/recruitcrew.png"
          alt=""
          style={{
            maxWidth: '100%',
            maxHeight: 120,
            objectFit: 'contain',
            opacity: 0.92,
            filter: 'drop-shadow(0 4px 18px rgba(200,168,112,0.55))',
          }}
        />
      </div>
    </div>
  )
}
