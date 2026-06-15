'use server'

// Treasure Match — server actions. The board is seeded + deterministic
// (shared weekly puzzle); the client runs the match-3 engine and reports
// a win. Score isn't re-validated server-side (low-stakes: 5 charting
// points, no leaderboard), but the award is gated to once per week.
// Types live in ./constants ('use server' strips non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getThisWeeksMatch } from './generate'
import { denDailyCap } from '@/app/(app)/tavern/constants'
import {
  MATCH_POINTS, matchWeekStr,
  type MatchState, type SubmitMatchResult,
} from './constants'

interface AttemptRow {
  status: 'active' | 'cleared'
  best_score: number
  points_awarded: number
}

const ATTEMPT_COLS = 'status, best_score, points_awarded'

async function loadAttempt(userId: string, week: string): Promise<AttemptRow> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('treasure_match_attempts')
    .select(ATTEMPT_COLS)
    .eq('user_id', userId).eq('week', week)
    .single()
  return (data as AttemptRow | null) ?? { status: 'active', best_score: 0, points_awarded: 0 }
}

async function loadPuzzlePoints(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('puzzle_points').eq('id', userId).single()
  return (data?.puzzle_points as number | null) ?? 0
}

export async function getMatchState(): Promise<MatchState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const week = matchWeekStr()
  const [config, attempt, points] = await Promise.all([
    getThisWeeksMatch(),
    loadAttempt(user.id, week),
    loadPuzzlePoints(user.id),
  ])
  if (!config) return { error: 'No board this week. Try again in a moment.' }

  return {
    week,
    seed: config.seed,
    cols: config.cols,
    rows: config.rows,
    types: config.types,
    target: config.target,
    moves: config.moves,
    status: attempt.status,
    bestScore: attempt.best_score,
    pointsAwarded: attempt.points_awarded,
    reward: MATCH_POINTS,
    puzzlePoints: points,
    denCap: denDailyCap(points),
  }
}

/** Report a finished run. `score` updates the best; `won` (score reached
 *  the target) banks charting points once per week. */
export async function submitMatch(score: number, won: boolean): Promise<SubmitMatchResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!Number.isFinite(score) || score < 0) return { error: 'Invalid score' }

  const week = matchWeekStr()
  const [config, attempt, oldPoints] = await Promise.all([
    getThisWeeksMatch(),
    loadAttempt(user.id, week),
    loadPuzzlePoints(user.id),
  ])
  if (!config) return { error: 'No board this week' }

  const admin = createAdminClient()
  const bestScore = Math.max(attempt.best_score, Math.floor(score))
  // A win requires actually reaching the target (server re-checks the
  // claim against the stored target — the one cheap guard we can do).
  const isWin = won && bestScore >= config.target

  if (!isWin || attempt.points_awarded > 0 || attempt.status === 'cleared') {
    await admin.from('treasure_match_attempts').upsert({
      user_id: user.id, week,
      status: isWin || attempt.status === 'cleared' ? 'cleared' : 'active',
      best_score: bestScore,
      points_awarded: attempt.points_awarded,
      updated_at: new Date().toISOString(),
    })
    return { cleared: isWin || attempt.status === 'cleared', pointsWon: 0, newPuzzlePoints: null, capBefore: denDailyCap(oldPoints), capAfter: denDailyCap(oldPoints) }
  }

  const newPuzzlePoints = oldPoints + MATCH_POINTS
  await Promise.all([
    admin.from('treasure_match_attempts').upsert({
      user_id: user.id, week,
      status: 'cleared', best_score: bestScore, points_awarded: MATCH_POINTS,
      updated_at: new Date().toISOString(),
    }),
    admin.from('profiles').update({ puzzle_points: newPuzzlePoints }).eq('id', user.id),
  ])

  return {
    cleared: true,
    pointsWon: MATCH_POINTS,
    newPuzzlePoints,
    capBefore: denDailyCap(oldPoints),
    capAfter: denDailyCap(newPuzzlePoints),
  }
}
