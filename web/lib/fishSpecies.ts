import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// fish_species is static REFERENCE data — the species definitions only change
// when we ship new fish. The fishing screen (the hottest page) reads the whole
// list on every view, so it's an ideal long-TTL cache: ~one DB read per hour
// globally instead of one per page load. New fish appear within the revalidate
// window (or sooner via revalidateTag('fish_species') on deploy).

export type CachedSpecies = {
  id: number
  name: string
  scientific_name: string | null
  fun_fact: string | null
  habitat: string
  bite_rarity: number
  sell_value: number
  catch_difficulty: number
  length_min_in: number | null
  length_max_in: number | null
}

export const getCachedFishSpecies = unstable_cache(
  async (): Promise<CachedSpecies[]> => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('fish_species')
      .select('id, name, scientific_name, fun_fact, habitat, bite_rarity, sell_value, catch_difficulty, length_min_in, length_max_in')
      .order('bite_rarity')
    return (data ?? []) as unknown as CachedSpecies[]
  },
  ['fish-species-catalog'],
  { revalidate: 3600, tags: ['fish_species'] },
)
