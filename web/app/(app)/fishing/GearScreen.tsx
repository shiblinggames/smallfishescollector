'use client'

import React, { useEffect, useState } from 'react'
import { primevalBorder } from '@/lib/prismatic'
import FinnChargePanel from '@/components/FinnChargePanel'
import { FINN_ITEMS } from '@/lib/finnItems'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getHook, HOOKS, hookGlowClass } from '@/lib/hooks'
import { getEffectiveRod, RODS, rodGlowClass, isCaptainRod, rodHasUniqueEffect, rodEffectLabel, rodSpeedPct, rodStatSplit, completionistDonorAdds, completionistDonorCoveredBy, LOCKED_IN, COMPLETIONIST_TIER, COMPLETIONIST_MAX_EFFECTS, REFORGE_COST } from '@/lib/rods'
import { openMembership } from '@/components/MembershipModal'
import { getReel, REELS } from '@/lib/reels'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { getLine } from '@/lib/lines'
import { playForgeSfx } from '@/lib/fishingMusic'
import { vibrate } from '@/lib/haptics'
import ForgeRodEmblem from './ForgeRodEmblem'
import { IconAnchor } from '@/components/GameIcons'
import { BAITS } from '@/lib/bait'
import { BOATS, DEFAULT_BOAT_COLOR, boatGlowClass, BOAT_ASH_DARKEN, getBoat } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { BADGE_MAP, BADGES } from '@/lib/badges'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { SPECIAL_ITEMS, getSpecialItem, effectiveSpecialDef } from '@/lib/specialItems'
import { PETS, getPet, getPetOverlay, PET_SPECIES_ORDER, PET_SPECIES_LABEL } from '@/lib/pets'
import FisherPose from '@/components/FisherPose'
import LoadoutStats from '@/components/LoadoutStats'

type BaitItem = { bait_type: string; quantity: number }
type SlotKey = 'rod' | 'reel' | 'hook' | 'line' | 'special' | 'special2' | 'badge' | 'skin' | 'hat' | 'boat' | 'pet'

function ShopLink({ href, label, sub, color, onClick }: { href: string; label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.9rem 1rem', borderRadius: 20, background: `${color}12`, border: `1px solid ${color}45`, textDecoration: 'none' }}>
      <div style={{ flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color }}>{label}</p>
        <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: `${color}aa`, marginTop: 2 }}>{sub}</p>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75, flexShrink: 0 }}>
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </Link>
  )
}

function rodTagline(r: typeof RODS[number]): string {
  // Locked-In Rod scales with your perfect streak, so no static trait fits — sum
  // its identity instead (else it would read "Base rod").
  if (r.lockedIn) return `Streak-powered · ×${LOCKED_IN.tripleQty} haul at ${LOCKED_IN.tripleStreak}`
  // Collect every active trait, then return the top 2 joined — rods like
  // the Legendary have both a rarity bonus AND a big speed boost, and the
  // tile was hiding the speed because the old code returned the first match.
  const parts: string[] = []
  if (r.doubleCatchChance >= 1)        parts.push('Always double')
  else if (r.doubleCatchChance > 0)    parts.push(`${Math.round(r.doubleCatchChance * 100)}% double`)
  if ((r.jackpotChance ?? 0) > 0)      parts.push(`×${r.jackpotMultiplier} jackpot`)
  if (r.snagImmune)                    parts.push('Snag immune')
  if (r.retryOnMissChance > 0)         parts.push(`${Math.round(r.retryOnMissChance * 100)}% retry`)
  if (r.perfectZoneBonus > 0)          parts.push(`+${r.perfectZoneBonus}° perfect`)
  if (r.rarityBonus > 0)               parts.push(`+${Math.round(r.rarityBonus * 100)}% rare`)
  if ((r.crateChanceMult ?? 1) > 1)    parts.push(`${r.crateChanceMult}× crate odds`)
  if ((r.perfectXpMult ?? 1) > 1)      parts.push(`${r.perfectXpMult}× perfect XP`)
  if (r.wormhole)                      parts.push('Wormhole reroll')
  if ((r.instantBiteChance ?? 0) > 0)  parts.push(`${Math.round(r.instantBiteChance! * 100)}% instant bite`)
  const speedPct = rodSpeedPct(r)
  if (speedPct > 0)                    parts.push(`${speedPct}% faster`)
  if (r.catchZoneBonus > 0)            parts.push(`+${r.catchZoneBonus}° zone`)
  if (parts.length === 0) return 'Base rod'
  return parts.slice(0, 2).join(' · ')
}

function Pill({ label, color, muted }: { label: string; color?: string; muted?: boolean }) {
  if (muted) return (
    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>{label}</span>
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
// A one-line primer that leads with what the tackle DOES, then how you get the
// next one, because the tiles cannot say it and the three kinds don't work the
// same way: reels and hooks are bought and auto-equipped, lines climb on their
// own as you discover species, and rods are a collection you choose between.
function TackleNote({ text, icon, color }: { text: React.ReactNode; icon: 'up' | 'fish' | 'cards'; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '0.55rem 0.65rem', borderRadius: 11, background: `${color}0e`, border: `1px solid ${color}30` }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1, opacity: 0.85 }} aria-hidden>
        {icon === 'up' && <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>}
        {icon === 'fish' && <><path d="M2 12c3-4 8-6 13-6 4 0 7 3 7 6s-3 6-7 6c-5 0-10-2-13-6z" /><path d="M22 12l-3-3M22 12l-3 3" /></>}
        {icon === 'cards' && <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></>}
      </svg>
      <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#b8b0a6', lineHeight: 1.5 }}>{text}</p>
    </div>
  )
}

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
type RodStatLine = { title: string; value: string; help: string; group: 'base' | 'forged' }
function rodStatLines(r: typeof RODS[number]): RodStatLine[] {
  const lines: RodStatLine[] = []
  // On the Completionist, proc effects are FORGED in from socketed rods, so tag
  // them apart from its fixed master-tool base. Every other rod owns its procs.
  const proc: 'base' | 'forged' = r.tier === COMPLETIONIST_TIER ? 'forged' : 'base'
  // Locked-In Rod: its power is all streak-scaled, so show the three phases
  // instead of the (baseline) static stats.
  if (r.lockedIn) {
    lines.push({ title: `Streak ${LOCKED_IN.speedStreak}`, value: `${Math.round((1 - LOCKED_IN.speedWaitMult) * 100)}% faster bites`, help: 'while you hold a 3-perfect streak', group: 'base' })
    lines.push({ title: `Streak ${LOCKED_IN.tripleStreak}`, value: `×${LOCKED_IN.tripleQty} haul`, help: 'every catch lands three fish at a 5-streak', group: 'base' })
    lines.push({ title: `Streak ${LOCKED_IN.frenzyStreak}`, value: `${Math.round((1 - LOCKED_IN.frenzyWaitMult) * 100)}% faster · +${Math.round(LOCKED_IN.frenzyRarityBonus * 100)}% rare`, help: 'fastest bites and a rare-fish bias at a 10-streak', group: 'base' })
    return lines
  }
  const speedPct = rodSpeedPct(r)
  if (speedPct > 0) {
    lines.push({ title: 'Bite Speed', value: `${speedPct}% faster`, help: 'less waiting between casts', group: 'base' })
  } else if (speedPct < 0) {
    lines.push({ title: 'Bite Speed', value: `${-speedPct}% slower`, help: 'longer wait, made up by other bonuses', group: 'base' })
  }
  if (r.catchZoneBonus > 0) {
    lines.push({ title: 'Catch Zone', value: `+${r.catchZoneBonus}°`, help: 'wider green band on the dial', group: 'base' })
  }
  if (r.perfectZoneBonus > 0) {
    lines.push({ title: 'Perfect Zone', value: `+${r.perfectZoneBonus}°`, help: 'bigger gold zone — easier Perfects', group: 'base' })
  }
  if (r.snagImmune) {
    lines.push({ title: 'Snag Immune', value: 'Yes', help: 'red zones cost no extra bait', group: 'base' })
  }
  if (r.rarityBonus > 0) {
    lines.push({ title: 'Rare Bias', value: `+${Math.round(r.rarityBonus * 100)}%`, help: 'more rares per bite', group: proc })
  }
  if (r.doubleCatchChance >= 1) {
    lines.push({ title: 'Double Catch', value: 'Always', help: 'every catch lands two fish at once', group: proc })
  } else if (r.doubleCatchChance > 0) {
    lines.push({ title: 'Double Catch', value: `${Math.round(r.doubleCatchChance * 100)}% chance`, help: 'sometimes lands two at once', group: proc })
  }
  if (r.retryOnMissChance > 0) {
    lines.push({ title: 'Miss Retry', value: `${Math.round(r.retryOnMissChance * 100)}% chance`, help: 'missed dial sometimes refires', group: proc })
  }
  if ((r.jackpotChance ?? 0) > 0) {
    lines.push({ title: 'Jackpot', value: `×${r.jackpotMultiplier}`, help: 'rare chance at a huge haul — odds rise in shallower zones', group: proc })
  }
  if ((r.crateChanceMult ?? 1) > 1) {
    lines.push({ title: 'Crate Lure', value: `× ${r.crateChanceMult}`, help: 'more treasure crates per cast', group: proc })
  }
  if ((r.perfectXpMult ?? 1) > 1) {
    lines.push({ title: 'Perfect XP', value: `× ${r.perfectXpMult}`, help: 'Perfect catches grant double XP', group: proc })
  }
  if (r.wormhole) {
    lines.push({ title: 'Wormhole', value: 'Reroll', help: 'reroll any catch into another fish from the same zone — better or worse', group: proc })
  }
  if ((r.instantBiteChance ?? 0) > 0) {
    lines.push({ title: 'Lightspeed', value: `${Math.round(r.instantBiteChance! * 100)}%`, help: 'chance a bite comes almost instantly', group: proc })
  }
  if (lines.length === 0) {
    lines.push({ title: 'Base Rod', value: '—', help: 'standard rod — no bonuses', group: 'base' })
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
  const curSpeed = rodSpeedPct(current)
  const nxtSpeed = rodSpeedPct(next)
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
  // Drawn chevron, not ▲▼ text glyphs — the old arrows read as a spreadsheet
  // diff; a small stroked chevron reads as the needle of a gauge moving.
  const arrow = row.delta === 'same'
    ? <span aria-hidden style={{ width: 11, textAlign: 'center', color: deltaColor }}>·</span>
    : (
      <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={deltaColor} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        {row.delta === 'up' ? <path d="M5 15l7-7 7 7" /> : <path d="M5 9l7 7 7-7" />}
      </svg>
    )
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr auto',
      alignItems: 'center', gap: 10,
      padding: '0.55rem 0.7rem',
      background: 'rgba(24,17,8,0.55)',
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
      {arrow}
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

// A compact key for the owned / equipped / locked badges used across the
// skin + boat pickers, so the at-a-glance states are self-explanatory.
function CosmeticLegend() {
  const CheckDot = ({ bg, stroke }: { bg: string; stroke: string }) => (
    <span style={{ display: 'inline-flex', width: 15, height: 15, borderRadius: '50%', background: bg, border: '1.5px solid #0a0f18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
    </span>
  )
  const item = { display: 'inline-flex', alignItems: 'center', gap: 4 } as const
  const txt = { fontSize: '0.56rem', color: '#8a877e' } as const
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', margin: '-2px 0 2px' }}>
      <span style={item}><CheckDot bg="rgba(14,22,16,0.96)" stroke="#5fce8a" /><span className="font-karla font-600" style={txt}>Owned</span></span>
      <span style={item}><CheckDot bg="#60a5fa" stroke="#fff" /><span className="font-karla font-600" style={txt}>Equipped</span></span>
      <span style={item}>
        <span style={{ display: 'inline-flex', width: 15, height: 15, borderRadius: '50%', background: 'rgba(12,14,18,0.96)', border: '1.5px solid #0a0f18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.6" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </span>
        <span className="font-karla font-600" style={txt}>Locked</span>
      </span>
    </div>
  )
}

function SpecialItemRow({
  item, owned, isEquipped, tideTurnerSkipsLeft, lockReason, upgradeNote,
  onEquip, onRequestBuy,
}: {
  item: import('@/lib/specialItems').SpecialItemDef
  owned: boolean
  isEquipped: boolean
  tideTurnerSkipsLeft: number
  /** When set (and not owned), the item is gated: shows a lock + this reason
   *  instead of a Buy button. */
  lockReason?: string | null
  /** Owned but upgradeable elsewhere (the Auto Caster's Locker upgrade):
   *  a quiet pointer line under the card body. */
  upgradeNote?: string | null
  onEquip: () => void
  onRequestBuy: () => void
}) {
  const locked = !owned && !!lockReason
  // An item is "for sale" if it carries a price in either currency.
  const isFathoms = typeof item.costFathoms === 'number'
  const price = item.shopCost ?? item.costFathoms
  const forSale = price != null
  const priceLabel = isFathoms ? `${price} Fathoms` : `${(price ?? 0).toLocaleString()}`
  return (
    <div style={{
      background: isEquipped ? `${item.color}10` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isEquipped ? item.color + '50' : owned ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 14,
      padding: '0.75rem 0.9rem',
      opacity: owned || forSale ? 1 : 0.5,
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
              <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: owned ? item.color : forSale ? '#a09890' : '#4a4845', lineHeight: 1 }}>{item.name}</p>
              <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: `${item.color}88`, background: `${item.color}14`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>{item.effectLabel}</span>
            </div>
            <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: owned ? '#7a7268' : forSale ? '#6a6460' : '#4a4845', lineHeight: 1.45 }}>{item.description}</p>
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
        {!owned && forSale && !locked && (
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
            <span style={{ fontSize: '0.58rem', color: isFathoms ? item.color : '#f0c040', display: 'block', lineHeight: 1.3 }}>{priceLabel}</span>
          </button>
        )}
        {locked && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, padding: '0.3rem 0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8f877a" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: '#9a907c' }}>{isFathoms ? `${price} Fathoms` : `${(price ?? 0).toLocaleString()} ⟡`}</span>
          </div>
        )}
      </div>
      {locked && (
        <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#caa05a', marginTop: 4, lineHeight: 1.4 }}>
          {lockReason}
        </p>
      )}
      {upgradeNote && (
        <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#caa05a', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${item.color}18`, lineHeight: 1.4 }}>
          {upgradeNote}
        </p>
      )}
      {owned && item.id === 'tide_turner' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: `1px solid ${item.color}18` }}>
          <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', color: `${item.color}88` }}>Skips today</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: tideTurnerSkipsLeft > 0 ? item.color : '#4a4845', lineHeight: 1 }}>{tideTurnerSkipsLeft} / 3</p>
        </div>
      )}
      {!owned && !forSale && (
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

/** WHAT A SLOT'S OUTLINE MEANS.
 *
 *  Every tile used to outline itself in its own item's rarity colour, so the
 *  grid showed eight or nine different borders at once and none of them meant
 *  anything you could act on: a gold border was a gold-tier rod in one tile and
 *  the Badges slot in the next. The outline now says what KIND of thing the
 *  slot holds, which is the only grouping that stays true as items change.
 *
 *  Rarity did not disappear, it moved: the thumbnail keeps the item's own
 *  colour in its drop-shadow and glow, where it belongs, because that is about
 *  the item and not the slot. */
const SLOT_FAMILY = {
  /** Rod, Reel, Hook, Line. The tackle you upgrade. */
  gear:     '#7dd3fc',
  /** Skin, Hat, Boat, Pet. Looks only, no stats. */
  cosmetic: '#a78bfa',
  /** The two special slots. */
  special:  '#63e2b7',
  /** Badges. */
  badge:    '#f0c040',
} as const

function GearSlot({
  label, image, icon, itemName, color, accent, onClick, small, empty, glowClass, notify, pulseKey, primeval,
}: {
  label: string
  image?: string | null
  icon?: React.ReactNode
  itemName: string
  /** The ITEM's colour — drives the thumbnail glow and drop-shadow only. */
  color: string
  /** The SLOT FAMILY's colour, for the outline. Falls back to the item colour
   *  so a slot that has not been assigned a family still renders sanely. */
  accent?: string
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
  /** THE SUNKEN HAND slot. Takes one item and nothing else, so it wears the
   *  primeval border instead of the flat rarity tint every other slot uses. It
   *  should not read as an ordinary slot that happens to be empty. */
  primeval?: boolean
}) {
  const glow = !!glowClass
  // The outline is the family; the thumbnail keeps the item's own colour.
  const outline = accent ?? color
  return (
    <motion.button
      onClick={onClick}
      animate={pulseKey ? {
        boxShadow: [
          `0 0 0 0 ${outline}cc`,
          `0 0 0 16px ${outline}00`,
          `0 0 0 0 ${outline}00`,
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
        // Fills its grid cell so every tile in a row is the same height. The
        // row is then as tall as its tallest member, which is what lets Rod
        // and Reel match the preview card instead of floating short.
        height: '100%',
        ...(primeval
          ? primevalBorder('rgba(18,11,14,0.86)', empty)
          : {
              border: `1px solid ${outline}${empty ? '28' : '40'}`,
              background: 'rgba(255,255,255,0.04)',
            }),
        borderRadius: 20,
        padding: small ? '0.55rem 0.4rem' : '0.65rem 0.5rem',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
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
              width={36}
              height={36}
              className={glowClass}
              style={{
                width: 36, height: 36, objectFit: 'contain',
                ...(glow ? { ['--rod-glow-color' as string]: color } : { filter: `drop-shadow(0 2px 6px ${color}55)` }),
              } as React.CSSProperties}
            />
          : icon
        }
      </div>
      {/* Both lines truncate. A long name like "Angler's Formula" or
          "Charcoal Parrot" used to wrap onto a second line, and because the
          grid rows are auto-height, one long name in one tile grew the whole
          row and shunted everything below it down. minWidth:0 is the part
          that actually lets ellipsis happen inside a flex column. */}
      <div style={{ textAlign: 'center', width: '100%', minWidth: 0 }}>
        <p className="font-karla font-600 uppercase" style={{
          fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', marginBottom: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={label}>{label}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.72rem', color: empty ? '#2e2c2a' : '#d0cdc8', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={itemName}>{itemName}</p>
      </div>
    </motion.button>
  )
}

// ── The fisher, as they actually look ────────────────────────────────────
// A full uncropped composite of everything equipped, using the SAME layered
// stack and coordinates as the live fishing scene and the zone selector.
//
// This replaces a tile that squeezed the same composite into a small card with
// overflow:hidden, deliberately pushing the character box left so the rod's
// fishing line got clipped off. It read as a cropped, slightly broken version
// of the boat rather than a preview of your loadout, which is the whole job.
//
// Not a button. The pickers are the four rows underneath it now, so the
// preview has nothing to open and shouldn't invite a tap that goes nowhere.
function FisherPreview({
  characterColor, equippedHat, equippedBoat, equippedPet, equippedPetBow, rodTier, reelTier, hookTier,
}: {
  characterColor: string
  equippedHat: string | null
  equippedBoat: string | null
  equippedPet: string | null
  /** Front-facing pet in the bow slot (rides alongside the stern pet). */
  equippedPetBow?: string | null
  rodTier: number
  reelTier: number
  hookTier: number
}) {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      minHeight: 92,
      borderRadius: 20,
      // Same outline as the cosmetic tiles it sits with.
      border: `1px solid ${SLOT_FAMILY.cosmetic}40`,
      // Static box-shadow rather than a filter on the composite inside: this
      // composites, a filter would rasterise.
      boxShadow: 'inset 0 -18px 26px -18px rgba(0,10,25,0.75)',
      // Solid base under the tint: this sits over the painted gear backdrop.
      background: 'linear-gradient(180deg, rgba(167,139,250,0.10) 0%, rgba(167,139,250,0.02) 100%), #0b1018',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      // MUST clip. FisherPose's overlays are absolutely positioned in
      // percentages of this box and genuinely run past it: the hook alone is
      // 204.5% wide at left -10.5%, so the composite spans roughly -11% to
      // 194%. Without this the widest child sets the modal's scroll width and
      // the whole sheet slides sideways.
      //
      // Clipping was never the old tile's problem. Shoving the character box
      // LEFT so the rod line got cut off was. Centred, the only things the
      // edges take are the far tip of the rod line and the hook, which is
      // exactly what the live scene does too.
      overflow: 'hidden',
      flexDirection: 'column',
      padding: '0.3rem 0.2rem 0.35rem',
    }}>
      {/* THE DEAD SPACE. The character sprite is 900x800 with the figure
          occupying only the bottom 55.5% of it, so 42.1% of this box was
          empty sky above the fisher's head, and the boat/hat/pet overlays are
          all positioned lower still. Measured, not guessed.
          Negative margins pull the layout box in to just the content.
          Percentage margins resolve against the containing block's WIDTH, not
          its height, so these are the dead space converted: the pose is
          0.889x as tall as it is wide, and 42.1% x 0.889 is 37.4% of width
          above, 2.4% x 0.889 is 2.1% below. Backed off the top figure
          slightly so the hat never touches the border: this lands ~3.9%
          headroom above the head and ~1.3% under the hull. */}
      {/* NO filter on this wrapper. A filter here would put all seven layered
          images into one rasterised layer purely for a decorative shadow, and
          any child animating its own filter would then force that whole layer
          to re-rasterise every frame. The card's box-shadow does the same job
          for free, because it composites instead of painting. */}
      <div style={{
        width: '100%',
        marginTop: '-34%',
        marginBottom: '-1%',
      }}>
        <FisherPose
          characterColor={characterColor}
          equippedHat={equippedHat}
          equippedBoat={equippedBoat}
          equippedPet={equippedPet}
          equippedPetBow={equippedPetBow}
          rodTier={rodTier}
          reelTier={reelTier}
          hookTier={hookTier}
          // The rod, hook and boat glows animate filter: drop-shadow forever.
          // Three per-frame blur passes for a halo that is a few pixels wide
          // at this size is not worth it; the slot thumbnails still glow, so
          // a legendary rod still reads as one.
          noGlow
        />
      </div>
      {/* Says what it is. Without this it reads as a slot you should be able
          to tap, which it deliberately is not. */}
      <p className="font-karla font-600 uppercase" style={{
        fontSize: '0.56rem', letterSpacing: '0.18em',
        color: 'rgba(196,181,253,0.65)', marginTop: 4,
      }}>
        Preview
      </p>
    </div>
  )
}

export default function GearScreen({
  baitInventory, selectedBait, onSelectBait,
  equippedRodTier, ownedRods, onEquipRod, onBuyRod, onSellRod,
  completionistEffects, hasForgedBefore, onCompletionistEffectsChange,
  reelTier, hookTier, lineTier, onBuyReel, onBuyHook,
  rodHasAffordable, reelHasAffordable, hookHasAffordable,
  characterColor, equippedBadges, unlockedCharacterColors, unlockedBadges, onUpdateColor, onBuyColor, onEquipBadge,
  equippedBoat, unlockedBoats, onEquipBoat, onBuyBoat, doubloons, gems,
  equippedHat, unlockedHats, onEquipHat, onBuyHat,
  equippedPet, equippedPetBow, unlockedPets, onEquipPet,
  hasTideTurner, tideTurnerSkipsLeft, hasPhantomHook, hasAutoCaster, hasAutoCatcher, gauntletDeepest, hasPerfectedSigil,
  equippedSpecial, onEquipSpecial, onBuySpecialItem, equippedSpecial2, onEquipSpecial2, hasDeepReel = false, hasAnglersPatience = false, anglersPatienceXp = 0,
  fishingLevel,
  zoneGoldenBoostPct = 0,
  isPremium,
  showWaitTimer,
  onToggleShowWaitTimer,
  showStats = true,
  onClose,
  autoOpenAppearance = false,
  onAppearanceAutoOpened,
}: {
  /** Golden boost % for the zone currently being fished (post-Max-Prestige wipes). */
  zoneGoldenBoostPct?: number
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
  /** Completionist forge: rod tiers whose unique effects are folded into
   *  the Completionist (up to COMPLETIONIST_MAX_EFFECTS). */
  completionistEffects: number[]
  /** Has the player already done their FREE first forge (re-forges cost). */
  hasForgedBefore: boolean
  /** Persist a new forge loadout (validated + charged server-side). Returns the
   *  outcome so the panel can roll back / show an error. */
  onCompletionistEffectsChange: (tiers: number[]) => Promise<{ ok: true } | { error: string }>
  reelTier: number
  hookTier: number
  lineTier: number
  onBuyReel: () => Promise<void>
  onBuyHook: () => Promise<void>
  rodHasAffordable: boolean
  reelHasAffordable: boolean
  hookHasAffordable: boolean
  characterColor: string
  equippedBadges: string[]
  unlockedCharacterColors: string[]
  unlockedBadges: string[]
  onUpdateColor: (colorId: string) => void
  onBuyColor: (colorId: string) => Promise<{ ok: true } | { error: string }>
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
  /** Front-facing pet in the bow slot (rides alongside the stern pet). */
  equippedPetBow?: string | null
  unlockedPets: string[]
  onEquipPet: (id: string | null) => void
  doubloons: number
  gems: number
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasAutoCatcher: boolean
  gauntletDeepest: number
  hasPerfectedSigil: boolean
  equippedSpecial: string | null
  onEquipSpecial: (itemId: string | null) => void
  /** THE DEEP REEL, the second special slot. Opened by beating Finn (see the
   *  spoils node) and it accepts ONE item, his eye. Kept separate from the
   *  first slot rather than widening it, because it is not a general slot. */
  equippedSpecial2?: string | null
  onEquipSpecial2?: (itemId: string | null) => void
  hasDeepReel?: boolean
  hasAnglersPatience?: boolean
  /** Charge on The Primeval Eye. Read-only here; the server owns it. */
  anglersPatienceXp?: number
  onBuySpecialItem: (itemId: string) => Promise<void>
  fishingLevel: number
  isPremium: boolean
  showWaitTimer: boolean
  onToggleShowWaitTimer: (next: boolean) => void
  /** Hide the loadout-stats panel from the third tab. The Shipyard shows the
   *  same panel up beside the boat, and two of them on one page is one too
   *  many; the tab then holds preferences only and says so. */
  showStats?: boolean
  onClose: () => void
  /** When true (e.g. arriving via a /fishing?gear=appearance deep link), open
   *  straight to the Appearance picker on mount. */
  autoOpenAppearance?: boolean
  /** Fired once the auto-open has been consumed, so the parent can clear the
   *  flag and not re-trigger on a later drawer re-open. */
  onAppearanceAutoOpened?: () => void
}) {
  const [openSlot, setOpenSlot] = useState<SlotKey | null>(null)
  // Deep-link (mail CTA): open straight to the Appearance picker, then tell the
  // parent to drop the flag so re-opening the drawer later doesn't force it again.
  useEffect(() => {
    if (!autoOpenAppearance) return
    // The mail CTA used to open the tabbed sheet on whatever tab was last
    // used. With the tabs gone it lands on Skin, the cosmetic those mails grant.
    setOpenSlot('skin')
    onAppearanceAutoOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAppearance])
  // The modal was doing five jobs in one scroll (gear grid, appearance, badges, the
  // shop link, a heavy stats card, a prefs toggle), which is why it felt overwhelming.
  // Three tabs, each with one job: LOADOUT (what you're using), SHOP (what you can buy),
  // STATS (what it adds up to).
  const [tab, setTab] = useState<'loadout' | 'shop' | 'stats'>('loadout')
  // The rod sheet opens to EQUIP (from the Loadout tile) or to BUY (from the Shop tab's
  // "Browse"). No in-sheet toggle — the entry point sets it. Resets to equip on close.
  const [rodView, setRodView] = useState<'owned' | 'shop'>('owned')
  // The slot detail sheet portals to <body>, so `mounted` gates it until the client
  // has document. See the modal block below for why the portal is necessary.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const [selectedBadgeSlot, setSelectedBadgeSlot] = useState<0 | 1 | 2 | null>(null)
  useEffect(() => { if (openSlot !== 'badge') setSelectedBadgeSlot(null) }, [openSlot])
  useEffect(() => { if (openSlot !== 'rod') setRodView('owned') }, [openSlot])
  // Pets no longer use species sub-tabs — each species gets its own
  // horizontal scrollable row, all visible at once.

  // Transient confirmation banner for cosmetic purchases. Clears itself after
  // 2.5s so the player gets a clear "you bought + equipped X" moment instead
  // of the menu silently closing.
  const [cosmeticToast, setCosmeticToast] = useState<{ id: number; name: string; color: string; cost: number; currency?: 'doubloons' | 'gems' } | null>(null)
  // Tapping a skin/boat/hat/pet thumbnail opens a detail modal (equip / buy / how-to-unlock).
  const [cosmeticDetail, setCosmeticDetail] = useState<{ kind: 'skin' | 'boat' | 'hat' | 'pet'; id: string } | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
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
  function flashPurchase(name: string, color: string, cost: number, slot?: SlotKey, currency?: 'doubloons' | 'gems') {
    const stamp = Date.now()
    setCosmeticToast({ id: stamp, name, color, cost, currency })
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
    /** When false, the dialog still shows the item's info but the CTA is a
     *  disabled "Need X more" instead of a Buy button. Omitted = affordable. */
    affordable?: boolean
    /** Reason the CTA is locked beyond price (e.g. a level gate) — shown on
     *  the disabled CTA in place of "Need X more". */
    lockedNote?: string
    /** Currency the cost is denominated in. Defaults to doubloons (⟡). Fathoms
     *  (the Gauntlet currency) skip the local doubloon-affordability check —
     *  the server enforces the balance and returns its own error. */
    currency?: 'doubloons' | 'fathoms' | 'gems'
  } | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Forge juice — a spark burst keyed to the last staged/removed effect, plus
  // SFX + haptic. Forging is now STAGE-then-COMMIT: tapping a rod only arranges
  // the bench (stagedEffects); a Re-Forge button commits (free first time, then
  // a doubloon fee) and plays the cinematic merge.
  const [forgeBurst, setForgeBurst] = useState<{ id: number; color: string; dir: 'in' | 'out' } | null>(null)
  const [forgePulse, setForgePulse] = useState(0)
  const [forgeAccent, setForgeAccent] = useState('#f3d98a')
  // The bench: what the player is arranging, before committing. Resyncs to the
  // saved loadout whenever it changes (initial / after a commit / rollback).
  const [stagedEffects, setStagedEffects] = useState<number[]>(completionistEffects)
  useEffect(() => { setStagedEffects(completionistEffects) }, [completionistEffects])
  // Commit-time cinematic (donor rods streaking into the Completionist) + guards.
  const [forgeCinematic, setForgeCinematic] = useState<{ donors: { color: string; slug: string | null }[] } | null>(null)
  const [forgeBusy, setForgeBusy] = useState(false)
  const [forgeErr, setForgeErr] = useState<string | null>(null)

  function toggleStaged(tier: number, color: string) {
    if (forgeBusy) return
    const selected = stagedEffects.includes(tier)
    // FULL BENCH SWAPS rather than refusing. It used to grey every other rod out
    // at 3/3, so changing your mind meant scrolling up to find the one you
    // wanted gone, removing it, then scrolling back down to the one you wanted.
    // Tapping a new rod now pushes out the OLDEST staged effect, which is the
    // one you picked longest ago and are least likely to be defending.
    const next = selected
      ? stagedEffects.filter(t => t !== tier)
      : stagedEffects.length >= COMPLETIONIST_MAX_EFFECTS
        ? [...stagedEffects.slice(1), tier]
        : [...stagedEffects, tier]
    const dir: 'in' | 'out' = selected ? 'out' : 'in'
    setForgeBurst({ id: Date.now(), color, dir })
    setForgePulse(p => p + 1)
    if (dir === 'in') setForgeAccent(color)
    try {
      playForgeSfx(dir === 'out')
      vibrate(dir === 'in' ? [12, 28, 22] : 14)
    } catch {}
    setStagedEffects(next)
    setForgeErr(null)
  }

  // Has the bench changed from what's saved? Drives the Re-Forge / Discard row.
  const savedForgeSet = new Set(completionistEffects)
  const forgeDirty = stagedEffects.length !== completionistEffects.length || stagedEffects.some(t => !savedForgeSet.has(t))
  // Fee: free the first time (or when clearing); flat REFORGE_COST after.
  const reforgeCost = (hasForgedBefore && stagedEffects.length > 0 && forgeDirty) ? REFORGE_COST : 0
  const canAffordReforge = doubloons >= reforgeCost

  function commitForge() {
    if (!forgeDirty || forgeBusy) return
    if (reforgeCost > 0 && !canAffordReforge) { setForgeErr(`Need ${REFORGE_COST.toLocaleString()} ⟡ to re-forge`); return }
    setForgeErr(null)
    setForgeBusy(true)
    const staged = stagedEffects
    const donors = staged.map(t => {
      const r = RODS.find(rr => rr.tier === t)
      return { color: r?.color ?? '#e8c84a', slug: r?.slug ?? null }
    })
    setForgeCinematic({ donors })
    try { playForgeSfx(false); vibrate([0, 30, 50, 40, 90, 55]) } catch {}
    // Commit once the merge animation has landed.
    setTimeout(async () => {
      const res = await onCompletionistEffectsChange(staged)
      setForgeCinematic(null)
      setForgeBusy(false)
      if ('error' in res) { setForgeErr(res.error); setStagedEffects(completionistEffects) }
    }, 1400)
  }

  function discardForge() {
    if (forgeBusy) return
    setStagedEffects(completionistEffects)
    setForgeErr(null)
  }

  const rod  = getEffectiveRod(equippedRodTier, completionistEffects)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)
  const bait = BAITS.find(b => b.type === selectedBait)

  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const ownedRodDefs = RODS.filter(r => (r.cost === 0 && !r.earnedOnly) || ownedRods.includes(r.tier))

  // Completionist forge: only surfaced when the Completionist is the EQUIPPED rod
  // (no point cluttering the rod tab with the forge bench while another rod is in
  // hand). Equipped implies owned. forgeableRods = owned rods that can donate.
  const completionistEquipped = rod.tier === COMPLETIONIST_TIER
  const forgeableRods = ownedRodDefs.filter(rodHasUniqueEffect)

  const dragPct    = Math.round((1 - reel.needleSpeedMultiplier) * 100)
  const snagRedPct = Math.round((1 - line.penaltyMultiplier) * 100)

  // ── Compute all active bonuses ──
  const catchZoneBonus = (hookTier * 3) + rod.catchZoneBonus + (bait?.catchZoneBonus ?? 0)

  type SpecialBonus = { label: string; color: string }
  const specialBonuses: SpecialBonus[] = []
  if (rod.doubleCatchChance > 0) specialBonuses.push({ label: rod.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(rod.doubleCatchChance * 100)}% double catch`, color: rod.color })
  if (rod.retryOnMissChance > 0) specialBonuses.push({ label: `${Math.round(rod.retryOnMissChance * 100)}% retry on miss`, color: rod.color })
  if (rod.snagImmune) specialBonuses.push({ label: 'Snag immune', color: rod.color })
  if ((rod.jackpotChance ?? 0) > 0) specialBonuses.push({ label: `×${rod.jackpotMultiplier} jackpot · odds rise in shallows`, color: rod.color })
  if (rod.rarityBonus > 0) specialBonuses.push({ label: `+${Math.round(rod.rarityBonus * 100)}% rare fish`, color: rod.color })
  // Locked-In Rod: its three streak phases, coloured to match the rod glow.
  if (rod.lockedIn) {
    specialBonuses.push({ label: `Streak ${LOCKED_IN.speedStreak}: ${Math.round((1 - LOCKED_IN.speedWaitMult) * 100)}% faster bites`, color: '#22d3ee' })
    specialBonuses.push({ label: `Streak ${LOCKED_IN.tripleStreak}: ×${LOCKED_IN.tripleQty} haul every catch`, color: '#f0c040' })
    specialBonuses.push({ label: `Streak ${LOCKED_IN.frenzyStreak}: ${Math.round((1 - LOCKED_IN.frenzyWaitMult) * 100)}% faster + ${Math.round(LOCKED_IN.frenzyRarityBonus * 100)}% rare`, color: '#e879f9' })
  }
  const levelBiteBonus = Math.round(((fishingLevel - 1) / 99) * 33)
  const baitBiteEffect = bait ? Math.round((1 - bait.waitMult) * 100) : 0
  const totalBiteEffect = baitBiteEffect + levelBiteBonus

  return (
    // overflowX hidden as a backstop, NOT as the fix. The fisher preview clips
    // its own composite; this is here so that if any future child overruns the
    // width, the sheet still cannot be dragged sideways. A gear modal should
    // never scroll horizontally, whatever is inside it.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflowX: 'hidden' }}>

      {/* ── TABS ── one job per screen. */}
      <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 3 }}>
        {([['loadout', 'Loadout'], ['shop', 'Shop'], ['stats', showStats ? 'Stats' : 'Settings']] as const).map(([key, label]) => {
          const on = tab === key
          return (
            <button key={key} type="button" onClick={() => setTab(key)}
              className="font-karla font-800 uppercase tracking-[0.1em] tap"
              style={{
                flex: 1, padding: '0.72rem 0', borderRadius: 10, fontSize: '0.76rem', cursor: 'pointer',
                border: on ? '1px solid rgba(240,192,64,0.55)' : '1px solid transparent',
                color: on ? '#f5d98a' : 'rgba(255,255,255,0.6)',
                background: on ? 'linear-gradient(180deg, rgba(240,192,64,0.22), rgba(224,168,46,0.10))' : 'transparent',
                boxShadow: on ? 'inset 0 0 14px rgba(240,192,64,0.12)' : 'none',
              }}>
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'loadout' && (<>
      {/* ── The loadout grid ──
          ONE grid for all twelve slots rather than three stacked grids. The
          rows used to be separate containers, which is why the bottom two did
          not match the top two: each grid sized its own rows from its own
          content, and the gaps between grids were margins rather than the
          grid's own gap.
          
          gridTemplateRows: repeat(4, 1fr) is what equalises the heights. In an
          auto-height grid, fr rows all resolve to the tallest row's content,
          so every card on the screen is the size of the tallest one, and gap
          handles every space between them identically. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.6fr 1fr',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: 6,
      }}>

        <div style={{ gridColumn: '1', gridRow: '1' }}>
          <GearSlot label="Rod" accent={SLOT_FAMILY.gear} image={rod.slug ? `/${rod.slug}_thumb.png` : (rod.imageUrl ?? '/rod_bamboo_thumb.png')} itemName={rod.name} color={rod.color} glowClass={rodGlowClass(rod)} notify={rodHasAffordable} pulseKey={pulseKeys.rod} onClick={() => { setRodView('owned'); setOpenSlot('rod') }} />
        </div>
        <div style={{ gridColumn: '1', gridRow: '2' }}>
          <GearSlot label="Hook" accent={SLOT_FAMILY.gear} image={hook.imageUrl ? hook.imageUrl.replace(/\.png$/, '_thumb.png') : null} itemName={hook.name} color={hook.color} glowClass={hookGlowClass(hook)} notify={hookHasAffordable} pulseKey={pulseKeys.hook} onClick={() => setOpenSlot('hook')} />
        </div>

        {/* Center column, top: the fisher themselves. */}
        <div style={{ gridColumn: '2', gridRow: '1' }}>
          <FisherPreview
            characterColor={characterColor}
            equippedHat={equippedHat}
            equippedBoat={equippedBoat}
            equippedPet={equippedPet}
            equippedPetBow={equippedPetBow}
            rodTier={rod.tier}
            reelTier={reel.tier}
            hookTier={hook.tier}
          />
        </div>

        {/* Center column, bottom: Skin. It shares the centre with the fisher
            rather than owning a full row of its own, which is a whole row
            saved and puts the figure directly above the thing that changes it. */}
        <div style={{ gridColumn: '2', gridRow: '2' }}>
          {(() => {
            const c = CHARACTER_COLORS.find(x => x.id === characterColor)
            return (
              <GearSlot
                label="Skin" accent={SLOT_FAMILY.cosmetic}
                // Full-figure sprite, so it needs the same head crop the skin
                // picker uses; GearSlot's `image` would letterbox the whole
                // body into a thumbnail and read as a smudge.
                icon={
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    backgroundImage: `url(${getCharacterSprites(characterColor).rest})`,
                    backgroundSize: '420% auto', backgroundPosition: '60% 68%',
                    backgroundRepeat: 'no-repeat',
                    border: '2px solid rgba(96,165,250,0.5)',
                  }} />
                }
                itemName={c?.name ?? characterColor}
                color="#60a5fa"
                pulseKey={pulseKeys.skin}
                onClick={() => setOpenSlot('skin')}
              />
            )
          })()}
        </div>

        <div style={{ gridColumn: '3', gridRow: '1' }}>
          <GearSlot label="Reel" accent={SLOT_FAMILY.gear} image={reel.imageUrl ? reel.imageUrl.replace(/\.png$/, '_thumb.png') : null} icon={<ReelIcon color={reel.color} />} itemName={reel.name} color={reel.color} notify={reelHasAffordable} pulseKey={pulseKeys.reel} onClick={() => setOpenSlot('reel')} />
        </div>
        <div style={{ gridColumn: '3', gridRow: '2' }}>
          <GearSlot label="Line" accent={SLOT_FAMILY.gear} image={line.imageUrl ?? null} itemName={line.name} color={line.color} onClick={() => setOpenSlot('line')} />
        </div>

        {/* Row 3: the things you wear or carry. */}
        <div style={{ gridColumn: '1', gridRow: '3' }}>
          {(() => {
          const h = equippedHat ? HATS.find(x => x.id === equippedHat) : null
          return (
            <GearSlot
              label="Hat" accent={SLOT_FAMILY.cosmetic}
              image={h?.restImageUrl ?? null}
              itemName={h?.name ?? 'None'}
              color={h ? '#f0c040' : '#5a5750'}
              empty={!h}
              pulseKey={pulseKeys.hat}
              onClick={() => setOpenSlot('hat')}
            />
          )})()}
        </div>
        <div style={{ gridColumn: '2', gridRow: '3' }}>
          {(() => {
          const b = equippedBoat ? BOATS.find(x => x.id === equippedBoat) : null
          return (
            <GearSlot
              label="Boat" accent={SLOT_FAMILY.cosmetic}
              image={b?.restImageUrl ?? null}
              itemName={b?.name ?? 'Default'}
              color="#7dd3fc"
              pulseKey={pulseKeys.boat}
              onClick={() => setOpenSlot('boat')}
            />
          )})()}
        </div>
        <div style={{ gridColumn: '3', gridRow: '3' }}>
          {(() => {
          const pet = equippedPet ? getPet(equippedPet) : null
          return (
            <GearSlot
              label="Pet" accent={SLOT_FAMILY.cosmetic}
              image={pet?.restImageUrl ?? null}
              itemName={pet?.name ?? 'None'}
              color={pet ? pet.accentColor : '#5a5750'}
              empty={!pet}
              pulseKey={pulseKeys.pet}
              onClick={() => setOpenSlot('pet')}
            />
          )})()}
        </div>

        {/* Row 4: the two Special slots either side of Badges. */}
        <div style={{ gridColumn: '1', gridRow: '4' }}>
          {(() => {
          const equippedDef = effectiveSpecialDef(equippedSpecial, hasAutoCatcher ? ['auto_catcher'] : [])
          return (
            <GearSlot
              label="Special" accent={SLOT_FAMILY.special}
              image={equippedDef?.image ?? null}
              icon={<SpecialIcon color={equippedDef ? equippedDef.color : '#5a4a7a'} />}
              itemName={equippedDef ? equippedDef.name : 'None'}
              color={equippedDef ? equippedDef.color : '#5a4a7a'}
              pulseKey={pulseKeys.special}
              onClick={() => setOpenSlot('special')}
              empty={!equippedDef}
            />
          )})()}
        </div>
        {/* Badges */}
        <div style={{ gridColumn: '2', gridRow: '4' }}>
          {(() => {
          const equipped = equippedBadges.filter(Boolean)
          const itemName = equipped.length === 0 ? 'None' : `${equipped.length} equipped`
          return (
            <GearSlot
              label="Badges" accent={SLOT_FAMILY.badge}
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
          )})()}
        </div>
        {/* THE SECOND SPECIAL. Mirrors the first, on the far side of Badges, so
            the pair reads as two slots of one kind rather than a slot and a
            bolt-on. Locked until Finn's spoil opens it; the panel behind it
            says what it accepts. */}
        <div style={{ gridColumn: '3', gridRow: '4' }}>
          {(() => {
          const seated = equippedSpecial2 ? SPECIAL_ITEMS.find(s => s.id === equippedSpecial2) : undefined
          const REEL = '#e0455a'   // ancient crimson, matching the hull mount + the rarity
          return (
            <GearSlot
              label="Special" accent={SLOT_FAMILY.special}
              image={seated?.image ?? null}
              icon={hasDeepReel
                ? <SpecialIcon color={seated ? seated.color : REEL} />
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a4742" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>}
              itemName={hasDeepReel ? (seated ? seated.name : 'None') : 'Locked'}
              color={hasDeepReel ? (seated ? seated.color : REEL) : '#4a4742'}
              onClick={() => setOpenSlot('special2')}
              empty={!seated}
              primeval
            />
          )})()}
        </div>
      </div>
      </>)}

      {/* ── SHOP TAB ── upgrade-focused: which gear can I buy right now, and the door
          to the full catalogue. The actual buy/equip UI lives in each slot's detail
          modal (correct gating, costs, level reqs already there), so each row just
          opens it and flags whether an upgrade is affordable. */}
      {tab === 'shop' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* The full catalogue leads. It was a footnote under four rows that
              each open a single slot, when it is the bigger destination. */}
          <Link href="/marketplace/tackle-shop" onClick={onClose} className="tap"
            style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 12, padding: '0.85rem 0.9rem', borderRadius: 16, textDecoration: 'none', background: 'linear-gradient(140deg, rgba(240,192,64,0.22) 0%, rgba(120,84,20,0.12) 60%, rgba(14,19,28,0.96) 100%), rgba(14,19,28,0.96)', border: '1px solid rgba(240,192,64,0.5)', boxShadow: '0 0 20px rgba(240,192,64,0.12)' }}>
            <span style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.45)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" /><path d="M9 13h6" /></svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="font-cinzel font-800" style={{ display: 'block', fontSize: '1.02rem', color: '#f7e2a8', lineHeight: 1.15 }}>The Tackle Shop</span>
              <span className="font-karla" style={{ display: 'block', fontSize: '0.72rem', color: '#b8ae96', lineHeight: 1.35, marginTop: 2 }}>The full catalogue. Every rod, reel, hook, line and bait.</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </Link>

          {/* Quick buy — one slot at a time, for when you know what you want. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.22em', color: '#8794a6' }}>Quick Buy</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>
          {([
            // Every row opens its slot's buy sheet. The rod row opens that sheet straight
            // to the Buy view (rodView 'shop'); the rest have a single view.
            { key: 'rod' as SlotKey,  label: 'Rod',  name: rod.name,  color: rod.color,  thumb: rod.slug ? `/${rod.slug}_thumb.png` : (rod.imageUrl ?? '/rod_bamboo_thumb.png'), ready: rodHasAffordable },
            { key: 'reel' as SlotKey, label: 'Reel', name: reel.name, color: reel.color, thumb: reel.imageUrl ? reel.imageUrl.replace(/\.png$/, '_thumb.png') : null, ready: reelHasAffordable },
            { key: 'hook' as SlotKey, label: 'Hook', name: hook.name, color: hook.color, thumb: hook.imageUrl ? hook.imageUrl.replace(/\.png$/, '_thumb.png') : null, ready: hookHasAffordable },
            { key: 'bait' as SlotKey, label: 'Bait', name: bait?.name ?? 'Restock your tin', color: bait?.color ?? '#34d399', thumb: bait?.imageUrl ?? '/worms.png', ready: false },
          ]).map(row => {
            const rowStyle: React.CSSProperties = {
              display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
              padding: '0.65rem 0.75rem', borderRadius: 14, cursor: 'pointer', textDecoration: 'none',
              background: row.ready ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.035)',
              border: `1px solid ${row.ready ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.09)'}`,
            }
            const inner = (
              <>
                <span style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', border: `1px solid ${row.color}44` }}>
                  {row.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.thumb} alt="" loading="lazy" decoding="async" style={{ maxWidth: 30, maxHeight: 30, objectFit: 'contain' }} />
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ display: 'block', fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)' }}>{row.label}</span>
                  <span className="font-cinzel font-700 truncate" style={{ display: 'block', fontSize: '0.98rem', color: '#f0ede8' }}>{row.name}</span>
                </span>
                <span className="font-karla font-800 uppercase tracking-[0.06em]" style={{ flexShrink: 0, fontSize: '0.64rem', color: row.ready ? '#f0c040' : 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {row.ready ? 'Upgrade ready' : 'Browse'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </span>
              </>
            )
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => { if (row.key === 'rod') setRodView('shop'); setOpenSlot(row.key) }}
                className="tap"
                style={rowStyle}
              >{inner}</button>
            )
          })}
        </div>
      )}

      {tab === 'stats' && (<>
      {/* ── Loadout stats ── shared with the Shipyard, which shows the same
          five numbers. See components/LoadoutStats. */}
      {showStats && <LoadoutStats
        rodTier={rod.tier} reelTier={reelTier} hookTier={hookTier} lineTier={lineTier}
        completionistEffects={completionistEffects}
        selectedBait={selectedBait}
        fishingLevel={fishingLevel}
        zoneGoldenBoostPct={zoneGoldenBoostPct}
      />}

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
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
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
      </>)}

      {/* ── Item detail modal ── PORTALED TO <body>.
          It was position:fixed inside the gear drawer, but the drawer has BOTH a
          transform (its slide-in) and overflow:auto — which makes it the containing
          block for a fixed child AND clips that child to the scroll viewport. That is
          what chopped the top off a long list (rods). Portaling to <body> escapes both,
          so the sheet is a true viewport bottom sheet, unclipped, at any height. */}
      {mounted && createPortal(
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
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }}
            />
            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
                background: 'rgba(6,12,22,0.99)', borderTop: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '20px 20px 0 0', padding: '0 0.9rem calc(env(safe-area-inset-bottom, 0px) + 1.2rem)',
                // Now portaled to <body> and unclipped, so it can use the full height —
                // 85vh from the bottom, leaving a strip of dimmed backdrop up top to tap
                // out. A long rod list scrolls under the sticky header.
                maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain',
              }}
            >
              {/* Close row — sticky, so a long rod list can scroll under it and the
                  close button + title never leave the top of the sheet. */}
              <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.85rem 0 0.7rem', marginBottom: 6, background: 'rgba(6,12,22,0.99)' }}>
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
                            −{cosmeticToast.cost.toLocaleString()} {cosmeticToast.currency === 'gems' ? '◆' : '⟡'}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <TackleNote icon="cards" color={rod.color}
                      text="Rods each have their own mix of effects, and stronger ones unlock as your Fishing level climbs. Buy any you’ve unlocked with doubloons and switch between them whenever you like." />

                    {/* ── Completionist Forge ──
                        Only for the player who's earned the Completionist Rod.
                        Fold up to 3 of their owned rods' unique effects into it;
                        reconfigurable, non-destructive. Tapping a rod toggles it
                        in/out of the loadout (capped at COMPLETIONIST_MAX_EFFECTS)
                        and persists via onCompletionistEffectsChange. */}
                    {completionistEquipped && rodView === 'owned' && (() => {
                      const filled = stagedEffects.length
                      const auraT = filled / COMPLETIONIST_MAX_EFFECTS // 0..1 power level
                      return (
                      <div style={{
                        // NO overflow:hidden here. It clipped the aura's bleed,
                        // but it also makes this a scroll container, which kills
                        // position:sticky on the commit row below. The aura gets
                        // its own clipping wrapper instead.
                        position: 'relative',
                        borderRadius: 12,
                        border: `1px solid rgba(232,200,74,${0.4 + auraT * 0.4})`,
                        background: 'linear-gradient(180deg, rgba(232,200,74,0.10) 0%, rgba(232,200,74,0.03) 100%)',
                        padding: '0.75rem 0.8rem',
                        display: 'flex', flexDirection: 'column', gap: 9,
                        boxShadow: `inset 0 0 ${10 + auraT * 34}px rgba(232,200,74,${0.06 + auraT * 0.16})`,
                      }}>
                        {/* Aura — a soft gold bloom behind the sockets that
                            intensifies as the rod fills up. Visible power growth. */}
                        {/* Aura. Plain div, no blur: this was a framer-animated
                            opacity on a filter:blur() layer, which is the worst
                            pairing available — every frame of the fade
                            re-rasterised the blur. Gradient falloff gives the
                            same softness, and a CSS transition fades it without
                            React in the loop. */}
                        <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden', pointerEvents: 'none' }}>
                          <div
                            style={{
                              position: 'absolute', top: -30, left: '50%', width: 220, height: 120,
                              transform: 'translateX(-50%)',
                              background: 'radial-gradient(ellipse at center, rgba(245,210,110,0.85) 0%, rgba(245,210,110,0.32) 40%, transparent 72%)',
                              opacity: 0.18 + auraT * 0.5,
                              transition: 'opacity 0.5s ease',
                            }}
                          />
                        </div>

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <span className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f3d98a', letterSpacing: '0.02em', textShadow: `0 0 ${6 + auraT * 12}px rgba(240,200,90,${0.3 + auraT * 0.4})` }}>Completionist Forge</span>
                          <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: filled >= COMPLETIONIST_MAX_EFFECTS ? '#f3d98a' : '#7a8aa0' }}>
                            {filled}/{COMPLETIONIST_MAX_EFFECTS}
                          </span>
                        </div>

                        {/* ── Rod preview ── the Completionist itself, lighting up
                            as effects are forged in. Keyed to forgePulse so it
                            recoils on every fuse. */}
                        <motion.div
                          key={forgePulse}
                          initial={forgePulse === 0 ? false : { scale: 1 }}
                          animate={{ scale: [1, 1.12, 1], rotate: [0, -3, 2, 0] }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: 2 }}
                        >
                          <ForgeRodEmblem size={150} power={auraT} accent={forgeAccent} />
                        </motion.div>

                        {/* ── Power sockets ── one gem per slot. Filled gems glow
                            in the donor rod's color; the spark ring bursts here
                            on every fuse / un-fuse. */}
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, padding: '0.35rem 0 0.15rem' }}>
                          {/* Spark burst — re-keyed on each forge so it restarts. */}
                          {forgeBurst && (
                            <motion.div
                              key={forgeBurst.id}
                              initial={{ scale: 0.25, opacity: 0.85 }}
                              animate={{ scale: forgeBurst.dir === 'in' ? 3 : 1.7, opacity: 0 }}
                              transition={{ duration: forgeBurst.dir === 'in' ? 0.7 : 0.45, ease: 'easeOut' }}
                              onAnimationComplete={() => setForgeBurst(null)}
                              style={{
                                position: 'absolute', left: '50%', top: '50%',
                                width: 54, height: 54, marginLeft: -27, marginTop: -27,
                                borderRadius: '50%', pointerEvents: 'none',
                                border: `2px solid ${forgeBurst.color}`,
                                boxShadow: `0 0 20px ${forgeBurst.color}, inset 0 0 12px ${forgeBurst.color}`,
                              }}
                            />
                          )}
                          {Array.from({ length: COMPLETIONIST_MAX_EFFECTS }).map((_, i) => {
                            const tier = stagedEffects[i]
                            const donor = tier != null ? RODS.find(r => r.tier === tier) : undefined
                            return (
                              <div key={i} style={{
                                position: 'relative',
                                width: 26, height: 26, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: donor ? `1.5px solid ${donor.color}` : '1.5px dashed rgba(255,255,255,0.18)',
                                background: donor ? `${donor.color}22` : 'rgba(255,255,255,0.02)',
                              }}>
                                <AnimatePresence>
                                  {donor && (
                                    <motion.div
                                      key={donor.tier}
                                      initial={{ scale: 0.2, opacity: 0 }}
                                      animate={{ scale: [0.2, 1.25, 1], opacity: 1 }}
                                      exit={{ scale: 0.2, opacity: 0 }}
                                      transition={{ duration: 0.4, times: [0, 0.6, 1], ease: 'easeOut' }}
                                      style={{
                                        width: 13, height: 13, borderRadius: '50%',
                                        background: donor.color,
                                        boxShadow: `0 0 9px ${donor.color}, 0 0 16px ${donor.color}88`,
                                      }}
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            )
                          })}
                        </div>

                        {/* Base vs forged — the fixed master-tool stats set apart from
                            whatever the staged sockets fold in, updated live. */}
                        {(() => {
                          const staged = getEffectiveRod(COMPLETIONIST_TIER, stagedEffects)
                          const { base, forged } = rodStatSplit(staged)
                          return (
                            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div>
                                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>Base tool</p>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {base.map((l, i) => (
                                    <span key={i} className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#cdd7e0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '0.18rem 0.55rem' }}>{l}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#f3d98a', marginBottom: 5 }}>Forged in <span style={{ color: '#7a8aa0' }}>· {forged.length}/{COMPLETIONIST_MAX_EFFECTS}</span></p>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {forged.length > 0 ? forged.map((l, i) => (
                                    <span key={i} className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#f3d98a', background: 'rgba(232,200,74,0.12)', border: '1px solid rgba(232,200,74,0.4)', borderRadius: 999, padding: '0.18rem 0.55rem' }}>{l}</span>
                                  )) : (
                                    <span className="font-karla" style={{ fontSize: '0.62rem', color: '#6a7888', fontStyle: 'italic' }}>Empty — fold rods in below</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        <p className="font-karla" style={{ position: 'relative', fontSize: '0.68rem', color: '#9aa6b2', lineHeight: 1.45 }}>
                          Fold up to three of your rods&rsquo; effects into the Completionist. Your rods are never consumed. The first forge is free; re-forging later costs {REFORGE_COST.toLocaleString()} ⟡.
                        </p>
                        {forgeableRods.length === 0 ? (
                          <p className="font-karla" style={{ position: 'relative', fontSize: '0.66rem', color: '#6a7888', fontStyle: 'italic' }}>
                            Buy or earn rods with special effects (Twin-Strike, Galaxy, YOLO and the like) to forge them in.
                          </p>
                        ) : (
                          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {forgeableRods.map(fr => {
                              const selected = stagedEffects.includes(fr.tier)
                              // At 3/3 an unselected rod now SWAPS in (see
                              // toggleStaged), so it reads "Swap in" instead of
                              // dead-ending on a disabled "Full".
                              const swaps = !selected && stagedEffects.length >= COMPLETIONIST_MAX_EFFECTS
                              // DEAD SOCKET WARNING. The merge is Math.max per
                              // field, so two rods whose signature lands on the
                              // same field do not stack: the stronger wins and the
                              // weaker one buys nothing. Telescoping's +10% rare
                              // bias beside the Legendary's +80% is the obvious
                              // one, and the forge used to show both as a rare-bias
                              // effect with no hint that picking both was a waste
                              // of one of your three sockets.
                              const dead = !completionistDonorAdds(fr.tier, stagedEffects)
                              const coveredBy = dead ? completionistDonorCoveredBy(fr.tier, stagedEffects) : null
                              return (
                                <motion.button
                                  key={fr.tier}
                                  disabled={forgeBusy}
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => toggleStaged(fr.tier, fr.color)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 9,
                                    padding: '0.5rem 0.6rem', borderRadius: 9,
                                    textAlign: 'left', width: '100%',
                                    cursor: 'pointer',
                                    // Colours ride a CSS transition rather than a framer
                                    // `animate`. Every row had its own animation driving
                                    // three PAINT properties, so one tap kicked off a
                                    // dozen simultaneous background/border tweens.
                                    background: selected ? `${fr.color}24` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${selected && dead ? '#c9a24a' : selected ? `${fr.color}cc` : dead ? 'rgba(201,162,74,0.35)' : 'rgba(255,255,255,0.1)'}`,
                                    boxShadow: selected ? `0 0 12px ${fr.color}33` : 'none',
                                    // Dimmed, never disabled. It is a bad buy, not
                                    // an illegal one, and a captain who wants the
                                    // weaker rod in there for its own reasons is
                                    // allowed to have it.
                                    opacity: dead && !selected ? 0.55 : 1,
                                    transition: 'background-color 0.22s ease, border-color 0.22s ease, opacity 0.22s ease',
                                  }}
                                >
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: fr.color, boxShadow: `0 0 7px ${fr.color}99`, flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#f0ede8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fr.name}</div>
                                    <div className="font-karla" style={{ fontSize: '0.64rem', color: dead ? '#c9a24a' : fr.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {dead
                                        ? `${rodEffectLabel(fr)} · already beaten by ${coveredBy ?? 'your other picks'}`
                                        : rodEffectLabel(fr)}
                                    </div>
                                  </div>
                                  <span className="font-karla font-700" style={{
                                    fontSize: '0.7rem', flexShrink: 0, whiteSpace: 'nowrap',
                                    color: selected && dead ? '#c9a24a' : selected ? fr.color : dead ? '#8a7a4a' : '#7a8aa0',
                                  }}>
                                    {selected && dead ? '− Dead socket' : selected ? '− Remove' : swaps ? 'Swap in' : '+ Add'}
                                  </span>
                                </motion.button>
                              )
                            })}
                          </div>
                        )}

                        {/* ── Commit row ── stage-then-forge: only shows when the
                            bench differs from the saved loadout. Free first time,
                            REFORGE_COST after. */}
                        {forgeDirty && (
                          // STICKY. The donor list runs to a dozen rods, so the
                          // commit row sat below the fold: you staged an effect at
                          // the top, then had to scroll the whole list to find
                          // Forge. It now rides the bottom of the panel the moment
                          // the bench differs from what is saved.
                          <div style={{
                            position: 'sticky', bottom: 0, zIndex: 2,
                            display: 'flex', flexDirection: 'column', gap: 6,
                            marginTop: 2, paddingTop: 8,
                            // Opaque base under the tint, so the buttons never sit
                            // on top of a rod row showing through.
                            backgroundColor: '#141a24',
                            backgroundImage: 'linear-gradient(180deg, rgba(232,200,74,0.10), rgba(232,200,74,0.04))',
                            marginLeft: '-0.8rem', marginRight: '-0.8rem', paddingLeft: '0.8rem', paddingRight: '0.8rem',
                            marginBottom: '-0.75rem', paddingBottom: '0.75rem',
                            borderTop: '1px solid rgba(232,200,74,0.28)',
                          }}>
                            {forgeErr && <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#f2a0a0', textAlign: 'center' }}>{forgeErr}</p>}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={discardForge}
                                disabled={forgeBusy}
                                className="font-karla font-700 uppercase tracking-[0.08em]"
                                style={{ flex: 1, padding: '0.6rem', borderRadius: 10, fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.72)', cursor: forgeBusy ? 'default' : 'pointer', opacity: forgeBusy ? 0.5 : 1 }}>
                                Discard
                              </button>
                              <button
                                onClick={commitForge}
                                disabled={forgeBusy || (reforgeCost > 0 && !canAffordReforge)}
                                className="font-cinzel font-700 uppercase tracking-[0.06em]"
                                style={{ flex: 1.6, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', background: (reforgeCost > 0 && !canAffordReforge) ? 'rgba(232,200,74,0.08)' : 'linear-gradient(180deg, rgba(240,200,90,0.34), rgba(200,160,50,0.28))', border: '1px solid rgba(240,200,90,0.7)', color: (reforgeCost > 0 && !canAffordReforge) ? 'rgba(243,217,138,0.5)' : '#fdf3d4', cursor: (forgeBusy || (reforgeCost > 0 && !canAffordReforge)) ? 'default' : 'pointer', boxShadow: (reforgeCost > 0 && !canAffordReforge) ? 'none' : '0 0 16px rgba(240,200,90,0.28)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {forgeBusy ? 'Forging…' : reforgeCost > 0 ? `Re-Forge · ${REFORGE_COST.toLocaleString()} ⟡` : 'Forge'}
                              </button>
                            </div>
                            {reforgeCost > 0 && (
                              <p className="font-karla" style={{ fontSize: '0.54rem', color: canAffordReforge ? '#8a8480' : '#f2a0a0', textAlign: 'center' }}>
                                You have {doubloons.toLocaleString()} ⟡
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      )
                    })()}

                    {/* Equip your rods (from Loadout) or buy new ones (from the Shop tab's
                        Browse). Entry point decides; no toggle. */}
                    {rodView === 'owned' ? (
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
                          {rod.tier === COMPLETIONIST_TIER ? (
                            // Split the Completionist's fixed base from its forged-in effects.
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {([['base', 'Base tool', 'rgba(255,255,255,0.45)'], ['forged', 'Forged in', '#f3d98a']] as const).map(([g, heading, hc]) => {
                                const group = rodLines.filter(l => l.group === g)
                                return (
                                  <div key={g}>
                                    <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.54rem', color: hc, marginBottom: 6 }}>{heading}</p>
                                    {group.length > 0 ? (
                                      <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, listStyle: 'none', padding: 0, margin: 0 }}>
                                        {group.map(l => <StatBullet key={l.title} value={l.value} help={l.help} color={rod.color} />)}
                                      </ul>
                                    ) : (
                                      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#6a7888', fontStyle: 'italic' }}>Nothing forged in yet — fold rods in via the forge below.</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, listStyle: 'none', padding: 0, margin: 0 }}>
                              {rodLines.map(l => (
                                <StatBullet key={l.title} value={l.value} help={l.help} color={rod.color} />
                              ))}
                            </ul>
                          )}
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
                    ) : (
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
                              const rodReq = fishingGearLevelReq(r)
                              const rodLevelMet = fishingLevel >= rodReq
                              const captainLocked = isCaptainRod(r) && !isPremium
                              const onTap = () => {
                                if (captainLocked) { openMembership(); return }
                                // Open the detail view either way — players can read
                                // a rod's stats before they can afford it; the dialog
                                // just shows a disabled "Need X more" CTA.
                                // Build "what changes vs my current rod" deltas. If two
                                // rods are stat-identical (rare but possible across re-skins),
                                // fall back to the new rod's full stat list so the modal
                                // isn't empty.
                                const deltas = rodStatDeltas(rod, r)
                                const fallbackLines = deltas.length === 0 ? rodStatLines(r) : null
                                setPendingPurchase({
                                  name: r.name, color: r.color, cost: r.cost, affordable: canAfford && rodLevelMet,
                                  lockedNote: rodLevelMet ? undefined : `Reach Fishing Lv ${rodReq} to buy this rod.`,
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
                                  className="font-karla"
                                  style={{
                                    position: 'relative',
                                    display: 'flex', flexDirection: 'column', gap: 0,
                                    padding: 0,
                                    borderRadius: 12,
                                    background: 'rgba(4,10,18,0.72)',
                                    border: `1px solid ${canAfford ? r.color + '50' : 'rgba(255,255,255,0.09)'}`,
                                    cursor: 'pointer',
                                    opacity: canAfford ? 1 : 0.82,
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
                                        style={{ fontSize: '0.56rem', color: captainLocked ? '#f0c040' : !rodLevelMet ? '#e0a44a' : canAfford ? r.color : '#f87171' }}>
                                        {captainLocked ? <><IconAnchor size={10} /> Captain only</> : !rodLevelMet ? `Fishing Lv ${rodReq}` : canAfford ? 'Tap to Buy' : `Need ${need.toLocaleString()}`}
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
                const reelReq = nextReel ? fishingGearLevelReq(nextReel) : 0
                const reelLevelMet = !nextReel || fishingLevel >= reelReq
                const reelBuyable = canAffordReel && reelLevelMet
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
                            −{cosmeticToast.cost.toLocaleString()} {cosmeticToast.currency === 'gems' ? '◆' : '⟡'}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <TackleNote icon="up" color={reel.color}
                      text="Reels slow the needle down, giving you more time to tap. They’re auto-equipped, and you can upgrade to a better tier any time you can afford one." />
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
                          if (!reelBuyable) return
                          setPendingPurchase({
                            name: nextReel.name, color: nextReel.color, cost: nextReel.cost,
                            onConfirm: async () => { flashPurchase(nextReel.name, nextReel.color, nextReel.cost, 'reel'); await onBuyReel() },
                          })
                        }}
                        disabled={!reelBuyable}
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
                            <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: reelLevelMet ? `${nextReel.color}aa` : '#e0a44a', background: reelLevelMet ? `${nextReel.color}14` : 'rgba(224,164,74,0.12)', border: `1px solid ${reelLevelMet ? `${nextReel.color}30` : 'rgba(224,164,74,0.4)'}`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>
                              {reelLevelMet ? 'Upgrade' : `Fishing Lv ${reelReq}`}
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
                const hookReq = nextHook ? fishingGearLevelReq(nextHook) : 0
                const hookLevelMet = !nextHook || fishingLevel >= hookReq
                const hookBuyable = canAffordHook && hookLevelMet
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
                            −{cosmeticToast.cost.toLocaleString()} {cosmeticToast.currency === 'gems' ? '◆' : '⟡'}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <TackleNote icon="up" color={hook.color}
                      text="Hooks widen your catch zone. They’re auto-equipped, and you can upgrade to a better tier any time you can afford one." />
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
                          if (!hookBuyable) return
                          setPendingPurchase({
                            name: nextHook.name, color: nextHook.color, cost: nextHook.cost,
                            onConfirm: async () => { flashPurchase(nextHook.name, nextHook.color, nextHook.cost, 'hook'); await onBuyHook() },
                          })
                        }}
                        disabled={!hookBuyable}
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
                            <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: hookLevelMet ? `${nextHook.color}aa` : '#e0a44a', background: hookLevelMet ? `${nextHook.color}14` : 'rgba(224,164,74,0.12)', border: `1px solid ${hookLevelMet ? `${nextHook.color}30` : 'rgba(224,164,74,0.4)'}`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>
                              {hookLevelMet ? 'Upgrade' : `Fishing Lv ${hookReq}`}
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
                  <TackleNote icon="fish" color={line.color}
                    text="Lines cut down on snags. They upgrade on their own as you discover new species of fish." />
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
                    {/* finaleSlotOnly items are NOT slot-one gear and must not
                        appear in this list at all.
                        
                        The Primeval Eye was showing here greyed out, which was
                        wrong twice over: it spoiled a Sunken Hand reward to
                        every player who had never met Finn, and it implied you
                        could eventually seat it here when the second slot is
                        the only place it fits. It fell through the `owned`
                        chain below, which has no case for it, to a bare false.
                        
                        Filtered rather than special-cased so the next finale
                        spoil is excluded automatically. */}
                    {/* The Auto pair is ONE item with a tier upgrade, so the
                        upgrade never renders as its own row: the base card
                        wears the upgraded def once the Locker purchase lands
                        (upgradeOf on the def), and until then a note under the
                        owned card points at where the upgrade is sold. */}
                    {SPECIAL_ITEMS.filter(item => !item.finaleSlotOnly && !item.upgradeOf).map(baseItem => {
                      const item = baseItem.id === 'auto_caster' && hasAutoCatcher
                        ? (getSpecialItem('auto_catcher') ?? baseItem)
                        : baseItem
                      const owned = baseItem.id === 'tide_turner' ? hasTideTurner
                        : baseItem.id === 'phantom_hook' ? hasPhantomHook
                        : baseItem.id === 'auto_caster' ? hasAutoCaster
                        : baseItem.id === 'perfected_sigil' ? hasPerfectedSigil
                        : false
                      // Equip always writes the BASE id; legacy rows that equipped
                      // the upgrade id directly still light the same card.
                      const isEquipped = equippedSpecial === baseItem.id
                        || (baseItem.id === 'auto_caster' && equippedSpecial === 'auto_catcher')
                      const lockReason = null
                      const upgradeNote = baseItem.id === 'auto_caster' && owned && !hasAutoCatcher
                        ? 'Upgrade available: the Auto Catcher, in Davy Jones’ Gauntlet’s Locker. Depth 5, 30 Fathoms.'
                        : null
                      return (
                        <SpecialItemRow
                          key={baseItem.id}
                          item={item}
                          upgradeNote={upgradeNote}
                          owned={owned}
                          isEquipped={isEquipped}
                          tideTurnerSkipsLeft={tideTurnerSkipsLeft}
                          lockReason={lockReason}
                          onEquip={() => onEquipSpecial(isEquipped ? null : baseItem.id)}
                          onRequestBuy={() => {
                            // Price in either currency: doubloons (shopCost) or Fathoms.
                            const cost = item.shopCost ?? item.costFathoms
                            if (cost == null) return
                            const fathoms = typeof item.costFathoms === 'number'
                            setPendingPurchase({
                              name: item.name, color: item.color, cost, currency: fathoms ? 'fathoms' : 'doubloons',
                              onConfirm: async () => { if (!fathoms) flashPurchase(item.name, item.color, cost, 'special'); await onBuySpecialItem(baseItem.id) },
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
              {/* ── Special (second slot) ── */}
              {openSlot === 'special2' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#6fd3c7' }}>The Deep Reel</p>
                  {!hasDeepReel ? (
                    <div style={{ padding: '1rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                      <p className="font-karla" style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.5, color: '#9a958c', textAlign: 'center' }}>
                        A second special slot, still shut. It opens with the spoils of the Sunken Hand, and it takes one thing only.
                      </p>
                    </div>
                  ) : !hasAnglersPatience ? (
                    <div style={{ padding: '1rem 0.85rem', borderRadius: 12, background: 'rgba(111,211,199,0.06)', border: '1px solid rgba(111,211,199,0.28)' }}>
                      <p className="font-karla" style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.5, color: '#9a958c', textAlign: 'center' }}>
                        Open, and empty. Only The Primeval Eye seats here, and it comes off Finn.
                      </p>
                    </div>
                  ) : (
                    <div style={{ padding: '0.8rem 0.85rem', borderRadius: 12, background: equippedSpecial2 ? 'rgba(111,211,199,0.1)' : 'rgba(255,255,255,0.03)', border: equippedSpecial2 ? '1px solid rgba(111,211,199,0.45)' : '1px solid rgba(255,255,255,0.10)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e8e4de' }}>The Primeval Eye</span>
                        {equippedSpecial2 && <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#6fd3c7' }}>Equipped</span>}
                      </div>
                      <p className="font-karla" style={{ margin: '4px 0 10px', fontSize: '0.7rem', lineHeight: 1.45, color: '#9a958c' }}>
                        {FINN_ITEMS.anglers_patience.flavor}
                      </p>
                      <div style={{ marginBottom: 10 }}>
                        <FinnChargePanel id="anglers_patience" xp={anglersPatienceXp} equipped={!!equippedSpecial2} />
                      </div>
                      <button
                        onClick={() => onEquipSpecial2?.(equippedSpecial2 ? null : 'anglers_patience')}
                        className="font-karla font-700 uppercase tracking-[0.1em]"
                        style={{ width: '100%', height: 36, borderRadius: 10, cursor: 'pointer', background: equippedSpecial2 ? 'rgba(255,255,255,0.06)' : 'rgba(111,211,199,0.18)', border: equippedSpecial2 ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(111,211,199,0.5)', color: equippedSpecial2 ? '#9a958c' : '#6fd3c7', fontSize: '0.64rem', touchAction: 'manipulation' }}>
                        {equippedSpecial2 ? 'Unequip' : 'Equip'}
                      </button>
                    </div>
                  )}
                </div>
              )}


              {/* Skin / Hat / Boat / Pet each open their own sheet now. They
                  used to share one sheet behind a four-tab strip, which cost a
                  tap and a tab to reach any of them and made the gear grid show
                  a single "Appearance" tile instead of what was equipped. The
                  bodies below are unchanged; only what gates them moved. The
                  toast is still shared because a purchase in any of them is the
                  same event. */}
              {(openSlot === 'skin' || openSlot === 'hat' || openSlot === 'boat' || openSlot === 'pet') && (
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

                  {/* Fixed-height scroll window so a long grid scrolls inside
                      the sheet rather than resizing it against the viewport
                      bottom. */}
                  <div className="scrollbar-hide" style={{ height: '46vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>

                  {/* ── Skin tab body ── */}
                  {openSlot === 'skin' && (() => {
                    // Bigger thumbnail; tap opens the detail modal (equip / buy /
                    // how-to-unlock) rather than acting inline.
                    const renderSkinThumb = (c: typeof CHARACTER_COLORS[number]) => {
                      const sprites = getCharacterSprites(c.id)
                      const isActive = characterColor === c.id
                      const isUnlocked = c.free || unlockedCharacterColors.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          onClick={() => setCosmeticDetail({ kind: 'skin', id: c.id })}
                          style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                        >
                          <div style={{ position: 'relative', width: 76, height: 76 }}>
                            <div style={{
                              width: 76, height: 76, borderRadius: '50%', overflow: 'hidden',
                              backgroundImage: `url(${sprites.rest})`, backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat',
                              border: isActive ? '2.5px solid #60a5fa' : isUnlocked ? '2px solid rgba(255,255,255,0.22)' : '2px dashed rgba(255,255,255,0.14)',
                              boxShadow: isActive ? '0 0 12px rgba(96,165,250,0.45)' : 'none',
                              // Locked reads unmistakably inert: desaturated + dimmed.
                              opacity: isUnlocked ? 1 : 0.4,
                              filter: isUnlocked ? undefined : 'grayscale(1)',
                            }} />
                            {!isUnlocked && (
                              <div style={{ position: 'absolute', right: 0, bottom: 2, width: 22, height: 22, borderRadius: '50%', background: 'rgba(12,14,18,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                              </div>
                            )}
                            {/* Owned but not equipped — a muted green tick affirms it's yours. */}
                            {isUnlocked && !isActive && !c.free && (
                              <div style={{ position: 'absolute', right: 0, bottom: 2, width: 19, height: 19, borderRadius: '50%', background: 'rgba(14,22,16,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5fce8a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                            {isActive && (
                              <div style={{ position: 'absolute', right: 0, bottom: 2, width: 22, height: 22, borderRadius: '50%', background: '#60a5fa', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                          </div>
                          <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: isActive ? '#60a5fa' : isUnlocked ? '#b6b2aa' : '#6a675f', maxWidth: 84, textAlign: 'center', whiteSpace: 'nowrap' }}>{c.name}</p>
                        </button>
                      )
                    }
                    const groups = [
                      { label: 'Starter', items: CHARACTER_COLORS.filter(c => c.free) },
                      { label: 'Earnable', items: CHARACTER_COLORS.filter(c => !c.free && !(c.price || c.gemPrice)) },
                      { label: 'Purchasable', items: CHARACTER_COLORS.filter(c => !!(c.price || c.gemPrice)) },
                    ]
                    const groupLabel = { fontSize: '0.56rem', color: '#8a8272', letterSpacing: '0.12em', marginTop: 2 } as const
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#d0cdc8' }}>Character Color</p>
                        <CosmeticLegend />
                        {groups.map(g => g.items.length === 0 ? null : (
                          <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <p className="font-karla font-600 uppercase" style={groupLabel}>{g.label}</p>
                            <div className="scrollbar-hide" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x proximity' }}>
                              {/* Owned first, locked after — your skins lead each row. */}
                              {[...g.items]
                                .sort((a, b) => Number(b.free || unlockedCharacterColors.includes(b.id)) - Number(a.free || unlockedCharacterColors.includes(a.id)))
                                .map(renderSkinThumb)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* ── Boat tab body ── */}
                  {openSlot === 'boat' && (() => {
                    const renderBoatThumb = (b: typeof BOATS[number]) => {
                      const owned = unlockedBoats.includes(b.id)
                      const isEquipped = equippedBoat === b.id
                      return (
                        <button
                          key={b.id}
                          onClick={() => setCosmeticDetail({ kind: 'boat', id: b.id })}
                          style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                        >
                          <div style={{
                            position: 'relative', width: 104, height: 58, borderRadius: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isEquipped ? `${b.color}1f` : 'rgba(4,10,18,0.6)',
                            border: isEquipped ? `2px solid ${b.color}90` : owned ? '2px solid rgba(255,255,255,0.2)' : '2px dashed rgba(255,255,255,0.12)',
                            boxShadow: isEquipped ? `0 0 14px ${b.color}33` : 'none',
                            // Locked reads unmistakably inert: desaturated + dimmed.
                            opacity: owned ? 1 : 0.4,
                          }}>
                            {b.glow && owned && <div className="boat-glow-halo" aria-hidden />}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.restImageUrl} alt="" loading="lazy" decoding="async"
                              style={{ position: 'relative', zIndex: 1, maxWidth: '86%', maxHeight: '86%', objectFit: 'contain', filter: !owned ? 'grayscale(1)' : b.glowType === 'ash' ? BOAT_ASH_DARKEN : undefined }} />
                            {!owned && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(12,14,18,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                              </div>
                            )}
                            {/* Owned but not equipped — a muted green tick affirms it's yours. */}
                            {owned && !isEquipped && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 19, height: 19, borderRadius: '50%', background: 'rgba(14,22,16,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5fce8a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                            {isEquipped && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: b.color, border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: isEquipped ? '#f0ede8' : owned ? '#c8c4bc' : '#6a675f', textAlign: 'center', whiteSpace: 'nowrap' }}>{b.name}</p>
                        </button>
                      )
                    }
                    // Owned first within each group so your boats lead the row.
                    const byOwnedFirst = (a: typeof BOATS[number], c: typeof BOATS[number]) =>
                      Number(unlockedBoats.includes(c.id)) - Number(unlockedBoats.includes(a.id))
                    // Crate + achievement boats shown even when unowned, so players see the chase.
                    const earnedBoats = BOATS.filter(b => b.crateOnly || typeof b.achievementPoints === 'number').sort(byOwnedFirst)
                    const purchasableBoats = BOATS.filter(b => !b.crateOnly && typeof b.achievementPoints !== 'number').sort(byOwnedFirst)
                    const groupLabel = { fontSize: '0.56rem', color: '#8a8272', letterSpacing: '0.12em', marginTop: 2 } as const
                    const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }
                    const driftEquipped = !equippedBoat
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#bda05a' }}>Boat Colors</p>
                        <CosmeticLegend />

                        <p className="font-karla font-600 uppercase" style={groupLabel}>Starter</p>
                        <div style={rowStyle}>
                          <button
                            onClick={() => setCosmeticDetail({ kind: 'boat', id: 'driftwood' })}
                            style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                          >
                            <div style={{
                              position: 'relative', width: 104, height: 58, borderRadius: 12,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: driftEquipped ? `${DEFAULT_BOAT_COLOR}1f` : 'rgba(4,10,18,0.6)',
                              border: `2px solid ${driftEquipped ? DEFAULT_BOAT_COLOR + '90' : 'rgba(255,255,255,0.12)'}`,
                              boxShadow: driftEquipped ? `0 0 14px ${DEFAULT_BOAT_COLOR}33` : 'none',
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/boat_default_rest.png" alt="" style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }} />
                              {!driftEquipped && (
                                <div style={{ position: 'absolute', right: 3, bottom: 3, width: 19, height: 19, borderRadius: '50%', background: 'rgba(14,22,16,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5fce8a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                </div>
                              )}
                              {driftEquipped && (
                                <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: DEFAULT_BOAT_COLOR, border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                </div>
                              )}
                            </div>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: '#f0ede8', textAlign: 'center' }}>Driftwood</p>
                          </button>
                        </div>

                        {earnedBoats.length > 0 && (
                          <>
                            <p className="font-karla font-600 uppercase" style={groupLabel}>Earnable</p>
                            <div style={rowStyle}>{earnedBoats.map(renderBoatThumb)}</div>
                          </>
                        )}

                        {purchasableBoats.length > 0 && (
                          <>
                            <p className="font-karla font-600 uppercase" style={groupLabel}>Purchasable</p>
                            <div style={rowStyle}>{purchasableBoats.map(renderBoatThumb)}</div>
                          </>
                        )}
                      </div>
                    )
                  })()}

              {/* ── Hat tab body ── */}
                  {openSlot === 'hat' && (() => {
                    const renderHatThumb = (h: typeof HATS[number]) => {
                      const owned = unlockedHats.includes(h.id)
                      const isEquipped = equippedHat === h.id
                      return (
                        <button
                          key={h.id}
                          onClick={() => setCosmeticDetail({ kind: 'hat', id: h.id })}
                          style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                        >
                          <div style={{
                            position: 'relative', width: 88, height: 66, borderRadius: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isEquipped ? `${h.color}1f` : 'rgba(4,10,18,0.6)',
                            border: isEquipped ? `2px solid ${h.color}90` : owned ? '2px solid rgba(255,255,255,0.2)' : '2px dashed rgba(255,255,255,0.12)',
                            boxShadow: isEquipped ? `0 0 14px ${h.color}33` : 'none',
                            opacity: owned ? 1 : 0.4,
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={h.restImageUrl} alt="" loading="lazy" decoding="async"
                              style={{ width: 42, height: 42, objectFit: 'contain', filter: owned ? undefined : 'grayscale(1)' }} />
                            {!owned && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(12,14,18,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                              </div>
                            )}
                            {owned && !isEquipped && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 19, height: 19, borderRadius: '50%', background: 'rgba(14,22,16,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5fce8a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                            {isEquipped && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: h.color, border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: isEquipped ? '#f0ede8' : owned ? '#c8c4bc' : '#6a675f', textAlign: 'center', whiteSpace: 'nowrap' }}>{h.name}</p>
                        </button>
                      )
                    }
                    // Owned first within each group so your bandanas lead the row.
                    const byOwnedFirst = (a: typeof HATS[number], b: typeof HATS[number]) =>
                      Number(unlockedHats.includes(b.id)) - Number(unlockedHats.includes(a.id))
                    // Earned = crate-only chases (shown locked so players see what's out
                    // there); Purchasable = shop colors.
                    const earnedHats = HATS.filter(h => h.crateOnly).sort(byOwnedFirst)
                    const purchasableHats = HATS.filter(h => !h.crateOnly && h.cost > 0).sort(byOwnedFirst)
                    const groupLabel = { fontSize: '0.56rem', color: '#8a8272', letterSpacing: '0.12em', marginTop: 2 } as const
                    const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }
                    const defaultEquipped = !equippedHat
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#bda05a' }}>Hat Color</p>
                        <CosmeticLegend />
                        <p className="font-karla font-600 uppercase" style={groupLabel}>Starter</p>
                        <div className="scrollbar-hide" style={rowStyle}>
                          {/* Default (no bandana) — built-in, tap to take the hat off. */}
                          <button
                            onClick={() => { if (!defaultEquipped) onEquipHat(null) }}
                            style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                          >
                            <div style={{
                              position: 'relative', width: 88, height: 66, borderRadius: 12,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: defaultEquipped ? 'rgba(106,103,100,0.18)' : 'rgba(4,10,18,0.6)',
                              border: defaultEquipped ? '2px solid rgba(160,157,150,0.7)' : '2px solid rgba(255,255,255,0.2)',
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/defaulthat_rest.png" alt="" style={{ width: 42, height: 42, objectFit: 'contain' }} />
                              {!defaultEquipped && (
                                <div style={{ position: 'absolute', right: 3, bottom: 3, width: 19, height: 19, borderRadius: '50%', background: 'rgba(14,22,16,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5fce8a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                </div>
                              )}
                              {defaultEquipped && (
                                <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: '#6a6764', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                </div>
                              )}
                            </div>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: '#c8c4bc', textAlign: 'center', whiteSpace: 'nowrap' }}>Default</p>
                          </button>
                        </div>

                        {earnedHats.length > 0 && (
                          <>
                            <p className="font-karla font-600 uppercase" style={groupLabel}>Earnable</p>
                            <div className="scrollbar-hide" style={rowStyle}>{earnedHats.map(renderHatThumb)}</div>
                          </>
                        )}

                        {purchasableHats.length > 0 && (
                          <>
                            <p className="font-karla font-600 uppercase" style={groupLabel}>Purchasable</p>
                            <div className="scrollbar-hide" style={rowStyle}>{purchasableHats.map(renderHatThumb)}</div>
                          </>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── Pet tab body ── */}
                  {openSlot === 'pet' && (() => {
                    // Locked pets render as dark silhouettes so the golden variants
                    // stay a mystery until landed; owned show full colour + green tick.
                    const renderPetThumb = (p: typeof PETS[number]) => {
                      const owned = unlockedPets.includes(p.id)
                      const isEquipped = equippedPet === p.id || equippedPetBow === p.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => setCosmeticDetail({ kind: 'pet', id: p.id })}
                          style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                        >
                          <div style={{
                            position: 'relative', width: 84, height: 76, borderRadius: 12, overflow: 'hidden',
                            background: isEquipped ? `${p.accentColor}1f` : 'rgba(4,10,18,0.6)',
                            border: isEquipped ? `2px solid ${p.accentColor}90` : owned ? '2px solid rgba(255,255,255,0.2)' : '2px dashed rgba(255,255,255,0.12)',
                            boxShadow: isEquipped ? `0 0 14px ${p.accentColor}33` : 'none',
                            opacity: owned ? 1 : 0.55,
                          }}>
                            {/* The pet art sits in a small patch of a big transparent
                                canvas; crop+zoom into it so the creature fills the tile
                                (the source stays untouched for the in-game overlay). */}
                            {/* A dimmed silhouette is a TEASE, which is right for
                                a crate pet you might get lucky on. An EARNED pet
                                is a reward for the hardest thing in fishing and
                                its shape is the surprise, so it is concealed
                                outright until it is yours -- a silhouette gives
                                away a long-necked plesiosaur instantly. */}
                            {!owned && p.earnedOnly ? (
                              <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 6px, transparent 6px 12px)' }}>
                                <span className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: 'rgba(224,69,90,0.5)' }}>?</span>
                              </div>
                            ) : (
                              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url(${p.restImageUrl})`, backgroundSize: '220%', backgroundPosition: '50% 45%', backgroundRepeat: 'no-repeat', filter: owned ? undefined : 'grayscale(1) brightness(0.28)' }} />
                            )}
                            {!owned && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(12,14,18,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                              </div>
                            )}
                            {owned && !isEquipped && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 19, height: 19, borderRadius: '50%', background: 'rgba(14,22,16,0.96)', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5fce8a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                            {isEquipped && (
                              <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: p.accentColor, border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                              </div>
                            )}
                          </div>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: isEquipped ? '#f0ede8' : owned ? '#c8c4bc' : '#6a675f', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {owned ? p.name.replace(/ (Parrot|Monkey|Seal)$/, '') : '???'}
                          </p>
                        </button>
                      )
                    }
                    // Derived from the registry, NOT listed here. This was an
                    // inline parrot/monkey/seal array, so the lizards, raccoons
                    // and crabs were owned and equippable but never rendered in
                    // the one screen that equips them.
                    const species = PET_SPECIES_ORDER.map(key => ({ key, label: PET_SPECIES_LABEL[key] }))
                    const groupLabel = { fontSize: '0.56rem', color: '#8a8272', letterSpacing: '0.12em', marginTop: 2 } as const
                    const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }
                    // "None" clears the STERN slot only. A bow pet rides in
                    // its own slot alongside, so unequipping your stern pet
                    // must not sweep the plesiosaur off the bow with it.
                    const noneEquipped = !equippedPet
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#a78bfa' }}>Pets</p>
                        <p className="font-karla font-300" style={{ fontSize: '0.66rem', color: '#7a7268', lineHeight: 1.4 }}>
                          Pets are a rare drop from crates — the golden variants are the trophies. Tap one to equip, or tap the equipped pet to put it away.
                        </p>
                        <CosmeticLegend />

                        {/* None — unequip. Its own short row up top. */}
                        <div className="scrollbar-hide" style={rowStyle}>
                          <button
                            onClick={() => { if (!noneEquipped) onEquipPet(null) }}
                            style={{ flex: '0 0 auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                          >
                            <div style={{
                              position: 'relative', width: 84, height: 76, borderRadius: 12,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: noneEquipped ? 'rgba(106,103,100,0.18)' : 'rgba(4,10,18,0.6)',
                              border: noneEquipped ? '2px solid rgba(160,157,150,0.7)' : '2px solid rgba(255,255,255,0.2)',
                            }}>
                              <span style={{ fontSize: '1.6rem', color: '#3a3835' }}>—</span>
                              {noneEquipped && (
                                <div style={{ position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: '50%', background: '#6a6764', border: '2px solid #0a0f18', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                                </div>
                              )}
                            </div>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: '#c8c4bc', textAlign: 'center', whiteSpace: 'nowrap' }}>None</p>
                          </button>
                        </div>

                        {/* One horizontal row per species, owned first. */}
                        {species.map(s => {
                          const list = PETS.filter(p => p.species === s.key)
                            .sort((a, b) => Number(unlockedPets.includes(b.id)) - Number(unlockedPets.includes(a.id)))
                          if (list.length === 0) return null
                          const ownedHere = list.filter(p => unlockedPets.includes(p.id)).length
                          return (
                            <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <p className="font-karla font-600 uppercase" style={groupLabel}>{s.label} <span style={{ opacity: 0.7 }}>· {ownedHere}/{list.length}</span></p>
                              <div className="scrollbar-hide" style={rowStyle}>{list.map(renderPetThumb)}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

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
                  <Link href="/badges" onClick={() => { setOpenSlot(null); onClose() }} style={{
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
      , document.body)}

      {/* ── Purchase confirmation ── portaled to <body> and above the slot sheet
           (zIndex 300 vs the sheet's 201). The buy list lives INSIDE the portaled slot
           sheet, so a confirm left in the normal tree at zIndex 100 rendered behind it. */}
      {mounted && createPortal(
      <AnimatePresence>
        {cosmeticDetail && (() => {
          type Info = {
            kind: 'skin' | 'boat' | 'hat' | 'pet'; id: string; name: string; accent: string
            owned: boolean; equipped: boolean; purchasable: boolean
            price?: number; currency?: 'gems' | 'doubloons'; unlockHint?: string
            skinRest?: string; boatImg?: string; boatGlow?: boolean; boatAsh?: boolean
            itemImg?: string; mystery?: boolean
            /** Hide the art ENTIRELY (not just darken it) — for earned rewards
             *  whose shape is part of the surprise. */
            concealed?: boolean
          }
          let info: Info | null = null
          if (cosmeticDetail.kind === 'skin') {
            const c = CHARACTER_COLORS.find(x => x.id === cosmeticDetail.id)
            if (c) {
              const owned = c.free || unlockedCharacterColors.includes(c.id)
              info = {
                kind: 'skin', id: c.id, name: c.name, accent: '#60a5fa',
                owned, equipped: characterColor === c.id,
                price: c.gemPrice ?? c.price, currency: c.gemPrice ? 'gems' : 'doubloons',
                purchasable: !owned && !!(c.price || c.gemPrice), unlockHint: c.unlockHint,
                skinRest: getCharacterSprites(c.id).rest,
              }
            }
          } else if (cosmeticDetail.kind === 'hat') {
            const h = HATS.find(x => x.id === cosmeticDetail.id)
            if (h) {
              const owned = unlockedHats.includes(h.id)
              info = {
                kind: 'hat', id: h.id, name: `${h.name} Bandana`, accent: h.color,
                owned, equipped: equippedHat === h.id,
                price: h.cost || undefined, currency: 'doubloons',
                purchasable: !owned && !h.crateOnly && h.cost > 0,
                unlockHint: h.crateOnly ? 'Found only in fishing crates' : undefined,
                itemImg: h.restImageUrl,
              }
            }
          } else if (cosmeticDetail.kind === 'pet') {
            const p = PETS.find(x => x.id === cosmeticDetail.id)
            if (p) {
              const owned = unlockedPets.includes(p.id)
              info = {
                // Neutral accent while locked so the gold/rare hues stay a surprise.
                kind: 'pet', id: p.id, name: owned ? p.name : '???', accent: owned ? p.accentColor : '#8a8578',
                owned, equipped: equippedPet === p.id, purchasable: false,
                unlockHint: p.earnedOnly
                  ? 'Not a crate drop. Take all six Ancient Deep giants to Vigil Rank V.'
                  : 'A rare find in fishing crates — golden variants are the trophies.',
                itemImg: p.restImageUrl, mystery: !owned, concealed: !owned && p.earnedOnly === true,
              }
            }
          } else if (cosmeticDetail.id === 'driftwood') {
            info = { kind: 'boat', id: 'driftwood', name: 'Driftwood', accent: DEFAULT_BOAT_COLOR, owned: true, equipped: !equippedBoat, purchasable: false, boatImg: '/boat_default_rest.png' }
          } else {
            const b = getBoat(cosmeticDetail.id)
            if (b) {
              const owned = unlockedBoats.includes(b.id)
              const isAch = typeof b.achievementPoints === 'number'
              info = {
                kind: 'boat', id: b.id, name: b.name, accent: b.color,
                owned, equipped: equippedBoat === b.id,
                price: b.gemPrice ?? (b.cost || undefined), currency: b.gemPrice ? 'gems' : 'doubloons',
                purchasable: !owned && !isAch && !b.crateOnly && !!(b.gemPrice || b.cost),
                unlockHint: isAch ? `Reach ${b.achievementPoints} achievement points` : b.crateOnly ? 'Found only in fishing crates' : undefined,
                boatImg: b.restImageUrl, boatGlow: b.glow, boatAsh: b.glowType === 'ash',
              }
            }
          }
          if (!info) return null
          const i = info
          const glyph = i.currency === 'gems' ? '◆' : '⟡'
          const bal = i.currency === 'gems' ? gems : doubloons
          const canAfford = i.price != null && bal >= i.price
          const close = () => { if (!detailBusy) setCosmeticDetail(null) }
          const doEquip = () => {
            if (i.kind === 'skin') onUpdateColor(i.id)
            else if (i.kind === 'hat') onEquipHat(i.id)
            else if (i.kind === 'pet') onEquipPet(i.id)
            else onEquipBoat(i.id === 'driftwood' ? null : i.id)
            setCosmeticDetail(null)
          }
          const doBuy = async () => {
            if (detailBusy) return
            setDetailBusy(true)
            if (i.kind === 'skin') {
              const res = await onBuyColor(i.id)
              setDetailBusy(false)
              if (!('error' in res)) setCosmeticDetail(null)
            } else if (i.kind === 'hat') {
              onBuyHat(i.id)
              flashPurchase(i.name, i.accent, i.price!, 'hat', 'doubloons')
              setDetailBusy(false)
              setCosmeticDetail(null)
            } else {
              onBuyBoat(i.id)
              flashPurchase(i.name, i.accent, i.price!, 'boat', i.currency)
              setDetailBusy(false)
              setCosmeticDetail(null)
            }
          }
          return (
            <motion.div key="cosmetic-detail"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
              data-any-key
              onClick={close}
              style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}
            >
              <motion.div
                initial={{ scale: 0.9, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 300, textAlign: 'center', padding: '1.5rem 1.4rem', borderRadius: 20,
                  background: 'linear-gradient(160deg, rgba(12,18,28,0.99) 0%, rgba(6,10,16,0.99) 100%)',
                  border: `1px solid ${i.accent}55`, borderTop: `3px solid ${i.accent}`,
                  boxShadow: `0 20px 70px rgba(0,0,0,0.6), 0 0 40px ${i.accent}18`,
                }}
              >
                {i.kind === 'skin' ? (
                  <div style={{ width: 120, height: 120, borderRadius: '50%', margin: '0 auto 0.9rem', backgroundImage: `url(${i.skinRest})`, backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat', border: `2px solid ${i.accent}66`, boxShadow: `0 0 26px ${i.accent}33` }} />
                ) : i.kind === 'boat' ? (
                  <div style={{ position: 'relative', width: 210, height: 100, margin: '0 auto 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i.boatGlow && <div className="boat-glow-halo" aria-hidden />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.boatImg} alt="" style={{ position: 'relative', zIndex: 1, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: i.boatAsh ? BOAT_ASH_DARKEN : 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
                  </div>
                ) : i.kind === 'pet' ? (
                  // Pet art occupies a small patch of a big transparent canvas —
                  // crop+zoom into it so the creature reads large; locked stays a
                  // dark silhouette. Source is untouched (in-game overlay needs it).
                  <div style={{ position: 'relative', width: 150, height: 132, margin: '0 auto 0.9rem', borderRadius: 16, overflow: 'hidden', border: `1px solid ${i.accent}30`, background: 'rgba(4,10,18,0.5)' }}>
                    {i.concealed ? (
                      <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 8px, transparent 8px 16px)' }}>
                        <span className="font-cinzel font-800" style={{ fontSize: '2.6rem', color: 'rgba(224,69,90,0.45)' }}>?</span>
                      </div>
                    ) : (
                      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url(${i.itemImg})`, backgroundSize: '210%', backgroundPosition: '50% 45%', backgroundRepeat: 'no-repeat', filter: i.mystery ? 'grayscale(1) brightness(0.25)' : undefined }} />
                    )}
                  </div>
                ) : (
                  // Hat — a centred image (its art is already tightly framed).
                  <div style={{ width: 120, height: 110, margin: '0 auto 0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.itemImg} alt="" style={{ maxWidth: '78%', maxHeight: '78%', objectFit: 'contain', filter: `drop-shadow(0 0 12px ${i.accent}55)` }} />
                  </div>
                )}
                <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: i.accent, lineHeight: 1.1, marginBottom: '1rem' }}>{i.name}</p>

                {i.equipped ? (
                  <div className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem', color: '#4ade80', padding: '0.7rem', borderRadius: 12, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.35)' }}>✓ Equipped</div>
                ) : i.owned ? (
                  <button onClick={doEquip} className="font-cinzel font-700" style={{ width: '100%', padding: '0.72rem', borderRadius: 12, fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.55)', color: '#cfe2ff' }}>Equip</button>
                ) : i.purchasable ? (
                  canAfford ? (
                    <button onClick={doBuy} disabled={detailBusy} className="font-cinzel font-700" style={{ width: '100%', padding: '0.72rem', borderRadius: 12, fontSize: '0.9rem', cursor: detailBusy ? 'default' : 'pointer', background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.55)', color: '#cfe2ff' }}>
                      {detailBusy ? 'Buying…' : `Buy for ${i.price!.toLocaleString()} ${glyph}`}
                    </button>
                  ) : (
                    <div className="font-karla font-700" style={{ padding: '0.72rem', borderRadius: 12, fontSize: '0.78rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#c99' }}>
                      Need {(i.price! - bal).toLocaleString()} more {glyph}
                    </div>
                  )
                ) : (
                  <div style={{ padding: '0.8rem', borderRadius: 12, background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.28)' }}>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: 'rgba(196,169,106,0.75)', marginBottom: '0.4rem' }}>How to unlock</p>
                    <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#e0d2ad', lineHeight: 1.4 }}>{i.unlockHint ?? 'Locked'}</p>
                  </div>
                )}

                <p className="font-karla font-400" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.22)', marginTop: '0.9rem' }}>Tap anywhere to close</p>
              </motion.div>
            </motion.div>
          )
        })()}
        {pendingPurchase && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => { if (!confirming) setPendingPurchase(null) }}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
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
                const unaffordable = !isSell && pendingPurchase.affordable === false
                const need = Math.max(0, pendingPurchase.cost - doubloons)
                const unit = pendingPurchase.currency === 'fathoms' ? ' Fathoms' : pendingPurchase.currency === 'gems' ? ' ◆' : ' ⟡'
                const ctaBg     = isSell ? 'rgba(196,169,106,0.18)' : 'rgba(96,165,250,0.16)'
                const ctaBorder = isSell ? 'rgba(196,169,106,0.6)'  : 'rgba(96,165,250,0.55)'
                const ctaColor  = isSell ? '#f0d695'                : '#cfe2ff'
                const verbing   = isSell ? 'Selling…' : 'Buying…'
                const verbLabel = isSell
                  ? `Sell for +${pendingPurchase.cost.toLocaleString()}${unit}`
                  : `Buy for ${pendingPurchase.cost.toLocaleString()}${unit}`
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
                        disabled={confirming || unaffordable}
                        onClick={async () => {
                          if (unaffordable) return
                          setConfirming(true)
                          await pendingPurchase.onConfirm()
                          setConfirming(false)
                          setPendingPurchase(null)
                        }}
                        className="font-karla font-700 uppercase tracking-[0.08em]"
                        style={{
                          flex: 2, padding: '0.7rem 0',
                          background: unaffordable ? 'rgba(255,255,255,0.04)' : ctaBg,
                          border: `1px solid ${unaffordable ? 'rgba(255,255,255,0.12)' : ctaBorder}`,
                          color: unaffordable ? '#f0c04099' : ctaColor,
                          borderRadius: 12, fontSize: '0.72rem',
                          cursor: (confirming || unaffordable) ? 'default' : 'pointer',
                          opacity: confirming ? 0.65 : 1,
                        }}
                      >
                        {unaffordable ? (pendingPurchase.lockedNote ?? `Need ${need.toLocaleString()} ⟡ more`) : (confirming ? verbing : verbLabel)}
                      </button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      , document.body)}

      {/* ── Completionist forge cinematic ── the staged donor rods streak in and
           merge into the Completionist on a prismatic flash. Plays on commit. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {forgeCinematic && (
            <motion.div key="forge-cine"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
              style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'radial-gradient(ellipse 80% 65% at 50% 46%, rgba(34,24,6,0.95) 0%, rgba(4,4,9,0.98) 100%)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
              {/* Rotating prismatic ray-fan. */}
              <motion.div aria-hidden initial={{ opacity: 0, scale: 0.5, rotate: 0 }} animate={{ opacity: [0, 0.5, 0.6], scale: [0.5, 1, 1.2], rotate: 130 }} transition={{ duration: 1.4, ease: 'easeOut' }}
                style={{ position: 'absolute', width: 560, height: 560, borderRadius: '50%', background: 'conic-gradient(from 0deg, #f26d6d33, #f2c14e33, #57d06a33, #5aa9f033, #f26d6d33)', maskImage: 'radial-gradient(circle, transparent 26%, #000 42%, transparent 74%)', WebkitMaskImage: 'radial-gradient(circle, transparent 26%, #000 42%, transparent 74%)' }} />
              {/* The Completionist rod, center — swells on impact. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src="/rod_completionist_thumb.png" alt="" width={210} height={210}
                initial={{ scale: 0.72, opacity: 0.55 }}
                animate={{ scale: [0.72, 0.72, 1.18, 1], opacity: [0.55, 0.7, 1, 1] }}
                transition={{ duration: 1.4, times: [0, 0.55, 0.74, 1], ease: 'easeOut' }}
                style={{ position: 'relative', zIndex: 2, width: 210, height: 210, objectFit: 'contain', filter: 'drop-shadow(0 0 14px #f26d6daa) drop-shadow(0 0 26px #5aa9f088) drop-shadow(0 0 44px #f2c14e88)' }} />
              {/* Donor rods streaking in from around and shrinking into the rod. */}
              {forgeCinematic.donors.map((d, i) => {
                const ang = (i / Math.max(1, forgeCinematic.donors.length)) * Math.PI * 2 - Math.PI / 2
                const sx = Math.cos(ang) * 250, sy = Math.sin(ang) * 250
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <motion.img key={i} src={d.slug ? `/${d.slug}_thumb.png` : '/rod_completionist_thumb.png'} alt="" width={76} height={76}
                    initial={{ x: sx, y: sy, scale: 0.9, opacity: 0, rotate: 0 }}
                    animate={{ x: [sx, sx, 0], y: [sy, sy, 0], scale: [0.9, 0.95, 0.15], opacity: [0, 1, 1, 0], rotate: 200 }}
                    transition={{ duration: 1.05, delay: 0.12 + i * 0.07, times: [0, 0.35, 1], ease: 'easeIn' }}
                    style={{ position: 'absolute', zIndex: 1, width: 76, height: 76, objectFit: 'contain', filter: `drop-shadow(0 0 12px ${d.color}) drop-shadow(0 0 22px ${d.color}88)` }} />
                )
              })}
              {/* White impact flash on convergence. */}
              <motion.div aria-hidden initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: [0, 0, 0.95, 0], scale: [0.3, 0.3, 2.2, 2.9] }} transition={{ duration: 1.4, times: [0, 0.66, 0.76, 1], ease: 'easeOut' }}
                style={{ position: 'absolute', zIndex: 3, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, #fffdf2ee 0%, #f2c14e66 38%, transparent 68%)', pointerEvents: 'none' }} />
              <motion.p className="font-cinzel font-800 uppercase" initial={{ opacity: 0, y: 8 }} animate={{ opacity: [0, 0, 1], y: [8, 8, 0] }} transition={{ duration: 1.4, times: [0, 0.76, 0.9] }}
                style={{ position: 'absolute', bottom: '20%', zIndex: 4, fontSize: '0.9rem', letterSpacing: '0.3em', textIndent: '0.3em', background: 'linear-gradient(100deg, #f26d6d, #f2c14e, #57d06a, #5aa9f0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', filter: 'drop-shadow(0 1px 8px rgba(0,0,0,0.6))' }}>
                Forging
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
