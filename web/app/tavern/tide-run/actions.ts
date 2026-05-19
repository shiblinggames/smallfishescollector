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

    // Stamp the moment alongside the new best so the leaderboard tiebreaks
    // ties on first-to-reach (see leaderboard_tide_run view + the
    // tide_run_best_distance_set_at backfill migration).
    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        tide_run_best_distance: meters,
        tide_run_best_distance_set_at: new Date().toISOString(),
      })
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
  | { ok: true; doubloons: number; newDoubloonTotal: number }
  | { error: string }

/**
 * Commit a Tide Run's distance for doubloons (one commit per UTC day).
 *   doubloons earned = floor(distance)
 * Players can keep playing after committing; the option just won't be
 * offered again until the next UTC midnight.
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
      .select('doubloons, tide_run_committed_date')
      .eq('id', user.id)
      .single()
    if (!profile) return { error: 'Profile not found' }

    const today = todayUTCDate()
    if (profile.tide_run_committed_date === today) {
      return { error: 'Already committed a run today' }
    }

    const doubloonsEarned = meters
    const newDoubloons = (profile.doubloons ?? 0) + doubloonsEarned

    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        doubloons: newDoubloons,
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

    return { ok: true, doubloons: doubloonsEarned, newDoubloonTotal: newDoubloons }
  } catch {
    return { error: 'Server error — please try again' }
  }
}
