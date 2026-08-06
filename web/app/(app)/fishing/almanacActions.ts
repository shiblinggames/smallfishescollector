'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// The Angler's Almanac's data is loaded ON OPEN, not with the fishing page.
//
// It needs five tables and a dozen profile columns, and almost nobody opens it
// on any given visit to /fishing. Folding it into the page loader would put
// that cost on every cast. The overlay shows a spinner for one round trip
// instead, the same trade the crew roster and the forge board make.
//
// Types live here rather than in /lib because they are only ever read through
// this action. Note a 'use server' file silently drops non-async exports, so
// anything but a type or an async function has to move to /lib.

export type AlmanacEntry = {
  id: number
  name: string
  scientificName: string | null
  description: string | null
  funFact: string | null
  habitat: string
  /** bite_rarity, 1 (common) to 5 (legendary). */
  rarity: number
  difficulty: number
  sellValue: number
  lengthMin: number | null
  lengthMax: number | null
  sizeCategory: string | null
  dietType: string | null
  waterType: string | null
  region: string | null
  /** ── the player's side ── */
  count: number
  firstCaughtAt: string | null
  lastCaughtAt: string | null
  /** Has a golden of this species EVER been landed (the row survives selling). */
  everGolden: boolean
  pbLength: number | null
  pbAt: string | null
}

/** One golden, as its own object. Unlike everything else in the Almanac these
 *  are not merged per species: each row is a specific fish caught on a specific
 *  day at a specific size, which is the whole reason the Goldens room exists. */
export type GoldenCatch = {
  id: number
  fishId: number
  name: string
  habitat: string
  rarity: number
  sizeIn: number | null
  caughtAt: string
  /** 'hold' (still in your fish hold) | 'sold'. Older rows may be null,
   *  which reads as held. */
  status: string | null
  soldFor: number | null
}

export type AlmanacStats = {
  casts: number
  perfects: number
  bestPerfectStreak: number
  trophySizeCatches: number
  cratesOpened: number
  doubleCatches: number
  jackpots: number
  snags: number
  doubloonsFromFish: number
  fishingXP: number
  /** Counted since the Almanac shipped, not for all time. The lifetime totals
   *  beside them (cratesOpened, doubloonsFromFish) go all the way back, so the
   *  Record labels these as recent rather than pretending otherwise. */
  crateOpens: Record<string, number>
  baitUsed: Record<string, number>
  biggestSale: number
  fishSoldCount: number
}

export type AlmanacData = {
  entries: AlmanacEntry[]
  goldens: GoldenCatch[]
  unlockedPets: string[]
  ancientCatches: number[]
  prestige: Record<string, number>
  stats: AlmanacStats
}

export async function getAlmanacData(): Promise<AlmanacData | { error: string }> {
  const supabase = await createClient()
  // getSession is enough here: this only READS, and the RLS-safe id is all we
  // need to scope the queries.
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [species, collection, bests, goldens, profile] = await Promise.all([
    admin.from('fish_species')
      .select('id, name, scientific_name, description, fun_fact, habitat, bite_rarity, catch_difficulty, sell_value, length_min_in, length_max_in, size_category, diet_type, water_type, region, sort_order')
      .order('sort_order', { ascending: true }),
    admin.from('fish_collection')
      .select('fish_id, catch_count, first_caught_at, last_caught_at, is_golden')
      .eq('user_id', uid),
    admin.from('fish_personal_bests')
      .select('fish_id, best_length_in, caught_at')
      .eq('user_id', uid),
    admin.from('shiny_catches')
      .select('id, fish_id, size_in, caught_at, status, sold_for')
      .eq('user_id', uid)
      .order('caught_at', { ascending: false }),
    admin.from('profiles')
      .select('fishing_casts, total_perfects, highest_perfect_streak, trophy_size_catches, fishing_crates_opened, fishing_double_catches, fishing_jackpots, fishing_snags, fish_sold_doubloons, fishing_xp, unlocked_pets, ancient_catches, prestige_levels, crate_opens, bait_used, biggest_fish_sale, fish_sold_count')
      .eq('id', uid)
      .maybeSingle(),
  ])

  if (species.error) return { error: 'Could not read the species list' }

  const col = new Map((collection.data ?? []).map(r => [r.fish_id as number, r]))
  const pb = new Map((bests.data ?? []).map(r => [r.fish_id as number, r]))

  const entries: AlmanacEntry[] = (species.data ?? []).map(s => {
    const c = col.get(s.id as number)
    const b = pb.get(s.id as number)
    return {
      id: s.id as number,
      name: s.name as string,
      scientificName: (s.scientific_name as string | null) ?? null,
      description: (s.description as string | null) ?? null,
      funFact: (s.fun_fact as string | null) ?? null,
      habitat: s.habitat as string,
      rarity: (s.bite_rarity as number | null) ?? 1,
      difficulty: (s.catch_difficulty as number | null) ?? 1,
      sellValue: (s.sell_value as number | null) ?? 0,
      lengthMin: (s.length_min_in as number | null) ?? null,
      lengthMax: (s.length_max_in as number | null) ?? null,
      sizeCategory: (s.size_category as string | null) ?? null,
      dietType: (s.diet_type as string | null) ?? null,
      waterType: (s.water_type as string | null) ?? null,
      region: (s.region as string | null) ?? null,
      count: (c?.catch_count as number | null) ?? 0,
      firstCaughtAt: (c?.first_caught_at as string | null) ?? null,
      lastCaughtAt: (c?.last_caught_at as string | null) ?? null,
      everGolden: c?.is_golden === true,
      pbLength: (b?.best_length_in as number | null) ?? null,
      pbAt: (b?.caught_at as string | null) ?? null,
    }
  })

  const byId = new Map(entries.map(e => [e.id, e]))
  const goldenList: GoldenCatch[] = (goldens.data ?? []).map(g => {
    const e = byId.get(g.fish_id as number)
    return {
      id: g.id as number,
      fishId: g.fish_id as number,
      name: e?.name ?? 'Unknown',
      habitat: e?.habitat ?? 'shallows',
      rarity: e?.rarity ?? 1,
      sizeIn: (g.size_in as number | null) ?? null,
      caughtAt: g.caught_at as string,
      status: (g.status as string | null) ?? null,
      soldFor: (g.sold_for as number | null) ?? null,
    }
  })

  const p = profile.data
  return {
    entries,
    goldens: goldenList,
    unlockedPets: (p?.unlocked_pets as string[] | null) ?? [],
    ancientCatches: (p?.ancient_catches as number[] | null) ?? [],
    prestige: (p?.prestige_levels as Record<string, number> | null) ?? {},
    stats: {
      casts: p?.fishing_casts ?? 0,
      perfects: p?.total_perfects ?? 0,
      bestPerfectStreak: p?.highest_perfect_streak ?? 0,
      trophySizeCatches: p?.trophy_size_catches ?? 0,
      cratesOpened: p?.fishing_crates_opened ?? 0,
      doubleCatches: p?.fishing_double_catches ?? 0,
      jackpots: p?.fishing_jackpots ?? 0,
      snags: p?.fishing_snags ?? 0,
      doubloonsFromFish: Number(p?.fish_sold_doubloons ?? 0),
      fishingXP: Number(p?.fishing_xp ?? 0),
      crateOpens: (p?.crate_opens as Record<string, number> | null) ?? {},
      baitUsed: (p?.bait_used as Record<string, number> | null) ?? {},
      biggestSale: p?.biggest_fish_sale ?? 0,
      fishSoldCount: p?.fish_sold_count ?? 0,
    },
  }
}
