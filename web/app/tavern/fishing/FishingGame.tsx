'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { castLine, reelIn, sellFish, awardPerfectChallengeGem, type FishSpecies, type FishingBountyCompletion } from './actions'
import { equipRod } from '@/app/marketplace/tackle-shop/actions'
import { buildFishZones, FISH_DIFFICULTY_SPEED, ZONE_DIFFICULTY, CATCH_CENTER, type ZoneDef, type ZoneType } from './depths'
import { getXPProgress, getLevelFromXP, levelCatchBonus, MAX_LEVEL } from '@/lib/fishingLevel'
import { getHook, HOOKS } from '@/lib/hooks'
import { getRod, RODS } from '@/lib/rods'
import { getReel, REELS } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS, getBait } from '@/lib/bait'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'casting' | 'hooked' | 'catching' | 'reeling' | 'result'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

// ─── Wait time mechanics ──────────────────────────────────────────────────────


// ─── Constants ────────────────────────────────────────────────────────────────

const CX = 110, CY = 110
const OUTER_R = 96, INNER_R = 66
const GAP = 1.0

const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#60a5fa',
  open_waters: '#34d399',
  deep:        '#a78bfa',
  abyss:       '#f87171',
}
const HABITAT_LABEL: Record<string, string> = {
  shallows:    'Shallows',
  open_waters: 'Open Waters',
  deep:        'Deep',
  abyss:       'Abyss',
}
const HABITAT_TAGLINE: Record<string, string> = {
  shallows:    'Clear water, gentle currents',
  open_waters: 'Wide open sea',
  deep:        'Cold and dark below',
  abyss:       'The unknown depths',
}
// Background art — place images in public/fishing/
const ZONE_BG: Record<string, string> = {
  shallows:    '/fishing/shallows.jpg',
  open_waters: '/fishing/open-waters.jpg',
  deep:        '/fishing/deep.jpg',
  abyss:       '/fishing/abyss.jpg',
}

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
type ZoneKey = typeof ZONES[number]

const RARITY: Record<number, { label: string; color: string; hookedText: string }> = {
  1: { label: 'Common',    color: '#94a3b8', hookedText: "Something's on the line…" },
  2: { label: 'Uncommon',  color: '#4ade80', hookedText: "You've got a bite!" },
  3: { label: 'Rare',      color: '#60a5fa', hookedText: "Something strong is pulling!" },
  4: { label: 'Epic',      color: '#c084fc', hookedText: "A big one! Hold tight!" },
  5: { label: 'Legendary', color: '#f59e0b', hookedText: "SOMETHING MASSIVE IS ON THE LINE!" },
}

// ─── Onboarding tour ─────────────────────────────────────────────────────────

type TourStep = {
  title: string
  body: string
  cardStyle: React.CSSProperties
  maxWidth?: number | string
  arrowDir: 'up' | 'down'
  arrowAlign: 'left' | 'center' | 'right'
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Fishing XP',
    body: 'Every catch earns XP. Level up to unlock deeper zones with rarer fish.',
    cardStyle: { top: 96, left: 16, right: 16 },
    arrowDir: 'up', arrowAlign: 'center',
  },
  {
    title: 'Collection',
    body: "Every species you've caught lives here. Tap any fish to see its scientific name, fun fact, and sell value.",
    cardStyle: { top: 56, right: 16 },
    maxWidth: 210,
    arrowDir: 'up', arrowAlign: 'right',
  },
  {
    title: 'Gear',
    body: 'Switch bait and upgrade your rod, reel, hook, and line. Better gear means faster bites and an easier catch.',
    cardStyle: { bottom: 112, left: 16 },
    maxWidth: 210,
    arrowDir: 'down', arrowAlign: 'left',
  },
  {
    title: 'Fish Hold',
    body: 'Caught fish wait here. Sell them for doubloons whenever you like — no need to leave the zone.',
    cardStyle: { bottom: 112, right: 16 },
    maxWidth: 210,
    arrowDir: 'down', arrowAlign: 'right',
  },
]

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function polar(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function arcPath(startDeg: number, endDeg: number): string {
  const s0 = startDeg + GAP, e0 = endDeg - GAP
  const span = e0 - s0
  if (span <= 0) return ''
  const la = span > 180 ? 1 : 0
  const p1 = polar(OUTER_R, s0), p2 = polar(OUTER_R, e0)
  const p3 = polar(INNER_R, e0), p4 = polar(INNER_R, s0)
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${la} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${la} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function getZone(zones: ZoneDef[], deg: number, rotation = 0): ZoneDef {
  const a = (((deg - rotation) % 360) + 360) % 360
  return zones.find(z => a >= z.from && a < z.to) ?? zones[0]
}

// ─── DialSVG ─────────────────────────────────────────────────────────────────

function DialSVG({
  zones, angle, rotation = 0, needleColor, zoneOpacityFn,
}: {
  zones: ZoneDef[]
  angle: number
  rotation?: number
  needleColor: string
  zoneOpacityFn: (z: ZoneDef) => number
}) {
  const needleTipY  = CY - (INNER_R - 8)
  const perfectZone = zones.find(z => z.type === 'perfect')
  const penaltyZones = zones.filter(z => z.type === 'penalty')

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto' }}>
      <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
        <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <g transform={`rotate(${rotation}, ${CX}, ${CY})`}>
          {zones.map((zone, i) => (
            <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color}
              fillOpacity={zoneOpacityFn(zone)} style={{ transition: 'fill-opacity 0.08s' }} />
          ))}
          {perfectZone && (() => {
            const midDeg = (perfectZone.from + perfectZone.to) / 2
            const haloSpan = 14
            const haloFrom = midDeg - haloSpan / 2
            const haloTo   = midDeg + haloSpan / 2

            // Halo arc: wide soft gold glow behind the zone
            const hRad = OUTER_R + 1
            const hLa = 0
            const hS = polar(hRad, haloFrom), hE = polar(hRad, haloTo)
            const haloArcD = `M ${hS.x.toFixed(2)} ${hS.y.toFixed(2)} A ${hRad} ${hRad} 0 ${hLa} 1 ${hE.x.toFixed(2)} ${hE.y.toFixed(2)}`

            // Outer glow stroke arc along top edge of zone
            const gRad = OUTER_R + 3
            const gS = polar(gRad, perfectZone.from + GAP), gE = polar(gRad, perfectZone.to - GAP)
            const glowArcD = `M ${gS.x.toFixed(2)} ${gS.y.toFixed(2)} A ${gRad} ${gRad} 0 0 1 ${gE.x.toFixed(2)} ${gE.y.toFixed(2)}`

            // Bracket tick marks at edges, pointing inward toward the needle
            const tickOuter = INNER_R - 2, tickInner = INNER_R - 10
            const tL0 = polar(tickOuter, perfectZone.from), tL1 = polar(tickInner, perfectZone.from)
            const tR0 = polar(tickOuter, perfectZone.to),   tR1 = polar(tickInner, perfectZone.to)

            // Star label
            const star = polar(OUTER_R + 16, midDeg)

            return (
              <>
                {/* Wide soft halo */}
                <path d={haloArcD} fill="none" stroke="#fde68a" strokeWidth="12" strokeOpacity="0.12" strokeLinecap="round" />
                {/* Bright outer glow arc */}
                <path d={glowArcD} fill="none" stroke="#fde68a" strokeWidth="2.5" strokeOpacity="0.9" strokeLinecap="round" />
                {/* Bracket ticks */}
                <line x1={tL0.x.toFixed(2)} y1={tL0.y.toFixed(2)} x2={tL1.x.toFixed(2)} y2={tL1.y.toFixed(2)} stroke="#fde68a" strokeWidth="1.5" strokeOpacity="0.9" />
                <line x1={tR0.x.toFixed(2)} y1={tR0.y.toFixed(2)} x2={tR1.x.toFixed(2)} y2={tR1.y.toFixed(2)} stroke="#fde68a" strokeWidth="1.5" strokeOpacity="0.9" />
                {/* Pulsing star */}
                <motion.text
                  x={star.x.toFixed(2)} y={star.y.toFixed(2)}
                  textAnchor="middle" dominantBaseline="central"
                  fill="#fde68a" fontSize="12"
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >✦</motion.text>
              </>
            )
          })()}
          {penaltyZones.map((pz, i) => {
            const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
            return <text key={i} x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.85">✕</text>
          })}
        </g>
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(6,14,22,0.97)" />
        <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={needleColor} strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={CX} cy={needleTipY} r="5" fill={needleColor} />
        </g>
        <circle cx={CX} cy={CY} r="8" fill="rgba(10,10,10,0.9)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

// ─── UnifiedGearDrawer ───────────────────────────────────────────────────────

function StatPill({ label, color, muted }: { label: string; color?: string; muted?: boolean }) {
  const c = color ?? '#94a3b8'
  return (
    <span className="font-karla font-600" style={{
      fontSize: '0.48rem',
      color: muted ? '#4a4845' : `${c}cc`,
      background: muted ? 'rgba(255,255,255,0.04)' : `${c}14`,
      border: `1px solid ${muted ? 'rgba(255,255,255,0.08)' : c + '30'}`,
      padding: '0.1rem 0.4rem', borderRadius: '2rem',
    }}>{label}</span>
  )
}

function UnifiedGearDrawer({
  baitInventory, selectedBait, onSelectBait,
  equippedRodTier, ownedRods, onEquipRod,
  reelTier, hookTier, lineTier,
  onClose,
}: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelectBait: (type: string) => void
  equippedRodTier: number
  ownedRods: number[]
  onEquipRod: (tier: number) => void
  reelTier: number
  hookTier: number
  lineTier: number
  onClose: () => void
}) {
  const [activeSection, setActiveSection] = useState<string>('bait')

  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  const selectedBaitDef = BAITS.find(b => b.type === selectedBait)
  const dragPct = Math.round((1 - reel.needleSpeedMultiplier) * 100)
  const snagReduction = Math.round((1 - line.penaltyMultiplier) * 100)

  const sections: { key: string; label: string; subtitle: string; color: string }[] = [
    { key: 'bait', label: 'Bait',  subtitle: selectedBaitDef?.name ?? '—', color: selectedBaitDef?.color ?? '#94a3b8' },
    { key: 'rod',  label: 'Rod',   subtitle: rod.name,  color: rod.color  },
    { key: 'reel', label: 'Reel',  subtitle: reel.name, color: reel.color },
    { key: 'hook', label: 'Hook',  subtitle: hook.name, color: hook.color },
    { key: 'line', label: 'Line',  subtitle: line.name, color: line.color },
  ]

  const ownedRodDefs = RODS.filter(r => r.cost === 0 || ownedRods.includes(r.tier))

  return (
    <div className="flex flex-col gap-1.5">
      {sections.map(sec => {
        const isOpen = activeSection === sec.key
        return (
          <div key={sec.key}>
            <button
              onClick={() => setActiveSection(isOpen ? '' : sec.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.65rem 0.75rem', borderRadius: isOpen ? '10px 10px 0 0' : 10,
                background: isOpen ? `${sec.color}12` : 'rgba(4,10,18,0.72)',
                border: `1px solid ${isOpen ? sec.color + '45' : 'rgba(255,255,255,0.09)'}`,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ width: 3, height: 18, background: sec.color, borderRadius: 2, flexShrink: 0 }} />
              <p className="font-karla font-600 uppercase tracking-[0.12em]"
                style={{ fontSize: '0.48rem', color: '#6a6764', minWidth: '2.5rem' }}>{sec.label}</p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '0.78rem', color: isOpen ? sec.color : '#f0ede8', flex: 1, textAlign: 'left' }}>{sec.subtitle}</p>
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>{isOpen ? '▴' : '▾'}</span>
            </button>

            {isOpen && (
              <div style={{
                borderRadius: '0 0 10px 10px', padding: '0.75rem',
                background: 'rgba(4,10,18,0.85)',
                border: `1px solid ${sec.color}30`, borderTop: 'none',
              }}>

                {/* ── Bait ── */}
                {sec.key === 'bait' && (
                  <BaitSelector baitInventory={baitInventory} selectedBait={selectedBait} onSelect={onSelectBait} />
                )}

                {/* ── Rod ── */}
                {sec.key === 'rod' && (
                  <div className="flex flex-col gap-1.5">
                    {ownedRodDefs.map(r => {
                      const isEquipped = r.tier === equippedRodTier
                      const speedPct = Math.round((3800 - r.biteIntervalMs) / 3800 * 100)
                      const hasSpecial = r.doubleCatchChance > 0 || r.retryOnMissChance > 0 || r.snagImmune || r.perfectZoneBonus > 0 || r.rarityBonus > 0
                      return (
                        <div key={r.tier} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${r.color}12` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? r.color + '50' : 'rgba(255,255,255,0.09)'}`,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{r.name}</p>
                            <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                              {r.doubleCatchChance > 0 && <StatPill label={r.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(r.doubleCatchChance * 100)}% double catch`} color={r.color} />}
                              {r.retryOnMissChance > 0 && <StatPill label={`${Math.round(r.retryOnMissChance * 100)}% miss retry`} color={r.color} />}
                              {r.snagImmune && <StatPill label="Snag immune" color={r.color} />}
                              {r.perfectZoneBonus > 0 && <StatPill label={`Perfect zone +${r.perfectZoneBonus}°`} color={r.color} />}
                              {r.rarityBonus > 0 && <StatPill label={`+${Math.round(r.rarityBonus * 100)}% rare bias`} color={r.color} />}
                              {!hasSpecial && speedPct > 0 && <StatPill label={`${speedPct}% faster bites`} color={r.color} />}
                              {!hasSpecial && speedPct <= 0 && r.catchZoneBonus > 0 && <StatPill label={`+${r.catchZoneBonus}° catch zone`} color={r.color} />}
                              {!hasSpecial && speedPct <= 0 && r.catchZoneBonus === 0 && <StatPill label="Base rod" muted />}
                            </div>
                          </div>
                          {isEquipped
                            ? <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: r.color, whiteSpace: 'nowrap' }}>✓ Equipped</span>
                            : <button onClick={() => onEquipRod(r.tier)} className="font-karla font-700"
                                style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                  background: `${r.color}16`, border: `1px solid ${r.color}44`, color: r.color, cursor: 'pointer' }}>
                                Equip
                              </button>
                          }
                        </div>
                      )
                    })}
                    <Link href="/marketplace/tackle-shop" className="font-karla font-600 text-center block mt-1"
                      style={{ fontSize: '0.58rem', color: '#5a5956', textDecoration: 'underline' }}>
                      Buy more rods at the Tackle Shop ↗
                    </Link>
                  </div>
                )}

                {/* ── Reel ── */}
                {sec.key === 'reel' && (
                  <div className="flex flex-col gap-2">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {dragPct > 0
                        ? <StatPill label={`−${dragPct}% needle speed`} color={reel.color} />
                        : <StatPill label="Base needle speed" muted />
                      }
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.5 }}>
                      {reel.description}
                    </p>
                    {reelTier < REELS.length - 1 && (
                      <Link href="/marketplace/tackle-shop" className="font-karla font-600"
                        style={{ fontSize: '0.58rem', color: '#5a5956', textDecoration: 'underline' }}>
                        Upgrade at the Tackle Shop ↗
                      </Link>
                    )}
                  </div>
                )}

                {/* ── Hook ── */}
                {sec.key === 'hook' && (
                  <div className="flex flex-col gap-2">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {hookTier > 0
                        ? <StatPill label={`+${hookTier * 3}° catch zone`} color={hook.color} />
                        : <StatPill label="No catch zone bonus" muted />
                      }
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.5 }}>
                      {hook.description}
                    </p>
                    {hookTier < HOOKS.length - 1 && (
                      <Link href="/marketplace/tackle-shop" className="font-karla font-600"
                        style={{ fontSize: '0.58rem', color: '#5a5956', textDecoration: 'underline' }}>
                        Upgrade at the Tackle Shop ↗
                      </Link>
                    )}
                  </div>
                )}

                {/* ── Line ── */}
                {sec.key === 'line' && (
                  <div className="flex flex-col gap-2">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {snagReduction > 0
                        ? <StatPill label={`−${snagReduction}% snag zone`} color={line.color} />
                        : <StatPill label="Standard snag zones" muted />
                      }
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.5 }}>
                      {line.description}
                    </p>
                    <p className="font-karla font-300" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
                      Lines are earned by catching unique species — no purchase needed.
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── BaitSelector ─────────────────────────────────────────────────────────────

function BaitSelector({ baitInventory, selectedBait, onSelect }: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelect: (type: string) => void
}) {
  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const ownedBaits = BAITS.filter(b => (inventoryMap[b.type] ?? 0) > 0 || b.type === selectedBait)

  if (ownedBaits.length === 0) return (
    <p className="font-karla font-600 text-center py-4" style={{ fontSize: '0.68rem', color: '#4a4845' }}>
      No bait in inventory
    </p>
  )

  return (
    <div className="flex flex-col gap-1.5">
      {ownedBaits.map(bait => {
        const qty = inventoryMap[bait.type] ?? 0
        const isSelected = bait.type === selectedBait
        const c = bait.color
        return (
          <button key={bait.type}
            onClick={() => onSelect(bait.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.6rem 0.75rem', borderRadius: 12, width: '100%',
              background: isSelected ? `${c}12` : 'rgba(4,10,18,0.72)',
              border: `1px solid ${isSelected ? c + '50' : 'rgba(255,255,255,0.09)'}`,
              cursor: 'pointer', transition: 'border-color 0.12s',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, opacity: qty > 0 ? 1 : 0.3 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.75rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>
                {bait.name}
              </p>
              <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                {bait.catchZoneBonus > 0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: `${c}cc`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    +{bait.catchZoneBonus}° catch zone
                  </span>
                )}
                {bait.waitMult < 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: `${c}cc`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {Math.round((1 - bait.waitMult) * 100)}% faster bite
                  </span>
                )}
                {bait.waitMult > 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: 'rgba(248,113,113,0.8)', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {Math.round((bait.waitMult - 1) * 100)}% slower bite
                  </span>
                )}
                {!bait.catchZoneBonus && bait.waitMult === 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: '#4a4845', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    No bonus
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <p className="font-karla font-700" style={{ fontSize: '0.65rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>
                ×{qty}
              </p>
              {isSelected && (
                <p className="font-karla font-600" style={{ fontSize: '0.44rem', color: c }}>selected</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

type SceneFrame = 'windup' | 'cast1' | 'cast2' | 'fishing'

const FRAME_SRC: Record<SceneFrame, string> = {
  windup:  '/windup.jpg',
  cast1:   '/cast1.jpg',
  cast2:   '/cast2.jpeg',
  fishing: '/fishing.jpeg',
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ fish, baitSaved, isNewSpecies, isPerfect, xpGained, doubleCatch, gemEarned }: {
  fish: FishSpecies
  baitSaved: boolean
  isNewSpecies: boolean
  isPerfect: boolean
  xpGained: number
  doubleCatch?: boolean
  gemEarned?: boolean
}) {
  const habitatColor = HABITAT_COLOR[fish.habitat] ?? '#888'
  const habitatLabel = HABITAT_LABEL[fish.habitat] ?? fish.habitat
  const rarity = fish.bite_rarity ?? 1
  const r = RARITY[rarity] ?? RARITY[1]
  const isLegendary = rarity === 5
  const isEpicPlus  = rarity >= 4

  const glowShadow: Record<number, string> = {
    1: 'none',
    2: `0 0 10px ${r.color}40, 0 0 28px ${r.color}18`,
    3: `0 0 18px ${r.color}55, 0 0 44px ${r.color}25`,
    4: `0 0 26px ${r.color}65, 0 0 60px ${r.color}32`,
    5: `0 0 32px ${r.color}80, 0 0 80px ${r.color}40, 0 0 130px ${r.color}20`,
  }
  const borderOpMap: Record<number, string> = { 1: '55', 2: '70', 3: '88', 4: 'aa', 5: 'cc' }
  const cardBg = 'rgba(6,16,26,0.96)'

  return (
    <div style={{ position: 'relative' }}>

      {/* Perfect catch banner */}
      {isPerfect && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 rounded-xl"
          style={{ background: 'rgba(8,4,0,0.88)', border: '1px solid rgba(245,158,11,0.65)' }}
        >
          <span style={{ fontSize: '0.7rem', color: '#fbbf24' }}>✦</span>
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.2em]"
              style={{ fontSize: '0.72rem', color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.7)' }}>Perfect Catch</p>
            <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
              {xpGained > 0 && (
                <p className="font-karla font-700"
                  style={{ fontSize: '0.62rem', color: '#86efac' }}>
                  +{xpGained - Math.round(xpGained / 1.2)} bonus XP
                </p>
              )}
              {xpGained > 0 && (
                <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)' }}>·</span>
              )}
              <p className="font-karla font-700"
                style={{ fontSize: '0.62rem', color: baitSaved ? '#86efac' : 'rgba(255,255,255,0.3)' }}>
                {baitSaved ? 'Bait returned' : 'Bait used'}
              </p>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#fbbf24' }}>✦</span>
        </motion.div>
      )}

      {/* Gem earned banner */}
      {gemEarned && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.15 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 rounded-xl"
          style={{ background: 'rgba(0,8,12,0.88)', border: '1px solid rgba(99,226,183,0.55)' }}
        >
          <span style={{ fontSize: '0.72rem', color: '#63e2b7' }}>◆</span>
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
              style={{ fontSize: '0.72rem', color: '#63e2b7', textShadow: '0 0 10px rgba(99,226,183,0.6)' }}>
              Challenge Complete
            </p>
            <p className="font-karla font-600 mt-0.5" style={{ fontSize: '0.6rem', color: 'rgba(99,226,183,0.7)' }}>
              +1 Gem
            </p>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#63e2b7' }}>◆</span>
        </motion.div>
      )}

      {/* Double catch banner */}
      {doubleCatch && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 rounded-xl"
          style={{ background: 'rgba(4,8,0,0.88)', border: '1px solid rgba(251,191,36,0.45)' }}
        >
          <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>✦</span>
          <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
            style={{ fontSize: '0.68rem', color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.6)' }}>
            Double Catch — ×2
          </p>
          <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>✦</span>
        </motion.div>
      )}

      {/* Glow halo — sits outside overflow:hidden so it isn't clipped */}
      {rarity >= 2 && (
        <motion.div
          animate={isEpicPlus ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
          transition={isEpicPlus
            ? { duration: isLegendary ? 1.2 : 1.8, repeat: Infinity, ease: 'easeInOut' }
            : {}}
          style={{
            position: 'absolute', inset: -1, borderRadius: '1rem',
            boxShadow: glowShadow[rarity],
            pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: isLegendary ? 32 : isEpicPlus ? 24 : 16, scale: isLegendary ? 0.92 : 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: isLegendary ? 200 : 280, damping: isLegendary ? 15 : 22 }}
        className="rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${r.color}${borderOpMap[rarity] ?? '55'}`,
          background: cardBg,
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Legendary shimmer sweep */}
        {isLegendary && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 1.5, delay: 0.6, ease: 'easeOut', repeat: Infinity, repeatDelay: 3.5 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(105deg, transparent 25%, rgba(255,210,80,0.30) 50%, transparent 75%)',
            }}
          />
        )}

        {/* Header band */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ position: 'relative', zIndex: 2, background: `${r.color}28`, borderBottom: `1px solid ${r.color}45` }}>
          <div className="flex items-center gap-2">
            <span className="font-karla font-700 uppercase tracking-[0.14em]"
              style={{ fontSize: '0.55rem', color: habitatColor }}>{habitatLabel}</span>
            <span className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{
                fontSize: '0.5rem', color: r.color,
                background: `${r.color}1c`, border: `1px solid ${r.color}45`,
                padding: '0.12rem 0.45rem', borderRadius: '2rem',
              }}>
              {r.label}{rarity >= 4 ? ' ✦' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isNewSpecies && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.2 }}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{ fontSize: '0.5rem', color: '#fde68a',
                  background: 'rgba(253,230,138,0.15)', border: '1px solid rgba(253,230,138,0.4)',
                  padding: '0.15rem 0.5rem', borderRadius: '2rem' }}
              >New Species ✦</motion.span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4" style={{ position: 'relative', zIndex: 2 }}>
          <p className="font-cinzel font-700 mb-0.5" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>
            {fish.name}
          </p>
          <p className="font-karla font-300 italic mb-3" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
            {fish.scientific_name}
          </p>
          <p className="font-karla font-400 leading-relaxed" style={{ fontSize: '0.76rem', color: '#b0afa8' }}>
            {fish.fun_fact}
          </p>
          <div className="flex items-center gap-1.5 mt-3">
            <span style={{ width: 7, height: 7, borderRadius: 2, background: r.color, display: 'inline-block', flexShrink: 0 }} />
            <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
              Sells for <span style={{ color: '#f0c040' }}>{fish.sell_value.toLocaleString()} ⟡</span>
            </p>
          </div>

        </div>
      </motion.div>
    </div>
  )
}

// ─── FishInventory ────────────────────────────────────────────────────────────

function FishInventory({ inventory, onSell }: {
  inventory: InventoryItem[]
  onSell: (fishId: number, qty: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [sellError, setSellError] = useState<string | null>(null)

  if (inventory.length === 0) return null

  async function handleSell(fishId: number, qty: number) {
    setPending(fishId)
    setSellError(null)
    await onSell(fishId, qty)
    setPending(null)
  }

  const totalValue = inventory.reduce(
    (sum, item) => sum + item.fish_species.sell_value * item.quantity, 0
  )
  const totalCount = inventory.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="mt-4 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>

      {/* Header — always visible, tap to toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5"
        style={{ cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <p className="font-karla font-600 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.58rem', color: '#6a6764' }}>Fish Hold</p>
          <span className="font-karla font-600"
            style={{ fontSize: '0.55rem', color: '#4a4845',
              background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.45rem', borderRadius: '2rem' }}>
            {totalCount} fish
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#f0c040' }}>
            {totalValue.toLocaleString()} ⟡
          </p>
          <span style={{ fontSize: '0.6rem', color: '#4a4845', transition: 'transform 0.2s',
            display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </div>
      </button>

      {/* Expandable list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="hold"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-1.5 px-3 pb-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {inventory.map(item => {
                const fish     = item.fish_species
                const hColor   = HABITAT_COLOR[fish.habitat] ?? '#888'
                const isPending = pending === item.fish_id

                return (
                  <div key={item.fish_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl mt-1.5"
                    style={{ background: `${hColor}0a`, border: `1px solid ${hColor}20` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-cinzel font-700 truncate"
                          style={{ fontSize: '0.75rem', color: '#f0ede8' }}>{fish.name}</p>
                        <span className="font-karla font-600 shrink-0"
                          style={{ fontSize: '0.52rem', color: hColor,
                            background: `${hColor}18`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                          ×{item.quantity}
                        </span>
                      </div>
                      <p className="font-karla font-600 mt-0.5"
                        style={{ fontSize: '0.58rem', color: '#f0c040' }}>
                        {fish.sell_value.toLocaleString()} ⟡ each
                        {item.quantity > 1 && (
                          <span style={{ color: '#6a6764' }}> · {(fish.sell_value * item.quantity).toLocaleString()} ⟡</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {item.quantity > 1 && (
                        <button onClick={() => handleSell(item.fish_id, item.quantity)} disabled={isPending}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{ fontSize: '0.5rem', padding: '0.28rem 0.55rem', borderRadius: '0.5rem',
                            background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.22)',
                            color: '#f0c040', opacity: isPending ? 0.5 : 1, cursor: isPending ? 'default' : 'pointer' }}>
                          Sell all
                        </button>
                      )}
                      <button onClick={() => handleSell(item.fish_id, 1)} disabled={isPending}
                        className="font-karla font-700 uppercase tracking-[0.1em]"
                        style={{ fontSize: '0.5rem', padding: '0.28rem 0.55rem', borderRadius: '0.5rem',
                          background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.35)',
                          color: '#f0c040', opacity: isPending ? 0.5 : 1, cursor: isPending ? 'default' : 'pointer' }}>
                        {isPending ? '…' : 'Sell 1'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {sellError && (
                <p className="font-karla font-300 text-red-400 text-xs text-center mt-1">{sellError}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── XPBar ───────────────────────────────────────────────────────────────────

function XPBarDisplay({ xp }: { xp: number }) {
  const { level, progress, xpInLevel, xpForLevel } = getXPProgress(xp)
  const isMax = level >= MAX_LEVEL
  const fillPct = isMax ? 100 : progress * 100
  const toGo = xpForLevel - xpInLevel

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl"
      style={{ background: 'rgba(4,10,18,0.72)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <p className="font-karla font-700 shrink-0"
        style={{ fontSize: '0.72rem', color: '#60a5fa' }}>
        Lvl {level}
      </p>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
        <motion.div
          key={level}
          style={{ height: '100%', borderRadius: 3, background: isMax ? '#f0c040' : '#60a5fa' }}
          initial={{ width: '0%' }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <p className="font-karla font-600 shrink-0"
        style={{ fontSize: '0.62rem', color: isMax ? '#f0c040' : 'rgba(255,255,255,0.4)', minWidth: '5rem', textAlign: 'right' }}>
        {isMax ? 'Max level' : `${toGo} xp to go`}
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }

export default function FishingGame({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialFishingXP, initialBait, initialInventory,
  ownedRods: initialOwnedRods,
  allFishSpecies, initialCaughtFishIds,
  selectedZone: initialZone, onBack,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  ownedRods: number[]
  allFishSpecies: FishSpeciesBasic[]
  initialCaughtFishIds: number[]
  selectedZone: ZoneKey
  onBack: () => void
}) {
  const [equippedRodTier, setEquippedRodTier] = useState(rodTier)
  const [ownedRods, setOwnedRods] = useState(initialOwnedRods)
  const [caughtFishIds, setCaughtFishIds] = useState(() => new Set(initialCaughtFishIds))
  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  // Game state
  const [phase, setPhase]           = useState<Phase>('idle')
  const selectedZone = initialZone
  const [selectedBait, setSelectedBait] = useState<string>(() => {
    const first = initialBait.find(b => b.quantity > 0)
    return first?.bait_type ?? 'worm'
  })
  const [baitInventory, setBaitInventory] = useState<BaitItem[]>(initialBait)
  const [inventory, setInventory]   = useState<InventoryItem[]>(initialInventory)
  const [doubloons, setDoubloons]   = useState(initialDoubloons)
  const [holdOpen, setHoldOpen]         = useState(false)
  const [gearOpen, setGearOpen]         = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [tappedFishId, setTappedFishId] = useState<number | null>(null)
  const [showingSummary, setShowingSummary] = useState(false)
  const [sessionCatches, setSessionCatches] = useState<FishSpecies[]>([])
  const [sessionPerfects, setSessionPerfects] = useState(0)
  const [sessionNewSpecies, setSessionNewSpecies] = useState(0)
  const [sessionGems, setSessionGems] = useState(0)
  const [sellPending, setSellPending] = useState<number | null>(null)
  const [hookedFish, setHookedFish] = useState<{ fishId: number; catchDifficulty: number; biteRarity: number } | null>(null)
  const [catchResult, setCatchResult] = useState<{ fish: FishSpecies; baitSaved: boolean; isNewSpecies: boolean; isPerfect: boolean; xpGained: number; doubleCatch?: boolean; gemEarned?: boolean } | null>(null)
  const [challengeActive, setChallengeActive] = useState(false)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [bountyNotif, setBountyNotif] = useState<FishingBountyCompletion | null>(null)
  const [perfectFlash, setPerfectFlash] = useState(false)
  const [retryFlash, setRetryFlash] = useState(false)
  const [missResult, setMissResult] = useState<ZoneType | null>(null)
  const [fishingXP, setFishingXP]   = useState(initialFishingXP)
  const [xpPopup, setXpPopup]       = useState<{ value: number; id: number } | null>(null)
  const [levelUpNotif, setLevelUpNotif] = useState<number | null>(null)
  const [, startTransition]         = useTransition()

  const fishingLevel = getLevelFromXP(fishingXP)
  const levelBonus   = levelCatchBonus(fishingLevel)

  // Needle state
  const [angle, setAngle]           = useState(270)
  const [zoneRotation, setZoneRotation] = useState(0)
  const [retryKey, setRetryKey]     = useState(0)
  const angleRef        = useRef(270)
  const speedRef        = useRef(0)
  const dirRef          = useRef(1)
  const phaseRef        = useRef<Phase>('idle')
  const animRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef         = useRef(0)
  const nextChgRef      = useRef(40)
  const hookedFishRef   = useRef<{ fishId: number; catchDifficulty: number } | null>(null)
  const selectedBaitRef = useRef(selectedBait)
  const frameRefs       = useRef<Partial<Record<SceneFrame, HTMLImageElement>>>({})

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { selectedBaitRef.current = selectedBait }, [selectedBait])
  useEffect(() => { hookedFishRef.current = hookedFish }, [hookedFish])

  // Force-decode actual in-DOM img elements on mount so GPU has them compositor-ready
  useEffect(() => {
    Object.values(frameRefs.current).forEach(img => {
      if (img) img.decode().catch(() => {})
    })
  }, [])

  useEffect(() => {
    try {
      if (!localStorage.getItem('fishing_tour_done')) setTourStep(0)
    } catch {}
  }, [])

  // Scene background frame — animates during casting phase
  const [sceneFrame, setSceneFrame] = useState<SceneFrame>('fishing')
  const [castAnimDone, setCastAnimDone] = useState(false)
  useEffect(() => {
    if (phase !== 'casting') { setSceneFrame('fishing'); setCastAnimDone(false); return }
    setCastAnimDone(false)
    setSceneFrame('windup')
    const t1 = setTimeout(() => setSceneFrame('cast1'), 350)
    const t2 = setTimeout(() => setSceneFrame('cast2'), 500)
    const t3 = setTimeout(() => setSceneFrame('fishing'), 650)
    const t4 = setTimeout(() => setCastAnimDone(true), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [phase])

  // Needle animation during catching phase
  useEffect(() => {
    if (phase !== 'catching' || !hookedFish) {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      return
    }
    const diffSpeed = FISH_DIFFICULTY_SPEED[Math.max(0, Math.min(4, hookedFish.catchDifficulty - 1))]
    const zoneDiff  = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baseMin = diffSpeed.speedMin * reel.needleSpeedMultiplier
    const baseMax = diffSpeed.speedMax * reel.needleSpeedMultiplier
    const capturedZoneRotation = zoneRotation

    speedRef.current = baseMin + Math.random() * (baseMax - baseMin)
    tickRef.current = 0
    nextChgRef.current = zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))

    animRef.current = setInterval(() => {
      if (phaseRef.current !== 'catching') return
      angleRef.current = ((angleRef.current + dirRef.current * speedRef.current / 20) % 360 + 360) % 360
      tickRef.current++
      if (tickRef.current >= nextChgRef.current) {
        speedRef.current = baseMin + Math.random() * (baseMax - baseMin)
        if (Math.random() < zoneDiff.reverseChance) {
          // Only reverse near the catch zone — not while drifting through dead space
          const catchCenter = (CATCH_CENTER + capturedZoneRotation) % 360
          const needle = angleRef.current
          const dist = Math.min(Math.abs(catchCenter - needle), 360 - Math.abs(catchCenter - needle))
          if (dist <= 55) dirRef.current *= -1
        }
        nextChgRef.current = tickRef.current + zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))
      }
      setAngle(angleRef.current)
    }, 50)
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null } }
  // retryKey increments on Second Wind retry to restart animation with fresh randomization
  }, [phase, hookedFish, reel.needleSpeedMultiplier, retryKey])

  function deductBait(type: string, qty = 1) {
    setBaitInventory(prev => prev.map(b =>
      b.bait_type === type ? { ...b, quantity: Math.max(0, b.quantity - qty) } : b
    ))
  }

  function totalBait() {
    return baitInventory.reduce((s, b) => s + b.quantity, 0)
  }

  // Core cast logic — no phase guard, called from both Cast and Cast Again
  async function doCast() {
    const currentQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    if (currentQty <= 0) { setPhase('idle'); return }

    deductBait(selectedBait)
    setPhase('casting')

    const res = await castLine(selectedBait, selectedZone)

    if ('error' in res) {
      setBaitInventory(prev => prev.map(b =>
        b.bait_type === selectedBait ? { ...b, quantity: b.quantity + 1 } : b
      ))
      setPhase('idle')
      return
    }

    await new Promise(r => setTimeout(r, res.waitMs))

    setHookedFish({ fishId: res.fishId, catchDifficulty: res.catchDifficulty, biteRarity: res.biteRarity })
    setPhase('hooked')
    setTimeout(() => {
      const rot = Math.floor(Math.random() * 360)
      setZoneRotation(rot)
      angleRef.current = Math.random() * 360
      dirRef.current = 1
      setAngle(angleRef.current)
      setPhase('catching')
    }, 1600)
  }

  function advanceTour() {
    setTourStep(prev => {
      if (prev === null) return null
      if (prev >= TOUR_STEPS.length - 1) {
        try { localStorage.setItem('fishing_tour_done', '1') } catch {}
        return null
      }
      return prev + 1
    })
  }

  // Phase 1 — cast (from idle)
  async function handleCast() {
    if (phase !== 'idle') return
    await doCast()
  }

  // Phase 2 — reel in
  function handleReelIn() {
    if (phase !== 'catching' || !hookedFishRef.current) return
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }

    const zoneDiff2 = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baitBonus = getBait(selectedBaitRef.current).catchZoneBonus
    const zones = buildFishZones(hookedFishRef.current.catchDifficulty, hookTier, line.penaltyMultiplier, zoneDiff2.catchMultiplier, levelBonus + baitBonus + rod.catchZoneBonus, rod.perfectZoneBonus)
    const zone  = getZone(zones, angleRef.current, zoneRotation)

    // Snag immune: treat penalty as miss — no extra bait lost
    const effectiveZoneType = (zone.type === 'penalty' && rod.snagImmune) ? 'miss' : zone.type

    if (effectiveZoneType === 'penalty') deductBait(selectedBaitRef.current)

    const isCatch = effectiveZoneType === 'catch' || effectiveZoneType === 'perfect'

    if (!isCatch) {
      // Second Wind rod: 25% chance to retry the dial on miss or snag
      if (rod.retryOnMissChance > 0 && Math.random() < rod.retryOnMissChance) {
        // Restore the bait lost to snag before retrying
        if (effectiveZoneType === 'penalty') {
          setBaitInventory(prev => prev.map(b =>
            b.bait_type === selectedBaitRef.current ? { ...b, quantity: b.quantity + 1 } : b
          ))
        }
        setRetryFlash(true)
        setTimeout(() => setRetryFlash(false), 1200)
        const rot = Math.floor(Math.random() * 360)
        setZoneRotation(rot)
        angleRef.current = Math.random() * 360
        dirRef.current = 1
        setAngle(angleRef.current)
        setRetryKey(k => k + 1)
        return
      }

      // Miss/penalty: challenge fails
      setChallengeActive(false)
      setMissResult(effectiveZoneType)
      setCatchResult(null)
      phaseRef.current = 'result'
      setPhase('result')
      startTransition(async () => {
        await reelIn(hookedFishRef.current!.fishId, effectiveZoneType as 'miss' | 'penalty', selectedBaitRef.current)
      })
      return
    }

    // Catch/perfect: freeze needle, wait for server before showing result
    const wasPerfect = zone.type === 'perfect'
    if (wasPerfect) setPerfectFlash(true)

    // Challenge mechanic: non-perfect catch clears the challenge without reward
    const wonChallenge = wasPerfect && challengeActive
    const triggerChallenge = wasPerfect && !challengeActive && Math.random() < 0.10
    if (!wasPerfect) setChallengeActive(false)

    phaseRef.current = 'reeling'
    setPhase('reeling')

    // Twin-Strike rod: 25% chance to catch 2 fish
    const doubleCatch = rod.doubleCatchChance > 0 && Math.random() < rod.doubleCatchChance

    startTransition(async () => {
      const res = await reelIn(hookedFishRef.current!.fishId, zone.type as 'perfect' | 'catch', selectedBaitRef.current, doubleCatch)

      if (wonChallenge) {
        await awardPerfectChallengeGem()
        setChallengeActive(false)
      } else if (triggerChallenge) {
        setChallengeActive(true)
      }

      if ('error' in res || !res.caught) {
        setMissResult('miss')
      } else {
        const { fish, baitSaved, isNewSpecies, bountyCompletion, xpGained, newXP } = res
        setCatchResult({ fish, baitSaved, isNewSpecies, isPerfect: wasPerfect, xpGained, doubleCatch, gemEarned: wonChallenge })
        if (isNewSpecies) setCaughtFishIds(prev => new Set([...prev, fish.id]))
        const newCatches = [...sessionCatches, ...(doubleCatch ? [fish, fish] : [fish])]
        const newPerfects = sessionPerfects + (wasPerfect ? 1 : 0)
        const newNewSpecies = sessionNewSpecies + (isNewSpecies ? 1 : 0)
        const newGems = sessionGems + (wonChallenge ? 1 : 0)
        setSessionCatches(newCatches)
        if (wasPerfect) setSessionPerfects(newPerfects)
        if (isNewSpecies) setSessionNewSpecies(newNewSpecies)
        if (wonChallenge) setSessionGems(newGems)

        // Persist session to localStorage so Nav-away still surfaces a last session card
        try {
          const bestCatch = newCatches.reduce<FishSpecies | null>((b, f) => (!b || f.bite_rarity > b.bite_rarity) ? f : b, null)
          const rarityCounts: Record<number, number> = {}
          newCatches.forEach(f => { rarityCounts[f.bite_rarity] = (rarityCounts[f.bite_rarity] ?? 0) + 1 })
          localStorage.setItem('fishing_last_session', JSON.stringify({
            zone: selectedZone,
            totalCaught: newCatches.length,
            xpGained: newXP - initialFishingXP,
            perfects: newPerfects,
            newSpecies: newNewSpecies,
            gems: newGems,
            bestCatch: bestCatch ? { name: bestCatch.name, bite_rarity: bestCatch.bite_rarity, scientific_name: bestCatch.scientific_name } : null,
            rarityCounts,
          }))
        } catch {}

        if (bountyCompletion) setBountyNotif(bountyCompletion)
        const oldLevel = getLevelFromXP(fishingXP)
        const newLevel = getLevelFromXP(newXP)
        setFishingXP(newXP)
        setXpPopup({ value: xpGained, id: Date.now() })
        if (newLevel > oldLevel) setLevelUpNotif(newLevel)
        setInventory(prev => {
          const existing = prev.find(i => i.fish_id === fish.id)
          const addQty = doubleCatch ? 2 : 1
          if (existing) return prev.map(i => i.fish_id === fish.id ? { ...i, quantity: i.quantity + addQty } : i)
          return [...prev, { fish_id: fish.id, quantity: addQty, fish_species: fish }]
        })
        if (baitSaved) {
          setBaitInventory(prev => prev.map(b =>
            b.bait_type === selectedBaitRef.current ? { ...b, quantity: b.quantity + 1 } : b
          ))
        }
      }

      phaseRef.current = 'result'
      setPhase('result')
    })
  }

  async function handleSell(fishId: number, qty: number) {
    setSellPending(fishId)
    const res = await sellFish(fishId, qty)
    setSellPending(null)
    if ('error' in res) return
    setDoubloons(res.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    setInventory(prev => prev
      .map(i => i.fish_id === fishId ? { ...i, quantity: i.quantity - qty } : i)
      .filter(i => i.quantity > 0)
    )
  }

  async function handleCastAgain() {
    setCatchResult(null)
    setMissResult(null)
    setHookedFish(null)
    setPerfectFlash(false)
    setBountyNotif(null)
    setLevelUpNotif(null)
    setHoldOpen(false)
    setGearOpen(false)
    await doCast()
  }

  async function handleEquipRod(tier: number) {
    const result = await equipRod(tier)
    if (!('error' in result)) {
      setEquippedRodTier(tier)
      if (!ownedRods.includes(tier)) setOwnedRods(prev => [...prev, tier])
    }
  }

  // Zone display helpers
  const catchingZones = hookedFish ? buildFishZones(hookedFish.catchDifficulty, hookTier, line.penaltyMultiplier, (ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows).catchMultiplier, levelBonus + getBait(selectedBait).catchZoneBonus + rod.catchZoneBonus, rod.perfectZoneBonus) : []
  const currentZone   = (phase === 'catching' || phase === 'reeling') ? getZone(catchingZones, angle, zoneRotation) : null

  function needleColor(): string {
    if ((phase === 'catching' || phase === 'reeling') && currentZone) return currentZone.color
    return 'rgba(255,255,255,0.3)'
  }

  function zoneOpacity(zone: ZoneDef): number {
    if (phase === 'catching' && currentZone) {
      return currentZone === zone ? 0.95 : zone.type === 'perfect' ? 0.88 : zone.type === 'penalty' ? 0.48 : 0.30
    }
    return 0.35
  }

  const hasBait = totalBait() > 0
  const selectedBaitQty  = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
  const selectedBaitDef  = BAITS.find(b => b.type === selectedBait)
  const holdTotalCount   = inventory.reduce((s, i) => s + i.quantity, 0)
  const holdTotalValue   = inventory.reduce((s, i) => s + i.fish_species.sell_value * i.quantity, 0)

  const isBobbing = sceneFrame === 'fishing' && (phase === 'casting' || phase === 'hooked')

  const hookedRarity = hookedFish?.biteRarity ?? 1
  const bgBobAnimate = !isBobbing
    ? { x: 0, y: 0 }
    : phase !== 'hooked'
      ? { x: 0, y: [0, -6, 0] }
      : hookedRarity >= 5 ? { x: [0, -8, 8, -6, 6, -3, 0], y: [0, 15, -4, 13, -1, 0] }
      : hookedRarity >= 4 ? { x: [0, -4, 4, -2, 0],         y: [0, 11, -1, 9, 0] }
      : hookedRarity >= 3 ? { x: 0,                          y: [0, 8, 0] }
      : hookedRarity >= 2 ? { x: 0,                          y: [0, 5, 0] }
      :                     { x: 0,                          y: [0, 3, 0] }
  const bgBobTransition = !isBobbing
    ? { duration: 0.12 }
    : phase !== 'hooked'
      ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }
      : {
          duration: hookedRarity >= 5 ? 0.32 : hookedRarity >= 4 ? 0.40 : hookedRarity >= 3 ? 0.50 : hookedRarity >= 2 ? 0.60 : 0.72,
          repeat: Infinity, ease: 'easeInOut' as const,
        }

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0" style={{ background: '#08121c', zIndex: 40, display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full max-w-md overflow-hidden" style={{ height: '100%' }}>

        {/* Background layers — img tags force eager loading so no black-frame on switch */}
        <motion.div
          animate={bgBobAnimate}
          transition={bgBobTransition}
          style={{ position: 'absolute', inset: '-14px' }}
        >
          {(Object.keys(FRAME_SRC) as SceneFrame[]).map(frame => (
            <img
              key={frame}
              ref={el => { if (el) frameRefs.current[frame] = el }}
              src={FRAME_SRC[frame]}
              alt=""
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: 'top center',
                zIndex: sceneFrame === frame ? 1 : 0,
              }}
            />
          ))}
        </motion.div>


        {/* UI content — fills full height as flex column */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', paddingBottom: '1.25rem' }}>

          {/* Header row — back button left, gear button right */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => sessionCatches.length > 0 ? setShowingSummary(true) : onBack()}
              className="font-karla font-600 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.6rem', color: HABITAT_COLOR[selectedZone],
                background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                borderRadius: 8, padding: '0.3rem 0.65rem',
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              ← {HABITAT_LABEL[selectedZone]}
            </button>
            <button
              onClick={() => { setCollectionOpen(o => !o); setGearOpen(false); setHoldOpen(false) }}
              className="font-karla font-600 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.6rem', color: HABITAT_COLOR[selectedZone],
                background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                borderRadius: 8, padding: '0.3rem 0.65rem',
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              Collection
            </button>
          </div>

          {/* XP bar */}
          <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
            <XPBarDisplay xp={fishingXP} />
            <AnimatePresence>
              {xpPopup && (
                <motion.p
                  key={xpPopup.id}
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], y: -18 }}
                  transition={{ duration: 2.0, times: [0, 0.1, 0.6, 1], ease: 'easeOut' }}
                  onAnimationComplete={() => setXpPopup(null)}
                  className="font-karla font-700"
                  style={{
                    position: 'absolute', right: 8, top: 0,
                    fontSize: '0.8rem', color: '#4ade80',
                    pointerEvents: 'none',
                    textShadow: '0 0 10px rgba(74,222,128,0.7)',
                  }}
                >
                  +{xpPopup.value} XP
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Phase content — grows to fill available space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait">

              {/* ── IDLE / CASTING / HOOKED — single persistent element, updates in place ── */}
              {(phase === 'idle' || phase === 'casting' || phase === 'hooked') && (
                <motion.div key="pre-catch"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>


                  {/* Status pill — centred in the dial space, each state animates independently */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AnimatePresence mode="wait">

                      {phase === 'casting' && castAnimDone && (
                        <motion.div key="waiting-pill"
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
                          style={{
                            background: 'rgba(4,10,18,0.52)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 16,
                            padding: '1.1rem 1.75rem',
                            textAlign: 'center',
                          }}>
                          <p className="font-karla font-600" style={{ fontSize: '1rem', color: '#e8e4de' }}>
                            {selectedZone === 'abyss'       ? 'Something stirs in the deep…' :
                             selectedZone === 'deep'        ? 'Waiting in the dark…' :
                             selectedZone === 'open_waters' ? 'Drifting on the open sea…' :
                                                              'Waiting for a bite…'}
                          </p>
                        </motion.div>
                      )}

                      {phase === 'hooked' && hookedFish && (() => {
                        const r = RARITY[hookedFish.biteRarity] ?? RARITY[1]
                        const isLegendary = hookedFish.biteRarity === 5
                        const isEpicPlus  = hookedFish.biteRarity >= 4
                        return (
                          <motion.div key="hooked-pill"
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                            style={{
                              background: 'rgba(4,10,18,0.52)',
                              border: `1px solid ${r.color}40`,
                              borderRadius: 16,
                              padding: '1.1rem 1.75rem',
                              textAlign: 'center',
                              boxShadow: `0 0 32px ${r.color}28`,
                            }}
                          >
                            <motion.p
                              className="font-karla font-700"
                              animate={isLegendary
                                ? { scale: [1, 1.04, 1], opacity: [1, 0.82, 1] }
                                : isEpicPlus ? { opacity: [1, 0.85, 1] } : {}
                              }
                              transition={isLegendary || isEpicPlus
                                ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
                                : {}
                              }
                              style={{
                                fontSize: isLegendary ? '1.1rem' : isEpicPlus ? '1rem' : '0.95rem',
                                color: r.color,
                                textShadow: `0 0 20px ${r.color}80`,
                                letterSpacing: isLegendary ? '0.04em' : 'normal',
                              }}
                            >
                              {r.hookedText}
                            </motion.p>
                          </motion.div>
                        )
                      })()}

                    </AnimatePresence>
                  </div>

                </motion.div>
              )}

              {/* ── CATCHING / REELING ── */}
              {(phase === 'catching' || phase === 'reeling') && hookedFish && (
                <motion.div key="catching"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  <div style={{ minHeight: '1.6rem' }}>
                    {(phase === 'reeling' || currentZone) && (
                      <div style={{
                        display: 'inline-block',
                        background: 'rgba(4,10,18,0.52)',
                        border: `1px solid ${currentZone?.color ?? 'rgba(255,255,255,0.08)'}35`,
                        borderRadius: 10,
                        padding: '0.3rem 0.85rem',
                      }}>
                        <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
                          style={{
                            fontSize: '0.88rem',
                            color: retryFlash ? '#fb923c' : (currentZone?.color ?? '#e8e4de'),
                            textShadow: retryFlash ? '0 0 16px rgba(251,146,60,0.7)' : currentZone ? `0 0 16px ${currentZone.color}70` : 'none',
                          }}>
                          {retryFlash ? 'Second Wind!' : phase === 'reeling' ? 'Reeling in…' : (currentZone?.label ?? '')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Double-perfect challenge taunt */}
                  {challengeActive && phase === 'catching' && (
                    <motion.p
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="font-karla font-700 text-center"
                      style={{ fontSize: '0.65rem', color: '#f59e0b', letterSpacing: '0.04em', marginBottom: 4 }}
                    >
                      I bet you can&apos;t do that again.
                    </motion.p>
                  )}

                  <DialSVG zones={catchingZones} angle={angle} rotation={zoneRotation}
                    needleColor={needleColor()} zoneOpacityFn={zoneOpacity} />
                </motion.div>
              )}

              {/* ── RESULT ── */}
              {phase === 'result' && (
                <motion.div key="result"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  {bountyNotif && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.3 }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3"
                      style={{
                        background: `${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}14`,
                        border: `1px solid ${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}45`,
                      }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '1rem' }}>🎯</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.48rem', color: HABITAT_COLOR[bountyNotif.tier] ?? '#888', marginBottom: 1 }}>
                          Weekly Bounty
                        </p>
                        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>
                          {bountyNotif.fishName} caught!
                        </p>
                        <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#a0a09a' }}>
                          +{bountyNotif.reward} ⟡{bountyNotif.packAwarded ? ' + 1 Pack' : ''} · visit Bounties to claim
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {catchResult ? (
                    <ResultCard fish={catchResult.fish} baitSaved={catchResult.baitSaved} isNewSpecies={catchResult.isNewSpecies} isPerfect={catchResult.isPerfect} xpGained={catchResult.xpGained} doubleCatch={catchResult.doubleCatch} gemEarned={catchResult.gemEarned} />
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                      <p className="font-cinzel font-700 mb-1"
                        style={{ fontSize: '1rem', color: missResult === 'penalty' ? '#f87171' : '#64748b' }}>
                        {missResult === 'penalty' ? 'Snagged!' : 'No catch'}
                      </p>
                      <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845' }}>
                        {missResult === 'penalty' ? 'Lost an extra bait on the snag.' : 'The fish slipped away.'}
                      </p>
                    </motion.div>
                  )}

                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Action button — same position every phase ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', paddingBottom: '0.75rem' }}>
            <AnimatePresence>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              {phase === 'idle' && hasBait && selectedBaitQty > 0 && (
                <motion.button key="cast" onClick={handleCast}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.45), rgba(14,116,144,0.18))',
                    border: '1px solid rgba(34,170,200,0.5)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#67d4e8', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.6), 0 0 28px rgba(14,116,144,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Cast</motion.button>
              )}
              {phase === 'idle' && (!hasBait || selectedBaitQty <= 0) && (
                <motion.div key="nobait"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center">
                  <p className="font-karla font-600 mb-2" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                    No bait
                  </p>
                  <Link href="/marketplace/tackle-shop"
                    className="font-karla font-700 uppercase tracking-[0.12em]"
                    style={{ fontSize: '0.65rem', color: '#f0c040', padding: '0.45rem 1rem', borderRadius: '2rem', border: '1px solid rgba(240,192,64,0.35)', background: 'rgba(240,192,64,0.08)' }}>
                    Buy Bait
                  </Link>
                </motion.div>
              )}
              {phase === 'catching' && (
                <motion.button key="reel"
                  onPointerDown={e => { e.preventDefault(); handleReelIn() }}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
                    border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Reel In</motion.button>
              )}
              {phase === 'reeling' && (
                <motion.div key="reeling"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#4a4845' }}>…</p>
                </motion.div>
              )}
              {phase === 'result' && (
                <motion.button key="again" onClick={handleCastAgain}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.35), rgba(14,116,144,0.12))',
                    border: '1px solid rgba(34,170,200,0.4)', cursor: 'pointer',
                    fontSize: '0.65rem', color: '#67d4e8', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(14,116,144,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Cast Again</motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* ── Bottom buttons — Bait + Fish Hold ── */}
          <div className="flex gap-3" style={{ paddingTop: '0.75rem' }}>

            {/* Gear button */}
            <button
              onClick={() => { setGearOpen(o => !o); setHoldOpen(false) }}
              style={{
                flex: 1, height: 72, borderRadius: 14,
                background: gearOpen ? `${selectedBaitDef?.color ?? '#fff'}10` : 'rgba(4,10,18,0.72)',
                border: `1px solid ${gearOpen ? (selectedBaitDef?.color ?? 'rgba(255,255,255,0.2)') + '45' : 'rgba(255,255,255,0.09)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
              }}
            >
              <p className="font-karla font-600 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.52rem', color: '#6a6764' }}>Gear</p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '0.82rem', color: selectedBaitDef?.color ?? '#f0ede8' }}>
                {selectedBaitDef?.name ?? '—'}{selectedBaitQty > 0 ? ` ×${selectedBaitQty}` : ''}
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.52rem', color: selectedBaitQty === 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                {selectedBaitQty === 0
                  ? 'No bait'
                  : selectedBaitDef?.catchZoneBonus ?? 0 > 0
                    ? `+${selectedBaitDef!.catchZoneBonus}° catch zone`
                    : (selectedBaitDef?.waitMult ?? 1) < 1.0
                      ? `${Math.round((1 - selectedBaitDef!.waitMult) * 100)}% faster bite`
                      : (selectedBaitDef?.waitMult ?? 1) > 1.0
                        ? `${Math.round((selectedBaitDef!.waitMult - 1) * 100)}% slower bite`
                        : rod.name}
              </p>
            </button>

            {/* Fish Hold button */}
            <button
              onClick={() => { setHoldOpen(o => !o); setGearOpen(false) }}
              style={{
                flex: 1, height: 72, borderRadius: 14,
                background: holdOpen ? 'rgba(240,192,64,0.08)' : 'rgba(4,10,18,0.72)',
                border: `1px solid ${holdOpen ? 'rgba(240,192,64,0.35)' : 'rgba(255,255,255,0.09)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
              }}
            >
              <p className="font-karla font-600 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.52rem', color: '#6a6764' }}>Fish Hold</p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '0.82rem', color: holdTotalCount > 0 ? '#f0ede8' : '#4a4845' }}>
                {holdTotalCount > 0 ? `Fish ×${holdTotalCount}` : 'Empty'}
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.52rem', color: holdTotalCount > 0 ? '#f0c040' : '#3a3835' }}>
                {holdTotalCount > 0 ? `${holdTotalValue.toLocaleString()} ⟡` : 'No fish yet'}
              </p>
            </button>
          </div>

        </div>

      {/* ── Onboarding tour ── */}
      <AnimatePresence>
        {tourStep !== null && !collectionOpen && !gearOpen && !holdOpen && (
          <>
            <motion.div
              key="tour-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={advanceTour}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 22, cursor: 'pointer' }}
            />
            <motion.div
              key={`tour-${tourStep}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute', zIndex: 23,
                background: '#0d1e2e',
                border: `1px solid ${HABITAT_COLOR[selectedZone]}45`,
                borderRadius: 14,
                padding: '1rem 1.1rem',
                maxWidth: TOUR_STEPS[tourStep].maxWidth ?? 'calc(100% - 2rem)',
                ...TOUR_STEPS[tourStep].cardStyle,
              }}
            >
              {/* Arrow caret */}
              {(() => {
                const step = TOUR_STEPS[tourStep]
                const color = `${HABITAT_COLOR[selectedZone]}45`
                const base: React.CSSProperties = {
                  position: 'absolute', width: 10, height: 10, background: '#0d1e2e',
                  transform: 'rotate(45deg)',
                }
                const pos: React.CSSProperties = step.arrowDir === 'up'
                  ? { top: -6, ...(step.arrowAlign === 'center' ? { left: '50%', marginLeft: -5 } : step.arrowAlign === 'right' ? { right: 22 } : { left: 22 }) }
                  : { bottom: -6, ...(step.arrowAlign === 'right' ? { right: 22 } : { left: 22 }) }
                const border: React.CSSProperties = step.arrowDir === 'up'
                  ? { borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` }
                  : { borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }
                return <div style={{ ...base, ...pos, ...border }} />
              })()}

              <p className="font-cinzel font-700 mb-1.5"
                style={{ fontSize: '0.82rem', color: HABITAT_COLOR[selectedZone] }}>
                {TOUR_STEPS[tourStep].title}
              </p>
              <p className="font-karla font-400 mb-3"
                style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                {TOUR_STEPS[tourStep].body}
              </p>
              <div className="flex items-center justify-between">
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845' }}>
                  {tourStep + 1} / {TOUR_STEPS.length}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); advanceTour() }}
                  className="font-karla font-700 uppercase tracking-[0.12em]"
                  style={{
                    fontSize: '0.68rem', cursor: 'pointer', touchAction: 'manipulation',
                    color: HABITAT_COLOR[selectedZone],
                    background: `${HABITAT_COLOR[selectedZone]}18`,
                    border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                    borderRadius: 8, padding: '0.35rem 0.85rem',
                  }}
                >
                  {tourStep === TOUR_STEPS.length - 1 ? 'Got it' : 'Next →'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Collection drawer ── */}
      <AnimatePresence>
        {collectionOpen && (
          <motion.div key="collection-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Sticky header */}
            <div className="flex items-center justify-between flex-shrink-0"
              style={{ padding: '1.25rem 1.1rem 0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.72rem', color: '#6a6764' }}>Fish Collection</p>
              <button onClick={() => { setCollectionOpen(false); setExpandedZone(null); setTappedFishId(null) }}
                style={{ color: '#4a4845', fontSize: '1.2rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: '0 1.1rem 2rem', overscrollBehavior: 'contain' }}>
            {ZONES.map(zone => {
              const zoneSpecies = allFishSpecies.filter(f => f.habitat === zone)
              const discoveredCount = zoneSpecies.filter(f => caughtFishIds.has(f.id)).length
              const zoneColor = HABITAT_COLOR[zone]
              const isExpanded = expandedZone === zone

              return (
                <div key={zone} className="mb-1">
                  <button
                    className="w-full flex items-center justify-between py-2.5"
                    onClick={() => { setExpandedZone(isExpanded ? null : zone); setTappedFishId(null) }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div style={{ width: 3, height: 16, background: zoneColor, borderRadius: 2 }} />
                      <p className="font-karla font-700 uppercase tracking-[0.14em]"
                        style={{ fontSize: '0.72rem', color: zoneColor }}>{HABITAT_LABEL[zone]}</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <p className="font-karla font-600"
                        style={{ fontSize: '0.68rem', color: discoveredCount === zoneSpecies.length ? zoneColor : '#6a6764' }}>
                        {discoveredCount} / {zoneSpecies.length} found
                      </p>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 mt-1 mb-3">
                      {zoneSpecies.map(f => {
                        const discovered = caughtFishIds.has(f.id)
                        const isTapped = tappedFishId === f.id
                        const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'

                        if (!discovered) return (
                          <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={{ background: 'rgba(4,10,18,0.35)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: rarityColor + '28', flexShrink: 0 }} />
                            <p className="font-karla font-600 flex-1"
                              style={{ fontSize: '0.75rem', color: '#3a3835', letterSpacing: '0.04em' }}>??? Undiscovered</p>
                          </div>
                        )

                        return (
                          <div key={f.id}>
                            <button
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                              style={{
                                background: isTapped ? `${rarityColor}14` : 'rgba(4,10,18,0.6)',
                                border: `1px solid ${isTapped ? rarityColor + '40' : 'rgba(255,255,255,0.06)'}`,
                                transition: 'background 0.15s, border-color 0.15s',
                              }}
                              onClick={() => setTappedFishId(isTapped ? null : f.id)}
                            >
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: rarityColor, flexShrink: 0 }} />
                              <p className="font-cinzel font-700 flex-1 truncate"
                                style={{ fontSize: '0.78rem', color: '#f0ede8' }}>{f.name}</p>
                              <span style={{ fontSize: '0.7rem', color: '#4ade80', flexShrink: 0 }}>✓</span>
                            </button>

                            {isTapped && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div className="px-3 pt-2 pb-3 mx-0.5 rounded-b-xl"
                                  style={{ background: `${rarityColor}0a`, border: `1px solid ${rarityColor}25`, borderTop: 'none' }}>
                                  <p className="font-karla font-300 italic mb-2"
                                    style={{ fontSize: '0.68rem', color: rarityColor + 'aa' }}>{f.scientific_name}</p>
                                  <p className="font-karla font-400 mb-3"
                                    style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
                                    &ldquo;{f.fun_fact}&rdquo;
                                  </p>
                                  <p className="font-cinzel font-700"
                                    style={{ fontSize: '0.72rem', color: '#f0c040' }}>{f.sell_value.toLocaleString()} ⟡</p>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Session summary overlay ── */}
      <AnimatePresence>
        {showingSummary && (() => {
          const xpGained = fishingXP - initialFishingXP
          const rarityCounts = [1,2,3,4,5].map(r => ({ rarity: r, count: sessionCatches.filter(f => f.bite_rarity === r).length })).filter(r => r.count > 0)
          const bestCatch = sessionCatches.reduce<FishSpecies | null>((best, f) => (!best || f.bite_rarity > best.bite_rarity) ? f : best, null)
          const zoneColor = HABITAT_COLOR[selectedZone]

          return (
            <motion.div key="summary"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(4,8,16,0.96)', display: 'flex', flexDirection: 'column', padding: '1.5rem 1.25rem 2rem' }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.16em] mb-1"
                style={{ fontSize: '0.65rem', color: '#6a6764' }}>Session</p>
              <p className="font-cinzel font-700 mb-6"
                style={{ fontSize: '1.3rem', color: zoneColor }}>{HABITAT_LABEL[selectedZone]}</p>

              <div className="flex flex-col gap-3 flex-1">
                {/* Fish caught */}
                <div className="px-4 py-3.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="font-karla font-600 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.6rem', color: '#6a6764' }}>Caught</p>
                  <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1.6rem', color: '#f0ede8' }}>{sessionCatches.length}</p>
                  <div className="flex gap-3 flex-wrap">
                    {rarityCounts.map(({ rarity, count }) => (
                      <div key={rarity} className="flex items-center gap-1.5">
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: RARITY[rarity]?.color ?? '#888' }} />
                        <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: RARITY[rarity]?.color ?? '#888' }}>×{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Best catch */}
                {bestCatch && (
                  <div className="px-4 py-3.5 rounded-2xl" style={{ background: `${RARITY[bestCatch.bite_rarity]?.color ?? '#888'}0d`, border: `1px solid ${RARITY[bestCatch.bite_rarity]?.color ?? '#888'}30` }}>
                    <p className="font-karla font-600 uppercase tracking-[0.12em] mb-1" style={{ fontSize: '0.6rem', color: '#6a6764' }}>Best Catch</p>
                    <div className="flex items-center gap-2">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: RARITY[bestCatch.bite_rarity]?.color ?? '#888', flexShrink: 0 }} />
                      <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8' }}>{bestCatch.name}</p>
                    </div>
                    <p className="font-karla font-300 italic mt-0.5" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>{bestCatch.scientific_name}</p>
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'XP Gained', value: `+${xpGained}` , color: '#86efac' },
                    { label: 'Perfects', value: String(sessionPerfects), color: '#fbbf24' },
                    { label: 'New Species', value: String(sessionNewSpecies), color: zoneColor },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="px-3 py-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <p className="font-cinzel font-700 mb-0.5" style={{ fontSize: '1.1rem', color }}>{value}</p>
                      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#6a6764' }}>{label}</p>
                    </div>
                  ))}
                </div>

                {sessionGems > 0 && (
                  <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl"
                    style={{ background: 'rgba(99,226,183,0.06)', border: '1px solid rgba(99,226,183,0.25)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#63e2b7' }}>◆</span>
                    <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#63e2b7' }}>
                      +{sessionGems} Gem{sessionGems > 1 ? 's' : ''} from challenge{sessionGems > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={onBack}
                className="font-karla font-700 uppercase tracking-[0.14em] w-full mt-5"
                style={{ padding: '0.9rem', borderRadius: 14, background: `${zoneColor}20`, border: `1px solid ${zoneColor}60`, color: zoneColor, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Done
              </button>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Gear drawer ── */}
      <AnimatePresence>
        {gearOpen && (
          <motion.div key="gear-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '1.25rem 1rem 2rem',
              maxHeight: '82vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Gear</p>
              <button onClick={() => setGearOpen(false)}
                style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>
            <UnifiedGearDrawer
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelectBait={setSelectedBait}
              equippedRodTier={equippedRodTier}
              ownedRods={ownedRods}
              onEquipRod={handleEquipRod}
              reelTier={reelTier}
              hookTier={hookTier}
              lineTier={lineTier}
              onClose={() => setGearOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Perfect catch flash overlay ── */}
      <AnimatePresence>
        {perfectFlash && (
          <motion.div
            key="perfect-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => {
              if (perfectFlash) setTimeout(() => setPerfectFlash(false), 1200)
            }}
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse 90% 60% at 50% 50%, rgba(245,158,11,0.32) 0%, transparent 70%)',
            }}
          >
            {/* Expanding ring burst */}
            <motion.div
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                width: 140, height: 140, borderRadius: '50%',
                border: '2px solid rgba(245,158,11,0.7)',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
            {/* Second ring, slightly delayed */}
            <motion.div
              initial={{ scale: 0.2, opacity: 0.6 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}
              style={{
                position: 'absolute',
                width: 140, height: 140, borderRadius: '50%',
                border: '1px solid rgba(253,230,138,0.5)',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />

            {/* Floating sparks */}
            {([
              { x: -55, delay: 0.08 }, { x: 55, delay: 0.12 },
              { x: -28, delay: 0.18 }, { x: 32, delay: 0.05 },
            ] as { x: number; delay: number }[]).map((s, i) => (
              <motion.span key={i}
                initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
                animate={{ opacity: [0, 1, 0], y: -70 - i * 12, x: s.x * 1.3, scale: [0, 1.2, 0.6] }}
                transition={{ duration: 1.0, delay: s.delay, ease: 'easeOut' }}
                style={{ position: 'absolute', color: '#fde68a', fontSize: '0.85rem', pointerEvents: 'none' }}
              >✦</motion.span>
            ))}

            {/* Main text */}
            <motion.div
              initial={{ scale: 0.45, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.04 }}
              style={{ textAlign: 'center', position: 'relative' }}
            >
              <p className="font-cinzel font-700 uppercase tracking-[0.28em]"
                style={{
                  fontSize: '2.1rem', color: '#f59e0b',
                  textShadow: '0 0 30px rgba(245,158,11,1), 0 0 70px rgba(245,158,11,0.6), 0 0 120px rgba(245,158,11,0.25)',
                }}>
                Perfect!
              </p>
              <motion.p
                className="font-karla font-600 uppercase tracking-[0.2em]"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.2 }}
                style={{ fontSize: '0.68rem', color: 'rgba(253,230,138,0.85)', marginTop: '0.3rem',
                  letterSpacing: '0.22em' }}>
                ✦ &nbsp; Flawless reel &nbsp; ✦
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Level-up overlay ── */}
      <AnimatePresence>
        {levelUpNotif && (
          <motion.div
            key="levelup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.25 }}
            onClick={() => setLevelUpNotif(null)}
            style={{
              position: 'absolute', inset: 0, zIndex: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(96,165,250,0.22) 0%, rgba(0,0,0,0.88) 100%)',
              cursor: 'pointer',
            }}
          >
            {/* Ring bursts */}
            {[0, 0.12, 0.24].map((delay, i) => (
              <motion.div key={i}
                initial={{ scale: 0.1, opacity: 0.85 - i * 0.2 }}
                animate={{ scale: 4.5 - i * 0.6, opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeOut', delay }}
                style={{
                  position: 'absolute',
                  width: 110, height: 110, borderRadius: '50%',
                  border: `${2 - i}px solid ${i % 2 === 0 ? 'rgba(96,165,250,0.75)' : 'rgba(240,192,64,0.6)'}`,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* Sparkles */}
            {([{ x: -60, delay: 0.08 }, { x: 60, delay: 0.14 }, { x: -30, delay: 0.22 }, { x: 35, delay: 0.06 }, { x: 0, delay: 0.18 }] as { x: number; delay: number }[]).map((s, i) => (
              <motion.span key={i}
                initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
                animate={{ opacity: [0, 1, 0], y: -80 - i * 14, x: s.x * 1.4, scale: [0, 1.4, 0.4] }}
                transition={{ duration: 1.2, delay: s.delay, ease: 'easeOut' }}
                style={{ position: 'absolute', color: i % 2 === 0 ? '#60a5fa' : '#f0c040', fontSize: '0.9rem', pointerEvents: 'none' }}
              >✦</motion.span>
            ))}

            {/* Text */}
            <motion.div
              initial={{ scale: 0.4, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.06 }}
              style={{ textAlign: 'center', position: 'relative' }}
            >
              <p className="font-cinzel font-700 uppercase tracking-[0.25em]"
                style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.4rem', textShadow: '0 0 18px rgba(255,255,255,0.95), 0 0 48px rgba(96,165,250,0.6)' }}>
                Level Up!
              </p>
              <p className="font-cinzel font-700"
                style={{
                  fontSize: '5rem', lineHeight: 1, color: '#f0c040',
                  textShadow: '0 0 40px rgba(240,192,64,1), 0 0 90px rgba(240,192,64,0.5)',
                }}>
                {levelUpNotif}
              </p>
              <motion.p
                className="font-karla font-400"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: '0.75rem' }}>
                tap to continue
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Fish Hold drawer ── */}
      <AnimatePresence>
        {holdOpen && (
          <motion.div key="hold-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '1.25rem 1rem 2rem',
              maxHeight: '72vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="font-karla font-700 uppercase tracking-[0.14em]"
                  style={{ fontSize: '0.6rem', color: '#6a6764' }}>Fish Hold</p>
                {holdTotalCount > 0 && (
                  <span className="font-karla font-600"
                    style={{ fontSize: '0.52rem', color: '#f0c040', background: 'rgba(240,192,64,0.1)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {holdTotalValue.toLocaleString()} ⟡
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {holdTotalCount > 0 && (
                  <button
                    onClick={async () => {
                      for (const item of inventory) {
                        await handleSell(item.fish_id, item.quantity)
                      }
                    }}
                    disabled={!!sellPending}
                    className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{ fontSize: '0.52rem', padding: '0.3rem 0.7rem', borderRadius: '0.5rem',
                      background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.4)',
                      color: '#f0c040', opacity: sellPending ? 0.5 : 1, cursor: sellPending ? 'default' : 'pointer' }}>
                    Sell All
                  </button>
                )}
                <button onClick={() => setHoldOpen(false)}
                  style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
              </div>
            </div>

            {inventory.length === 0 ? (
              <p className="font-karla font-300 text-center py-6" style={{ fontSize: '0.72rem', color: '#4a4845' }}>
                No fish yet. Cast a line!
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {inventory.map(item => {
                  const fish   = item.fish_species
                  const hColor = HABITAT_COLOR[fish.habitat] ?? '#888'
                  const isPend = sellPending === item.fish_id
                  return (
                    <div key={item.fish_id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${hColor}28` }}>
                      <div style={{ width: 3, alignSelf: 'stretch', background: hColor, borderRadius: 2, flexShrink: 0, opacity: 0.7 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.75rem', color: '#f0ede8' }}>{fish.name}</p>
                          <span className="font-karla font-700 shrink-0"
                            style={{ fontSize: '0.52rem', color: hColor, background: `${hColor}18`, border: `1px solid ${hColor}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                            ×{item.quantity}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#f0c040' }}>
                            {fish.sell_value.toLocaleString()} ⟡ each
                          </p>
                          {item.quantity > 1 && (
                            <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.25)' }}>
                              · {(fish.sell_value * item.quantity).toLocaleString()} ⟡ total
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {item.quantity > 1 && (
                          <button onClick={() => handleSell(item.fish_id, item.quantity)} disabled={!!isPend}
                            className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{ fontSize: '0.48rem', padding: '0.28rem 0.55rem', borderRadius: 8,
                              background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.2)',
                              color: '#f0c040', opacity: isPend ? 0.4 : 1, cursor: isPend ? 'default' : 'pointer' }}>
                            Sell all
                          </button>
                        )}
                        <button onClick={() => handleSell(item.fish_id, 1)} disabled={!!isPend}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{ fontSize: '0.48rem', padding: '0.28rem 0.55rem', borderRadius: 8,
                            background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.32)',
                            color: '#f0c040', opacity: isPend ? 0.4 : 1, cursor: isPend ? 'default' : 'pointer' }}>
                          {isPend ? '…' : 'Sell 1'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </div>
  )
}
