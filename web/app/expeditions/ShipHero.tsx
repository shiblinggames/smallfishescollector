'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import type { ShipStats } from '@/lib/expeditions'
import { RARITY_COLORS, computeCombatRating, computeVoyageScore } from '@/lib/expeditions'
import { SHIP_SKINS } from '@/lib/shipSkins'
import { saveCrew, equipShipSkin, saveEquippedRaidItems } from './actions'
import { RAID_ITEMS, getRaidItem } from '@/lib/raidItems'
import { renameShip } from '@/app/shipyard/actions'
import { getXPProgress, getNavigatorTitle, navLevelBonuses } from '@/lib/expeditionLevel'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

type CollectionCard = {
  collectionId: number
  variantId: number
  name: string
  filename: string
  variantName: string
  rarity: string
  power: number
  dodge: number
  fortune: number
}

const STAT_COLS = [
  { key: 'power'   as const, short: 'PWR', color: '#f87171' },
  { key: 'dodge'   as const, short: 'NAV', color: '#60a5fa' },
  { key: 'fortune' as const, short: 'FTN', color: '#f0c040' },
]

const RARITY_ITEM_COLOR: Record<string, string> = {
  common:    '#9ca3af',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
}

interface Props {
  shipStats: ShipStats
  shipName: string | null
  expeditionXP: number
  equippedShipSkin: string | null
  shipSkins: string[]
  collection: CollectionCard[]
  savedCrewVariantIds: number[]
  ownedRaidItems: string[]
  equippedRaidItems: string[]
}

function DrawerHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0.55rem 0 0.1rem', cursor: 'grab' }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
    </div>
  )
}

function drawerDragProps(onClose: () => void) {
  return {
    drag: 'y' as const,
    dragConstraints: { top: 0 },
    dragElastic: { top: 0, bottom: 0.35 },
    onDragEnd: (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 80 || info.velocity.y > 400) onClose()
    },
  }
}

export default function ShipHero({
  shipStats, shipName: initialShipName, expeditionXP,
  equippedShipSkin: initialEquippedSkin, shipSkins: ownedSkins,
  collection, savedCrewVariantIds,
  ownedRaidItems, equippedRaidItems: initialEquippedRaidItems,
}: Props) {
  const xpProgress = getXPProgress(expeditionXP)

  // Crew state — managed here so scores update live when loadout changes
  const [slots, setSlots] = useState<(CollectionCard | null)[]>(() => {
    const arr: (CollectionCard | null)[] = Array(shipStats.crewSlots).fill(null)
    savedCrewVariantIds.forEach((vid, i) => {
      if (i < shipStats.crewSlots) {
        const card = collection.find(c => c.variantId === vid)
        if (card) arr[i] = card
      }
    })
    return arr
  })

  // Skin state
  const [equippedSkin, setEquippedSkin] = useState(initialEquippedSkin)

  // Raid item state
  const [equippedItems, setEquippedItems] = useState<string[]>(initialEquippedRaidItems)

  // Ship name state
  const [shipName, setShipName] = useState(initialShipName)

  // Modal state
  const [loadoutOpen, setLoadoutOpen] = useState(false)
  const [breakdownScore, setBreakdownScore] = useState<'voyage' | 'raid' | null>(null)

  // Loadout inner state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'power' | 'dodge' | 'fortune' | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(initialShipName ?? '')

  const [, startTransition] = useTransition()

  useEffect(() => {
    document.body.style.overflow = (loadoutOpen || sheetOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [loadoutOpen, sheetOpen])

  function closeLoadout() {
    setLoadoutOpen(false)
    setSheetOpen(false)
    setPickerSlot(null)
    setEditingName(false)
  }

  // Ship rename
  function submitRename() {
    const trimmed = nameInput.trim().slice(0, 32)
    if (!trimmed) { setEditingName(false); return }
    setShipName(trimmed)
    setEditingName(false)
    startTransition(async () => { await renameShip(trimmed) })
  }

  // Crew management — dedup by name so two variants of the same character
  // (e.g. standard + foil) can't both occupy the loadout
  const assignedNames = new Set(slots.filter(Boolean).map(c => c!.name))

  function openPickerForSlot(i: number) { setPickerSlot(i); setSheetOpen(true); setSortBy(null) }
  function closeSheet() { setSheetOpen(false); setPickerSlot(null) }

  function assignCard(card: CollectionCard) {
    if (pickerSlot === null) return
    const next = [...slots]; next[pickerSlot] = card
    setSlots(next); closeSheet(); persistCrew(next)
  }

  function removeFromSlot(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    const next = [...slots]; next[i] = null
    setSlots(next); persistCrew(next)
  }

  function persistCrew(next: (CollectionCard | null)[]) {
    const ids = next.filter(Boolean).map(c => c!.variantId)
    window.dispatchEvent(new CustomEvent('crew-changed', { detail: ids }))
    startTransition(async () => { await saveCrew(ids) })
  }

  // Skin equip
  function handleEquipSkin(skinId: string | null) {
    setEquippedSkin(skinId)
    startTransition(async () => { await equipShipSkin(skinId) })
  }

  // Raid item equip/unequip
  function handleEquipRaidItem(itemId: string) {
    if (equippedItems.includes(itemId)) return
    if (equippedItems.length >= 3) return
    const next = [...equippedItems, itemId]
    setEquippedItems(next)
    startTransition(async () => { await saveEquippedRaidItems(next) })
  }

  function handleUnequipRaidItem(itemId: string) {
    const next = equippedItems.filter(i => i !== itemId)
    setEquippedItems(next)
    startTransition(async () => { await saveEquippedRaidItems(next) })
  }

  // Voyage uses raw crew totals (unchanged). Raid uses crew totals plus the
  // Nav-level captain bonus — see lib/expeditionLevel.navLevelBonuses.
  const navBonus     = navLevelBonuses(xpProgress.level)
  const totalPower   = slots.reduce((s, c, i) => s + (c ? Math.round(c.power   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalDodge   = slots.reduce((s, c, i) => s + (c ? Math.round(c.dodge   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalFortune = slots.reduce((s, c, i) => s + (c ? Math.round(c.fortune * (i === 0 ? 1 : 0.8)) : 0), 0)
  const ratedPower   = totalPower   + navBonus.power
  const ratedDodge   = totalDodge   + navBonus.navigation
  const ratedFortune = totalFortune + navBonus.fortune
  const ratedHP      = shipStats.durability + navBonus.hp
  const voyageScore  = computeVoyageScore(totalPower, totalDodge, totalFortune)
  const raidRating   = computeCombatRating(ratedPower, ratedDodge, ratedFortune, ratedHP, shipStats.minDamage)
  const hasCrew      = slots.some(Boolean)

  // Skin filter
  const skinDef     = equippedSkin ? SHIP_SKINS.find(s => s.id === equippedSkin) : undefined
  const skinFilter  = skinDef?.filter ?? 'none'

  // Picker cards
  const pickerCards = pickerSlot !== null
    ? collection.filter(c => !assignedNames.has(c.name) || slots[pickerSlot]?.name === c.name)
    : collection
  const sortedPickerCards = sortBy
    ? [...pickerCards].sort((a, b) => b[sortBy] - a[sortBy])
    : pickerCards

  return (
    <>
      {/* ── Ship hero card ── */}
      <div style={{
        background: 'rgba(6,8,12,0.82)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        marginBottom: '1.5rem',
        overflow: 'hidden',
      }}>
        {/* Main content — ship left, info right */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {/* Ship image — left column, fills height */}
          <div style={{ width: '44%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem 0.5rem 0.75rem 0.875rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shipStats.image}
              alt={shipName ?? shipStats.name}
              style={{ width: '100%', maxWidth: 170, aspectRatio: '1/1', objectFit: 'contain', filter: skinFilter }}
            />
          </div>

          {/* Info — right column */}
          <div style={{ flex: 1, padding: '1rem 0.875rem 1rem 0.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.55rem', minWidth: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e0ddd8', lineHeight: 1.2 }}>
              {shipName ?? shipStats.name}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: '#7090c0' }}>Lv {xpProgress.level}</p>
                <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#5a7aaa', fontStyle: 'italic' }}>{getNavigatorTitle(xpProgress.level)}</p>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${xpProgress.progress * 100}%`, background: 'linear-gradient(90deg, #4a6090 0%, #7090c0 100%)' }} />
              </div>
            </div>

            {hasCrew ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.8rem' }}>
                {/* Voyage Score — tap for breakdown */}
                <button
                  onClick={() => setBreakdownScore('voyage')}
                  aria-label="Voyage Score breakdown"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#7090c0', marginBottom: 2 }}>Voyage Score</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0ede8', lineHeight: 1 }}>{voyageScore}</p>
                    <span style={{ fontSize: '0.5rem', color: '#4a4845', lineHeight: 1 }}>ⓘ</span>
                  </div>
                </button>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', marginBottom: 3 }} />
                {/* Raid Score — tap for breakdown */}
                <button
                  onClick={() => setBreakdownScore('raid')}
                  aria-label="Raid Score breakdown"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#c8704a', marginBottom: 2 }}>Raid Score</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0ede8', lineHeight: 1 }}>{raidRating.total}</p>
                    <span style={{ fontSize: '0.5rem', color: '#4a4845', lineHeight: 1 }}>ⓘ</span>
                  </div>
                </button>
              </div>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.65rem', color: '#5a5248' }}>No crew assigned</p>
            )}
          </div>
        </div>

        {/* Expedition controls — all three actions share one section so
            the primary "loadout" CTA and the two "go get stronger" CTAs
            read as one cohesive panel under the scores instead of three
            disconnected bars. */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '0.7rem 0.7rem 0.8rem',
          background: 'rgba(255,255,255,0.015)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.54rem', color: '#5a7090', textAlign: 'center' }}>
            Strengthen your expedition
          </p>

          {/* Primary CTA — bigger, gold (matches the ship hero's gold trim) */}
          <button
            onClick={() => setLoadoutOpen(true)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '0.65rem 0.5rem',
              background: 'linear-gradient(180deg, rgba(240,192,64,0.12) 0%, rgba(240,192,64,0.03) 100%)',
              border: '1px solid rgba(240,192,64,0.30)',
              borderTop: '1px solid rgba(240,192,64,0.55)',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.82rem', color: '#f0c040' }}>View Loadout &amp; Assign Crew</span>
            <span className="font-karla" style={{ fontSize: '0.6rem', color: '#a88a48' }}>Set captain &amp; ship skin ›</span>
          </button>

          {/* Secondary CTAs — same card chrome, color-coded by destination */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Link
              href="/packs"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '0.6rem 0.5rem',
                background: 'linear-gradient(180deg, rgba(96,165,250,0.08) 0%, rgba(96,165,250,0.02) 100%)',
                border: '1px solid rgba(96,165,250,0.22)',
                borderTop: '1px solid rgba(96,165,250,0.42)',
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.78rem', color: '#9ec6ff' }}>Recruit Crew</span>
              <span className="font-karla" style={{ fontSize: '0.6rem', color: '#6a88a8' }}>Open packs ›</span>
            </Link>
            <Link
              href="/marketplace/shipyard"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '0.6rem 0.5rem',
                background: 'linear-gradient(180deg, rgba(160,210,160,0.08) 0%, rgba(160,210,160,0.02) 100%)',
                border: '1px solid rgba(160,210,160,0.22)',
                borderTop: '1px solid rgba(160,210,160,0.42)',
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.78rem', color: '#a8e0a8' }}>Upgrade Ship</span>
              <span className="font-karla" style={{ fontSize: '0.6rem', color: '#6a986a' }}>Shipyard ›</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Loadout drawer ── */}
      <AnimatePresence>
        {loadoutOpen && (
          <>
            {/* Backdrop. z-index 100 to clear the page Nav (which is z:50). */}
            <motion.div
              key="loadout-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }}
              onClick={closeLoadout}
            />

            {/* Drawer. z-index 101 so the modal paints above the page Nav
                (also z:50). Using explicit top + bottom (instead of maxHeight)
                hard-anchors the drawer top — it can never extend above the
                page Nav, so the sticky LOADOUT header is always reachable.
                Nav is 44px mobile / 64px desktop; 80px from top gives a
                clean gap below it. The framer-motion animation slides the
                drawer up from below; at rest it occupies top:80 → bottom:0. */}
            <motion.div
              key="loadout-drawer"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              {...drawerDragProps(closeLoadout)}
              style={{
                position: 'fixed',
                top: 'max(80px, env(safe-area-inset-top, 0px) + 20px)',
                bottom: 0,
                left: 'max(0px, calc(50% - 240px))',
                right: 'max(0px, calc(50% - 240px))',
                zIndex: 101,
                background: '#060c14',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '18px 18px 0 0',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <DrawerHandle />
              {/* Sticky header — outside the scroll container so the close
                  button never scrolls off-screen. */}
              <div style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.25rem 1rem 0.7rem',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#a8a39c' }}>Loadout</p>
                <button
                  onClick={closeLoadout}
                  aria-label="Close loadout"
                  style={{
                    color: '#e0ddd8', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '50%',
                    width: 32, height: 32, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    touchAction: 'manipulation',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem 1rem 5rem' }}>

              {/* Ship preview with skin + rename — large hero image fills
                  the upper area of the drawer. */}
              <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shipStats.image}
                  alt={shipName ?? shipStats.name}
                  style={{
                    width: '100%', maxWidth: 220, height: 'auto',
                    objectFit: 'contain', display: 'block', margin: '0 auto 0.85rem',
                    filter: skinFilter,
                    transition: 'filter 0.3s ease',
                  }}
                />
                {editingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
                      maxLength={32}
                      placeholder={shipStats.name}
                      style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.24)', borderRadius: 8, padding: '0.35rem 0.7rem', color: '#f0ede8', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', textAlign: 'center', width: 200 }}
                    />
                    <button onClick={submitRename} style={{ background: 'rgba(240,192,64,0.18)', border: '1px solid rgba(240,192,64,0.4)', borderRadius: 6, padding: '0.3rem 0.65rem', color: '#f0c040', cursor: 'pointer', fontSize: '0.74rem' }} className="font-karla font-700">Save</button>
                    <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a7a6c', fontSize: '0.78rem' }}>✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0ede8' }}>{shipName ?? shipStats.name}</p>
                    <span style={{ fontSize: '0.85rem', color: '#9a8050' }}>✎</span>
                  </button>
                )}
              </div>

              {/* ── Crew ── */}
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.7rem', letterSpacing: '0.04em' }}>Crew</p>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem', borderBottom: hasCrew ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
                    {slots.map((card, i) => {
                      const isCaptain = i === 0
                      const rc = card ? (RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764') : null
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                          {card ? (
                            <>
                              <div
                                onClick={() => openPickerForSlot(i)}
                                style={{ position: 'relative', width: 64, height: 64, borderRadius: 12, overflow: 'hidden', border: isCaptain ? '2px solid rgba(240,192,64,0.55)' : `1.5px solid ${rc}40`, cursor: 'pointer' }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
                                {isCaptain && (
                                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(10,8,4,0.85)', borderTop: '1px solid rgba(240,192,64,0.3)', textAlign: 'center', padding: '0.12rem 0' }}>
                                    <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.46rem', color: '#f0c040' }}>Captain</span>
                                  </div>
                                )}
                                <button onClick={e => removeFromSlot(i, e)} style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </div>
                              <p className="font-karla font-600 truncate text-center" style={{ fontSize: '0.66rem', color: isCaptain ? '#e4c890' : '#b8b3ac', maxWidth: 64, lineHeight: 1.2 }}>{card.name}</p>
                            </>
                          ) : (
                            <button
                              onClick={() => openPickerForSlot(i)}
                              style={{ width: 64, height: 64, borderRadius: 12, background: isCaptain ? 'rgba(240,192,64,0.03)' : 'rgba(255,255,255,0.02)', border: isCaptain ? '1.5px dashed rgba(240,192,64,0.18)' : '1.5px dashed rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4, padding: 0 }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isCaptain ? 'rgba(240,192,64,0.22)' : 'rgba(255,255,255,0.12)'} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                              <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: isCaptain ? '#b89040' : '#8a8580' }}>{isCaptain ? 'Captain' : 'Crew'}</p>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {hasCrew && (
                  <div style={{ padding: '0.85rem 1rem', display: 'flex', gap: '1.75rem' }}>
                    {STAT_COLS.map(s => (
                      <div key={s.key}>
                        <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.66rem', color: '#9a9488', marginBottom: 2 }}>{s.short}</p>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: s.color }}>
                          {s.key === 'power' ? totalPower : s.key === 'dodge' ? totalDodge : totalFortune}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Ship Skins ── grid layout (mirrors fishing GearScreen boat picker) */}
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.7rem', letterSpacing: '0.04em' }}>Ship Skins</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1.5rem' }}>
                {/* Default */}
                {(() => {
                  const isEquipped = equippedSkin === null
                  return (
                    <button
                      onClick={() => { if (!isEquipped) handleEquipSkin(null) }}
                      disabled={isEquipped}
                      className="font-karla font-700"
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '0.6rem 0.4rem 0.5rem',
                        borderRadius: 10,
                        background: isEquipped ? 'rgba(255,255,255,0.06)' : 'rgba(4,10,18,0.72)',
                        border: `1px solid ${isEquipped ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.09)'}`,
                        cursor: isEquipped ? 'default' : 'pointer',
                      }}
                    >
                      <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={shipStats.image} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
                      </div>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8', lineHeight: 1.15, textAlign: 'center' }}>Default</p>
                      {isEquipped
                        ? <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#e0ddd8' }}>✓ Equipped</span>
                        : <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a7674' }}>Original</span>
                      }
                    </button>
                  )
                })()}
                {SHIP_SKINS.map(skin => {
                  const owned    = ownedSkins.includes(skin.id)
                  const isEquipped = equippedSkin === skin.id
                  return (
                    <button
                      key={skin.id}
                      onClick={owned && !isEquipped ? () => handleEquipSkin(skin.id) : undefined}
                      disabled={!owned || isEquipped}
                      className="font-karla font-700"
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '0.6rem 0.4rem 0.5rem',
                        borderRadius: 10,
                        background: isEquipped ? `${skin.color}1f` : 'rgba(4,10,18,0.72)',
                        border: `1px solid ${isEquipped ? skin.color + '90' : owned ? 'rgba(255,255,255,0.09)' : `${skin.color}22`}`,
                        boxShadow: isEquipped ? `0 0 14px ${skin.color}33` : 'none',
                        cursor: owned && !isEquipped ? 'pointer' : 'default',
                        opacity: owned ? 1 : 0.6,
                      }}
                    >
                      <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={shipStats.image}
                          alt=""
                          style={{
                            width: 44, height: 44, objectFit: 'contain',
                            filter: owned ? skin.filter : 'brightness(0.25) saturate(0)',
                            transition: 'filter 0.25s',
                          }}
                        />
                      </div>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: owned ? '#f0ede8' : '#a8a3a0', lineHeight: 1.15, textAlign: 'center' }}>{skin.name}</p>
                      {isEquipped ? (
                        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: skin.color }}>✓ Equipped</span>
                      ) : owned ? (
                        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#4ade80' }}>Tap to equip</span>
                      ) : (
                        <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#7a7674', textAlign: 'center', lineHeight: 1.3 }}>{skin.source}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* ── Items ── */}
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.7rem', letterSpacing: '0.04em' }}>Items</p>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', marginBottom: '1.5rem' }}>
                {/* Equip slots */}
                <div style={{ padding: '1rem', borderBottom: ownedRaidItems.length > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#8a8480', marginBottom: '0.7rem' }}>Equip up to 3 — effects apply in raids</p>
                  <div style={{ display: 'flex', gap: '0.7rem' }}>
                    {[0, 1, 2].map(i => {
                      const itemId  = equippedItems[i]
                      const itemDef = itemId ? getRaidItem(itemId) : null
                      const color   = itemDef ? RARITY_ITEM_COLOR[itemDef.rarity] : null
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                          {itemDef ? (
                            <>
                              <button
                                onClick={() => handleUnequipRaidItem(itemId!)}
                                style={{ position: 'relative', width: 64, height: 64, borderRadius: 12, background: `${color}11`, border: `1.5px solid ${color}55`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                              >
                                {itemDef.image ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={itemDef.image} alt={itemDef.name} style={{ width: 38, height: 38, objectFit: 'contain' }} />
                                ) : (
                                  <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{itemDef.emoji}</span>
                                )}
                                <div style={{ position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </div>
                              </button>
                              <p className="font-karla font-600 truncate text-center" style={{ fontSize: '0.62rem', color: color ?? '#b8b3ac', maxWidth: 64, lineHeight: 1.2 }}>{itemDef.name}</p>
                            </>
                          ) : (
                            <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1.5px dashed rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Owned items */}
                {ownedRaidItems.length > 0 ? (
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ownedRaidItems.map(itemId => {
                      const def      = getRaidItem(itemId)
                      if (!def) return null
                      const color    = RARITY_ITEM_COLOR[def.rarity]
                      const equipped = equippedItems.includes(itemId)
                      const full     = equippedItems.length >= 3 && !equipped
                      return (
                        <button
                          key={itemId}
                          onClick={equipped ? () => handleUnequipRaidItem(itemId) : full ? undefined : () => handleEquipRaidItem(itemId)}
                          disabled={full}
                          style={{ background: equipped ? `${color}14` : 'rgba(255,255,255,0.04)', border: `1.5px solid ${equipped ? color + '60' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, padding: '0.7rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: full ? 'default' : 'pointer', opacity: full ? 0.45 : 1, width: '100%', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0 }}>{def.emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: equipped ? color : '#f0ede8', marginBottom: 3 }}>{def.name}</p>
                            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8480', lineHeight: 1.4 }}>{def.description}</p>
                          </div>
                          <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.62rem', color: equipped ? color : '#7a7674', flexShrink: 0 }}>
                            {equipped ? 'Equipped' : 'Equip'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '0.85rem 1rem' }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#6a6460' }}>No items yet. Items drop from raid bosses.</p>
                  </div>
                )}
              </div>
              </div>{/* end scrollable */}
            </motion.div>

            {/* Crew picker — outside the motion.div to avoid CSS transform stacking context */}
            {sheetOpen && (
              <div
                onClick={closeSheet}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, paddingTop: '80px' }}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ background: '#0d0d0c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: 'calc(100dvh - 80px)', display: 'flex', flexDirection: 'column' }}
                >
                  <div style={{ padding: '1rem 1.25rem 0.875rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.48rem', color: pickerSlot === 0 ? '#f0c040' : '#4a6a8a', marginBottom: 3 }}>
                        {pickerSlot === 0 ? 'Captain' : pickerSlot !== null ? `Slot ${pickerSlot + 1}` : ''}
                      </p>
                      <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>
                        {pickerSlot === 0 ? 'Assign Captain' : 'Assign Crew'}
                      </p>
                      {pickerSlot === 0 ? (
                        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#8a8480', lineHeight: 1.5, marginTop: 6 }}>
                          Your captain uses full stats and <span style={{ color: '#c8aa6a' }}>always returns</span>. Crew use 80% stats and <span style={{ color: '#f87171' }}>can be lost permanently</span>.
                        </p>
                      ) : (
                        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6460', lineHeight: 1.5, marginTop: 6 }}>Crew contribute 80% of their stats and can be lost on risky voyages.</p>
                      )}
                    </div>
                    <button onClick={closeSheet} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0, marginLeft: '0.75rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>

                  {/* Sort bar */}
                  <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4845' }}>Sort:</span>
                    {STAT_COLS.map(s => {
                      const active = sortBy === s.key
                      return (
                        <button key={s.key} onClick={() => setSortBy(active ? null : s.key)} className="font-karla font-700" style={{ fontSize: '0.6rem', padding: '0.22rem 0.6rem', borderRadius: 999, background: active ? `${s.color}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? s.color + '66' : 'rgba(255,255,255,0.1)'}`, color: active ? s.color : '#5a5858', cursor: 'pointer' }}>
                          {s.short}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem 2rem', overscrollBehavior: 'contain' }}>
                    {collection.length === 0 ? (
                      <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: '#4a4845', padding: '3rem 1rem' }}>No cards yet. Open some packs first!</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                        {sortedPickerCards.map(card => {
                          const inCrew  = assignedNames.has(card.name) && slots[pickerSlot ?? -1]?.name !== card.name
                          const canPick = pickerSlot !== null && !inCrew
                          const rc      = RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764'
                          return (
                            <div key={card.variantId} onClick={canPick ? () => assignCard(card) : undefined} style={{ width: 90, borderRadius: 10, overflow: 'hidden', background: '#080a0e', border: `1.5px solid ${rc}55`, cursor: canPick ? 'pointer' : 'default', opacity: inCrew ? 0.28 : 1, flexShrink: 0 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
                              <div style={{ padding: '0.3rem 0.4rem 0.35rem', background: 'rgba(4,5,8,0.92)' }}>
                                <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.52rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: 5 }}>{card.name}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  {STAT_COLS.map(s => (
                                    <div key={s.key} style={{ textAlign: 'center' }}>
                                      <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: s.color, lineHeight: 1 }}>{card[s.key]}</p>
                                      <p style={{ fontSize: '0.38rem', color: '#5a5858', lineHeight: 1, marginTop: 2 }}>{s.short}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Score breakdown modal — opens when the player taps a score on the
          hero strip. Shows the actual formula with the player's numbers
          plugged in so they can see WHY their score is what it is. */}
      <AnimatePresence>
        {breakdownScore && (
          <>
            <motion.div
              key="breakdown-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 110 }}
              onClick={() => setBreakdownScore(null)}
            />
            {/* Flex-centering wrapper. Doesn't animate (so its own transform
                is left alone), which lets the inner motion.div animate scale
                + y without breaking the centering. pointer-events:none on
                the wrapper so backdrop clicks still pass through. */}
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 111,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
                pointerEvents: 'none',
              }}
            >
              <motion.div
                key="breakdown-modal"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 4 }}
                transition={{ duration: 0.18 }}
                style={{
                  pointerEvents: 'auto',
                  width: '100%',
                  maxWidth: 420,
                  maxHeight: 'calc(100svh - 80px)',
                  background: 'rgba(8,14,24,0.98)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 18,
                  padding: '1.1rem 1rem 1.25rem',
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                }}
              >
                {breakdownScore === 'voyage' ? (
                  <VoyageScoreBreakdown
                    power={totalPower}
                    dodge={totalDodge}
                    fortune={totalFortune}
                    total={voyageScore}
                    onClose={() => setBreakdownScore(null)}
                  />
                ) : (
                  <RaidScoreBreakdown
                    crewPower={totalPower}
                    crewDodge={totalDodge}
                    crewFortune={totalFortune}
                    navLevel={xpProgress.level}
                    navBonusPower={navBonus.power}
                    navBonusDodge={navBonus.navigation}
                    navBonusFortune={navBonus.fortune}
                    navBonusHp={navBonus.hp}
                    shipName={shipStats.name}
                    shipDurability={shipStats.durability}
                    shipMin={shipStats.minDamage}
                    rating={raidRating}
                    onClose={() => setBreakdownScore(null)}
                  />
                )}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Score breakdown modals ──────────────────────────────────────────────────

function BreakdownHeader({ title, color, onClose }: { title: string; color: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color }}>{title}</p>
      <button
        onClick={onClose}
        aria-label="Close breakdown"
        style={{
          color: '#e0ddd8', cursor: 'pointer',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '50%',
          width: 28, height: 28, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'manipulation',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

function VoyageScoreBreakdown({ power, dodge, fortune, total, onClose }: {
  power: number; dodge: number; fortune: number; total: number; onClose: () => void
}) {
  const powerRate   = Math.min(power   / 55, 0.80)
  const fortuneRate = Math.min(fortune / 45, 1)
  const dodgeRate   = Math.min(dodge   / 28, 1)
  const rows = [
    { label: 'Power',   value: power,   rate: powerRate,   cap: 55, color: '#f87171', max: 0.80 },
    { label: 'Nav',     value: dodge,   rate: dodgeRate,   cap: 28, color: '#60a5fa', max: 1.00 },
    { label: 'Fortune', value: fortune, rate: fortuneRate, cap: 45, color: '#f0c040', max: 1.00 },
  ]
  return (
    <>
      <BreakdownHeader title="Voyage Score" color="#7090c0" onClose={onClose} />
      <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: '#9a9488', lineHeight: 1.5, marginBottom: '0.85rem' }}>
        Predicts your crew&apos;s odds of clearing hard daily-voyage events.
      </p>

      {/* What contributes */}
      <div style={{
        padding: '0.55rem 0.75rem', marginBottom: '1rem',
        background: 'rgba(112,144,192,0.06)', border: '1px solid rgba(112,144,192,0.18)', borderRadius: 8,
      }}>
        <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#7090c0', marginBottom: 4 }}>What counts</p>
        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#a8b8cc', lineHeight: 1.45 }}>
          <span style={{ color: '#f0ede8' }}>Crew stats only.</span> Nav level and ship don&apos;t affect daily-voyage event rolls.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.95rem' }}>
        {rows.map(r => (
          <div key={r.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: r.color, width: 58, flexShrink: 0 }}>{r.label}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e0ddd8', width: 36, flexShrink: 0 }}>{r.value}</p>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.rate / r.max) * 100}%`, background: r.color, borderRadius: 3 }} />
              </div>
              <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#e0ddd8', width: 44, flexShrink: 0, textAlign: 'right' }}>{Math.round(r.rate * 100)}%</p>
            </div>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#5a5856', marginLeft: 62, marginTop: 1 }}>
              caps at {r.cap}{r.max < 1 ? ` (max ${Math.round(r.max * 100)}%)` : ''}
            </p>
          </div>
        ))}
      </div>

      <div style={{ padding: '0.7rem 0.85rem', background: 'rgba(112,144,192,0.08)', border: '1px solid rgba(112,144,192,0.22)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#9aaecc' }}>Average × 100</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{total}<span style={{ color: '#7090c0', fontSize: '0.7rem' }}> / 100</span></p>
        </div>
      </div>
    </>
  )
}

function RaidScoreBreakdown({
  crewPower, crewDodge, crewFortune,
  navLevel, navBonusPower, navBonusDodge, navBonusFortune, navBonusHp,
  shipName, shipDurability, shipMin,
  rating, onClose,
}: {
  crewPower: number; crewDodge: number; crewFortune: number
  navLevel: number; navBonusPower: number; navBonusDodge: number; navBonusFortune: number; navBonusHp: number
  shipName: string; shipDurability: number; shipMin: number
  rating: { offense: number; defense: number; total: number }
  onClose: () => void
}) {
  // Combined stats fed into the actual combat formula
  const totalPower   = crewPower   + navBonusPower
  const totalDodge   = crewDodge   + navBonusDodge
  const totalFortune = crewFortune + navBonusFortune
  const totalHp      = shipDurability + navBonusHp

  const powerMax = shipMin + Math.floor(totalPower / 4)
  const hitMin = Math.max(shipMin, Math.floor(powerMax * 0.5))
  const avgHit = (hitMin + powerMax) / 2
  const critRate = Math.min(totalFortune / 2, 50) / 100
  const dodgeBoost = Math.min(totalDodge / 200, 0.5)

  return (
    <>
      <BreakdownHeader title="Raid Score" color="#c8704a" onClose={onClose} />
      <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: '#9a9488', lineHeight: 1.5, marginBottom: '0.85rem' }}>
        Predicts your damage output and survivability in raid combat.
      </p>

      {/* What contributes — crew + Nav + ship breakdown */}
      <div style={{
        padding: '0.6rem 0.75rem', marginBottom: '0.85rem',
        background: 'rgba(200,112,74,0.05)', border: '1px solid rgba(200,112,74,0.20)', borderRadius: 8,
      }}>
        <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#c8704a', marginBottom: 6 }}>Stat contributions</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ContributionRow label="Power"   total={totalPower}   parts={[ { v: crewPower,   src: 'crew' }, { v: navBonusPower,   src: `Nav lvl ${navLevel}` } ]} color="#f87171" />
          <ContributionRow label="Nav"     total={totalDodge}   parts={[ { v: crewDodge,   src: 'crew' }, { v: navBonusDodge,   src: `Nav lvl ${navLevel}` } ]} color="#60a5fa" />
          <ContributionRow label="Fortune" total={totalFortune} parts={[ { v: crewFortune, src: 'crew' }, { v: navBonusFortune, src: `Nav lvl ${navLevel}` } ]} color="#f0c040" />
          <ContributionRow label="HP"      total={totalHp}      parts={[ { v: shipDurability, src: shipName }, { v: navBonusHp, src: `Nav lvl ${navLevel}` } ]} color="#4ade80" />
        </div>
      </div>

      {/* Offense block */}
      <div style={{ padding: '0.7rem 0.85rem', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 10, marginBottom: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.58rem', color: '#f87171' }}>Offense</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8' }}>{rating.offense}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <BreakdownRow label={`Avg hit dmg (${shipName})`} value={`${hitMin}–${powerMax} → ${avgHit.toFixed(1)}`} />
          <BreakdownRow label="Crit factor" value={`×${(1 + critRate).toFixed(2)} (Fortune ${totalFortune})`} />
        </div>
      </div>

      {/* Defense block */}
      <div style={{ padding: '0.7rem 0.85rem', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.22)', borderRadius: 10, marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.58rem', color: '#60a5fa' }}>Defense</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8' }}>{rating.defense}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <BreakdownRow label="Effective HP" value={`${totalHp}`} />
          <BreakdownRow label="Dodge boost" value={`×${(1 + dodgeBoost).toFixed(2)} (Nav ${totalDodge})`} />
        </div>
      </div>

      {/* Total */}
      <div style={{ padding: '0.7rem 0.85rem', background: 'rgba(200,112,74,0.08)', border: '1px solid rgba(200,112,74,0.30)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#d4906a' }}>
            Offense + Defense × 0.5
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{rating.total}</p>
        </div>
      </div>
    </>
  )
}

function ContributionRow({ label, total, parts, color }: {
  label: string
  total: number
  parts: { v: number; src: string }[]
  color: string
}) {
  // Filter out zero contributions but keep the order so the breakdown stays readable
  const nonZero = parts.filter(p => p.v > 0)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', minHeight: 14 }}>
      <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color, width: 52, flexShrink: 0 }}>{label}</p>
      <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#9a9488', flex: 1, lineHeight: 1.3 }}>
        {nonZero.length > 0 ? nonZero.map((p, i) => (
          <span key={p.src}>
            {i > 0 && <span style={{ color: '#5a5856' }}> + </span>}
            <span style={{ color: '#d8d4cf', fontFeatureSettings: '"tnum"' }}>{p.v}</span>
            <span style={{ color: '#6a6764' }}> ({p.src})</span>
          </span>
        )) : <span style={{ color: '#5a5856' }}>—</span>}
      </p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#e0ddd8', minWidth: 28, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>{total}</p>
    </div>
  )
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#8a8784' }}>{label}</p>
      <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#d8d4cf', fontFeatureSettings: '"tnum"' }}>{value}</p>
    </div>
  )
}
