'use client'

import { useState, useEffect, useTransition } from 'react'
import FishCard from '@/components/FishCard'
import type { Card } from '@/lib/types'
import type { OwnedEntry, AllVariantEntry } from './page'
import { rarityFromVariant, RARITY_COLOR, doubloonValueFor } from '@/lib/variants'
import { sellDuplicate, sellAllDuplicates, getDuplicatesBreakdown } from './actions'
import type { DuplicateBreakdownItem } from './actions'
import { updateUsername, updateShowcase } from '@/app/u/actions'
import Link from 'next/link'

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
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8"/><path d="M5 9v10h14V9"/><path d="M9 21v-6h6v6"/>
    </svg>
  )
  if (name === 'Quartermaster') return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>
      <line x1="12" y1="3" x2="12" y2="10"/><line x1="12" y1="14" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="21" y2="12"/>
    </svg>
  )
  if (name === 'Second Mate') return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>
    </svg>
  )
  if (name === 'Officer') return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12"/>
      <path d="M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  )
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
  username: string
  usernameChanged: boolean
  showcaseVariantIds: number[]
  isPremium: boolean
}

interface ModalCard {
  card: Card
  entries: OwnedEntry[]
}

interface PickerCard {
  variantId: number
  variantName: string
  borderStyle: string
  artEffect: string
  dropWeight: number
  name: string
  filename: string
}

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

export default function CollectionGrid({ allCards, ownedByCardId, totalVariants, totalVariantsByCardId, allVariantsByCardId, doubloons: initialDoubloons, username: initialUsername, usernameChanged: initialUsernameChanged, showcaseVariantIds: initialShowcaseIds, isPremium }: Props) {
  const [modal, setModal] = useState<ModalCard | null>(null)
  const [pinnedVariants, setPinnedVariants] = useState<Record<number, number>>({})
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [ownedState, setOwnedState] = useState(ownedByCardId)
  const [liquidateOpen, setLiquidateOpen] = useState(false)
  const [breakdown, setBreakdown] = useState<DuplicateBreakdownItem[] | null>(null)
  const [breakdownTotal, setBreakdownTotal] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [statsOpen, setStatsOpen] = useState(false)

  // Profile edit state
  const [profileOpen, setProfileOpen] = useState(false)
  const [username, setUsername] = useState(initialUsername)
  const [usernameChanged, setUsernameChanged] = useState(initialUsernameChanged)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [selectedShowcase, setSelectedShowcase] = useState<number[]>(initialShowcaseIds)
  const [profilePending, startProfileTransition] = useTransition()

  useEffect(() => { setPinnedVariants(loadPinned()) }, [])

  // Build sorted picker cards from owned collection
  const pickerCards: PickerCard[] = allCards.flatMap(card => {
    const entries = ownedState[card.id] ?? []
    return entries.map(e => ({
      variantId: e.variantId,
      variantName: e.variantName,
      borderStyle: e.borderStyle,
      artEffect: e.artEffect,
      dropWeight: e.dropWeight,
      name: card.name,
      filename: card.filename,
    }))
  }).sort((a, b) => a.dropWeight - b.dropWeight)

  function toggleShowcaseCard(variantId: number) {
    setSelectedShowcase(prev => {
      if (prev.includes(variantId)) return prev.filter(id => id !== variantId)
      if (prev.length >= 5) return prev
      return [...prev, variantId]
    })
  }

  function handleSaveShowcase() {
    startProfileTransition(async () => {
      await updateShowcase(selectedShowcase)
      setProfileOpen(false)
    })
  }

  function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError('')
    startProfileTransition(async () => {
      const result = await updateUsername(usernameInput)
      if (result.error) {
        setUsernameError(result.error)
      } else {
        setUsername(usernameInput.trim().toLowerCase())
        setUsernameChanged(true)
        setShowUsernameForm(false)
        setUsernameInput('')
      }
    })
  }

  function pinVariant(cardId: number, variantId: number) {
    const updated = { ...pinnedVariants, [cardId]: variantId }
    setPinnedVariants(updated)
    savePinned(updated)
  }

  function displayEntry(cardId: number, entries: OwnedEntry[]): OwnedEntry {
    const pinned = pinnedVariants[cardId]
    return entries.find((e) => e.variantId === pinned) ?? bestEntry(entries)
  }

  const fishDiscovered = allCards.filter((c) => ownedState[c.id]?.length > 0).length
  const uniqueVariantsOwned = Object.values(ownedState).reduce((sum, entries) => sum + entries.length, 0)
  const totalDupes = Object.values(ownedState).reduce((sum, entries) => sum + entries.reduce((s, e) => s + (e.count - 1), 0), 0)

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
      {/* Rank / profile header */}
      <div className="px-6 pb-4 max-w-sm mx-auto">
        <button
          onClick={() => setStatsOpen(v => !v)}
          className="w-full text-left"
          style={{
            background: rank.name === 'Crewmate' ? 'rgba(255,255,255,0.03)' : `rgba(${rank.name === 'Officer' ? '74,222,128' : rank.name === 'Second Mate' ? '96,165,250' : rank.name === 'Quartermaster' ? '167,139,250' : '240,192,64'},0.05)`,
            border: `1px solid ${rank.name === 'Crewmate' ? 'rgba(255,255,255,0.07)' : rank.color + '40'}`,
            boxShadow: rank.name === 'Crewmate' ? 'none' : `0 0 20px ${rank.color}10`,
            borderRadius: statsOpen ? '12px 12px 0 0' : 12,
            padding: '1rem 1.125rem',
            transition: 'border-radius 0.2s ease',
          }}
        >
          <div className="flex items-center gap-3.5">
            <RankIcon name={rank.name} color={rank.color} />
            <div className="flex-1 min-w-0">
              <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#9a9488]" style={{ fontSize: '0.62rem' }}>{rank.name}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/u/${username}`}
                  className="font-cinzel font-700 hover:opacity-80 transition-opacity"
                  style={{ color: rank.color, fontSize: '1.2rem', lineHeight: 1.1 }}
                  onClick={e => e.stopPropagation()}
                >
                  {username}
                </Link>
                {isPremium && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#f0c040' }}>Member</span>
                  </div>
                )}
              </div>
            </div>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.78rem' }}>
              {uniqueVariantsOwned}<span style={{ color: '#6a6764' }}> / {totalVariants} variants</span>
            </p>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: statsOpen ? 'rotate(180deg)' : '' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </button>

        {statsOpen && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${rank.name === 'Crewmate' ? 'rgba(255,255,255,0.07)' : rank.color + '40'}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '0.875rem 1rem' }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: '0.4rem' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: rank.color, borderRadius: 2, opacity: 0.8 }} />
            </div>
            {nextRankName ? (
              <p className="font-karla text-[#8a8880]" style={{ fontSize: '0.7rem', marginBottom: '0.75rem' }}>
                {rank.next! - uniqueVariantsOwned} more to reach {nextRankName}
              </p>
            ) : (
              <p className="font-karla text-[#8a8880]" style={{ fontSize: '0.7rem', marginBottom: '0.75rem' }}>Maximum rank achieved</p>
            )}
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

      {/* Always-visible action row */}
      <div className="px-6 max-w-sm mx-auto flex gap-2 mb-4">
        <button
          onClick={() => { setProfileOpen(true); setShowUsernameForm(false); setUsernameError('') }}
          className="flex-1 flex items-center justify-center gap-2 transition-colors"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
          }}
          onPointerDown={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onPointerUp={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onPointerLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8880" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <span className="font-karla font-600 uppercase tracking-[0.12em] text-[#8a8880]" style={{ fontSize: '0.62rem' }}>Edit Profile</span>
        </button>
        <a
          href="/achievements"
          className="flex-1 flex items-center justify-center gap-2 transition-colors"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            textDecoration: 'none',
          }}
          onPointerDown={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onPointerUp={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onPointerLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8880" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4V4h16v5h-2"/><path d="M6 4v5a6 6 0 0 0 12 0V4"/>
            <line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
          </svg>
          <span className="font-karla font-600 uppercase tracking-[0.12em] text-[#8a8880]" style={{ fontSize: '0.62rem' }}>Achievements</span>
        </a>
      </div>

      {/* Depth zones */}
      {ZONES.map((zone) => {
        const cards = zoneAllCards(zone)
        return (
          <section key={zone.id} className="w-full" style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
            <div className="flex flex-wrap justify-center gap-7 px-6">
              {cards.map((card) => {
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
                  className="btn-ghost w-full disabled:opacity-50"
                >
                  {isPending ? 'Selling…' : `Confirm · Sell ${breakdown.reduce((s, i) => s + i.extraCopies, 0)} Cards`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Profile edit modal */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(8px)' }}
          onClick={() => setProfileOpen(false)}
        >
          <div
            className="max-w-lg w-full relative max-h-[85vh] flex flex-col"
            style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10 }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setProfileOpen(false)}
              className="absolute top-4 right-4 font-karla font-300 text-[#8a8880] hover:text-[#f0ede8] text-xs uppercase tracking-widest transition-colors"
              style={{ zIndex: 1 }}
            >
              Close
            </button>

            <div className="overflow-y-auto scrollbar-hide p-8 flex-1">
            <p className="sg-eyebrow text-center mb-1">Profile</p>
            <p className="font-cinzel font-700 text-[#f0ede8] text-center text-xl mb-2">{username}</p>

            {/* Username change */}
            {!usernameChanged && (
              <div className="flex justify-center mb-6">
                {showUsernameForm ? (
                  <form onSubmit={handleSaveUsername} className="flex flex-col items-center gap-2 w-full max-w-xs">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      placeholder="new username"
                      className="sg-input font-karla font-600 tracking-[0.12em] text-sm w-full text-center"
                      maxLength={20}
                      autoFocus
                      spellCheck={false}
                    />
                    {usernameError && <p className="font-karla font-300 text-red-400 text-xs">{usernameError}</p>}
                    <p className="font-karla font-300 text-[#6a6764] text-center" style={{ fontSize: '0.6rem' }}>3–20 characters · letters, numbers, underscores · one time only</p>
                    <div className="flex gap-2">
                      <button type="submit" disabled={profilePending} className="btn-ghost text-xs" style={{ padding: '0.4rem 1rem' }}>
                        {profilePending ? '…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => { setShowUsernameForm(false); setUsernameError('') }} className="btn-ghost text-xs" style={{ padding: '0.4rem 1rem' }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowUsernameForm(true)}
                    className="font-karla font-300 text-[#6a6764] hover:text-[#8a8880] transition-colors text-xs tracking-wide"
                  >
                    Change username (once)
                  </button>
                )}
              </div>
            )}

            {/* Showcase picker */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.5rem', marginTop: usernameChanged ? '1.5rem' : 0 }}>
              <p className="font-karla font-300 text-[#8a8880] text-center text-xs tracking-wide mb-2">
                Tap to select your top 5 showcase catches
              </p>
              <p className="font-karla font-300 text-center mb-8" style={{ fontSize: '0.7rem', color: selectedShowcase.length === 5 ? '#f0c040' : '#6a6764' }}>
                {selectedShowcase.length} / 5 selected
                {selectedShowcase.length > 0 && (
                  <button onClick={() => setSelectedShowcase([])} className="ml-3 text-[#6a6764] hover:text-[#8a8880] transition-colors">
                    Clear
                  </button>
                )}
              </p>

              {pickerCards.length === 0 ? (
                <p className="font-karla font-300 text-[#6a6764] text-xs text-center">Open some packs first!</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-6">
                  {pickerCards.map(card => {
                    const selectedIdx = selectedShowcase.indexOf(card.variantId)
                    const isSelected = selectedIdx !== -1
                    return (
                      <div key={card.variantId} className="relative">
                        <div
                          className={`rounded-full transition-all duration-200 ${!isSelected && selectedShowcase.length >= 5 ? 'opacity-25' : 'cursor-pointer'}`}
                          style={isSelected ? { outline: '2px solid #f0c040', outlineOffset: '5px' } : {}}
                          onClick={() => (!isSelected && selectedShowcase.length >= 5) ? undefined : toggleShowcaseCard(card.variantId)}
                        >
                          <FishCard
                            name={card.name}
                            filename={card.filename}
                            borderStyle={card.borderStyle as any}
                            artEffect={card.artEffect as any}
                            variantName={card.variantName}
                            dropWeight={card.dropWeight}
                          />
                        </div>
                        {isSelected && (
                          <div className="absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center pointer-events-none" style={{ background: '#f0c040' }}>
                            <span className="font-karla font-700 text-black" style={{ fontSize: '0.6rem' }}>{selectedIdx + 1}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '1rem 2rem' }}>
              <button
                onClick={handleSaveShowcase}
                disabled={profilePending}
                className="btn-ghost w-full disabled:opacity-50"
              >
                {profilePending ? 'Saving…' : 'Save Showcase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
