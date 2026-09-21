// THE HULL BENCH — where each class of boat gets the shape the water knows
// her by.
//
// Admin only, writes nothing: draw the footprint on the art, copy the table
// into app/(app)/sea/colliders.ts (HULL_COLLIDERS). The boundary bench next
// door draws the rocks; this draws the thing that hits them.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import HullBench from './HullBench'

export const metadata = { title: 'Hull bench' }

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')
  return (
    <HullBench
      characterColor={profile?.character_color ?? 'default'}
      equippedBoat={(profile?.equipped_boat as string | null) ?? null}
      equippedHat={(profile?.equipped_hat as string | null) ?? null}
    />
  )
}
