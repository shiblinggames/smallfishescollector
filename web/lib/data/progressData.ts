// ── PROGRESSION'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// Renown, badges (derived, claimed, worn), the cosmetic unlock banner, the
// first-run welcome, the member's daily pack and the homestead. Built on the
// harbour's store (the profile, the purse, the ledger, the rods, the regulars,
// the isles and digs) plus the badge signals, the badge-reward claim and the
// homestead row.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - claimBadgeReward pays a badge once, and only an unlocked one, moving both
//     currencies with the mark;
//   - buildHouse raises the house only from the tier priced against;
//   - the welcome, the daily pack and a respec token each go through
//     updateProfileIf or stampIfNew, so a double tap pays once.

import type { Db, Row } from './common'
import { harbourData, type HarbourData } from './harbourData'
import { BADGE_PROFILE_COLUMNS, type ExchangePositionRow, type RapportRow as BadgeRapportRow, type HomesteadRow } from '@/lib/badgeConditions'

/** Everything a badge condition reads. */
export type BadgeSignals = {
  profile: Row | null
  raids: { raid_id: string; elapsed_ms: number | null }[]
  crew: { xp: number | null; died_at: string | null; effects: string[] | null; slug: string | null }[]
  voyageCount: number
  collectionCount: number
  rodTiers: number[]
  goldenCount: number
  exchange: ExchangePositionRow[]
  rapport: BadgeRapportRow[]
  homestead: HomesteadRow
  isles: string[]
  digs: number
}

/** What claiming a badge's reward came to, as claim_badge_reward reports it. */
export type BadgeClaimRow = { new_doubloons: number; new_gems: number; claimed: string[]; granted: boolean }

/** The homestead row as stored. */
export type HomesteadDbRow = { house: number; name: string | null; furniture: unknown; owned: string[] | null; pinned: string[] | null }

export interface ProgressData extends HarbourData {
  /** The profile's badge columns (plus `unlocked_badges`, `badge_unlocked_at`)
   *  and every join a condition reads. */
  badgeSignals(uid: string): Promise<BadgeSignals>
  /** Pay a badge's reward once, only if it is unlocked and unclaimed. */
  claimBadgeReward(uid: string, badgeId: string, amount: number, gems: number): Promise<BadgeClaimRow | null>

  // ── The homestead ──
  /** The row, or null with none. Throws on a failed read: a failed read must
   *  never look like an empty homestead (it would be priced as tier 0). */
  homestead(uid: string): Promise<HomesteadDbRow | null>
  /** Make the row if there is none. */
  ensureHomestead(uid: string): Promise<void>
  /** Raise the house from `from` to `to`, only if it is still `from`. */
  buildHouse(uid: string, from: number, to: number, at: string): Promise<boolean>
  /** Write these homestead fields; true if the row was written. */
  updateHomestead(uid: string, patch: Row): Promise<boolean>
  /** Write these fields, making the row if there is none. */
  upsertHomestead(uid: string, patch: Row): Promise<void>

  // ── The name ──
  /** Set the username (and mark it changed): 'taken' if another captain has it. */
  setUsername(uid: string, name: string): Promise<'ok' | 'taken' | 'error'>
  /** Is this name free (case-insensitive)? Offline there is nobody else. */
  usernameFree(name: string): Promise<boolean>
  /** Up to six usernames starting with this (lower-case) prefix. */
  searchUsernames(prefix: string): Promise<string[]>
}

/** ProgressData over Supabase. */
export function progressData(admin: Db): ProgressData {
  return {
    ...harbourData(admin),

    async badgeSignals(uid) {
      const [{ data: profile }, { data: raidRows }, { data: crewRows }, { count: voyageCount }, { count: collectionCount }, { data: rodRows }, { count: goldenCount }, { data: exchangeRows }, { data: rapportRows }, { data: homeRow }, { data: isleRows }, { data: digRows }] = await Promise.all([
        admin.from('profiles').select(`unlocked_badges, badge_unlocked_at, ${BADGE_PROFILE_COLUMNS}`).eq('id', uid).single(),
        admin.from('raid_completions').select('raid_id, elapsed_ms').eq('user_id', uid),
        admin.from('user_crew').select('xp, died_at, effects, cards(slug)').eq('user_id', uid),
        admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'revealed'),
        admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        admin.from('rod_inventory').select('rod_tier').eq('user_id', uid),
        admin.from('shiny_catches').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        admin.from('exchange_bets').select('status, stake, payout').eq('user_id', uid),
        admin.from('sea_rapport').select('points, gifts_given').eq('user_id', uid),
        admin.from('homesteads').select('house, name, owned, pinned').eq('user_id', uid).maybeSingle(),
        admin.from('sea_discoveries').select('isle_id').eq('user_id', uid),
        admin.from('sea_digs').select('site_id').eq('user_id', uid).not('dug_at', 'is', null),
      ])
      // Supabase types cards as an array though it is a to-one object at runtime.
      const crew = (crewRows ?? []) as unknown as { xp: number | null; died_at: string | null; effects: string[] | null; cards: { slug: string | null } | null }[]
      return {
        profile: (profile as Row | null) ?? null,
        raids: (raidRows ?? []) as { raid_id: string; elapsed_ms: number | null }[],
        crew: crew.map(c => ({ xp: c.xp, died_at: c.died_at, effects: c.effects ?? null, slug: c.cards?.slug ?? null })),
        voyageCount: voyageCount ?? 0,
        collectionCount: collectionCount ?? 0,
        rodTiers: ((rodRows ?? []) as { rod_tier: number }[]).map(r => r.rod_tier),
        goldenCount: goldenCount ?? 0,
        exchange: (exchangeRows ?? []) as ExchangePositionRow[],
        rapport: (rapportRows ?? []) as BadgeRapportRow[],
        homestead: (homeRow ?? null) as HomesteadRow,
        isles: ((isleRows ?? []) as { isle_id: string }[]).map(r => r.isle_id),
        digs: (digRows ?? []).length,
      }
    },
    async claimBadgeReward(uid, badgeId, amount, gems) {
      const { data, error } = await admin.rpc('claim_badge_reward', { p_user: uid, p_badge: badgeId, p_amount: amount, p_gems: gems })
      if (error) return null
      return ((Array.isArray(data) ? data[0] : data) as BadgeClaimRow | undefined) ?? null
    },

    async homestead(uid) {
      const { data, error } = await admin.from('homesteads').select('house, name, furniture, owned, pinned').eq('user_id', uid).maybeSingle()
      if (error) throw new Error(`homestead load: ${error.message ?? 'read failed'}`)
      return (data as HomesteadDbRow | null) ?? null
    },
    async ensureHomestead(uid) {
      await admin.from('homesteads').upsert({ user_id: uid }, { onConflict: 'user_id', ignoreDuplicates: true }).then(() => {}, () => {})
    },
    async buildHouse(uid, from, to, at) {
      const { data } = await admin.from('homesteads').update({ house: to, updated_at: at }).eq('user_id', uid).eq('house', from).select('user_id')
      return !!data?.length
    },
    async updateHomestead(uid, patch) {
      const { data } = await admin.from('homesteads').update(patch).eq('user_id', uid).select('user_id')
      return !!data?.length
    },
    async upsertHomestead(uid, patch) {
      await admin.from('homesteads').upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' })
    },

    async setUsername(uid, name) {
      const { error } = await admin.from('profiles').update({ username: name, username_changed: true }).eq('id', uid)
      if (!error) return 'ok'
      return error.code === '23505' ? 'taken' : 'error'
    },
    async usernameFree(name) {
      const { data } = await admin.from('profiles').select('id').ilike('username', name).single()
      return !data
    },
    async searchUsernames(prefix) {
      const { data } = await admin.from('profiles').select('username').ilike('username', `${prefix}%`).limit(6)
      return (data ?? []).map(p => p.username as string)
    },
  }
}
