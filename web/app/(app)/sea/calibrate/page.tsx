// THE ISLAND BENCH — where the buildings standing on an island get their
// numbers, against the actual island rather than a guess at one.
//
// The same shape as /home/calibrate and /shipyard/calibrate: admin only, linked
// from nowhere, and it writes nothing anywhere. Drag, then paste the table it
// prints into the file it came from.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import CalibrateIslands from './CalibrateIslands'

export const metadata = { title: 'Island bench' }

export default async function IslandBenchPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')

  return <CalibrateIslands />
}
