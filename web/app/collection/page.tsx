import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CollectionGrid from './CollectionGrid'
import type { Card, BorderStyle, ArtEffect } from '@/lib/types'

const RANKS = [
  { name: 'Crewmate',     min: 0,   color: '#8a8880', next: 25  },
  { name: 'Officer',      min: 25,  color: '#4ade80', next: 75  },
  { name: 'Second Mate',  min: 75,  color: '#60a5fa', next: 150 },
  { name: 'Quartermaster',min: 150, color: '#a78bfa', next: 250 },
  { name: 'Captain',      min: 250, color: '#f0c040', next: null },
]

function getRank(owned: number) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (owned >= RANKS[i].min) return RANKS[i]
  }
  return RANKS[0]
}

function RankIcon({ name, color }: { name: string; color: string }) {
  if (name === 'Captain') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8"/><path d="M5 9v10h14V9"/><path d="M9 21v-6h6v6"/>
    </svg>
  )
  if (name === 'Quartermaster') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="12" y1="3" x2="12" y2="3"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )
  if (name === 'Second Mate') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>
    </svg>
  )
  if (name === 'Officer') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L12 6M12 18L12 22M2 12L6 12M18 12L22 12"/>
      <path d="M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  )
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2"/><path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10"/>
      <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3"/>
    </svg>
  )
}

function RankBadge({ owned, total }: { owned: number; total: number }) {
  const rank = getRank(owned)
  const progressMin = rank.min
  const progressMax = rank.next ?? total
  const progressPct = rank.next
    ? Math.min(((owned - progressMin) / (progressMax - progressMin)) * 100, 100)
    : 100

  return (
    <div className="px-6 pb-6 max-w-sm mx-auto">
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '0.875rem 1rem',
      }}>
        <div className="flex items-center gap-3 mb-3">
          <RankIcon name={rank.name} color={rank.color} />
          <div className="flex-1">
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#9a9488]" style={{ fontSize: '0.55rem' }}>Rank</p>
            <p className="font-cinzel font-700" style={{ color: rank.color, fontSize: '1rem', lineHeight: 1.1 }}>{rank.name}</p>
          </div>
          <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.7rem' }}>
            {owned} <span style={{ color: '#4a4845' }}>/ {total}</span>
          </p>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: rank.color, borderRadius: 2, transition: 'width 0.6s ease', opacity: 0.8 }} />
        </div>
        {rank.next && (
          <p className="font-karla text-[#4a4845] mt-1.5" style={{ fontSize: '0.6rem' }}>
            {rank.next - owned} more to reach {RANKS[RANKS.findIndex(r => r.name === rank.name) + 1].name}
          </p>
        )}
      </div>
    </div>
  )
}

export interface OwnedEntry {
  variantId: number
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
  count: number
  rowIds: number[]
}

export interface AllVariantEntry {
  id: number
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
}

export default async function CollectionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: allCards }, { data: owned }, { data: profile }, { count: totalVariants }, { data: allVariantsRaw }] = await Promise.all([
    supabase.from('cards').select('*').order('tier').order('name'),
    supabase
      .from('user_collection')
      .select('id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, card_id)')
      .eq('user_id', user.id),
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    supabase.from('card_variants').select('*', { count: 'exact', head: true }),
    supabase.from('card_variants').select('id, variant_name, border_style, art_effect, drop_weight, card_id'),
  ])

  const totalVariantsByCardId: Record<number, number> = {}
  const allVariantsByCardId: Record<number, AllVariantEntry[]> = {}
  for (const v of allVariantsRaw ?? []) {
    totalVariantsByCardId[v.card_id] = (totalVariantsByCardId[v.card_id] ?? 0) + 1
    if (!allVariantsByCardId[v.card_id]) allVariantsByCardId[v.card_id] = []
    allVariantsByCardId[v.card_id].push({
      id:          v.id,
      variantName: v.variant_name,
      borderStyle: v.border_style as BorderStyle,
      artEffect:   v.art_effect as ArtEffect,
      dropWeight:  v.drop_weight,
    })
  }

  // Build map: card_id → OwnedEntry[] (one entry per unique variant, with count + rowIds for dupes)
  const ownedByCardId: Record<number, OwnedEntry[]> = {}

  for (const row of owned ?? []) {
    const v = (row.card_variants as unknown) as {
      id: number; variant_name: string; border_style: string; art_effect: string; drop_weight: number; card_id: number
    } | null
    if (!v) continue

    if (!ownedByCardId[v.card_id]) ownedByCardId[v.card_id] = []
    const existing = ownedByCardId[v.card_id].find((e) => e.variantId === v.id)
    if (existing) {
      existing.count++
      existing.rowIds.push(row.id)
    } else {
      ownedByCardId[v.card_id].push({
        variantId:   v.id,
        variantName: v.variant_name,
        borderStyle: v.border_style as BorderStyle,
        artEffect:   v.art_effect as ArtEffect,
        dropWeight:  v.drop_weight,
        count:       1,
        rowIds:      [row.id],
      })
    }
  }

  const ownedUniqueVariants = Object.values(ownedByCardId).reduce((sum, entries) => sum + entries.length, 0)

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} />
      <main className="min-h-screen">
        <div className="px-6 pt-8 pb-5 text-center">
          <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em]"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Collection.
          </h1>
        </div>
        <RankBadge owned={ownedUniqueVariants} total={totalVariants ?? 299} />
        <CollectionGrid
          allCards={(allCards ?? []) as Card[]}
          ownedByCardId={ownedByCardId}
          totalVariants={totalVariants ?? 0}
          totalVariantsByCardId={totalVariantsByCardId}
          allVariantsByCardId={allVariantsByCardId}
          doubloons={profile?.doubloons ?? 0}
        />
      </main>
    </>
  )
}
