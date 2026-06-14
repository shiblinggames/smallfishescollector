'use server'

// The Quartermaster's Hold — server-authoritative play. The day's
// solutions only ever live server-side; the client receives givens
// only, and every tally / submit is judged here. One payout per
// difficulty per day; a clean solve (no tally used) pays a bonus.
// Types live in ./constants ('use server' files silently drop
// non-async exports at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysSudoku } from './generate'
import {
  HOLD_DIFFICULTIES,
  HOLD_META,
  holdPayout,
  isHoldDifficulty,
  isValidBoardString,
  HOLD_CELLS,
  type HoldDifficulty,
  type HoldState,
  type HoldPuzzleClient,
  type TallyHoldResult,
  type SubmitHoldResult,
} from './constants'

interface ProgressEntry { entries: string; hints: number }
interface SolvedEntry { doubloons: number; clean: boolean; solved_at: string }

interface AttemptRow {
  progress: Partial<Record<HoldDifficulty, ProgressEntry>>
  solved: Partial<Record<HoldDifficulty, SolvedEntry>>
  doubloons_awarded: number
}

const ATTEMPT_COLS = 'progress, solved, doubloons_awarded'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
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

export async function getHoldState(): Promise<HoldState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const today = todayStr()
  const [puzzles, attempt] = await Promise.all([getTodaysSudoku(), loadAttempt(user.id, today)])
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

  return { date: today, puzzles: out, doubloonsAwarded: attempt.doubloons_awarded }
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
  if (attempt.solved[difficulty]) return { ok: true } // already banked, nothing to save

  const prevHints = attempt.progress[difficulty]?.hints ?? 0
  const progress = { ...attempt.progress, [difficulty]: { entries, hints: prevHints } }
  await admin.from('sudoku_attempts').upsert({
    user_id: user.id, date: today,
    progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded,
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
    createAdminClient().from('profiles').select('doubloons').eq('id', user.id).single(),
  ])
  if (!puzzles) return { error: 'No holds available' }
  if (attempt.solved[difficulty]) return { error: 'This hold is already stowed' }

  const { givens, solution } = puzzles[difficulty]

  // Givens must be untouched, and the board must be complete.
  for (let i = 0; i < HOLD_CELLS; i++) {
    if (givens[i] !== '.' && entries[i] !== givens[i]) return { error: 'The manifest has been tampered with' }
  }
  if (entries.includes('.')) return { error: 'The hold is not yet full' }

  const correct = entries === solution
  const admin = createAdminClient()

  if (!correct) {
    // Persist the attempt + flag wrong cells, no payout, no reveal.
    const wrong = new Array(HOLD_CELLS).fill(false)
    for (let i = 0; i < HOLD_CELLS; i++) if (entries[i] !== solution[i]) wrong[i] = true
    const hints = attempt.progress[difficulty]?.hints ?? 0
    const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
    await admin.from('sudoku_attempts').upsert({
      user_id: user.id, date: today,
      progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded,
      updated_at: new Date().toISOString(),
    })
    return { correct: false, wrong, doubloonsWon: 0, clean: false, newDoubloons: null }
  }

  // Correct + first solve of the day for this difficulty → pay out.
  const clean = (attempt.progress[difficulty]?.hints ?? 0) === 0
  const doubloonsWon = holdPayout(difficulty, clean)
  const totalAwarded = attempt.doubloons_awarded + doubloonsWon
  const newDoubloons = (profile?.doubloons ?? 0) + doubloonsWon

  const solved = {
    ...attempt.solved,
    [difficulty]: { doubloons: doubloonsWon, clean, solved_at: new Date().toISOString() },
  }
  const progress = {
    ...attempt.progress,
    [difficulty]: { entries, hints: attempt.progress[difficulty]?.hints ?? 0 },
  }

  await Promise.all([
    admin.from('sudoku_attempts').upsert({
      user_id: user.id, date: today,
      progress, solved, doubloons_awarded: totalAwarded,
      updated_at: new Date().toISOString(),
    }),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsWon,
      reason: `Quartermaster's Hold: ${HOLD_META[difficulty].label}${clean ? ' (clean)' : ''}`,
    }),
  ])

  return { correct: true, doubloonsWon, clean, newDoubloons }
}
