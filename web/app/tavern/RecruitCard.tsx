'use client'

import { useRouter } from 'next/navigation'

const SUPABASE_URL = 'https://pwvndjczpdcttmyvnsyq.supabase.co'
const FACE_UP = ['Catfish.png', 'Beluga_Whale.png']

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

      {/* Body: text left, cards right */}
      <div className="flex items-center justify-between gap-4">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
            Recruit Crew
          </p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: hasNotices ? '#b09060' : '#4a4540' }}>
            {hasNotices
              ? `${packsAvailable} notice${packsAvailable !== 1 ? 's' : ''} available`
              : 'No notices — visit the shop'}
          </p>
        </div>

        {/* 4 fanned cards — outer 2 face-down, inner 2 face-up */}
        <div style={{ position: 'relative', width: 88, height: 72, flexShrink: 0 }}>
          {[-9, -3, 3, 9].map((deg, i) => {
            const faceUpIndex = i === 1 ? 0 : i === 2 ? 1 : null
            const isFaceUp = faceUpIndex !== null
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: 44, height: 62,
                  borderRadius: 5,
                  overflow: 'hidden',
                  border: '1px solid rgba(200,168,112,0.25)',
                  transform: `rotate(${deg}deg)`,
                  transformOrigin: 'bottom center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  left: i * 14,
                  bottom: 0,
                  background: isFaceUp ? '#c8a870' : undefined,
                }}
              >
                {isFaceUp ? (
                  <>
                    <img src="/cardfront2.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }} />
                    <div style={{ position: 'absolute', top: '4%', left: '5%', right: '5%', bottom: '40%', overflow: 'hidden', zIndex: 2 }}>
                      <img
                        src={`${SUPABASE_URL}/storage/v1/object/public/card-arts/${FACE_UP[faceUpIndex]}`}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top' }}
                      />
                    </div>
                  </>
                ) : (
                  <img src="/cardbacknew.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
