'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import FishCard from '@/components/FishCard'
import type { Card } from '@/lib/types'
import type { OwnedEntry, AllVariantEntry } from './page'
import { rarityFromVariant, RARITY_COLOR, doubloonValueFor } from '@/lib/variants'
import { sellDuplicate, sellAllDuplicates, getDuplicatesBreakdown } from './actions'
import type { DuplicateBreakdownItem } from './actions'

const STORAGE_KEY = 'sf-featured-variants'
const ABYSS_FISH = new Set(['Catfish', 'Doby Mick'])

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
  allVariantsByCardId: Record<number, AllVariantEntry[]>
  doubloons: number
}

interface ModalCard {
  card: Card
  entries: OwnedEntry[]
}

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']

const VARIANT_RANK: Record<string, number> = {
  'Davy Jones':  13,
  'Maelstrom':   12,
  'Kraken':      11,
  'Golden Age':  10,
  'Wanted':       9,
  'Prismatic':    8,
  'Shadow':       7,
  'Ghost':        6,
  'Holographic':  5,
  'Pearl':        4,
  'Gold':         3,
  'Silver':       2,
  'Standard':     1,
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

interface ZoneConfig {
  id: string
  tierFilter: number | null
}

const ZONES: ZoneConfig[] = [
  { id: 'shallows',    tierFilter: 1 },
  { id: 'open-waters', tierFilter: 2 },
  { id: 'deep',        tierFilter: 3 },
  { id: 'abyss',       tierFilter: null },
]

const D = 140

function LockedVariant({ variantName, dropWeight }: { variantName: string; dropWeight: number }) {
  const rarity = rarityFromVariant(variantName, dropWeight)
  const rarityColor = RARITY_COLOR[rarity]
  return (
    <div className="flex flex-col items-center gap-1.5 opacity-40">
      <div style={{ width: D, height: D, borderRadius: '50%', background: '#080808', border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="font-karla font-400 text-sm text-[#f0ede8]">Not Found</p>
        <p className="font-karla font-600 text-[0.72rem] uppercase tracking-[0.10em] mt-0.5" style={{ color: rarityColor }}>{rarity}</p>
        <p className="font-karla font-600 text-[0.72rem] uppercase tracking-[0.10em] text-[#8a8880]">{variantName}</p>
      </div>
    </div>
  )
}

export default function CollectionGrid({ allCards, ownedByCardId, totalVariants, totalVariantsByCardId, allVariantsByCardId, doubloons: initialDoubloons }: Props) {
  const [rarityFilter, setRarityFilter] = useState('')
  const [variantFilter, setVariantFilter] = useState('')
  const [modal, setModal] = useState<ModalCard | null>(null)
  const [pinnedVariants, setPinnedVariants] = useState<Record<number, number>>({})
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [ownedState, setOwnedState] = useState(ownedByCardId)
  const [liquidateOpen, setLiquidateOpen] = useState(false)
  const [breakdown, setBreakdown] = useState<DuplicateBreakdownItem[] | null>(null)
  const [breakdownTotal, setBreakdownTotal] = useState(0)
  const [isPending, startTransition] = useTransition()

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
    Object.values(ownedState).flatMap((entries) => entries.map((e) => e.variantName))
  )).sort()

  const fishDiscovered = allCards.filter((c) => ownedState[c.id]?.length > 0).length
  const uniqueVariantsOwned = Object.values(ownedState).reduce((sum, entries) => sum + entries.length, 0)
  const totalDupes = Object.values(ownedState).reduce((sum, entries) => sum + entries.reduce((s, e) => s + (e.count - 1), 0), 0)
  const hasActiveFilter = !!(rarityFilter || variantFilter)

  function cardMatchesFilter(card: Card): boolean {
    const entries = ownedState[card.id] ?? []
    if (rarityFilter && !entries.some((e) => rarityFromVariant(e.variantName, e.dropWeight) === rarityFilter)) return false
    if (variantFilter && !entries.some((e) => e.variantName === variantFilter)) return false
    return true
  }

  function zoneAllCards(zone: ZoneConfig): Card[] {
    if (zone.id === 'abyss') return allCards.filter((c) => ABYSS_FISH.has(c.name))
    return allCards.filter((c) => c.tier === zone.tierFilter && !ABYSS_FISH.has(c.name))
  }

  function handleSellDuplicate(entry: OwnedEntry, cardId: number) {
    const rowIdToSell = entry.rowIds[entry.rowIds.length - 1]
    startTransition(async () => {
      const result = await sellDuplicate(rowIdToSell, entry.variantName, entry.dropWeight)
      if ('error' in result) return
      setDoubloons((d) => d + result.earned)
      setOwnedState((prev) => {
        const updated = { ...prev }
        const entries = updated[cardId].map((e) =>
          e.variantId !== entry.variantId ? e : {
            ...e,
            count: e.count - 1,
            rowIds: e.rowIds.slice(0, -1),
          }
        )
        updated[cardId] = entries
        return updated
      })
      setModal((m) => {
        if (!m || m.card.id !== cardId) return m
        const newEntries = m.entries.map((e) =>
          e.variantId !== entry.variantId ? e : {
            ...e,
            count: e.count - 1,
            rowIds: e.rowIds.slice(0, -1),
          }
        )
        return { ...m, entries: newEntries }
      })
    })
  }

  function openLiquidateModal() {
    setLiquidateOpen(true)
    setBreakdown(null)
    startTransition(async () => {
      const result = await getDuplicatesBreakdown()
      if ('error' in result) return
      setBreakdown(result.items)
      setBreakdownTotal(result.total)
    })
  }

  function handleSellAll() {
    startTransition(async () => {
      const result = await sellAllDuplicates()
      if ('error' in result) return
      setDoubloons((d) => d + result.earned)
      // Remove all extra copies from local state
      setOwnedState((prev) => {
        const updated: typeof prev = {}
        for (const [cardId, entries] of Object.entries(prev)) {
          updated[Number(cardId)] = entries.map((e) => ({
            ...e,
            count: 1,
            rowIds: e.rowIds.slice(0, 1),
          }))
        }
        return updated
      })
      setLiquidateOpen(false)
      setModal(null)
    })
  }

  return (
    <div>
      {/* Stats */}
      <div className="px-6 pb-4 text-center">
        <p className="font-cinzel font-700 text-[#f0c040] text-2xl mb-1">
          {uniqueVariantsOwned} <span className="text-[#8a8880] font-400 text-lg">/ {totalVariants}</span>
        </p>
        <p className="sg-eyebrow mb-1">Variants Collected</p>
        <p className="font-karla font-300 text-[#8a8880] text-xs tracking-wide mb-2">
          {fishDiscovered} of {allCards.length} fish discovered
        </p>
        <div className="w-64 h-2 rounded-full mx-auto overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${totalVariants > 0 ? (uniqueVariantsOwned / totalVariants) * 100 : 0}%`, background: 'linear-gradient(to right, #d4a800, #f0c040)' }}
          />
        </div>
        {/* Doubloon balance */}
        <div className="flex items-center justify-center gap-3">
          <p className="font-karla font-600 text-[#f0c040] text-sm tracking-wide">
            {doubloons.toLocaleString()} ⟡
          </p>
          {totalDupes > 0 && (
            <button
              onClick={openLiquidateModal}
              disabled={isPending}
              className="font-karla font-600 text-[0.65rem] uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors border border-[rgba(255,255,255,0.1)] rounded px-2.5 py-1"
            >
              Sell All Dupes · {totalDupes}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap justify-center gap-3 px-6 pb-5">
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
        {hasActiveFilter && (
          <button
            onClick={() => { setRarityFilter(''); setVariantFilter('') }}
            className="font-karla font-300 text-[0.7rem] uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors px-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Depth zones */}
      {ZONES.map((zone) => {
        const cards = zoneAllCards(zone)
        const visibleCards = hasActiveFilter ? cards.filter(cardMatchesFilter) : cards
        if (hasActiveFilter && visibleCards.length === 0) return null

        return (
          <section key={zone.id} className="w-full" style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
            <div className="flex flex-wrap justify-center gap-7 px-6">
              {visibleCards.map((card) => {
                const entries = ownedState[card.id] ?? []
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
          </section>
        )
      })}

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

            <p className="sg-eyebrow text-center mb-1">Variants</p>
            <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-2">{modal.card.name}</p>
            <p className="font-karla font-300 text-[#8a8880] text-center text-xs tracking-wide mb-8">
              Tap an owned variant to display it in your collection
            </p>

            <div className="flex flex-wrap justify-center gap-6">
              {(allVariantsByCardId[modal.card.id] ?? [])
                .slice()
                .sort((a, b) => (VARIANT_RANK[b.variantName] ?? 0) - (VARIANT_RANK[a.variantName] ?? 0))
                .map((v) => {
                  const owned = modal.entries.find((e) => e.variantId === v.id)
                  if (!owned) return <LockedVariant key={v.id} variantName={v.variantName} dropWeight={v.dropWeight} />
                  const isFeatured = displayEntry(modal.card.id, modal.entries).variantId === owned.variantId
                  const dupeCount = owned.count - 1
                  return (
                    <div key={owned.variantId} className="flex flex-col items-center gap-2">
                      <div
                        className="cursor-pointer rounded-full transition-all duration-200"
                        style={isFeatured ? { outline: '2px solid #f0c040', outlineOffset: '5px' } : {}}
                        onClick={() => pinVariant(modal.card.id, owned.variantId)}
                      >
                        <FishCard
                          name={modal.card.name}
                          filename={modal.card.filename}
                          borderStyle={owned.borderStyle}
                          artEffect={owned.artEffect}
                          variantName={owned.variantName}
                          dropWeight={owned.dropWeight}
                        />
                      </div>
                      {dupeCount > 0 && (
                        <div className="flex flex-col items-center gap-1">
                          <p className="font-karla font-300 text-[0.62rem] text-[#8a8880]">
                            {dupeCount} duplicate{dupeCount > 1 ? 's' : ''}
                          </p>
                          <button
                            onClick={() => handleSellDuplicate(owned, modal.card.id)}
                            disabled={isPending}
                            className="font-karla font-600 text-[0.6rem] uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors disabled:opacity-50"
                          >
                            Sell 1 · +{doubloonValueFor(owned.variantName, owned.dropWeight)} ⟡
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* Liquidate modal */}
      {liquidateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(8px)' }}
          onClick={() => setLiquidateOpen(false)}
        >
          <div
            className="max-w-lg w-full p-8 relative max-h-[85vh] overflow-y-auto scrollbar-hide"
            style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLiquidateOpen(false)}
              className="absolute top-4 right-4 font-karla font-300 text-[#8a8880] hover:text-[#f0ede8] text-xs uppercase tracking-widest transition-colors"
            >
              Close
            </button>

            <p className="sg-eyebrow text-center mb-1">Sell All Duplicates</p>
            <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-8">Liquidate</p>

            {!breakdown ? (
              <p className="text-center font-karla font-300 text-[#8a8880] text-sm">Loading…</p>
            ) : breakdown.length === 0 ? (
              <p className="text-center font-karla font-300 text-[#8a8880] text-sm">No duplicates to sell.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-8">
                  {breakdown.map((item, i) => {
                    const rarity = rarityFromVariant(item.variantName, item.dropWeight)
                    return (
                      <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-[rgba(255,255,255,0.05)]">
                        <div>
                          <p className="font-karla font-600 text-xs text-[#f0ede8]">{item.cardName} · {item.variantName}</p>
                          <p className="font-karla font-300 text-[0.62rem] mt-0.5" style={{ color: RARITY_COLOR[rarity] }}>{rarity}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-karla font-300 text-[0.62rem] text-[#8a8880]">{item.extraCopies}× dupe</p>
                          <p className="font-karla font-600 text-xs text-[#f0c040]">+{item.doubloons} ⟡</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between mb-6 pt-2">
                  <p className="font-karla font-600 text-sm text-[#f0ede8] uppercase tracking-[0.10em]">Total</p>
                  <p className="font-cinzel font-700 text-[#f0c040] text-xl">{breakdownTotal.toLocaleString()} ⟡</p>
                </div>

                <button
                  onClick={handleSellAll}
                  disabled={isPending}
                  className="btn-gold w-full disabled:opacity-50"
                >
                  {isPending ? 'Selling…' : `Confirm · Sell ${breakdown.reduce((s, i) => s + i.extraCopies, 0)} Cards`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
