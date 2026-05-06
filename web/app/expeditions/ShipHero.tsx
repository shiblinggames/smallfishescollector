'use client'

import { useState, useTransition, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ShipStats } from '@/lib/expeditions'
import { RARITY_COLORS } from '@/lib/expeditions'
import { SHIP_SKINS } from '@/lib/shipSkins'
import { saveCrew, equipShipSkin } from './actions'
import { renameShip } from '@/app/shipyard/actions'
import { getXPProgress, getNavigatorTitle } from '@/lib/expeditionLevel'

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

interface Props {
  shipStats: ShipStats
  shipName: string | null
  expeditionXP: number
  equippedShipSkin: string | null
  shipSkins: string[]
  collection: CollectionCard[]
  savedCrewVariantIds: number[]
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

  // Ship name state
  const [shipName, setShipName] = useState(initialShipName)

  // Modal state
  const [loadoutOpen, setLoadoutOpen] = useState(false)

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

  // Crew management
  const assignedVariantIds = new Set(slots.filter(Boolean).map(c => c!.variantId))

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

  // Scores — computed live from slots
  const totalPower   = slots.reduce((s, c, i) => s + (c ? Math.round(c.power   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalDodge   = slots.reduce((s, c, i) => s + (c ? Math.round(c.dodge   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalFortune = slots.reduce((s, c, i) => s + (c ? Math.round(c.fortune * (i === 0 ? 1 : 0.8)) : 0), 0)
  const voyageScore  = totalPower + totalDodge + Math.round(totalFortune * 0.5)
  const powerMax     = shipStats.minDamage + Math.floor(totalPower / 4)
  const raidScore    = Math.floor(powerMax * 4) + Math.floor(shipStats.durability * 0.5) + Math.floor(totalDodge * 0.4) + Math.floor(totalFortune * 0.2)
  const hasCrew      = slots.some(Boolean)

  // Skin filter
  const skinDef     = equippedSkin ? SHIP_SKINS.find(s => s.id === equippedSkin) : undefined
  const skinFilter  = skinDef?.filter ?? 'none'

  // Picker cards
  const pickerCards = pickerSlot !== null
    ? collection.filter(c => !assignedVariantIds.has(c.variantId) || slots[pickerSlot]?.variantId === c.variantId)
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
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
                <div>
                  <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#9a9488', marginBottom: 2 }}>Voyage</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '2.2rem', color: '#f0ede8', lineHeight: 1 }}>{voyageScore}</p>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', marginBottom: 3 }} />
                <div>
                  <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#9a9488', marginBottom: 2 }}>Raid</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '2.2rem', color: '#f0ede8', lineHeight: 1 }}>{raidScore}</p>
                </div>
              </div>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.65rem', color: '#5a5248' }}>No crew assigned</p>
            )}
          </div>
        </div>

        {/* Loadout button */}
        <button
          onClick={() => setLoadoutOpen(true)}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.025)', border: 'none',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            padding: '0.6rem 1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.3)' }}>Loadout</span>
        </button>
      </div>

      {/* ── Loadout drawer ── */}
      <AnimatePresence>
        {loadoutOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="loadout-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49 }}
              onClick={closeLoadout}
            />

            {/* Drawer */}
            <motion.div
              key="loadout-drawer"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              {...drawerDragProps(closeLoadout)}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                background: 'rgba(6,12,20,0.98)',
                borderTop: '1px solid rgba(255,255,255,0.09)',
                borderRadius: '18px 18px 0 0',
                maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain',
                padding: '0 1rem 3rem',
              }}
            >
              <DrawerHandle />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: '#6a6764' }}>Loadout</p>
                <button onClick={closeLoadout} style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
              </div>

              {/* Ship preview with skin + rename */}
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shipStats.image}
                  alt={shipName ?? shipStats.name}
                  style={{ width: 90, height: 90, objectFit: 'contain', display: 'block', margin: '0 auto 0.75rem', filter: skinFilter, transition: 'filter 0.3s ease' }}
                />
                {editingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
                      maxLength={32}
                      placeholder={shipStats.name}
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, padding: '0.25rem 0.55rem', color: '#f0ede8', fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none', textAlign: 'center', width: 180 }}
                    />
                    <button onClick={submitRename} style={{ background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 5, padding: '0.22rem 0.5rem', color: '#f0c040', cursor: 'pointer', fontSize: '0.62rem' }} className="font-karla font-700">Save</button>
                    <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5248', fontSize: '0.62rem' }}>✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#e0ddd8' }}>{shipName ?? shipStats.name}</p>
                    <span style={{ fontSize: '0.6rem', color: '#4a3a28' }}>✎</span>
                  </button>
                )}
              </div>

              {/* ── Crew ── */}
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Crew</p>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem', borderBottom: hasCrew ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
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
                                    <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.34rem', color: '#f0c040' }}>Captain</span>
                                  </div>
                                )}
                                <button onClick={e => removeFromSlot(i, e)} style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </div>
                              <p className="font-karla font-600 truncate text-center" style={{ fontSize: '0.52rem', color: isCaptain ? '#d4b870' : '#8a8784', maxWidth: 64, lineHeight: 1.2 }}>{card.name}</p>
                            </>
                          ) : (
                            <button
                              onClick={() => openPickerForSlot(i)}
                              style={{ width: 64, height: 64, borderRadius: 12, background: isCaptain ? 'rgba(240,192,64,0.03)' : 'rgba(255,255,255,0.02)', border: isCaptain ? '1.5px dashed rgba(240,192,64,0.18)' : '1.5px dashed rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4, padding: 0 }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isCaptain ? 'rgba(240,192,64,0.22)' : 'rgba(255,255,255,0.12)'} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                              <p className="font-karla" style={{ fontSize: '0.38rem', color: isCaptain ? '#8a7030' : '#5a5856' }}>{isCaptain ? 'Captain' : 'Crew'}</p>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {hasCrew && (
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1.5rem' }}>
                    {STAT_COLS.map(s => (
                      <div key={s.key}>
                        <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#6a6764', marginBottom: 1 }}>{s.short}</p>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: s.color }}>
                          {s.key === 'power' ? totalPower : s.key === 'dodge' ? totalDodge : totalFortune}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Ship Skins ── */}
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Ship Skins</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                {/* Default */}
                <button
                  onClick={() => handleEquipSkin(null)}
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1.5px solid ${equippedSkin === null ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shipStats.image} alt="" style={{ width: 46, height: 46, objectFit: 'contain', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e0ddd8', marginBottom: 2 }}>Default</p>
                    <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248' }}>The original hull</p>
                  </div>
                  {equippedSkin === null && <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#f0ede8', flexShrink: 0 }}>Equipped</span>}
                </button>

                {SHIP_SKINS.map(skin => {
                  const owned   = ownedSkins.includes(skin.id)
                  const equipped = equippedSkin === skin.id
                  return (
                    <button
                      key={skin.id}
                      onClick={owned ? () => handleEquipSkin(skin.id) : undefined}
                      disabled={!owned}
                      style={{ background: 'rgba(255,255,255,0.03)', border: `1.5px solid ${equipped ? skin.color + '88' : owned ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: owned ? 'pointer' : 'default', opacity: owned ? 1 : 0.5, width: '100%', textAlign: 'left' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shipStats.image} alt="" style={{ width: 46, height: 46, objectFit: 'contain', flexShrink: 0, filter: owned ? skin.filter : 'brightness(0.2) saturate(0)', transition: 'filter 0.25s' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: equipped ? skin.color : '#e0ddd8', marginBottom: 2 }}>{skin.name}</p>
                        <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248' }}>{skin.description}</p>
                        {!owned && <p className="font-karla" style={{ fontSize: '0.56rem', color: '#3a3835', marginTop: 3 }}>Drops from: {skin.source}</p>}
                      </div>
                      {equipped && <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: skin.color, flexShrink: 0 }}>Equipped</span>}
                      {owned && !equipped && <span className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#4a4845', flexShrink: 0 }}>Equip</span>}
                    </button>
                  )
                })}
              </div>

              {/* ── Items ── */}
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Items</p>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '1.1rem 1rem', textAlign: 'center' }}>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#4a4845' }}>Item slots coming soon.</p>
                <p className="font-karla" style={{ fontSize: '0.6rem', color: '#3a3835', marginTop: 3 }}>Special items drop from raid bosses.</p>
              </div>
            </motion.div>

            {/* Crew picker — outside the motion.div to avoid CSS transform stacking context */}
            {sheetOpen && (
              <div
                onClick={closeSheet}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60, paddingTop: '3rem' }}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ background: '#0d0d0c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '100%', display: 'flex', flexDirection: 'column' }}
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
                          const inCrew  = assignedVariantIds.has(card.variantId) && slots[pickerSlot ?? -1]?.variantId !== card.variantId
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
    </>
  )
}
