// Blackjack fish art, the server read: the species list from the database,
// turned into the rank → fish pool (lib/blackjackFishArtPool, the pure half the
// table imports). Cached via React.cache so multiple server components in one
// request share the fetch.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { fishArtPoolFrom, type FishArtPool } from '@/lib/blackjackFishArtPool'

export type { FishArtPool } from '@/lib/blackjackFishArtPool'

/** Build the rank → fish image pool from the live fish_species table.
 *  Ancients (habitat='ancient_deep') are excluded. */
export const getFishArtPool = cache(async (): Promise<FishArtPool> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('fish_species')
    .select('name, bite_rarity, habitat')
    .neq('habitat', 'ancient_deep')
  return fishArtPoolFrom((data ?? []) as { name: string; bite_rarity: number; habitat: string }[])
})
