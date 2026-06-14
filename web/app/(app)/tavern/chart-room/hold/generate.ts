import { createAdminClient } from '@/lib/supabase/admin'
import { HOLD_DIFFICULTIES, HOLD_META, type HoldDifficulty } from './constants'
import { generatePuzzle, type SudokuPuzzle } from './sudoku'

// The Quartermaster's Hold generator — three fresh sudoku a night
// (easy / medium / hard), generated ALGORITHMICALLY (no Claude) via the
// pure engine in ./sudoku and cached in daily_sudoku. Same
// cache-fetch / generate-on-miss / fall-back-to-latest shape as the
// Parlor's getTodaysBoard.
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

export async function getTodaysSudoku(): Promise<SudokuSet | null> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: cached } = await admin
    .from('daily_sudoku')
    .select('puzzles')
    .eq('date', today)
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
    await admin.from('daily_sudoku').insert({ date: today, puzzles })
    return puzzles
  } catch (err) {
    console.error('[quartermasters-hold] generation failed:', err)
    const { data: fallback } = await admin
      .from('daily_sudoku')
      .select('puzzles')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    return (fallback?.puzzles as SudokuSet | undefined) ?? null
  }
}
