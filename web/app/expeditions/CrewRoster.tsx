'use client'

import { useState, useTransition } from 'react'
import type { ShipStats } from '@/lib/expeditions'
import { RARITY_COLORS } from '@/lib/expeditions'
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

function CardThumb({ card, onClick, dim, active, pickerMode }: {
  card: CollectionCard
  onClick?: () => void
  dim?: boolean
  active?: boolean
  pickerMode?: boolean
}) {
  const rarityColor = RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764'
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: 90,
        borderRadius: 10,
        overflow: 'hidden',
        background: '#080a0e',
        border: `1.5px solid ${rarityColor}55`,
        cursor: onClick ? 'pointer' : 'default',
        opacity: dim ? 0.28 : 1,
        flexShrink: 0,
      }}
    >
      {/* Fish art */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={IMG_BASE + card.filename}
        alt={card.name}
        style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
      />
      {/* Bottom label */}
      <div style={{ padding: '0.3rem 0.4rem 0.35rem', background: 'rgba(4,5,8,0.92)' }}>
        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.52rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: 4 }}>{card.name}</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {STAT_COLS.map(s => (
            <div key={s.key} style={{ textAlign: 'center', flex: 1 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: s.color, lineHeight: 1 }}>{card[s.key]}</p>
              <p style={{ fontSize: '0.38rem', color: '#5a5856', lineHeight: 1, marginTop: 2 }}>{s.symbol}</p>
            </div>
          ))}
        </div>
      </div>
      {active && !pickerMode && (
        <div style={{ position: 'absolute', top: 4, right: 4 }}>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.35rem', letterSpacing: '0.08em', background: 'rgba(240,192,64,0.9)', color: '#0a0a08', padding: '0.1rem 0.3rem', borderRadius: 2 }}>Crew</span>
        </div>
      )}
    </div>
  )
}

interface Props {
  shipStats: ShipStats
  shipTier: number
  collection: CollectionCard[]
  savedCrewVariantIds: number[]
}

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
  const [showBreakdown, setShowBreakdown] = useState(false)
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

  const totalPower   = slots.reduce((s, c, i) => s + (c ? Math.round(c.power   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalDodge   = slots.reduce((s, c, i) => s + (c ? Math.round(c.dodge   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalFortune = slots.reduce((s, c, i) => s + (c ? Math.round(c.fortune * (i === 0 ? 1 : 0.8)) : 0), 0)
  const assignedCount = slots.filter(Boolean).length
  const dmgMin    = Math.max(1, assignedCount)
  const dmgMax    = Math.max(1, totalPower)
  const dodgePct  = Math.min(50 + Math.round(totalDodge / 2), 100)
  const critPct   = Math.min(Math.round(totalFortune / 2), 50)

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shipStats.image} alt="" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0, opacity: 0.92 }} />
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.85rem' }}>{shipStats.name}</p>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          {[
            { label: 'DMG',   value: assignedCount > 0 ? `${dmgMin}–${dmgMax}` : '—', color: '#f87171' },
            { label: 'DODGE', value: assignedCount > 0 ? `${dodgePct}%`         : '—', color: '#60a5fa' },
            { label: 'CRIT',  value: assignedCount > 0 ? `${critPct}%`          : '—', color: '#f0c040' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: assignedCount > 0 ? s.color : '#3a3835', lineHeight: 1 }}>{s.value}</p>
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
          {slots.map((card, i) => {
            const isCaptain = i === 0
            return (
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
                          border: isCaptain ? '1.5px solid rgba(240,192,64,0.5)' : '1.5px solid rgba(255,255,255,0.18)',
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
                      {isCaptain && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
                          <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.36rem', color: '#f0c040', background: 'rgba(10,8,4,0.82)', borderTop: '1px solid rgba(240,192,64,0.35)', padding: '0.15rem 0.5rem', borderRadius: '0 0 8px 8px', display: 'block', width: '100%', textAlign: 'center' }}>Captain</span>
                        </div>
                      )}
                    </div>
                    <p className="font-karla font-600 text-center truncate" style={{ fontSize: '0.55rem', color: isCaptain ? '#d4b870' : '#c0bdb8', lineHeight: 1.2, width: '100%' }}>{card.name}</p>
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
                      background: isCaptain ? 'rgba(240,192,64,0.02)' : 'rgba(255,255,255,0.02)',
                      border: isCaptain ? '1.5px dashed rgba(240,192,64,0.2)' : '1.5px dashed rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', gap: 5, padding: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isCaptain ? 'rgba(240,192,64,0.25)' : 'rgba(255,255,255,0.15)'} strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <p className="font-karla" style={{ fontSize: '0.42rem', color: isCaptain ? '#6a5820' : '#4a4845' }}>
                      {isCaptain ? 'Captain' : 'Empty'}
                    </p>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Crew totals */}
        {slots.some(Boolean) && (
          <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setShowBreakdown(b => !b)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1.75rem' }}>
                {STAT_COLS.map(s => (
                  <div key={s.key} style={{ textAlign: 'center' }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: s.color, lineHeight: 1 }}>
                      {s.key === 'power' ? totalPower : s.key === 'dodge' ? totalDodge : totalFortune}
                    </p>
                    <p className="font-karla font-600 uppercase" style={{ fontSize: '0.4rem', color: '#6a6764', marginTop: 3, letterSpacing: '0.06em' }}>Total {s.label}</p>
                  </div>
                ))}
              </div>
              <p className="font-karla" style={{ fontSize: '0.4rem', color: '#4a4845', marginTop: '0.5rem', textAlign: 'center' }}>
                {showBreakdown ? '▲ hide breakdown' : '▼ how is this calculated?'}
              </p>
            </button>

            {showBreakdown && (
              <div style={{ marginTop: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.38rem', color: '#4a4845', flex: 1 }}>Crew</p>
                  {STAT_COLS.map(s => (
                    <p key={s.key} className="font-karla font-600 uppercase" style={{ fontSize: '0.38rem', color: s.color, width: 28, textAlign: 'right' }}>{s.label}</p>
                  ))}
                </div>
                {slots.map((card, i) => {
                  if (!card) return null
                  const isCaptain = i === 0
                  const mult = isCaptain ? 1 : 0.8
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                        <p className="font-karla font-600 truncate" style={{ fontSize: '0.5rem', color: isCaptain ? '#d4b870' : '#8a8784' }}>{card.name}</p>
                        <span className="font-karla" style={{ fontSize: '0.38rem', color: isCaptain ? 'rgba(240,192,64,0.6)' : '#4a4845', flexShrink: 0 }}>{isCaptain ? '×1.0' : '×0.8'}</span>
                      </div>
                      {STAT_COLS.map(s => (
                        <p key={s.key} className="font-cinzel font-700" style={{ fontSize: '0.5rem', color: s.color, width: 28, textAlign: 'right' }}>
                          {Math.round(card[s.key] * mult)}
                        </p>
                      ))}
                    </div>
                  )
                })}
                {/* Total row */}
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.38rem', color: '#6a6764', flex: 1 }}>Total</p>
                  {STAT_COLS.map(s => (
                    <p key={s.key} className="font-cinzel font-700" style={{ fontSize: '0.5rem', color: s.color, width: 28, textAlign: 'right' }}>
                      {s.key === 'power' ? totalPower : s.key === 'dodge' ? totalDodge : totalFortune}
                    </p>
                  ))}
                </div>
              </div>
            )}
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
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.48rem', color: pickerSlot === 0 ? '#f0c040' : '#4a6a8a', marginBottom: 3 }}>
                      {pickerSlot === 0 ? 'Captain' : `Slot ${pickerSlot + 1} · Select`}
                    </p>
                    <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>
                      {pickerSlot === 0 ? 'Assign Captain' : 'Assign Crew Member'}
                    </p>
                    {pickerSlot === 0 && (
                      <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: '#6a6764', marginTop: 4 }}>Captain gets full stats · others get ×0.8</p>
                    )}
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
                      <CardThumb
                        key={card.variantId}
                        card={card}
                        onClick={canPick ? () => assignCard(card) : undefined}
                        dim={inCrew}
                        active={isActive}
                        pickerMode={pickerSlot !== null}
                      />
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
