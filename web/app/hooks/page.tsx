import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import HookShop from './HookShop'

export default async function HooksPage() {
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
      <main className="min-h-screen pb-24 sm:pb-0">
        <div className="px-6 pt-8 pb-5 text-center">
          <h1
            className="font-cinzel font-700 text-[#f0ede8] leading-[0.92] tracking-[-0.01em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          >
            Tackle Shop.
          </h1>
          <p className="font-karla font-300 text-[#a0a09a] text-sm mt-3">
            Better hooks reach deeper waters.
          </p>
        </div>
        <HookShop
          hookTier={profile?.hook_tier ?? 0}
          doubloons={profile?.doubloons ?? 0}
        />
      </main>
    </>
  )
}
