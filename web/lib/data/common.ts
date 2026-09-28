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
  }
}
