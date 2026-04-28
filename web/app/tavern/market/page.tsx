import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import MarketClient from './MarketClient'

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

  const [{ data: profile }, marketRes, inventoryRes, stateRes, collectionRes] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    admin.from('fish_market')
      .select('fish_id, multiplier, prev_multiplier, history, fish_species(id, name, habitat, bite_rarity, sell_value)'),
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

  const allMarket: MarketFishEntry[] = ((marketRes.data ?? []) as unknown as MarketRow[])
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

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <MarketClient portfolio={portfolio} allMarket={discovered} marketState={state} doubloons={profile?.doubloons ?? 0} />
    </>
  )
}
