'use client'

import { useState, useTransition } from 'react'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import type { ShipStats } from '@/lib/expeditions'
import { saveCrew } from './actions'

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

interface Props {
  shipStats: ShipStats
  shipTier: number
  collection: CollectionCard[]
  savedCrewVariantIds: number[]
}

const CARD_W = 80
const CARD_H = Math.round(CARD_W * 196 / 140)

const STAT_COLS = [
  { key: 'power'   as const, label: 'PWR', symbol: '⚔', color: '#f87171' },
  { key: 'dodge'   as const, label: 'DGE', symbol: '◇', color: '#60a5fa' },
  { key: 'fortune' as const, label: 'FTN', symbol: '★', color: '#f0c040' },
]

export default function CrewRoster({ shipStats, collection, savedCrewVariantIds }: Props) {
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
  const [, startTransition] = useTransition()

  const assignedVariantIds = new Set(slots.filter(Boolean).map(c => c!.variantId))

  function openPickerForSlot(i: number) {
    setPickerSlot(i)
    setSheetOpen(true)
  }

  function openRoster() {
    setPickerSlot(null)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setPickerSlot(null)
  }

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
    startTransition(async () => { await saveCrew(ids) })
  }

  const pickerCards = pickerSlot !== null
    ? collection.filter(c => !assignedVariantIds.has(c.variantId) || slots[pickerSlot]?.variantId === c.variantId)
    : collection

  const totalPower   = slots.reduce((s, c) => s + (c?.power   ?? 0), 0)
  const totalDodge   = slots.reduce((s, c) => s + (c?.dodge   ?? 0), 0)
  const totalFortune = slots.reduce((s, c) => s + (c?.fortune ?? 0), 0)

  return (
    <div style={{ marginBottom: '1.75rem' }}>

      {/* Ship bar */}
      <div style={{
        background: 'rgba(6,8,12,0.82)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '14px 14px 0 0',
        padding: '0.75rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem' }}>⚓</span>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.85rem' }}>{shipStats.name}</p>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          {[
            { label: 'DUR', value: shipStats.durability, color: '#60a5fa' },
            { label: 'SPD', value: shipStats.speed,      color: '#f0c040' },
            { label: 'ARM', value: shipStats.armor,       color: '#4ade80' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: s.color, lineHeight: 1 }}>{s.value}</p>
              <p className="font-karla font-600 uppercase" style={{ fontSize: '0.38rem', color: '#6a6764', marginTop: 2, letterSpacing: '0.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Crew section */}
      <div style={{
        background: 'rgba(6,8,12,0.75)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderTop: 'none',
        borderRadius: '0 0 14px 14px',
        padding: '0.875rem 1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#4a6a8a' }}>
            Active Crew · {slots.filter(Boolean).length}/{shipStats.crewSlots}
          </p>
          <button
            onClick={openRoster}
            className="font-karla font-600 uppercase tracking-[0.1em]"
            style={{ fontSize: '0.48rem', color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            View Roster →
          </button>
        </div>

        {/* Crew slots row */}
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {slots.map((card, i) => (
            <div key={i} style={{ flexShrink: 0, width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
              {card ? (
                <>
                  <div style={{ position: 'relative', width: 76 }}>
                    {/* Image window */}
                    <div
                      onClick={() => openPickerForSlot(i)}
                      style={{
                        width: 76, height: 76,
                        borderRadius: 10,
                        border: '1.5px solid rgba(255,255,255,0.18)',
                        overflow: 'hidden',
                        background: '#080a0e',
                        cursor: 'pointer',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={IMG_BASE + card.filename}
                        alt={card.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                      />
                    </div>
                    <button
                      onClick={(e) => removeFromSlot(i, e)}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 17, height: 17, borderRadius: '50%',
                        background: 'rgba(8,8,10,0.9)', border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', zIndex: 5, padding: 0,
                      }}
                    >
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#a0a09a" strokeWidth="3.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <p className="font-karla font-600 text-center truncate" style={{ fontSize: '0.55rem', color: '#c0bdb8', lineHeight: 1.2, width: '100%' }}>{card.name}</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                    {STAT_COLS.map(s => (
                      <div key={s.key} style={{ textAlign: 'center' }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.62rem', color: s.color, lineHeight: 1 }}>
                          {card[s.key]}
                        </p>
                        <p style={{ fontSize: '0.46rem', color: '#5a5856', marginTop: 1, lineHeight: 1 }}>{s.symbol}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => openPickerForSlot(i)}
                  style={{
                    width: 76, height: 76,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1.5px dashed rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', gap: 5, padding: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  <p className="font-karla" style={{ fontSize: '0.42rem', color: '#4a4845' }}>Empty</p>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Crew totals */}
        {slots.some(Boolean) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem', marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {STAT_COLS.map(s => (
              <div key={s.key} style={{ textAlign: 'center' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: s.color, lineHeight: 1 }}>
                  {s.key === 'power' ? totalPower : s.key === 'dodge' ? totalDodge : totalFortune}
                </p>
                <p className="font-karla font-600 uppercase" style={{ fontSize: '0.4rem', color: '#6a6764', marginTop: 3, letterSpacing: '0.06em' }}>Total {s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roster / picker bottom sheet */}
      {sheetOpen && (
        <div
          onClick={closeSheet}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0d0d0c',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 520, maxHeight: '82vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Sheet header */}
            <div style={{ padding: '1rem 1.25rem 0.875rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                {pickerSlot !== null ? (
                  <>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.48rem', color: '#4a6a8a', marginBottom: 3 }}>
                      Slot {pickerSlot + 1} · Select
                    </p>
                    <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>Assign Crew Member</p>
                  </>
                ) : (
                  <>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.48rem', color: '#4a6a8a', marginBottom: 3 }}>
                      Your Collection
                    </p>
                    <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>Crew Roster</p>
                  </>
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

            {/* Card grid */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.25rem 2rem' }}>
              {collection.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#4a4845' }}>No cards yet.</p>
                  <p className="font-karla" style={{ fontSize: '0.65rem', color: '#3a3835', marginTop: 4 }}>Open some packs first!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                  {pickerCards.map(card => {
                    const inCrew = assignedVariantIds.has(card.variantId) && slots[pickerSlot ?? -1]?.variantId !== card.variantId
                    const isActive = slots.some(s => s?.variantId === card.variantId)
                    const canPick = pickerSlot !== null && !inCrew
                    return (
                      <div
                        key={card.variantId}
                        style={{ position: 'relative', opacity: inCrew ? 0.28 : 1, cursor: canPick ? 'pointer' : 'default' }}
                        onClick={() => canPick ? assignCard(card) : undefined}
                      >
                        <FishCard
                          name={card.name}
                          filename={card.filename}
                          borderStyle={card.borderStyle as BorderStyle}
                          artEffect={card.artEffect as ArtEffect}
                          variantName={card.variantName}
                          dropWeight={card.dropWeight}
                          stats={{ power: card.power, dodge: card.dodge, fortune: card.fortune }}
                          cardW={100}
                        />
                        {isActive && pickerSlot === null && (
                          <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.4rem', letterSpacing: '0.1em', background: 'rgba(240,192,64,0.9)', color: '#0a0a08', padding: '0.12rem 0.45rem', borderRadius: 2 }}>
                              In Crew
                            </span>
                          </div>
                        )}
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
