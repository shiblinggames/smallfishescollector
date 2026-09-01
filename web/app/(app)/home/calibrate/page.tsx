// THE ROOM BENCH — where the homestead's furniture gets its numbers.
//
// A room is a painted shell and the furniture is a stack of overlays on top of
// it, so where a hearth SITS is a fact about a picture and not about anything a
// computer can read. The spots in lib/homestead were placed blind against eight
// freshly generated shells and they are guesses until somebody looks; a hearth
// two percent low reads as a fireplace hovering off the floor.
//
// Drag it while looking at it, then copy the table it prints into
// lib/homestead.ts. Not a game screen and not linked from one: admin only, and
// it writes nothing anywhere.
//
// Same shape as /shipyard/calibrate, which does this for the callouts.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { ROOMS, ROOM_BY_ID, type FurnitureSlot, type SlotSpot } from '@/lib/homestead'
import CalibrateRooms from './CalibrateRooms'

export const metadata = { title: 'Room bench' }

export default async function RoomBenchPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')

  // SEEDED FROM THE LIVE TABLE, so the bench opens on what the game is actually
  // drawing rather than on a blank grid. Whatever comes out of it is the same
  // shape going back in.
  const initial = (ROOM_BY_ID.main.spots ?? []) as Record<FurnitureSlot, SlotSpot>[]
  const contentInitial = Object.fromEntries(
    ROOMS.filter(r => r.id !== 'main')
      .map(r => [r.id, r.content ?? { x: 50, y: 50, w: 76 }]),
  )

  return <CalibrateRooms initial={initial} contentInitial={contentInitial} />
}
