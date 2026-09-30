import { redirect } from 'next/navigation'
import GameFrame from '@/components/GameFrame'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { isPremiumActive } from '@/lib/premium'
import { getCapstanState } from './actions'
import CapstanGame from './CapstanGame'

export default async function CapstanPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Spin the Capstan is a Captain-only game. Non-members get bounced back to the
  // Parlor (whose Capstan card shows the lock + upsell).
  const profile = await getCurrentProfile()
  if (!isPremiumActive(profile)) redirect('/tavern/trivia')

  const state = await getCapstanState()

  return (
    <GameFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <CapstanGame initial={state} parlorPoints={(profile?.parlor_points as number | null) ?? 0} />}
    </GameFrame>
  )
}
