// THE WATERLINE BENCH — where every object's submersion line gets drawn.
//
// Admin only, writes nothing: drag the line, copy the table into
// app/(app)/sea/submerge.ts. It renders through the same SubmergedSprite the
// chart uses, so what the bench shows is what the sea will do.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import WaterlineBench from './WaterlineBench'

export const metadata = { title: 'Waterline bench' }

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')
  return <WaterlineBench />
}
