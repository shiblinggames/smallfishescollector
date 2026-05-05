'use client'

import { useState, useTransition, useRef } from 'react'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { addCrewMember, removeCrewMember } from '@/app/social/actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel, getNavigatorTitle } from '@/lib/expeditionLevel'
import { getHook } from '@/lib/hooks'
import { getRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { getShip } from '@/lib/ships'
import { ROUTE_CONFIGS } from '@/lib/voyageRoutes'

interface CardVariant {
  id: number
  variant_name: string
  border_style: BorderStyle
  art_effect: ArtEffect
  drop_weight: number
  cards: { name: string; filename: string }
}

export interface VoyageEntry {
  id: number
  route: string
  status: 'revealed'
  total_doubloons: number
  total_gems: number
  crew_lost: number[]
  created_at: string
  captains_log: string | null
}

interface Stats {
  packsOpened: number
  uniqueSpecies: number
  fishingXP: number
  expeditionXP: number
  highestPerfectStreak: number
}

interface Gear {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  shipTier: number
  shipName: string | null
}

interface Props {
  username: string
  showcaseVariants: unknown[]
  stats: Stats
  gear: Gear
  rarestFish: { id: number; name: string; bite_rarity: number; habitat?: string }[]
  voyages?: VoyageEntry[]
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

export default function ProfileClient({ username, showcaseVariants, voyages, stats, gear, rarestFish, isPremium, isOwnProfile, isInCrew: initialIsInCrew }: Props) {
  const variants = showcaseVariants as CardVariant[]
  const [inCrew, setInCrew] = useState(initialIsInCrew ?? false)
  const [crewPending, startCrewTransition] = useTransition()
  const [expandedVoyage, setExpandedVoyage] = useState<number | null>(null)
  const [showAllVoyages, setShowAllVoyages] = useState(false)

  const fishingLevel = getLevelFromXP(stats.fishingXP)
  const expLevel = getExpeditionLevel(stats.expeditionXP)
  const expTitle = getNavigatorTitle(expLevel)

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

  const visibleVoyages = showAllVoyages ? (voyages ?? []) : (voyages ?? []).slice(0, 1)
  const hiddenCount = (voyages?.length ?? 0) - 1

  return (
    <div className="flex flex-col px-5 max-w-sm mx-auto" style={{ gap: 28 }}>

      {/* ── Header ── */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>{username}</p>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          {isPremium && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.28)' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#f0c040' }}>Member</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#60a5fa' }}>Fishing Lv {fishingLevel}</span>
          </div>
          {stats.expeditionXP > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(112,144,192,0.08)', border: '1px solid rgba(112,144,192,0.2)' }}>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#7090c0' }}>{expTitle} · Lv {expLevel}</span>
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

      {/* ── Ship Hero ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{
          background: `radial-gradient(ellipse at 50% 70%, ${ship.color}18 0%, transparent 70%)`,
          padding: '20px 0 8px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}>
          <img
            src={ship.imageUrl}
            alt={ship.name}
            style={{
              width: 180, height: 140,
              objectFit: 'contain',
              filter: `drop-shadow(0 4px 24px ${ship.color}55)`,
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: ship.color, lineHeight: 1.2 }}>
              {gear.shipName ?? ship.name}
            </p>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: ship.color + '66', marginTop: 4 }}>
              {ship.name}
            </p>
          </div>
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

      {/* ── Equipment ── */}
      <div>
        <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 12 }}>Equipment</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Rod + Hook — large images */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Rod',  color: rod.color,  name: rod.name,  img: rod.imageUrl ?? null },
              { label: 'Hook', color: hook.color, name: hook.name, img: hook.imageUrl ?? null },
            ].map(({ label, color, name, img }) => (
              <div key={label} style={{
                background: `linear-gradient(160deg, ${color}0a 0%, rgba(4,10,20,0.85) 60%)`,
                border: `1px solid ${color}30`,
                borderRadius: 16, padding: '1rem 0.75rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {img
                    ? <img src={img} alt={label} style={{ maxWidth: 64, maxHeight: 64, objectFit: 'contain', filter: `drop-shadow(0 2px 12px ${color}66)` }} />
                    : <div style={{ width: 20, height: 20, borderRadius: '50%', background: color, opacity: 0.5, boxShadow: `0 0 12px ${color}66` }} />
                  }
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.42rem', color: color + '88', marginBottom: 4 }}>{label}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.62rem', color: '#d0cdc8', lineHeight: 1.2 }}>{name}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Reel + Line — compact since no images */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Reel', color: reel.color, name: reel.name },
              { label: 'Line', color: line.color, name: line.name },
            ].map(({ label, color, name }) => (
              <div key={label} style={{
                background: 'rgba(4,10,20,0.7)', border: `1px solid ${color}25`,
                borderRadius: 12, padding: '0.65rem 0.75rem',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, opacity: 0.7, boxShadow: `0 0 8px ${color}66` }} />
                <div>
                  <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.38rem', color: color + '77', marginBottom: 2 }}>{label}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.55rem', color: '#a0a09a', lineHeight: 1.2 }}>{name}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Rarest Catches ── */}
      {rarestFish.length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 12 }}>Rarest Catches</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rarestFish.length}, 1fr)`, gap: 8 }}>
            {rarestFish.map(fish => {
              const c = RARITY_COLOR[fish.bite_rarity]
              return (
                <div key={fish.id} style={{
                  background: `${c}0a`, border: `1px solid ${c}35`,
                  borderRadius: 12, padding: '0.75rem 0.5rem',
                  textAlign: 'center', boxShadow: `0 0 16px ${c}18`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                }}>
                  <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={fishImageUrl(fish.name)}
                      alt={fish.name}
                      style={{ maxWidth: 52, maxHeight: 52, objectFit: 'contain', filter: `drop-shadow(0 2px 8px ${c}55)` }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                  <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#f0ede8', lineHeight: 1.2 }}>{fish.name}</p>
                  <span style={{
                    fontSize: '0.45rem', padding: '0.12rem 0.4rem', borderRadius: '2rem',
                    background: `${c}14`, border: `1px solid ${c}35`, color: c,
                    fontFamily: 'var(--font-karla)', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    {RARITY_LABEL[fish.bite_rarity] ?? 'Unknown'}
                  </span>
                  {fish.habitat && (
                    <span style={{
                      fontSize: '0.42rem', padding: '0.1rem 0.35rem', borderRadius: '2rem',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.35)',
                      fontFamily: 'var(--font-karla)', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      {fish.habitat}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {stats.uniqueSpecies > 0 && (
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: '#4a4845', marginTop: 10, textAlign: 'center' }}>
              {stats.uniqueSpecies.toLocaleString()} species caught
              {stats.highestPerfectStreak > 0 ? ` · ${stats.highestPerfectStreak}× best streak` : ''}
            </p>
          )}
        </div>
      )}

      {/* ── Voyages ── */}
      {voyages && voyages.length > 0 && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 12 }}>Voyages</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleVoyages.map(v => {
              const routeConfig = ROUTE_CONFIGS[v.route as keyof typeof ROUTE_CONFIGS]
              const crewLostCount = (v.crew_lost ?? []).length
              const date = new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const preview = v.captains_log
                ? (v.captains_log.split(/(?<=[.!?])\s/)[0] ?? v.captains_log)
                : null
              const isExpanded = expandedVoyage === v.id

              return (
                <div
                  key={v.id}
                  style={{
                    background: 'rgba(4,10,20,0.7)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setExpandedVoyage(isExpanded ? null : v.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0.75rem 0.875rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚓</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#f0ede8' }}>
                          {routeConfig?.name ?? v.route}
                        </p>
                        {crewLostCount > 0 && (
                          <span style={{
                            fontSize: '0.42rem', padding: '0.1rem 0.35rem', borderRadius: '2rem',
                            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                            color: '#f87171', fontFamily: 'var(--font-karla)', fontWeight: 600,
                            textTransform: 'uppercase' as const, letterSpacing: '0.1em',
                          }}>
                            {crewLostCount} lost
                          </span>
                        )}
                      </div>
                      <p className="font-karla" style={{ fontSize: '0.55rem', color: '#4a4845', marginTop: 2 }}>
                        {date}
                        {v.total_doubloons > 0 ? ` · +${v.total_doubloons.toLocaleString()} ⟡` : ''}
                        {v.total_gems > 0 ? ` · +${v.total_gems} 💎` : ''}
                      </p>
                      {preview && !isExpanded && (
                        <p className="font-karla" style={{ fontSize: '0.55rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.28)', marginTop: 4, lineHeight: 1.5 }}>
                          {preview}
                        </p>
                      )}
                    </div>
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round"
                      style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    >
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>

                  {isExpanded && v.captains_log && (
                    <div style={{ padding: '0 0.875rem 0.875rem', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
                      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.42rem', color: 'rgba(180,120,30,0.5)', marginBottom: '0.5rem', paddingTop: '0.625rem' }}>
                        Captain&apos;s Log
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.65rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
                        {v.captains_log}
                      </p>
                    </div>
                  )}

                  {isExpanded && !v.captains_log && (
                    <div style={{ padding: '0.5rem 0.875rem 0.875rem', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
                      <p className="font-karla" style={{ fontSize: '0.58rem', fontStyle: 'italic', color: '#4a4845' }}>Log not yet written.</p>
                    </div>
                  )}
                </div>
              )
            })}

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAllVoyages(v => !v)}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10,
                  padding: '0.6rem', cursor: 'pointer', width: '100%',
                  color: '#4a4845', fontFamily: 'var(--font-karla)', fontWeight: 600,
                  fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                  transition: 'color 0.2s, border-color 0.2s',
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = '#8a8785'; (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)' }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = '#4a4845'; (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)' }}
              >
                {showAllVoyages ? 'Show less' : `Show ${hiddenCount} more voyage${hiddenCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
