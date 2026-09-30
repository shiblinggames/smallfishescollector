import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RouletteView from './RouletteView'
import { getRouletteState } from './actions'

export default async function RoulettePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getRouletteState()

  return <RouletteView initial={state} />
}
