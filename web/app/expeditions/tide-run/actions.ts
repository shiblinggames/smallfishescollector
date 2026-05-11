'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Record the player's distance for the all-time best (leaderboard). Only
 * updates `profiles.tide_run_best_distance` if the new distance is higher.
 * Called from the client after every death (and on mount with localStorage
 * best, to backfill old scores).
 */
export async function submitTideRunBest(distance: number): Promise<{ ok: true; best: number } | { error: string }> {
  try {
    if (typeof distance !== 'number' || !isFinite(distance) || distance < 0) {
      return { error: 'Invalid distance' }
    }
    const meters = Math.floor(distance)
    if (meters < 1 || meters > 100000) return { error: 'Invalid distance' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('tide_run_best_distance')
      .eq('id', user.id)
      .single()
    if (!profile) return { error: 'Profile not found' }

    const currentBest = (profile.tide_run_best_distance as number | null) ?? 0
    if (meters <= currentBest) return { ok: true, best: currentBest }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ tide_run_best_distance: meters })
      .eq('id', user.id)
    if (updateErr) return { error: 'Update failed' }

    return { ok: true, best: meters }
  } catch {
    return { error: 'Server error' }
  }
}

/** Today's date in UTC as YYYY-MM-DD — keyed against profiles.tide_run_committed_date. */
function todayUTCDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export type CommitTideRunResult =
  | { ok: true; doubloons: number; xp: number; newDoubloonTotal: number }
  | { error: string }

/**
 * Commit a Tide Run's distance for doubloons + expedition XP.
 *   doubloons earned = floor(distance)
 *   xp earned        = floor(distance / 2)
 * One commit per UTC day. Players can keep playing after committing;
 * the option just won't be offered again until the next UTC midnight.
 */
export async function commitTideRun(distance: number): Promise<CommitTideRunResult> {
  try {
    if (typeof distance !== 'number' || !isFinite(distance) || distance < 0) {
      return { error: 'Invalid distance' }
    }
    const meters = Math.floor(distance)
    if (meters < 1) return { error: 'Run too short to commit' }
    if (meters > 100000) return { error: 'Invalid distance' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('doubloons, expedition_xp, tide_run_committed_date')
      .eq('id', user.id)
      .single()
    if (!profile) return { error: 'Profile not found' }

    const today = todayUTCDate()
    if (profile.tide_run_committed_date === today) {
      return { error: 'Already committed a run today' }
    }

    const doubloonsEarned = meters
    const xpEarned = Math.floor(meters / 2)
    const newDoubloons = (profile.doubloons ?? 0) + doubloonsEarned
    const newXp = (profile.expedition_xp ?? 0) + xpEarned

    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        doubloons: newDoubloons,
        expedition_xp: newXp,
        tide_run_committed_date: today,
      })
      .eq('id', user.id)
    if (updateErr) return { error: 'Update failed' }

    // Best-effort audit row; don't fail the commit if it errors out
    await admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsEarned,
      reason: `Tide Run commit (${meters}m)`,
    }).then(() => {}, () => {})

    return { ok: true, doubloons: doubloonsEarned, xp: xpEarned, newDoubloonTotal: newDoubloons }
  } catch {
    return { error: 'Server error — please try again' }
  }
}
