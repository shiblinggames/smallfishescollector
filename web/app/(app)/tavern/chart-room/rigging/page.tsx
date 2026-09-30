import { redirect } from 'next/navigation'
import GameFrame from '@/components/GameFrame'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { isPremiumActive } from '@/lib/premium'
import { getRiggingState } from './actions'
import RiggingGame from './RiggingGame'

export default async function RiggingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Lay the Rigging is a members-only puzzle. Non-members get bounced back to
  // the Chart Room (whose Rigging card already shows the lock + upsell).
  const profile = await getCurrentProfile()
  if (!isPremiumActive(profile)) redirect('/tavern/chart-room')

  const state = await getRiggingState()

  return (
    <GameFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <RiggingGame initial={state} />}
    </GameFrame>
  )
}
