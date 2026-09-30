import { redirect } from 'next/navigation'
import GameFrame from '@/components/GameFrame'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getCaptainsBoardState } from './actions'
import CaptainsBoard from './CaptainsBoard'

export default async function CaptainsBoardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, state] = await Promise.all([getCurrentProfile(), getCaptainsBoardState()])

  return (
    <GameFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <CaptainsBoard initial={state} parlorPoints={(profile?.parlor_points as number | null) ?? 0} />}
    </GameFrame>
  )
}
