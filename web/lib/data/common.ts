// ── WHAT EVERY SYSTEM READS AND WRITES ABOUT THE CAPTAIN (Steam prep, step 6) ──
//
// The operations every lib/data/<system>Data interface shares: the profile row,
// lifetime counters, the ledger, raid clears and bait. Each system's interface
// EXTENDS CaptainData, and its Supabase implementation spreads captainData(), so
// an offline store implements these once.

import type { SupabaseClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>
/** Any Supabase client: the service-role one, or a request's own. */
export type Db = SupabaseClient<any, any, any>

/**
 * A condition on one profile column, for a write that must only land if the
 * row still reads what was seen. Declarative on purpose: a local store turns it
 * into a WHERE clause (or an if) without knowing anything about PostgREST.
 */
export type ProfileGuard =
  | { col: string; is: null }
  | { col: string; eq: unknown }
  | { col: string; notNull: true }
  | { col: string; contains: unknown[] }

export interface CaptainData {
  /** The profile columns named (a comma list), or null. */
  profile(uid: string, cols: string): Promise<Row | null>
  /** Write these profile fields. */
  updateProfile(uid: string, patch: Row): Promise<void>
  /** Add n to a lifetime counter column. */
  bumpStat(uid: string, col: string, n: number): Promise<void>
  /** Add n to one key of a JSON counter column. */
  bumpJsonCounter(uid: string, col: string, key: string, n: number): Promise<void>
  /** A ledger line for coin (or gems) that moved. */
  ledger(uid: string, amount: number, reason: string, currency?: 'doubloons' | 'gems'): Promise<void>
  /** Has this captain ever cleared the raid? */
  hasCleared(uid: string, raidId: string): Promise<boolean>
  /** Add bait in place. */
  addBait(uid: string, bait: string, qty: number): Promise<void>
  /** Write these fields only if every guard holds. True if the row was written;
   *  that is the one-shot claim for purchases, builds and node clears. */
  updateProfileIf(uid: string, patch: Row, when: ProfileGuard[]): Promise<boolean>
  /** Take coin only if the purse covers it; the new balance, or null. */
  deductDoubloons(uid: string, amount: number): Promise<number | null>
  /** Mail one captain. */
  mailTo(uid: string, m: { subject: string; body: string; sender: string }): Promise<void>
}

export function captainData(admin: Db): CaptainData {
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
    async ledger(uid, amount, reason, currency = 'doubloons') {
      await admin.from(currency === 'gems' ? 'gem_transactions' : 'doubloon_transactions').insert({ user_id: uid, amount, reason })
    },
    async hasCleared(uid, raidId) {
      const { data } = await admin.from('raid_completions')
        .select('id').eq('user_id', uid).eq('raid_id', raidId).limit(1).maybeSingle()
      return !!data
    },
    async addBait(uid, bait, qty) {
      await admin.rpc('upsert_bait', { p_user_id: uid, p_bait_type: bait, p_qty: qty })
    },
    async updateProfileIf(uid, patch, when) {
      let q = admin.from('profiles').update(patch).eq('id', uid)
      for (const g of when) {
        if ('is' in g) q = q.is(g.col, null)
        else if ('eq' in g) q = q.eq(g.col, g.eq)
        else if ('notNull' in g) q = q.not(g.col, 'is', null)
        else q = q.contains(g.col, g.contains)
      }
      const { data } = await q.select('id')
      return !!data && data.length > 0
    },
    async deductDoubloons(uid, amount) {
      // deduct_doubloons checks the balance in its own WHERE and RETURNS the new
      // balance, or NULL (without raising) when it will not cover.
      const { data, error } = await admin.rpc('deduct_doubloons', { uid, amount })
      return error || data == null ? null : Number(data)
    },
    async mailTo(uid, m) {
      await admin.from('mail_messages').insert({ subject: m.subject, body: m.body, sender_label: m.sender, target_user_id: uid })
    },
  }
}
