'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getHook } from '@/lib/hooks'
import { getRod, RODS } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { getShip } from '@/lib/ships'
import { RING_SKINS } from '@/lib/ringSkins'
import { SPECIAL_ITEMS } from '@/lib/specialItems'

type BaitItem = { bait_type: string; quantity: number }
type SlotKey = 'rod' | 'reel' | 'hook' | 'line' | 'bait' | 'special' | 'cosmetic'

function ShopLink({ href, label, color, onClick }: { href: string; label: string; color: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1rem', borderRadius: 20, background: `${color}12`, border: `1px solid ${color}45`, textDecoration: 'none', marginTop: 6 }}>
      <div style={{ flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color }}>{label}</p>
        <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: `${color}80`, marginTop: 2 }}>Tackle Shop</p>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75, flexShrink: 0 }}>
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </Link>
  )
}

function Pill({ label, color, muted }: { label: string; color?: string; muted?: boolean }) {
  if (muted) return (
    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>{label}</span>
  )
  return (
    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${color}cc`, background: `${color}14`, border: `1px solid ${color}30`, padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>{label}</span>
  )
}

function ReelIcon({ color }: { color: string }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <line x1="12" y1="2.5" x2="12" y2="8.5" />
      <line x1="12" y1="15.5" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="8.5" y2="12" />
      <line x1="15.5" y1="12" x2="21.5" y2="12" />
    </svg>
  )
}

function LineIcon({ color }: { color: string }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 7 Q7 4 12 7 Q17 10 21 7" />
      <path d="M3 12 Q7 9 12 12 Q17 15 21 12" />
      <path d="M3 17 Q7 14 12 17 Q17 20 21 17" />
    </svg>
  )
}

function StatCell({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
      <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginBottom: 5 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: muted ? '#2e2c2a' : (color ?? '#f0ede8'), lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function SpecialIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6l1 5.5-4 2.5-4-2.5z" />
      <path d="M8 8.5C5.5 11 4 14 4 17a8 8 0 0 0 16 0c0-3-1.5-6-4-8.5" />
    </svg>
  )
}

function CosmeticIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
    </svg>
  )
}

function BaitIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 C8 3 5 6 5 10 C5 14 8 17 12 17 C16 17 19 14 19 10 C19 6 16 3 12 3Z" />
      <path d="M12 17 L12 21" />
      <path d="M9 19.5 L15 19.5" />
      <circle cx="9" cy="9" r="1.2" fill={color} stroke="none" />
    </svg>
  )
}

function GearSlot({
  label, image, icon, itemName, color, onClick, small, empty,
}: {
  label: string
  image?: string | null
  icon?: React.ReactNode
  itemName: string
  color: string
  onClick: () => void
  small?: boolean
  empty?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        border: `1px solid ${color}40`,
        background: 'rgba(4,10,20,0.75)',
        borderRadius: 20,
        padding: small ? '0.55rem 0.4rem' : '0.65rem 0.5rem',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        transition: 'border-color 0.15s, background 0.15s',
        touchAction: 'manipulation',
      }}
    >
      <div style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {image
          ? <img src={image} alt={label} style={{ width: 36, height: 36, objectFit: 'contain', filter: `drop-shadow(0 2px 6px ${color}55)` }} />
          : icon
        }
      </div>
      <div style={{ textAlign: 'center' }}>
        <p className="font-karla font-600 uppercase" style={{ fontSize: '0.62rem', color: color + 'cc', letterSpacing: '0.14em', marginBottom: 1 }}>{label}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: empty ? '#2e2c2a' : '#d0cdc8', lineHeight: 1.2 }}>{itemName}</p>
      </div>
    </button>
  )
}

export default function GearScreen({
  baitInventory, selectedBait, onSelectBait,
  equippedRodTier, ownedRods, onEquipRod,
  reelTier, hookTier, lineTier, shipTier,
  equippedRingSkin, unlockedRingSkins, onEquipRingSkin,
  hasTideTurner, tideTurnerSkipsLeft,
  equippedSpecial, onEquipSpecial,
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
  shipTier: number
  equippedRingSkin: string
  unlockedRingSkins: string[]
  onEquipRingSkin: (skin: string) => void
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  equippedSpecial: string | null
  onEquipSpecial: (itemId: string | null) => void
  onClose: () => void
}) {
  const [openSlot, setOpenSlot] = useState<SlotKey | null>(null)

  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)
  const ship = getShip(shipTier)
  const bait = BAITS.find(b => b.type === selectedBait)

  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const ownedRodDefs = RODS.filter(r => (r.cost === 0 && !r.earnedOnly) || ownedRods.includes(r.tier))

  const dragPct    = Math.round((1 - reel.needleSpeedMultiplier) * 100)
  const snagRedPct = Math.round((1 - line.penaltyMultiplier) * 100)

  // ── Compute all active bonuses ──
  const catchZoneBonus = (hookTier * 3) + rod.catchZoneBonus + (bait?.catchZoneBonus ?? 0)

  type SpecialBonus = { label: string; color: string }
  const specialBonuses: SpecialBonus[] = []
  if (rod.doubleCatchChance > 0) specialBonuses.push({ label: rod.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(rod.doubleCatchChance * 100)}% double catch`, color: rod.color })
  if (rod.retryOnMissChance > 0) specialBonuses.push({ label: `${Math.round(rod.retryOnMissChance * 100)}% retry on miss`, color: rod.color })
  if (rod.snagImmune) specialBonuses.push({ label: 'Snag immune', color: rod.color })
  if ((rod.jackpotChance ?? 0) > 0) specialBonuses.push({ label: `${Math.round(rod.jackpotChance! * 100)}% jackpot ×${rod.jackpotMultiplier}`, color: rod.color })
  if (rod.rarityBonus > 0) specialBonuses.push({ label: `+${Math.round(rod.rarityBonus * 100)}% rare fish`, color: rod.color })
  if (bait && bait.waitMult < 1) specialBonuses.push({ label: `${Math.round((1 - bait.waitMult) * 100)}% faster bite`, color: bait.color })
  if (bait && bait.waitMult > 1) specialBonuses.push({ label: `${Math.round((bait.waitMult - 1) * 100)}% slower bite`, color: '#f87171' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>

      {/* ── Visual gear grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gridTemplateRows: 'auto auto', gap: 6 }}>

        <div style={{ gridColumn: '1', gridRow: '1' }}>
          <GearSlot label="Rod" image={rod.imageUrl ?? '/rod.png'} itemName={rod.name} color={rod.color} onClick={() => setOpenSlot('rod')} />
        </div>
        <div style={{ gridColumn: '1', gridRow: '2' }}>
          <GearSlot label="Hook" image={hook.imageUrl ?? null} itemName={hook.name} color={hook.color} onClick={() => setOpenSlot('hook')} />
        </div>

        {/* Center: Ship — tap to go to Shipyard */}
        <Link href="/marketplace/shipyard" onClick={onClose} style={{
          gridColumn: '2', gridRow: '1 / 3',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(4,10,20,0.75)',
          border: `1px solid ${ship.color}45`,
          borderRadius: 20,
          padding: '0.75rem 0.5rem 0.6rem',
          textDecoration: 'none',
          cursor: 'pointer',
        }}>
          <img src={ship.imageUrl} alt={ship.name} style={{ width: '90%', maxHeight: 100, objectFit: 'contain', filter: `drop-shadow(0 4px 16px ${ship.color}44)` }} />
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: ship.color, lineHeight: 1.2 }}>{ship.name}</p>
            <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: ship.color + 'aa', marginTop: 3 }}>
              {ship.holdCapacity} hold
            </p>
            <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: ship.color + '88', marginTop: 5, letterSpacing: '0.12em' }}>
              Shipyard ↗
            </p>
          </div>
        </Link>

        <div style={{ gridColumn: '3', gridRow: '1' }}>
          <GearSlot label="Reel" icon={<ReelIcon color={reel.color} />} itemName={reel.name} color={reel.color} onClick={() => setOpenSlot('reel')} />
        </div>
        <div style={{ gridColumn: '3', gridRow: '2' }}>
          <GearSlot label="Line" icon={<LineIcon color={line.color} />} itemName={line.name} color={line.color} onClick={() => setOpenSlot('line')} />
        </div>
      </div>

      {/* Bottom row: Special | Bait | Cosmetic */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 6 }}>
        {(() => {
          const equippedDef = SPECIAL_ITEMS.find(s => s.id === equippedSpecial)
          return (
            <GearSlot
              label="Special"
              image={equippedDef?.image ?? null}
              icon={<SpecialIcon color={equippedDef ? equippedDef.color : '#5a4a7a'} />}
              itemName={equippedDef ? equippedDef.name : 'None'}
              color={equippedDef ? equippedDef.color : '#5a4a7a'}
              onClick={() => setOpenSlot('special')}
              empty={!equippedDef}
            />
          )
        })()}
        <GearSlot
          label="Bait"
          image={bait?.imageUrl ?? null}
          icon={<BaitIcon color={bait?.color ?? '#94a3b8'} />}
          itemName={bait?.name ?? 'No Bait'}
          color={bait?.color ?? '#94a3b8'}
          onClick={() => setOpenSlot('bait')}
        />
        {(() => {
          const activeSkin = RING_SKINS.find(s => s.id === equippedRingSkin) ?? RING_SKINS[0]
          return (
            <GearSlot
              label="Cosmetic"
              icon={<CosmeticIcon color={activeSkin.id === 'standard' ? '#3a6a6a' : activeSkin.color} />}
              itemName={activeSkin.name}
              color={activeSkin.id === 'standard' ? '#3a6a6a' : activeSkin.color}
              onClick={() => setOpenSlot('cosmetic')}
              empty={activeSkin.id === 'standard'}
            />
          )
        })()}
      </div>

      {/* ── Loadout stats ── */}
      <div style={{ background: 'rgba(4,10,20,0.75)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '0.9rem' }}>
        <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
          Loadout Stats
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <StatCell
            label="Catch Zone"
            value={catchZoneBonus > 0 ? `+${catchZoneBonus}°` : '—'}
            color="#60a5fa"
            muted={catchZoneBonus === 0}
          />
          <StatCell
            label="Perfect Zone"
            value={rod.perfectZoneBonus > 0 ? `+${rod.perfectZoneBonus}°` : '—'}
            color="#fbbf24"
            muted={rod.perfectZoneBonus === 0}
          />
          <StatCell
            label="Reel Drag"
            value={dragPct > 0 ? `${dragPct}%` : 'None'}
            color={reel.color}
            muted={dragPct === 0}
          />
          <StatCell
            label="Snag Zone"
            value={snagRedPct > 0 ? `−${snagRedPct}%` : 'Normal'}
            color={line.color}
            muted={snagRedPct === 0}
          />
        </div>
        {specialBonuses.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {specialBonuses.map((b, i) => (
              <Pill key={i} label={b.label} color={b.color} />
            ))}
          </div>
        )}
      </div>

      {/* ── Item detail modal ── */}
      <AnimatePresence>
        {openSlot && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setOpenSlot(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', borderRadius: 20, zIndex: 10 }}
            />
            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 11,
                background: 'rgba(6,12,22,0.98)', border: '1px solid rgba(255,255,255,0.11)',
                borderRadius: 20, padding: '1rem 0.9rem 1.1rem',
                maxHeight: '80%', overflowY: 'auto',
              }}
            >
              {/* Close row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>
                  {openSlot.charAt(0).toUpperCase() + openSlot.slice(1)}
                </p>
                <button onClick={() => setOpenSlot(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px', touchAction: 'manipulation' }}>×</button>
              </div>

              {/* ── Rod ── */}
              {openSlot === 'rod' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ownedRodDefs.map(r => {
                    const isEquipped = r.tier === equippedRodTier
                    const speedPct = Math.round((3800 - r.biteIntervalMs) / 3800 * 100)
                    const hasSpecial = r.doubleCatchChance > 0 || r.retryOnMissChance > 0 || r.snagImmune || r.perfectZoneBonus > 0 || r.rarityBonus > 0 || (r.jackpotChance ?? 0) > 0
                    return (
                      <div key={r.tier} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.55rem 0.65rem', borderRadius: 10,
                        background: isEquipped ? `${r.color}12` : 'rgba(4,10,18,0.72)',
                        border: `1px solid ${isEquipped ? r.color + '50' : 'rgba(255,255,255,0.09)'}`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8', marginBottom: 3 }}>{r.name}</p>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {r.doubleCatchChance > 0 && <Pill label={r.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(r.doubleCatchChance*100)}% double`} color={r.color} />}
                            {r.retryOnMissChance > 0 && <Pill label={`${Math.round(r.retryOnMissChance*100)}% retry`} color={r.color} />}
                            {r.snagImmune && <Pill label="Snag immune" color={r.color} />}
                            {r.perfectZoneBonus > 0 && <Pill label={`Perfect +${r.perfectZoneBonus}°`} color={r.color} />}
                            {r.rarityBonus > 0 && <Pill label={`+${Math.round(r.rarityBonus*100)}% rare`} color={r.color} />}
                            {(r.jackpotChance ?? 0) > 0 && <Pill label={`${Math.round(r.jackpotChance!*100)}% jackpot ×${r.jackpotMultiplier}`} color={r.color} />}
                            {!hasSpecial && speedPct > 0 && <Pill label={`${speedPct}% faster`} color={r.color} />}
                            {!hasSpecial && speedPct <= 0 && r.catchZoneBonus > 0 && <Pill label={`+${r.catchZoneBonus}° zone`} color={r.color} />}
                            {!hasSpecial && speedPct <= 0 && r.catchZoneBonus === 0 && <Pill label="Base rod" muted />}
                          </div>
                        </div>
                        {isEquipped
                          ? <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: r.color, whiteSpace: 'nowrap' }}>✓ On</span>
                          : <button onClick={() => { onEquipRod(r.tier); setOpenSlot(null) }} className="font-karla font-700"
                              style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                background: `${r.color}16`, border: `1px solid ${r.color}44`, color: r.color, cursor: 'pointer' }}>
                              Equip
                            </button>
                        }
                      </div>
                    )
                  })}
                  <ShopLink href="/marketplace/tackle-shop#rod" label="Buy more rods" color={rod.color} onClick={onClose} />
                </div>
              )}

              {/* ── Reel ── */}
              {openSlot === 'reel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: reel.color }}>{reel.name}</p>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {dragPct > 0 ? <Pill label={`−${dragPct}% needle speed`} color={reel.color} /> : <Pill label="Base needle speed" muted />}
                  </div>
                  <p className="font-karla font-300" style={{ fontSize: '0.75rem', color: '#6a6764', lineHeight: 1.55 }}>{reel.description}</p>
                  <ShopLink href="/marketplace/tackle-shop#reel" label="Upgrade reel" color={reel.color} onClick={onClose} />
                </div>
              )}

              {/* ── Hook ── */}
              {openSlot === 'hook' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {hook.imageUrl && (
                      <img src={hook.imageUrl} alt={hook.name} style={{ width: 44, height: 44, objectFit: 'contain', filter: `drop-shadow(0 2px 8px ${hook.color}66)` }} />
                    )}
                    <div>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: hook.color }}>{hook.name}</p>
                      <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                        {hookTier > 0 ? <Pill label={`+${hookTier * 3}° catch zone`} color={hook.color} /> : <Pill label="No catch zone bonus" muted />}
                      </div>
                    </div>
                  </div>
                  <p className="font-karla font-300" style={{ fontSize: '0.75rem', color: '#6a6764', lineHeight: 1.55 }}>{hook.description}</p>
                  <ShopLink href="/marketplace/tackle-shop#hook" label="Upgrade hook" color={hook.color} onClick={onClose} />
                </div>
              )}

              {/* ── Line ── */}
              {openSlot === 'line' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: line.color }}>{line.name}</p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {snagRedPct > 0 ? <Pill label={`−${snagRedPct}% snag zone`} color={line.color} /> : <Pill label="Standard snag zones" muted />}
                  </div>
                  <p className="font-karla font-300" style={{ fontSize: '0.75rem', color: '#6a6764', lineHeight: 1.55 }}>{line.description}</p>
                  <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#4a4845', lineHeight: 1.5 }}>
                    Lines are earned by catching unique species — no purchase needed.
                  </p>
                </div>
              )}

              {/* ── Special ── */}
              {openSlot === 'special' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#8b6fc0' }}>Special Items</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SPECIAL_ITEMS.map(item => {
                      const owned = item.id === 'tide_turner' ? hasTideTurner : false
                      const isEquipped = equippedSpecial === item.id
                      return (
                        <div key={item.id} style={{
                          background: isEquipped ? `${item.color}10` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isEquipped ? item.color + '50' : owned ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                          borderRadius: 14,
                          padding: '0.75rem 0.9rem',
                          opacity: owned ? 1 : 0.5,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: owned ? 6 : 4 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                              {item.image && (
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  style={{
                                    width: 44, height: 44, objectFit: 'contain', flexShrink: 0,
                                    filter: owned
                                      ? `drop-shadow(0 2px 8px ${item.color}55)`
                                      : 'grayscale(1) brightness(0.4)',
                                    borderRadius: 8,
                                  }}
                                />
                              )}
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                  <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: owned ? item.color : '#4a4845', lineHeight: 1 }}>{item.name}</p>
                                  <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: `${item.color}88`, background: `${item.color}14`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>{item.effectLabel}</span>
                                </div>
                                <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: owned ? '#7a7268' : '#4a4845', lineHeight: 1.45 }}>{item.description}</p>
                              </div>
                            </div>
                            {owned && (
                              <button
                                onClick={() => onEquipSpecial(isEquipped ? null : item.id)}
                                style={{
                                  flexShrink: 0,
                                  background: isEquipped ? `${item.color}22` : 'rgba(255,255,255,0.06)',
                                  border: `1px solid ${isEquipped ? item.color + '60' : 'rgba(255,255,255,0.12)'}`,
                                  borderRadius: 8,
                                  padding: '0.3rem 0.65rem',
                                  cursor: 'pointer',
                                  color: isEquipped ? item.color : '#6a6460',
                                  fontSize: '0.62rem',
                                  fontFamily: 'inherit',
                                  marginTop: 2,
                                }}
                                className="font-karla font-700 uppercase tracking-[0.08em]"
                              >
                                {isEquipped ? 'Unequip' : 'Equip'}
                              </button>
                            )}
                          </div>
                          {owned && item.id === 'tide_turner' && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${item.color}18` }}>
                              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', color: `${item.color}88` }}>Skips today</p>
                              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: tideTurnerSkipsLeft > 0 ? item.color : '#4a4845', lineHeight: 1 }}>{tideTurnerSkipsLeft} / 3</p>
                            </div>
                          )}
                          {!owned && (
                            <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#3a3835', marginTop: 2 }}>
                              From: {item.obtainedFrom}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Cosmetic ── */}
              {openSlot === 'cosmetic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#4a9a9a' }}>Dial Ring Skins</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {RING_SKINS.map(skin => {
                      const owned = skin.id === 'standard' || unlockedRingSkins.includes(skin.id)
                      const isEquipped = equippedRingSkin === skin.id
                      return (
                        <div key={skin.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${skin.color}12` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? skin.color + '50' : owned ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'}`,
                          opacity: owned ? 1 : 0.45,
                        }}>
                          {/* Ring preview swatch */}
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${skin.stroke}`,
                            background: 'rgba(4,10,20,0.8)',
                            boxShadow: skin.glow ? skin.glow.replace('drop-shadow', '').replace(/[()]/g, '').trim() : 'none',
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: owned ? '#f0ede8' : '#3a3835' }}>{skin.name}</p>
                            <p className="font-karla" style={{ fontSize: '0.56rem', color: owned ? '#5a5856' : '#2e2c2a', marginTop: 1 }}>
                              {owned ? skin.description : skin.source}
                            </p>
                          </div>
                          {owned
                            ? isEquipped
                              ? <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: skin.color, whiteSpace: 'nowrap' }}>✓ On</span>
                              : <button onClick={() => { onEquipRingSkin(skin.id); setOpenSlot(null) }} className="font-karla font-700"
                                  style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                    background: `${skin.color}16`, border: `1px solid ${skin.color}44`, color: skin.color, cursor: 'pointer' }}>
                                  Equip
                                </button>
                            : <span className="font-karla" style={{ fontSize: '0.5rem', color: '#3a3835', whiteSpace: 'nowrap' }}>Locked</span>
                          }
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ background: 'rgba(74,154,154,0.07)', border: '1px solid rgba(74,154,154,0.15)', borderRadius: 10, padding: '0.6rem 0.8rem', marginTop: 2 }}>
                    <p className="font-karla font-300" style={{ fontSize: '0.65rem', color: '#4a6a6a', lineHeight: 1.5 }}>
                      Unlock ring skins by completing voyages on the Expeditions page.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Bait ── */}
              {openSlot === 'bait' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {BAITS.filter(b => (inventoryMap[b.type] ?? 0) > 0 || b.type === selectedBait).map(b => {
                    const qty = inventoryMap[b.type] ?? 0
                    const isSel = b.type === selectedBait
                    const c = b.color
                    return (
                      <button key={b.type} onClick={() => { onSelectBait(b.type); setOpenSlot(null) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10, width: '100%',
                          background: isSel ? `${c}12` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isSel ? c + '50' : 'rgba(255,255,255,0.09)'}`,
                          cursor: 'pointer',
                        }}>
                        {b.imageUrl
                          ? <img src={b.imageUrl} alt={b.name} style={{ width: 22, height: 22, objectFit: 'contain', opacity: qty > 0 ? 1 : 0.3, flexShrink: 0 }} />
                          : <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: qty > 0 ? 1 : 0.3, flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>{b.name}</p>
                          <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
                            {b.catchZoneBonus > 0 && <Pill label={`+${b.catchZoneBonus}° zone`} color={c} />}
                            {b.waitMult < 1 && <Pill label={`${Math.round((1-b.waitMult)*100)}% faster`} color={c} />}
                            {b.waitMult > 1 && <Pill label={`${Math.round((b.waitMult-1)*100)}% slower`} color="#f87171" />}
                            {!b.catchZoneBonus && b.waitMult === 1 && <Pill label="No bonus" muted />}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>×{qty}</span>
                          {isSel && <span className="font-karla font-700" style={{ fontSize: '0.44rem', color: c }}>equipped</span>}
                        </div>
                      </button>
                    )
                  })}
                  <ShopLink href="/marketplace/tackle-shop#bait" label="Buy more bait" color={bait?.color ?? '#34d399'} onClick={onClose} />
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
