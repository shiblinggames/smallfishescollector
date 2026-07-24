import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// Public, SHARED fish-market snapshot — identical for every player, shifted only
// by the update_fish_market() cron. It's read on the hot fishing screen and the
// Tavern ticker, so without caching every page view was its own DB round trip.
// unstable_cache persists the result across requests (and users) in Next's data
// cache, so it becomes ~one DB read per `revalidate` window globally instead of
// one per view. The pages still render dynamically; only this shared read is
// cached.
//
// DISPLAY ONLY. The sell / liquidate paths in tavern/market/actions.ts read
// fish_market FRESH so payouts always price at the live multiplier — a ≤60s
// stale board is fine, a stale payout is not. Keep those uncached.
//
// Migration path: swap unstable_cache → the `use cache` directive once Cache
// Components is enabled in next.config (see project-scaling-playbook).

export type CachedMarketRow = {
  fish_id: number
  multiplier: number
  prev_multiplier: number
  fish_species: { name: string; sell_value: number } | null
}

export const getCachedFishMarket = unstable_cache(
  async (): Promise<CachedMarketRow[]> => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('fish_market')
      .select('fish_id, multiplier, prev_multiplier, fish_species(name, sell_value)')
    return (data ?? []) as unknown as CachedMarketRow[]
  },
  ['fish-market-display'],
  { revalidate: 60, tags: ['fish_market'] },
)
