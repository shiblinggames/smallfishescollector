import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import RedeemClient from './RedeemClient'

export default async function RedeemPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('packs_available, doubloons, gems')
    .eq('id', user.id)
    .single()

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 max-w-sm mx-auto">
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3" style={{ fontSize: '0.65rem' }}>
            Redeem a Pack Code
          </p>
          <RedeemClient />
        </div>
      </main>
    </>
  )
}
