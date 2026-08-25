// THE OCEAN HUB — admin only.
//
// The ocean IS the hub: a painted chart you sail across, with the Mainland
// (tavern, market, shops) as one stop on it rather than the front door. Ports
// you go ashore at, waters you fish. See chart.ts for the layout and SeaMap.tsx
// for why it is painted 2D rather than an engine.
//
// ADMIN ONLY while it finds its feet, the same way Chapter 4 shipped. It is not
// the landing page yet and should not become one until it has been lived with.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { BOATS } from '@/lib/boats'
import SeaMap from './SeaMap'

export const metadata = { title: 'The Sea' }

export default async function SeaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')

  // The player's EQUIPPED boat is the thing on the chart. Reusing a cosmetic
  // they already own is most of why this reads as THEIR ocean rather than as a
  // map screen with a generic marker on it.
  const equipped = (profile?.equipped_boat as string | null) ?? null
  const boat = BOATS.find(b => b.id === equipped) ?? BOATS[0]

  return (
    <SeaMap
      fishingXP={Number(profile?.fishing_xp ?? 0)}
      boatArt={boat.restImageUrl}
      characterName={(profile?.username as string | null) ?? 'Captain'}
    />
  )
}
