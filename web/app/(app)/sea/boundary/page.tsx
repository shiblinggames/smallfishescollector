// THE BOUNDARY BENCH — where every object's collision gets drawn.
//
// Admin only, writes nothing: place circles on the art, copy the table into
// app/(app)/sea/colliders.ts. What you circle here is what a hull hits out
// there, through the same conversion the chart runs.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import BoundaryBench from './BoundaryBench'

export const metadata = { title: 'Boundary bench' }

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')
  return <BoundaryBench />
}
