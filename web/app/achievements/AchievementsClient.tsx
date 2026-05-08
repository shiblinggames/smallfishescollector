'use client'

import { useState, useTransition } from 'react'
import { type Badge, MAX_EQUIPPED_BADGES } from '@/lib/badges'
import { equipBadge, unequipBadge } from './badgeActions'

interface Props {
  badges: Badge[]
  unlocked: string[]
  equipped: string[]
}

export default function AchievementsClient({ badges, unlocked, equipped: initialEquipped }: Props) {
  const [equipped, setEquipped] = useState<string[]>(() => {
    const e = [...initialEquipped]
    while (e.length < MAX_EQUIPPED_BADGES) e.push('')
    return e
  })
  const [pending, startTransition] = useTransition()

  function handleBadgeTap(badgeId: string) {
    if (!unlocked.includes(badgeId)) return

    const slotIndex = equipped.indexOf(badgeId)
    if (slotIndex !== -1) {
      const next = [...equipped]
      next[slotIndex] = ''
      setEquipped(next)
      startTransition(() => { unequipBadge(slotIndex as 0 | 1 | 2) })
      return
    }

    const emptySlot = equipped.findIndex(s => !s)
    if (emptySlot === -1) return

    const next = [...equipped]
    next[emptySlot] = badgeId
    setEquipped(next)
    startTransition(() => { equipBadge(badgeId, emptySlot as 0 | 1 | 2) })
  }

  function handleSlotTap(slot: number) {
    if (!equipped[slot]) return
    const next = [...equipped]
    next[slot] = ''
    setEquipped(next)
    startTransition(() => { unequipBadge(slot as 0 | 1 | 2) })
  }

  return (
    <div style={{ opacity: pending ? 0.7 : 1, transition: 'opacity 0.15s' }}>

      {/* Equip slots */}
      <div style={{
        background: 'rgba(4,10,18,0.72)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: '1rem', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Equipped
          </p>
          <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
            {equipped.filter(Boolean).length} / {MAX_EQUIPPED_BADGES}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {Array.from({ length: MAX_EQUIPPED_BADGES }, (_, i) => {
            const badgeId = equipped[i]
            const badge = badges.find(b => b.id === badgeId)
            return (
              <button
                key={i}
                onClick={() => handleSlotTap(i)}
                style={{
                  flex: 1, aspectRatio: '1', borderRadius: 12,
                  background: badge ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                  border: badge ? '1px solid rgba(255,255,255,0.18)' : '1px dashed rgba(255,255,255,0.12)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, cursor: badge ? 'pointer' : 'default', padding: 8,
                }}
              >
                {badge ? (
                  <>
                    <img src={badge.imageUrl} alt={badge.name}
                      style={{ width: '52%', aspectRatio: '1', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }}
                    />
                    <span className="font-karla" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.2 }}>
                      {badge.name}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: '1.1rem', opacity: 0.2 }}>+</span>
                )}
              </button>
            )
          })}
        </div>
        {equipped.filter(Boolean).length === 0 && (
          <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 10 }}>
            Tap an earned badge below to equip it
          </p>
        )}
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
          const isEquipped = equipped.includes(badge.id)
          return (
            <button
              key={badge.id}
              onClick={() => handleBadgeTap(badge.id)}
              disabled={!isUnlocked}
              style={{
                background: isEquipped
                  ? 'rgba(240,192,64,0.12)'
                  : isUnlocked
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(255,255,255,0.02)',
                border: isEquipped
                  ? '1px solid rgba(240,192,64,0.4)'
                  : isUnlocked
                    ? '1px solid rgba(255,255,255,0.14)'
                    : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14, padding: '0.85rem 0.6rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor: isUnlocked ? 'pointer' : 'default',
                transition: 'all 0.15s',
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
              {isEquipped && (
                <span className="font-karla font-700" style={{
                  fontSize: '0.55rem', color: '#f0c040',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  Equipped
                </span>
              )}
            </button>
          )
        })}
      </div>

    </div>
  )
}
