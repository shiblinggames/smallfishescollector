'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startExpedition } from '../actions'
import { EXPEDITION_ITEMS, RARITY_COLORS, type ZoneKey, type ZoneConfig, type ShipStats, type CrewCard } from '@/lib/expeditions'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

type CollectionCard = {
  collectionId: number; cardId: number; variantId: number
  name: string; slug: string; filename: string
  rarity: string; power: number; dodge: number; fortune: number
}

interface Props {
  zone: ZoneKey
  zoneConfig: ZoneConfig
  shipStats: ShipStats
  shipTier: number
  doubloons: number
  collection: CollectionCard[]
  userItems: Array<{ itemId: string; quantity: number }>
  savedCrewVariantIds: number[]
}

const STAT_COLS = [
  { key: 'power'   as const, label: 'PWR', color: '#f87171' },
  { key: 'dodge'   as const, label: 'DGE', color: '#60a5fa' },
  { key: 'fortune' as const, label: 'FTN', color: '#f0c040' },
]

export default function PreparePage({ zone, zoneConfig, shipStats, doubloons, collection, userItems, savedCrewVariantIds }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [crew, setCrew] = useState<(CollectionCard | null)[]>(() => {
    const slots: (CollectionCard | null)[] = Array(shipStats.crewSlots).fill(null)
    savedCrewVariantIds.forEach((vid, i) => {
      if (i < shipStats.crewSlots) {
        const card = collection.find(c => c.variantId === vid)
        if (card) slots[i] = card
      }
    })
    return slots
  })
  const [equippedItem, setEquippedItem] = useState<string | null>(null)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assignedVariantIds = new Set(crew.filter(Boolean).map(c => c!.variantId))

  function assignCard(card: CollectionCard) {
    if (pickerSlot === null) return
    setCrew(prev => { const next = [...prev]; next[pickerSlot] = card; return next })
    setPickerSlot(null)
  }

  function removeCard(slot: number) {
    setCrew(prev => { const next = [...prev]; next[slot] = null; return next })
  }

  const totalPower   = crew.reduce((s, c, i) => s + (c ? Math.floor(c.power   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalDodge   = crew.reduce((s, c, i) => s + (c ? Math.floor(c.dodge   * (i === 0 ? 1 : 0.8)) : 0), 0)
  const totalFortune = crew.reduce((s, c, i) => s + (c ? Math.floor(c.fortune * (i === 0 ? 1 : 0.8)) : 0), 0)
  const assignedCount = crew.filter(Boolean).length

  function depart() {
    setError(null)
    startTransition(async () => {
      const crewLoadout: CrewCard[] = crew.filter(Boolean).map(c => ({
        collectionId: c!.collectionId, cardId: c!.cardId, variantId: c!.variantId,
        name: c!.name, slug: c!.slug, filename: c!.filename,
        rarity: c!.rarity, power: c!.power, dodge: c!.dodge, fortune: c!.fortune,
      }))
      const result = await startExpedition(zone, crewLoadout, equippedItem)
      if ('error' in result) { setError(result.error); return }
      router.push(`/expeditions/voyage?id=${result.expeditionId}`)
    })
  }

  const canAfford = doubloons >= zoneConfig.entryCost
  const pickerCards = pickerSlot !== null
    ? collection.filter(c => !assignedVariantIds.has(c.variantId) || crew[pickerSlot]?.variantId === c.variantId)
    : []

  return (
    <main className="min-h-screen pb-24 sm:pb-0 pt-6 sm:[zoom:1.4]">
      <div className="px-5 max-w-lg mx-auto">

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#4a6a8a', marginBottom: '0.3rem' }}>
            {zoneConfig.icon} {zoneConfig.name}
          </p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem', lineHeight: 1.1 }}>
            Prepare Crew
          </h1>
        </div>

        {/* Ship */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14,
          padding: '0.875rem 1rem',
          marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1rem' }}>⚓</span>
              <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8' }}>{shipStats.name}</p>
            </div>
            <p className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
              {shipStats.crewSlots} crew slot{shipStats.crewSlots !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {[
              { label: 'Durability', value: shipStats.durability, color: '#60a5fa' },
              { label: 'Speed',      value: shipStats.speed,      color: '#f0c040' },
              { label: 'Armor',      value: shipStats.armor,      color: '#4ade80' },
            ].map(s => (
              <div key={s.label}>
                <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.44rem', color: '#4a4845', marginBottom: 2 }}>{s.label}</p>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Crew slots */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Crew</p>
            <p className="font-karla" style={{ fontSize: '0.52rem', color: assignedCount === shipStats.crewSlots ? '#4ade80' : '#6a6764' }}>
              {assignedCount}/{shipStats.crewSlots} assigned
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {crew.map((card, slot) => {
              const isCaptain = slot === 0
              return card ? (
                <div key={slot} style={{
                  background: isCaptain ? 'rgba(240,192,64,0.05)' : 'rgba(255,255,255,0.05)',
                  border: isCaptain ? '1px solid rgba(240,192,64,0.35)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '0.75rem 0.875rem',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}>
                  <button
                    onClick={() => setPickerSlot(slot)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={IMG_BASE + card.filename} alt={card.name}
                      style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: isCaptain ? '2px solid rgba(240,192,64,0.6)' : `2px solid ${(RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764')}50` }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.82rem', color: '#f0ede8', lineHeight: 1.2 }}>{card.name}</p>
                        {isCaptain && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.4rem', color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 4, padding: '0.1rem 0.35rem', flexShrink: 0 }}>Captain</span>
                        )}
                      </div>
                      <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764', marginTop: 2 }}>{card.rarity}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.875rem', flexShrink: 0 }}>
                      {STAT_COLS.map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: s.color }}>{card[s.key]}</p>
                          <p className="font-karla" style={{ fontSize: '0.42rem', color: '#6a6764', marginTop: 1 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </button>
                  <button
                    onClick={() => removeCard(slot)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', flexShrink: 0, color: '#6a6764', lineHeight: 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  key={slot}
                  onClick={() => setPickerSlot(slot)}
                  style={{
                    background: isCaptain ? 'rgba(240,192,64,0.02)' : 'rgba(255,255,255,0.02)',
                    border: isCaptain ? '1px dashed rgba(240,192,64,0.22)' : '1px dashed rgba(255,255,255,0.09)',
                    borderRadius: 12,
                    padding: '0.875rem 1rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.875rem',
                    width: '100%',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: isCaptain ? 'rgba(240,192,64,0.04)' : 'rgba(255,255,255,0.03)',
                    border: isCaptain ? '1px dashed rgba(240,192,64,0.2)' : '1px dashed rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isCaptain ? 'rgba(240,192,64,0.35)' : 'rgba(255,255,255,0.18)'} strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </div>
                  <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: isCaptain ? '#8a7840' : '#7a7470' }}>
                    {isCaptain ? 'Assign captain' : 'Add crew member'}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Crew totals */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex', justifyContent: 'space-around',
        }}>
          {[
            { label: 'Total Power',   val: totalPower,   color: '#f87171' },
            { label: 'Total Dodge',   val: totalDodge,   color: '#60a5fa' },
            { label: 'Total Fortune', val: totalFortune, color: '#f0c040' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: s.val > 0 ? s.color : '#2a2825' }}>{s.val}</p>
              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.44rem', color: '#6a6764', marginTop: 2 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Item */}
        {userItems.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: '0.625rem' }}>Item</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {userItems.map(({ itemId }) => {
                const def = EXPEDITION_ITEMS[itemId]
                if (!def) return null
                const active = equippedItem === itemId
                return (
                  <button
                    key={itemId}
                    onClick={() => setEquippedItem(active ? null : itemId)}
                    style={{
                      padding: '0.875rem 1rem',
                      background: active ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? 'rgba(240,192,64,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                      textAlign: 'left', transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: active ? '#f0c040' : '#f0ede8' }}>{def.name}</p>
                      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 2 }}>{def.effectDescription}</p>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? '#f0c040' : 'rgba(255,255,255,0.12)'}`,
                      background: active ? '#f0c040' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}>
                      {active && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0a0a08" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>{error}</p>
        )}

        <button
          onClick={depart}
          disabled={isPending || !canAfford}
          style={{
            width: '100%', padding: '1rem',
            background: canAfford ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${canAfford ? 'rgba(240,192,64,0.35)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 14,
            cursor: isPending || !canAfford ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.75rem', color: canAfford ? '#f0c040' : '#4a4845' }}>
            {isPending ? 'Setting sail...' : `Set Sail — ${zoneConfig.entryCost} ⟡`}
          </p>
          {!canAfford && (
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845', marginTop: 3 }}>
              Need {(zoneConfig.entryCost - doubloons).toLocaleString()} more ⟡
            </p>
          )}
        </button>

      </div>

      {/* Crew picker */}
      {pickerSlot !== null && (
        <div
          onClick={() => setPickerSlot(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0d0d0c',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 520, maxHeight: '75vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '1rem 1.25rem 0.875rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: pickerSlot === 0 ? '#f0c040' : '#4a6a8a', marginBottom: 3 }}>
                  {pickerSlot === 0 ? 'Captain' : `Slot ${pickerSlot! + 1}`}
                </p>
                <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.05rem' }}>
                  {pickerSlot === 0 ? 'Assign Captain' : 'Assign Crew'}
                </p>
              </div>
              <button
                onClick={() => setPickerSlot(null)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0.875rem 1.25rem' }}>
              {pickerCards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#4a4845' }}>No cards available.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pickerCards.map(card => {
                    const rarityColor = RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764'
                    return (
                      <button
                        key={card.variantId}
                        onClick={() => assignCard(card)}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12, padding: '0.75rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.875rem',
                          textAlign: 'left', width: '100%',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={IMG_BASE + card.filename} alt={card.name}
                          style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${rarityColor}50` }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.85rem', color: '#f0ede8', lineHeight: 1.2 }}>{card.name}</p>
                          <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: rarityColor, marginTop: 3 }}>{card.rarity}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexShrink: 0 }}>
                          {STAT_COLS.map(s => (
                            <div key={s.label} style={{ textAlign: 'center' }}>
                              <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: s.color }}>{card[s.key]}</p>
                              <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845', marginTop: 1 }}>{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
