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

  const [{ data: profile }, inventoryRes, marketRes, stateRes] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    admin.from('fish_inventory')
      .select('fish_id, quantity, fish_species(id, name, habitat, bite_rarity, sell_value)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('fish_market').select('fish_id, multiplier, prev_multiplier, history'),
    admin.from('market_state').select('mood, next_update_at').eq('id', 1).single(),
  ])

  const marketMap = new Map<number, { multiplier: number; prev_multiplier: number; history: number[] }>()
  for (const row of marketRes.data ?? []) {
    marketMap.set(row.fish_id, {
      multiplier: Number(row.multiplier),
      prev_multiplier: Number(row.prev_multiplier),
      history: (row.history as number[]) ?? [],
    })
  }

  type InvRow = {
    fish_id: number
    quantity: number
    fish_species: { id: number; name: string; habitat: string; bite_rarity: number; sell_value: number } | null
  }

  const portfolio: MarketFishEntry[] = ((inventoryRes.data ?? []) as unknown as InvRow[])
    .filter(r => r.fish_species != null)
    .map(r => {
      const species = r.fish_species!
      const mkt = marketMap.get(r.fish_id) ?? { multiplier: 1.0, prev_multiplier: 1.0, history: [] }
      return {
        fish_id: r.fish_id,
        name: species.name,
        habitat: species.habitat,
        bite_rarity: species.bite_rarity,
        sell_value: species.sell_value,
        quantity: r.quantity,
        multiplier: mkt.multiplier,
        prev_multiplier: mkt.prev_multiplier,
        history: mkt.history,
      }
    })
    .sort((a, b) => b.sell_value * b.multiplier - a.sell_value * a.multiplier)

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
      <MarketClient portfolio={portfolio} marketState={state} doubloons={profile?.doubloons ?? 0} />
    </>
  )
}
