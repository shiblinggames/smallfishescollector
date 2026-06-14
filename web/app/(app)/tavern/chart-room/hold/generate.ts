import { createAdminClient } from '@/lib/supabase/admin'
import { HOLD_DIFFICULTIES, HOLD_META, holdWeekStr, type HoldDifficulty } from './constants'
import { generatePuzzle, type SudokuPuzzle } from './sudoku'

// The Hold generator — three fresh sudoku a WEEK (easy / medium / hard),
// generated ALGORITHMICALLY (no Claude) via the pure engine in ./sudoku
// and cached in daily_sudoku (the `date` column holds the week's Monday).
// Same cache-fetch / generate-on-miss / fall-back-to-latest shape as the
// trivia games.
//
// Every puzzle has a guaranteed-unique solution (see sudoku.dig). The
// solution is stored alongside the givens but is SERVER-ONLY; the
// client payload (see actions.getHoldState) ever only carries givens.

export type { SudokuPuzzle } from './sudoku'
export type SudokuSet = Record<HoldDifficulty, SudokuPuzzle>

function generateSet(): SudokuSet {
  return {
    easy: generatePuzzle(HOLD_META.easy.givens),
    medium: generatePuzzle(HOLD_META.medium.givens),
    hard: generatePuzzle(HOLD_META.hard.givens),
  }
}

export async function getThisWeeksSudoku(): Promise<SudokuSet | null> {
  const admin = createAdminClient()
  const week = holdWeekStr()

  const { data: cached } = await admin
    .from('daily_sudoku')
    .select('puzzles')
    .eq('date', week)
    .single()

  if (cached) return cached.puzzles as SudokuSet

  try {
    const puzzles = generateSet()
    for (const d of HOLD_DIFFICULTIES) {
      const p = puzzles[d]
      if (!p || p.givens.length !== 81 || p.solution.length !== 81) {
        throw new Error(`Bad puzzle for ${d}`)
      }
    }
    await admin.from('daily_sudoku').insert({ date: week, puzzles })
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
