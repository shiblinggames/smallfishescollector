'use client'

import { useState, useTransition } from 'react'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { addCrewMember, removeCrewMember } from '@/app/social/actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getHook } from '@/lib/hooks'
import { getRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { getShip } from '@/lib/ships'

interface CardVariant {
  id: number
  variant_name: string
  border_style: BorderStyle
  art_effect: ArtEffect
  drop_weight: number
  cards: { name: string; filename: string }
}

interface Stats {
  packsOpened: number
  uniqueSpecies: number
  fishingXP: number
  highestPerfectStreak: number
}

interface Gear {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  shipTier: number
}

interface Props {
  username: string
  showcaseVariants: unknown[]
  stats: Stats
  gear: Gear
  rarestFish: { id: number; name: string; bite_rarity: number }[]
  isPremium?: boolean
  isOwnProfile?: boolean
  isInCrew?: boolean
}

const RARITY_COLOR: Record<number, string> = {
  1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#f59e0b',
}
const RARITY_LABEL: Record<number, string> = {
  1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary',
}

const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']
function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 12 }}>
      {children}
    </p>
  )
}

export default function ProfileClient({ username, showcaseVariants, stats, gear, rarestFish, isPremium, isOwnProfile, isInCrew: initialIsInCrew }: Props) {
  const variants = showcaseVariants as CardVariant[]
  const [inCrew, setInCrew] = useState(initialIsInCrew ?? false)
  const [crewPending, startCrewTransition] = useTransition()

  const fishingLevel = getLevelFromXP(stats.fishingXP)
  const color = avatarColor(username)

  const rod  = getRod(gear.rodTier)
  const reel = getReel(gear.reelTier)
  const hook = getHook(gear.hookTier)
  const line = getLine(gear.lineTier)
  const ship = getShip(gear.shipTier)

  function toggleCrew() {
    startCrewTransition(async () => {
      if (inCrew) { await removeCrewMember(username); setInCrew(false) }
      else         { await addCrewMember(username);    setInCrew(true)  }
    })
  }

  return (
    <div className="flex flex-col px-5 max-w-sm mx-auto" style={{ gap: 28 }}>

      {/* ── Header ── */}
      <div className="flex flex-col items-center gap-3 pt-2">
        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `radial-gradient(circle at 38% 35%, ${color}ee 0%, ${color}55 100%)`,
          border: `2px solid ${color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: '#f0ede8' }}>
            {username.slice(0, 1).toUpperCase()}
          </span>
        </div>

        {/* Name */}
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.3rem' }}>{username}</p>

        {/* Badges + action */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {isPremium && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.28)' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#f0c040' }}>Member</span>
            </div>
          )}
          {!isOwnProfile && (
            <button
              onClick={toggleCrew}
              disabled={crewPending}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-karla font-700 uppercase tracking-[0.12em] transition-all disabled:opacity-40"
              style={{
                fontSize: '0.55rem',
                background: inCrew ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${inCrew ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.14)'}`,
                color: inCrew ? '#4ade80' : '#a0a09a',
              }}
            >
              {crewPending ? '…' : inCrew ? '✓ Friends' : '+ Add Friend'}
            </button>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { value: `Lv ${fishingLevel}`, label: 'Fishing' },
          { value: stats.packsOpened.toLocaleString(), label: 'Packs' },
          { value: stats.uniqueSpecies.toLocaleString(), label: 'Species' },
        ].map(({ value, label }) => (
          <div key={label} style={{
            background: 'rgba(4,10,20,0.7)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '0.75rem 0.5rem', textAlign: 'center',
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1 }}>{value}</p>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.42rem', color: '#4a4845', marginTop: 5 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Showcase ── */}
      {variants.length > 0 && (
        <div>
          <SectionLabel>Top Catches</SectionLabel>
          <div className="flex flex-col items-center gap-5">
            <FishCard
              name={variants[0].cards.name}
              filename={variants[0].cards.filename}
              borderStyle={variants[0].border_style}
              artEffect={variants[0].art_effect}
              variantName={variants[0].variant_name}
              dropWeight={variants[0].drop_weight}
            />
            {variants.length > 1 && (
              <div className="flex gap-5 justify-center">
                {variants.slice(1, 3).map(cv => (
                  <FishCard key={cv.id} name={cv.cards.name} filename={cv.cards.filename}
                    borderStyle={cv.border_style} artEffect={cv.art_effect}
                    variantName={cv.variant_name} dropWeight={cv.drop_weight} />
                ))}
              </div>
            )}
            {variants.length > 3 && (
              <div className="flex gap-5 justify-center">
                {variants.slice(3, 5).map(cv => (
                  <FishCard key={cv.id} name={cv.cards.name} filename={cv.cards.filename}
                    borderStyle={cv.border_style} artEffect={cv.art_effect}
                    variantName={cv.variant_name} dropWeight={cv.drop_weight} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fishing ── */}
      {(stats.highestPerfectStreak > 0 || rarestFish.length > 0) && (
        <div>
          <SectionLabel>Fishing</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.highestPerfectStreak > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(4,10,20,0.7)', border: '1px solid rgba(251,146,60,0.2)',
                borderRadius: 12, padding: '0.8rem 1rem',
              }}>
                <div>
                  <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#fb923c88', marginBottom: 4 }}>Best Perfect Streak</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#fb923c', lineHeight: 1 }}>{stats.highestPerfectStreak}×</p>
                </div>
                <img src="/models/hooks/gold-hook.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain', opacity: 0.5 }} />
              </div>
            )}
            {rarestFish.length > 0 && (
              <div style={{
                background: 'rgba(4,10,20,0.7)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '0.8rem 1rem',
              }}>
                <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#6a6764', marginBottom: 10 }}>Rarest Catches</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {rarestFish.map(fish => (
                    <div key={fish.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>{fish.name}</p>
                      <span style={{
                        fontSize: '0.5rem', padding: '0.15rem 0.5rem', borderRadius: '2rem',
                        background: `${RARITY_COLOR[fish.bite_rarity]}14`,
                        border: `1px solid ${RARITY_COLOR[fish.bite_rarity]}35`,
                        color: RARITY_COLOR[fish.bite_rarity],
                        fontFamily: 'var(--font-karla)', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                      }}>
                        {RARITY_LABEL[fish.bite_rarity] ?? 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Gear ── */}
      <div>
        <SectionLabel>Equipment</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 4-item row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { label: 'Rod',  color: rod.color,  name: rod.name,  img: '/rod.png' },
              { label: 'Hook', color: hook.color, name: hook.name, img: hook.imageUrl ?? null },
              { label: 'Reel', color: reel.color, name: reel.name, img: null },
              { label: 'Line', color: line.color, name: line.name, img: null },
            ].map(({ label, color, name, img }) => (
              <div key={label} style={{
                background: 'rgba(4,10,20,0.7)', border: `1px solid ${color}30`,
                borderRadius: 10, padding: '0.55rem 0.4rem', textAlign: 'center',
              }}>
                <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 5 }}>
                  {img
                    ? <img src={img} alt={label} style={{ width: 24, height: 24, objectFit: 'contain', filter: `drop-shadow(0 1px 4px ${color}55)` }} />
                    : <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, opacity: 0.6 }} />
                  }
                </div>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.4rem', color: color + '88', marginBottom: 2 }}>{label}</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.52rem', color: '#a0a09a', lineHeight: 1.2 }}>{name}</p>
              </div>
            ))}
          </div>
          {/* Ship — full width */}
          <div style={{
            background: 'rgba(4,10,20,0.7)', border: `1px solid ${ship.color}30`,
            borderRadius: 10, padding: '0.65rem 1rem',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <img src={ship.imageUrl} alt={ship.name} style={{ width: 44, height: 36, objectFit: 'contain', filter: `drop-shadow(0 2px 8px ${ship.color}44)` }} />
            <div>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.42rem', color: ship.color + '88', marginBottom: 3 }}>Ship</p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: ship.color }}>{ship.name}</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
