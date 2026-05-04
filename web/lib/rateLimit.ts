import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns true if the request is allowed, false if rate limited.
 * key: unique string identifying the action + user (e.g. `pack-open:${userId}`)
 * max: max requests allowed in the window
 * windowSeconds: rolling window size
 */
export async function checkRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('[rateLimit] check failed:', error.message)
    return true // fail open — don't block on infra errors
  }
  return data === true
}
