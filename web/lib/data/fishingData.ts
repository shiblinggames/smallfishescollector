// ── FISHING'S DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// Every read and write the cast and the reel make, as NAMED operations
// ("take one bait", "claim this cast", "add to the hold") instead of table
// queries written inline in the actions. The actions say what they need; this
// file says how Supabase does it. An offline build implements the same
// FishingData against a local save and the actions do not change.
//
// The Supabase implementation below is the old inline code moved verbatim:
// the same columns, the same filters, the same one-shot conditions. Where a
// write is conditional (the cast claim, the reroll claim, the snag's bait),
// the condition IS the guard against a doubled request, and it is kept exactly.
//
// Not here, because they are shared across systems and already have their own
// home: balances and owned lists (lib/wallet), badges (lib/badgeGrant),
// anomaly flags (lib/anomaly), the daily challenge set (lib/dailyChallenges).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { captainData, type CaptainData, type Db, type Row } from './common'
import type { PendingCast } from '@/lib/fishingRules'
import type { ChallengeOverride } from '@/lib/dailyChallenges'
import { grant, spend, arrayAdd } from '@/lib/wallet'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { flagAnomaly } from '@/lib/anomaly'

/** A species row as the reel reads it (the whole row, typed where it is used). */
export type SpeciesRow = Row & { id: number; name: string; habitat: string; catch_difficulty: number; catch_score: number; bite_rarity: number; sell_value: number; length_min_in?: number | null; length_max_in?: number | null }
export type CastCandidateRow = { id: number; catch_difficulty: number; catch_score: number; bite_rarity: number; sell_value: number }
export type DailyRow = { p1: number | null; p2: number | null; p3: number | null; p4: number | null; claimed_1: boolean | null; claimed_2: boolean | null; claimed_3: boolean | null; claimed_4: boolean | null; fishing_level_snapshot: number | null }

export interface FishingData extends CaptainData {
  // ── What the cast and the reel share with every system ──
  /** Add to a balance in place (never written back from a stale read); the new balance. */
  grant(uid: string, col: 'doubloons' | 'gems' | 'gauntlet_fathoms', n: number): Promise<number>
  /** Take from a balance in place, only if it covers it: the new balance, or
   *  null (nothing taken). The result is the guard: two spends fired together
   *  cannot both pay with one balance. */
  spend(uid: string, col: 'doubloons' | 'gems' | 'gauntlet_fathoms', n: number): Promise<number | null>
  /** Add one value to an owned list (pets, colors, boats, hats, badges), once.
   *  True if it was not there before. */
  addToList(uid: string, col: string, value: string): Promise<boolean>
  /** The captain's achievement points (the gate on a few boats). */
  achievementPoints(uid: string): Promise<number>
  /** Award a badge (no-op if already held). */
  grantBadge(uid: string, badgeId: string): Promise<void>
  /** Note something implausible for review. Never blocks play. */
  flagAnomaly(uid: string, kind: string, severity: number, detail: Record<string, unknown>): Promise<void>
  /** An admin's pinned challenge set for a day, or null. */
  challengeOverride(date: string): Promise<ChallengeOverride | null>

  // ── The cast ──
  /** The live cast token, or null. */
  pendingCast(uid: string): Promise<PendingCast | null>
  /** Spend THIS cast (matched on its castAt, so a newer cast is never spent by
   *  an older reel). True for exactly one of any concurrent claims. */
  claimCast(uid: string, castAt: number): Promise<boolean>
  /** Clear a deferred wormhole credit. True only for the request that cleared it. */
  claimPendingReroll(uid: string): Promise<boolean>

  // ── Bait ──
  /** How many of this bait the captain holds, or null for none on record. */
  baitCount(uid: string, bait: string): Promise<number | null>
  /** Set the bait count; with `ifWas`, only if it still reads that (a snag
   *  racing a cast must not double-charge). */
  setBaitCount(uid: string, bait: string, qty: number, ifWas?: number): Promise<void>

  // ── The water ──
  /** Every species that lives in this habitat, with what the roll reads. */
  candidates(habitat: string): Promise<CastCandidateRow[]>
  /** One species, whole row, or null. */
  species(fishId: number): Promise<SpeciesRow | null>
  /** The ids of every species outside the Ancient Deep. */
  nonAncientSpeciesIds(): Promise<number[]>

  // ── The hold ──
  /** Fish in the hold, all species. */
  holdCount(uid: string): Promise<number>
  /** How many of this species are in the hold, or null for none on record. */
  holdQty(uid: string, fishId: number): Promise<number | null>
  /** Put `qty` of a species in the hold, given what `holdQty` read. */
  addToHold(uid: string, fishId: number, qty: number, had: number | null): Promise<void>

  // ── The log ──
  /** This cycle's log row for a species, or null if never logged this cycle. */
  collectionRow(uid: string, fishId: number): Promise<{ catch_count: number; is_golden: boolean | null } | null>
  /** Log one catch of a species this cycle (a first sighting inserts). */
  logCatch(uid: string, fishId: number, had: { catch_count: number } | null, at: string): Promise<void>
  /** Species logged this cycle. */
  collectionIds(uid: string): Promise<number[]>
  /** The career log (never deleted): one more catch of this species. */
  bumpLifetime(uid: string, fishId: number, at: string): Promise<void>
  /** Personal best length for a species, or null. */
  personalBest(uid: string, fishId: number): Promise<number | null>
  setPersonalBest(uid: string, fishId: number, sizeIn: number, at: string): Promise<void>
  /** Hold a shiny as its own trophy row; returns its id. */
  addShiny(uid: string, fishId: number, sizeIn: number | null): Promise<number | undefined>

  // ── The day ──
  dailyProgress(uid: string, date: string): Promise<DailyRow | null>
  saveDailyProgress(uid: string, date: string, p: number[], snapshot: number): Promise<void>

  // ── The sea ──
  /** Regulars who asked for this species and are still waiting. */
  folkWanting(uid: string, fishId: number): Promise<string[]>
  /** Claim a one-winner contest. True only for the first claimant ever. */
  claimContest(contestId: string, uid: string, prizeCode: string): Promise<boolean>

  // ── More of the captain ──
  /** Turn a boolean column on, only where it is still off. True only for the
   *  request that turned it on (the one-time claims and purchases). */
  flagOn(uid: string, col: string): Promise<boolean>
  /** Move the fishing-level reward watermark from `from` (as read) to `to`.
   *  True only for the request that moved it: that is the claim. */
  moveLevelWatermark(uid: string, from: number | null, to: number): Promise<boolean>
  /** Raise the hold tier to at least `tier`; never lowers one bought meanwhile. */
  raiseHoldTier(uid: string, tier: number): Promise<void>
  /** How many captains have more of `field` than `value` (the leaderboard nudge). */
  countAbove(field: string, value: number): Promise<number | null>
  /** Rod tiers owned. */
  rodTiers(uid: string): Promise<number[]>
  /** Spend a CRATE cast (only the token; the streak write clears the rest). */
  claimCrateCast(uid: string, castAt: number): Promise<boolean>

  // ── More of the hold and the log ──
  /** Take `qty` of a species out of the hold, only if the stack still reads
   *  what was seen (a sale landing in between makes this refuse, not dupe). */
  takeFromHold(uid: string, fishId: number, qty: number): Promise<boolean>
  /** The hold with each species' row, stacks of at least one. */
  holdWithSpecies(uid: string): Promise<Row[]>
  /** Ids of every species in a habitat. */
  speciesIdsIn(habitat: string): Promise<number[]>
  /** How many of these species are logged this cycle. */
  loggedCount(uid: string, fishIds: number[]): Promise<number>
  /** Which of these species are mounted golden. */
  goldenIds(uid: string, fishIds: number[]): Promise<number[]>
  /** Clear these species from this cycle's log (a prestige; the career log stays). */
  clearLog(uid: string, fishIds: number[]): Promise<void>
  /** Mount a species golden on the wall. */
  setGolden(uid: string, fishId: number): Promise<void>

  // ── Golden trophies ──
  /** The oldest golden fish still waiting on a sell-or-mount choice. */
  oldestHeldShiny(uid: string): Promise<{ id: number; fish_id: number; size_in: number | null; name: string | null } | null>
  /** One trophy of this captain's, with its species' name and value. */
  shiny(uid: string, shinyId: number): Promise<{ id: number; status: string; fish_id: number; fish_species: { name: string; sell_value: number } | null } | null>
  /** Resolve a held trophy (sold or mounted), only while it is still held.
   *  `failed` is a write error; `claimed` is whether this call resolved it. */
  resolveShiny(shinyId: number, patch: Row): Promise<{ failed: boolean; claimed: boolean }>
}

/** FishingData over Supabase, with the service-role client. */
export function fishingData(admin: Db): FishingData {
  return {
    ...captainData(admin),

    async grant(uid, col, n) {
      return grant(admin as any, uid, col, n)
    },
    async spend(uid, col, n) {
      return spend(admin as any, uid, col, n)
    },
    async addToList(uid, col, value) {
      return arrayAdd(admin as any, uid, col, value)
    },
    async achievementPoints(uid) {
      // Imported when asked: the live board pulls in Next's cache, which only
      // the web store should ever load.
      return (await import('@/lib/achievementPoints')).getUserAchievementPoints(uid)
    },
    async grantBadge(uid, badgeId) {
      await grantBadgeDirect(uid, badgeId)
    },
    async flagAnomaly(uid, kind, severity, detail) {
      await flagAnomaly(admin as any, uid, kind, severity, detail)
    },
    async challengeOverride(date) {
      const { data } = await admin.from('challenge_overrides').select('tier1, tier2, tier3').eq('date', date).maybeSingle()
      return (data as ChallengeOverride | null) ?? null
    },

    async pendingCast(uid) {
      const { data } = await admin.from('profiles').select('pending_cast').eq('id', uid).single()
      return (data?.pending_cast as PendingCast | null) ?? null
    },
    async claimCast(uid, castAt) {
      const { data } = await admin
        .from('profiles')
        .update({ pending_cast: null, catch_pending: false })
        .eq('id', uid)
        .eq('pending_cast->>castAt', String(castAt))
        .select('id')
        .maybeSingle()
      return !!data
    },
    async claimPendingReroll(uid) {
      const { data } = await admin
        .from('profiles').update({ pending_reroll: null })
        .eq('id', uid).not('pending_reroll', 'is', null).select('id')
      return !!data && data.length > 0
    },

    async baitCount(uid, bait) {
      const { data } = await admin.from('bait_inventory').select('quantity').eq('user_id', uid).eq('bait_type', bait).single()
      return data ? (data.quantity as number) : null
    },
    async setBaitCount(uid, bait, qty, ifWas) {
      let q = admin.from('bait_inventory').update({ quantity: qty }).eq('user_id', uid).eq('bait_type', bait)
      if (ifWas !== undefined) q = q.eq('quantity', ifWas)
      await q
    },

    async candidates(habitat) {
      const { data } = await admin.from('fish_species').select('id, catch_difficulty, catch_score, bite_rarity, sell_value').eq('habitat', habitat)
      return (data ?? []) as CastCandidateRow[]
    },
    async species(fishId) {
      const { data } = await admin.from('fish_species').select('*').eq('id', fishId).single()
      return (data as SpeciesRow | null) ?? null
    },
    async nonAncientSpeciesIds() {
      const { data } = await admin.from('fish_species').select('id').neq('habitat', 'ancient_deep')
      return ((data ?? []) as { id: number }[]).map(s => s.id)
    },

    async holdCount(uid) {
      const { data } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid)
      return ((data ?? []) as { quantity: number | null }[]).reduce((n, r) => n + (r.quantity ?? 0), 0)
    },
    async holdQty(uid, fishId) {
      const { data } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid).eq('fish_id', fishId).single()
      return data ? (data.quantity as number) : null
    },
    async addToHold(uid, fishId, qty, had) {
      if (had != null) {
        await admin.from('fish_inventory').update({ quantity: had + qty }).eq('user_id', uid).eq('fish_id', fishId)
      } else {
        await admin.from('fish_inventory').insert({ user_id: uid, fish_id: fishId, quantity: qty })
      }
    },

    async collectionRow(uid, fishId) {
      const { data } = await admin.from('fish_collection').select('catch_count, is_golden').eq('user_id', uid).eq('fish_id', fishId).maybeSingle()
      return (data as { catch_count: number; is_golden: boolean | null } | null) ?? null
    },
    async logCatch(uid, fishId, had, at) {
      if (!had) {
        await admin.from('fish_collection').insert({ user_id: uid, fish_id: fishId, catch_count: 1 })
        return
      }
      await admin.from('fish_collection').update({ catch_count: had.catch_count + 1, last_caught_at: at }).eq('user_id', uid).eq('fish_id', fishId)
    },
    async collectionIds(uid) {
      const { data } = await admin.from('fish_collection').select('fish_id').eq('user_id', uid)
      return ((data ?? []) as { fish_id: number }[]).map(r => r.fish_id)
    },
    async bumpLifetime(uid, fishId, at) {
      await admin.rpc('bump_fish_lifetime', { uid, fid: fishId, n: 1, at })
    },
    async personalBest(uid, fishId) {
      const { data } = await admin.from('fish_personal_bests').select('best_length_in').eq('user_id', uid).eq('fish_id', fishId).maybeSingle()
      return data ? Number(data.best_length_in) : null
    },
    async setPersonalBest(uid, fishId, sizeIn, at) {
      await admin.from('fish_personal_bests').upsert(
        { user_id: uid, fish_id: fishId, best_length_in: sizeIn, caught_at: at },
        { onConflict: 'user_id,fish_id' },
      )
    },
    async addShiny(uid, fishId, sizeIn) {
      const { data } = await admin.from('shiny_catches').insert({ user_id: uid, fish_id: fishId, size_in: sizeIn, status: 'hold' }).select('id').single()
      return data?.id as number | undefined
    },

    async dailyProgress(uid, date) {
      const { data } = await admin.from('daily_challenge_progress')
        .select('p1, p2, p3, p4, claimed_1, claimed_2, claimed_3, claimed_4, fishing_level_snapshot')
        .eq('user_id', uid).eq('date', date).maybeSingle()
      return (data as DailyRow | null) ?? null
    },
    async saveDailyProgress(uid, date, p, snapshot) {
      await admin.from('daily_challenge_progress').upsert(
        {
          user_id: uid, date,
          p1: p[0], p2: p[1], p3: p[2],
          // Only written when the Master challenge is in play: undefined would
          // blank an existing count on the upsert.
          ...(p.length > 3 ? { p4: p[3] } : {}),
          fishing_level_snapshot: snapshot,
        },
        { onConflict: 'user_id,date' },
      )
    },

    async folkWanting(uid, fishId) {
      const { data } = await admin.from('sea_rapport').select('folk_id').eq('user_id', uid).eq('want_fish_id', fishId)
      return ((data ?? []) as { folk_id: string }[]).map(r => r.folk_id)
    },
    async claimContest(contestId, uid, prizeCode) {
      const { data } = await admin.from('contests').insert({ contest_id: contestId, winner_user_id: uid, prize_code: prizeCode }).select('contest_id').maybeSingle()
      return !!data
    },
    async flagOn(uid, col) {
      const { data } = await admin.from('profiles').update({ [col]: true }).eq('id', uid).or(`${col}.is.null,${col}.eq.false`).select('id')
      return !!data && data.length > 0
    },
    async moveLevelWatermark(uid, from, to) {
      const { data } = await admin.from('profiles').update({ claimed_fishing_levels: to }).eq('id', uid)
        .or(from == null ? 'claimed_fishing_levels.is.null' : `claimed_fishing_levels.eq.${from}`).select('id')
      return !!data && data.length > 0
    },
    async raiseHoldTier(uid, tier) {
      await admin.from('profiles').update({ fish_hold_tier: tier }).eq('id', uid).or(`fish_hold_tier.is.null,fish_hold_tier.lt.${tier}`)
    },
    async countAbove(field, value) {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).gt(field, value)
      return count
    },
    async rodTiers(uid) {
      const { data } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', uid)
      return ((data ?? []) as { rod_tier: number }[]).map(r => r.rod_tier)
    },
    async claimCrateCast(uid, castAt) {
      const { data } = await admin.from('profiles').update({ pending_cast: null }).eq('id', uid)
        .eq('pending_cast->>castAt', String(castAt)).select('id').maybeSingle()
      return !!data
    },

    async takeFromHold(uid, fishId, qty) {
      const { data: row } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid).eq('fish_id', fishId).maybeSingle()
      if (!row || row.quantity < qty) return false
      const left = row.quantity - qty
      const { data } = left === 0
        ? await admin.from('fish_inventory').delete().eq('user_id', uid).eq('fish_id', fishId).eq('quantity', row.quantity).select('fish_id')
        : await admin.from('fish_inventory').update({ quantity: left }).eq('user_id', uid).eq('fish_id', fishId).eq('quantity', row.quantity).select('fish_id')
      return !!data && data.length > 0
    },
    async holdWithSpecies(uid) {
      const { data } = await admin.from('fish_inventory').select('fish_id, quantity, fish_species(*)').eq('user_id', uid).gt('quantity', 0)
      return (data ?? []) as Row[]
    },
    async speciesIdsIn(habitat) {
      const { data } = await admin.from('fish_species').select('id').eq('habitat', habitat)
      return ((data ?? []) as { id: number }[]).map(f => f.id)
    },
    async loggedCount(uid, fishIds) {
      const { count } = await admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', uid).in('fish_id', fishIds)
      return count ?? 0
    },
    async goldenIds(uid, fishIds) {
      const { data } = await admin.from('fish_collection').select('fish_id').eq('user_id', uid).in('fish_id', fishIds).eq('is_golden', true)
      return ((data ?? []) as { fish_id: number }[]).map(r => r.fish_id)
    },
    async clearLog(uid, fishIds) {
      if (fishIds.length > 0) await admin.from('fish_collection').delete().eq('user_id', uid).in('fish_id', fishIds)
    },
    async setGolden(uid, fishId) {
      await admin.from('fish_collection').update({ is_golden: true }).eq('user_id', uid).eq('fish_id', fishId)
    },

    async oldestHeldShiny(uid) {
      const { data } = await admin.from('shiny_catches').select('id, fish_id, size_in, fish_species(name)')
        .eq('user_id', uid).eq('status', 'hold')
        // OLDEST FIRST: a backlog is worked through in the order it was caught.
        .order('caught_at', { ascending: true }).limit(1).maybeSingle()
      const r = data as unknown as { id: number; fish_id: number; size_in: number | null; fish_species: { name: string } | null } | null
      return r ? { id: r.id, fish_id: r.fish_id, size_in: r.size_in, name: r.fish_species?.name ?? null } : null
    },
    async shiny(uid, shinyId) {
      const { data } = await admin.from('shiny_catches').select('id, status, fish_id, fish_species(name, sell_value)').eq('id', shinyId).eq('user_id', uid).single()
      return (data as unknown as { id: number; status: string; fish_id: number; fish_species: { name: string; sell_value: number } | null } | null) ?? null
    },
    async resolveShiny(shinyId, patch) {
      const { data, error } = await admin.from('shiny_catches').update(patch).eq('id', shinyId).eq('status', 'hold').select('id')
      return { failed: !!error, claimed: !!data && data.length > 0 }
    },
  }
}
