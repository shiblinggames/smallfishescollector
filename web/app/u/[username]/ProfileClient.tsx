'use client'

import { useState, useTransition, useRef } from 'react'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { addCrewMember, removeCrewMember } from '@/app/social/actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel, getNavigatorTitle } from '@/lib/expeditionLevel'
import { getHook } from '@/lib/hooks'
import { getRod } from '@/lib/rods'
import { getShip } from '@/lib/ships'
import { getShipSkin } from '@/lib/shipSkins'
import { ROUTE_CONFIGS } from '@/lib/voyageRoutes'
import { getCharacterSprites } from '@/lib/characters'
import { SPECIAL_ITEMS } from '@/lib/specialItems'

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
  equippedShipSkin?: string | null
}

interface Props {
  username: string
  showcaseVariants: unknown[]
  stats: Stats
  gear: Gear
  rarestFish: { id: number; name: string; bite_rarity: number; habitat?: string }[]
  ownedSpecialIds?: string[]
  raidItemIds?: string[]
  equippedShipSkin?: string | null
  voyages?: VoyageEntry[]
  isPremium?: boolean
  isOwnProfile?: boolean
  isInCrew?: boolean
  characterColor?: string
  equippedSpecialId?: string | null
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.78rem', color: '#8a8782', marginBottom: 14 }}>
      {children}
    </p>
  )
}

function CrewCarousel({ variants }: { variants: CardVariant[] }) {
  const [active, setActive] = useState(0)
  const total = variants.length
  const touchStartX = useRef<number | null>(null)

  function prev() { setActive(i => (i - 1 + total) % total) }
  function next() { setActive(i => (i + 1) % total) }

  const activeCard = variants[active]

  return (
    <div>
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
            <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a7775', fontSize: '1.2rem', lineHeight: 1, padding: '0 2px' }}>‹</button>
            <div style={{ display: 'flex', gap: 5 }}>
              {variants.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  style={{
                    width: i === active ? 18 : 6, height: 6, borderRadius: 3,
                    background: i === active ? '#f0c040' : 'rgba(255,255,255,0.2)',
                    border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'width 0.22s, background 0.22s',
                  }}
                />
              ))}
            </div>
            <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a7775', fontSize: '1.2rem', lineHeight: 1, padding: '0 2px' }}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProfileClient({ username, showcaseVariants, voyages, stats, gear, rarestFish, equippedShipSkin, isPremium, isOwnProfile, isInCrew: initialIsInCrew, characterColor = 'default', equippedSpecialId }: Props) {
  const variants = showcaseVariants as CardVariant[]
  const [inCrew, setInCrew] = useState(initialIsInCrew ?? false)
  const [crewPending, startCrewTransition] = useTransition()
  const [expandedVoyage, setExpandedVoyage] = useState<number | null>(null)
  const [showAllVoyages, setShowAllVoyages] = useState(false)

  const fishingLevel = getLevelFromXP(stats.fishingXP)
  const expLevel = getExpeditionLevel(stats.expeditionXP)
  const expTitle = getNavigatorTitle(expLevel)

  const rod  = getRod(gear.rodTier)
  const hook = getHook(gear.hookTier)
  const ship = getShip(gear.shipTier)
  const shipSkin = equippedShipSkin ? getShipSkin(equippedShipSkin) : null
  const charSprites = getCharacterSprites(characterColor)
  const equippedSpecial = equippedSpecialId ? SPECIAL_ITEMS.find(s => s.id === equippedSpecialId) ?? null : null

  function toggleCrew() {
    startCrewTransition(async () => {
      if (inCrew) { await removeCrewMember(username); setInCrew(false) }
      else         { await addCrewMember(username);    setInCrew(true)  }
    })
  }

  const visibleVoyages = showAllVoyages ? (voyages ?? []) : (voyages ?? []).slice(0, 1)
  const hiddenCount = (voyages?.length ?? 0) - 1

  return (
    <div className="flex flex-col max-w-4xl mx-auto px-5" style={{ gap: 0, paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div className="flex flex-col items-center gap-3 pt-2 pb-8">
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>{username}</p>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          {isPremium && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.28)' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: '#f0c040' }}>Member</span>
            </div>
          )}
          {!isOwnProfile && (
            <button
              onClick={toggleCrew}
              disabled={crewPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-karla font-700 uppercase tracking-[0.12em] transition-all disabled:opacity-40"
              style={{
                fontSize: '0.65rem',
                background: inCrew ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${inCrew ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.18)'}`,
                color: inCrew ? '#4ade80' : '#c0bdb8',
              }}
            >
              {crewPending ? '…' : inCrew ? '✓ Friends' : '+ Add Friend'}
            </button>
          )}
        </div>
      </div>

      {/* ── 2-col body on desktop ── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-8 md:gap-10 items-start">

        {/* ── LEFT: Fishing — character + catches ── */}
        <div className="flex flex-col" style={{ gap: 28 }}>

          {/* Character Loadout */}
          <div style={{
            background: 'radial-gradient(ellipse at 50% 90%, rgba(20,50,100,0.22) 0%, transparent 70%)',
            border: '1px solid rgba(80,120,200,0.18)',
            borderRadius: 20,
            overflow: 'hidden',
            paddingBottom: 14,
          }}>
            <div style={{
              position: 'relative',
              width: '100%',
              height: 200,
              filter: 'drop-shadow(0 8px 14px rgba(0,15,35,0.6))',
            }}>
              <div style={{ position: 'absolute', bottom: 0, left: '12%', width: '72%' }}>
                <img src={charSprites.rest} alt="" style={{ width: '100%', display: 'block' }} />
                {rod.imageUrl && (
                  <img src={rod.imageUrl} alt="" style={{
                    position: 'absolute', top: '33%', left: '12%', width: '51%',
                    transform: 'rotate(-1deg)', transformOrigin: 'bottom right',
                    pointerEvents: 'none',
                  }} />
                )}
                {hook.imageUrl && (
                  <img src={hook.imageUrl} alt="" style={{
                    position: 'absolute', top: '81%', left: '9%', width: '16%',
                    transform: 'rotate(-30deg)', transformOrigin: 'center center',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0, padding: '0 20px' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: rod.color + 'aa', marginBottom: 3 }}>Rod</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#d8d5d0', lineHeight: 1.2 }}>{rod.name}</p>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 8px', alignSelf: 'stretch' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(96,165,250,0.7)', marginBottom: 3 }}>Fishing Level</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#60a5fa', lineHeight: 1.2 }}>{fishingLevel}</p>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 8px', alignSelf: 'stretch' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: hook.color + 'aa', marginBottom: 3 }}>Hook</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#d8d5d0', lineHeight: 1.2 }}>{hook.name}</p>
              </div>
            </div>
          </div>

          {/* Equipped Special */}
          {equippedSpecial && (
            <div style={{
              background: `linear-gradient(130deg, ${equippedSpecial.color}12 0%, rgba(4,10,20,0.88) 55%)`,
              border: `1px solid ${equippedSpecial.color}40`,
              borderRadius: 16,
              padding: '0.85rem 1rem',
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: `0 0 20px ${equippedSpecial.color}14`,
            }}>
              {equippedSpecial.image
                ? <img src={equippedSpecial.image} alt={equippedSpecial.name} style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 10px ${equippedSpecial.color}88)` }} />
                : <div style={{ width: 44, height: 44, borderRadius: 10, background: equippedSpecial.color + '22', border: `1px solid ${equippedSpecial.color}44`, flexShrink: 0 }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: equippedSpecial.color, lineHeight: 1.2, marginBottom: 4 }}>{equippedSpecial.name}</p>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#a8a5a0', lineHeight: 1.5 }}>{equippedSpecial.description}</p>
                <span style={{
                  display: 'inline-block', marginTop: 6,
                  fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '2rem',
                  background: equippedSpecial.color + '18', border: `1px solid ${equippedSpecial.color}40`, color: equippedSpecial.color,
                  fontFamily: 'var(--font-karla)', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  {equippedSpecial.effectLabel}
                </span>
              </div>
            </div>
          )}

          {/* Rarest Catches */}
          {rarestFish.length > 0 && (
            <div>
              <SectionLabel>Rarest Catches</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rarestFish.length}, 1fr)`, gap: 8 }}>
                {rarestFish.map(fish => {
                  const c = RARITY_COLOR[fish.bite_rarity]
                  return (
                    <div key={fish.id} style={{
                      background: `${c}0a`, border: `1px solid ${c}38`,
                      borderRadius: 12, padding: '0.85rem 0.6rem',
                      textAlign: 'center', boxShadow: `0 0 18px ${c}18`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img
                          src={fishImageUrl(fish.name)}
                          alt={fish.name}
                          style={{ maxWidth: 52, maxHeight: 52, objectFit: 'contain', filter: `drop-shadow(0 2px 8px ${c}55)` }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                      <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#f0ede8', lineHeight: 1.2 }}>{fish.name}</p>
                      <span style={{
                        fontSize: '0.6rem', padding: '0.15rem 0.45rem', borderRadius: '2rem',
                        background: `${c}14`, border: `1px solid ${c}38`, color: c,
                        fontFamily: 'var(--font-karla)', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                      }}>
                        {RARITY_LABEL[fish.bite_rarity] ?? 'Unknown'}
                      </span>
                    </div>
                  )
                })}
              </div>
              {stats.uniqueSpecies > 0 && (
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.65rem', color: '#6a6764', marginTop: 10, textAlign: 'center' }}>
                  {stats.uniqueSpecies.toLocaleString()} species caught
                  {stats.highestPerfectStreak > 0 ? ` · ${stats.highestPerfectStreak}× best streak` : ''}
                </p>
              )}
            </div>
          )}

        </div>

        {/* ── RIGHT: Expedition — ship + crew + voyages ── */}
        <div className="flex flex-col" style={{ gap: 28 }}>

          {/* Ship Hero */}
          <div style={{
            background: `radial-gradient(ellipse at 50% 65%, ${ship.color}1c 0%, transparent 68%)`,
            border: `1px solid ${ship.color}20`,
            borderRadius: 20,
            padding: '24px 16px 16px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <img
              src={ship.imageUrl}
              alt={ship.name}
              style={{
                width: 200, height: 155,
                objectFit: 'contain',
                filter: shipSkin
                  ? shipSkin.filter
                  : `drop-shadow(0 4px 28px ${ship.color}60)`,
              }}
            />
            <div style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: ship.color, lineHeight: 1.2 }}>
                {gear.shipName ?? ship.name}
              </p>
              <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: ship.color + '70', marginTop: 5 }}>
                {ship.name}
              </p>
              {expLevel > 0 && (
                <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: '#60a5fa', marginTop: 5 }}>
                  {expTitle} · Lv {expLevel}
                </p>
              )}
              {shipSkin && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '0.25rem 0.65rem', borderRadius: '2rem', background: shipSkin.color + '18', border: `1px solid ${shipSkin.color}40` }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill={shipSkin.color} stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: shipSkin.color }}>
                    {shipSkin.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Crew */}
          {(variants.length > 0 || stats.packsOpened > 0) && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <SectionLabel>Crew</SectionLabel>
                {stats.packsOpened > 0 && (
                  <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#6a6764', marginBottom: 14 }}>
                    {stats.packsOpened.toLocaleString()} packs opened
                  </p>
                )}
              </div>
              {variants.length > 0 && <CrewCarousel variants={variants} />}
            </div>
          )}

          {/* Voyages */}
          {voyages && voyages.length > 0 && (
            <div>
              <SectionLabel>Voyages</SectionLabel>
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
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12, overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => setExpandedVoyage(isExpanded ? null : v.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '0.95rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0ede8' }}>
                              {routeConfig?.name ?? v.route}
                            </p>
                            {crewLostCount > 0 && (
                              <span style={{
                                fontSize: '0.6rem', padding: '0.15rem 0.45rem', borderRadius: '2rem',
                                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
                                color: '#f87171', fontFamily: 'var(--font-karla)', fontWeight: 700,
                                textTransform: 'uppercase' as const, letterSpacing: '0.1em',
                              }}>
                                {crewLostCount} lost
                              </span>
                            )}
                          </div>
                          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#7a7572', marginTop: 4 }}>
                            {date}
                            {v.total_doubloons > 0 ? ` · +${v.total_doubloons.toLocaleString()} ⟡` : ''}
                            {v.total_gems > 0 ? ` · +${v.total_gems} gems` : ''}
                          </p>
                          {preview && !isExpanded && (
                            <p className="font-karla" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.32)', marginTop: 5, lineHeight: 1.55 }}>
                              {preview}
                            </p>
                          )}
                        </div>
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.5" strokeLinecap="round"
                          style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                        >
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </button>

                      {isExpanded && v.captains_log && (
                        <div style={{ padding: '0 1rem 1rem', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: 'rgba(180,120,30,0.6)', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>
                            Captain&apos;s Log
                          </p>
                          <p className="font-karla" style={{ fontSize: '0.75rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
                            {v.captains_log}
                          </p>
                        </div>
                      )}

                      {isExpanded && !v.captains_log && (
                        <div style={{ padding: '0.5rem 1rem 1rem', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                          <p className="font-karla" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: '#6a6764' }}>Log not yet written.</p>
                        </div>
                      )}
                    </div>
                  )
                })}

                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllVoyages(v => !v)}
                    style={{
                      background: 'none', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10,
                      padding: '0.7rem', cursor: 'pointer', width: '100%',
                      color: '#7a7572', fontFamily: 'var(--font-karla)', fontWeight: 700,
                      fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}
                  >
                    {showAllVoyages ? 'Show less' : `Show ${hiddenCount} more voyage${hiddenCount !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
