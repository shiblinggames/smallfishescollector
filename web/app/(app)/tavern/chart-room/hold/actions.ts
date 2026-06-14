'use server'

// The Quartermaster's Hold — server-authoritative play. The day's
// solutions only ever live server-side; the client receives givens
// only, and every tally / submit is judged here.
//
// One hold a day: the player LOCKS one difficulty (lockHold), then plays
// only that one. Solving it pays doubloons (difficulty + clean bonus)
// AND banks puzzle points (permanent, accumulate toward the Den purse
// tiers in tavern/constants denDailyCap). Types live in ./constants
// ('use server' files silently drop non-async exports at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysSudoku } from './generate'
import { denDailyCap, nextDenTier } from '../../constants'
import {
  HOLD_DIFFICULTIES,
  HOLD_META,
  holdPayout,
  holdPoints,
  isHoldDifficulty,
  isValidBoardString,
  HOLD_CELLS,
  type HoldDifficulty,
  type HoldState,
  type HoldPuzzleClient,
  type LockHoldResult,
  type TallyHoldResult,
  type SubmitHoldResult,
} from './constants'

interface ProgressEntry { entries: string; hints: number }
interface SolvedEntry { doubloons: number; clean: boolean; points: number; solved_at: string }

interface AttemptRow {
  progress: Partial<Record<HoldDifficulty, ProgressEntry>>
  solved: Partial<Record<HoldDifficulty, SolvedEntry>>
  doubloons_awarded: number
  locked_difficulty: HoldDifficulty | null
}

const ATTEMPT_COLS = 'progress, solved, doubloons_awarded, locked_difficulty'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function emptyAttempt(): AttemptRow {
  return { progress: {}, solved: {}, doubloons_awarded: 0, locked_difficulty: null }
}

async function loadAttempt(userId: string, today: string): Promise<AttemptRow> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('sudoku_attempts')
    .select(ATTEMPT_COLS)
    .eq('user_id', userId).eq('date', today)
    .single()
  const a = data as AttemptRow | null
  return a ?? emptyAttempt()
}

async function loadPuzzlePoints(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('puzzle_points').eq('id', userId).single()
  return (data?.puzzle_points as number | null) ?? 0
}

export async function getHoldState(): Promise<HoldState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const today = todayStr()
  const [puzzles, attempt, points] = await Promise.all([
    getTodaysSudoku(),
    loadAttempt(user.id, today),
    loadPuzzlePoints(user.id),
  ])
  if (!puzzles) return { error: 'No holds to stow right now. Try again in a moment.' }

  const out: HoldPuzzleClient[] = HOLD_DIFFICULTIES.map(d => {
    const prog = attempt.progress[d] ?? null
    const solved = attempt.solved[d] ?? null
    return {
      difficulty: d,
      givens: puzzles[d].givens,           // givens ONLY — never the solution
      progress: prog?.entries ?? null,
      hintsUsed: prog?.hints ?? 0,
      solved: solved ? { doubloons: solved.doubloons, clean: solved.clean } : null,
    }
  })

  return {
    date: today,
    puzzles: out,
    doubloonsAwarded: attempt.doubloons_awarded,
    lockedDifficulty: attempt.locked_difficulty,
    puzzlePoints: points,
    denCap: denDailyCap(points),
    nextTier: nextDenTier(points),
  }
}

/** Commit to one difficulty as today's hold. The other two stay closed
 *  until midnight. Idempotent for the same pick; rejects a switch. */
export async function lockHold(difficulty: HoldDifficulty): Promise<LockHoldResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }

  const today = todayStr()
  const attempt = await loadAttempt(user.id, today)
  if (attempt.locked_difficulty) {
    if (attempt.locked_difficulty !== difficulty) {
      return { error: "You already chose today's hold. Come back tomorrow for a fresh manifest." }
    }
    return { lockedDifficulty: attempt.locked_difficulty }
  }

  const admin = createAdminClient()
  await admin.from('sudoku_attempts').upsert({
    user_id: user.id, date: today,
    progress: attempt.progress, solved: attempt.solved,
    doubloons_awarded: attempt.doubloons_awarded,
    locked_difficulty: difficulty,
    updated_at: new Date().toISOString(),
  })
  return { lockedDifficulty: difficulty }
}

/** Guard: a difficulty can only be played once it's the locked one. */
function lockGuard(attempt: AttemptRow, difficulty: HoldDifficulty): string | null {
  if (!attempt.locked_difficulty) return 'Choose today’s hold first'
  if (attempt.locked_difficulty !== difficulty) return 'That hold is closed today'
  return null
}

/** Persist in-flight entries so the player can resume. Lightweight:
 *  writes only the board, never touches the hint count or solved map. */
export async function saveHoldProgress(
  difficulty: HoldDifficulty,
  entries: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }

  const admin = createAdminClient()
  const today = todayStr()
  const attempt = await loadAttempt(user.id, today)
  const guard = lockGuard(attempt, difficulty)
  if (guard) return { error: guard }
  if (attempt.solved[difficulty]) return { ok: true } // already banked

  const prevHints = attempt.progress[difficulty]?.hints ?? 0
  const progress = { ...attempt.progress, [difficulty]: { entries, hints: prevHints } }
  await admin.from('sudoku_attempts').upsert({
    user_id: user.id, date: today,
    progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded,
    locked_difficulty: attempt.locked_difficulty,
    updated_at: new Date().toISOString(),
  })
  return { ok: true }
}

/** Ask the quartermaster to tally the manifest: flags wrong filled
 *  cells against the solution. Spends the clean bonus (bumps hints). */
export async function tallyHold(
  difficulty: HoldDifficulty,
  entries: string,
): Promise<TallyHoldResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }

  const today = todayStr()
  const [puzzles, attempt] = await Promise.all([getTodaysSudoku(), loadAttempt(user.id, today)])
  if (!puzzles) return { error: 'No holds available' }
  const guard = lockGuard(attempt, difficulty)
  if (guard) return { error: guard }

  const solution = puzzles[difficulty].solution
  const wrong = new Array(HOLD_CELLS).fill(false)
  for (let i = 0; i < HOLD_CELLS; i++) {
    if (entries[i] !== '.' && entries[i] !== solution[i]) wrong[i] = true
  }

  const hints = (attempt.progress[difficulty]?.hints ?? 0) + 1
  const admin = createAdminClient()
  const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
  await admin.from('sudoku_attempts').upsert({
    user_id: user.id, date: today,
    progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded,
    locked_difficulty: attempt.locked_difficulty,
    updated_at: new Date().toISOString(),
  })

  return { wrong, hintsUsed: hints }
}

export async function submitHold(
  difficulty: HoldDifficulty,
  entries: string,
): Promise<SubmitHoldResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }

  const today = todayStr()
  const [puzzles, attempt, { data: profile }] = await Promise.all([
    getTodaysSudoku(),
    loadAttempt(user.id, today),
    createAdminClient().from('profiles').select('doubloons, puzzle_points').eq('id', user.id).single(),
  ])
  if (!puzzles) return { error: 'No holds available' }
  const guard = lockGuard(attempt, difficulty)
  if (guard) return { error: guard }
  if (attempt.solved[difficulty]) return { error: 'This hold is already stowed' }

  const { givens, solution } = puzzles[difficulty]

  for (let i = 0; i < HOLD_CELLS; i++) {
    if (givens[i] !== '.' && entries[i] !== givens[i]) return { error: 'The manifest has been tampered with' }
  }
  if (entries.includes('.')) return { error: 'The hold is not yet full' }

  const correct = entries === solution
  const admin = createAdminClient()

  if (!correct) {
    const wrong = new Array(HOLD_CELLS).fill(false)
    for (let i = 0; i < HOLD_CELLS; i++) if (entries[i] !== solution[i]) wrong[i] = true
    const hints = attempt.progress[difficulty]?.hints ?? 0
    const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
    await admin.from('sudoku_attempts').upsert({
      user_id: user.id, date: today,
      progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded,
      locked_difficulty: attempt.locked_difficulty,
      updated_at: new Date().toISOString(),
    })
    return {
      correct: false, wrong, doubloonsWon: 0, clean: false, newDoubloons: null,
      pointsWon: 0, newPuzzlePoints: (profile?.puzzle_points ?? 0),
      capBefore: denDailyCap(profile?.puzzle_points ?? 0), capAfter: denDailyCap(profile?.puzzle_points ?? 0),
    }
  }

  // Correct + first solve today → pay doubloons + bank puzzle points.
  const clean = (attempt.progress[difficulty]?.hints ?? 0) === 0
  const doubloonsWon = holdPayout(difficulty, clean)
  const pointsWon = holdPoints(difficulty, clean)
  const totalAwarded = attempt.doubloons_awarded + doubloonsWon
  const oldDoubloons = profile?.doubloons ?? 0
  const oldPoints = profile?.puzzle_points ?? 0
  const newDoubloons = oldDoubloons + doubloonsWon
  const newPuzzlePoints = oldPoints + pointsWon
  const capBefore = denDailyCap(oldPoints)
  const capAfter = denDailyCap(newPuzzlePoints)

  const solved = {
    ...attempt.solved,
    [difficulty]: { doubloons: doubloonsWon, clean, points: pointsWon, solved_at: new Date().toISOString() },
  }
  const progress = {
    ...attempt.progress,
    [difficulty]: { entries, hints: attempt.progress[difficulty]?.hints ?? 0 },
  }

  await Promise.all([
    admin.from('sudoku_attempts').upsert({
      user_id: user.id, date: today,
      progress, solved, doubloons_awarded: totalAwarded,
      locked_difficulty: attempt.locked_difficulty,
      updated_at: new Date().toISOString(),
    }),
    admin.from('profiles').update({ doubloons: newDoubloons, puzzle_points: newPuzzlePoints }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsWon,
      reason: `Quartermaster's Hold: ${HOLD_META[difficulty].label}${clean ? ' (clean)' : ''}`,
    }),
  ])

  return {
    correct: true, doubloonsWon, clean, newDoubloons,
    pointsWon, newPuzzlePoints, capBefore, capAfter,
  }
}
