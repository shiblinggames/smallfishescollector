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
        style={{ background: `${color}0d`, border: `1px solid ${color}30` }}>
        <p className="font-karla font-600 uppercase tracking-[0.1em]"
          style={{ fontSize: '0.45rem', color: '#6a6764' }}>{label}</p>
        <p className="font-karla font-700 text-center leading-tight"
          style={{ fontSize: '0.56rem', color }}>{name}</p>
        {children}
      </div>
    )
  }

  function Stat({ children }: { children: React.ReactNode }) {
    return (
      <p className="font-karla font-600 text-center leading-tight"
        style={{ fontSize: '0.46rem', color: '#5a5956', marginTop: 1 }}>
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

// ─── BaitSelector ─────────────────────────────────────────────────────────────

function BaitSelector({ baitInventory, selectedBait, onSelect, rodTier }: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelect: (type: string) => void
  rodTier: number
}) {
  const rod = getRod(rodTier)
  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))

  // Owned baits — always include the currently selected one so the select value is valid
  const ownedBaits = BAITS.filter(b => (inventoryMap[b.type] ?? 0) > 0 || b.type === selectedBait)
  const selectedDef = BAITS.find(b => b.type === selectedBait)
  const selectedQty = inventoryMap[selectedBait] ?? 0
  const compatibleHabitats = selectedDef
    ? selectedDef.habitats.filter(h => rod.habitats.includes(h))
    : []

  if (ownedBaits.length === 0) return null

  return (
    <div>
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-1.5"
        style={{ fontSize: '0.58rem' }}>Bait</p>

      <div style={{ position: 'relative' }}>
        <select
          value={selectedBait}
          onChange={e => onSelect(e.target.value)}
          style={{
            width: '100%',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: selectedDef ? `${selectedDef.color}12` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${selectedDef ? selectedDef.color + '44' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 10,
            color: '#f0ede8',
            padding: '0.6rem 2.2rem 0.6rem 0.85rem',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
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
          transform: 'translateY(-50%)', color: '#6a6764',
          pointerEvents: 'none', fontSize: '0.72rem',
        }}>▾</span>
      </div>

      {selectedDef && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
            {selectedQty} remaining ·
          </span>
          <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
            Reaches:
          </span>
          {compatibleHabitats.length > 0
            ? compatibleHabitats.map((h, i) => (
                <span key={h} className="font-karla font-600"
                  style={{ fontSize: '0.58rem', color: HABITAT_COLOR[h] }}>
                  {HABITAT_LABEL[h]}{i < compatibleHabitats.length - 1 ? ',' : ''}
                </span>
              ))
            : <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#f87171' }}>
                incompatible with {rod.name}
              </span>
          }
        </div>
      )}
    </div>
  )
}

// ─── CastAnimation ────────────────────────────────────────────────────────────

function CastAnimation({ phase }: { phase: 'casting' | 'hooked' }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* Water surface */}
        <path d="M10 80 Q30 75 50 80 Q70 85 90 80 Q110 75 115 80" fill="none" stroke="rgba(96,165,250,0.3)" strokeWidth="2" />
        {/* Fishing line */}
        <line x1="60" y1="10" x2="60" y2={phase === 'hooked' ? 82 : 75}
          stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
        {/* Bobber */}
        <motion.g
          animate={phase === 'hooked'
            ? { y: 8, opacity: [1, 0.6, 1] }
            : { y: [0, -3, 0] }
          }
          transition={phase === 'hooked'
            ? { duration: 0.3, repeat: 2 }
            : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          <circle cx="60" cy="76" r="5" fill="#f87171" />
          <circle cx="60" cy="81" r="5" fill="#f0ede8" />
        </motion.g>
      </svg>
      <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#6a6764' }}>
        {phase === 'hooked' ? 'Something\'s on the line!' : 'Waiting for a bite…'}
      </p>
    </div>
  )
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ fish, baitSaved, isNewSpecies }: {
  fish: FishSpecies
  baitSaved: boolean
  isNewSpecies: boolean
}) {
  const habitatColor = HABITAT_COLOR[fish.habitat] ?? '#888'
  const habitatLabel = HABITAT_LABEL[fish.habitat] ?? fish.habitat

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${habitatColor}40`, background: 'rgba(255,255,255,0.03)' }}
    >
      {/* Header band */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ background: `${habitatColor}12`, borderBottom: `1px solid ${habitatColor}25` }}>
        <span className="font-karla font-700 uppercase tracking-[0.14em]"
          style={{ fontSize: '0.55rem', color: habitatColor }}>{habitatLabel}</span>
        <div className="flex items-center gap-2">
          {isNewSpecies && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.2 }}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{ fontSize: '0.5rem', color: '#fde68a',
                background: 'rgba(253,230,138,0.15)', border: '1px solid rgba(253,230,138,0.4)',
                padding: '0.15rem 0.5rem', borderRadius: '2rem' }}
            >
              New Species ✦
            </motion.span>
          )}
          {baitSaved && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{ fontSize: '0.5rem', color: '#4ade80',
                background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)',
                padding: '0.15rem 0.5rem', borderRadius: '2rem' }}
            >
              Bait returned ✦
            </motion.span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
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
          <span style={{ width: 7, height: 7, borderRadius: 2, background: habitatColor, display: 'inline-block', flexShrink: 0 }} />
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
            Sells for <span style={{ color: '#f0c040' }}>{fish.sell_value.toLocaleString()} ⟡</span>
          </p>
        </div>
      </div>
    </motion.div>
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
  const [selectedBait, setSelectedBait] = useState<string>(() => {
    const first = initialBait.find(b => b.quantity > 0)
    return first?.bait_type ?? 'worm'
  })
  const [baitInventory, setBaitInventory] = useState<BaitItem[]>(initialBait)
  const [inventory, setInventory]   = useState<InventoryItem[]>(initialInventory)
  const [doubloons, setDoubloons]   = useState(initialDoubloons)
  const [noBiteFlash, setNoBiteFlash] = useState(false)
  const [hookedFish, setHookedFish] = useState<{ fishId: number; catchDifficulty: number } | null>(null)
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

    deductBait(selectedBait)
    setPhase('casting')

    // Run server call and minimum wait in parallel — 2.5–5s feels like real fishing
    const waitMs = 2500 + Math.random() * 2500
    const [res] = await Promise.all([
      castLine(selectedBait),
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

    // Fish hooked — brief pause on hooked screen then go to catch phase
    setHookedFish({ fishId: res.fishId, catchDifficulty: res.catchDifficulty })
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
    const res = await sellFish(fishId, qty)
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
  const selectedBaitQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto px-4 py-2">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.3rem' }}>Drop a Line</h1>
          <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.7rem' }}>
            Fish · Catch · Sell
          </p>
        </div>
        <div className="text-right">
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0c040' }}>
            {doubloons.toLocaleString()} ⟡
          </p>
          <Link href="/tavern" className="font-karla font-600"
            style={{ fontSize: '0.62rem', color: '#4a4845' }}>← Tavern</Link>
        </div>
      </div>

      <GearBar rodTier={rodTier} reelTier={reelTier} hookTier={hookTier} lineTier={lineTier} />

      <AnimatePresence mode="wait">

        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <motion.div key="idle"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
            className="flex flex-col gap-4">

            <BaitSelector
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelect={setSelectedBait}
              rodTier={rodTier}
            />

            <AnimatePresence>
              {noBiteFlash && (
                <motion.p key="nobite"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                  className="font-karla font-600 text-center"
                  style={{ fontSize: '0.75rem', color: '#6a6764' }}>
                  No bite. Try again.
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex justify-center">
              {hasBait && selectedBaitQty > 0 ? (
                <motion.button onClick={handleCast}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.35), rgba(14,116,144,0.12))',
                    border: '1px solid rgba(34,170,200,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#67d4e8', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(14,116,144,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Cast</motion.button>
              ) : (
                <div className="text-center">
                  <p className="font-karla font-600 mb-2" style={{ fontSize: '0.75rem', color: '#6a6764' }}>
                    No bait — head to the Tackle Shop
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

            {rod.habitats.length < 4 && (
              <p className="font-karla font-600 text-center" style={{ fontSize: '0.65rem', color: '#4a4845' }}>
                {rod.name} reaches: {rod.habitats.map(h => HABITAT_LABEL[h]).join(', ')}
              </p>
            )}
          </motion.div>
        )}

        {/* ── CASTING ── */}
        {phase === 'casting' && (
          <motion.div key="casting"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <CastAnimation phase="casting" />
          </motion.div>
        )}

        {/* ── HOOKED ── */}
        {phase === 'hooked' && (
          <motion.div key="hooked"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <CastAnimation phase="hooked" />
          </motion.div>
        )}

        {/* ── CATCHING / REELING ── */}
        {(phase === 'catching' || phase === 'reeling') && hookedFish && (
          <motion.div key="catching"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="flex flex-col gap-4 items-center">

            <div style={{ minHeight: '1.6rem' }}>
              <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
                style={{ fontSize: '0.88rem', color: currentZone?.color ?? '#888' }}>
                {phase === 'reeling' ? 'Reeling in…' : (currentZone?.label ?? '')}
              </p>
            </div>

            <DialSVG
              zones={catchingZones}
              angle={angle}
              rotation={zoneRotation}
              needleColor={needleColor()}
              zoneOpacityFn={zoneOpacity}
            />

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
            className="flex flex-col gap-4">

            {catchResult ? (
              <ResultCard
                fish={catchResult.fish}
                baitSaved={catchResult.baitSaved}
                isNewSpecies={catchResult.isNewSpecies}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-6">
                <p className="font-cinzel font-700 mb-1"
                  style={{ fontSize: '1rem', color: missResult === 'penalty' ? '#f87171' : '#64748b' }}>
                  {missResult === 'penalty' ? 'Snagged!' : 'No catch'}
                </p>
                <p className="font-karla font-300"
                  style={{ fontSize: '0.72rem', color: '#4a4845' }}>
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

      {/* Fish inventory */}
      <FishInventory inventory={inventory} onSell={handleSell} />

      {hookTier < 6 && (
        <p className="font-karla font-600 text-center mt-2" style={{ fontSize: '0.65rem', color: '#4a4845' }}>
          <Link href="/marketplace/tackle-shop" style={{ color: '#5a5956', textDecoration: 'underline' }}>
            Upgrade your gear
          </Link>{' '}to reach deeper waters
        </p>
      )}
    </div>
  )
}
