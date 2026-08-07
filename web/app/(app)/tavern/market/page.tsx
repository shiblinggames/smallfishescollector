import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MarketClient from './MarketClient'
import MarketIntroModal from './MarketIntroModal'
import { isPremiumActive } from '@/lib/premium'
import { getCachedFishMarketFull } from '@/lib/fishMarket'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { EXCHANGE_FISHING_LEVEL } from '@/lib/fishExchange'

export type MarketFishEntry = {
  fish_id: number
  name: string
  habitat: string
  bite_rarity: number
  sell_value: number
  quantity: number
  multiplier: number
  prev_multiplier: number
  history: number[]
}

export type MarketState = {
  mood: 'calm' | 'storm' | 'kraken'
  next_update_at: string
}

export default async function MarketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  type MarketRow = {
    fish_id: number
    multiplier: number
    prev_multiplier: number
    history: number[]
    fish_species: { id: number; name: string; habitat: string; bite_rarity: number; sell_value: number } | null
  }

  type InvRow = {
    fish_id: number
    quantity: number
  }

  const [{ data: profile }, market, inventoryRes, stateRes, collectionRes] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems, is_premium, premium_expires_at, has_seen_market_intro, fishing_xp, has_seen_exchange_intro').eq('id', user.id).single(),
    // Shared market snapshot from the cross-request cache (lib/fishMarket).
    getCachedFishMarketFull(),
    admin.from('fish_inventory')
      .select('fish_id, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('market_state').select('mood, next_update_at').eq('id', 1).single(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
  ])

  const inventoryMap = new Map<number, number>()
  for (const row of (inventoryRes.data ?? []) as InvRow[]) {
    inventoryMap.set(row.fish_id, row.quantity)
  }

  const discoveredIds = new Set((collectionRes.data ?? []).map(r => r.fish_id))

  const allMarket: MarketFishEntry[] = market
    .filter(r => r.fish_species != null)
    .map(r => ({
      fish_id: r.fish_id,
      name: r.fish_species!.name,
      habitat: r.fish_species!.habitat,
      bite_rarity: r.fish_species!.bite_rarity,
      sell_value: r.fish_species!.sell_value,
      quantity: inventoryMap.get(r.fish_id) ?? 0,
      multiplier: Number(r.multiplier),
      prev_multiplier: Number(r.prev_multiplier),
      history: (r.history as number[]) ?? [],
    }))
    .sort((a, b) => b.sell_value * b.multiplier - a.sell_value * a.multiplier)

  const portfolio = allMarket.filter(e => e.quantity > 0)
  const discovered = allMarket.filter(e => discoveredIds.has(e.fish_id))

  const state: MarketState = {
    mood: (stateRes.data?.mood ?? 'calm') as MarketState['mood'],
    next_update_at: stateRes.data?.next_update_at ?? new Date(Date.now() + 3600000).toISOString(),
  }

  // The Exchange announcement is worth nothing if it waits behind a tab the
  // captain has no reason to press. Decided here so the page can OPEN on the
  // Exchange the one time there is news, then never again.
  const exchangeOpen = getLevelFromXP(Number(profile?.fishing_xp ?? 0)) >= EXCHANGE_FISHING_LEVEL
  const exchangeUnveil = exchangeOpen && profile?.has_seen_exchange_intro !== true

  // How many contracts are running, for the Exchange door's own sub-line. A tab
  // that can say "2 running" is worth pressing; one that just says its name is
  // furniture. Head-only count, and only for captains who can trade at all.
  const { count: openContracts } = exchangeOpen
    ? await admin.from('exchange_bets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('status', 'open')
    : { count: 0 }

  return (
    <>
      {!profile?.has_seen_market_intro && <MarketIntroModal />}
      <MarketClient
        portfolio={portfolio}
        allMarket={discovered}
        marketState={state}
        doubloons={profile?.doubloons ?? 0}
        isPremium={isPremiumActive(profile)}
        exchangeUnveil={exchangeUnveil}
        exchangeOpen={exchangeOpen}
        openContracts={openContracts ?? 0}
      />
    </>
  )
}
