import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import DailyBonusClient from './DailyBonusClient'
import { isPremiumActive } from '@/lib/premium'
import { kingWeekStr } from '@/app/(app)/tavern/trivia/constants'

export default async function DailyBonusPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const week = kingWeekStr()

  const { data: profile } = await admin
    .from('profiles')
    .select('is_premium, premium_expires_at, last_daily_claim, last_worm_claim, last_crate_claim_week')
    .eq('id', user.id)
    .single()

  const isPremium = isPremiumActive(profile)

  return (
    <main className="min-h-screen pb-24 sm:pb-0 pt-8">
      <div className="page-col">
        <DailyBonusClient
          isPremium={isPremium}
          gemsClaimed={profile?.last_daily_claim === today}
          baitClaimed={profile?.last_worm_claim === today}
          crateClaimed={profile?.last_crate_claim_week === week}
        />
      </div>
    </main>
  )
}
