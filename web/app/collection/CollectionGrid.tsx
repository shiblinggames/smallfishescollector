'use client'

import { useState } from 'react'
import FishCard from '@/components/FishCard'
import type { Card } from '@/lib/types'
import type { OwnedEntry } from './page'
import { rarityFromWeight } from '@/lib/variants'

interface Props {
  allCards: Card[]
  ownedByCardId: Record<number, OwnedEntry[]>
}

interface ModalCard {
  card: Card
  entries: OwnedEntry[]
}

const TABS = [
  { label: 'All',    tier: 0 },
  { label: 'Tier 1', tier: 1 },
  { label: 'Tier 2', tier: 2 },
  { label: 'Tier 3', tier: 3 },
]

const VARIANT_RANK: Record<string, number> = {
  Prismatic: 7, Shadow: 6, Ghost: 5, Holographic: 4, Gold: 3, Silver: 2, Standard: 1,
}

function bestEntry(entries: OwnedEntry[]): OwnedEntry {
  return entries.reduce((best, e) =>
    (VARIANT_RANK[e.variantName] ?? 0) > (VARIANT_RANK[best.variantName] ?? 0) ? e : best
  )
}


export default function CollectionGrid({ allCards, ownedByCardId }: Props) {
  const [activeTier, setActiveTier] = useState(0)
  const [modal, setModal] = useState<ModalCard | null>(null)

  const filtered = activeTier === 0 ? allCards : allCards.filter((c) => c.tier === activeTier)
  const ownedCount = allCards.filter((c) => ownedByCardId[c.id]?.length > 0).length
  const totalVariantsOwned = Object.values(ownedByCardId).reduce(
    (sum, entries) => sum + entries.reduce((s, e) => s + e.count, 0), 0
  )

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 text-center">
        <p className="font-cinzel font-700 text-[#f0c040] text-2xl mb-1">
          {ownedCount} <span className="text-[#8a8880] font-400 text-lg">/ {allCards.length}</span>
        </p>
        <p className="sg-eyebrow mb-1">Cards Collected</p>
        <p className="font-karla font-300 text-[#8a8880] text-xs tracking-wide mb-4">
          {totalVariantsOwned} total variants
        </p>
        <div className="w-64 h-px bg-[rgba(255,255,255,0.08)] mx-auto overflow-hidden">
          <div
            className="h-full bg-[#f0c040] transition-all duration-700"
            style={{ width: `${(ownedCount / allCards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex justify-center gap-3 mb-10">
        {TABS.map((tab) => (
          <button
            key={tab.tier}
            onClick={() => setActiveTier(tab.tier)}
            className={`font-karla font-600 text-xs uppercase tracking-[0.20em] px-4 py-2 border transition-colors duration-200 ${
              activeTier === tab.tier
                ? 'border-[#f0c040] text-[#f0c040]'
                : 'border-[rgba(255,255,255,0.08)] text-[#8a8880] hover:border-[rgba(255,255,255,0.20)] hover:text-[#f0ede8]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex flex-wrap justify-center gap-7">
        {filtered.map((card) => {
          const entries = ownedByCardId[card.id] ?? []
          const isOwned = entries.length > 0
          const best = isOwned ? bestEntry(entries) : null
          const totalOwned = entries.reduce((s, e) => s + e.count, 0)

          return (
            <div key={card.id} className="flex flex-col items-center gap-2">
              <div
                className={`relative ${isOwned ? 'cursor-pointer' : ''}`}
                onClick={() => isOwned && setModal({ card, entries })}
              >
                <FishCard
                  name={card.name}
                  filename={card.filename}
                  borderStyle={best?.borderStyle ?? 'standard'}
                  artEffect={best?.artEffect ?? 'normal'}
                  unowned={!isOwned}
                />
                {totalOwned > 1 && (
                  <span className="absolute -top-1 -right-1 bg-[#f0c040] text-black font-karla font-600 text-[0.6rem] w-5 h-5 flex items-center justify-center">
                    {totalOwned}
                  </span>
                )}
              </div>

              <p className="font-karla font-300 text-[0.68rem] text-[#8a8880] tracking-[0.20em] uppercase">
                T{card.tier}
              </p>
            </div>
          )
        })}
      </div>

      {/* Variant detail modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={() => setModal(null)}
        >
          <div
            className="sg-card max-w-lg w-full p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModal(null)}
              className="absolute top-4 right-4 font-karla font-300 text-[#8a8880] hover:text-[#f0ede8] text-xs uppercase tracking-widest transition-colors"
            >
              Close
            </button>

            <p className="sg-eyebrow text-center mb-1">Variants</p>
            <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-8">
              {modal.card.name}
            </p>

            <div className="flex flex-wrap justify-center gap-6">
              {modal.entries
                .slice()
                .sort((a, b) => (VARIANT_RANK[b.variantName] ?? 0) - (VARIANT_RANK[a.variantName] ?? 0))
                .map((e) => (
                  <div key={e.variantId} className="relative">
                    <FishCard
                      name={modal.card.name}
                      filename={modal.card.filename}
                      borderStyle={e.borderStyle}
                      artEffect={e.artEffect}
                      variantName={e.variantName}
                      dropWeight={e.dropWeight}
                    />
                    {e.count > 1 && (
                      <span className="absolute -top-1 -right-1 bg-[#f0c040] text-black font-karla font-600 text-[0.6rem] w-5 h-5 flex items-center justify-center">
                        ×{e.count}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
