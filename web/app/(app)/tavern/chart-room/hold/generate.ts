import { createAdminClient } from '@/lib/supabase/admin'
import { HOLD_DIFFICULTIES, HOLD_META, holdWeekStr, type HoldDifficulty } from './constants'
import { generatePuzzle, type SudokuPuzzle } from './sudoku'

// The Hold generator — FOUR fresh sudoku a week (Skiff / Galleon /
// Dreadnought / Man-o-War), generated ALGORITHMICALLY (no Claude) via the
// pure engine in ./sudoku and cached in daily_sudoku (the `date` column
// holds the week's Monday). Same cache-fetch / generate-on-miss /
// fall-back-to-latest shape as the trivia games.
//
// Every puzzle has a guaranteed-unique solution (see sudoku.dig). The
// solution is stored alongside the givens but is SERVER-ONLY; the
// client payload (see actions.getHoldState) ever only carries givens.

export type { SudokuPuzzle } from './sudoku'
export type SudokuSet = Record<HoldDifficulty, SudokuPuzzle>

function generateSet(): SudokuSet {
  return Object.fromEntries(
    HOLD_DIFFICULTIES.map(d => [d, generatePuzzle(HOLD_META[d].givens)]),
  ) as SudokuSet
}

/** A cached row is stale if it predates a difficulty (e.g. the week the
 *  4th hold was added), so it must be regenerated to include all four. */
function hasAllDifficulties(set: unknown): set is SudokuSet {
  return !!set && HOLD_DIFFICULTIES.every(d => {
    const p = (set as Record<string, unknown>)[d] as { givens?: string } | undefined
    return typeof p?.givens === 'string'
  })
}

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
    const puzzles = generateSet()
    for (const d of HOLD_DIFFICULTIES) {
      const p = puzzles[d]
      if (!p || p.givens.length !== 81 || p.solution.length !== 81) {
        throw new Error(`Bad puzzle for ${d}`)
      }
    }
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
