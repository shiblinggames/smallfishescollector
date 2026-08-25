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
import SeaMap from './SeaMap'

export const metadata = { title: 'The Sea' }

export default async function SeaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')

  // THE PLAYER, not a marker. The same three pieces the fishing screen stacks —
  // character sprite, boat overlay, hat overlay — so the thing crossing the
  // ocean is recognisably the captain they dressed, in the boat they bought.
  // That is most of why this should read as THEIR sea.
  return (
    <SeaMap
      fishingXP={Number(profile?.fishing_xp ?? 0)}
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      boatId={(profile?.equipped_boat as string | null) ?? null}
      hatId={(profile?.equipped_hat as string | null) ?? null}
    />
  )
}
