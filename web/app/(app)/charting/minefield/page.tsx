import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChartingFrame from '../ChartingFrame'
import { getMinefieldState } from '../minefieldActions'
import Minefield from '../MinefieldGame'

// /charting/minefield is The Minefield (weekly ship-minesweeper) — the
// optional second Chart Room puzzle alongside Treasure Match at /charting.
export default function MinefieldPage() {
  return <MinefieldLoader />
}

async function MinefieldLoader() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getMinefieldState()

  return (
    <ChartingFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <Minefield initial={state} />}
    </ChartingFrame>
  )
}
