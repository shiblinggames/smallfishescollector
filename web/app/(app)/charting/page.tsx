import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChartingFrame from './ChartingFrame'
import { getMatchState } from './actions'
import TreasureMatchGame from './TreasureMatchGame'

// /charting is Treasure Match (weekly Match-3). Replaced The Minefield
// 2026-06-15 (minesweeper had too high a learning curve); the
// minefield_* tables are dormant.
export default async function TreasureMatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getMatchState()

  return (
    <ChartingFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <TreasureMatchGame initial={state} />}
    </ChartingFrame>
  )
}
