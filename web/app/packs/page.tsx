import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PackOpener from './PackOpener'
import PacksIntroModal from './PacksIntroModal'
import { isPremiumActive } from '@/lib/premium'

export default async function PacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('packs_available, doubloons, gems, has_seen_packs_intro, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()

  const packsAvailable = profile?.packs_available ?? 0
  const doubloons = profile?.doubloons ?? 0
  const gems = profile?.gems ?? 0
  const isPremium = isPremiumActive(profile)

  return (
    <>
      <Nav packsAvailable={packsAvailable} doubloons={doubloons} gems={gems} />
      {!profile?.has_seen_packs_intro && <PacksIntroModal />}
      <main className="min-h-screen px-6 py-8 flex flex-col items-center justify-center">
        <PackOpener packsAvailable={packsAvailable} gems={gems} isPremium={isPremium} />
      </main>
    </>
  )
}
