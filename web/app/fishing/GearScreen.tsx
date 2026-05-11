'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getHook } from '@/lib/hooks'
import { getRod, RODS } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { RING_SKINS } from '@/lib/ringSkins'
import { BOATS, DEFAULT_BOAT_COLOR } from '@/lib/boats'
import { BADGE_MAP, BADGES } from '@/lib/badges'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { SPECIAL_ITEMS } from '@/lib/specialItems'

type BaitItem = { bait_type: string; quantity: number }
type SlotKey = 'rod' | 'reel' | 'hook' | 'line' | 'bait' | 'special' | 'cosmetic' | 'character' | 'badge'

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

function SpecialItemRow({
  item, owned, isEquipped, tideTurnerSkipsLeft,
  onEquip, onBuy,
}: {
  item: import('@/lib/specialItems').SpecialItemDef
  owned: boolean
  isEquipped: boolean
  tideTurnerSkipsLeft: number
  onEquip: () => void
  onBuy: () => Promise<void>
}) {
  const [buying, setBuying] = React.useState(false)
  return (
    <div style={{
      background: isEquipped ? `${item.color}10` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isEquipped ? item.color + '50' : owned ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 14,
      padding: '0.75rem 0.9rem',
      opacity: owned || item.shopCost ? 1 : 0.5,
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
              <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: owned ? item.color : item.shopCost ? '#a09890' : '#4a4845', lineHeight: 1 }}>{item.name}</p>
              <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: `${item.color}88`, background: `${item.color}14`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>{item.effectLabel}</span>
            </div>
            <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: owned ? '#7a7268' : item.shopCost ? '#6a6460' : '#4a4845', lineHeight: 1.45 }}>{item.description}</p>
          </div>
        </div>
        {owned && (
          <button
            onClick={onEquip}
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
        {!owned && item.shopCost && (
          <button
            disabled={buying}
            onClick={async () => {
              setBuying(true)
              await onBuy()
              setBuying(false)
            }}
            style={{
              flexShrink: 0,
              background: `${item.color}18`,
              border: `1px solid ${item.color}50`,
              borderRadius: 8,
              padding: '0.3rem 0.65rem',
              cursor: buying ? 'default' : 'pointer',
              opacity: buying ? 0.6 : 1,
              marginTop: 2,
            }}
            className="font-karla font-700 uppercase tracking-[0.08em]"
          >
            <span style={{ fontSize: '0.52rem', color: item.color, display: 'block', lineHeight: 1.2 }}>Buy</span>
            <span style={{ fontSize: '0.58rem', color: '#f0c040', display: 'block', lineHeight: 1.3 }}>{item.shopCost.toLocaleString()}</span>
          </button>
        )}
      </div>
      {owned && item.id === 'tide_turner' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${item.color}18` }}>
          <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', color: `${item.color}88` }}>Skips today</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: tideTurnerSkipsLeft > 0 ? item.color : '#4a4845', lineHeight: 1 }}>{tideTurnerSkipsLeft} / 3</p>
        </div>
      )}
      {!owned && !item.shopCost && (
        <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#3a3835', marginTop: 2 }}>
          From: {item.obtainedFrom}
        </p>
      )}
    </div>
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
  label, image, icon, itemName, color, onClick, small, empty, glow,
}: {
  label: string
  image?: string | null
  icon?: React.ReactNode
  itemName: string
  color: string
  onClick: () => void
  small?: boolean
  empty?: boolean
  glow?: boolean
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
          ? <img
              src={image}
              alt={label}
              className={glow ? 'rod-glow' : undefined}
              style={{
                width: 36, height: 36, objectFit: 'contain',
                ...(glow ? { ['--rod-glow-color' as string]: color } : { filter: `drop-shadow(0 2px 6px ${color}55)` }),
              } as React.CSSProperties}
            />
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
  reelTier, hookTier, lineTier,
  characterColor, charSrc, equippedBadges, unlockedCharacterColors, unlockedBadges, onUpdateColor, onEquipBadge,
  equippedBoat, unlockedBoats, onEquipBoat, onBuyBoat, doubloons,
  equippedRingSkin, unlockedRingSkins, onEquipRingSkin,
  hasTideTurner, tideTurnerSkipsLeft, hasPhantomHook, hasAutoCaster,
  equippedSpecial, onEquipSpecial, onBuySpecialItem,
  fishingLevel,
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
  characterColor: string
  charSrc: Record<string, string>
  equippedBadges: string[]
  unlockedCharacterColors: string[]
  unlockedBadges: string[]
  onUpdateColor: (colorId: string) => void
  onEquipBadge: (id: string, slot?: 0 | 1 | 2) => void
  equippedBoat: string | null
  unlockedBoats: string[]
  onEquipBoat: (id: string | null) => void
  onBuyBoat: (id: string) => void
  doubloons: number
  equippedRingSkin: string
  unlockedRingSkins: string[]
  onEquipRingSkin: (skin: string) => void
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  equippedSpecial: string | null
  onEquipSpecial: (itemId: string | null) => void
  onBuySpecialItem: (itemId: string) => Promise<void>
  fishingLevel: number
  onClose: () => void
}) {
  const [openSlot, setOpenSlot] = useState<SlotKey | null>(null)
  const [selectedBadgeSlot, setSelectedBadgeSlot] = useState<0 | 1 | 2 | null>(null)
  useEffect(() => { if (openSlot !== 'badge') setSelectedBadgeSlot(null) }, [openSlot])

  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)
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
  const levelBiteBonus = Math.round(((fishingLevel - 1) / 99) * 33)
  const baitBiteEffect = bait ? Math.round((1 - bait.waitMult) * 100) : 0
  const totalBiteEffect = baitBiteEffect + levelBiteBonus

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>

      {/* ── Visual gear grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gridTemplateRows: 'auto auto', gap: 6 }}>

        <div style={{ gridColumn: '1', gridRow: '1' }}>
          <GearSlot label="Rod" image={rod.imageUrl ?? '/rod.png'} itemName={rod.name} color={rod.color} glow={rod.glow} onClick={() => setOpenSlot('rod')} />
        </div>
        <div style={{ gridColumn: '1', gridRow: '2' }}>
          <GearSlot label="Hook" image={hook.imageUrl ?? null} itemName={hook.name} color={hook.color} onClick={() => setOpenSlot('hook')} />
        </div>

        {/* Center row 1: Character */}
        <button onClick={() => setOpenSlot('character')} style={{
          gridColumn: '2', gridRow: '1',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,10,20,0.75)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: '0.6rem 0.5rem',
          cursor: 'pointer',
          gap: 5,
          width: '100%',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', overflow: 'hidden',
            backgroundImage: `url(${charSrc.rest})`,
            backgroundSize: '280% auto', backgroundPosition: 'center 92%', backgroundRepeat: 'no-repeat',
            border: '2px solid rgba(255,255,255,0.15)',
          }} />
          <div style={{ textAlign: 'center' }}>
            <p className="font-karla font-600 uppercase" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', lineHeight: 1 }}>Character</p>
            <p className="font-karla font-600" style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{CHARACTER_COLORS.find(c => c.id === characterColor)?.name ?? characterColor}</p>
          </div>
        </button>

        {/* Center row 2: Cosmetic (boat swatch) */}
        {(() => {
          const activeBoat = equippedBoat ? BOATS.find(b => b.id === equippedBoat) : null
          const swatchColor = activeBoat?.color ?? DEFAULT_BOAT_COLOR
          const cosmeticName = activeBoat?.name ?? 'Driftwood'
          return (
            <button onClick={() => setOpenSlot('cosmetic')} style={{
              gridColumn: '2', gridRow: '2',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(4,10,20,0.75)',
              border: `1px solid ${swatchColor}40`,
              borderRadius: 20,
              padding: '0.6rem 0.5rem',
              cursor: 'pointer',
              gap: 5,
              width: '100%',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: swatchColor,
                border: `1px solid ${swatchColor}cc`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 0 12px ${swatchColor}40`,
              }} />
              <div style={{ textAlign: 'center' }}>
                <p className="font-karla font-600 uppercase" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', lineHeight: 1 }}>Cosmetic</p>
                <p className="font-karla font-600" style={{ fontSize: '0.52rem', color: swatchColor + 'cc', marginTop: 2 }}>{cosmeticName}</p>
              </div>
            </button>
          )
        })()}

        <div style={{ gridColumn: '3', gridRow: '1' }}>
          <GearSlot label="Reel" image={reel.imageUrl ?? null} icon={<ReelIcon color={reel.color} />} itemName={reel.name} color={reel.color} onClick={() => setOpenSlot('reel')} />
        </div>
        <div style={{ gridColumn: '3', gridRow: '2' }}>
          <GearSlot label="Line" image={line.imageUrl ?? null} itemName={line.name} color={line.color} onClick={() => setOpenSlot('line')} />
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
        {/* Badges (moved here from center) */}
        <button onClick={() => setOpenSlot('badge')} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,10,20,0.75)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: '0.55rem 0.4rem',
          cursor: 'pointer',
          gap: 5,
          width: '100%',
        }}>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center', minHeight: 26 }}>
            {equippedBadges.filter(Boolean).length === 0 ? (
              <span style={{ fontSize: '0.85rem', color: '#3a3835' }}>—</span>
            ) : (
              equippedBadges.slice(0, 3).map((id, i) => {
                if (!id) return null
                const badge = BADGE_MAP[id]
                return badge ? (
                  <img key={i} src={badge.imageUrl} alt={badge.name} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                ) : null
              })
            )}
          </div>
          <p className="font-karla font-600 uppercase" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', lineHeight: 1 }}>Badges</p>
        </button>
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
            label="Bite Speed"
            value={totalBiteEffect > 0 ? `+${totalBiteEffect}%` : totalBiteEffect < 0 ? `${totalBiteEffect}%` : '—'}
            color={totalBiteEffect < 0 ? '#f87171' : '#4ade80'}
            muted={totalBiteEffect === 0}
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
                      const owned = item.id === 'tide_turner' ? hasTideTurner
                        : item.id === 'phantom_hook' ? hasPhantomHook
                        : item.id === 'auto_caster' ? hasAutoCaster
                        : false
                      const isEquipped = equippedSpecial === item.id
                      return (
                        <SpecialItemRow
                          key={item.id}
                          item={item}
                          owned={owned}
                          isEquipped={isEquipped}
                          tideTurnerSkipsLeft={tideTurnerSkipsLeft}
                          onEquip={() => onEquipSpecial(isEquipped ? null : item.id)}
                          onBuy={() => onBuySpecialItem(item.id)}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Cosmetic ── */}
              {openSlot === 'cosmetic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* ── Boats ── */}
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#bda05a' }}>Boats</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Default — no overlay */}
                    {(() => {
                      const isEquipped = !equippedBoat
                      return (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${DEFAULT_BOAT_COLOR}1f` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? DEFAULT_BOAT_COLOR + '70' : 'rgba(255,255,255,0.09)'}`,
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: DEFAULT_BOAT_COLOR,
                            border: `1px solid ${DEFAULT_BOAT_COLOR}aa`,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 0 8px ${DEFAULT_BOAT_COLOR}33`,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>Driftwood</p>
                            <p className="font-karla" style={{ fontSize: '0.56rem', color: '#5a5856', marginTop: 1 }}>Default fishing boat</p>
                          </div>
                          {isEquipped
                            ? <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: DEFAULT_BOAT_COLOR, whiteSpace: 'nowrap' }}>✓ On</span>
                            : <button onClick={() => { onEquipBoat(null); setOpenSlot(null) }} className="font-karla font-700"
                                style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                  background: `${DEFAULT_BOAT_COLOR}16`, border: `1px solid ${DEFAULT_BOAT_COLOR}44`, color: DEFAULT_BOAT_COLOR, cursor: 'pointer' }}>
                                Equip
                              </button>
                          }
                        </div>
                      )
                    })()}
                    {BOATS.map(b => {
                      const owned = unlockedBoats.includes(b.id)
                      const isEquipped = equippedBoat === b.id
                      const canAfford = doubloons >= b.cost
                      return (
                        <div key={b.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${b.color}1f` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? b.color + '70' : owned ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)'}`,
                          opacity: owned ? 1 : 0.85,
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: b.color,
                            border: `1px solid ${b.color}cc`,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 0 10px ${b.color}40`,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>{b.name}</p>
                            <p className="font-karla" style={{ fontSize: '0.56rem', color: owned ? '#5a5856' : b.color + 'cc', marginTop: 1 }}>
                              {owned ? 'Wooden hull' : `${b.cost.toLocaleString()} ⟡`}
                            </p>
                          </div>
                          {owned
                            ? isEquipped
                              ? <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: b.color, whiteSpace: 'nowrap' }}>✓ On</span>
                              : <button onClick={() => { onEquipBoat(b.id); setOpenSlot(null) }} className="font-karla font-700"
                                  style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                    background: `${b.color}16`, border: `1px solid ${b.color}55`, color: b.color, cursor: 'pointer' }}>
                                  Equip
                                </button>
                            : <button
                                onClick={() => { if (canAfford) { onBuyBoat(b.id); setOpenSlot(null) } }}
                                disabled={!canAfford}
                                className="font-karla font-700"
                                style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                  background: canAfford ? `${b.color}1f` : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${canAfford ? b.color + '70' : 'rgba(255,255,255,0.1)'}`,
                                  color: canAfford ? b.color : '#5a5856',
                                  cursor: canAfford ? 'pointer' : 'default' }}
                              >
                                Buy
                              </button>
                          }
                        </div>
                      )
                    })}
                  </div>

                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#4a9a9a', marginTop: 14 }}>Dial Ring Skins</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {RING_SKINS.filter(s => !['gilded_compass', 'abyssal_sigil'].includes(s.id)).map(skin => {
                      const isNone = skin.id === 'standard'
                      const owned = isNone || unlockedRingSkins.includes(skin.id)
                      const isEquipped = equippedRingSkin === skin.id
                      return (
                        <div key={skin.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${skin.color}12` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? skin.color + '50' : owned ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)'}`,
                          opacity: owned ? 1 : 0.45,
                        }}>
                          {/* Ring preview */}
                          {isNone
                            ? <div style={{ width: 24, height: 24, flexShrink: 0 }} />
                            : skin.imageUrl
                              ? <img src={skin.imageUrl} alt={skin.name} style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0, opacity: owned ? 1 : 0.3 }} />
                              : <div style={{
                                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                  border: `2px solid ${skin.stroke}`,
                                  background: 'rgba(4,10,20,0.8)',
                                  boxShadow: skin.glow ? skin.glow.replace('drop-shadow', '').replace(/[()]/g, '').trim() : 'none',
                                }} />
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: owned ? '#f0ede8' : '#3a3835' }}>
                              {isNone ? 'None' : skin.name}
                            </p>
                            <p className="font-karla" style={{ fontSize: '0.56rem', color: owned ? '#5a5856' : '#2e2c2a', marginTop: 1 }}>
                              {isNone ? 'Default dial ring' : owned ? skin.description : skin.source}
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

              {/* ── Character ── */}
              {openSlot === 'character' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#d0cdc8' }}>Character Color</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {CHARACTER_COLORS.map(c => {
                      const sprites = getCharacterSprites(c.id)
                      const isActive = characterColor === c.id
                      const isUnlocked = c.free || unlockedCharacterColors.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            if (!isUnlocked) return
                            if (isActive) { setOpenSlot(null); return }
                            onUpdateColor(c.id)
                            setOpenSlot(null)
                          }}
                          style={{ background: 'none', border: 'none', cursor: isUnlocked ? 'pointer' : 'default', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                        >
                          <div style={{
                            width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
                            backgroundImage: `url(${sprites.rest})`,
                            backgroundSize: '280% auto', backgroundPosition: 'center 92%', backgroundRepeat: 'no-repeat',
                            border: isActive ? '2px solid #60a5fa' : '2px solid rgba(255,255,255,0.12)',
                            boxShadow: isActive ? '0 0 10px rgba(96,165,250,0.4)' : 'none',
                            position: 'relative',
                            opacity: isUnlocked ? 1 : 0.35,
                          }}>
                            {!isUnlocked && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.52)', borderRadius: '50%' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                              </div>
                            )}
                          </div>
                          <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: isActive ? '#60a5fa' : isUnlocked ? '#6a6764' : '#3a3835' }}>{c.name}</p>
                          {!isUnlocked && c.unlockHint && (
                            <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: '#4a4845', textAlign: 'center', lineHeight: 1.3, maxWidth: 52 }}>{c.unlockHint}</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Badge ── */}
              {openSlot === 'badge' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#d0cdc8' }}>Badges</p>
                  <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: '#5a5755', lineHeight: 1.4 }}>
                    {selectedBadgeSlot !== null
                      ? `Slot ${selectedBadgeSlot + 1} selected — pick a badge to equip there. Tap the slot again to deselect.`
                      : 'Pick a slot first, or tap a badge to fill the next empty slot. Tap an equipped badge to remove it.'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[0, 1, 2].map(slot => {
                      const id = equippedBadges[slot]
                      const badge = id ? BADGE_MAP[id] : null
                      const isSelected = selectedBadgeSlot === slot
                      return (
                        <button
                          key={slot}
                          onClick={() => setSelectedBadgeSlot(isSelected ? null : (slot as 0 | 1 | 2))}
                          style={{
                            flex: 1, aspectRatio: '1',
                            background: isSelected ? 'rgba(240,192,64,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `2px solid ${isSelected ? '#f0c040' : 'rgba(255,255,255,0.12)'}`,
                            borderRadius: 12, cursor: 'pointer', position: 'relative',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                            boxShadow: isSelected ? '0 0 12px rgba(240,192,64,0.35)' : 'none',
                          }}
                        >
                          {badge ? (
                            <img src={badge.imageUrl} alt={badge.name} style={{ width: 36, height: 36, objectFit: 'contain' }} />
                          ) : (
                            <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>Empty</span>
                          )}
                          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: isSelected ? '#f0c040' : 'rgba(255,255,255,0.4)' }}>Slot {slot + 1}</span>
                        </button>
                      )
                    })}
                  </div>
                  {unlockedBadges.length === 0 ? (
                    <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845' }}>No badges earned yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {BADGES.filter(b => unlockedBadges.includes(b.id)).map(badge => {
                        const isEquipped = equippedBadges.includes(badge.id)
                        return (
                          <button
                            key={badge.id}
                            onClick={() => {
                              onEquipBadge(badge.id, selectedBadgeSlot ?? undefined)
                              setSelectedBadgeSlot(null)
                              setOpenSlot(null)
                            }}
                            style={{
                              background: isEquipped ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${isEquipped ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: 12, padding: '0.65rem 0.4rem',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                              cursor: 'pointer',
                            }}
                          >
                            <img src={badge.imageUrl} alt={badge.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />
                            <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: isEquipped ? '#f0c040' : '#a0a09a', textAlign: 'center', lineHeight: 1.2 }}>{badge.name}</p>
                            {isEquipped && (
                              <span className="font-karla font-700" style={{ fontSize: '0.48rem', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>On</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <Link href="/achievements" onClick={() => { setOpenSlot(null); onClose() }} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.7rem 0.9rem', borderRadius: 14, marginTop: 2,
                    background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.18)',
                    textDecoration: 'none',
                  }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: 'rgba(240,192,64,0.7)' }}>Want to earn more badges?</p>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(240,192,64,0.5)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </Link>
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
