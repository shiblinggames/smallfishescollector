import { createAdminClient } from '@/lib/supabase/admin'
import { MINEFIELD_COLS, MINEFIELD_ROWS, MINEFIELD_MINES, minefieldWeekStr } from './minefieldConstants'
import { generateBoard } from './minefield'

// The Minefield weekly board generator — one fresh board a week,
// generated ALGORITHMICALLY (no Claude) via the pure engine in
// ./minefield and cached in minefield_boards. Same cache-fetch /
// generate-on-miss / fall-back-to-latest shape as the trivia games.
//
// layout.mines is SERVER-ONLY and must never reach a client. layout.opening
// is the guaranteed-safe region auto-revealed for every player.

export interface MinefieldLayout {
  cols: number
  rows: number
  mineCount: number
  mines: number[]    // SERVER-ONLY
  opening: number[]
}

function buildLayout(): MinefieldLayout {
  const { mines, opening } = generateBoard(MINEFIELD_COLS, MINEFIELD_ROWS, MINEFIELD_MINES)
  return { cols: MINEFIELD_COLS, rows: MINEFIELD_ROWS, mineCount: MINEFIELD_MINES, mines, opening }
}

export async function getThisWeeksMinefield(): Promise<MinefieldLayout | null> {
  const admin = createAdminClient()
  const week = minefieldWeekStr()

  const { data: cached } = await admin
    .from('minefield_boards')
    .select('layout')
    .eq('week', week)
    .single()

  if (cached) return cached.layout as MinefieldLayout

  try {
    const layout = buildLayout()
    if (layout.mines.length !== MINEFIELD_MINES || layout.opening.length === 0) {
      throw new Error('Bad board')
    }
    await admin.from('minefield_boards').insert({ week, layout })
    return layout
  } catch (err) {
    console.error('[minefield] generation failed:', err)
    const { data: fallback } = await admin
      .from('minefield_boards')
      .select('layout')
      .lt('week', week)
      .order('week', { ascending: false })
      .limit(1)
      .single()
    return (fallback?.layout as MinefieldLayout | undefined) ?? null
  }
}
