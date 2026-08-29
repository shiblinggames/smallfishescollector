import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

// Async Ship PvP housekeeping (hourly). Two jobs:
//   1. Expire stale 'pending' duel invites past their expires_at.
//   2. Forfeit 'active' duels idle > 3 days: whichever captain submitted their
//      move wins; the silent one forfeits. If NEITHER moved, the duel voids
//      with no W/L change.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // BULK WORK, so it opts out of the ten-second default every page takes.
  // Kept under this route's own maxDuration of 60 so the deadline still bites
  // before the platform's does.
  const admin = createAdminClient({ timeoutMs: 50_000 })
  const now = new Date()
  const nowIso = now.toISOString()
  const cutoffIso = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Stale pending invites.
  const { data: expired } = await admin
    .from('ship_battles')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', nowIso)
    .select('id')

  // 2. Idle active duels → forfeit the silent side.
  const { data: stale } = await admin
    .from('ship_battles')
    .select('id, challenger_id, opponent_id, challenger_username, opponent_username, challenger_move, opponent_move')
    .eq('status', 'active')
    .lt('current_round_started_at', cutoffIso)

  let forfeits = 0
  let voided = 0
  for (const b of (stale ?? []) as Array<Record<string, unknown>>) {
    const cMoved = b.challenger_move != null
    const oMoved = b.opponent_move != null
    if (cMoved === oMoved) {
      // Neither captain showed up (or an impossible both-in) → void, no record change.
      const { data } = await admin.from('ship_battles').update({ status: 'expired', completed_at: nowIso }).eq('id', b.id as string).eq('status', 'active').select('id')
      if (data && data.length) voided++
      continue
    }
    const winnerId = (cMoved ? b.challenger_id : b.opponent_id) as string
    const loserId = (cMoved ? b.opponent_id : b.challenger_id) as string
    const { data: done } = await admin
      .from('ship_battles')
      .update({ status: 'complete', winner_id: winnerId, completed_at: nowIso })
      .eq('id', b.id as string).eq('status', 'active')
      .select('id')
    if (done && done.length) {
      forfeits++
      await Promise.all([
        admin.rpc('bump_pvp_stats', { uid: winnerId, wins: 1, losses: 0 }),
        admin.rpc('bump_pvp_stats', { uid: loserId, wins: 0, losses: 1 }),
      ])
    }
  }

  return NextResponse.json({ ok: true, expiredPending: expired?.length ?? 0, forfeits, voided })
}
