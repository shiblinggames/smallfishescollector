'use client'

import { useState, useTransition, useRef } from 'react'
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

function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
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

const CARD_W = 140

function getOff(idx: number, active: number, total: number) {
  let d = idx - active
  if (d > total / 2) d -= total
  if (d < -total / 2) d += total
  return d
}

function cardTransform(off: number): { tx: number; tz: number; ry: number; scale: number; brightness: number; zIdx: number } {
  const abs = Math.abs(off)
  const sign = Math.sign(off)
  if (off === 0)  return { tx: 0,          tz: 50,  ry: 0,           scale: 1.00, brightness: 1.0,  zIdx: 10 }
  if (abs === 1)  return { tx: sign * 90,  tz: -15, ry: -sign * 22,  scale: 0.80, brightness: 0.55, zIdx: 5  }
  return            { tx: sign * 148, tz: -45, ry: -sign * 36,  scale: 0.60, brightness: 0.35, zIdx: 2  }
}

function CrewCarousel({ variants }: { variants: CardVariant[] }) {
  const [active, setActive] = useState(0)
  const total = variants.length
  const touchStartX = useRef<number | null>(null)

  function prev() { setActive(i => (i - 1 + total) % total) }
  function next() { setActive(i => (i + 1) % total) }

  const activeCard = variants[active]
  const isActiveCaptain = active === 0

  return (
    <div>
      {isActiveCaptain && (
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#f0c04066' }}>⚓ Captain</span>
        </div>
      )}

      {/* 3D stage — touch-swipeable */}
      <div
        style={{ position: 'relative', height: 210, perspective: '800px', overflow: 'visible' }}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchStartX.current === null || total <= 1) return
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (dx > 40) prev()
          else if (dx < -40) next()
          touchStartX.current = null
        }}
      >
        {variants.map((cv, idx) => {
          const off = getOff(idx, active, total)
          if (Math.abs(off) > 2) return null
          const { tx, tz, ry, scale, brightness, zIdx } = cardTransform(off)
          return (
            <div
              key={cv.id}
              onClick={() => off !== 0 && setActive(idx)}
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                marginLeft: -CARD_W / 2,
                transform: `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
                transition: 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.38s',
                filter: `brightness(${brightness})`,
                zIndex: zIdx,
                cursor: off !== 0 ? 'pointer' : 'default',
              }}
            >
              <FishCard
                name={cv.cards.name}
                filename={cv.cards.filename}
                borderStyle={cv.border_style}
                artEffect={cv.art_effect}
                variantName={cv.variant_name}
                dropWeight={cv.drop_weight}
              />
            </div>
          )
        })}
      </div>

      {/* Card name + nav */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0ede8', minHeight: '1.2em' }}>
          {activeCard?.cards.name}
        </p>
        {total > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5755', fontSize: '1.1rem', lineHeight: 1, padding: '0 2px' }}>‹</button>
            <div style={{ display: 'flex', gap: 5 }}>
              {variants.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  style={{
                    width: i === active ? 18 : 6, height: 6, borderRadius: 3,
                    background: i === active ? '#f0c040' : 'rgba(255,255,255,0.14)',
                    border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'width 0.22s, background 0.22s',
                  }}
                />
              ))}
            </div>
            <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5755', fontSize: '1.1rem', lineHeight: 1, padding: '0 2px' }}>›</button>
          </div>
        )}
      </div>
    </div>
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

      {/* ── Crew ── */}
      {(variants.length > 0 || stats.packsOpened > 0) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Crew</p>
            {stats.packsOpened > 0 && (
              <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#4a4845' }}>
                {stats.packsOpened.toLocaleString()} packs opened
              </p>
            )}
          </div>
          {variants.length > 0 && <CrewCarousel variants={variants} />}
        </div>
      )}

      {/* ── Fishing ── */}
      <div>
        <SectionLabel>Fishing</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { value: `Lv ${fishingLevel}`, label: 'Level' },
              { value: stats.uniqueSpecies.toLocaleString(), label: 'Species' },
              { value: stats.highestPerfectStreak > 0 ? `${stats.highestPerfectStreak}×` : '—', label: 'Best Streak' },
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

          {/* Rarest Catches */}
          {rarestFish.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#6a6764', marginBottom: 8 }}>Rarest Catches</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rarestFish.length}, 1fr)`, gap: 8 }}>
                {rarestFish.map(fish => {
                  const c = RARITY_COLOR[fish.bite_rarity]
                  return (
                    <div key={fish.id} style={{
                      background: `${c}0a`, border: `1px solid ${c}35`,
                      borderRadius: 12, padding: '0.75rem 0.5rem',
                      textAlign: 'center', boxShadow: `0 0 16px ${c}18`,
                    }}>
                      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        <img
                          src={fishImageUrl(fish.name)}
                          alt={fish.name}
                          style={{ maxWidth: 52, maxHeight: 52, objectFit: 'contain', filter: `drop-shadow(0 2px 8px ${c}55)` }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                      <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#f0ede8', marginBottom: 5, lineHeight: 1.2 }}>{fish.name}</p>
                      <span style={{
                        fontSize: '0.45rem', padding: '0.12rem 0.4rem', borderRadius: '2rem',
                        background: `${c}14`, border: `1px solid ${c}35`, color: c,
                        fontFamily: 'var(--font-karla)', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                      }}>
                        {RARITY_LABEL[fish.bite_rarity] ?? 'Unknown'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Equipment */}
          <div style={{ marginTop: 4 }}>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#6a6764', marginBottom: 8 }}>Equipment</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
      </div>

    </div>
  )
}
