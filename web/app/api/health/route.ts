// ── IS THE GAME UP, AND CAN IT REACH THE DATABASE ───────────────────────────
//
// Something for an uptime monitor to ping every few minutes, so the first
// person to know the site is down is not a player.
//
// IT ASKS THE DATABASE, and that is the whole point of it existing. A monitor
// pointed at the homepage only proves that Vercel served HTML; this game is
// unusable the moment Postgres stops answering, and the incident that prompted
// this one was a five-minute hang where the site was technically "up". One
// trivial read is the difference between watching the lights and watching the
// wiring.
//
// ── IT SAYS ALMOST NOTHING ──────────────────────────────────────────────────
//
// Public and unauthenticated, because a monitor has no account. So the body is
// a word and a number and never an error message: "ok" or "degraded", and how
// long the round trip took. What went wrong goes to the logs, where a monitor
// cannot read it and neither can anybody else.

import { createAdminClient } from '@/lib/supabase/admin'

/** Never cached, never prerendered: a cached health check is a lie that holds
 *  for as long as the cache does. */
export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  try {
    const admin = createAdminClient({ timeoutMs: 5_000 })
    // The smallest honest question: one row from a table that is always there
    // and never empty. `head` means no body comes back over the wire.
    const { error } = await admin
      .from('fish_species')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    if (error) throw error

    return Response.json(
      { status: 'ok', ms: Date.now() - started },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (e) {
    // The detail goes to the runtime log, which is where it is useful and where
    // it is not handed to whoever asked.
    console.error('[health] database unreachable', e)
    return Response.json(
      { status: 'degraded', ms: Date.now() - started },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
