import { redirect } from 'next/navigation'
import GameFrame from '@/components/GameFrame'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getPirateKingState } from './actions'
import PirateKing from './PirateKing'

export default async function PirateKingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, state] = await Promise.all([getCurrentProfile(), getPirateKingState()])

  return (
    <GameFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <PirateKing initial={state} parlorPoints={(profile?.parlor_points as number | null) ?? 0} />}
    </GameFrame>
  )
}
