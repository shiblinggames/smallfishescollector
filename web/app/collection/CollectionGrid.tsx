'use client'

import { useState, useEffect, useRef } from 'react'
import FishCard from '@/components/FishCard'
import type { Card } from '@/lib/types'
import type { OwnedEntry } from './page'
import { rarityFromVariant } from '@/lib/variants'

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
  totalVariantsByCardId: Record<number, number>
}

interface ModalCard {
  card: Card
  entries: OwnedEntry[]
}

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']

const VARIANT_RANK: Record<string, number> = {
  'Davy Jones':     13,
  'Maelstrom':          12,
  'Kraken':         11,
  'Golden Age':     10,
  'Wanted':          9,
  'Prismatic':       8,
  'Shadow':          7,
  'Ghost':           6,
  'Holographic':     5,
  'Pearl':           4,
  'Gold':            3,
  'Silver':          2,
  'Standard':        1,
}

function bestEntry(entries: OwnedEntry[]): OwnedEntry {
  return entries.reduce((best, e) =>
    (VARIANT_RANK[e.variantName] ?? 0) > (VARIANT_RANK[best.variantName] ?? 0) ? e : best
  )
}

function Dropdown({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = options.find((o) => o.value === value) ?? options[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost flex items-center justify-between gap-4 min-w-[10rem]"
      >
        <span>{current.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full mt-2 left-0 z-50 min-w-full py-1.5"
          style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full text-left px-5 py-2.5 font-karla font-400 text-xs uppercase tracking-[0.12em] transition-colors whitespace-nowrap"
              style={{ color: opt.value === value ? '#f0c040' : '#f0ede8' }}
              onMouseEnter={(e) => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.color = '#f0c040' }}
              onMouseLeave={(e) => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.color = '#f0ede8' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CollectionGrid({ allCards, ownedByCardId, totalVariants, totalVariantsByCardId }: Props) {
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
    if (rarityFilter && !entries.some((e) => rarityFromVariant(e.variantName, e.dropWeight) === rarityFilter)) return false
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
        <Dropdown
          value={tierFilter}
          onChange={setTierFilter}
          options={[
            { label: 'All Tiers', value: '' },
            { label: 'Tier 1', value: '1' },
            { label: 'Tier 2', value: '2' },
            { label: 'Tier 3', value: '3' },
          ]}
        />
        <Dropdown
          value={rarityFilter}
          onChange={setRarityFilter}
          options={[{ label: 'All Rarities', value: '' }, ...RARITIES.map((r) => ({ label: r, value: r }))]}
        />
        <Dropdown
          value={variantFilter}
          onChange={setVariantFilter}
          options={[{ label: 'All Variants', value: '' }, ...allVariantNames.map((v) => ({ label: v, value: v }))]}
        />
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

              <p className="font-karla font-300 text-[0.62rem] text-[#8a8880] tracking-wide">
                {entries.length} <span className="text-[#555350]">/ {totalVariantsByCardId[card.id] ?? '?'}</span>
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
            className="max-w-lg w-full p-8 relative max-h-[85vh] overflow-y-auto scrollbar-hide"
            style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModal(null)}
              className="absolute top-4 right-4 font-karla font-300 text-[#8a8880] hover:text-[#f0ede8] text-xs uppercase tracking-widest transition-colors"
            >
              Close
            </button>

            <p className="sg-eyebrow text-center mb-1">Variants You Own</p>
            <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-2">
              {modal.card.name}
            </p>
            <p className="font-karla font-300 text-[#8a8880] text-center text-xs tracking-wide mb-8">
              Click a variant to display it in your collection
            </p>

            <div className="flex flex-wrap justify-center gap-6">
              {modal.entries
                .slice()
                .sort((a, b) => (VARIANT_RANK[b.variantName] ?? 0) - (VARIANT_RANK[a.variantName] ?? 0))
                .map((e) => {
                  const isFeatured = displayEntry(modal.card.id, modal.entries).variantId === e.variantId
                  return (
                    <div
                      key={e.variantId}
                      className="flex flex-col items-center gap-2 cursor-pointer"
                      onClick={() => pinVariant(modal.card.id, e.variantId)}
                    >
                      <div
                        className="rounded-full transition-all duration-200"
                        style={isFeatured ? { outline: '2px solid #f0c040', outlineOffset: '5px' } : {}}
                      >
                        <FishCard
                          name={modal.card.name}
                          filename={modal.card.filename}
                          borderStyle={e.borderStyle}
                          artEffect={e.artEffect}
                          variantName={e.variantName}
                          dropWeight={e.dropWeight}
                        />
                      </div>
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
