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

      {/* Header: rule — CREW NOTICE — rule */}
      <div className="flex items-center gap-2.5 mb-3">
        <div style={{ height: 1, width: 20, background: 'rgba(200,168,112,0.25)', flexShrink: 0 }} />
        <p className="font-cinzel font-700 tracking-[0.22em] uppercase" style={{ fontSize: '0.48rem', color: '#c8a870', flexShrink: 0 }}>
          Crew Notice
        </p>
        <div style={{ flex: 1, height: 1, background: 'rgba(200,168,112,0.25)' }} />
      </div>

      <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
        Recruit Crew
      </p>
      <p className="font-karla" style={{ fontSize: '0.72rem', color: hasNotices ? '#b09060' : '#4a4540' }}>
        {hasNotices
          ? `${packsAvailable} notice${packsAvailable !== 1 ? 's' : ''} available`
          : 'No notices — visit the shop'}
      </p>
    </div>
  )
}
