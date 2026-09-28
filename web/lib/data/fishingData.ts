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

import type { createAdminClient } from '@/lib/supabase/admin'
import type { PendingCast } from '@/lib/fishingRules'

type Admin = ReturnType<typeof createAdminClient>
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

/** A species row as the reel reads it (the whole row, typed where it is used). */
export type SpeciesRow = Row & { id: number; name: string; habitat: string; catch_difficulty: number; catch_score: number; bite_rarity: number; sell_value: number; length_min_in?: number | null; length_max_in?: number | null }
export type CastCandidateRow = { id: number; catch_difficulty: number; catch_score: number; bite_rarity: number; sell_value: number }
export type DailyRow = { p1: number | null; p2: number | null; p3: number | null; p4: number | null; claimed_1: boolean | null; claimed_2: boolean | null; claimed_3: boolean | null; claimed_4: boolean | null; fishing_level_snapshot: number | null }

export interface FishingData {
  // ── The captain ──
  /** The profile columns named (a comma list), or null. */
  profile(uid: string, cols: string): Promise<Row | null>
  /** Write these profile fields. */
  updateProfile(uid: string, patch: Row): Promise<void>
  /** Add n to a lifetime counter column. */
  bumpStat(uid: string, col: string, n: number): Promise<void>
  /** Add n to one key of a JSON counter column. */
  bumpJsonCounter(uid: string, col: string, key: string, n: number): Promise<void>
  /** Has this captain ever cleared the raid? */
  hasCleared(uid: string, raidId: string): Promise<boolean>

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
  /** Add bait in place (a saved bait coming back). */
  addBait(uid: string, bait: string, qty: number): Promise<void>

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
  /** Mail one captain. */
  mailTo(uid: string, m: { subject: string; body: string; sender: string }): Promise<void>
}

/** FishingData over Supabase, with the service-role client. */
export function fishingData(admin: Admin): FishingData {
  return {
    async profile(uid, cols) {
      const { data } = await admin.from('profiles').select(cols).eq('id', uid).single()
      return (data as Row | null) ?? null
    },
    async updateProfile(uid, patch) {
      await admin.from('profiles').update(patch).eq('id', uid)
    },
    async bumpStat(uid, col, n) {
      await admin.rpc('bump_profile_stat', { uid, col, n })
    },
    async bumpJsonCounter(uid, col, key, n) {
      await admin.rpc('bump_profile_json_counter', { uid, col, key, n })
    },
    async hasCleared(uid, raidId) {
      const { data } = await admin.from('raid_completions')
        .select('id').eq('user_id', uid).eq('raid_id', raidId).limit(1).maybeSingle()
      return !!data
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
    async addBait(uid, bait, qty) {
      await admin.rpc('upsert_bait', { p_user_id: uid, p_bait_type: bait, p_qty: qty })
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
    async mailTo(uid, m) {
      await admin.from('mail_messages').insert({ subject: m.subject, body: m.body, sender_label: m.sender, target_user_id: uid })
    },
  }
}
