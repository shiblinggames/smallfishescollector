// THE EXPEDITION CHART BENCH — where the shape of the campaign's water gets
// decided, against the real sail limit rather than a guess at it.
//
// The same shape as /sea/calibrate and /home/calibrate: admin only, linked from
// nowhere, and it writes nothing anywhere. Drag, then send what it prints.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import ChartBench from './ChartBench'

export const metadata = { title: 'Chart bench' }

export default async function ChartBenchPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')

  return <ChartBench />
}
