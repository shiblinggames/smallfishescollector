import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ badge: 0 })

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: quiz }, { data: fotd }] = await Promise.all([
    admin.from('profiles').select('last_daily_claim, last_ship_claim').eq('id', user.id).single(),
    admin.from('quiz_answers').select('id').eq('user_id', user.id).eq('date', today).single(),
    admin.from('daily_fish_attempts').select('solved, guesses').eq('user_id', user.id).eq('date', today).single(),
  ])

  const bonusDone = profile?.last_daily_claim === today
  const quizDone = !!quiz
  const fotdDone = !!fotd && (fotd.solved || (fotd.guesses?.length ?? 0) >= 4)

  const badge = [!bonusDone, !quizDone, !fotdDone].filter(Boolean).length
  return NextResponse.json({ badge })
}
