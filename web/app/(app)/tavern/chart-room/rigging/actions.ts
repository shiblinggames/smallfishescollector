'use server'

// Lay the Rigging — server-authoritative. The board is solvable by
// construction; the player draws ropes client-side and the full solve is
// validated here (isSolved) before any points are banked. First clear of
// the week banks RIGGING_POINTS puzzle points toward the Den purse.
// Types live in ./constants ('use server' strips non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getThisWeeksRigging } from './generate'
import { isSolved } from './rigging'
import { denDailyCap } from '@/app/(app)/tavern/constants'
import {
  RIGGING_POINTS, riggingWeekStr,
  type RiggingState, type SubmitRiggingResult,
} from './constants'

interface AttemptRow {
  paths: Record<number, number[]>
  status: 'active' | 'cleared'
  points_awarded: number
}

const ATTEMPT_COLS = 'paths, status, points_awarded'

async function loadAttempt(userId: string, week: string): Promise<AttemptRow> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('rigging_attempts')
    .select(ATTEMPT_COLS)
    .eq('user_id', userId).eq('week', week)
    .single()
  return (data as AttemptRow | null) ?? { paths: {}, status: 'active', points_awarded: 0 }
}

async function loadPuzzlePoints(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('puzzle_points').eq('id', userId).single()
  return (data?.puzzle_points as number | null) ?? 0
}

export async function getRiggingState(): Promise<RiggingState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const week = riggingWeekStr()
  const [layout, attempt, points] = await Promise.all([
    getThisWeeksRigging(),
    loadAttempt(user.id, week),
    loadPuzzlePoints(user.id),
  ])
  if (!layout) return { error: 'No rigging to lay this week. Try again in a moment.' }

  return {
    week,
    cols: layout.cols,
    rows: layout.rows,
    pairs: layout.pairs,
    paths: attempt.paths ?? {},
    status: attempt.status,
    pointsAwarded: attempt.points_awarded,
    reward: RIGGING_POINTS,
    puzzlePoints: points,
    denCap: denDailyCap(points),
  }
}

/** Persist in-flight ropes so the player can resume (debounced client). */
export async function saveRiggingPaths(paths: Record<number, number[]>): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof paths !== 'object' || paths === null) return { error: 'Invalid paths' }

  const week = riggingWeekStr()
  const attempt = await loadAttempt(user.id, week)
  if (attempt.status === 'cleared') return { ok: true }

  const admin = createAdminClient()
  await admin.from('rigging_attempts').upsert({
    user_id: user.id, week,
    paths, status: attempt.status, points_awarded: attempt.points_awarded,
    updated_at: new Date().toISOString(),
  })
  return { ok: true }
}

export async function submitRigging(paths: Record<number, number[]>): Promise<SubmitRiggingResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const week = riggingWeekStr()
  const [layout, attempt, oldPoints] = await Promise.all([
    getThisWeeksRigging(),
    loadAttempt(user.id, week),
    loadPuzzlePoints(user.id),
  ])
  if (!layout) return { error: 'No board this week' }

  const solved = isSolved(layout.cols, layout.rows, layout.pairs, paths)
  const admin = createAdminClient()

  if (!solved) {
    // Persist progress, no award.
    await admin.from('rigging_attempts').upsert({
      user_id: user.id, week,
      paths, status: attempt.status, points_awarded: attempt.points_awarded,
      updated_at: new Date().toISOString(),
    })
    return { solved: false, pointsWon: 0, newPuzzlePoints: null, capBefore: denDailyCap(oldPoints), capAfter: denDailyCap(oldPoints) }
  }

  // Already banked this week? Mark cleared, no double pay.
  if (attempt.points_awarded > 0 || attempt.status === 'cleared') {
    await admin.from('rigging_attempts').upsert({
      user_id: user.id, week, paths, status: 'cleared', points_awarded: attempt.points_awarded,
      updated_at: new Date().toISOString(),
    })
    return { solved: true, pointsWon: 0, newPuzzlePoints: null, capBefore: denDailyCap(oldPoints), capAfter: denDailyCap(oldPoints) }
  }

  const newPuzzlePoints = oldPoints + RIGGING_POINTS
  await Promise.all([
    admin.from('rigging_attempts').upsert({
      user_id: user.id, week, paths, status: 'cleared', points_awarded: RIGGING_POINTS,
      updated_at: new Date().toISOString(),
    }),
    admin.from('profiles').update({ puzzle_points: newPuzzlePoints }).eq('id', user.id),
  ])

  return {
    solved: true,
    pointsWon: RIGGING_POINTS,
    newPuzzlePoints,
    capBefore: denDailyCap(oldPoints),
    capAfter: denDailyCap(newPuzzlePoints),
  }
}
