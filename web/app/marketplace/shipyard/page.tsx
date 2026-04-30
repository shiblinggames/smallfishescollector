import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ShipyardClient from './ShipyardClient'

export default async function ShipyardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('ship_tier, doubloons, packs_available, gems')
    .eq('id', user.id)
    .single()

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <ShipyardClient
          shipTier={profile?.ship_tier ?? 0}
          doubloons={profile?.doubloons ?? 0} />
      </main>
    </>
  )
}
