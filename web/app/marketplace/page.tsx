import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import MarketplaceClient from './MarketplaceClient'

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('hook_tier, doubloons, packs_available')
    .eq('id', user.id)
    .single()

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <MarketplaceClient
          hookTier={profile?.hook_tier ?? 0}
          doubloons={profile?.doubloons ?? 0}
        />
      </main>
    </>
  )
}
