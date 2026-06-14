'use server'

// The Minefield — server-authoritative play. The mine layout lives only
// here; the client learns a tile is a mine ONLY by busting on it (and a
// bust resets the board, so it can't be farmed for intel). Every reveal
// is judged + flood-filled server-side. First clear of the week banks
// puzzle points (toward the Den purse); unlimited retries, no doubloons.
// Types live in ./constants ('use server' strips non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getThisWeeksMinefield, type MinefieldLayout } from './generate'
import { floodReveal, adjacentMineCount, safeCellCount } from './minefield'
import { denDailyCap } from '@/app/(app)/tavern/constants'
import {
  MINEFIELD_POINTS, minefieldWeekStr,
  type MinefieldState, type RevealResult, type RevealedTile,
} from './constants'

interface AttemptRow {
  revealed: number[]
  flagged: number[]
  status: 'active' | 'cleared'
  points_awarded: number
  busts: number
}

const ATTEMPT_COLS = 'revealed, flagged, status, points_awarded, busts'

function tilesFrom(indices: number[], layout: MinefieldLayout): RevealedTile[] {
  const mines = new Set(layout.mines)
  return indices.map(i => ({ i, adj: adjacentMineCount(mines, i, layout.cols, layout.rows) }))
}

async function loadAttempt(userId: string, week: string): Promise<AttemptRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('minefield_attempts')
    .select(ATTEMPT_COLS)
    .eq('user_id', userId).eq('week', week)
    .single()
  return (data as AttemptRow | null) ?? null
}

async function loadPuzzlePoints(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('puzzle_points').eq('id', userId).single()
  return (data?.puzzle_points as number | null) ?? 0
}

async function persist(userId: string, week: string, a: AttemptRow) {
  const admin = createAdminClient()
  await admin.from('minefield_attempts').upsert({
    user_id: userId, week,
    revealed: a.revealed, flagged: a.flagged, status: a.status,
    points_awarded: a.points_awarded, busts: a.busts,
    updated_at: new Date().toISOString(),
  })
}

export async function getMinefieldState(): Promise<MinefieldState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const week = minefieldWeekStr()
  const [layout, existing, points] = await Promise.all([
    getThisWeeksMinefield(),
    loadAttempt(user.id, week),
    loadPuzzlePoints(user.id),
  ])
  if (!layout) return { error: 'No board this week. Try again in a moment.' }

  // First visit this week — start everyone on the guaranteed-safe opening.
  let a = existing
  if (!a) {
    a = { revealed: [...layout.opening], flagged: [], status: 'active', points_awarded: 0, busts: 0 }
    await persist(user.id, week, a)
  }

  return {
    week,
    cols: layout.cols,
    rows: layout.rows,
    mineCount: layout.mineCount,
    revealed: tilesFrom(a.revealed, layout),
    flagged: a.flagged,
    status: a.status,
    busts: a.busts,
    pointsAwarded: a.points_awarded,
    reward: MINEFIELD_POINTS,
    puzzlePoints: points,
    denCap: denDailyCap(points),
  }
}

export async function revealCell(index: number): Promise<RevealResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const week = minefieldWeekStr()
  const [layout, existing] = await Promise.all([getThisWeeksMinefield(), loadAttempt(user.id, week)])
  if (!layout) return { error: 'No board this week' }
  if (!Number.isInteger(index) || index < 0 || index >= layout.cols * layout.rows) {
    return { error: 'Invalid tile' }
  }

  const a: AttemptRow = existing ?? { revealed: [...layout.opening], flagged: [], status: 'active', points_awarded: 0, busts: 0 }

  if (a.status === 'cleared') {
    return { busted: false, cleared: true, revealed: tilesFrom(a.revealed, layout), status: 'cleared', busts: a.busts, pointsWon: 0, newPuzzlePoints: null }
  }

  const revealedSet = new Set(a.revealed)
  const flaggedSet = new Set(a.flagged)
  if (revealedSet.has(index) || flaggedSet.has(index)) {
    return { busted: false, cleared: false, revealed: tilesFrom(a.revealed, layout), status: 'active', busts: a.busts, pointsWon: 0, newPuzzlePoints: null }
  }

  const mines = new Set(layout.mines)

  // Struck a mine → bust: reset to the opening, keep flags, bump count.
  if (mines.has(index)) {
    a.revealed = [...layout.opening]
    a.busts += 1
    await persist(user.id, week, a)
    return { busted: true, cleared: false, revealed: tilesFrom(a.revealed, layout), status: 'active', busts: a.busts, pointsWon: 0, newPuzzlePoints: null }
  }

  // Safe → flood reveal, then check for a full clear.
  const fresh = floodReveal(mines, layout.cols, layout.rows, index, revealedSet, flaggedSet)
  fresh.forEach(i => revealedSet.add(i))
  a.revealed = [...revealedSet]

  const cleared = a.revealed.length >= safeCellCount(layout.cols, layout.rows, layout.mineCount)
  let pointsWon = 0
  let newPuzzlePoints: number | null = null

  if (cleared && a.points_awarded === 0) {
    a.status = 'cleared'
    a.points_awarded = MINEFIELD_POINTS
    pointsWon = MINEFIELD_POINTS
    const admin = createAdminClient()
    const oldPoints = await loadPuzzlePoints(user.id)
    newPuzzlePoints = oldPoints + MINEFIELD_POINTS
    await Promise.all([
      persist(user.id, week, a),
      admin.from('profiles').update({ puzzle_points: newPuzzlePoints }).eq('id', user.id),
    ])
  } else {
    if (cleared) a.status = 'cleared'
    await persist(user.id, week, a)
  }

  return {
    busted: false,
    cleared,
    revealed: tilesFrom(a.revealed, layout),
    status: a.status,
    busts: a.busts,
    pointsWon,
    newPuzzlePoints,
  }
}

export async function toggleFlag(index: number): Promise<{ flagged: number[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const week = minefieldWeekStr()
  const [layout, existing] = await Promise.all([getThisWeeksMinefield(), loadAttempt(user.id, week)])
  if (!layout) return { error: 'No board this week' }
  if (!Number.isInteger(index) || index < 0 || index >= layout.cols * layout.rows) {
    return { error: 'Invalid tile' }
  }

  const a: AttemptRow = existing ?? { revealed: [...layout.opening], flagged: [], status: 'active', points_awarded: 0, busts: 0 }
  if (a.status === 'cleared') return { flagged: a.flagged }
  if (a.revealed.includes(index)) return { flagged: a.flagged } // can't flag a revealed tile

  const set = new Set(a.flagged)
  if (set.has(index)) set.delete(index); else set.add(index)
  a.flagged = [...set]
  await persist(user.id, week, a)
  return { flagged: a.flagged }
}
