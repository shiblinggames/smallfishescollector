'use server'

// Treasure Match — server actions. The board is seeded + deterministic
// (shared weekly puzzle), and the server REPLAYS the submitted swaps through
// the same engine to derive the score itself. It used to take the client's
// reported score on trust, with the note that this was low-stakes; a tester
// edited that number in memory and took the week's full five points without
// playing. Low stakes is still stakes. See submitMatch.
// Types live in ./constants ('use server' strips non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getThisWeeksMatch } from './generate'
import { makeRng, initialBoard, resolveSwap, hasValidMove, reshuffle } from './treasureMatch'
import { flagAnomaly } from '@/lib/anomaly'
import {
  MATCH_TARGET, MATCH_MAX_POINTS, WILD_DROP_CHANCE, matchWeekStr, pointsForScore,
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
  }
}

/** Report a finished run with its final `score`. The server tracks the best
 *  score for the week, maps it to a tier (0-5 charting points), and banks the
 *  DELTA over whatever was already awarded — so a player who first hits 2/5
 *  and later grinds up to 4/5 gets +2 more, capped at 5 total. The tier is
 *  computed server-side from the (server-tracked) best score, so the client
 *  can't claim points it didn't earn. */
/**
 * REPLAY THE RUN, DO NOT BELIEVE IT.
 *
 * This used to take the final score as a number and tier it. The score lives in
 * client memory for the length of a run, so anyone willing to edit it could
 * claim the top tier without playing -- reported by a tester who did exactly
 * that. Bounding the number would only have capped the theft at the weekly
 * maximum, which is all the exploit was worth anyway.
 *
 * So the score is no longer sent. The client sends the SWAPS it made and the
 * server recomputes the score from them, because everything needed to do that
 * was already here:
 *
 *   - treasureMatch.ts is a pure engine with zero imports, so it runs
 *     server-side unchanged
 *   - the board is deterministic from a seed the server itself stored in
 *     treasure_match_boards
 *
 * A forged payload can now only be a list of swaps, and a list of swaps that
 * resolves into a winning score IS a solution to the puzzle. There is nothing
 * left to fake.
 *
 * THE REPLAY MUST MATCH THE CLIENT EXACTLY. The RNG is one stateful stream
 * shared by every refill and reshuffle, so the loop below mirrors
 * attemptSwap's order precisely: resolve, score, spend a move, stop on target
 * or on the last move, and only reshuffle if the run continues. A reshuffle
 * consumes draws, so doing it a step early or late desyncs everything after.
 */
export async function submitMatch(moves: [number, number][]): Promise<SubmitMatchResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!Array.isArray(moves)) return { error: 'Please reload the page and try again.' }

  const week = matchWeekStr()
  const [config, attempt, oldPoints] = await Promise.all([
    getThisWeeksMatch(),
    loadAttempt(user.id, week),
    loadPuzzlePoints(user.id),
  ])
  if (!config) return { error: 'No board this week' }

  const admin = createAdminClient()

  // More swaps than the run allows is not a near miss, it is a forgery.
  if (moves.length > config.moves) {
    await flagAnomaly(admin, user.id, 'implausible:matchMoveCount', 3, { sent: moves.length, allowed: config.moves })
    return { error: 'Invalid run' }
  }

  const { cols, rows, types, target, seed } = config
  const cells = cols * rows
  const rng = makeRng(seed)
  let board = initialBoard(rng, cols, rows, types)
  let score = 0
  let movesLeft = config.moves

  for (const mv of moves) {
    if (!Array.isArray(mv) || mv.length !== 2) return { error: 'Invalid run' }
    const [a, b] = mv
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= cells || b >= cells) {
      return { error: 'Invalid run' }
    }
    // A swap that forms no match is refused by the client without spending a
    // move or touching the RNG, so it can never appear in an honest log.
    const res = resolveSwap(board, a, b, cols, rows, types, rng, WILD_DROP_CHANCE)
    if (!res) {
      await flagAnomaly(admin, user.id, 'implausible:matchInvalidSwap', 3, { a, b, at: moves.indexOf(mv) })
      return { error: 'Invalid run' }
    }
    board = res.finalBoard
    score += res.totalGained
    movesLeft--
    if (score >= target) break
    if (movesLeft <= 0) break
    if (!hasValidMove(board, cols, rows)) board = reshuffle(rng, cols, rows, types)
  }

  const bestScore = Math.max(attempt.best_score, Math.floor(score))
  const tier = pointsForScore(bestScore)               // 0-5 for the best score
  const delta = Math.max(0, tier - attempt.points_awarded) // never claw back
  const maxed = tier >= MATCH_MAX_POINTS

  if (delta <= 0) {
    // No new tier reached — just persist the (possibly improved) best score.
    await admin.from('treasure_match_attempts').upsert({
      user_id: user.id, week,
      status: maxed ? 'cleared' : 'active',
      best_score: bestScore,
      points_awarded: attempt.points_awarded,
      updated_at: new Date().toISOString(),
    })
    return { bestScore, tier, pointsWon: 0, maxed, newPuzzlePoints: null }
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
  }
}
