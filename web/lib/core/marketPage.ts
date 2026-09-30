// ── THE MARKET'S PAGE, SHAPED (Steam prep, 2026-09-30) ──
//
// What the market screen is handed, built from pieces, like the sea chart
// (lib/core/seaPage). The web's /tavern/market page reads its pieces in one
// batch against Supabase (the shared market behind the cross-request cache);
// the desktop reads the captain's own market from the save. This turns either
// into MarketClient's props.
//
// Moved verbatim out of app/(app)/tavern/market/page.tsx.

import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { EXCHANGE_FISHING_LEVEL } from '@/lib/fishExchange'
import type { Row } from '@/lib/data/common'

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

/** One species on the board, with its base facts. */
export type MarketRow = {
  fish_id: number
  multiplier: number
  prev_multiplier: number
  history: number[] | null
  fish_species: { id: number; name: string; habitat: string; bite_rarity: number; sell_value: number } | null
}

export type MarketPagePieces = {
  profile: Row
  market: MarketRow[]
  /** Stacks of at least one in the hold. */
  inventory: { fish_id: number; quantity: number }[]
  state: { mood: string; next_update_at: string } | null
  /** Every species ever logged. */
  collectionIds: number[]
  /** Exchange contracts running (0 when the Exchange is shut to this captain). */
  openContracts: number
}

/** Whether this captain can trade on the Exchange at all. Decided before the
 *  reads, so the contract count only runs for captains who can. */
export function exchangeOpenFor(profile: Row): boolean {
  return getLevelFromXP(Number(profile.fishing_xp ?? 0)) >= EXCHANGE_FISHING_LEVEL
}

/** MarketClient's props, from the pieces. */
export function marketPageProps(p: MarketPagePieces, now: number) {
  const profile = p.profile
  const exchangeOpen = exchangeOpenFor(profile)
  const inventoryMap = new Map<number, number>()
  for (const row of p.inventory) inventoryMap.set(row.fish_id, row.quantity)
  const discoveredIds = new Set(p.collectionIds)

  const allMarket: MarketFishEntry[] = p.market
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

  const state: MarketState = {
    mood: (p.state?.mood ?? 'calm') as MarketState['mood'],
    next_update_at: p.state?.next_update_at ?? new Date(now + 3600000).toISOString(),
  }

  return {
    portfolio: allMarket.filter(e => e.quantity > 0),
    allMarket: allMarket.filter(e => discoveredIds.has(e.fish_id)),
    marketState: state,
    doubloons: Number(profile.doubloons ?? 0),
    isPremium: isPremiumActive(profile),
    // The Exchange announcement is worth nothing if it waits behind a tab the
    // captain has no reason to press: the page OPENS on the Exchange the one
    // time there is news, then never again.
    exchangeUnveil: exchangeOpen && profile.has_seen_exchange_intro !== true,
    exchangeOpen,
    openContracts: p.openContracts,
    // Null unless a first voyage is actually in progress: a captain who has
    // been shown around already gets no coaching in here.
    tourStep: profile.has_seen_sea_tour === true ? null : Number(profile.sea_tour_step ?? 0),
  }
}
