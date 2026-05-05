'use client'

import { useState, useTransition } from 'react'
import type { ShipStats } from '@/lib/expeditions'
import { RARITY_COLORS } from '@/lib/expeditions'
import { saveCrew } from './actions'
import { renameShip } from '@/app/shipyard/actions'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

type CollectionCard = {
  collectionId: number
  variantId: number
  name: string
  filename: string
  borderStyle: string
  artEffect: string
  variantName: string
  dropWeight: number
  rarity: string
  power: number
  dodge: number
  fortune: number
}

const STAT_COLS = [
  { key: 'power'   as const, label: 'Power',   sub: 'Combat & raids',    color: '#f87171' },
  { key: 'dodge'   as const, label: 'Dodge',   sub: 'Crew survival',     color: '#60a5fa' },
  { key: 'fortune' as const, label: 'Fortune', sub: 'Loot & rewards',    color: '#f0c040' },
]

interface Props {
  shipStats: ShipStats
  shipTier: number
  collection: CollectionCard[]
  savedCrewVariantIds: number[]
  shipName: string | null
}

export default function CrewRoster({ shipStats, collection, savedCrewVariantIds, shipName: initialShipName }: Props) {
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
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [, startTransition] = useTransition()
  const [shipName, setShipName] = useState(initialShipName)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(initialShipName ?? '')

  function submitRename() {
    const trimmed = nameInput.trim().slice(0, 32)
    if (!trimmed) { setEditingName(false); return }
    setShipName(trimmed)
    setEditingName(false)
    startTransition(async () => { await renameShip(trimmed) })
  }

  const assignedVariantIds = new Set(slots.filter(Boolean).map(c => c!.variantId))

  function openPickerForSlot(i: number) { setPickerSlot(i); setSheetOpen(true) }
  function closeSheet() { setSheetOpen(false); setPickerSlot(null) }

  function assignCard(card: CollectionCard) {
    if (pickerSlot === null) return
    const next = [...slots]
    next[pickerSlot] = card
    setSlots(next)
    closeSheet()
    persist(next)
  }

  function removeFromSlot(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    const next = [...slots]
    next[i] = null
    setSlots(next)
    persist(next)
  }

  function persist(next: (CollectionCard | null)[]) {
    const ids = next.filter(Boolean).map(c => c!.variantId)
    window.dispatchEvent(new CustomEvent('crew-changed', { detail: ids }))
    startTransition(async () => { await saveCrew(ids) })
  }

  const pickerCards = pickerSlot !== null
    ? collection.filter(c => !assignedVariantIds.has(c.variantId) || slots[pickerSlot]?.variantId === c.variantId)
    : collection

  const totalPower   = slots.reduce((s, c, i) => s + (c ? Math.round(c.power   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalDodge   = slots.reduce((s, c, i) => s + (c ? Math.round(c.dodge   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalFortune = slots.reduce((s, c, i) => s + (c ? Math.round(c.fortune * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totals = { power: totalPower, dodge: totalDodge, fortune: totalFortune }
  const hasCrew = slots.some(Boolean)

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        background: 'rgba(6,8,12,0.82)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>

        {/* Ship header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.65rem 1rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shipStats.image} alt="" style={{ width: 22, height: 22, objectFit: 'contain', opacity: 0.75, flexShrink: 0 }} />
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: 0 }}>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
                  maxLength={32}
                  placeholder={shipStats.name}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 6, padding: '0.2rem 0.45rem',
                    color: '#f0ede8', fontSize: '0.78rem', fontFamily: 'inherit',
                    outline: 'none', flex: 1, minWidth: 0,
                  }}
                />
                <button onClick={submitRename} style={{ background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 5, padding: '0.18rem 0.5rem', color: '#f0c040', cursor: 'pointer', fontSize: '0.62rem', flexShrink: 0 }} className="font-karla font-700">Save</button>
                <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5248', fontSize: '0.62rem', flexShrink: 0 }} className="font-karla">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}
              >
                <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#c0bdb8' }}>{shipName ?? shipStats.name}</p>
                <span style={{ fontSize: '0.6rem', color: '#4a3a28', flexShrink: 0 }}>✎</span>
              </button>
            )}
          </div>
          <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#8a8784', flexShrink: 0 }}>
            {slots.filter(Boolean).length}/{shipStats.crewSlots} crew
          </p>
        </div>

        {/* Crew portraits */}
        <div style={{ padding: '0.9rem 1rem', borderBottom: hasCrew ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            {slots.map((card, i) => {
              const isCaptain = i === 0
              const rc = card ? (RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764') : null
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                  {card ? (
                    <>
                      <div
                        onClick={() => openPickerForSlot(i)}
                        style={{
                          position: 'relative', width: 64, height: 64,
                          borderRadius: 12, overflow: 'hidden',
                          border: isCaptain ? `2px solid rgba(240,192,64,0.55)` : `1.5px solid ${rc}40`,
                          cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={IMG_BASE + card.filename}
                          alt={card.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                        />
                        {isCaptain && (
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'rgba(10,8,4,0.85)',
                            borderTop: '1px solid rgba(240,192,64,0.3)',
                            textAlign: 'center', padding: '0.12rem 0',
                          }}>
                            <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.34rem', color: '#f0c040' }}>Captain</span>
                          </div>
                        )}
                        {/* Remove button */}
                        <button
                          onClick={(e) => removeFromSlot(i, e)}
                          style={{
                            position: 'absolute', top: 3, right: 3,
                            width: 16, height: 16, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', padding: 0,
                          }}
                        >
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      <p className="font-karla font-600 truncate text-center" style={{ fontSize: '0.52rem', color: isCaptain ? '#d4b870' : '#8a8784', maxWidth: 64, lineHeight: 1.2 }}>
                        {card.name}
                      </p>
                    </>
                  ) : (
                    <button
                      onClick={() => openPickerForSlot(i)}
                      style={{
                        width: 64, height: 64, borderRadius: 12,
                        background: isCaptain ? 'rgba(240,192,64,0.03)' : 'rgba(255,255,255,0.02)',
                        border: isCaptain ? '1.5px dashed rgba(240,192,64,0.18)' : '1.5px dashed rgba(255,255,255,0.08)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', gap: 4, padding: 0,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isCaptain ? 'rgba(240,192,64,0.22)' : 'rgba(255,255,255,0.12)'} strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                      <p className="font-karla" style={{ fontSize: '0.38rem', color: isCaptain ? '#8a7030' : '#5a5856' }}>
                        {isCaptain ? 'Captain' : 'Crew'}
                      </p>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Stats */}
        {hasCrew && (
          <div style={{ padding: '1rem 1rem 0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {STAT_COLS.map(s => (
                <div key={s.key} style={{ textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: s.color, lineHeight: 1 }}>
                    {totals[s.key]}
                  </p>
                  <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.52rem', color: '#c0bdb8', marginTop: 4 }}>
                    {s.label}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', color: '#8a8784', marginTop: 2 }}>
                    {s.sub}
                  </p>
                </div>
              ))}
            </div>

            {/* Breakdown toggle */}
            <button
              onClick={() => setShowBreakdown(b => !b)}
              className="font-karla font-600"
              style={{
                width: '100%', marginTop: '0.9rem', paddingTop: '0.65rem',
                background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer', fontSize: '0.48rem', color: '#8a8784',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              }}
            >
              <span>{showBreakdown ? '▲' : '▼'}</span>
              <span>{showBreakdown ? 'Hide breakdown' : 'Show breakdown'}</span>
            </button>

            {showBreakdown && (
              <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="font-karla font-600 uppercase" style={{ fontSize: '0.38rem', color: '#6a6764', flex: 1 }}>Crew</p>
                  {STAT_COLS.map(s => (
                    <p key={s.key} className="font-karla font-700 uppercase" style={{ fontSize: '0.38rem', color: s.color, width: 32, textAlign: 'right' }}>{s.label.slice(0,3)}</p>
                  ))}
                </div>
                {slots.map((card, i) => {
                  if (!card) return null
                  const isCaptain = i === 0
                  const mult = isCaptain ? 1 : 0.8
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                        <p className="font-karla font-600 truncate" style={{ fontSize: '0.5rem', color: isCaptain ? '#d4b870' : '#6a6764' }}>{card.name}</p>
                        <span className="font-karla" style={{ fontSize: '0.38rem', color: '#6a6764', flexShrink: 0 }}>{isCaptain ? '×1.0' : '×0.8'}</span>
                      </div>
                      {STAT_COLS.map(s => (
                        <p key={s.key} className="font-cinzel font-700" style={{ fontSize: '0.5rem', color: s.color, width: 32, textAlign: 'right' }}>
                          {Math.round(card[s.key] * mult)}
                        </p>
                      ))}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', paddingTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.38rem', color: '#6a6764', flex: 1 }}>Total</p>
                  {STAT_COLS.map(s => (
                    <p key={s.key} className="font-cinzel font-700" style={{ fontSize: '0.5rem', color: s.color, width: 32, textAlign: 'right' }}>
                      {totals[s.key]}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Picker bottom sheet */}
      {sheetOpen && (
        <div
          onClick={closeSheet}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0d0d0c', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '82vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '1rem 1.25rem 0.875rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.48rem', color: pickerSlot === 0 ? '#f0c040' : '#4a6a8a', marginBottom: 3 }}>
                  {pickerSlot === 0 ? 'Captain' : pickerSlot !== null ? `Slot ${pickerSlot + 1}` : 'Collection'}
                </p>
                <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>
                  {pickerSlot !== null ? (pickerSlot === 0 ? 'Assign Captain' : 'Assign Crew') : 'Crew Roster'}
                </p>
                {pickerSlot === 0 && (
                  <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: '#6a6764', marginTop: 4 }}>Captain gets full stats · others ×0.8</p>
                )}
              </div>
              <button
                onClick={closeSheet}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem 2rem' }}>
              {collection.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#4a4845' }}>No cards yet. Open some packs first!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                  {pickerCards.map(card => {
                    const inCrew = assignedVariantIds.has(card.variantId) && slots[pickerSlot ?? -1]?.variantId !== card.variantId
                    const canPick = pickerSlot !== null && !inCrew
                    const rc = RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764'
                    return (
                      <div
                        key={card.variantId}
                        onClick={canPick ? () => assignCard(card) : undefined}
                        style={{
                          width: 90, borderRadius: 10, overflow: 'hidden',
                          background: '#080a0e', border: `1.5px solid ${rc}55`,
                          cursor: canPick ? 'pointer' : 'default', opacity: inCrew ? 0.28 : 1, flexShrink: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
                        <div style={{ padding: '0.3rem 0.4rem 0.35rem', background: 'rgba(4,5,8,0.92)' }}>
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.52rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: 4 }}>{card.name}</p>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {STAT_COLS.map(s => (
                              <div key={s.key} style={{ textAlign: 'center', flex: 1 }}>
                                <p className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: s.color, lineHeight: 1 }}>{card[s.key]}</p>
                                <p style={{ fontSize: '0.38rem', color: '#5a5856', lineHeight: 1, marginTop: 2 }}>{s.label.slice(0,3).toUpperCase()}</p>
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
    </div>
  )
}
