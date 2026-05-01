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
      <div style={{ height: 1, background: 'rgba(200,168,112,0.1)', marginBottom: '0.85rem' }} />

      {/* Info bullets */}
      <ul className="flex flex-col gap-1.5">
        {[
          'Use Crew Notices to recruit new crew members',
          'Each notice draws 4 cards — Common through Mythic',
          'Earn notices through bounties, daily bonuses, and the shop',
        ].map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span style={{ color: 'rgba(200,168,112,0.5)', fontSize: '0.4rem', lineHeight: '1.9rem', flexShrink: 0 }}>✦</span>
            <span className="font-karla" style={{ fontSize: '0.72rem', color: '#6a6258', lineHeight: 1.55 }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
