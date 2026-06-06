// Blackjack fish art — fish-by-rank pairing for the card face decoration.
//
// Aces get the rarest fish; 2s get the most common. Rarity tiers are
// read from fish_species.bite_rarity (the in-game catch difficulty
// 1=easy/common, 5=hard/rare). The "ancients" (habitat='ancient_deep')
// are filtered out — they're story-gated trophies and shouldn't leak
// onto a tavern minigame card.
//
// Maps rank → pool of fish PNG paths. Each card draw picks a random
// fish from its rank's pool, purely client-side cosmetic — the card's
// actual rank+suit value (driving game logic) is independent of which
// fish image renders on it.
//
// The pool is built server-side (DB query) and passed to the client
// as a prop on the Blackjack page. Cached via React.cache so multiple
// renders within one request share the fetch.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Rank } from '@/lib/blackjack'

export type FishArtPool = Record<Rank, string[]>

/** Convert a fish species name to its PNG filename in /public/fish/.
 *  Slicer convention: lowercase + spaces-to-hyphens. */
function nameToFile(name: string): string {
  return '/fish/' + name.toLowerCase().replace(/\s+/g, '-') + '.png'
}

/** Rank → fish bite_rarity bucket. Aces show the rarest legal fish,
 *  2s show the most common. The four mid-tiers compress the three
 *  rank groups (J/Q/K, 8/9/T, 5/6/7) onto the same fish pool — small
 *  visual repetition is fine because suits still vary. */
const RANK_TO_RARITY: Record<Rank, number> = {
  A: 5,           // legendary fish (filtered: bite_rarity 5 minus ancients)
  K: 4, Q: 4, J: 4,   // epic
  T: 3, 9: 3, 8: 3,   // rare
  7: 2, 6: 2, 5: 2,   // uncommon
  4: 1, 3: 1, 2: 1,   // common
}

/** Build the rank → fish image pool from the live fish_species table.
 *  Cached per request via React.cache so all server components share
 *  the same fetch. Ancients (habitat='ancient_deep') are excluded. */
export const getFishArtPool = cache(async (): Promise<FishArtPool> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('fish_species')
    .select('name, bite_rarity, habitat')
    .neq('habitat', 'ancient_deep')

  // Bucket by bite_rarity (1-5). Defensive default to empty arrays so
  // a missing tier doesn't crash the picker — the client falls back
  // to a generic card style if its pool is empty.
  const byRarity: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  for (const row of (data ?? []) as { name: string; bite_rarity: number; habitat: string }[]) {
    const tier = row.bite_rarity
    if (tier >= 1 && tier <= 5) byRarity[tier].push(nameToFile(row.name))
  }

  const pool = {} as FishArtPool
  for (const rank of Object.keys(RANK_TO_RARITY) as Rank[]) {
    pool[rank] = byRarity[RANK_TO_RARITY[rank]] ?? []
  }
  return pool
})

/** Client-side picker — given a rank and the pool from props, return
 *  a random fish PNG path. Uses Math.random; intentionally varies on
 *  every render so the same card landing twice in one hand shows two
 *  different fish (adds character; the user explicitly asked for it). */
export function pickFishForRank(pool: FishArtPool, rank: Rank): string | null {
  const arr = pool[rank]
  if (!arr || arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}
