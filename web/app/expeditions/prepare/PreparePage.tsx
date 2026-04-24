'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startExpedition } from '../actions'
import {
  STATS, STAT_LABELS, STAT_ICONS, STAT_DESCRIPTIONS,
  type Stat, type ZoneKey, type ZoneConfig, type ExpeditionShipStats, type CrewCard, type CrewLoadout,
} from '@/lib/expeditions'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

type CollectionCard = {
  collectionId: number; cardId: number; variantId: number
  name: string; slug: string; filename: string
  fishTier: 1 | 2 | 3; rarity: string; power: number
}

interface Props {
  zone: ZoneKey
  zoneConfig: ZoneConfig
  shipStats: ExpeditionShipStats
  shipTier: number
  doubloons: number
  collection: CollectionCard[]
  rarityColors: Record<string, string>
}

function emptyLoadout(): CrewLoadout {
  return { combat: [], navigation: [], durability: [], speed: [], luck: [] }
}

export default function PreparePage({ zone, zoneConfig, shipStats, shipTier, doubloons, collection, rarityColors }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [crew, setCrew] = useState<CrewLoadout>(emptyLoadout())
  const [pickerStat, setPickerStat] = useState<Stat | null>(null)
  const [pickerSlot, setPickerSlot] = useState<0 | 1>(0)
  const [infoStat, setInfoStat] = useState<Stat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalSlots = shipStats.crewSlots
  const assignedCount = STATS.reduce((s, stat) => s + crew[stat].length, 0)
  const slotsRemaining = totalSlots - assignedCount

  // Cards already assigned anywhere
  const assignedIds = new Set(STATS.flatMap(s => crew[s].map(c => c.variantId)))

  function openPicker(stat: Stat, slot: 0 | 1) {
    setPickerStat(stat)
    setPickerSlot(slot)
  }

  function assignCard(card: CollectionCard) {
    if (!pickerStat) return
    if (slotsRemaining <= 0 && !crew[pickerStat][pickerSlot]) return

    setCrew(prev => {
      const updated = { ...prev }
      const statCrew = [...updated[pickerStat!]]
      const crewCard: CrewCard = {
        collectionId: card.collectionId,
        cardId: card.cardId,
        variantId: card.variantId,
        name: card.name,
        slug: card.slug,
        filename: card.filename,
        fishTier: card.fishTier,
        rarity: card.rarity,
        power: card.power,
      }
      statCrew[pickerSlot!] = crewCard
      updated[pickerStat!] = statCrew
      return updated
    })
    setPickerStat(null)
  }

  function removeCrew(stat: Stat, slot: number) {
    setCrew(prev => {
      const updated = { ...prev }
      const statCrew = [...updated[stat]]
      statCrew.splice(slot, 1)
      updated[stat] = statCrew
      return updated
    })
  }

  function effectiveStat(stat: Stat): number {
    const base = shipStats[stat]
    const bonus = crew[stat].reduce((s, c) => s + c.power, 0)
    return base + bonus
  }

  function depart() {
    setError(null)
    startTransition(async () => {
      const result = await startExpedition(zone, crew)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.push(`/expeditions/voyage?id=${result.expeditionId}`)
    })
  }

  // Cards available to pick for this stat/slot (not already assigned elsewhere, or in this same slot)
  const currentSlotVariantId = pickerStat ? crew[pickerStat][pickerSlot]?.variantId : undefined
  const pickerCards = collection.filter(c =>
    !assignedIds.has(c.variantId) || c.variantId === currentSlotVariantId
  )

  return (
    <main className="min-h-screen pb-24 sm:pb-0 pt-6">
      <div className="px-6 max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-1" style={{ fontSize: '0.62rem' }}>
            {zoneConfig.name}
          </p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.3rem' }}>
            Assign Crew
          </h1>
          <p className="font-karla text-[#6a6764] mt-1" style={{ fontSize: '0.72rem' }}>
            {totalSlots} crew slots · {slotsRemaining} remaining · Entry: {zoneConfig.entryCost} ⟡
          </p>
        </div>

        {/* Stat rows */}
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: '1rem',
          }}
        >
          {STATS.map((stat, i) => {
            const effective = effectiveStat(stat)
            const base = shipStats[stat]
            const bonus = effective - base
            const assigned = crew[stat]

            return (
              <div
                key={stat}
                style={{
                  padding: '0.875rem 1rem',
                  borderBottom: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Stat label */}
                  <div style={{ width: 80, flexShrink: 0 }}>
                    <div className="flex items-center gap-1 mb-0.5">
                      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
                        {STAT_ICONS[stat]} {STAT_LABELS[stat]}
                      </p>
                      <button
                        onClick={() => setInfoStat(stat)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#4a4845', lineHeight: 1, flexShrink: 0 }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                      </button>
                    </div>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0c040' }}>
                      {effective}
                      {bonus > 0 && (
                        <span style={{ fontSize: '0.62rem', color: '#4ade80', marginLeft: 3 }}>+{bonus}</span>
                      )}
                    </p>
                  </div>

                  {/* Crew slots */}
                  <div className="flex gap-2 flex-1">
                    {[0, 1].map(slot => {
                      const card = assigned[slot]
                      const locked = slot > 0 && !assigned[0] // can't fill slot 1 before slot 0
                      const canAdd = slotsRemaining > 0 || !!card

                      if (card) {
                        return (
                          <div
                            key={slot}
                            className="flex items-center gap-1.5 flex-1"
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 8,
                              padding: '0.3rem 0.5rem',
                              cursor: 'pointer',
                              minWidth: 0,
                            }}
                            onClick={() => removeCrew(stat, slot)}
                          >
                            <img
                              src={IMG_BASE + card.filename}
                              alt={card.name}
                              style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <p className="font-karla truncate" style={{ fontSize: '0.62rem', color: '#f0ede8' }}>{card.name}</p>
                              <p className="font-karla" style={{ fontSize: '0.55rem', color: rarityColors[card.rarity.toLowerCase()] ?? '#6a6764' }}>
                                +{card.power}
                              </p>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <button
                          key={slot}
                          onClick={() => !locked && canAdd && openPicker(stat, slot as 0 | 1)}
                          disabled={locked || (!canAdd && !card)}
                          style={{
                            flex: 1,
                            height: 40,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px dashed rgba(255,255,255,0.12)',
                            borderRadius: 8,
                            cursor: locked || !canAdd ? 'default' : 'pointer',
                            opacity: locked ? 0.3 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontSize: '0.55rem', color: '#4a4845' }}>+ Crew</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Error */}
        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '0.75rem' }}>
            {error}
          </p>
        )}

        {/* Depart button */}
        <button
          onClick={depart}
          disabled={isPending || doubloons < zoneConfig.entryCost}
          style={{
            width: '100%',
            padding: '0.875rem',
            background: isPending ? 'rgba(240,192,64,0.1)' : 'rgba(240,192,64,0.15)',
            border: '1px solid rgba(240,192,64,0.3)',
            borderRadius: 12,
            cursor: isPending || doubloons < zoneConfig.entryCost ? 'not-allowed' : 'pointer',
            opacity: doubloons < zoneConfig.entryCost ? 0.5 : 1,
          }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem', color: '#f0c040' }}>
            {isPending ? 'Setting sail...' : `Depart — ${zoneConfig.entryCost} ⟡`}
          </p>
          {doubloons < zoneConfig.entryCost && (
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: 2 }}>
              Need {zoneConfig.entryCost - doubloons} more ⟡
            </p>
          )}
        </button>

        <p className="font-karla text-center mt-3" style={{ fontSize: '0.65rem', color: '#4a4845' }}>
          Crew are never lost or captured — they always return safely.
        </p>
      </div>

      {/* Stat info modal */}
      {infoStat && (
        <div
          onClick={() => setInfoStat(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1.5rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#1c1917', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 18, padding: '1.5rem', width: '100%', maxWidth: '22rem' }}
          >
            <p className="font-cinzel font-700 text-[#f0ede8] mb-3" style={{ fontSize: '1rem' }}>
              {STAT_ICONS[infoStat]} {STAT_LABELS[infoStat]}
            </p>
            <p className="font-karla text-[#a0a09a] mb-5" style={{ fontSize: '0.82rem', lineHeight: 1.65 }}>
              {STAT_DESCRIPTIONS[infoStat]}
            </p>
            <button
              onClick={() => setInfoStat(null)}
              style={{ width: '100%', padding: '0.625rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, cursor: 'pointer', color: '#a0a09a', fontSize: '0.72rem' }}
              className="font-karla font-600"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Crew picker modal */}
      {pickerStat && (
        <div
          onClick={() => setPickerStat(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0f0f0e',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '18px 18px 0 0',
              width: '100%',
              maxWidth: 480,
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>
                Assign {STAT_ICONS[pickerStat]} {STAT_LABELS[pickerStat]} Crew
              </p>
              <button onClick={() => setPickerStat(null)} style={{ color: '#6a6764', lineHeight: 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3">
              {pickerCards.length === 0 ? (
                <p className="font-karla text-center py-8" style={{ fontSize: '0.75rem', color: '#6a6764' }}>
                  No cards available. Open some packs!
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {pickerCards.map(card => (
                    <button
                      key={card.variantId}
                      onClick={() => assignCard(card)}
                      className="flex items-center gap-3 text-left w-full"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        padding: '0.6rem 0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      <img
                        src={IMG_BASE + card.filename}
                        alt={card.name}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>{card.name}</p>
                        <p className="font-karla" style={{ fontSize: '0.62rem', color: rarityColors[card.rarity.toLowerCase()] ?? '#6a6764' }}>
                          {card.rarity} · Tier {card.fishTier}
                        </p>
                      </div>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0c040', flexShrink: 0 }}>
                        +{card.power}
                      </p>
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
