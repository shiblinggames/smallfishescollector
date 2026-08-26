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
import TrawlDocksClient from './TrawlDocksClient'

export const metadata = { title: 'The Trawl Docks' }

export default async function TrawlDocksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')
  return <TrawlDocksClient />
}
