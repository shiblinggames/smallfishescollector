// THE CALLOUT BENCH — where the shipyard's labels get their numbers.
//
// The preview is a composite: a hull, a figure, a hat overlay, a pet, and a rod
// whose hook alone is 204.5% wide at left -10.5%. Nothing about it can be
// worked out from the sprite dimensions, so the anchors and the label positions
// were always going to be placed by eye. This is the eye.
//
// Drag either end of a callout, then copy the table it prints into
// ./callouts.ts. Not a game screen and not linked from one: admin only, and no
// writes anywhere.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import CalibrateClient from './CalibrateClient'

export const metadata = { title: 'Callout bench' }

export default async function CalibratePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/sea')

  return (
    <CalibrateClient
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      equippedHat={(profile?.equipped_hat as string | null) ?? null}
      equippedBoat={(profile?.equipped_boat as string | null) ?? null}
      equippedPet={(profile?.equipped_pet as string | null) ?? null}
      equippedPetBow={(profile?.equipped_pet_bow as string | null) ?? null}
      rodTier={Number(profile?.rod_tier ?? 0)}
      reelTier={Number(profile?.reel_tier ?? 0)}
      hookTier={Number(profile?.hook_tier ?? 0)}
    />
  )
}
