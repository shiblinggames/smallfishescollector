'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startExpedition } from '../actions'
import { EXPEDITION_SHIP_STATS, EXPEDITION_ITEMS, RARITY_COLORS, type ZoneKey, type ZoneConfig, type ShipStats, type CrewCard } from '@/lib/expeditions'

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
}

export default function PreparePage({ zone, zoneConfig, shipStats, shipTier, doubloons, collection, userItems }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [crew, setCrew] = useState<(CollectionCard | null)[]>(Array(shipStats.crewSlots).fill(null))
  const [equippedItem, setEquippedItem] = useState<string | null>(null)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assignedVariantIds = new Set(crew.filter(Boolean).map(c => c!.variantId))

  function assignCard(card: CollectionCard) {
    if (pickerSlot === null) return
    setCrew(prev => {
      const next = [...prev]
      next[pickerSlot] = card
      return next
    })
    setPickerSlot(null)
  }

  function removeCard(slot: number) {
    setCrew(prev => {
      const next = [...prev]
      next[slot] = null
      return next
    })
  }

  const totalPower   = crew.reduce((s, c) => s + (c?.power   ?? 0), 0)
  const totalDodge   = crew.reduce((s, c) => s + (c?.dodge   ?? 0), 0)
  const totalFortune = crew.reduce((s, c) => s + (c?.fortune ?? 0), 0)

  function depart() {
    setError(null)
    startTransition(async () => {
      const crewLoadout: CrewCard[] = crew.filter(Boolean).map(c => ({
        collectionId: c!.collectionId,
        cardId: c!.cardId,
        variantId: c!.variantId,
        name: c!.name,
        slug: c!.slug,
        filename: c!.filename,
        rarity: c!.rarity,
        power: c!.power,
        dodge: c!.dodge,
        fortune: c!.fortune,
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
    <main className="min-h-screen pb-24 sm:pb-0 pt-6">
      <div className="px-5 max-w-lg mx-auto">

        {/* Header */}
        <div className="mb-5">
          <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: '#4a6a8a', marginBottom: '0.25rem' }}>
            {zoneConfig.name}
          </p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>
            Prepare Crew
          </h1>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#6a6764' }}>
            {shipStats.name} · {shipStats.crewSlots} crew slots · {zoneConfig.entryCost} ⟡ entry
          </p>
        </div>

        {/* Ship stats */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          gap: '1.5rem',
        }}>
          {[
            { label: 'Durability', value: shipStats.durability, color: '#60a5fa' },
            { label: 'Speed',      value: shipStats.speed,      color: '#f0c040' },
            { label: 'Armor',      value: shipStats.armor,      color: '#4ade80' },
          ].map(s => (
            <div key={s.label}>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#6a6764', marginBottom: 2 }}>{s.label}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Crew slots */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: '1rem',
        }}>
          <div style={{ padding: '0.625rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
              Crew — {crew.filter(Boolean).length}/{shipStats.crewSlots} assigned
            </p>
          </div>

          <div className="flex flex-col">
            {crew.map((card, slot) => (
              <div
                key={slot}
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: slot < crew.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}
              >
                <p className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4845', width: 16, flexShrink: 0 }}>{slot + 1}</p>
                {card ? (
                  <div
                    className="flex items-center gap-2 flex-1"
                    onClick={() => removeCard(slot)}
                    style={{ cursor: 'pointer' }}
                  >
                    <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-karla font-600 truncate" style={{ fontSize: '0.75rem', color: '#f0ede8' }}>{card.name}</p>
                      <p className="font-karla" style={{ fontSize: '0.58rem', color: RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764' }}>{card.rarity}</p>
                    </div>
                    <div className="flex gap-3 flex-shrink-0">
                      {[{ label: 'PWR', val: card.power, color: '#f87171' }, { label: 'DGE', val: card.dodge, color: '#60a5fa' }, { label: 'FTN', val: card.fortune, color: '#f0c040' }].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: s.color }}>{s.val}</p>
                          <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845' }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '0.55rem', color: '#4a4845', flexShrink: 0 }}>✕</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setPickerSlot(slot)}
                    style={{
                      flex: 1, height: 44,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px dashed rgba(255,255,255,0.1)',
                      borderRadius: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.62rem', color: '#4a4845' }}>+ Assign crew</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ padding: '0.625rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '1.5rem' }}>
            {[{ label: 'Total Power', val: totalPower, color: '#f87171' }, { label: 'Total Dodge', val: totalDodge, color: '#60a5fa' }, { label: 'Total Fortune', val: totalFortune, color: '#f0c040' }].map(s => (
              <div key={s.label}>
                <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#6a6764', marginBottom: 1 }}>{s.label}</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: s.color }}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Item equip */}
        {userItems.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: '1rem',
          }}>
            <div style={{ padding: '0.625rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Equipped Item</p>
            </div>
            <div className="flex flex-col">
              {userItems.map(({ itemId }) => {
                const def = EXPEDITION_ITEMS[itemId]
                if (!def) return null
                const isEquipped = equippedItem === itemId
                return (
                  <button
                    key={itemId}
                    onClick={() => setEquippedItem(isEquipped ? null : itemId)}
                    style={{
                      padding: '0.75rem 1rem',
                      background: isEquipped ? 'rgba(240,192,64,0.08)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: isEquipped ? '#f0c040' : '#f0ede8' }}>{def.name}</p>
                      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>{def.effectDescription}</p>
                    </div>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `2px solid ${isEquipped ? '#f0c040' : 'rgba(255,255,255,0.15)'}`,
                      background: isEquipped ? '#f0c040' : 'transparent',
                      flexShrink: 0,
                    }} />
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
            width: '100%',
            padding: '0.875rem',
            background: isPending ? 'rgba(240,192,64,0.1)' : 'rgba(240,192,64,0.15)',
            border: '1px solid rgba(240,192,64,0.3)',
            borderRadius: 12,
            cursor: isPending || !canAfford ? 'not-allowed' : 'pointer',
            opacity: !canAfford ? 0.5 : 1,
          }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem', color: '#f0c040' }}>
            {isPending ? 'Setting sail...' : `Set Sail — ${zoneConfig.entryCost} ⟡`}
          </p>
          {!canAfford && (
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: 2 }}>
              Need {zoneConfig.entryCost - doubloons} more ⟡
            </p>
          )}
        </button>
      </div>

      {/* Crew picker */}
      {pickerSlot !== null && (
        <div
          onClick={() => setPickerSlot(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0f0f0e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>Assign Crew — Slot {pickerSlot + 1}</p>
              <button onClick={() => setPickerSlot(null)} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {pickerCards.length === 0 ? (
                <p className="font-karla text-center py-8" style={{ fontSize: '0.75rem', color: '#6a6764' }}>No cards available.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {pickerCards.map(card => (
                    <button
                      key={card.variantId}
                      onClick={() => assignCard(card)}
                      className="flex items-center gap-3 text-left w-full"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.6rem 0.75rem', cursor: 'pointer' }}
                    >
                      <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>{card.name}</p>
                        <p className="font-karla" style={{ fontSize: '0.6rem', color: RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764' }}>{card.rarity}</p>
                      </div>
                      <div className="flex gap-3 flex-shrink-0">
                        {[{ label: 'PWR', val: card.power, color: '#f87171' }, { label: 'DGE', val: card.dodge, color: '#60a5fa' }, { label: 'FTN', val: card.fortune, color: '#f0c040' }].map(s => (
                          <div key={s.label} style={{ textAlign: 'center' }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: s.color }}>{s.val}</p>
                            <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845' }}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
