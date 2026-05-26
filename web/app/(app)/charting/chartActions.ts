'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Daily-move grant model ──────────────────────────────────────────────────
//
// One move per UTC calendar day, no stacking. Every time the player touches
// the contest (page load or guess submission), we run `maybeGrantDailyMove`:
// if `last_move_grant_date < today`, bump `moves_granted` by 1 and stamp
// today. Skip a day, you forfeit that day's move. Replaced the old level-XP
// formula on 2026-05-26.
//
// For legacy progress from the old level formula: the first grant under the
// new system also rebases `moves_granted = moves_used` so the player's
// effective balance starts at 0 + today's free move, without losing the
// path/milestone progress they already accumulated.

function utcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Returns the (possibly bumped) moves_granted + last_move_grant_date.
 *  Writes to chart_progress when a grant lands so the row stays canonical. */
async function maybeGrantDailyMove(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  contestId: number,
  current: { moves_granted: number; moves_used: number; last_move_grant_date: string | null },
): Promise<{ moves_granted: number; last_move_grant_date: string }> {
  const today = utcDate()
  if (current.last_move_grant_date === today) {
    return { moves_granted: current.moves_granted, last_move_grant_date: today }
  }

  // Legacy progress catch-up: if a player had moves_used > moves_granted (old
  // level-based system) we rebase so they don't carry a phantom debit. Plays
  // safe even if both are 0 for fresh players (math is identical).
  const rebased = Math.max(current.moves_granted, current.moves_used)
  const newGranted = rebased + 1

  await admin
    .from('chart_progress')
    .update({ moves_granted: newGranted, last_move_grant_date: today })
    .eq('user_id', userId)
    .eq('contest_id', contestId)

  return { moves_granted: newGranted, last_move_grant_date: today }
}

export interface ChartContest {
  id: number
  name: string
  grid_cols: number
  grid_rows: number
}

export interface ChartProgress {
  path_index: number
  moves_used: number
  completed_at: string | null
  ship_color: string | null
}

export interface ChartGuess {
  row: number
  col: number
  correct: boolean
}

export interface ChartFinisher {
  username: string
  moves_used: number
  completed_at: string
}

export type ChartState = {
  contest: ChartContest
  progress: ChartProgress
  guesses: ChartGuess[]
  movesAvailable: number
  /** UTC date of the next grant (always tomorrow when there's a move pending,
   *  or today's date if the daily move hasn't been claimed yet). Useful for
   *  the "next move in HH:MM" countdown on the client. */
  nextGrantDate: string
  pathLength: number
  startTile: [number, number]
  finishers: ChartFinisher[]
  completionPosition: number | null
}

export async function getChartState(): Promise<ChartState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: contest } = await admin
    .from('chart_contests')
    .select('id, name, grid_cols, grid_rows, path')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!contest) return { error: 'No active contest' }

  const path = contest.path as [number, number][]

  const [{ data: existingProgress }, { data: guessRows }] = await Promise.all([
    admin.from('chart_progress')
      .select('path_index, moves_used, moves_granted, last_move_grant_date, completed_at, ship_color')
      .eq('user_id', user.id).eq('contest_id', contest.id).maybeSingle(),
    admin.from('chart_guesses')
      .select('row, col, correct')
      .eq('user_id', user.id).eq('contest_id', contest.id)
      .order('guessed_at', { ascending: true }),
  ])

  let progress = existingProgress
  if (!progress) {
    const today = utcDate()
    const { data: np } = await admin
      .from('chart_progress')
      .insert({
        user_id: user.id,
        contest_id: contest.id,
        // First-touch grant: a brand-new player gets today's move on signup.
        moves_granted: 1,
        last_move_grant_date: today,
      })
      .select('path_index, moves_used, moves_granted, last_move_grant_date, completed_at, ship_color')
      .single()
    progress = np
  } else if (!progress.completed_at) {
    // Returning player — bump moves_granted if today's hasn't been claimed yet.
    const grant = await maybeGrantDailyMove(admin, user.id, contest.id, {
      moves_granted: progress.moves_granted ?? 0,
      moves_used: progress.moves_used ?? 0,
      last_move_grant_date: progress.last_move_grant_date ?? null,
    })
    progress = { ...progress, ...grant }
  }

  const movesGranted = progress?.moves_granted ?? 0
  const movesUsed = progress?.moves_used ?? 0
  const movesAvailable = Math.max(0, movesGranted - movesUsed)

  const { data: finisherRows } = await admin
    .from('chart_progress')
    .select('user_id, moves_used, completed_at')
    .eq('contest_id', contest.id)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: true })
    .limit(3)

  let finishers: ChartFinisher[] = []
  if (finisherRows && finisherRows.length > 0) {
    const { data: profiles } = await admin
      .from('profiles').select('id, username')
      .in('id', finisherRows.map(r => r.user_id))
    const nameMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.username]))
    finishers = finisherRows.map(r => ({
      username: nameMap[r.user_id] ?? '?',
      moves_used: r.moves_used,
      completed_at: r.completed_at!,
    }))
  }

  let completionPosition: number | null = null
  if (progress?.completed_at) {
    const { count } = await admin
      .from('chart_progress')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contest.id)
      .not('completed_at', 'is', null)
      .lte('completed_at', progress.completed_at)
    completionPosition = (count ?? 0) <= 3 ? (count ?? 0) : null
  }

  // The chip shows a "next move at UTC midnight" countdown. Today's already
  // granted ⇒ point to tomorrow; otherwise (offline ≥1 day) point to today
  // (the next page touch will grant immediately).
  const today = utcDate()
  const nextGrantDate = progress?.last_move_grant_date === today
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : today

  return {
    contest: { id: contest.id, name: contest.name, grid_cols: contest.grid_cols, grid_rows: contest.grid_rows },
    progress: progress
      ? { path_index: progress.path_index, moves_used: progress.moves_used, completed_at: progress.completed_at, ship_color: progress.ship_color }
      : { path_index: 0, moves_used: 0, completed_at: null, ship_color: null },
    guesses: (guessRows ?? []) as ChartGuess[],
    movesAvailable,
    nextGrantDate,
    pathLength: path.length,
    startTile: path[0],
    finishers,
    completionPosition,
  }
}

export async function makeChartGuess(
  contestId: number,
  row: number,
  col: number,
): Promise<{ correct: boolean; movesLeft: number; completed: boolean; newPathIndex: number; completionPosition: number | null; bonusDoubloons: number; newDoubloonTotal: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: contest } = await admin
    .from('chart_contests').select('*')
    .eq('id', contestId).eq('is_active', true).single()
  if (!contest) return { error: 'Contest not found' }

  const path = contest.path as [number, number][]

  const { data: profile } = await admin
    .from('profiles').select('doubloons').eq('id', user.id).single()

  let { data: progress } = await admin
    .from('chart_progress').select('*')
    .eq('user_id', user.id).eq('contest_id', contestId).maybeSingle()

  if (!progress) {
    const today = utcDate()
    const { data: np } = await admin
      .from('chart_progress')
      .insert({
        user_id: user.id,
        contest_id: contestId,
        moves_granted: 1,
        last_move_grant_date: today,
      })
      .select('*').single()
    progress = np
  }
  if (!progress) return { error: 'Progress error' }
  if (progress.completed_at) return { error: 'Already completed' }

  // Defense in depth: catch up the daily grant in case the client hasn't
  // hit getChartState today (e.g. stale tab). Same write the page loader does.
  const grant = await maybeGrantDailyMove(admin, user.id, contestId, {
    moves_granted: progress.moves_granted ?? 0,
    moves_used: progress.moves_used ?? 0,
    last_move_grant_date: progress.last_move_grant_date ?? null,
  })
  progress = { ...progress, ...grant }

  const movesAvailable = (progress.moves_granted ?? 0) - (progress.moves_used ?? 0)
  if (movesAvailable <= 0) return { error: 'No moves available' }

  const currentPathIndex: number = progress.path_index ?? 0
  if (currentPathIndex >= path.length - 1) return { error: 'Already at end' }

  const [curRow, curCol] = path[currentPathIndex]

  const isAdjacent =
    (row === curRow + 1 && col === curCol) ||
    (row === curRow && col === curCol - 1) ||
    (row === curRow && col === curCol + 1)
  if (!isAdjacent) return { error: 'Not adjacent' }
  if (col < 0 || col >= contest.grid_cols || row < 0 || row >= contest.grid_rows) return { error: 'Out of bounds' }

  const { data: existing } = await admin
    .from('chart_guesses').select('id')
    .eq('user_id', user.id).eq('contest_id', contestId)
    .eq('row', row).eq('col', col).eq('correct', true).maybeSingle()
  if (existing) return { error: 'Already on correct path' }

  const [nextRow, nextCol] = path[currentPathIndex + 1]
  const correct = row === nextRow && col === nextCol

  const newMovesUsed = (progress.moves_used ?? 0) + 1
  const newPathIndex = correct ? currentPathIndex + 1 : currentPathIndex
  const completed = correct && newPathIndex === path.length - 1

  // Milestone rewards: row 5 = 2000 doubloons (bit 0), row 10 = 5000 doubloons (bit 1)
  const currentMilestones: number = progress.milestones_awarded ?? 0
  let newMilestones = currentMilestones
  let bonusDoubloons = 0
  if (correct) {
    const newTileRow = path[newPathIndex][0]
    if (newTileRow > 5 && !(currentMilestones & 1)) { newMilestones |= 1; bonusDoubloons += 2000 }
    if (newTileRow > 10 && !(currentMilestones & 2)) { newMilestones |= 2; bonusDoubloons += 5000 }
  }

  const updateTasks = [
    admin.from('chart_guesses').insert({ user_id: user.id, contest_id: contestId, row, col, correct }),
    admin.from('chart_progress').update({
      moves_used: newMovesUsed,
      path_index: newPathIndex,
      milestones_awarded: newMilestones,
      ...(completed ? { completed_at: new Date().toISOString() } : {}),
    }).eq('user_id', user.id).eq('contest_id', contestId),
    ...(bonusDoubloons > 0
      ? [admin.from('profiles').update({ doubloons: (profile?.doubloons ?? 0) + bonusDoubloons }).eq('id', user.id)]
      : []),
  ]
  await Promise.all(updateTasks)

  let completionPosition: number | null = null
  if (completed) {
    const { count } = await admin
      .from('chart_progress')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contestId)
      .not('completed_at', 'is', null)
    completionPosition = (count ?? 0) <= 3 ? (count ?? 0) : null
  }

  const newDoubloonTotal = (profile?.doubloons ?? 0) + bonusDoubloons
  const movesLeft = Math.max(0, (progress.moves_granted ?? 0) - newMovesUsed)
  return { correct, movesLeft, completed, newPathIndex, completionPosition, bonusDoubloons, newDoubloonTotal }
}
