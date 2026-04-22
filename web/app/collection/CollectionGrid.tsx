'use client'

import { useState, useEffect } from 'react'
import FishCard from '@/components/FishCard'
import type { Card } from '@/lib/types'
import type { OwnedEntry } from './page'
import { rarityFromWeight } from '@/lib/variants'

const STORAGE_KEY = 'sf-featured-variants'

function loadPinned(): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}
function savePinned(pinned: Record<number, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned))
}

interface Props {
  allCards: Card[]
  ownedByCardId: Record<number, OwnedEntry[]>
  totalVariants: number
}

interface ModalCard {
  card: Card
  entries: OwnedEntry[]
}

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']

const VARIANT_RANK: Record<string, number> = {
  Prismatic: 7, Shadow: 6, Ghost: 5, Holographic: 4, Gold: 3, Silver: 2, Standard: 1,
}

function bestEntry(entries: OwnedEntry[]): OwnedEntry {
  return entries.reduce((best, e) =>
    (VARIANT_RANK[e.variantName] ?? 0) > (VARIANT_RANK[best.variantName] ?? 0) ? e : best
  )
}

const selectClass = 'bg-black border border-[rgba(255,255,255,0.12)] text-[#f0ede8] font-karla font-400 text-xs uppercase tracking-[0.12em] px-3 py-2 appearance-none cursor-pointer hover:border-[rgba(255,255,255,0.3)] transition-colors focus:outline-none focus:border-[#f0c040]'

export default function CollectionGrid({ allCards, ownedByCardId, totalVariants }: Props) {
  const [tierFilter, setTierFilter]     = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [variantFilter, setVariantFilter] = useState('')
  const [modal, setModal] = useState<ModalCard | null>(null)
  const [pinnedVariants, setPinnedVariants] = useState<Record<number, number>>({})

  useEffect(() => { setPinnedVariants(loadPinned()) }, [])

  function pinVariant(cardId: number, variantId: number) {
    const updated = { ...pinnedVariants, [cardId]: variantId }
    setPinnedVariants(updated)
    savePinned(updated)
  }

  function displayEntry(cardId: number, entries: OwnedEntry[]): OwnedEntry {
    const pinned = pinnedVariants[cardId]
    return entries.find((e) => e.variantId === pinned) ?? bestEntry(entries)
  }

  const allVariantNames = Array.from(new Set(
    Object.values(ownedByCardId).flatMap((entries) => entries.map((e) => e.variantName))
  )).sort()

  const filtered = allCards.filter((card) => {
    if (tierFilter && card.tier !== parseInt(tierFilter)) return false
    const entries = ownedByCardId[card.id] ?? []
    if (rarityFilter && !entries.some((e) => rarityFromWeight(e.dropWeight) === rarityFilter)) return false
    if (variantFilter && !entries.some((e) => e.variantName === variantFilter)) return false
    return true
  })
  const fishDiscovered = allCards.filter((c) => ownedByCardId[c.id]?.length > 0).length
  const uniqueVariantsOwned = Object.values(ownedByCardId).reduce((sum, entries) => sum + entries.length, 0)

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 text-center">
        <p className="font-cinzel font-700 text-[#f0c040] text-2xl mb-1">
          {uniqueVariantsOwned} <span className="text-[#8a8880] font-400 text-lg">/ {totalVariants}</span>
        </p>
        <p className="sg-eyebrow mb-1">Variants Collected</p>
        <p className="font-karla font-300 text-[#8a8880] text-xs tracking-wide mb-1">
          {fishDiscovered} of {allCards.length} fish discovered
        </p>
        <p className="font-karla font-300 text-[#8a8880] text-xs tracking-wide mb-4">
          Click any card to see the variants you own
        </p>
        <div className="w-64 h-px bg-[rgba(255,255,255,0.08)] mx-auto overflow-hidden">
          <div
            className="h-full bg-[#f0c040] transition-all duration-700"
            style={{ width: `${totalVariants > 0 ? (uniqueVariantsOwned / totalVariants) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap justify-center gap-3 mb-10">
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className={selectClass}>
          <option value="">All Tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} className={selectClass}>
          <option value="">All Rarities</option>
          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={variantFilter} onChange={(e) => setVariantFilter(e.target.value)} className={selectClass}>
          <option value="">All Variants</option>
          {allVariantNames.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {(tierFilter || rarityFilter || variantFilter) && (
          <button
            onClick={() => { setTierFilter(''); setRarityFilter(''); setVariantFilter('') }}
            className="font-karla font-300 text-[0.7rem] uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors px-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex flex-wrap justify-center gap-7">
        {filtered.map((card) => {
          const entries = ownedByCardId[card.id] ?? []
          const isOwned = entries.length > 0
          const best = isOwned ? displayEntry(card.id, entries) : null

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
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(8px)' }}
          onClick={() => setModal(null)}
        >
          <div
            className="max-w-lg w-full p-8 relative"
            style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModal(null)}
              className="absolute top-4 right-4 font-karla font-300 text-[#8a8880] hover:text-[#f0ede8] text-xs uppercase tracking-widest transition-colors"
            >
              Close
            </button>

            <p className="sg-eyebrow text-center mb-1">Variants You Own</p>
            <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-8">
              {modal.card.name}
            </p>

            <div className="flex flex-wrap justify-center gap-6">
              {modal.entries
                .slice()
                .sort((a, b) => (VARIANT_RANK[b.variantName] ?? 0) - (VARIANT_RANK[a.variantName] ?? 0))
                .map((e) => {
                  const isFeatured = displayEntry(modal.card.id, modal.entries).variantId === e.variantId
                  return (
                    <div key={e.variantId} className="flex flex-col items-center gap-2">
                      <FishCard
                        name={modal.card.name}
                        filename={modal.card.filename}
                        borderStyle={e.borderStyle}
                        artEffect={e.artEffect}
                        variantName={e.variantName}
                        dropWeight={e.dropWeight}
                      />
                      <button
                        onClick={() => pinVariant(modal.card.id, e.variantId)}
                        className="font-karla font-600 text-[0.62rem] uppercase tracking-[0.12em] transition-colors"
                        style={{ color: isFeatured ? '#f0c040' : '#8a8880' }}
                      >
                        {isFeatured ? '★ Featured' : 'Feature'}
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
