import { getCurrentProfile } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MarketClient from './MarketClient'
import { getCachedFishMarketFull } from '@/lib/fishMarket'
import { marketPageProps, exchangeOpenFor } from '@/lib/core/marketPage'

// The types and the shaping live in lib/core/marketPage, shared with the
// desktop build, which reads the same pieces from the save.
export type { MarketFishEntry, MarketState } from '@/lib/core/marketPage'

export default async function MarketPage() {
  // THE PROFILE THE SHELL ALREADY FETCHED. The layout reads the current
  // profile for every page; this page made its own auth round trip and its
  // own profiles read on top, which on a phone was two serial network hops
  // before the market's queries could even start. `getCurrentProfile` is
  // request-cached, so this is the same row and no extra trip.
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  const user = { id: profile.id as string }

  const admin = createAdminClient()

  const [market, inventoryRes, stateRes, collectionRes, betsRes] = await Promise.all([
    // Shared market snapshot from the cross-request cache (lib/fishMarket).
    getCachedFishMarketFull(),
    admin.from('fish_inventory')
      .select('fish_id, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('market_state').select('mood, next_update_at').eq('id', 1).single(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    // How many contracts are running, for the Exchange door's own sub-line.
    // Head-only count, only for captains who can trade at all, and IN the
    // batch: it used to be a sixth query after the other five had landed.
    exchangeOpenFor(profile)
      ? admin.from('exchange_bets').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'open')
      : Promise.resolve({ count: 0 as number | null }),
  ])

  // MarketIntroModal LIVED HERE. The sea's first voyage walks a new captain
  // into this room and Kat talks them through the sale, so this opened ON TOP
  // of that — two tutorials for one counter, one of them a modal covering the
  // other one's pointing finger. The walkthrough teaches it in context and
  // this did not, so this is the one that goes. `has_seen_market_intro` stays
  // a column; nothing reads it.
  return (
    <MarketClient {...marketPageProps({
      profile,
      market,
      inventory: (inventoryRes.data ?? []) as { fish_id: number; quantity: number }[],
      state: stateRes.data ?? null,
      collectionIds: (collectionRes.data ?? []).map(r => r.fish_id as number),
      openContracts: betsRes.count ?? 0,
    }, Date.now())} />
  )
}
