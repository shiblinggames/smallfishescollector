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

// Fuller shape for the /tavern/market screen — adds the price `history` and the
// extra species fields that board needs. Same public/shared data, same cache
// tag; separate entry so the hot light read above stays lean.
export type CachedMarketRowFull = {
  fish_id: number
  multiplier: number
  prev_multiplier: number
  history: number[] | null
  fish_species: { id: number; name: string; habitat: string; bite_rarity: number; sell_value: number } | null
}

export const getCachedFishMarketFull = unstable_cache(
  async (): Promise<CachedMarketRowFull[]> => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('fish_market')
      .select('fish_id, multiplier, prev_multiplier, history, fish_species(id, name, habitat, bite_rarity, sell_value)')
    return (data ?? []) as unknown as CachedMarketRowFull[]
  },
  ['fish-market-full'],
  { revalidate: 60, tags: ['fish_market'] },
)


// ── Market mood ─────────────────────────────────────────────────────────────
// Lifted out of MarketClient so the Fishing hub's Market card can name the
// weather with the same words the market itself uses. Two screens, one
// vocabulary.
export const MOOD_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; desc: string }> = {
  calm:           { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)',  label: 'Calm Market',   desc: 'Flat water. Prices barely breathe.' },
  storm:          { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)',  label: 'Storm',         desc: 'The board jumps with the swell. Could break either way.' },
  kraken:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)',   label: 'Kraken',        desc: 'Something big is under the hull. Sell brave or sell nothing.' },
  tide_rising:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.25)',  label: 'Tide Rising',   desc: 'The tide lifts every price with it. Holding pays.' },
  bounty_season:  { color: '#f0c040', bg: 'rgba(240,192,64,0.1)',   border: 'rgba(240,192,64,0.25)',  label: 'Bounty Season', desc: 'Buyers flush with coin. Rare fish are climbing fast.' },
  low_tide:       { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)', label: 'Low Tide',      desc: 'Buyers are tight-fisted today. Hold if you can stomach it.' },
  cursed_waters:  { color: '#c084fc', bg: 'rgba(192,132,252,0.1)',  border: 'rgba(192,132,252,0.25)', label: 'Cursed Waters', desc: 'Bad water. Every price is sinking and picking up speed.' },
}
