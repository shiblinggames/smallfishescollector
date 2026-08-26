// THE TRAWL DOCKS — where a crew is actually sent out.
//
// Its own island on the ocean hub. Sending used to be available from any screen
// that showed the trawl panel, which made a voyage into a menu you opened; now
// it is somewhere you go. Collecting is deliberately NOT gated to this island —
// see the `canDeploy` note in TrawlIndicator.
//
// Admin-gated with the rest of the hub.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getDailyChallenge } from '../fishing/dailyChallengeActions'
import TrawlDocksClient from './TrawlDocksClient'

export const metadata = { title: 'The Trawl Docks' }

export default async function TrawlDocksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')
  // THE DAY'S ORDERS come with the page. They have always been ticking from
  // every cast — progress is written server-side inside reelIn — so the only
  // thing that was ever missing out here was somewhere to see and claim them.
  const daily = await getDailyChallenge()

  return <TrawlDocksClient daily={daily} />
}
