import { redirect } from 'next/navigation'
import GameFrame from '@/components/GameFrame'
import { getCurrentUser } from '@/lib/userData'
import { getHoldState } from './actions'
import QuartermastersHold from './QuartermastersHold'

export default async function QuartermastersHoldPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const state = await getHoldState()

  return (
    <GameFrame error={'error' in state ? state.error : undefined}>
      {!('error' in state) && <QuartermastersHold initial={state} />}
    </GameFrame>
  )
}
