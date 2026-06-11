import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RouletteClient from '../RouletteClient'
import { getRouletteState } from './actions'

export default async function RoulettePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await getRouletteState()

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <RouletteClient initial={state} />
      </div>
    </main>
  )
}
