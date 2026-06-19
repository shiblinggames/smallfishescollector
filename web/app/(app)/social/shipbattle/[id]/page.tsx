import { redirect, notFound } from 'next/navigation'
import { getShipBattleState } from '@/app/(app)/social/shipBattleActions'
import { getCurrentProfile } from '@/lib/userData'
import { isPvpTester } from '@/lib/shipBattle/access'
import ShipBattleClient from './ShipBattleClient'

export default async function ShipBattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Ship duels are in private testing.
  const profile = await getCurrentProfile()
  if (!isPvpTester(profile?.username)) redirect('/expeditions')

  const state = await getShipBattleState(id)
  if ('error' in state) notFound()
  // The battle screen is only for accepted duels (active / finished). A still-
  // pending or declined invite is handled from the social list, not here.
  if (state.status === 'pending' || state.status === 'declined') redirect('/social')

  return (
    <main className="min-h-screen pt-2">
      <ShipBattleClient initial={state} id={id} />
    </main>
  )
}
