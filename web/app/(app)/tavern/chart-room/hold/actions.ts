'use server'

// The Quartermaster's Hold — server-authoritative play. The day's
// solutions only ever live server-side; the client receives givens
// only, and every tally / submit is judged here.
//
// FOUR holds a week, all open: the player can play + solve any or all of
// the four difficulties independently (no lock). Each solve pays doubloons
// (difficulty + clean bonus) AND banks its difficulty in charting points
// (1-4, permanent, accumulate toward the World Chart). Types live in
// ./constants ('use server' files silently drop non-async exports at build).

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { grant } from '@/lib/wallet'
import { getThisWeeksSudoku } from './generate'
import {
  HOLD_DIFFICULTIES,
  HOLD_META,
  holdPayout,
  holdPoints,
  holdWeekStr,
  isHoldDifficulty,
  isValidBoardString,
  HOLD_CELLS,
  type HoldDifficulty,
  type HoldState,
  type HoldPuzzleClient,
  type TallyHoldResult,
  type SubmitHoldResult,
} from './constants'

/** `notes` are the PENCIL marks, 81 comma-separated digit runs ("12,,459,...").
 *  Optional: saves written before pencil marks were persisted have no field,
 *  and an absent one restores as an empty grid exactly as it did then. */
interface ProgressEntry { entries: string; hints: number; notes?: string }
interface SolvedEntry { doubloons: number; clean: boolean; points: number; solved_at: string }

interface AttemptRow {
  progress: Partial<Record<HoldDifficulty, ProgressEntry>>
  solved: Partial<Record<HoldDifficulty, SolvedEntry>>
  doubloons_awarded: number
  /** The row's stamp as read; every write is guarded on it (see saveAttempt).
   *  undefined = no row yet. */
  updated_at?: string | null
}

const ATTEMPT_COLS = 'progress, solved, doubloons_awarded, updated_at'

// The period key for the Hold is the week's Monday (made weekly
// 2026-06-14); the `date` column on daily_sudoku / sudoku_attempts holds
// it. Kept the name `today` at call sites to minimise churn.
function todayStr(): string {
  return holdWeekStr()
}

function emptyAttempt(): AttemptRow {
  return { progress: {}, solved: {}, doubloons_awarded: 0 }
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

/** Write the attempt row, but only over the exact row this request read
 *  (its updated_at stamp). Every write here rewrites the whole progress and
 *  solved maps, so without the guard a tally racing a solve could write the
 *  solve away (and pay it again), or a save racing a tally could put the hint
 *  count back. false = another write landed first; nothing was written. */
async function saveAttempt(
  userId: string,
  today: string,
  read: AttemptRow,
  next: Pick<AttemptRow, 'progress' | 'solved' | 'doubloons_awarded'>,
): Promise<boolean> {
  const admin = createAdminClient()
  const row = { ...next, updated_at: new Date().toISOString() }
  if (read.updated_at === undefined) {
    const { error } = await admin.from('sudoku_attempts').insert({ user_id: userId, date: today, ...row })
    return !error
  }
  const q = admin.from('sudoku_attempts').update(row).eq('user_id', userId).eq('date', today)
  const { data } = await (read.updated_at === null ? q.is('updated_at', null) : q.eq('updated_at', read.updated_at))
    .select('user_id')
  return !!data && data.length > 0
}

async function loadPuzzlePoints(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('puzzle_points').eq('id', userId).single()
  return (data?.puzzle_points as number | null) ?? 0
}

export async function getHoldState(): Promise<HoldState | { error: string }> {

  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const today = todayStr()
  const [puzzles, attempt, points] = await Promise.all([
    getThisWeeksSudoku(),
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
      notes: prog?.notes ?? null,
      hintsUsed: prog?.hints ?? 0,
      solved: solved ? { doubloons: solved.doubloons, clean: solved.clean } : null,
    }
  })

  return {
    date: today,
    puzzles: out,
    doubloonsAwarded: attempt.doubloons_awarded,
    puzzlePoints: points,
  }
}

/** Persist in-flight entries so the player can resume. Lightweight:
 *  writes only the board, never touches the hint count or solved map. */
/** 81 comma-separated runs of unique digits 1-9, or empty. Rejects anything
 *  else so a forged save cannot stuff arbitrary text into the attempt row. */
function isValidNotesString(n: string): boolean {
  if (n.length > 81 * 10) return false
  const parts = n.split(',')
  if (parts.length !== 81) return false
  return parts.every(p => /^[1-9]*$/.test(p) && new Set(p).size === p.length)
}

export async function saveHoldProgress(
  difficulty: HoldDifficulty,
  entries: string,
  notes?: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }
  if (notes != null && !isValidNotesString(notes)) return { error: 'Invalid notes' }

  const admin = createAdminClient()
  const today = todayStr()
  const attempt = await loadAttempt(user.id, today)
  if (attempt.solved[difficulty]) return { ok: true } // already banked

  const prevHints = attempt.progress[difficulty]?.hints ?? 0
  const prevNotes = attempt.progress[difficulty]?.notes
  const progress = { ...attempt.progress, [difficulty]: { entries, hints: prevHints, notes: notes ?? prevNotes } }
  // A save that loses a race is simply skipped; the next autosave carries it.
  await saveAttempt(user.id, today, attempt, { progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded })
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
  const [puzzles, attempt] = await Promise.all([getThisWeeksSudoku(), loadAttempt(user.id, today)])
  if (!puzzles) return { error: 'No holds available' }

  const solution = puzzles[difficulty].solution
  const wrong = new Array(HOLD_CELLS).fill(false)
  for (let i = 0; i < HOLD_CELLS; i++) {
    if (entries[i] !== '.' && entries[i] !== solution[i]) wrong[i] = true
  }

  const hints = (attempt.progress[difficulty]?.hints ?? 0) + 1
  const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
  // The hint is recorded before the mask goes back; no record, no mask.
  if (!(await saveAttempt(user.id, today, attempt, { progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded }))) {
    return { error: 'The quartermaster lost count. Try again.' }
  }

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
    getThisWeeksSudoku(),
    loadAttempt(user.id, today),
    createAdminClient().from('profiles').select('puzzle_points').eq('id', user.id).single(),
  ])
  if (!puzzles) return { error: 'No holds available' }
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
    // A wrong submit hands back the same wrong-cell mask a tally does, so it
    // counts as a tally. Free masks let a full board be walked to the answer
    // one resubmit at a time and still paid as clean.
    const hints = (attempt.progress[difficulty]?.hints ?? 0) + 1
    const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
    if (!(await saveAttempt(user.id, today, attempt, { progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded }))) {
      return { error: 'The quartermaster lost count. Try again.' }
    }
    return {
      correct: false, wrong, doubloonsWon: 0, clean: false, newDoubloons: null,
      pointsWon: 0, newPuzzlePoints: (profile?.puzzle_points ?? 0), hintsUsed: hints,
    }
  }

  // Correct + first solve this week → pay doubloons + bank puzzle points.
  const clean = (attempt.progress[difficulty]?.hints ?? 0) === 0
  const doubloonsWon = holdPayout(difficulty, clean)
  const pointsWon = holdPoints(difficulty)
  const totalAwarded = attempt.doubloons_awarded + doubloonsWon
  const oldPoints = profile?.puzzle_points ?? 0
  const newPuzzlePoints = oldPoints + pointsWon

  const solved = {
    ...attempt.solved,
    [difficulty]: { doubloons: doubloonsWon, clean, points: pointsWon, solved_at: new Date().toISOString() },
  }
  const progress = {
    ...attempt.progress,
    [difficulty]: { entries, hints: attempt.progress[difficulty]?.hints ?? 0 },
  }

  // Mark it stowed FIRST (guarded on the row we read); pay only if this
  // request is the one that stowed it. Two submits fired together cannot
  // both be paid.
  if (!(await saveAttempt(user.id, today, attempt, { progress, solved, doubloons_awarded: totalAwarded }))) {
    return { error: 'This hold is already stowed' }
  }
  const newDoubloons = await grant(admin, user.id, 'doubloons', doubloonsWon)
  await Promise.all([
    admin.from('profiles').update({ puzzle_points: newPuzzlePoints }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsWon,
      reason: `The Hold: ${HOLD_META[difficulty].label}${clean ? ' (clean)' : ''}`,
    }),
  ])

  // Badge hooks (can't be derived from stored state — weekly, one-shot feats):
  // Ship of the Line = solve the hardest hold; Clean Manifest = all four this week.
  if (difficulty === 'extreme') grantBadgeDirect(user.id, 'fully_laden').catch(() => {})
  if (Object.keys(solved).length === HOLD_DIFFICULTIES.length) grantBadgeDirect(user.id, 'clean_manifest').catch(() => {})

  return {
    correct: true, doubloonsWon, clean, newDoubloons,
    pointsWon, newPuzzlePoints,
  }
}
