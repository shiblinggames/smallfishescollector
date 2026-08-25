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
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getEffectiveRod } from '@/lib/rods'
import { getLine } from '@/lib/lines'
import { getReel } from '@/lib/reels'
import { getHook } from '@/lib/hooks'
import { getBait } from '@/lib/bait'
import { getLevelFromXP } from '@/lib/fishingLevel'
import SeaMap from './SeaMap'

export const metadata = { title: 'The Sea' }

export default async function SeaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')

  // EVERYTHING THE DIAL NEEDS TO BE THE REAL DIAL. buildFishZones takes the
  // same modifiers on the map as it does on the fishing screen, because a fish
  // must not be easier or harder depending on which surface you cast from.
  const rod = getEffectiveRod(
    Number(profile?.rod_tier ?? 0),
    (profile?.completionist_effects as number[] | null) ?? null,
  )
  const line = getLine(Number(profile?.line_tier ?? 0))

  // Bait: whatever they have most of, which is almost always what they would
  // have picked anyway. Choosing it properly is the full screen's job.
  const admin = createAdminClient()
  const { data: baitRows } = await admin
    .from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id)
  const best = ((baitRows ?? []) as { bait_type: string; quantity: number }[])
    .filter(b => b.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)[0]
  const baitType = best?.bait_type ?? 'worm'

  return (
    <SeaMap
      fishingXP={Number(profile?.fishing_xp ?? 0)}
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      boatId={(profile?.equipped_boat as string | null) ?? null}
      hatId={(profile?.equipped_hat as string | null) ?? null}
      // THE WHOLE RIG. You are fishing here, so what is in your hands should be
      // what you actually own — the same rod, reel and hook the fishing screen
      // draws, at the same overlay coordinates.
      gear={{
        rod: rod.imageUrl ?? null,
        rodGlow: rod.glow ? (rod.glowType ?? 'default') : null,
        rodColor: rod.color ?? null,
        reel: getReel(Number(profile?.reel_tier ?? 0)).imageUrl ?? null,
        hook: getHook(Number(profile?.hook_tier ?? 0)).imageUrl ?? null,
      }}
      bait={baitType}
      baitBonus={getBait(baitType).catchZoneBonus}
      baitQty={best?.quantity ?? 0}
      mods={{
        hookTier: Number(profile?.hook_tier ?? 0),
        linePenalty: line.penaltyMultiplier,
        rodCatchBonus: rod.catchZoneBonus ?? 0,
        rodPerfectBonus: rod.perfectZoneBonus ?? 0,
        fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
      }}
    />
  )
}
