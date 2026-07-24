import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'
import { getCachedFishMarket } from '@/lib/fishMarket'
import PriceTickerScroll, { type TickerItem } from './PriceTickerScroll'

// Thin fish-price ticker that sits directly under the leaderboard strip on the
// Tavern — a news-site stock ticker for the fish market. Tap → the full
// /tavern/market screen. Self-fetching async server component (mirrors
// TavernLeaderboardsCard) so it streams in via its own Suspense boundary.
//
// Only the player's DISCOVERED species are shown (joins fish_collection) so the
// ticker never spoils fish they haven't caught yet. Hidden entirely for brand
// new players with an empty collection.

type MarketRow = {
  fish_id: number
  multiplier: number
  prev_multiplier: number
  fish_species: { name: string; sell_value: number } | null
}

export default async function TavernPriceTicker() {
  const user = await getCurrentUser()
  if (!user) return null

  const admin = createAdminClient()
  const [market, collectionRes] = await Promise.all([
    getCachedFishMarket(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
  ])

  const discovered = new Set((collectionRes.data ?? []).map(r => r.fish_id))
  if (discovered.size === 0) return null

  const items: TickerItem[] = (market as unknown as MarketRow[])
    .filter(r => r.fish_species != null && discovered.has(r.fish_id))
    .map(r => {
      const mult = Number(r.multiplier)
      const prev = Number(r.prev_multiplier)
      return {
        name: r.fish_species!.name,
        price: Math.floor(r.fish_species!.sell_value * mult * 0.97),
        pct: prev > 0 ? ((mult - prev) / prev) * 100 : 0,
      }
    })
    .sort((a, b) => b.price - a.price)

  if (items.length === 0) return null

  return (
    <Link
      href="/tavern/market"
      style={{
        display: 'flex', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(8,16,26,0.98) 0%, rgba(8,26,34,0.95) 100%)',
        border: '1px solid rgba(56,189,248,0.38)',
        borderTop: '1px solid rgba(56,189,248,0.65)',
        borderRadius: 14,
        height: 44,
        padding: '0 0.7rem 0 0.9rem',
        cursor: 'pointer', userSelect: 'none', textDecoration: 'none', color: 'inherit',
        boxShadow: '0 0 24px rgba(56,189,248,0.08)',
      }}
    >
      {/* "MARKET" label chip on the left so the strip reads apart from the leaderboard ticker */}
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#7fd6ef', flexShrink: 0, marginRight: 10 }}>
        Market
      </span>
      <PriceTickerScroll items={items} />
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(56,189,248,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 8 }}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
