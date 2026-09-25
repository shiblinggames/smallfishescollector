// ── EVERY BALANCE MOVES IN PLACE (2026-09-25 exploit audit) ─────────────────
//
// The rule: never compute a balance in JS and write it back. Reading `gems`,
// doing slow work and writing `gems: old - cost` lets two requests fired
// together both spend the same balance (two items for one price), and lets a
// slow claim write a stale balance over a purchase that landed meanwhile (the
// money comes back). These call one SQL statement that adds in place and
// refuses to go below zero (`wallet_add`, `profile_array_add`, service-role
// only).
//
// Server only: takes the admin client.

import type { SupabaseClient } from '@supabase/supabase-js'

export type WalletCol = 'doubloons' | 'gems' | 'blood_gems' | 'gauntlet_fathoms' | 'casino_chips'

/** Add `delta` (may be negative) in place. The new balance, or null when it
 *  would go below zero (nothing changed). */
export async function walletAdd(admin: SupabaseClient, uid: string, col: WalletCol, delta: number): Promise<number | null> {
  const d = Math.trunc(Number(delta))
  if (!Number.isFinite(d)) return null
  const { data, error } = await admin.rpc('wallet_add', { uid, col, delta: d })
  if (error) throw new Error(`wallet_add ${col}: ${error.message}`)
  return data == null ? null : Number(data)
}

/** Take `amount` if the player has it. The new balance, or null (not enough;
 *  nothing taken). A negative or fractional amount is refused. */
export async function spend(admin: SupabaseClient, uid: string, col: WalletCol, amount: number): Promise<number | null> {
  if (!Number.isInteger(amount) || amount < 0) return null
  return walletAdd(admin, uid, col, -amount)
}

/** Pay `amount` (a non-negative whole number). Returns the new balance. */
export async function grant(admin: SupabaseClient, uid: string, col: WalletCol, amount: number): Promise<number> {
  const n = Math.max(0, Math.trunc(Number(amount) || 0))
  const v = await walletAdd(admin, uid, col, n)
  return v ?? 0
}

/** Add `val` to an owned-things array on the profile, once. true = added,
 *  false = it was already there (a concurrent twin got it first). */
export async function arrayAdd(admin: SupabaseClient, uid: string, col: string, val: string): Promise<boolean> {
  const { data, error } = await admin.rpc('profile_array_add', { uid, col, val })
  if (error) throw new Error(`profile_array_add ${col}: ${error.message}`)
  return !!data
}
