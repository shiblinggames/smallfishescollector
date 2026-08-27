// THE WAKE BENCH — where each hull's cutwater gets placed.
//
// Where a stem meets water is not something a bounding box knows. These are
// three-quarter views with bowsprits of very different lengths, and the single
// formula that used to serve all six put the origin at 80% of the way to the
// prow on every one, which is wrong in a different direction each time.
//
// So it is placed by eye, against a moving wake, and the numbers are copied
// back into lib/ships.ts. Admin only, and it writes nothing.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import WakeBench from './WakeBench'

export const metadata = { title: 'Wake bench' }

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')

  return (
    <WakeBench
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      equippedBoat={(profile?.equipped_boat as string | null) ?? null}
      equippedHat={(profile?.equipped_hat as string | null) ?? null}
    />
  )
}
