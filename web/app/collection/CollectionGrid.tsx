'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import FishCard from '@/components/FishCard'
import type { Card } from '@/lib/types'
import type { OwnedEntry, AllVariantEntry } from './page'
import { rarityFromVariant, RARITY_COLOR, doubloonValueFor } from '@/lib/variants'
import { sellDuplicate, sellAllDuplicates, getDuplicatesBreakdown } from './actions'
import type { DuplicateBreakdownItem } from './actions'

const RANKS = [
  { name: 'Crewmate',      min: 0,   color: '#8a8880', next: 25  },
  { name: 'Officer',       min: 25,  color: '#4ade80', next: 75  },
  { name: 'Second Mate',   min: 75,  color: '#60a5fa', next: 150 },
  { name: 'Quartermaster', min: 150, color: '#a78bfa', next: 250 },
  { name: 'Captain',       min: 250, color: '#f0c040', next: null },
]
function getRank(owned: number) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (owned >= RANKS[i].min) return RANKS[i]
  }
  return RANKS[0]
}
function RankIcon({ name, color }: { name: string; color: string }) {
  if (name === 'Captain') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8"/><path d="M5 9v10h14V9"/><path d="M9 21v-6h6v6"/>
    </svg>
  )
  if (name === 'Quartermaster') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>
      <line x1="12" y1="3" x2="12" y2="10"/><line x1="12" y1="14" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="21" y2="12"/>
    </svg>
  )
  if (name === 'Second Mate') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>
    </svg>
  )
  if (name === 'Officer') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12"/>
      <path d="M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  )
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2"/><path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10"/>
      <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3"/>
    </svg>
  )
}

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
  const [statsOpen, setStatsOpen] = useState(false)

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

  const rank = getRank(uniqueVariantsOwned)
  const progressPct = rank.next
    ? Math.min(((uniqueVariantsOwned - rank.min) / (rank.next - rank.min)) * 100, 100)
    : 100
  const nextRankName = rank.next ? RANKS[RANKS.findIndex(r => r.name === rank.name) + 1].name : null

  return (
    <div>
      {/* Collapsible rank header */}
      <div className="px-6 pb-4 max-w-sm mx-auto">
        <button
          onClick={() => setStatsOpen(v => !v)}
          className="w-full text-left"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: statsOpen ? '12px 12px 0 0' : 12,
            padding: '0.75rem 1rem',
            transition: 'border-radius 0.2s ease',
          }}
        >
          <div className="flex items-center gap-3">
            <RankIcon name={rank.name} color={rank.color} />
            <div className="flex-1">
              <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#9a9488]" style={{ fontSize: '0.52rem' }}>Rank</p>
              <p className="font-cinzel font-700" style={{ color: rank.color, fontSize: '0.95rem', lineHeight: 1.1 }}>{rank.name}</p>
            </div>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.7rem' }}>
              {uniqueVariantsOwned}<span style={{ color: '#4a4845' }}> / {totalVariants}</span>
            </p>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: statsOpen ? 'rotate(180deg)' : '' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </button>

        {statsOpen && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '0.875rem 1rem' }}>
            {/* Rank progress */}
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: '0.4rem' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: rank.color, borderRadius: 2, opacity: 0.8 }} />
            </div>
            {nextRankName ? (
              <p className="font-karla text-[#4a4845]" style={{ fontSize: '0.6rem', marginBottom: '0.75rem' }}>
                {rank.next! - uniqueVariantsOwned} more to reach {nextRankName}
              </p>
            ) : (
              <p className="font-karla text-[#4a4845]" style={{ fontSize: '0.6rem', marginBottom: '0.75rem' }}>Maximum rank achieved</p>
            )}

            {/* Extra stats */}
            <div className="flex items-center justify-between">
              <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.7rem' }}>
                {fishDiscovered} of {allCards.length} fish discovered
              </p>
              <div className="flex items-center gap-2">
                <p className="font-karla font-600 text-[#f0c040]" style={{ fontSize: '0.75rem' }}>
                  {doubloons.toLocaleString()} ⟡
                </p>
                {totalDupes > 0 && (
                  <button
                    onClick={openLiquidateModal}
                    disabled={isPending}
                    className="font-karla font-600 uppercase tracking-[0.12em] text-[#8a8880] hover:text-[#f0ede8] transition-colors border border-[rgba(255,255,255,0.1)] rounded px-2 py-0.5"
                    style={{ fontSize: '0.6rem' }}
                  >
                    Sell Dupes · {totalDupes}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
