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
  MATCH_TARGET, MATCH_MAX_POINTS, matchWeekStr, pointsForScore,
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
    // Drive tiers off the constant (MATCH_TARGET = 5/5 score), not the
    // per-board config.target, so older cached boards still tier correctly.
    target: MATCH_TARGET,
    moves: config.moves,
    status: attempt.status,
    bestScore: attempt.best_score,
    pointsAwarded: attempt.points_awarded,
    puzzlePoints: points,
    denCap: denDailyCap(points),
  }
}

/** Report a finished run with its final `score`. The server tracks the best
 *  score for the week, maps it to a tier (0-5 charting points), and banks the
 *  DELTA over whatever was already awarded — so a player who first hits 2/5
 *  and later grinds up to 4/5 gets +2 more, capped at 5 total. The tier is
 *  computed server-side from the (server-tracked) best score, so the client
 *  can't claim points it didn't earn. */
export async function submitMatch(score: number): Promise<SubmitMatchResult | { error: string }> {
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
  const tier = pointsForScore(bestScore)               // 0-5 for the best score
  const delta = Math.max(0, tier - attempt.points_awarded) // never claw back
  const maxed = tier >= MATCH_MAX_POINTS
  const capBefore = denDailyCap(oldPoints)

  if (delta <= 0) {
    // No new tier reached — just persist the (possibly improved) best score.
    await admin.from('treasure_match_attempts').upsert({
      user_id: user.id, week,
      status: maxed ? 'cleared' : 'active',
      best_score: bestScore,
      points_awarded: attempt.points_awarded,
      updated_at: new Date().toISOString(),
    })
    return { bestScore, tier, pointsWon: 0, maxed, newPuzzlePoints: null, capBefore, capAfter: capBefore }
  }

  const newPuzzlePoints = oldPoints + delta
  await Promise.all([
    admin.from('treasure_match_attempts').upsert({
      user_id: user.id, week,
      status: maxed ? 'cleared' : 'active',
      best_score: bestScore, points_awarded: tier,
      updated_at: new Date().toISOString(),
    }),
    admin.from('profiles').update({ puzzle_points: newPuzzlePoints }).eq('id', user.id),
  ])

  return {
    bestScore, tier, pointsWon: delta, maxed,
    newPuzzlePoints,
    capBefore,
    capAfter: denDailyCap(newPuzzlePoints),
  }
}
