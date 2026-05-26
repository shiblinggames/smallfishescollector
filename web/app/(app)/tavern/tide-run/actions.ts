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

/**
 * Accumulate lifetime Tide Run stats on EVERY run end (win or lose), unlike
 * submitTideRunBest which only fires on a new record. Atomic increment via
 * bump_tide_run_stats() so it's race-safe. Fire-and-forget from the client.
 * These per-player counters let admins pull aggregates later (total distance
 * sailed by everyone, most beacons smashed, etc.).
 */
export async function recordTideRunRun(distance: number, beacons: number): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const dist = Math.max(0, Math.min(100000, Math.floor(Number(distance) || 0)))
    const smashed = Math.max(0, Math.min(10000, Math.floor(Number(beacons) || 0)))
    if (dist === 0 && smashed === 0) return
    const admin = createAdminClient()
    await admin.rpc('bump_tide_run_stats', { uid: user.id, dist, beacons: smashed })
  } catch {
    // best-effort; never block the wreck screen
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
