'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getHook, HOOKS, hookGlowClass } from '@/lib/hooks'
import { getRod, RODS, rodGlowClass } from '@/lib/rods'
import { getReel, REELS } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { BOATS, DEFAULT_BOAT_COLOR, boatGlowClass, BOAT_ASH_DARKEN } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { BADGE_MAP, BADGES } from '@/lib/badges'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { SPECIAL_ITEMS } from '@/lib/specialItems'
import { PETS, getPet, getPetOverlay } from '@/lib/pets'

type BaitItem = { bait_type: string; quantity: number }
type SlotKey = 'rod' | 'reel' | 'hook' | 'line' | 'special' | 'appearance' | 'badge'
// Sub-tab inside the unified Appearance picker. Skin / Hat / Boat ship
// today; Pet is reserved here so the tab strip's render list is the
// only place to touch when the pet system lands.
type AppearanceTab = 'skin' | 'hat' | 'boat' | 'pet'

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

function rodTagline(r: typeof RODS[number]): string {
  // Collect every active trait, then return the top 2 joined — rods like
  // the Legendary have both a rarity bonus AND a big speed boost, and the
  // tile was hiding the speed because the old code returned the first match.
  const parts: string[] = []
  if (r.doubleCatchChance >= 1)        parts.push('Always double')
  else if (r.doubleCatchChance > 0)    parts.push(`${Math.round(r.doubleCatchChance * 100)}% double`)
  if ((r.jackpotChance ?? 0) > 0)      parts.push(`${Math.round(r.jackpotChance! * 100)}% jackpot`)
  if (r.snagImmune)                    parts.push('Snag immune')
  if (r.retryOnMissChance > 0)         parts.push(`${Math.round(r.retryOnMissChance * 100)}% retry`)
  if (r.perfectZoneBonus > 0)          parts.push(`+${r.perfectZoneBonus}° perfect`)
  if (r.rarityBonus > 0)               parts.push(`+${Math.round(r.rarityBonus * 100)}% rare`)
  const speedPct = Math.round((3800 - r.biteIntervalMs) / 3800 * 100)
  if (speedPct > 0)                    parts.push(`${speedPct}% faster`)
  if (r.catchZoneBonus > 0)            parts.push(`+${r.catchZoneBonus}° zone`)
  if (parts.length === 0) return 'Base rod'
  return parts.slice(0, 2).join(' · ')
}

function Pill({ label, color, muted }: { label: string; color?: string; muted?: boolean }) {
  if (muted) return (
    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>{label}</span>
  )
  return (
    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${color}cc`, background: `${color}14`, border: `1px solid ${color}30`, padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>{label}</span>
  )
}

// StatRow — the noob-friendly card-style stat block. Pairs the
// technical value ("+24°", "−25% needle speed") with a plain-English
// help line so a new player understands what the stat actually DOES.
// Used in the buy-confirm modal where the player is making a real
// decision and the extra chrome is worth the vertical space. The
// equipped-rod recap uses the more compact StatBullet below.
function StatRow({ title, value, help, color }: { title: string; value: string; help: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${color}22`,
      borderRadius: 10,
      padding: '0.65rem 0.85rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]"
          style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>{title}</p>
        <p className="font-cinzel font-700"
          style={{ fontSize: '1rem', color, lineHeight: 1, whiteSpace: 'nowrap' }}>{value}</p>
      </div>
      <p className="font-karla font-400"
        style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.58)', lineHeight: 1.4 }}>{help}</p>
    </div>
  )
}

// StatBullet — compact one-line variant for the equipped-gear recap
// where the player already knows what they own and wants to glance at
// stats without scrolling through tall cards. Bold value + short help
// clause, colored dot for visual rhythm. ~22px per row vs ~60-70px
// for a StatRow.
function StatBullet({ value, help, color }: { value: string; help: string; color: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, flexShrink: 0,
        marginTop: 7,
        boxShadow: `0 0 6px ${color}88`,
      }} />
      <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.78)', lineHeight: 1.45 }}>
        <span className="font-700" style={{ color }}>{value}</span>
        {' '}
        <span style={{ color: 'rgba(240,237,232,0.55)' }}>— {help}</span>
      </p>
    </li>
  )
}

// Returns every active stat on a rod as a { title, value, help } row
// for the equipped-rod detail header. Order is "what affects pacing
// most first" — bite speed and catch zone matter on every single cast;
// rare bias / jackpot / crate luring only affect outcomes.
function rodStatLines(r: typeof RODS[number]): Array<{ title: string; value: string; help: string }> {
  const lines: Array<{ title: string; value: string; help: string }> = []
  const speedPct = Math.round((3800 - r.biteIntervalMs) / 3800 * 100)
  if (speedPct > 0) {
    lines.push({ title: 'Bite Speed', value: `${speedPct}% faster`, help: 'less waiting between casts' })
  } else if (speedPct < 0) {
    lines.push({ title: 'Bite Speed', value: `${-speedPct}% slower`, help: 'longer wait, made up by other bonuses' })
  }
  if (r.catchZoneBonus > 0) {
    lines.push({ title: 'Catch Zone', value: `+${r.catchZoneBonus}°`, help: 'wider green band on the dial' })
  }
  if (r.perfectZoneBonus > 0) {
    lines.push({ title: 'Perfect Zone', value: `+${r.perfectZoneBonus}°`, help: 'bigger gold zone — easier Perfects' })
  }
  if (r.rarityBonus > 0) {
    lines.push({ title: 'Rare Bias', value: `+${Math.round(r.rarityBonus * 100)}%`, help: 'more rares per bite' })
  }
  if (r.doubleCatchChance >= 1) {
    lines.push({ title: 'Double Catch', value: 'Always', help: 'every catch lands two fish at once' })
  } else if (r.doubleCatchChance > 0) {
    lines.push({ title: 'Double Catch', value: `${Math.round(r.doubleCatchChance * 100)}% chance`, help: 'sometimes lands two at once' })
  }
  if (r.retryOnMissChance > 0) {
    lines.push({ title: 'Miss Retry', value: `${Math.round(r.retryOnMissChance * 100)}% chance`, help: 'missed dial sometimes refires' })
  }
  if (r.snagImmune) {
    lines.push({ title: 'Snag Immune', value: 'Yes', help: 'red zones cost no extra bait' })
  }
  if ((r.jackpotChance ?? 0) > 0) {
    lines.push({ title: 'Jackpot', value: `${Math.round(r.jackpotChance! * 100)}% × ${r.jackpotMultiplier}`, help: 'rare chance of a huge haul' })
  }
  if ((r.crateChanceMult ?? 1) > 1) {
    lines.push({ title: 'Crate Lure', value: `× ${r.crateChanceMult}`, help: 'more treasure crates per cast' })
  }
  if ((r.perfectXpMult ?? 1) > 1) {
    lines.push({ title: 'Perfect XP', value: `× ${r.perfectXpMult}`, help: 'Perfect catches grant double XP' })
  }
  if (lines.length === 0) {
    lines.push({ title: 'Base Rod', value: '—', help: 'standard rod — no bonuses' })
  }
  return lines
}

// ── Rod stat comparison ──────────────────────────────────────────────────
// Builds a "current vs new" row list for the rod buy-confirm modal so the
// player sees the actual delta they're getting — not just the new rod's
// stats in isolation. Only stats that ACTUALLY DIFFER between the two rods
// surface here; identical stats are skipped so the modal stays focused on
// what's changing. Delta arrows + green/red colors carry the upgrade /
// downgrade / sidegrade signal at a glance.
type RodStatDelta = {
  title: string
  currentLabel: string
  nextLabel: string
  delta: 'up' | 'down' | 'same'
}
function rodStatDeltas(current: typeof RODS[number], next: typeof RODS[number]): RodStatDelta[] {
  const rows: RodStatDelta[] = []
  const pushIfChanged = (
    title: string,
    curRaw: number, nxtRaw: number,
    curLabel: string, nxtLabel: string,
    higherBetter = true,
  ) => {
    if (curRaw === nxtRaw) return
    rows.push({
      title, currentLabel: curLabel, nextLabel: nxtLabel,
      delta: nxtRaw === curRaw ? 'same' : ((higherBetter ? nxtRaw > curRaw : nxtRaw < curRaw) ? 'up' : 'down'),
    })
  }
  // Bite speed: lower biteIntervalMs is faster (better). Express the speed
  // as % faster than base so the player sees an intuitive "30% → 45%".
  const curSpeed = Math.round((3800 - current.biteIntervalMs) / 3800 * 100)
  const nxtSpeed = Math.round((3800 - next.biteIntervalMs) / 3800 * 100)
  pushIfChanged('Bite Speed', curSpeed, nxtSpeed,
    curSpeed === 0 ? 'Base' : `${curSpeed}% fast`,
    nxtSpeed === 0 ? 'Base' : `${nxtSpeed}% fast`)
  pushIfChanged('Catch Zone', current.catchZoneBonus, next.catchZoneBonus,
    `+${current.catchZoneBonus}°`, `+${next.catchZoneBonus}°`)
  pushIfChanged('Perfect Zone', current.perfectZoneBonus, next.perfectZoneBonus,
    `+${current.perfectZoneBonus}°`, `+${next.perfectZoneBonus}°`)
  pushIfChanged('Rare Bias', current.rarityBonus, next.rarityBonus,
    `+${Math.round(current.rarityBonus * 100)}%`, `+${Math.round(next.rarityBonus * 100)}%`)
  const dcLabel = (v: number) => v === 0 ? 'None' : v >= 1 ? 'Always' : `${Math.round(v * 100)}%`
  pushIfChanged('Double Catch', current.doubleCatchChance, next.doubleCatchChance,
    dcLabel(current.doubleCatchChance), dcLabel(next.doubleCatchChance))
  pushIfChanged('Miss Retry', current.retryOnMissChance, next.retryOnMissChance,
    current.retryOnMissChance === 0 ? 'None' : `${Math.round(current.retryOnMissChance * 100)}%`,
    next.retryOnMissChance === 0 ? 'None' : `${Math.round(next.retryOnMissChance * 100)}%`)
  pushIfChanged('Snag Immune', current.snagImmune ? 1 : 0, next.snagImmune ? 1 : 0,
    current.snagImmune ? 'Yes' : 'No', next.snagImmune ? 'Yes' : 'No')
  const curJP = current.jackpotChance ?? 0
  const nxtJP = next.jackpotChance ?? 0
  pushIfChanged('Jackpot', curJP, nxtJP,
    curJP === 0 ? 'None' : `${Math.round(curJP * 100)}% ×${current.jackpotMultiplier}`,
    nxtJP === 0 ? 'None' : `${Math.round(nxtJP * 100)}% ×${next.jackpotMultiplier}`)
  pushIfChanged('Crate Lure', current.crateChanceMult ?? 1, next.crateChanceMult ?? 1,
    `×${current.crateChanceMult ?? 1}`, `×${next.crateChanceMult ?? 1}`)
  pushIfChanged('Perfect XP', current.perfectXpMult ?? 1, next.perfectXpMult ?? 1,
    `×${current.perfectXpMult ?? 1}`, `×${next.perfectXpMult ?? 1}`)
  return rows
}

// One row in the delta panel — compact "TITLE / current → next / arrow"
// laid out on a single line so 5-6 changing stats fit without scrolling.
function StatDeltaRow({ row, color }: { row: RodStatDelta; color: string }) {
  const deltaColor = row.delta === 'up' ? '#4ade80' : row.delta === 'down' ? '#f87171' : '#a8a39a'
  const arrow      = row.delta === 'up' ? '▲' : row.delta === 'down' ? '▼' : '·'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr auto',
      alignItems: 'center', gap: 10,
      padding: '0.55rem 0.7rem',
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${color}1f`,
      borderRadius: 9,
    }}>
      <div style={{ minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.1em]"
          style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.45)', marginBottom: 1 }}>
          {row.title}
        </p>
        <p className="font-karla font-600"
          style={{ fontSize: '0.7rem', color: '#7a7670', lineHeight: 1.1 }}>
          {row.currentLabel}
        </p>
      </div>
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', lineHeight: 1 }}>→</span>
      <div style={{ textAlign: 'right' }}>
        <p className="font-cinzel font-700"
          style={{ fontSize: '0.82rem', color: row.delta === 'up' ? color : deltaColor, lineHeight: 1.1 }}>
          {row.nextLabel}
        </p>
      </div>
      <span aria-hidden style={{ color: deltaColor, fontSize: '0.75rem', fontWeight: 700, lineHeight: 1 }}>
        {arrow}
      </span>
    </div>
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
  onEquip, onRequestBuy,
}: {
  item: import('@/lib/specialItems').SpecialItemDef
  owned: boolean
  isEquipped: boolean
  tideTurnerSkipsLeft: number
  onEquip: () => void
  onRequestBuy: () => void
}) {
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
              loading="lazy"
              decoding="async"
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
            onClick={onRequestBuy}
            style={{
              flexShrink: 0,
              background: `${item.color}18`,
              border: `1px solid ${item.color}50`,
              borderRadius: 8,
              padding: '0.3rem 0.65rem',
              cursor: 'pointer',
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
  label, image, icon, itemName, color, onClick, small, empty, glowClass, notify, pulseKey,
}: {
  label: string
  image?: string | null
  icon?: React.ReactNode
  itemName: string
  color: string
  onClick: () => void
  small?: boolean
  empty?: boolean
  /** CSS class for the animated aura around the gear thumbnail. Rod uses
   *  themed glows (rod-glow-fire / -sparkle / -electric); hook uses the
   *  generic rod-glow pulse. */
  glowClass?: string
  notify?: boolean
  /** Bump to retrigger a one-shot post-purchase pulse on this tile. */
  pulseKey?: number
}) {
  const glow = !!glowClass
  return (
    <motion.button
      onClick={onClick}
      animate={pulseKey ? {
        boxShadow: [
          `0 0 0 0 ${color}cc`,
          `0 0 0 16px ${color}00`,
          `0 0 0 0 ${color}00`,
        ],
        scale: [1, 1.05, 1],
      } : undefined}
      transition={pulseKey ? { duration: 0.7, times: [0, 0.45, 1], ease: 'easeOut' } : undefined}
      // Remount-key trick — bumping pulseKey re-runs the animate prop
      // from its initial state, otherwise framer-motion would treat
      // the prop change as a no-op (no animation re-fire).
      key={pulseKey ?? 'static'}
      style={{
        position: 'relative',
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
      {notify && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 12, height: 12, borderRadius: '50%',
          background: '#4ade80',
          border: '2px solid rgba(4,10,18,1)',
          boxShadow: '0 0 6px rgba(74,222,128,0.7)',
          animation: 'shop-pulse 1.6s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {image
          ? <img
              src={image}
              alt={label}
              loading="lazy"
              decoding="async"
              className={glowClass}
              style={{
                width: 36, height: 36, objectFit: 'contain',
                ...(glow ? { ['--rod-glow-color' as string]: color } : { filter: `drop-shadow(0 2px 6px ${color}55)` }),
              } as React.CSSProperties}
            />
          : icon
        }
      </div>
      <div style={{ textAlign: 'center' }}>
        <p className="font-karla font-600 uppercase" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', marginBottom: 1 }}>{label}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: empty ? '#2e2c2a' : '#d0cdc8', lineHeight: 1.2 }}>{itemName}</p>
      </div>
    </motion.button>
  )
}

// ── Unified Appearance slot ───────────────────────────────────────────
// Replaces the 3 separate Hat / Skin / Boat tiles in the gear grid
// with one consolidated tile that opens the tabbed Appearance picker.
// The 2×2 mini-grid keeps the equipped pieces visible at a glance so
// the player doesn't lose the "what's on me right now" read that the
// individual tiles used to give. Pet thumbnail slot is reserved (4th
// position) for when that system lands — drop it in there.
function AppearanceSlot({
  characterColor, charSrc, equippedHat, equippedBoat, equippedPet,
  pulseKey, onClick,
}: {
  characterColor: string
  charSrc: { rest: string } | Record<string, string>
  equippedHat: string | null
  equippedBoat: string | null
  equippedPet: string | null
  pulseKey?: number
  onClick: () => void
}) {
  const accent = '#a78bfa'
  const activeHat  = equippedHat  ? HATS.find(h => h.id === equippedHat)   : null
  const activeBoat = equippedBoat ? BOATS.find(b => b.id === equippedBoat) : null
  const activePet  = equippedPet  ? getPet(equippedPet)                    : null
  const characterName = CHARACTER_COLORS.find(c => c.id === characterColor)?.name ?? characterColor
  return (
    <motion.button
      onClick={onClick}
      animate={pulseKey ? {
        boxShadow: [`0 0 0 0 ${accent}cc`, `0 0 0 16px ${accent}00`, `0 0 0 0 ${accent}00`],
        scale: [1, 1.05, 1],
      } : undefined}
      transition={pulseKey ? { duration: 0.7, times: [0, 0.45, 1], ease: 'easeOut' } : undefined}
      key={pulseKey ?? 'static'}
      style={{
        position: 'relative',
        width: '100%', height: '100%',
        border: `1px solid ${accent}40`,
        background: 'rgba(4,10,20,0.75)',
        borderRadius: 20,
        padding: '0.6rem 0.5rem 0.55rem',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        transition: 'border-color 0.15s, background 0.15s',
        touchAction: 'manipulation',
      }}
    >
      {/* Composite preview — same layered stack the fishing game uses
          (character → hat → boat → pet). Fills the slot card so the
          composite isn't dwarfed by empty card space, and the character
          box is pushed LEFT of the slot frame so the rod's fishing
          line (drawn into the character sprite, hanging off the left)
          gets cropped by the slot's overflow:hidden. The character +
          boat + hat + pet stay centered in the visible area. */}
      <div style={{
        position: 'relative', width: '100%', flex: 1, minHeight: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          // Centered vertically (top:50% + translateY(-50%)) instead
          // of bottom-anchored, so the awkward empty space that used
          // to sit above the composite is now split + reduced as
          // breathing room on both sides. Width tuned so:
          //   - line (image's ~18%) clips off the slot's left edge
          //   - character body sits centered ~19-69% of slot
          //   - pet bird right edge stays in-frame at ~95% of slot
          //   - boat hull spans ~30-80% of slot
          top: '50%', left: '-30%', width: '135%',
          transform: 'translateY(-50%)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={charSrc.rest} alt="" loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />
          {/* Hat — uses the live hat def's rest-frame position so it
              lands exactly where it does in-game. */}
          {activeHat && (() => {
            const hp = activeHat.positions.rest
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeHat.restImageUrl} alt="" loading="lazy" decoding="async" style={{
                position: 'absolute', top: `${hp.top}%`, left: `${hp.left}%`,
                width: `${hp.width}%`,
                transform: `rotate(${hp.rotate}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }} />
            )
          })()}
          {/* Default hat sprite as fallback when no hat equipped */}
          {!activeHat && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/defaulthat_rest.png" alt="" loading="lazy" decoding="async" style={{
              position: 'absolute', top: '53%', left: '57.1%', width: '21.8%',
              pointerEvents: 'none',
            }} />
          )}
          {/* Boat — same rest-frame positions the fishing game uses. */}
          {(() => {
            const boat = activeBoat ?? BOATS[0]
            if (!boat) return null
            const bp = boat.positions.rest
            return (
              <div style={{
                position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                width: `${bp.width}%`,
                transform: `rotate(${bp.rotate}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={boat.restImageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={boatGlowClass(boat)}
                  style={{
                    width: '100%', display: 'block',
                    filter: boat.glowType === 'ash' ? BOAT_ASH_DARKEN : undefined,
                  }}
                />
              </div>
            )
          })()}
          {/* Pet — last child so it sits in the foreground over every
              other layer, exactly like the in-game render. */}
          {activePet && (() => {
            const pp = getPetOverlay(activePet.species, 'rest')
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activePet.restImageUrl} alt="" loading="lazy" decoding="async" style={{
                position: 'absolute', top: `${pp.top}%`, left: `${pp.left}%`,
                width: `${pp.width}%`,
                transform: `rotate(${pp.rotate}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
                filter: `drop-shadow(0 0 4px ${activePet.accentColor}55)`,
              }} />
            )
          })()}
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p className="font-karla font-600 uppercase" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', marginBottom: 1 }}>Appearance</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: '#d0cdc8', lineHeight: 1.2 }}>{characterName}</p>
      </div>
    </motion.button>
  )
}

export default function GearScreen({
  baitInventory, selectedBait, onSelectBait,
  equippedRodTier, ownedRods, onEquipRod, onBuyRod, onSellRod,
  reelTier, hookTier, lineTier, onBuyReel, onBuyHook,
  rodHasAffordable, reelHasAffordable, hookHasAffordable,
  characterColor, charSrc, equippedBadges, unlockedCharacterColors, unlockedBadges, onUpdateColor, onEquipBadge,
  equippedBoat, unlockedBoats, onEquipBoat, onBuyBoat, doubloons,
  equippedHat, unlockedHats, onEquipHat, onBuyHat,
  equippedPet, unlockedPets, onEquipPet,
  hasTideTurner, tideTurnerSkipsLeft, hasPhantomHook, hasAutoCaster, hasPerfectedSigil,
  equippedSpecial, onEquipSpecial, onBuySpecialItem,
  fishingLevel,
  showWaitTimer,
  onToggleShowWaitTimer,
  onClose,
}: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelectBait: (type: string) => void
  equippedRodTier: number
  ownedRods: number[]
  onEquipRod: (tier: number) => void
  onBuyRod: (tier: number) => Promise<void>
  /** Quick-sell an owned, non-equipped rod for 65% of its purchase
   *  cost. Server returns the new doubloon total + the updated owned
   *  list so the parent can patch state in one call. */
  onSellRod: (tier: number) => Promise<void>
  reelTier: number
  hookTier: number
  lineTier: number
  onBuyReel: () => Promise<void>
  onBuyHook: () => Promise<void>
  rodHasAffordable: boolean
  reelHasAffordable: boolean
  hookHasAffordable: boolean
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
  equippedHat: string | null
  unlockedHats: string[]
  onEquipHat: (id: string | null) => void
  onBuyHat: (id: string) => void
  equippedPet: string | null
  unlockedPets: string[]
  onEquipPet: (id: string | null) => void
  doubloons: number
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasPerfectedSigil: boolean
  equippedSpecial: string | null
  onEquipSpecial: (itemId: string | null) => void
  onBuySpecialItem: (itemId: string) => Promise<void>
  fishingLevel: number
  showWaitTimer: boolean
  onToggleShowWaitTimer: (next: boolean) => void
  onClose: () => void
}) {
  const [openSlot, setOpenSlot] = useState<SlotKey | null>(null)
  const [selectedBadgeSlot, setSelectedBadgeSlot] = useState<0 | 1 | 2 | null>(null)
  useEffect(() => { if (openSlot !== 'badge') setSelectedBadgeSlot(null) }, [openSlot])
  // Rod panel tabs — split owned vs shop so the player sees a focused
  // view at a time. Defaults to Owned so opening the rod slot shows
  // their equipped rod + swap options first, not a list of things to
  // buy. Reset to Owned every time the rod slot closes/reopens.
  const [rodTab, setRodTab] = useState<'owned' | 'shop'>('owned')
  const [appearanceTab, setAppearanceTab] = useState<AppearanceTab>('skin')
  // Pet sub-tab — Pets grid is split by species (Parrots / Monkeys)
  // so the list stays readable as new species ship. Sub-tab state
  // lives at the parent so the player's choice persists when they
  // bounce between the outer tabs.
  const [petSpeciesTab, setPetSpeciesTab] = useState<'parrot' | 'monkey'>('parrot')
  useEffect(() => { if (openSlot !== 'rod') setRodTab('owned') }, [openSlot])

  // Transient confirmation banner for cosmetic purchases. Clears itself after
  // 2.5s so the player gets a clear "you bought + equipped X" moment instead
  // of the menu silently closing.
  const [cosmeticToast, setCosmeticToast] = useState<{ id: number; name: string; color: string; cost: number } | null>(null)
  useEffect(() => {
    if (!cosmeticToast) return
    const t = setTimeout(() => setCosmeticToast(null), 2500)
    return () => clearTimeout(t)
  }, [cosmeticToast])
  // Post-purchase juice — when a slot is bought, the corresponding tile in
  // the gear grid pulses (one-shot box-shadow burst keyed by a Date.now()
  // timestamp so re-buys of the same slot retrigger). Each GearSlot reads
  // its own pulseKey via `pulseKeys[slot]` and animates when it changes.
  const [pulseKeys, setPulseKeys] = useState<Partial<Record<SlotKey, number>>>({})
  function flashPurchase(name: string, color: string, cost: number, slot?: SlotKey) {
    const stamp = Date.now()
    setCosmeticToast({ id: stamp, name, color, cost })
    if (slot) setPulseKeys(prev => ({ ...prev, [slot]: stamp }))
  }

  // Confirmation gate for every doubloon purchase in this menu (rod / reel /
  // hook / boat / hat / special). Without it a single fat-fingered tap spent
  // doubloons instantly. Tapping a buy tile now stages the purchase here; the
  // overlay's Buy button runs the real `onConfirm`.
  //
  // `details` is an optional rich body slot — rod purchases render the full
  // stat panel here so the player sees what the rod actually does before
  // spending. Non-rod purchases leave it undefined and fall back to the
  // simple "Buy [Name]?" title-only layout.
  // pendingPurchase now drives both buy and sell confirm dialogs. The
  // `kind` field swaps the copy ('Buy…' / 'Sell…') and the CTA tone
  // (blue purchase / amber refund). For sells, `cost` is the player's
  // refund (positive, displayed as '+N ⟡'). Existing buy callsites
  // default to kind='buy' so they don't need touching.
  const [pendingPurchase, setPendingPurchase] = useState<{
    name: string; color: string; cost: number; onConfirm: () => void | Promise<void>
    details?: React.ReactNode
    kind?: 'buy' | 'sell'
  } | null>(null)
  const [confirming, setConfirming] = useState(false)

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

      {/* ── Visual gear grid ──
          Cosmetic slots (Skin / Hat / Boat — and Pet, once it ships)
          consolidated into a single Appearance tile in the center
          column that spans both rows. The picker inside has internal
          tabs, so adding a new cosmetic type is one entry to the
          tab strip + one summary thumbnail; the gear grid stays a
          clean 3-col / 2-row read.

          The Appearance tile renders a 2×2 mini-grid of equipped
          pieces so the loadout is still legible at a glance without
          tapping in. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gridTemplateRows: 'auto auto', gap: 6 }}>

        <div style={{ gridColumn: '1', gridRow: '1' }}>
          <GearSlot label="Rod" image={rod.slug ? `/${rod.slug}_thumb.png` : (rod.imageUrl ?? '/rod_bamboo_thumb.png')} itemName={rod.name} color={rod.color} glowClass={rodGlowClass(rod)} notify={rodHasAffordable} pulseKey={pulseKeys.rod} onClick={() => setOpenSlot('rod')} />
        </div>
        <div style={{ gridColumn: '1', gridRow: '2' }}>
          <GearSlot label="Hook" image={hook.imageUrl ? hook.imageUrl.replace(/\.png$/, '_thumb.png') : null} itemName={hook.name} color={hook.color} glowClass={hookGlowClass(hook)} notify={hookHasAffordable} pulseKey={pulseKeys.hook} onClick={() => setOpenSlot('hook')} />
        </div>

        {/* Center: APPEARANCE — spans both rows so it has room for the
            multi-thumbnail summary + a richer hit target. */}
        <div style={{ gridColumn: '2', gridRow: '1 / span 2' }}>
          <AppearanceSlot
            characterColor={characterColor}
            charSrc={charSrc}
            equippedHat={equippedHat}
            equippedBoat={equippedBoat}
            equippedPet={equippedPet}
            pulseKey={pulseKeys.appearance}
            onClick={() => setOpenSlot('appearance')}
          />
        </div>

        <div style={{ gridColumn: '3', gridRow: '1' }}>
          <GearSlot label="Reel" image={reel.imageUrl ? reel.imageUrl.replace(/\.png$/, '_thumb.png') : null} icon={<ReelIcon color={reel.color} />} itemName={reel.name} color={reel.color} notify={reelHasAffordable} pulseKey={pulseKeys.reel} onClick={() => setOpenSlot('reel')} />
        </div>
        <div style={{ gridColumn: '3', gridRow: '2' }}>
          <GearSlot label="Line" image={line.imageUrl ?? null} itemName={line.name} color={line.color} onClick={() => setOpenSlot('line')} />
        </div>
      </div>

      {/* Bottom row: Special | Badges (Boat moved into Appearance). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(() => {
          const equippedDef = SPECIAL_ITEMS.find(s => s.id === equippedSpecial)
          return (
            <GearSlot
              label="Special"
              image={equippedDef?.image ?? null}
              icon={<SpecialIcon color={equippedDef ? equippedDef.color : '#5a4a7a'} />}
              itemName={equippedDef ? equippedDef.name : 'None'}
              color={equippedDef ? equippedDef.color : '#5a4a7a'}
              pulseKey={pulseKeys.special}
              onClick={() => setOpenSlot('special')}
              empty={!equippedDef}
            />
          )
        })()}
        {/* Badges */}
        {(() => {
          const equipped = equippedBadges.filter(Boolean)
          const itemName = equipped.length === 0 ? 'None' : `${equipped.length} equipped`
          return (
            <GearSlot
              label="Badges"
              color="#f0c040"
              itemName={itemName}
              onClick={() => setOpenSlot('badge')}
              empty={equipped.length === 0}
              icon={
                equipped.length === 0
                  ? <span style={{ fontSize: '1.1rem', color: '#3a3835' }}>—</span>
                  : (
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                      {equipped.slice(0, 3).map((id, i) => {
                        const badge = BADGE_MAP[id!]
                        return badge ? (
                          <img key={i} src={badge.imageUrl} alt={badge.name} loading="lazy" decoding="async" style={{ width: 11, height: 11, objectFit: 'contain' }} />
                        ) : null
                      })}
                    </div>
                  )
              }
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

      {/* ── Preferences ── single-row toggle for the cast→bite count-up
          shown in the waiting pill. Persists to profiles.show_wait_timer
          so it carries across devices. Sits below the loadout stats so
          gear info reads first, prefs are a quieter foot-of-the-modal
          touch. */}
      <button
        type="button"
        onClick={() => onToggleShowWaitTimer(!showWaitTimer)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          width: '100%',
          background: 'rgba(4,10,20,0.75)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '0.85rem 0.95rem',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e0ddd8' }}>
            Cast timer
          </p>
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#7a7770', marginTop: 2, lineHeight: 1.35 }}>
            Show elapsed seconds while waiting for a bite.
          </p>
        </div>
        <div
          aria-hidden
          style={{
            flexShrink: 0,
            position: 'relative',
            width: 38, height: 22,
            borderRadius: 999,
            background: showWaitTimer ? 'rgba(96,165,250,0.55)' : 'rgba(255,255,255,0.10)',
            border: `1px solid ${showWaitTimer ? 'rgba(96,165,250,0.85)' : 'rgba(255,255,255,0.18)'}`,
            transition: 'background 0.18s, border-color 0.18s',
          }}
        >
          <div style={{
            position: 'absolute',
            top: 2, left: showWaitTimer ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: showWaitTimer ? '#f0ede8' : '#9a9690',
            transition: 'left 0.18s, background 0.18s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
          }} />
        </div>
      </button>

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
                <button
                  onClick={() => setOpenSlot(null)}
                  aria-label="Close"
                  style={{
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '50%',
                    width: 34, height: 34, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#e0ddd8', cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* ── Rod ── */}
              {openSlot === 'rod' && (() => {
                const unownedRodDefs = RODS
                  .filter(r => r.cost > 0 && !r.earnedOnly && !ownedRods.includes(r.tier))
                  .sort((a, b) => a.cost - b.cost)
                const rodLines = rodStatLines(rod)
                const ownedCount = ownedRodDefs.length
                const shopCount  = unownedRodDefs.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AnimatePresence>
                      {cosmeticToast && (
                        <motion.div
                          key={cosmeticToast.id}
                          initial={{ opacity: 0, y: -6, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.96 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                          style={{
                            padding: '0.55rem 0.85rem',
                            borderRadius: 10,
                            background: `linear-gradient(90deg, ${cosmeticToast.color}26, ${cosmeticToast.color}10)`,
                            border: `1px solid ${cosmeticToast.color}80`,
                            boxShadow: `0 0 14px ${cosmeticToast.color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          }}
                        >
                          <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>
                            ✓ Bought <span style={{ color: cosmeticToast.color }}>{cosmeticToast.name}</span> — now equipped
                          </p>
                          <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: cosmeticToast.color }}>
                            −{cosmeticToast.cost.toLocaleString()} ⟡
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Owned / Shop tabs — split the panel so the player
                        sees a focused view at a time. Owned defaults so
                        opening the rod slot lands on "your rods + equipped
                        detail" instead of dumping a buy list. */}
                    <div style={{
                      display: 'flex', gap: 4, padding: 3,
                      background: 'rgba(0,0,0,0.4)', borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      {([
                        { key: 'owned', label: 'Owned', count: ownedCount },
                        { key: 'shop',  label: 'Shop',  count: shopCount  },
                      ] as const).map(t => {
                        const active = rodTab === t.key
                        return (
                          <button
                            key={t.key}
                            onClick={() => setRodTab(t.key)}
                            className="font-karla font-700 uppercase tracking-[0.12em]"
                            style={{
                              flex: 1, padding: '0.55rem 0',
                              background: active ? `${rod.color}1c` : 'transparent',
                              border: `1px solid ${active ? rod.color + '55' : 'transparent'}`,
                              borderRadius: 8,
                              color: active ? rod.color : 'rgba(255,255,255,0.55)',
                              fontSize: '0.7rem',
                              cursor: 'pointer',
                              transition: 'all 0.14s',
                            }}
                          >
                            {t.label} <span style={{ opacity: 0.7, fontWeight: 600 }}>· {t.count}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* ── Owned tab ── */}
                    {rodTab === 'owned' && (
                      <>
                        {/* Equipped rod recap — image + name + compact
                            bullet stats + a Sell pill on the right of
                            the name row when the rod is sellable. Sell
                            here auto-equips Bamboo (server side); the
                            client's onSellRod handler patches state
                            with the returned rodTier so the next render
                            shows Bamboo as the new equipped rod with
                            no jump or re-fetch. */}
                        <div style={{
                          background: `linear-gradient(180deg, ${rod.color}10 0%, rgba(4,10,18,0.85) 100%)`,
                          border: `1px solid ${rod.color}55`,
                          borderRadius: 14,
                          padding: '0.75rem 0.85rem 0.8rem',
                          display: 'flex', flexDirection: 'column', gap: 10,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={rod.slug ? `/${rod.slug}_thumb.png` : (rod.imageUrl ?? '/rod_bamboo_thumb.png')}
                              alt={rod.name}
                              loading="lazy"
                              decoding="async"
                              className={rodGlowClass(rod)}
                              style={{
                                width: 48, height: 48, objectFit: 'contain', flexShrink: 0,
                                ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : { filter: `drop-shadow(0 2px 8px ${rod.color}66)` }),
                              } as React.CSSProperties}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p className="font-karla font-700 uppercase tracking-[0.12em]"
                                style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginBottom: 1 }}>
                                Equipped Rod
                              </p>
                              <p className="font-cinzel font-700"
                                style={{ fontSize: '1rem', color: rod.color, lineHeight: 1.1 }}>
                                {rod.name}
                              </p>
                            </div>
                            {rod.cost > 0 && !rod.earnedOnly && (() => {
                              const refund = Math.floor(rod.cost * 0.65)
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingPurchase({
                                      name: rod.name,
                                      color: '#c4a96a',
                                      cost: refund,
                                      kind: 'sell',
                                      details: (
                                        <div style={{ textAlign: 'center' }}>
                                          <p className="font-karla font-700 uppercase" style={{
                                            fontSize: '0.55rem', letterSpacing: '0.14em',
                                            color: '#c4a96aaa', marginBottom: 4,
                                          }}>
                                            Quick-sell
                                          </p>
                                          <p className="font-cinzel font-700" style={{
                                            fontSize: '1.05rem', color: '#f0d695', marginBottom: 4,
                                          }}>
                                            Sell {rod.name}?
                                          </p>
                                          <p className="font-karla" style={{
                                            fontSize: '0.7rem', color: 'rgba(240,222,168,0.65)', lineHeight: 1.4,
                                          }}>
                                            Refunds {refund.toLocaleString()} ⟡ (65% of {rod.cost.toLocaleString()}). Your Bamboo Rod will be re-equipped automatically.
                                          </p>
                                        </div>
                                      ),
                                      onConfirm: async () => { await onSellRod(rod.tier) },
                                    })
                                  }}
                                  aria-label={`Sell ${rod.name} for ${refund} doubloons`}
                                  title={`Sell for ${refund.toLocaleString()} ⟡`}
                                  className="font-karla font-700 uppercase"
                                  style={{
                                    flexShrink: 0,
                                    padding: '0.4rem 0.7rem',
                                    borderRadius: 8,
                                    background: 'rgba(196,169,106,0.16)',
                                    border: '1px solid rgba(196,169,106,0.55)',
                                    color: '#f0d695',
                                    fontSize: '0.6rem', letterSpacing: '0.1em',
                                    lineHeight: 1.1,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Sell · {refund.toLocaleString()} ⟡
                                </button>
                              )
                            })()}
                          </div>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, listStyle: 'none', padding: 0, margin: 0 }}>
                            {rodLines.map(l => (
                              <StatBullet key={l.title} value={l.value} help={l.help} color={rod.color} />
                            ))}
                          </ul>
                        </div>

                        {ownedCount > 1 && (
                          <>
                            <p className="font-karla font-600 uppercase tracking-[0.14em]"
                              style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.42)', marginTop: 4, paddingLeft: 2 }}>
                              Tap to Swap
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                              {ownedRodDefs.map(r => {
                                const isEquipped = r.tier === equippedRodTier
                                const tagline = rodTagline(r)
                                // Sellable: real-cost rods (not starter, not earned-only) that
                                // aren't currently equipped. 65% return matches the fish
                                // quick-sell rate. Equipped rod is unsellable here — the
                                // player must swap to another rod first, which sidesteps
                                // the "I sold the rod I'm using" recovery path entirely.
                                const sellable = !isEquipped && r.cost > 0 && !r.earnedOnly
                                const refund = sellable ? Math.floor(r.cost * 0.65) : 0
                                return (
                                  <div key={r.tier} style={{ position: 'relative' }}>
                                    <button
                                      onClick={() => { if (!isEquipped) onEquipRod(r.tier) }}
                                      disabled={isEquipped}
                                      className="font-karla font-700"
                                      style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                        padding: '0.6rem 0.4rem 0.5rem',
                                        width: '100%',
                                        borderRadius: 10,
                                        background: isEquipped ? `${r.color}1f` : 'rgba(4,10,18,0.72)',
                                        border: `1px solid ${isEquipped ? r.color + '90' : 'rgba(255,255,255,0.09)'}`,
                                        boxShadow: isEquipped ? `0 0 14px ${r.color}33` : 'none',
                                        cursor: isEquipped ? 'default' : 'pointer',
                                        position: 'relative',
                                      }}
                                    >
                                      <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={r.slug ? `/${r.slug}_thumb.png` : (r.imageUrl ?? '/rod_bamboo_thumb.png')}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          className={rodGlowClass(r)}
                                          style={{
                                            width: 44, height: 44, objectFit: 'contain',
                                            ...(r.glow ? { ['--rod-glow-color' as string]: r.color } : { filter: `drop-shadow(0 1px 6px ${r.color}66)` }),
                                          } as React.CSSProperties}
                                        />
                                      </div>
                                      <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: '#f0ede8', lineHeight: 1.15, textAlign: 'center' }}>
                                        {r.name}
                                      </p>
                                      {isEquipped
                                        ? <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: r.color }}>✓ Equipped</span>
                                        : <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: r.color, lineHeight: 1.2, textAlign: 'center' }}>{tagline}</span>
                                      }
                                    </button>
                                    {sellable && (
                                      // Sell pill — separate tap target sitting in the
                                      // top-right corner so a thumb on the main tile
                                      // (equip) doesn't collide with sell. Muted amber
                                      // tone so it reads as a tertiary action against
                                      // the rod's primary color.
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setPendingPurchase({
                                            name: r.name,
                                            color: '#c4a96a',
                                            cost: refund,
                                            kind: 'sell',
                                            details: (
                                              <div style={{ textAlign: 'center' }}>
                                                <p className="font-karla font-700 uppercase" style={{
                                                  fontSize: '0.55rem', letterSpacing: '0.14em',
                                                  color: '#c4a96aaa', marginBottom: 4,
                                                }}>
                                                  Quick-sell
                                                </p>
                                                <p className="font-cinzel font-700" style={{
                                                  fontSize: '1.05rem', color: '#f0d695', marginBottom: 4,
                                                }}>
                                                  Sell {r.name}?
                                                </p>
                                                <p className="font-karla" style={{
                                                  fontSize: '0.7rem', color: 'rgba(240,222,168,0.65)', lineHeight: 1.4,
                                                }}>
                                                  Refunds {refund.toLocaleString()} ⟡ (65% of {r.cost.toLocaleString()}). You can re-buy it later for full price.
                                                </p>
                                              </div>
                                            ),
                                            onConfirm: async () => { await onSellRod(r.tier) },
                                          })
                                        }}
                                        aria-label={`Sell ${r.name} for ${refund} doubloons`}
                                        title={`Sell for ${refund.toLocaleString()} ⟡`}
                                        className="font-karla font-700 uppercase"
                                        style={{
                                          position: 'absolute', top: 4, right: 4,
                                          padding: '2px 6px',
                                          borderRadius: 6,
                                          background: 'rgba(196,169,106,0.14)',
                                          border: '1px solid rgba(196,169,106,0.45)',
                                          color: '#d4b87a',
                                          fontSize: '0.5rem', letterSpacing: '0.08em',
                                          lineHeight: 1.1,
                                          cursor: 'pointer',
                                          zIndex: 2,
                                        }}
                                      >
                                        Sell
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {/* ── Shop tab ── */}
                    {rodTab === 'shop' && (
                      <>
                        {shopCount === 0 ? (
                          <div style={{
                            padding: '1.4rem 1rem',
                            background: 'rgba(4,10,18,0.5)',
                            border: '1px dashed rgba(255,255,255,0.12)',
                            borderRadius: 12,
                            textAlign: 'center',
                          }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#a09890', marginBottom: 4 }}>
                              You own every rod in the sea.
                            </p>
                            <p className="font-karla" style={{ fontSize: '0.75rem', color: '#6a6460' }}>
                              The shop is bare, Captain.
                            </p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {unownedRodDefs.map(r => {
                              const canAfford = doubloons >= r.cost
                              const onTap = () => {
                                if (!canAfford) return
                                // Build "what changes vs my current rod" deltas. If two
                                // rods are stat-identical (rare but possible across re-skins),
                                // fall back to the new rod's full stat list so the modal
                                // isn't empty.
                                const deltas = rodStatDeltas(rod, r)
                                const fallbackLines = deltas.length === 0 ? rodStatLines(r) : null
                                setPendingPurchase({
                                  name: r.name, color: r.color, cost: r.cost,
                                  onConfirm: async () => { flashPurchase(r.name, r.color, r.cost, 'rod'); await onBuyRod(r.tier) },
                                  details: (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={r.slug ? `/${r.slug}_thumb.png` : (r.imageUrl ?? '/rod_bamboo_thumb.png')}
                                          alt={r.name}
                                          loading="lazy"
                                          decoding="async"
                                          className={rodGlowClass(r)}
                                          style={{
                                            width: 56, height: 56, objectFit: 'contain', flexShrink: 0,
                                            ...(r.glow ? { ['--rod-glow-color' as string]: r.color } : { filter: `drop-shadow(0 2px 8px ${r.color}66)` }),
                                          } as React.CSSProperties}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <p className="font-karla font-700 uppercase tracking-[0.12em]"
                                            style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>
                                            New Rod
                                          </p>
                                          <p className="font-cinzel font-700"
                                            style={{ fontSize: '1.05rem', color: r.color, lineHeight: 1.1 }}>
                                            {r.name}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="font-karla font-300"
                                        style={{ fontSize: '0.82rem', color: '#a09890', lineHeight: 1.5 }}>
                                        {r.description}
                                      </p>
                                      {fallbackLines ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                          {fallbackLines.map(l => (
                                            <StatRow key={l.title} title={l.title} value={l.value} help={l.help} color={r.color} />
                                          ))}
                                        </div>
                                      ) : (
                                        <>
                                          <p className="font-karla font-700 uppercase tracking-[0.12em]"
                                            style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                                            What changes
                                          </p>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {deltas.map(d => (
                                              <StatDeltaRow key={d.title} row={d} color={r.color} />
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  ),
                                })
                              }
                              // Aspirational view: locked rods show "Need X more"
                              // with a progress bar (current doubloons / cost)
                              // along the bottom of the card. Turns "can't afford"
                              // from a dead-end into a goal the player can see
                              // closing as they fish.
                              const need = Math.max(0, r.cost - doubloons)
                              const progressPct = Math.min(1, doubloons / r.cost)
                              return (
                                <button
                                  key={r.tier}
                                  onClick={onTap}
                                  disabled={!canAfford}
                                  className="font-karla"
                                  style={{
                                    position: 'relative',
                                    display: 'flex', flexDirection: 'column', gap: 0,
                                    padding: 0,
                                    borderRadius: 12,
                                    background: 'rgba(4,10,18,0.72)',
                                    border: `1px solid ${canAfford ? r.color + '50' : 'rgba(255,255,255,0.09)'}`,
                                    cursor: canAfford ? 'pointer' : 'default',
                                    opacity: canAfford ? 1 : 0.78,
                                    textAlign: 'left',
                                    width: '100%',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 0.85rem' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={r.slug ? `/${r.slug}_thumb.png` : (r.imageUrl ?? '/rod_bamboo_thumb.png')}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      className={rodGlowClass(r)}
                                      style={{
                                        width: 48, height: 48, objectFit: 'contain', flexShrink: 0,
                                        ...(r.glow ? { ['--rod-glow-color' as string]: r.color } : { filter: `drop-shadow(0 1px 6px ${r.color}66)` }),
                                        opacity: canAfford ? 1 : 0.7,
                                      } as React.CSSProperties}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: canAfford ? '#f0ede8' : '#c4bfb6', lineHeight: 1.15, marginBottom: 2 }}>
                                        {r.name}
                                      </p>
                                      <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: r.color, lineHeight: 1.3, opacity: 0.85 }}>
                                        {rodTagline(r)}
                                      </p>
                                    </div>
                                    <div style={{
                                      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                                      gap: 2, flexShrink: 0,
                                    }}>
                                      <span className="font-karla font-700 uppercase tracking-[0.1em]"
                                        style={{ fontSize: '0.56rem', color: canAfford ? r.color : '#f87171' }}>
                                        {canAfford ? 'Tap to Buy' : `Need ${need.toLocaleString()}`}
                                      </span>
                                      <span className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: canAfford ? '#f0c040' : '#f0c04088' }}>
                                        {r.cost.toLocaleString()} ⟡
                                      </span>
                                    </div>
                                  </div>
                                  {/* Progress bar — only on unaffordable rods.
                                      Sits flush with the card's bottom edge so
                                      it reads as "fill this up". Color matches
                                      the rod so each row has its own goal feel. */}
                                  {!canAfford && (
                                    <div style={{
                                      height: 3, width: '100%',
                                      background: 'rgba(255,255,255,0.06)',
                                      overflow: 'hidden',
                                    }}>
                                      <div style={{
                                        width: `${progressPct * 100}%`, height: '100%',
                                        background: `linear-gradient(90deg, ${r.color}99, ${r.color})`,
                                        boxShadow: `0 0 6px ${r.color}88`,
                                        transition: 'width 0.4s',
                                      }} />
                                    </div>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}

              {/* ── Reel ── */}
              {openSlot === 'reel' && (() => {
                const nextReel = REELS[reelTier + 1]
                const canAffordReel = nextReel ? doubloons >= nextReel.cost : false
                const nextSlowPct = nextReel ? Math.round((1 - nextReel.needleSpeedMultiplier) * 100) : 0
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AnimatePresence>
                      {cosmeticToast && (
                        <motion.div
                          key={cosmeticToast.id}
                          initial={{ opacity: 0, y: -6, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.96 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                          style={{
                            padding: '0.55rem 0.85rem',
                            borderRadius: 10,
                            background: `linear-gradient(90deg, ${cosmeticToast.color}26, ${cosmeticToast.color}10)`,
                            border: `1px solid ${cosmeticToast.color}80`,
                            boxShadow: `0 0 14px ${cosmeticToast.color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          }}
                        >
                          <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>
                            ✓ Upgraded to <span style={{ color: cosmeticToast.color }}>{cosmeticToast.name}</span>
                          </p>
                          <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: cosmeticToast.color }}>
                            −{cosmeticToast.cost.toLocaleString()} ⟡
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {/* Equipped reel detail header */}
                    <div style={{
                      background: `linear-gradient(180deg, ${reel.color}10 0%, rgba(4,10,18,0.85) 100%)`,
                      border: `1px solid ${reel.color}55`,
                      borderRadius: 14,
                      padding: '0.85rem 0.9rem',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div>
                        <p className="font-karla font-700 uppercase tracking-[0.12em]"
                          style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>
                          Equipped Reel
                        </p>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: reel.color, lineHeight: 1.1 }}>{reel.name}</p>
                      </div>
                      <p className="font-karla font-300" style={{ fontSize: '0.82rem', color: '#a09890', lineHeight: 1.5 }}>{reel.description}</p>
                      {dragPct > 0 ? (
                        <StatRow
                          title="Needle Speed"
                          value={`${dragPct}% slower`}
                          help="The catch-zone needle sweeps slower, giving you a bigger window to tap inside the green band."
                          color={reel.color}
                        />
                      ) : (
                        <StatRow
                          title="Needle Speed"
                          value="Standard"
                          help="The needle sweeps at the base speed. Upgrade your reel to slow it down."
                          color={reel.color}
                        />
                      )}
                    </div>
                    {nextReel ? (
                      <button
                        onClick={() => {
                          if (!canAffordReel) return
                          setPendingPurchase({
                            name: nextReel.name, color: nextReel.color, cost: nextReel.cost,
                            onConfirm: async () => { flashPurchase(nextReel.name, nextReel.color, nextReel.cost, 'reel'); await onBuyReel() },
                          })
                        }}
                        disabled={!canAffordReel}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '0.75rem 0.9rem', marginTop: 2,
                          borderRadius: 14,
                          background: canAffordReel ? `${nextReel.color}14` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${canAffordReel ? nextReel.color + '50' : 'rgba(255,255,255,0.1)'}`,
                          cursor: canAffordReel ? 'pointer' : 'default',
                          opacity: canAffordReel ? 1 : 0.72,
                          textAlign: 'left',
                        }}
                      >
                        {nextReel.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={nextReel.imageUrl.replace(/\.png$/, '_thumb.png')}
                            alt={nextReel.name}
                            loading="lazy"
                            decoding="async"
                            style={{
                              width: 44, height: 44, objectFit: 'contain', flexShrink: 0,
                              filter: `drop-shadow(0 1px 6px ${nextReel.color}66)`,
                              opacity: canAffordReel ? 1 : 0.65,
                            }}
                          />
                        ) : (
                          <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ReelIcon color={nextReel.color} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: canAffordReel ? nextReel.color : '#a09890', lineHeight: 1.1 }}>
                              {nextReel.name}
                            </p>
                            <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: `${nextReel.color}aa`, background: `${nextReel.color}14`, border: `1px solid ${nextReel.color}30`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>
                              Upgrade
                            </span>
                          </div>
                          {nextSlowPct > 0 && (
                            <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: `${nextReel.color}cc` }}>
                              Needle {nextSlowPct}% slower
                            </p>
                          )}
                        </div>
                        <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: canAffordReel ? '#f0c040' : '#f0c04088', flexShrink: 0 }}>
                          {nextReel.cost.toLocaleString()} ⟡
                        </span>
                      </button>
                    ) : (
                      <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#6a6764', textAlign: 'center', padding: '0.6rem 0' }}>
                        You have the finest reel in the sea.
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* ── Hook ── */}
              {openSlot === 'hook' && (() => {
                const nextHook = HOOKS[hookTier + 1]
                const canAffordHook = nextHook ? doubloons >= nextHook.cost : false
                const nextZoneBonus = nextHook ? nextHook.tier * 3 : 0
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AnimatePresence>
                      {cosmeticToast && (
                        <motion.div
                          key={cosmeticToast.id}
                          initial={{ opacity: 0, y: -6, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.96 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                          style={{
                            padding: '0.55rem 0.85rem',
                            borderRadius: 10,
                            background: `linear-gradient(90deg, ${cosmeticToast.color}26, ${cosmeticToast.color}10)`,
                            border: `1px solid ${cosmeticToast.color}80`,
                            boxShadow: `0 0 14px ${cosmeticToast.color}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          }}
                        >
                          <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>
                            ✓ Upgraded to <span style={{ color: cosmeticToast.color }}>{cosmeticToast.name}</span>
                          </p>
                          <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: cosmeticToast.color }}>
                            −{cosmeticToast.cost.toLocaleString()} ⟡
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {/* Equipped hook detail header */}
                    <div style={{
                      background: `linear-gradient(180deg, ${hook.color}10 0%, rgba(4,10,18,0.85) 100%)`,
                      border: `1px solid ${hook.color}55`,
                      borderRadius: 14,
                      padding: '0.85rem 0.9rem',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {hook.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hook.imageUrl.replace(/\.png$/, '_thumb.png')}
                            alt={hook.name}
                            loading="lazy"
                            decoding="async"
                            className={hookGlowClass(hook)}
                            style={{
                              width: 56, height: 56, objectFit: 'contain', flexShrink: 0,
                              ...(hook.glow ? {} : { filter: `drop-shadow(0 2px 8px ${hook.color}66)` }),
                            } as React.CSSProperties}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-karla font-700 uppercase tracking-[0.12em]"
                            style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>
                            Equipped Hook
                          </p>
                          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: hook.color, lineHeight: 1.1 }}>{hook.name}</p>
                        </div>
                      </div>
                      <p className="font-karla font-300" style={{ fontSize: '0.82rem', color: '#a09890', lineHeight: 1.5 }}>{hook.description}</p>
                      {hookTier > 0 ? (
                        <StatRow
                          title="Catch Zone"
                          value={`+${hookTier * 3}°`}
                          help="Widens the green band on the dial — bigger window to land a catch on every cast."
                          color={hook.color}
                        />
                      ) : (
                        <StatRow
                          title="Catch Zone"
                          value="Standard"
                          help="Standard hook size. Upgrade to widen the green catch band on the dial."
                          color={hook.color}
                        />
                      )}
                    </div>
                    {nextHook ? (
                      <button
                        onClick={() => {
                          if (!canAffordHook) return
                          setPendingPurchase({
                            name: nextHook.name, color: nextHook.color, cost: nextHook.cost,
                            onConfirm: async () => { flashPurchase(nextHook.name, nextHook.color, nextHook.cost, 'hook'); await onBuyHook() },
                          })
                        }}
                        disabled={!canAffordHook}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '0.75rem 0.9rem', marginTop: 2,
                          borderRadius: 14,
                          background: canAffordHook ? `${nextHook.color}14` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${canAffordHook ? nextHook.color + '50' : 'rgba(255,255,255,0.1)'}`,
                          cursor: canAffordHook ? 'pointer' : 'default',
                          opacity: canAffordHook ? 1 : 0.72,
                          textAlign: 'left',
                        }}
                      >
                        {nextHook.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={nextHook.imageUrl.replace(/\.png$/, '_thumb.png')}
                            alt={nextHook.name}
                            loading="lazy"
                            decoding="async"
                            className={hookGlowClass(nextHook)}
                            style={{
                              width: 44, height: 44, objectFit: 'contain', flexShrink: 0,
                              ...(nextHook.glow ? {} : { filter: `drop-shadow(0 1px 6px ${nextHook.color}66)` }),
                              opacity: canAffordHook ? 1 : 0.65,
                            } as React.CSSProperties}
                          />
                        ) : (
                          <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 10, background: `${nextHook.color}18`, border: `1px solid ${nextHook.color}38` }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: canAffordHook ? nextHook.color : '#a09890', lineHeight: 1.1 }}>
                              {nextHook.name}
                            </p>
                            <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: `${nextHook.color}aa`, background: `${nextHook.color}14`, border: `1px solid ${nextHook.color}30`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>
                              Upgrade
                            </span>
                          </div>
                          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: `${nextHook.color}cc` }}>
                            +{nextZoneBonus}° catch zone
                          </p>
                        </div>
                        <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: canAffordHook ? '#f0c040' : '#f0c04088', flexShrink: 0 }}>
                          {nextHook.cost.toLocaleString()} ⟡
                        </span>
                      </button>
                    ) : (
                      <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#6a6764', textAlign: 'center', padding: '0.6rem 0' }}>
                        You have the best hook in the sea.
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* ── Line ── */}
              {openSlot === 'line' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    background: `linear-gradient(180deg, ${line.color}10 0%, rgba(4,10,18,0.85) 100%)`,
                    border: `1px solid ${line.color}55`,
                    borderRadius: 14,
                    padding: '0.85rem 0.9rem',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div>
                      <p className="font-karla font-700 uppercase tracking-[0.12em]"
                        style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>
                        Equipped Line
                      </p>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: line.color, lineHeight: 1.1 }}>{line.name}</p>
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.82rem', color: '#a09890', lineHeight: 1.5 }}>{line.description}</p>
                    {snagRedPct > 0 ? (
                      <StatRow
                        title="Snag Protection"
                        value={`${snagRedPct}% smaller`}
                        help="Shrinks the red snag bands on the dial. Fewer lost bait, more catches per cast."
                        color={line.color}
                      />
                    ) : (
                      <StatRow
                        title="Snag Protection"
                        value="Standard"
                        help="Standard snag zones. New lines auto-unlock as you discover more species."
                        color={line.color}
                      />
                    )}
                  </div>
                  <p className="font-karla font-300" style={{ fontSize: '0.66rem', color: '#6a6460', lineHeight: 1.5, textAlign: 'center' }}>
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
                        : item.id === 'perfected_sigil' ? hasPerfectedSigil
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
                          onRequestBuy={() => {
                            if (!item.shopCost) return
                            setPendingPurchase({
                              name: item.name, color: item.color, cost: item.shopCost,
                              onConfirm: async () => { flashPurchase(item.name, item.color, item.shopCost ?? 0, 'special'); await onBuySpecialItem(item.id) },
                            })
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Appearance — unified Skin / Hat / Boat picker
                    (Pet tab reserved for when the pet system ships).
                    Tabs let the player swap cosmetic axes without
                    bouncing back to the gear grid; one toast at the
                    top serves all purchases inside this panel. ── */}
              {openSlot === 'appearance' && (
                // min-height keeps the sheet a stable size as the
                // player swaps between Skin / Hat / Boat / Pet — each
                // tab has different content height, so without this
                // the sheet (which anchors to the viewport bottom)
                // resizes on every tab tap and the tab strip visibly
                // jumps. 380px comfortably fits the tallest tab body
                // (Boat grid) on a typical phone; smaller tabs just
                // get extra breathing room below.
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 380 }}>
                  <AnimatePresence>
                    {cosmeticToast && (
                      <motion.div
                        key={cosmeticToast.id}
                        initial={{ opacity: 0, y: -6, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                        style={{
                          padding: '0.55rem 0.85rem',
                          borderRadius: 10,
                          background: `linear-gradient(90deg, ${cosmeticToast.color}26, ${cosmeticToast.color}10)`,
                          border: `1px solid ${cosmeticToast.color}80`,
                          boxShadow: `0 0 14px ${cosmeticToast.color}40`,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        }}
                      >
                        <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>
                          ✓ Bought <span style={{ color: cosmeticToast.color }}>{cosmeticToast.name}</span> — now equipped
                        </p>
                        <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: cosmeticToast.color }}>
                          −{cosmeticToast.cost.toLocaleString()} ⟡
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Tab strip — add a 'pet' entry here when pets ship. */}
                  <div style={{
                    display: 'flex', gap: 4, padding: 3,
                    background: 'rgba(0,0,0,0.4)', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {([
                      { key: 'skin', label: 'Skin' },
                      { key: 'hat',  label: 'Hat'  },
                      { key: 'boat', label: 'Boat' },
                      { key: 'pet',  label: 'Pet'  },
                    ] as const).map(t => {
                      const active = appearanceTab === t.key
                      return (
                        <button
                          key={t.key}
                          onClick={() => setAppearanceTab(t.key)}
                          className="font-karla font-700 uppercase tracking-[0.12em]"
                          style={{
                            flex: 1, padding: '0.55rem 0',
                            background: active ? 'rgba(167,139,250,0.16)' : 'transparent',
                            border: `1px solid ${active ? 'rgba(167,139,250,0.55)' : 'transparent'}`,
                            borderRadius: 8,
                            color: active ? '#c4b5fd' : 'rgba(255,255,255,0.55)',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            transition: 'all 0.14s',
                          }}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* ── Skin tab body ── */}
                  {appearanceTab === 'skin' && (
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
                                if (isActive) return
                                onUpdateColor(c.id)
                              }}
                              style={{ background: 'none', border: 'none', cursor: isUnlocked ? 'pointer' : 'default', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                            >
                              <div style={{
                                width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
                                backgroundImage: `url(${sprites.rest})`,
                                backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat',
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

                  {/* ── Boat tab body ── */}
                  {appearanceTab === 'boat' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#bda05a' }}>Boat Colors</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {/* Default — no overlay */}
                    {(() => {
                      const isEquipped = !equippedBoat
                      return (
                        <button
                          key="default"
                          onClick={() => { if (!isEquipped) onEquipBoat(null) }}
                          className="font-karla font-700"
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: '0.6rem 0.4rem 0.5rem',
                            borderRadius: 10,
                            background: isEquipped ? `${DEFAULT_BOAT_COLOR}1f` : 'rgba(4,10,18,0.72)',
                            border: `1px solid ${isEquipped ? DEFAULT_BOAT_COLOR + '90' : 'rgba(255,255,255,0.09)'}`,
                            boxShadow: isEquipped ? `0 0 14px ${DEFAULT_BOAT_COLOR}33` : 'none',
                            cursor: isEquipped ? 'default' : 'pointer',
                            position: 'relative',
                          }}
                        >
                          <div style={{
                            position: 'relative',
                            width: 48, height: 48, overflow: 'hidden',
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/boat_default_rest.png" alt="" loading="lazy" decoding="async" style={{
                              width: '170%', height: 'auto', display: 'block',
                              position: 'absolute', top: '50%', left: '50%',
                              transform: 'translate(-50%, -50%)',
                            }} />
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: '#f0ede8', lineHeight: 1.1, textAlign: 'center' }}>Driftwood</p>
                          {isEquipped
                            ? <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: DEFAULT_BOAT_COLOR }}>✓ Equipped</span>
                            : <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: '#5a5856' }}>Default</span>
                          }
                        </button>
                      )
                    })()}
                    {BOATS.filter(b => !b.crateOnly || unlockedBoats.includes(b.id)).map(b => {
                      const owned = unlockedBoats.includes(b.id)
                      const isEquipped = equippedBoat === b.id
                      const canAfford = doubloons >= b.cost
                      const tappable = isEquipped ? false : (owned || canAfford)
                      const onTap = () => {
                        if (isEquipped) return
                        if (owned) onEquipBoat(b.id)
                        else if (canAfford) setPendingPurchase({
                          name: b.name, color: b.color, cost: b.cost,
                          onConfirm: () => { onBuyBoat(b.id); flashPurchase(b.name, b.color, b.cost, 'appearance') },
                        })
                      }
                      return (
                        <button
                          key={b.id}
                          onClick={onTap}
                          disabled={!tappable}
                          className="font-karla font-700"
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: '0.6rem 0.4rem 0.5rem',
                            borderRadius: 10,
                            background: isEquipped ? `${b.color}1f` : 'rgba(4,10,18,0.72)',
                            border: `1px solid ${isEquipped ? b.color + '90' : owned ? 'rgba(255,255,255,0.09)' : `${b.color}30`}`,
                            boxShadow: isEquipped ? `0 0 14px ${b.color}33` : 'none',
                            cursor: tappable ? 'pointer' : 'default',
                            opacity: !owned && !canAfford ? 0.72 : 1,
                            position: 'relative',
                          }}
                        >
                          {/* Wrapper hosts the decorative halo for glow boats
                              alongside the clipped thumbnail. Drop-shadow
                              filters on the thumbnail itself get cut off by
                              the 48x48 overflow:hidden, so the halo lives
                              outside that clip. */}
                          <div style={{ position: 'relative', width: 48, height: 48 }}>
                            {b.glow && <div className="boat-glow-halo" aria-hidden />}
                            <div style={{
                              position: 'relative',
                              width: 48, height: 48, overflow: 'hidden',
                              zIndex: 1,
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={b.restImageUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                style={{
                                  width: '170%', height: 'auto', display: 'block',
                                  position: 'absolute', top: '50%', left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  filter: b.glowType === 'ash' ? BOAT_ASH_DARKEN : undefined,
                                }}
                              />
                            </div>
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: owned ? '#f0ede8' : '#a0a09a', lineHeight: 1.1, textAlign: 'center' }}>{b.name}</p>
                          {isEquipped ? (
                            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: b.color }}>✓ Equipped</span>
                          ) : owned ? (
                            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#4ade80' }}>Owned · Tap to equip</span>
                          ) : (
                            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: canAfford ? b.color : '#f0c040' }}>
                              {b.cost.toLocaleString()} ⟡
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                </div>
              )}

              {/* ── Hat tab body ── */}
                  {appearanceTab === 'hat' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#bda05a' }}>Hat Color</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {/* None — no bandana */}
                    {(() => {
                      const isEquipped = !equippedHat
                      const noneColor = '#6a6764'
                      return (
                        <button
                          key="none"
                          onClick={() => { if (!isEquipped) onEquipHat(null) }}
                          className="font-karla font-700"
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: '0.6rem 0.4rem 0.5rem',
                            borderRadius: 10,
                            background: isEquipped ? `${noneColor}1f` : 'rgba(4,10,18,0.72)',
                            border: `1px solid ${isEquipped ? noneColor + '90' : 'rgba(255,255,255,0.09)'}`,
                            boxShadow: isEquipped ? `0 0 14px ${noneColor}33` : 'none',
                            cursor: isEquipped ? 'default' : 'pointer',
                            position: 'relative',
                          }}
                        >
                          <div style={{
                            width: 48, height: 48,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/defaulthat_rest.png"
                              alt="Default"
                              loading="lazy"
                              decoding="async"
                              style={{ width: 38, height: 38, objectFit: 'contain' }}
                            />
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: '#f0ede8', lineHeight: 1.1, textAlign: 'center' }}>Default</p>
                          {isEquipped
                            ? <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: noneColor }}>✓ Equipped</span>
                            : <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: '#5a5856' }}>Built-in</span>
                          }
                        </button>
                      )
                    })()}
                    {HATS.filter(h => !h.crateOnly || unlockedHats.includes(h.id)).map(h => {
                      const owned = unlockedHats.includes(h.id)
                      const isEquipped = equippedHat === h.id
                      const canAfford = doubloons >= h.cost
                      const tappable = isEquipped ? false : (owned || canAfford)
                      const onTap = () => {
                        if (isEquipped) return
                        if (owned) onEquipHat(h.id)
                        else if (canAfford) setPendingPurchase({
                          name: `${h.name} Bandana`, color: h.color, cost: h.cost,
                          onConfirm: () => { onBuyHat(h.id); flashPurchase(`${h.name} Bandana`, h.color, h.cost, 'appearance') },
                        })
                      }
                      return (
                        <button
                          key={h.id}
                          onClick={onTap}
                          disabled={!tappable}
                          className="font-karla font-700"
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: '0.6rem 0.4rem 0.5rem',
                            borderRadius: 10,
                            background: isEquipped ? `${h.color}1f` : 'rgba(4,10,18,0.72)',
                            border: `1px solid ${isEquipped ? h.color + '90' : owned ? 'rgba(255,255,255,0.09)' : `${h.color}30`}`,
                            boxShadow: isEquipped ? `0 0 14px ${h.color}33` : 'none',
                            cursor: tappable ? 'pointer' : 'default',
                            opacity: !owned && !canAfford ? 0.72 : 1,
                            position: 'relative',
                          }}
                        >
                          <div style={{
                            width: 48, height: 48,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={h.restImageUrl}
                              alt={h.name}
                              loading="lazy"
                              decoding="async"
                              style={{ width: 38, height: 38, objectFit: 'contain' }}
                            />
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: owned ? '#f0ede8' : '#a0a09a', lineHeight: 1.1, textAlign: 'center' }}>{h.name}</p>
                          {isEquipped ? (
                            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: h.color }}>✓ Equipped</span>
                          ) : owned ? (
                            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#4ade80' }}>Owned · Tap to equip</span>
                          ) : (
                            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: canAfford ? h.color : '#f0c040' }}>
                              {h.cost.toLocaleString()} ⟡
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

                  {/* ── Pet tab body ── */}
                  {appearanceTab === 'pet' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#a78bfa' }}>Pets</p>
                      <p className="font-karla font-300" style={{ fontSize: '0.66rem', color: '#7a7268', lineHeight: 1.4 }}>
                        Pets are a rare drop from crates — the golden variants are the trophies. Tap to equip; tap the equipped one to put it away.
                      </p>
                      {/* Species sub-tabs — add a new entry to this
                          array when a new species ships. Owned counts
                          on each tab give the player a quick "what do
                          I have here?" read without drilling in. */}
                      <div style={{
                        display: 'flex', gap: 4, padding: 3,
                        background: 'rgba(0,0,0,0.4)', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        {([
                          { key: 'parrot', label: 'Parrots' },
                          { key: 'monkey', label: 'Monkeys' },
                        ] as const).map(t => {
                          const speciesPets = PETS.filter(p => p.species === t.key)
                          const ownedHere = speciesPets.filter(p => unlockedPets.includes(p.id)).length
                          const total = speciesPets.length
                          const active = petSpeciesTab === t.key
                          return (
                            <button
                              key={t.key}
                              onClick={() => setPetSpeciesTab(t.key)}
                              className="font-karla font-700 uppercase tracking-[0.12em]"
                              style={{
                                flex: 1, padding: '0.45rem 0',
                                background: active ? 'rgba(167,139,250,0.16)' : 'transparent',
                                border: `1px solid ${active ? 'rgba(167,139,250,0.55)' : 'transparent'}`,
                                borderRadius: 8,
                                color: active ? '#c4b5fd' : 'rgba(255,255,255,0.55)',
                                fontSize: '0.62rem',
                                cursor: 'pointer',
                                transition: 'all 0.14s',
                              }}
                            >
                              {t.label} <span style={{ opacity: 0.65, fontWeight: 600 }}>· {ownedHere}/{total}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {/* "None" — unequip pet */}
                        {(() => {
                          const isEquipped = !equippedPet
                          const noneColor = '#6a6764'
                          return (
                            <button
                              key="none"
                              onClick={() => { if (!isEquipped) onEquipPet(null) }}
                              className="font-karla font-700"
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                padding: '0.6rem 0.4rem 0.5rem',
                                borderRadius: 10,
                                background: isEquipped ? `${noneColor}1f` : 'rgba(4,10,18,0.72)',
                                border: `1px solid ${isEquipped ? noneColor + '90' : 'rgba(255,255,255,0.09)'}`,
                                boxShadow: isEquipped ? `0 0 14px ${noneColor}33` : 'none',
                                cursor: isEquipped ? 'default' : 'pointer',
                                position: 'relative',
                              }}
                            >
                              <div style={{
                                width: 48, height: 48,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <span style={{ fontSize: '1.4rem', color: '#3a3835' }}>—</span>
                              </div>
                              <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: '#f0ede8', lineHeight: 1.1, textAlign: 'center' }}>None</p>
                              {isEquipped
                                ? <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: noneColor }}>✓ Equipped</span>
                                : <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: '#5a5856' }}>No pet</span>
                              }
                            </button>
                          )
                        })()}
                        {/* All pets in the registry — locked ones rendered as
                            silhouettes so the player sees what they're chasing
                            without revealing the actual colors (gold parrot
                            stays mysterious until they land it). */}
                        {PETS.filter(p => p.species === petSpeciesTab).map(p => {
                          const owned = unlockedPets.includes(p.id)
                          const isEquipped = equippedPet === p.id
                          const tappable = owned
                          const onTap = () => {
                            if (!owned) return
                            if (isEquipped) onEquipPet(null)
                            else onEquipPet(p.id)
                          }
                          return (
                            <button
                              key={p.id}
                              onClick={onTap}
                              disabled={!tappable}
                              className="font-karla font-700"
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                padding: '0.6rem 0.4rem 0.5rem',
                                borderRadius: 10,
                                background: isEquipped ? `${p.accentColor}1f` : 'rgba(4,10,18,0.72)',
                                border: `1px solid ${isEquipped ? p.accentColor + '90' : owned ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)'}`,
                                boxShadow: isEquipped ? `0 0 14px ${p.accentColor}33` : 'none',
                                cursor: tappable ? 'pointer' : 'default',
                                opacity: owned ? 1 : 0.55,
                                position: 'relative',
                              }}
                            >
                              <div style={{
                                width: 48, height: 48,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.restImageUrl}
                                  alt={p.name}
                                  loading="lazy"
                                  decoding="async"
                                  style={{
                                    width: 42, height: 42, objectFit: 'contain',
                                    filter: owned
                                      ? `drop-shadow(0 0 6px ${p.accentColor}55)`
                                      : 'grayscale(1) brightness(0.25)',
                                  }}
                                />
                              </div>
                              <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: owned ? '#f0ede8' : '#5a5856', lineHeight: 1.1, textAlign: 'center' }}>
                                {owned ? p.name.replace(/ (Parrot|Monkey)$/, '') : '???'}
                              </p>
                              {isEquipped ? (
                                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: p.accentColor }}>✓ Equipped</span>
                              ) : owned ? (
                                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#4ade80' }}>Tap to equip</span>
                              ) : (
                                <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#5a5856' }}>Locked</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

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
                            <img src={badge.imageUrl} alt={badge.name} loading="lazy" decoding="async" style={{ width: 36, height: 36, objectFit: 'contain' }} />
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
                            }}
                            style={{
                              background: isEquipped ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${isEquipped ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: 12, padding: '0.65rem 0.4rem',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                              cursor: 'pointer',
                            }}
                          >
                            <img src={badge.imageUrl} alt={badge.name} loading="lazy" decoding="async" style={{ width: 32, height: 32, objectFit: 'contain' }} />
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

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Purchase confirmation ── */}
      <AnimatePresence>
        {pendingPurchase && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => { if (!confirming) setPendingPurchase(null) }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.25rem',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 360,
                maxHeight: '88vh', overflowY: 'auto', overscrollBehavior: 'contain',
                background: 'linear-gradient(180deg, #0e1626 0%, #070b14 100%)',
                border: `1px solid ${pendingPurchase.color}55`,
                borderRadius: 18, padding: '1.1rem 1rem 1rem',
                boxShadow: '0 18px 60px rgba(0,0,0,0.6)',
              }}
            >
              {(() => {
                const isSell = pendingPurchase.kind === 'sell'
                const ctaBg     = isSell ? 'rgba(196,169,106,0.18)' : 'rgba(96,165,250,0.16)'
                const ctaBorder = isSell ? 'rgba(196,169,106,0.6)'  : 'rgba(96,165,250,0.55)'
                const ctaColor  = isSell ? '#f0d695'                : '#cfe2ff'
                const verbing   = isSell ? 'Selling…' : 'Buying…'
                const verbLabel = isSell
                  ? `Sell for +${pendingPurchase.cost.toLocaleString()} ⟡`
                  : `Buy for ${pendingPurchase.cost.toLocaleString()} ⟡`
                return (
                  <>
                    {pendingPurchase.details ? (
                      <div style={{ marginBottom: 14 }}>
                        {pendingPurchase.details}
                      </div>
                    ) : (
                      <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.05rem', color: pendingPurchase.color, marginBottom: 14 }}>
                        {isSell ? `Sell ${pendingPurchase.name}?` : `Buy ${pendingPurchase.name}?`}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        disabled={confirming}
                        onClick={() => setPendingPurchase(null)}
                        className="font-karla font-700 uppercase tracking-[0.08em]"
                        style={{
                          flex: 1, padding: '0.7rem 0',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: 'rgba(240,237,232,0.65)',
                          borderRadius: 12, fontSize: '0.72rem',
                          cursor: confirming ? 'default' : 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={confirming}
                        onClick={async () => {
                          setConfirming(true)
                          await pendingPurchase.onConfirm()
                          setConfirming(false)
                          setPendingPurchase(null)
                        }}
                        className="font-karla font-700 uppercase tracking-[0.08em]"
                        style={{
                          flex: 2, padding: '0.7rem 0',
                          background: ctaBg,
                          border: `1px solid ${ctaBorder}`,
                          color: ctaColor,
                          borderRadius: 12, fontSize: '0.72rem',
                          cursor: confirming ? 'default' : 'pointer',
                          opacity: confirming ? 0.65 : 1,
                        }}
                      >
                        {confirming ? verbing : verbLabel}
                      </button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
