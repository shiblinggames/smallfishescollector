'use client'

import Link from 'next/link'
import { type Badge } from '@/lib/badges'

interface Props {
  badges: Badge[]
  unlocked: string[]
}

export default function AchievementsClient({ badges, unlocked }: Props) {
  return (
    <div>

      {/* Profile link */}
      <div style={{
        background: 'rgba(4,10,18,0.72)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '1rem', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
          Equip earned badges on your profile page to display them on your boat.
        </p>
        <Link href="/profile" style={{
          flexShrink: 0, padding: '0.4rem 0.9rem', borderRadius: '2rem',
          background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.3)',
          textDecoration: 'none',
        }}>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', color: '#f0c040', letterSpacing: '0.12em' }}>
            My Profile →
          </span>
        </Link>
      </div>

      {/* Progress line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          All Badges
        </p>
        <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f0c040' }}>
          {unlocked.length} <span style={{ color: 'rgba(255,255,255,0.25)' }}>/ {badges.length}</span>
        </p>
      </div>

      {/* Badge grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {badges.map(badge => {
          const isUnlocked = unlocked.includes(badge.id)
          return (
            <div
              key={badge.id}
              style={{
                background: isUnlocked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                border: isUnlocked ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14, padding: '0.85rem 0.6rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 10,
                background: isUnlocked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                filter: isUnlocked ? 'none' : 'grayscale(1)',
                opacity: isUnlocked ? 1 : 0.35,
              }}>
                <img src={badge.imageUrl} alt={badge.name}
                  style={{ width: 36, height: 36, objectFit: 'contain' }}
                  onError={e => {
                    const el = e.target as HTMLImageElement
                    el.style.display = 'none'
                    const parent = el.parentElement
                    if (parent) parent.innerHTML = '<span style="font-size:1.3rem;opacity:0.4">🏅</span>'
                  }}
                />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p className="font-karla font-700" style={{
                  fontSize: '0.68rem', lineHeight: 1.2,
                  color: isUnlocked ? '#f0ede8' : 'rgba(240,237,232,0.3)',
                }}>
                  {badge.name}
                </p>
                <p className="font-karla" style={{
                  fontSize: '0.6rem', lineHeight: 1.3, marginTop: 3,
                  color: isUnlocked ? 'rgba(240,237,232,0.5)' : 'rgba(240,237,232,0.22)',
                }}>
                  {badge.description}
                </p>
              </div>
              {isUnlocked && (
                <span className="font-karla font-700" style={{
                  fontSize: '0.55rem', color: '#4ade80',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  Earned
                </span>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
