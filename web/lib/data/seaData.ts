// ── THE SEA'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// The things on the chart that are not fishing, selling or raids: the nine
// regulars and their rapport, Finn and his jobs, bottles and digs, the isles,
// the portal, the free recall, and Kip's question. Built on the daily loop's
// store (the profile, the purse, the ledger) plus badges and the rods carried.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - claimChat claims a regular's day only if today's chat has not happened;
//   - settleWant settles a job only while it is still that fish;
//   - takeOneFish takes the last fish only once;
//   - addRod is the lock on a regular's rod (a rod is owned once);
//   - addDigBearing and addDiscovery are unique per site and isle; claimDig
//     digs a site once;
//   - stampRecall lands only when the last recall is older than its cycle.

import type { Db, Row } from './common'
import { dailyData, type DailyData } from './dailyData'
import { grantBadgeDirect } from '@/lib/badgeGrant'

export type RapportRow = {
  folk_id: string
  points: number
  seen_lines: string[] | null
  last_chat_on: string | null
  gifts_given: number
  want_fish_id: number | null
  want_asked_at: string | null
}

/** An insert that is unique per captain: it took, it was already there, or it failed. */
export type InsertOutcome = 'ok' | 'dup' | 'error'

export interface SeaData extends DailyData {
  grantBadge(uid: string, badgeId: string): Promise<void>
  /** Every rod tier this captain owns. */
  rodTiers(uid: string): Promise<number[]>

  // ── The regulars ──
  rapportRows(uid: string): Promise<RapportRow[]>
  rapportRow(uid: string, folkId: string): Promise<RapportRow | null>
  /** Make the row if there is none (safe every visit). */
  ensureRapport(uid: string, folkId: string): Promise<void>
  /** Write today's chat only if the last one was not today. True for one caller. */
  claimChat(uid: string, folkId: string, day: string, patch: { points: number; seen_lines: string[] }): Promise<boolean>
  /** Set the job asked for. True if the row was written. */
  setWant(uid: string, folkId: string, patch: { want_fish_id: number; want_asked_at: string; seen_lines: string[] }): Promise<boolean>
  /** Settle the job only while it is still `fishId`. True for one caller. */
  settleWant(uid: string, folkId: string, fishId: number, patch: { points: number; gifts_given: number }): Promise<boolean>
  /** Put a settled job back exactly as it was (the fish could not be taken). */
  restoreRapport(uid: string, folkId: string, patch: Partial<RapportRow>): Promise<void>
  /** How many of each fish the hold has. */
  heldQty(uid: string, fishIds: number[]): Promise<Map<number, number>>
  /** When each fish was last landed (ISO), from the catch log. */
  lastCaught(uid: string, fishIds: number[]): Promise<Map<number, string>>
  /** Take one fish from the hold, only if the count is still what was read. */
  takeOneFish(uid: string, fishId: number): Promise<boolean>
  /** Add a rod; false if it is already carried (the lock on a once-ever rod). */
  addRod(uid: string, tier: number): Promise<boolean>
  removeRod(uid: string, tier: number): Promise<void>

  // ── Finn ──
  /** Lifetime fish landed, all species. */
  lifetimeCatches(uid: string): Promise<number>
  /** Lifetime fish landed in one band and/or at or above one rarity. */
  catchesWhere(uid: string, opts: { zone?: string; minRarity?: number }): Promise<number>

  // ── Bottles and digs ──
  digRows(uid: string): Promise<{ site_id: string; dug_at: string | null }[]>
  addDigBearing(uid: string, siteId: string): Promise<InsertOutcome>
  /** Dig a site once. True for one caller. */
  claimDig(uid: string, siteId: string, at: string): Promise<boolean>

  // ── The isles ──
  discoveries(uid: string): Promise<string[]>
  addDiscovery(uid: string, isleId: string): Promise<InsertOutcome>
  /** Every furnishing ever acquired, or null with no homestead yet. */
  homesteadOwned(uid: string): Promise<string[] | null>
  setHomesteadOwned(uid: string, owned: string[]): Promise<void>

  // ── The recall ──
  /** Stamp `col` with `at` only if it is empty or older than `cutoff`. */
  stampRecall(uid: string, col: string, at: string, cutoff: string): Promise<boolean>
}

/** SeaData over Supabase. */
export function seaData(admin: Db): SeaData {
  return {
    ...dailyData(admin),
    async grantBadge(uid, badgeId) { await grantBadgeDirect(uid, badgeId) },
    async rodTiers(uid) {
      const { data } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', uid)
      return ((data ?? []) as { rod_tier: number }[]).map(r => r.rod_tier)
    },

    async rapportRows(uid) {
      const { data } = await admin.from('sea_rapport')
        .select('folk_id, points, seen_lines, last_chat_on, gifts_given, want_fish_id, want_asked_at')
        .eq('user_id', uid)
      return (data ?? []) as RapportRow[]
    },
    async rapportRow(uid, folkId) {
      const { data } = await admin.from('sea_rapport')
        .select('folk_id, points, seen_lines, last_chat_on, gifts_given, want_fish_id, want_asked_at')
        .eq('user_id', uid).eq('folk_id', folkId).maybeSingle()
      return (data as RapportRow | null) ?? null
    },
    async ensureRapport(uid, folkId) {
      // Inserting with ignoreDuplicates makes this safe to run every visit.
      await admin.from('sea_rapport').upsert({ user_id: uid, folk_id: folkId }, { onConflict: 'user_id,folk_id', ignoreDuplicates: true })
    },
    async claimChat(uid, folkId, day, patch) {
      const { data } = await admin.from('sea_rapport')
        .update({ ...patch, last_chat_on: day })
        .eq('user_id', uid).eq('folk_id', folkId)
        .or(`last_chat_on.is.null,last_chat_on.neq.${day}`)
        .select('points')
      return !!data && data.length > 0
    },
    async setWant(uid, folkId, patch) {
      const { data } = await admin.from('sea_rapport').update(patch).eq('user_id', uid).eq('folk_id', folkId).select('want_fish_id')
      return !!data && data.length > 0
    },
    async settleWant(uid, folkId, fishId, patch) {
      const { data } = await admin.from('sea_rapport')
        .update({ ...patch, want_fish_id: null, want_asked_at: null })
        .eq('user_id', uid).eq('folk_id', folkId).eq('want_fish_id', fishId)
        .select('points')
      return !!data && data.length > 0
    },
    async restoreRapport(uid, folkId, patch) {
      await admin.from('sea_rapport').update(patch).eq('user_id', uid).eq('folk_id', folkId)
    },
    async heldQty(uid, fishIds) {
      const { data } = await admin.from('fish_inventory').select('fish_id, quantity').eq('user_id', uid).in('fish_id', fishIds)
      return new Map((data ?? []).map(x => [x.fish_id as number, Number(x.quantity ?? 0)]))
    },
    async lastCaught(uid, fishIds) {
      const { data } = await admin.from('fish_collection').select('fish_id, last_caught_at').eq('user_id', uid).in('fish_id', fishIds)
      return new Map((data ?? []).filter(x => x.last_caught_at).map(x => [x.fish_id as number, String(x.last_caught_at)]))
    },
    async takeOneFish(uid, fishId) {
      // Optimistic: the write only matches while the quantity is still what was
      // read, so two deliveries cannot spend the same last fish.
      const { data: held } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid).eq('fish_id', fishId).maybeSingle()
      const have = Number(held?.quantity ?? 0)
      if (have < 1) return false
      if (have === 1) {
        const { data: gone } = await admin.from('fish_inventory').delete().eq('user_id', uid).eq('fish_id', fishId).eq('quantity', 1).select('fish_id')
        return !!gone && gone.length > 0
      }
      const { data: cut } = await admin.from('fish_inventory').update({ quantity: have - 1 }).eq('user_id', uid).eq('fish_id', fishId).eq('quantity', have).select('fish_id')
      return !!cut && cut.length > 0
    },
    async addRod(uid, tier) {
      // Keyed on (user_id, rod_tier): the insert IS the lock.
      const { error } = await admin.from('rod_inventory').insert({ user_id: uid, rod_tier: tier })
      return !error
    },
    async removeRod(uid, tier) {
      await admin.from('rod_inventory').delete().eq('user_id', uid).eq('rod_tier', tier)
    },

    async lifetimeCatches(uid) {
      const { data } = await admin.from('fish_lifetime').select('catches').eq('user_id', uid)
      return (data ?? []).reduce((a, r) => a + ((r as { catches: number | null }).catches ?? 0), 0)
    },
    async catchesWhere(uid, opts) {
      if (!opts.zone && !opts.minRarity) return 0
      let q = admin.from('fish_species').select('id')
      if (opts.zone) q = q.eq('habitat', opts.zone)
      if (opts.minRarity) q = q.gte('bite_rarity', opts.minRarity)
      const { data: species } = await q
      const ids = (species ?? []).map(r => (r as { id: number }).id)
      if (!ids.length) return 0
      const { data } = await admin.from('fish_lifetime').select('catches, fish_id').eq('user_id', uid).in('fish_id', ids)
      return (data ?? []).reduce((a, r) => a + ((r as { catches: number | null }).catches ?? 0), 0)
    },

    async digRows(uid) {
      const { data } = await admin.from('sea_digs').select('site_id, dug_at').eq('user_id', uid)
      return (data ?? []) as { site_id: string; dug_at: string | null }[]
    },
    async addDigBearing(uid, siteId) {
      const { error } = await admin.from('sea_digs').insert({ user_id: uid, site_id: siteId })
      return !error ? 'ok' : error.code === '23505' ? 'dup' : 'error'
    },
    async claimDig(uid, siteId, at) {
      const { data } = await admin.from('sea_digs').update({ dug_at: at })
        .eq('user_id', uid).eq('site_id', siteId).is('dug_at', null).select('id')
      return !!data?.length
    },

    async discoveries(uid) {
      const { data } = await admin.from('sea_discoveries').select('isle_id').eq('user_id', uid)
      return ((data ?? []) as { isle_id: string }[]).map(r => r.isle_id)
    },
    async addDiscovery(uid, isleId) {
      const { error } = await admin.from('sea_discoveries').insert({ user_id: uid, isle_id: isleId })
      return !error ? 'ok' : error.code === '23505' ? 'dup' : 'error'
    },
    async homesteadOwned(uid) {
      const { data } = await admin.from('homesteads').select('owned').eq('user_id', uid).maybeSingle()
      return data ? ((data.owned as string[] | null) ?? []) : null
    },
    async setHomesteadOwned(uid, owned) {
      await admin.from('homesteads').upsert({ user_id: uid, owned }, { onConflict: 'user_id' })
    },

    async stampRecall(uid, col, at, cutoff) {
      const { data } = await admin.from('profiles').update({ [col]: at })
        .eq('id', uid).or(`${col}.is.null,${col}.lt.${cutoff}`).select('id')
      return !!data && data.length > 0
    },
  }
}

export type { Row }
