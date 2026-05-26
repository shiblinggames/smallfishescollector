import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import DailyBonusClient from './DailyBonusClient'
import { isPremiumActive } from '@/lib/premium'

export default async function DailyBonusPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, doubloons, is_premium, premium_expires_at, last_daily_claim, last_pack_claim, last_worm_claim, gems')
    .eq('id', user.id)
    .single()

  const isPremium = isPremiumActive(profile)

  const baseAmount = isPremium ? 100 : 50

  return (
    <>
      <main className="min-h-screen pb-24 sm:pb-0 pt-8">
        <div className="px-6 max-w-lg mx-auto">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Tavern</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8] mb-6" style={{ fontSize: '1.4rem' }}>Daily Bonus</h1>
          <DailyBonusClient
            dailyClaimed={profile?.last_daily_claim === today}
            packClaimed={profile?.last_pack_claim === today}
            wormClaimed={profile?.last_worm_claim === today}
            baseAmount={baseAmount}
            isPremium={isPremium}
          />
        </div>
      </main>
    </>
  )
}
