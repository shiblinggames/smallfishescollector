// Achievement Points leaderboard, computed LIVE for every player instead of
// reading the stored unlocked_badges snapshot (which only refreshes when a
// player opens the Badges page, so it goes badly stale — active grinders show
// up under-counted while a long-idle player who once visited ranks above them).
//
// Per player we score badgePoints over union(stored unlocked_badges, derived):
//   - derived  = every column-based badge whose condition is currently met
//                (lib/badgeConditions) — always fresh, no reconcile needed
//   - stored   = covers the handful of hook-only badges that aren't derivable
//                (Trophy Catch, Catfish Jackpot, Full Collection)
// so nothing is double-counted and nothing is missed.
//
// SCALING: the whole-population board score is a 7-table read + per-player
// derivation — O(total rows across all players) and identical for every viewer.
// The single-user score is 7 queries. Both are wrapped in `unstable_cache` so
// the board runs ~once per 120s globally (not per view) and a user's score
// ~once per 60s (not per fishing-page load). Slight staleness is fine: the
// board is a leaderboard and the per-user value only gates cosmetic colors.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { badgePoints } from './badges'
import {
  earnedBadgeIds, exchangeStatsFrom, seaStatsFrom, BADGE_PROFILE_COLUMNS,
  type BadgeProfileFields, type ExchangePositionRow, type RapportRow, type HomesteadRow,
} from './badgeConditions'

export interface AchievementPointsRow {
  user_id: string
  username: string
  score: number
}

export interface AchievementPointsBoard {
  top: AchievementPointsRow[]
  myScore: number | null
  myRank: number | null
}

// Whole-population scoring — shared across every viewer, cached across requests.
const getCachedAchievementRows = unstable_cache(
  async (): Promise<AchievementPointsRow[]> => {
    const admin = createAdminClient()
    const [{ data: profiles }, { data: raidRows }, { data: crewRows }, { data: voyageRows }, { data: collectionRows }, { data: rodRows }, { data: goldenRows }, { data: exchangeRows }, { data: rapportRows }, { data: homeRows }, { data: isleRows }, { data: digRows }] = await Promise.all([
      admin.from('profiles').select(`id, username, unlocked_badges, ${BADGE_PROFILE_COLUMNS}`).eq('is_admin', false),
      admin.from('raid_completions').select('user_id, raid_id, elapsed_ms'),
      admin.from('user_crew').select('user_id, xp, died_at, effects, cards(slug)'),
      admin.from('daily_voyages').select('user_id').eq('status', 'revealed'),
      admin.from('fish_collection').select('user_id'),
      admin.from('rod_inventory').select('user_id, rod_tier'),
      admin.from('shiny_catches').select('user_id'),
      admin.from('exchange_bets').select('user_id, status, stake, payout'),
      // GROUPED, never per captain — same rule as the exchange rows above.
      // These four tables are the ocean hub's, and all four are small: one
      // row per regular you have met, one homestead each, one row per rock.
      admin.from('sea_rapport').select('user_id, points, gifts_given'),
      admin.from('homesteads').select('user_id, house, name, owned, pinned'),
      admin.from('sea_discoveries').select('user_id, isle_id'),
      admin.from('sea_digs').select('user_id').not('dug_at', 'is', null),
    ])

    // Bucket the joined rows by user so each player's conditions compute in memory.
    const raidsBy = new Map<string, { raid_id: string; elapsed_ms: number | null }[]>()
    for (const r of (raidRows ?? []) as Array<{ user_id: string; raid_id: string; elapsed_ms: number | null }>) {
      const arr = raidsBy.get(r.user_id) ?? []
      arr.push({ raid_id: r.raid_id, elapsed_ms: r.elapsed_ms })
      raidsBy.set(r.user_id, arr)
    }
    // Supabase types cards as an array though it's a to-one object at runtime.
    const crewBy = new Map<string, { xp: number | null; died_at: string | null; slug: string | null; effects: string[] | null }[]>()
    for (const c of (crewRows ?? []) as unknown as Array<{ user_id: string; xp: number | null; died_at: string | null; effects: string[] | null; cards: { slug: string | null } | null }>) {
      const arr = crewBy.get(c.user_id) ?? []
      arr.push({ xp: c.xp, died_at: c.died_at, effects: c.effects ?? null, slug: c.cards?.slug ?? null })
      crewBy.set(c.user_id, arr)
    }
    const voyageBy = new Map<string, number>()
    for (const v of (voyageRows ?? []) as Array<{ user_id: string }>) voyageBy.set(v.user_id, (voyageBy.get(v.user_id) ?? 0) + 1)
    const collectionBy = new Map<string, number>()
    for (const f of (collectionRows ?? []) as Array<{ user_id: string }>) collectionBy.set(f.user_id, (collectionBy.get(f.user_id) ?? 0) + 1)
    const goldenBy = new Map<string, number>()
    for (const g of (goldenRows ?? []) as Array<{ user_id: string }>) goldenBy.set(g.user_id, (goldenBy.get(g.user_id) ?? 0) + 1)
    // Grouped, never per captain: this path scores EVERY profile, so a query
    // each would be one round trip per player on the board.
    const exchangeBy = new Map<string, ExchangePositionRow[]>()
    for (const e of (exchangeRows ?? []) as Array<ExchangePositionRow & { user_id: string }>) {
      const arr = exchangeBy.get(e.user_id) ?? []
      arr.push({ status: e.status, stake: e.stake, payout: e.payout })
      exchangeBy.set(e.user_id, arr)
    }
    const rapportBy = new Map<string, RapportRow[]>()
    for (const r of (rapportRows ?? []) as Array<RapportRow & { user_id: string }>) {
      const arr = rapportBy.get(r.user_id) ?? []
      arr.push({ points: r.points, gifts_given: r.gifts_given })
      rapportBy.set(r.user_id, arr)
    }
    const homeBy = new Map<string, HomesteadRow>()
    for (const h of (homeRows ?? []) as Array<NonNullable<HomesteadRow> & { user_id: string }>) {
      homeBy.set(h.user_id, { house: h.house, name: h.name, owned: h.owned, pinned: h.pinned })
    }
    const islesBy = new Map<string, string[]>()
    for (const d of (isleRows ?? []) as Array<{ user_id: string; isle_id: string }>) {
      const arr = islesBy.get(d.user_id) ?? []
      arr.push(d.isle_id)
      islesBy.set(d.user_id, arr)
    }
    const digsBy = new Map<string, number>()
    for (const d of (digRows ?? []) as Array<{ user_id: string }>) digsBy.set(d.user_id, (digsBy.get(d.user_id) ?? 0) + 1)

    const rodsBy = new Map<string, number[]>()
    for (const r of (rodRows ?? []) as Array<{ user_id: string; rod_tier: number }>) {
      const arr = rodsBy.get(r.user_id) ?? []
      arr.push(r.rod_tier)
      rodsBy.set(r.user_id, arr)
    }

    const rows: AchievementPointsRow[] = []
    for (const p of (profiles ?? []) as Array<BadgeProfileFields & { id: string; username: string | null; unlocked_badges: string[] | null }>) {
      const derived = earnedBadgeIds(p, {
        raids: raidsBy.get(p.id) ?? [],
        crew: crewBy.get(p.id) ?? [],
        voyageCount: voyageBy.get(p.id) ?? 0,
        // Lifetime species (prestige-proof), with the live count as a floor.
        collectionCount: Math.max(collectionBy.get(p.id) ?? 0, Number(p.lifetime_species_count ?? 0)),
        rodTiers: rodsBy.get(p.id) ?? [],
        goldenCount: goldenBy.get(p.id) ?? 0,
        exchange: exchangeStatsFrom(exchangeBy.get(p.id) ?? []),
        sea: seaStatsFrom({
          rapport: rapportBy.get(p.id) ?? [],
          homestead: homeBy.get(p.id) ?? null,
          isles: islesBy.get(p.id) ?? [],
          digs: digsBy.get(p.id) ?? 0,
        }),
      })
      const all = new Set<string>([...(p.unlocked_badges ?? []), ...derived])
      let score = 0
      for (const id of all) score += badgePoints(id)
      if (score > 0) rows.push({ user_id: p.id, username: p.username ?? '', score })
    }

    rows.sort((a, b) => b.score - a.score || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0))
    return rows
  },
  ['achievement-points-rows'],
  { revalidate: 120, tags: ['achievement-points'] },
)

export async function getAchievementPointsBoard(userId: string): Promise<AchievementPointsBoard> {
  const rows = await getCachedAchievementRows()
  const top = rows.slice(0, 50)
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : null, myRank: myIdx >= 0 ? myIdx + 1 : null }
}

/** One player's achievement-points score (same union(stored, derived) badge
 *  scoring as the board, scoped to a single user). Cached per user (keyed by
 *  the userId argument) so the hot fishing-page load isn't 7 queries per view;
 *  it only gates cosmetic color unlocks, so <=60s staleness is fine. */
const getCachedUserPoints = unstable_cache(
  async (userId: string): Promise<number> => {
    const admin = createAdminClient()
    const [{ data: profile }, { data: raidRows }, { data: crewRows }, { count: voyageCount }, { count: collectionCount }, { data: rodRows }, { count: goldenCount }, { data: exchangeRows }, { data: rapportRows }, { data: homeRow }, { data: isleRows }, { data: digRows }] = await Promise.all([
      admin.from('profiles').select(`unlocked_badges, ${BADGE_PROFILE_COLUMNS}`).eq('id', userId).single(),
      admin.from('raid_completions').select('raid_id, elapsed_ms').eq('user_id', userId),
      admin.from('user_crew').select('xp, died_at, effects, cards(slug)').eq('user_id', userId),
      admin.from('daily_voyages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'revealed'),
      admin.from('fish_collection').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      admin.from('rod_inventory').select('rod_tier').eq('user_id', userId),
      admin.from('shiny_catches').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      admin.from('exchange_bets').select('status, stake, payout').eq('user_id', userId),
      admin.from('sea_rapport').select('points, gifts_given').eq('user_id', userId),
      admin.from('homesteads').select('house, name, owned, pinned').eq('user_id', userId).maybeSingle(),
      admin.from('sea_discoveries').select('isle_id').eq('user_id', userId),
      admin.from('sea_digs').select('site_id').eq('user_id', userId).not('dug_at', 'is', null),
    ])
    if (!profile) return 0
    const p = profile as unknown as BadgeProfileFields & { unlocked_badges: string[] | null }
    const crew = (crewRows ?? []) as unknown as Array<{ xp: number | null; died_at: string | null; effects: string[] | null; cards: { slug: string | null } | null }>
    const derived = earnedBadgeIds(p, {
      raids: (raidRows ?? []) as Array<{ raid_id: string; elapsed_ms: number | null }>,
      crew: crew.map(c => ({ xp: c.xp, died_at: c.died_at, effects: c.effects ?? null, slug: c.cards?.slug ?? null })),
      voyageCount: voyageCount ?? 0,
      // Lifetime species (prestige-proof), with the live count as a floor.
      collectionCount: Math.max(collectionCount ?? 0, Number(p.lifetime_species_count ?? 0)),
      rodTiers: (rodRows ?? []).map(r => r.rod_tier),
      goldenCount: goldenCount ?? 0,
      exchange: exchangeStatsFrom((exchangeRows ?? []) as ExchangePositionRow[]),
      sea: seaStatsFrom({
        rapport: (rapportRows ?? []) as RapportRow[],
        homestead: (homeRow ?? null) as HomesteadRow,
        isles: ((isleRows ?? []) as { isle_id: string }[]).map(r => r.isle_id),
        digs: (digRows ?? []).length,
      }),
    })
    const all = new Set<string>([...(p.unlocked_badges ?? []), ...derived])
    let score = 0
    for (const id of all) score += badgePoints(id)
    return score
  },
  ['achievement-points-user'],
  { revalidate: 60, tags: ['achievement-points'] },
)

export async function getUserAchievementPoints(userId: string): Promise<number> {
  return getCachedUserPoints(userId)
}
