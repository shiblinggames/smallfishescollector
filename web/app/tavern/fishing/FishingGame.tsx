'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { castLine, reelIn, sellFish, type FishSpecies } from './actions'
import { buildFishZones, FISH_DIFFICULTY_SPEED, type ZoneDef, type ZoneType } from './depths'
import { getHook } from '@/lib/hooks'
import { getRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS } from '@/lib/bait'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'casting' | 'hooked' | 'catching' | 'reeling' | 'result'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

// ─── Wait time mechanics ──────────────────────────────────────────────────────

const ZONE_WAIT_RANGE: Record<string, [number, number]> = {
  shallows:    [8000,  16000],
  open_waters: [15000, 28000],
  deep:        [25000, 45000],
  abyss:       [40000, 70000],
}

const BAIT_WAIT_MULT: Record<string, number> = {
  worm:   1.00,
  minnow: 0.85,
  squid:  0.75,
  chum:   0.60,
}

function castWaitMs(zone: string, baitType: string, rodTier: number): number {
  const [min, max] = ZONE_WAIT_RANGE[zone] ?? [8000, 16000]
  const baitMult = BAIT_WAIT_MULT[baitType] ?? 1.0
  const rodMult  = Math.max(0.70, 1.0 - rodTier * 0.075)
  // Floor of 5s so even best gear still feels like real fishing
  return Math.max(5000, (min + Math.random() * (max - min)) * baitMult * rodMult)
}

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
        <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        <g transform={`rotate(${rotation}, ${CX}, ${CY})`}>
          {zones.map((zone, i) => (
            <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color}
              fillOpacity={zoneOpacityFn(zone)} style={{ transition: 'fill-opacity 0.08s' }} />
          ))}
          {perfectZone && (() => {
            const mid = polar(OUTER_R + 14, (perfectZone.from + perfectZone.to) / 2)
            return <text x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={perfectZone.color} fontSize="10" opacity="0.95">✦</text>
          })()}
          {penaltyZones.map((pz, i) => {
            const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
            return <text key={i} x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.85">✕</text>
          })}
        </g>
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(8,18,28,0.82)" />
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

// ─── GearBar ─────────────────────────────────────────────────────────────────

const HABITAT_DOT_ORDER = ['shallows', 'open_waters', 'deep', 'abyss'] as const

function GearBar({ rodTier, reelTier, hookTier, lineTier }: {
  rodTier: number; reelTier: number; hookTier: number; lineTier: number
}) {
  const rod  = getRod(rodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  const dragPct       = Math.round((1 - reel.needleSpeedMultiplier) * 100)
  const snagReduction = Math.round((1 - line.penaltyMultiplier) * 100)
  // CATCH_BONUS_PER_TIER = 3 (from depths.ts) — each hook tier widens catch zone by 3°
  const catchZoneBonus = hook.tier * 3

  function Card({ label, name, color, children }: {
    label: string; name: string; color: string; children?: React.ReactNode
  }) {
    return (
      <div className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg"
        style={{ background: `${color}22`, border: `1px solid ${color}60` }}>
        <p className="font-karla font-600 uppercase tracking-[0.1em]"
          style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.45)' }}>{label}</p>
        <p className="font-karla font-700 text-center leading-tight"
          style={{ fontSize: '0.58rem', color }}>{name}</p>
        {children}
      </div>
    )
  }

  function Stat({ children }: { children: React.ReactNode }) {
    return (
      <p className="font-karla font-600 text-center leading-tight"
        style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
        {children}
      </p>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-1.5">
      <Card label="Rod" name={rod.name} color={rod.color}>
        <div className="flex gap-[3px] flex-wrap justify-center" style={{ marginTop: 3 }}>
          {HABITAT_DOT_ORDER.map(h => (
            <span key={h} style={{
              width: 5, height: 5, borderRadius: 1, display: 'inline-block',
              background: rod.habitats.includes(h) ? HABITAT_COLOR[h] : 'rgba(255,255,255,0.08)',
            }} />
          ))}
        </div>
        {rod.rollBonus > 0 && <Stat>+{rod.rollBonus} roll</Stat>}
      </Card>

      <Card label="Reel" name={reel.name} color={reel.color}>
        <Stat>{dragPct > 0 ? `−${dragPct}% needle` : 'No drag'}</Stat>
      </Card>

      <Card label="Hook" name={hook.name} color={hook.color}>
        <Stat>{hook.rollBonus > 0 ? `+${hook.rollBonus} roll` : 'No bonus'}</Stat>
        {catchZoneBonus > 0 && <Stat>+{catchZoneBonus}° catch</Stat>}
      </Card>

      <Card label="Line" name={line.name} color={line.color}>
        <Stat>{snagReduction > 0 ? `−${snagReduction}% snag` : 'Std. snag'}</Stat>
      </Card>
    </div>
  )
}

// ─── ZoneSelector ────────────────────────────────────────────────────────────

function ZoneSelector({ selectedZone, onSelect, rodTier }: {
  selectedZone: string
  onSelect: (zone: ZoneKey) => void
  rodTier: number
}) {
  const rod = getRod(rodTier)
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ZONES.map(z => {
        const accessible = rod.habitats.includes(z)
        const selected   = selectedZone === z
        const color      = HABITAT_COLOR[z]
        return (
          <button key={z}
            onClick={() => accessible && onSelect(z)}
            style={{
              padding: '0.5rem 0.25rem',
              borderRadius: 10,
              border: `1px solid ${selected ? color + '70' : accessible ? color + '28' : 'rgba(255,255,255,0.06)'}`,
              background: selected ? color + '1c' : accessible ? color + '08' : 'rgba(255,255,255,0.02)',
              opacity: accessible ? 1 : 0.38,
              cursor: accessible ? 'pointer' : 'default',
              transition: 'all 0.15s',
              boxShadow: selected ? `0 0 12px ${color}22` : 'none',
            }}
          >
            <p className="font-karla font-700 text-center leading-tight"
              style={{ fontSize: '0.6rem', color: selected ? color : accessible ? color + 'aa' : '#4a4845' }}>
              {HABITAT_LABEL[z]}
            </p>
            {!accessible && (
              <p className="font-karla font-600 text-center" style={{ fontSize: '0.44rem', color: '#3a3835', marginTop: 2 }}>
                Locked
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── BaitSelector ─────────────────────────────────────────────────────────────

function BaitSelector({ baitInventory, selectedBait, onSelect, selectedZone }: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelect: (type: string) => void
  selectedZone: string
}) {
  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))

  // Owned baits compatible with current zone — always include selected so value stays valid
  const ownedBaits = BAITS.filter(b => {
    const qty = inventoryMap[b.type] ?? 0
    const compatible = b.habitats.includes(selectedZone as ZoneKey)
    return (qty > 0 && compatible) || b.type === selectedBait
  })

  const selectedDef = BAITS.find(b => b.type === selectedBait)
  const selectedQty = inventoryMap[selectedBait] ?? 0
  const isCompatible = selectedDef?.habitats.includes(selectedZone as ZoneKey) ?? false

  if (ownedBaits.length === 0) return (
    <p className="font-karla font-600 text-center" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
      No compatible bait for this zone
    </p>
  )

  return (
    <div>
      <p className="font-karla font-600 uppercase tracking-[0.12em] mb-1.5"
        style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>Bait</p>

      <div style={{ position: 'relative' }}>
        <select
          value={selectedBait}
          onChange={e => onSelect(e.target.value)}
          style={{
            width: '100%',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: selectedDef ? `${selectedDef.color}14` : 'rgba(0,0,0,0.3)',
            border: `1px solid ${isCompatible && selectedDef ? selectedDef.color + '50' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 10,
            color: '#f0ede8',
            padding: '0.6rem 2.2rem 0.6rem 0.85rem',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
            backdropFilter: 'blur(8px)',
          }}
        >
          {ownedBaits.map(bait => {
            const qty = inventoryMap[bait.type] ?? 0
            return (
              <option key={bait.type} value={bait.type}
                style={{ background: '#1a1512', color: '#f0ede8' }}>
                {bait.name}{qty > 0 ? ` ×${qty}` : ' (none)'}
              </option>
            )
          })}
        </select>
        <span style={{
          position: 'absolute', right: '0.85rem', top: '50%',
          transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)',
          pointerEvents: 'none', fontSize: '0.72rem',
        }}>▾</span>
      </div>

      {selectedDef && (
        <p className="font-karla font-600 mt-1.5" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)' }}>
          {selectedQty} remaining
          {!isCompatible && <span style={{ color: '#f87171' }}> · incompatible with this zone</span>}
        </p>
      )}
    </div>
  )
}

type SceneFrame = 'windup' | 'cast1' | 'cast2' | 'fishing'

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ fish, baitSaved, isNewSpecies }: {
  fish: FishSpecies
  baitSaved: boolean
  isNewSpecies: boolean
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
  const borderOpMap: Record<number, string> = { 1: '30', 2: '55', 3: '70', 4: '85', 5: 'b0' }
  const cardBg: Record<number, string> = {
    1: 'rgba(255,255,255,0.03)',
    2: 'rgba(255,255,255,0.03)',
    3: `${r.color}06`,
    4: `${r.color}09`,
    5: `${r.color}0c`,
  }

  return (
    <div style={{ position: 'relative' }}>
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
          border: `1px solid ${r.color}${borderOpMap[rarity] ?? '30'}`,
          background: cardBg[rarity],
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
          style={{ position: 'relative', zIndex: 2, background: `${r.color}15`, borderBottom: `1px solid ${r.color}28` }}>
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
            {baitSaved && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{ fontSize: '0.5rem', color: '#4ade80',
                  background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)',
                  padding: '0.15rem 0.5rem', borderRadius: '2rem' }}
              >Bait returned ✦</motion.span>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FishingGame({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialBait, initialInventory,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialBait: BaitItem[]
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
}) {
  const rod  = getRod(rodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  // Game state
  const [phase, setPhase]           = useState<Phase>('idle')
  const [selectedZone, setSelectedZone] = useState<ZoneKey>(() => rod.habitats[0] as ZoneKey)
  const [selectedBait, setSelectedBait] = useState<string>(() => {
    const first = initialBait.find(b => b.quantity > 0)
    return first?.bait_type ?? 'worm'
  })
  const [baitInventory, setBaitInventory] = useState<BaitItem[]>(initialBait)
  const [inventory, setInventory]   = useState<InventoryItem[]>(initialInventory)
  const [doubloons, setDoubloons]   = useState(initialDoubloons)
  const [noBiteFlash, setNoBiteFlash] = useState(false)
  const [baitOpen, setBaitOpen]       = useState(false)
  const [holdOpen, setHoldOpen]       = useState(false)
  const [sellPending, setSellPending] = useState<number | null>(null)
  const [hookedFish, setHookedFish] = useState<{ fishId: number; catchDifficulty: number; biteRarity: number } | null>(null)
  const [catchResult, setCatchResult] = useState<{ fish: FishSpecies; baitSaved: boolean; isNewSpecies: boolean } | null>(null)
  const [missResult, setMissResult] = useState<ZoneType | null>(null)
  const [, startTransition]         = useTransition()

  // Needle state
  const [angle, setAngle]           = useState(270)
  const [zoneRotation, setZoneRotation] = useState(0)
  const angleRef        = useRef(270)
  const speedRef        = useRef(0)
  const dirRef          = useRef(1)
  const phaseRef        = useRef<Phase>('idle')
  const animRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef         = useRef(0)
  const nextChgRef      = useRef(40)
  const hookedFishRef   = useRef<{ fishId: number; catchDifficulty: number } | null>(null)
  const selectedBaitRef = useRef(selectedBait)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { selectedBaitRef.current = selectedBait }, [selectedBait])
  useEffect(() => { hookedFishRef.current = hookedFish }, [hookedFish])

  // Scene background frame — animates during casting phase
  const [sceneFrame, setSceneFrame] = useState<SceneFrame>('fishing')
  useEffect(() => {
    if (phase !== 'casting') { setSceneFrame('fishing'); return }
    setSceneFrame('windup')
    const t1 = setTimeout(() => setSceneFrame('cast1'), 350)
    const t2 = setTimeout(() => setSceneFrame('cast2'), 500)
    const t3 = setTimeout(() => setSceneFrame('fishing'), 650)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [phase])

  // When zone changes, auto-switch to a compatible bait if current one doesn't work here
  useEffect(() => {
    const def = BAITS.find(b => b.type === selectedBait)
    if (!def?.habitats.includes(selectedZone)) {
      const first = baitInventory.find(b => {
        const d = BAITS.find(x => x.type === b.bait_type)
        return b.quantity > 0 && d?.habitats.includes(selectedZone)
      })
      if (first) setSelectedBait(first.bait_type)
    }
  }, [selectedZone]) // eslint-disable-line react-hooks/exhaustive-deps

  // Needle animation during catching phase
  useEffect(() => {
    if (phase !== 'catching' || !hookedFish) {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      return
    }
    const diffSpeed = FISH_DIFFICULTY_SPEED[Math.max(0, Math.min(4, hookedFish.catchDifficulty - 1))]
    const baseMin = diffSpeed.speedMin * reel.needleSpeedMultiplier
    const baseMax = diffSpeed.speedMax * reel.needleSpeedMultiplier

    speedRef.current = baseMin + Math.random() * (baseMax - baseMin)
    tickRef.current = 0
    nextChgRef.current = diffSpeed.changeMin + Math.floor(Math.random() * (diffSpeed.changeMax - diffSpeed.changeMin))

    animRef.current = setInterval(() => {
      if (phaseRef.current !== 'catching') return
      angleRef.current = ((angleRef.current + dirRef.current * speedRef.current / 20) % 360 + 360) % 360
      tickRef.current++
      if (tickRef.current >= nextChgRef.current) {
        speedRef.current = baseMin + Math.random() * (baseMax - baseMin)
        if (Math.random() < diffSpeed.reverseChance) dirRef.current *= -1
        nextChgRef.current = tickRef.current + diffSpeed.changeMin + Math.floor(Math.random() * (diffSpeed.changeMax - diffSpeed.changeMin))
      }
      setAngle(angleRef.current)
    }, 50)
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null } }
  }, [phase, hookedFish, reel.needleSpeedMultiplier])

  function deductBait(type: string, qty = 1) {
    setBaitInventory(prev => prev.map(b =>
      b.bait_type === type ? { ...b, quantity: Math.max(0, b.quantity - qty) } : b
    ))
  }

  function totalBait() {
    return baitInventory.reduce((s, b) => s + b.quantity, 0)
  }

  // Phase 1 — cast
  async function handleCast() {
    if (phase !== 'idle') return
    const currentQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    if (currentQty <= 0) return

    setBaitOpen(false)
    deductBait(selectedBait)
    setPhase('casting')

    const waitMs = castWaitMs(selectedZone, selectedBait, rodTier)
    const [res] = await Promise.all([
      castLine(selectedBait, selectedZone),
      new Promise(r => setTimeout(r, waitMs)),
    ])

    if ('error' in res) {
      setPhase('idle')
      return
    }

    if (!res.hit) {
      setNoBiteFlash(true)
      setPhase('idle')
      setTimeout(() => setNoBiteFlash(false), 2200)
      return
    }

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

  // Phase 2 — reel in
  function handleReelIn() {
    if (phase !== 'catching' || !hookedFishRef.current) return
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }

    const zones = buildFishZones(hookedFishRef.current.catchDifficulty, hookTier, line.penaltyMultiplier)
    const zone  = getZone(zones, angleRef.current, zoneRotation)

    if (zone.type === 'penalty') deductBait(selectedBaitRef.current)

    const isCatch = zone.type === 'catch' || zone.type === 'perfect'

    if (!isCatch) {
      // Miss/penalty: show result immediately, fire server call in background
      setMissResult(zone.type)
      setCatchResult(null)
      phaseRef.current = 'result'
      setPhase('result')
      startTransition(async () => {
        await reelIn(hookedFishRef.current!.fishId, zone.type as 'miss' | 'penalty', selectedBaitRef.current)
      })
      return
    }

    // Catch/perfect: freeze needle, wait for server before showing result
    phaseRef.current = 'reeling'
    setPhase('reeling')

    startTransition(async () => {
      const res = await reelIn(hookedFishRef.current!.fishId, zone.type as 'perfect' | 'catch', selectedBaitRef.current)

      if ('error' in res || !res.caught) {
        setMissResult('miss')
      } else {
        const { fish, baitSaved, isNewSpecies } = res
        setCatchResult({ fish, baitSaved, isNewSpecies })
        setInventory(prev => {
          const existing = prev.find(i => i.fish_id === fish.id)
          if (existing) return prev.map(i => i.fish_id === fish.id ? { ...i, quantity: i.quantity + 1 } : i)
          return [...prev, { fish_id: fish.id, quantity: 1, fish_species: fish }]
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
    setInventory(prev => prev
      .map(i => i.fish_id === fishId ? { ...i, quantity: i.quantity - qty } : i)
      .filter(i => i.quantity > 0)
    )
  }

  function handleCastAgain() {
    setCatchResult(null)
    setMissResult(null)
    setHookedFish(null)
    setBaitOpen(false)
    setHoldOpen(false)
    setPhase('idle')
  }

  // Zone display helpers
  const catchingZones = hookedFish ? buildFishZones(hookedFish.catchDifficulty, hookTier, line.penaltyMultiplier) : []
  const currentZone   = (phase === 'catching' || phase === 'reeling') ? getZone(catchingZones, angle, zoneRotation) : null

  function needleColor(): string {
    if ((phase === 'catching' || phase === 'reeling') && currentZone) return currentZone.color
    return 'rgba(255,255,255,0.3)'
  }

  function zoneOpacity(zone: ZoneDef): number {
    if (phase === 'catching' && currentZone) {
      return currentZone === zone ? 0.82 : zone.type === 'perfect' ? 0.45 : zone.type === 'penalty' ? 0.32 : 0.18
    }
    return 0.22
  }

  const hasBait = totalBait() > 0
  const selectedBaitQty  = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
  const selectedBaitDef  = BAITS.find(b => b.type === selectedBait)
  const holdTotalCount   = inventory.reduce((s, i) => s + i.quantity, 0)
  const holdTotalValue   = inventory.reduce((s, i) => s + i.fish_species.sell_value * i.quantity, 0)

  const FRAME_SRC: Record<SceneFrame, string> = {
    windup:  '/windup.jpg',
    cast1:   '/cast1.jpg',
    cast2:   '/cast2.jpeg',
    fishing: '/fishing.jpeg',
  }
  const isBobbing = sceneFrame === 'fishing' && (phase === 'casting' || phase === 'hooked')

  return (
    <div className="relative max-w-md mx-auto overflow-hidden"
      style={{ minHeight: '100svh', background: '#08121c' }}>

        {/* Background layers — img tags force eager loading so no black-frame on switch */}
        <motion.div
          animate={isBobbing ? { y: phase === 'hooked' ? [0, 8, 0] : [0, -6, 0] } : { y: 0 }}
          transition={isBobbing
            ? { duration: phase === 'hooked' ? 0.5 : 2.5, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.12 }
          }
          style={{ position: 'absolute', inset: '-14px' }}
        >
          {(Object.keys(FRAME_SRC) as SceneFrame[]).map(frame => (
            <img
              key={frame}
              src={FRAME_SRC[frame]}
              alt=""
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: 'top center',
                opacity: sceneFrame === frame ? 1 : 0,
                transition: 'opacity 0.12s linear',
              }}
            />
          ))}
        </motion.div>

        {/* Gradient — light at top so the scene shows, dark at bottom for readability */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(8,18,28,0.1) 0%, rgba(8,18,28,0.45) 40%, rgba(8,18,28,0.92) 72%, rgba(8,18,28,0.98) 100%)',
        }} />

        {/* UI content — fills full height as flex column */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100svh', padding: '1rem', paddingTop: '3.5rem', paddingBottom: '1.25rem' }}>

          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <Link href="/tavern" className="font-karla font-600"
              style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>← Tavern</Link>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0c040' }}>
              {doubloons.toLocaleString()} ⟡
            </p>
          </div>

          <GearBar rodTier={rodTier} reelTier={reelTier} hookTier={hookTier} lineTier={lineTier} />

          {/* Phase content — grows to fill available space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '0.75rem' }}>
            <AnimatePresence mode="wait">

              {/* ── IDLE ── */}
              {phase === 'idle' && (
                <motion.div key="idle"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                  <ZoneSelector selectedZone={selectedZone} onSelect={setSelectedZone} rodTier={rodTier} />

                  <div>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: HABITAT_COLOR[selectedZone] }}>
                      {HABITAT_LABEL[selectedZone]}
                    </p>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)' }}>
                      {HABITAT_TAGLINE[selectedZone]}
                    </p>
                  </div>

                  <div style={{ flex: 1 }} />

                  <AnimatePresence>
                    {noBiteFlash && (
                      <motion.p key="nobite"
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                        className="font-karla font-600 text-center"
                        style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        No bite. Try again.
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <div className="flex justify-center py-2">
                    {hasBait && selectedBaitQty > 0 ? (
                      <motion.button onClick={handleCast}
                        className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                        style={{
                          width: 88, height: 88, borderRadius: '50%',
                          background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.45), rgba(14,116,144,0.18))',
                          border: '1px solid rgba(34,170,200,0.5)', cursor: 'pointer',
                          fontSize: '0.72rem', color: '#67d4e8', touchAction: 'manipulation',
                          boxShadow: '0 6px 0 rgba(0,0,0,0.6), 0 0 28px rgba(14,116,144,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
                        }}
                        whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
                        transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                      >Cast</motion.button>
                    ) : (
                      <div className="text-center">
                        <p className="font-karla font-600 mb-2" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
                          No compatible bait
                        </p>
                        <Link href="/marketplace/tackle-shop"
                          className="font-karla font-700 uppercase tracking-[0.12em]"
                          style={{
                            fontSize: '0.65rem', color: '#f0c040',
                            padding: '0.45rem 1rem', borderRadius: '2rem',
                            border: '1px solid rgba(240,192,64,0.35)',
                            background: 'rgba(240,192,64,0.08)',
                          }}>Buy Bait</Link>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── CASTING / HOOKED ── */}
              {(phase === 'casting' || phase === 'hooked') && (
                <motion.div key="waiting"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '2rem' }}>
                  {phase === 'hooked' && hookedFish ? (() => {
                    const r = RARITY[hookedFish.biteRarity] ?? RARITY[1]
                    const isLegendary = hookedFish.biteRarity === 5
                    const isEpicPlus  = hookedFish.biteRarity >= 4
                    return (
                      <motion.p
                        className="font-karla font-700 text-center px-4"
                        animate={isLegendary
                          ? { scale: [1, 1.06, 1], opacity: [1, 0.75, 1] }
                          : isEpicPlus ? { opacity: [1, 0.8, 1] } : {}
                        }
                        transition={isLegendary || isEpicPlus
                          ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
                          : {}
                        }
                        style={{
                          fontSize: isLegendary ? '1rem' : isEpicPlus ? '0.9rem' : '0.82rem',
                          color: r.color,
                          textShadow: isEpicPlus ? `0 0 20px ${r.color}80` : 'none',
                          letterSpacing: isLegendary ? '0.04em' : 'normal',
                        }}
                      >
                        {r.hookedText}
                      </motion.p>
                    )
                  })() : (
                    <p className="font-karla font-600"
                      style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)' }}>
                      {selectedZone === 'abyss'       ? 'Something stirs in the deep…' :
                       selectedZone === 'deep'        ? 'Waiting in the dark…' :
                       selectedZone === 'open_waters' ? 'Drifting on the open sea…' :
                                                        'Waiting for a bite…'}
                    </p>
                  )}
                </motion.div>
              )}

              {/* ── CATCHING / REELING ── */}
              {(phase === 'catching' || phase === 'reeling') && hookedFish && (
                <motion.div key="catching"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  <div style={{ minHeight: '1.6rem' }}>
                    <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
                      style={{ fontSize: '0.88rem', color: currentZone?.color ?? '#888' }}>
                      {phase === 'reeling' ? 'Reeling in…' : (currentZone?.label ?? '')}
                    </p>
                  </div>

                  <DialSVG zones={catchingZones} angle={angle} rotation={zoneRotation}
                    needleColor={needleColor()} zoneOpacityFn={zoneOpacity} />

                  {phase === 'catching' ? (
                    <motion.button
                      onPointerDown={e => { e.preventDefault(); handleReelIn() }}
                      className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                      style={{
                        width: 88, height: 88, borderRadius: '50%',
                        background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
                        border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
                        fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
                        boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                      }}
                      whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    >Reel In</motion.button>
                  ) : (
                    <div style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#4a4845' }}>…</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── RESULT ── */}
              {phase === 'result' && (
                <motion.div key="result"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  {catchResult ? (
                    <ResultCard fish={catchResult.fish} baitSaved={catchResult.baitSaved} isNewSpecies={catchResult.isNewSpecies} />
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

                  <div className="flex justify-center">
                    <motion.button onClick={handleCastAgain}
                      className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                      style={{
                        width: 88, height: 88, borderRadius: '50%',
                        background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.35), rgba(14,116,144,0.12))',
                        border: '1px solid rgba(34,170,200,0.4)', cursor: 'pointer',
                        fontSize: '0.65rem', color: '#67d4e8', touchAction: 'manipulation',
                        boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(14,116,144,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                      }}
                      whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    >Cast Again</motion.button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Bottom buttons — Bait + Fish Hold ── */}
          <div className="flex gap-3" style={{ paddingTop: '0.75rem' }}>

            {/* Bait button */}
            <button
              onClick={() => { setBaitOpen(o => !o); setHoldOpen(false) }}
              style={{
                flex: 1, height: 68, borderRadius: 14,
                background: baitOpen ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.45)',
                border: `1px solid ${baitOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)'}`,
                backdropFilter: 'blur(16px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
              }}
            >
              <p className="font-karla font-600 uppercase tracking-[0.12em]"
                style={{ fontSize: '0.44rem', color: '#6a6764' }}>Bait</p>
              <p className="font-karla font-700"
                style={{ fontSize: '0.75rem', color: selectedBaitDef?.color ?? '#f0ede8' }}>
                {selectedBaitDef?.name ?? '—'}
              </p>
              <p className="font-karla font-600"
                style={{ fontSize: '0.5rem', color: selectedBaitQty > 0 ? '#6a6764' : '#f87171' }}>
                ×{selectedBaitQty} remaining
              </p>
            </button>

            {/* Fish Hold button */}
            <button
              onClick={() => { setHoldOpen(o => !o); setBaitOpen(false) }}
              style={{
                flex: 1, height: 68, borderRadius: 14,
                background: holdOpen ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.45)',
                border: `1px solid ${holdOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)'}`,
                backdropFilter: 'blur(16px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
              }}
            >
              <p className="font-karla font-600 uppercase tracking-[0.12em]"
                style={{ fontSize: '0.44rem', color: '#6a6764' }}>Fish Hold</p>
              <p className="font-karla font-700"
                style={{ fontSize: '0.75rem', color: holdTotalCount > 0 ? '#f0ede8' : '#4a4845' }}>
                {holdTotalCount > 0 ? `${holdTotalCount} fish` : 'Empty'}
              </p>
              {holdTotalCount > 0 && (
                <p className="font-karla font-600" style={{ fontSize: '0.5rem', color: '#f0c040' }}>
                  {holdTotalValue.toLocaleString()} ⟡
                </p>
              )}
            </button>
          </div>

        </div>

      {/* ── Bait drawer ── */}
      <AnimatePresence>
        {baitOpen && (
          <motion.div key="bait-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '1.25rem 1rem 2rem',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Select Bait</p>
              <button onClick={() => setBaitOpen(false)}
                style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>
            <BaitSelector
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelect={(type) => { setSelectedBait(type); setBaitOpen(false) }}
              selectedZone={selectedZone}
            />
            <p className="font-karla font-600 text-center mt-4" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
              <Link href="/marketplace/tackle-shop" style={{ color: '#5a5956', textDecoration: 'underline' }}>
                Buy bait or upgrade gear
              </Link>
            </p>
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
              maxHeight: '72vh', overflowY: 'auto',
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
                      className="flex items-center gap-3 px-3 py-2 rounded-xl"
                      style={{ background: `${hColor}0a`, border: `1px solid ${hColor}20` }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.75rem', color: '#f0ede8' }}>{fish.name}</p>
                          <span className="font-karla font-600 shrink-0"
                            style={{ fontSize: '0.52rem', color: hColor, background: `${hColor}18`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                            ×{item.quantity}
                          </span>
                        </div>
                        <p className="font-karla font-600 mt-0.5" style={{ fontSize: '0.58rem', color: '#f0c040' }}>
                          {fish.sell_value.toLocaleString()} ⟡ each
                          {item.quantity > 1 && <span style={{ color: '#6a6764' }}> · {(fish.sell_value * item.quantity).toLocaleString()} ⟡</span>}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {item.quantity > 1 && (
                          <button onClick={() => handleSell(item.fish_id, item.quantity)} disabled={!!isPend}
                            className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{ fontSize: '0.5rem', padding: '0.28rem 0.55rem', borderRadius: '0.5rem',
                              background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.22)',
                              color: '#f0c040', opacity: isPend ? 0.5 : 1, cursor: isPend ? 'default' : 'pointer' }}>
                            Sell all
                          </button>
                        )}
                        <button onClick={() => handleSell(item.fish_id, 1)} disabled={!!isPend}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{ fontSize: '0.5rem', padding: '0.28rem 0.55rem', borderRadius: '0.5rem',
                            background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.35)',
                            color: '#f0c040', opacity: isPend ? 0.5 : 1, cursor: isPend ? 'default' : 'pointer' }}>
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
  )
}
