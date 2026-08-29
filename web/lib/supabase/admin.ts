import { createClient } from '@supabase/supabase-js'
import { timedFetch, SUPABASE_TIMEOUT_MS } from './timeout'

/**
 * The service-role client. Every value in this game moves through here.
 *
 * `timeoutMs` exists for the crons, which do bulk work a page never would and
 * are the only callers with a legitimate reason to wait longer than a captain
 * would sit and watch. Everybody else takes the default - see ./timeout for
 * why there is one at all.
 */
export function createAdminClient(opts?: { timeoutMs?: number }) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: timedFetch(opts?.timeoutMs ?? SUPABASE_TIMEOUT_MS) } }
  )
}
