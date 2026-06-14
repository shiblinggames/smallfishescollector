import { createAdminClient } from '@/lib/supabase/admin'
import { RIGGING_COLS, RIGGING_ROWS, RIGGING_COLORS, riggingWeekStr } from './constants'
import { generateBoard, type RiggingPair } from './rigging'

// Lay the Rigging weekly board generator — one fresh board a week,
// generated ALGORITHMICALLY (no Claude) via the pure engine in
// ./rigging and cached in rigging_boards. The board is solvable by
// construction; only the endpoint pairs are stored (no solution).

export interface RiggingLayout {
  cols: number
  rows: number
  pairs: RiggingPair[]
}

export async function getThisWeeksRigging(): Promise<RiggingLayout | null> {
  const admin = createAdminClient()
  const week = riggingWeekStr()

  const { data: cached } = await admin
    .from('rigging_boards')
    .select('layout')
    .eq('week', week)
    .single()

  if (cached) return cached.layout as RiggingLayout

  try {
    const board = generateBoard(RIGGING_COLS, RIGGING_ROWS, RIGGING_COLORS)
    const layout: RiggingLayout = { cols: board.cols, rows: board.rows, pairs: board.pairs }
    if (layout.pairs.length !== RIGGING_COLORS) throw new Error('Bad board')
    await admin.from('rigging_boards').insert({ week, layout })
    return layout
  } catch (err) {
    console.error('[rigging] generation failed:', err)
    const { data: fallback } = await admin
      .from('rigging_boards')
      .select('layout')
      .lt('week', week)
      .order('week', { ascending: false })
      .limit(1)
      .single()
    return (fallback?.layout as RiggingLayout | undefined) ?? null
  }
}
