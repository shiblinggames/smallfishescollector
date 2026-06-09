import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import RouletteClient from '../RouletteClient'
import { getRouletteState } from './actions'

export default async function RoulettePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin gate — Fish Roulette is hidden from the tavern hub for
  // non-admins while it gets a final tap-test in prod. Defense in
  // depth: even if someone URL-hits /tavern/roulette directly, they
  // bounce to the tavern. Flip both surfaces in tandem when ready
  // (tavern page's ArcadeSection + this gate).
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/tavern')

  const state = await getRouletteState()

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <RouletteClient initial={state} />
      </div>
    </main>
  )
}
