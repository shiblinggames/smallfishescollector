// THE CREW-SLOT BENCH — where the crew portraits standing on each ship get
// their numbers, against the actual hull rather than a guess at one.
//
// The same shape as the island bench next door: admin only, linked from
// nowhere, and it writes nothing anywhere. Drag, flip her, then paste the
// table it prints into SHIP_CREW_SLOTS in lib/ships.ts.
import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import CrewSlotBench from './CrewSlotBench'

export const metadata = { title: 'Crew slot bench' }

export default async function CrewSlotBenchPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')
  return <CrewSlotBench />
}
