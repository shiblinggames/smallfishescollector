'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'

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
  pathLength: number
  startTile: [number, number]
  finishers: ChartFinisher[]
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

  const [{ data: profile }, { data: existingProgress }, { data: guessRows }] = await Promise.all([
    admin.from('profiles').select('fishing_xp, expedition_xp').eq('id', user.id).single(),
    admin.from('chart_progress')
      .select('path_index, moves_used, completed_at, ship_color')
      .eq('user_id', user.id).eq('contest_id', contest.id).maybeSingle(),
    admin.from('chart_guesses')
      .select('row, col, correct')
      .eq('user_id', user.id).eq('contest_id', contest.id)
      .order('guessed_at', { ascending: true }),
  ])

  let progress = existingProgress
  if (!progress) {
    const { data: np } = await admin
      .from('chart_progress')
      .insert({ user_id: user.id, contest_id: contest.id })
      .select('path_index, moves_used, completed_at, ship_color')
      .single()
    progress = np
  }

  const fishingLevel = getLevelFromXP(profile?.fishing_xp ?? 0)
  const expeditionLevel = getExpeditionLevel(profile?.expedition_xp ?? 0)
  const movesAvailable = Math.max(0, fishingLevel + expeditionLevel - (progress?.moves_used ?? 0))

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

  return {
    contest: { id: contest.id, name: contest.name, grid_cols: contest.grid_cols, grid_rows: contest.grid_rows },
    progress: progress ?? { path_index: 0, moves_used: 0, completed_at: null, ship_color: null },
    guesses: (guessRows ?? []) as ChartGuess[],
    movesAvailable,
    pathLength: path.length,
    startTile: path[0],
    finishers,
  }
}

export async function makeChartGuess(
  contestId: number,
  row: number,
  col: number,
): Promise<{ correct: boolean; movesLeft: number; completed: boolean; newPathIndex: number } | { error: string }> {
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
    .from('profiles').select('fishing_xp, expedition_xp').eq('id', user.id).single()

  const fishingLevel = getLevelFromXP(profile?.fishing_xp ?? 0)
  const expeditionLevel = getExpeditionLevel(profile?.expedition_xp ?? 0)
  const totalLevels = fishingLevel + expeditionLevel

  let { data: progress } = await admin
    .from('chart_progress').select('*')
    .eq('user_id', user.id).eq('contest_id', contestId).maybeSingle()

  if (!progress) {
    const { data: np } = await admin
      .from('chart_progress')
      .insert({ user_id: user.id, contest_id: contestId })
      .select('*').single()
    progress = np
  }
  if (!progress) return { error: 'Progress error' }
  if (totalLevels - progress.moves_used <= 0) return { error: 'No moves available' }
  if (progress.completed_at) return { error: 'Already completed' }

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

  const newMovesUsed = progress.moves_used + 1
  const newPathIndex = correct ? currentPathIndex + 1 : currentPathIndex
  const completed = correct && newPathIndex === path.length - 1

  await Promise.all([
    admin.from('chart_guesses').insert({ user_id: user.id, contest_id: contestId, row, col, correct }),
    admin.from('chart_progress').update({
      moves_used: newMovesUsed,
      path_index: newPathIndex,
      ...(completed ? { completed_at: new Date().toISOString() } : {}),
    }).eq('user_id', user.id).eq('contest_id', contestId),
  ])

  return { correct, movesLeft: Math.max(0, totalLevels - newMovesUsed), completed, newPathIndex }
}

const VALID_COLORS = ['#f0c040', '#d04040', '#4080c0', '#30b870', '#706080', '#e8e0d0', '#9060c0', '#c07040']

export async function claimChartReward(
  contestId: number,
  shipColor: string,
): Promise<{ success: true } | { error: string }> {
  if (!VALID_COLORS.includes(shipColor)) return { error: 'Invalid color' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: progress } = await admin
    .from('chart_progress').select('completed_at')
    .eq('user_id', user.id).eq('contest_id', contestId).single()

  if (!progress?.completed_at) return { error: 'Not completed' }

  await Promise.all([
    admin.from('chart_progress').update({ ship_color: shipColor }).eq('user_id', user.id).eq('contest_id', contestId),
    admin.from('profiles').update({ ship_color: shipColor }).eq('id', user.id),
  ])

  return { success: true }
}
