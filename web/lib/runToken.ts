import type { createAdminClient } from './supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// Server-issued run tokens — the durable answer to replayed/forged reward calls on
// client-side games. START mints an open token; reward calls reference it; SETTLE
// consumes it atomically (one-shot → a recycled call hits a spent token). For
// raids, a per-kill counter also bounds a run's rewards to its real mob count.
//
// All helpers take the service-role admin client and are server-only. They fail
// SOFT (return null/false) rather than throw, so a token miss rejects the reward
// without 500-ing the request.

/** Mint an open token for a starting run. Returns the token id, or null on error
 *  (caller should treat null as "no token" and fall back to the capped path). */
export async function issueRunToken(
  admin: Admin,
  userId: string,
  kind: string,
  meta: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const { data } = await admin
      .from('run_tokens')
      .insert({ user_id: userId, kind, meta })
      .select('id')
      .single()
    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}

/** Atomically consume an OPEN token owned by this user+kind. Returns its meta if it
 *  was open (now settled), or null if missing / already consumed / expired / foreign
 *  — a null on a settle call means REPLAY or forgery, so the caller must reject. */
export async function consumeRunToken(
  admin: Admin,
  userId: string,
  kind: string,
  tokenId: string | null | undefined,
): Promise<{ meta: any; kills: number } | null> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!tokenId) return null
  try {
    const { data } = await admin
      .from('run_tokens')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', tokenId).eq('user_id', userId).eq('kind', kind)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('meta, kills')
      .single()
    return data ? { meta: data.meta, kills: data.kills } : null
  } catch {
    return null
  }
}

/** Count one raid kill against an open token, bounded by the run's mob count
 *  (read from the token's own meta.maxKills, baked in at issue). true = within
 *  bounds (grant the kill); false = reject (replayed past the cap, or a
 *  dead/foreign token). */
export async function countRaidKill(
  admin: Admin,
  userId: string,
  tokenId: string | null | undefined,
): Promise<boolean> {
  if (!tokenId) return false
  try {
    const { data } = await admin.rpc('bump_run_token_kill', { p_id: tokenId, p_uid: userId })
    return data === true
  } catch {
    return false
  }
}

/** Bank a raid CLEAR against an open token, once.
 *
 *  Deliberately NOT consumeRunToken. The clear is recorded the moment the boss
 *  dies, but the boss-kill award fires after it and calls countRaidKill, which
 *  needs an unconsumed token (bump_run_token_kill requires consumed_at IS NULL).
 *  Consuming here would have taken every honest player's boss XP and gold with
 *  the replay guard.
 *
 *  So the clear gets its own marker. The update is conditional on cleared_at
 *  being null, which makes it atomic: a replayed call loses the race and gets
 *  null back, while kills keep counting against the same still-open token.
 *
 *  Returns the token's meta on success, or null if it was already cleared,
 *  missing, expired or foreign — all of which the caller must treat as a replay. */
export async function markRunCleared(
  admin: Admin,
  userId: string,
  kind: string,
  tokenId: string | null | undefined,
): Promise<{ meta: any } | null> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!tokenId) return null
  try {
    const { data } = await admin
      .from('run_tokens')
      .update({ cleared_at: new Date().toISOString() })
      .eq('id', tokenId).eq('user_id', userId).eq('kind', kind)
      .is('cleared_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('meta')
      .single()
    return data ? { meta: data.meta } : null
  } catch {
    return null
  }
}
