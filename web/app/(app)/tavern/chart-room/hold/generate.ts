import { createAdminClient } from '@/lib/supabase/admin'
import { holdWeekStr } from './constants'
import { buildSudokuSet, hasAllDifficulties, type SudokuSet } from '@/lib/chartBoards'

// The Hold generator — FOUR fresh sudoku a week (Skiff / Galleon /
// Dreadnought / Man-o-War), generated ALGORITHMICALLY (no Claude) via the
// pure engine in ./sudoku and cached in daily_sudoku (the `date` column
// holds the week's Monday). Same cache-fetch / generate-on-miss /
// fall-back-to-latest shape as the trivia games.
//
// Every puzzle has a guaranteed-unique solution (see sudoku.dig). The
// solution is stored alongside the givens but is SERVER-ONLY; the
// client payload (see actions.getHoldState) ever only carries givens.

// Built by lib/chartBoards, which the offline store shares.
export type { SudokuPuzzle, SudokuSet } from '@/lib/chartBoards'

export async function getThisWeeksSudoku(): Promise<SudokuSet | null> {
  const admin = createAdminClient()
  const week = holdWeekStr()

  const { data: cached } = await admin
    .from('daily_sudoku')
    .select('puzzles')
    .eq('date', week)
    .single()

  if (cached && hasAllDifficulties(cached.puzzles)) return cached.puzzles as SudokuSet

  try {
    const puzzles = buildSudokuSet()   // throws on a bad puzzle
    // upsert (not insert) so a stale current-week row is overwritten with the
    // full four-difficulty set.
    await admin.from('daily_sudoku').upsert({ date: week, puzzles })
    return puzzles
  } catch (err) {
    console.error('[the-hold] generation failed:', err)
    const { data: fallback } = await admin
      .from('daily_sudoku')
      .select('puzzles')
      .lt('date', week)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    return (fallback?.puzzles as SudokuSet | undefined) ?? null
  }
}
