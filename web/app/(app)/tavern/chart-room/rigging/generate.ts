import { createAdminClient } from '@/lib/supabase/admin'
import { riggingWeekStr } from './constants'
import { buildRiggingLayout, type RiggingLayout } from '@/lib/chartBoards'

// Lay the Rigging weekly board generator — one fresh board a week,
// generated ALGORITHMICALLY (no Claude) via the pure engine in
// ./rigging and cached in rigging_boards. The board is solvable by
// construction; only the endpoint pairs are stored (no solution).

// Built by lib/chartBoards, which the offline store shares.
export type { RiggingLayout } from '@/lib/chartBoards'

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
    const layout: RiggingLayout = buildRiggingLayout()   // throws on a bad board
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
