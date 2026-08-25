// THE SHIPYARD — where the loadout is committed before you sail.
//
// Reached from its own island on the ocean hub. Admin-gated with the rest of
// the hub: this is where the sea's loadout rules live, and those rules do not
// apply anywhere else yet.
//
// See docs/systems/ocean-hub.md for why the loadout moved off the fishing page.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { RODS } from '@/lib/rods'
import { getFishHold } from '@/lib/fishHold'
import { getLevelFromXP } from '@/lib/fishingLevel'
import ShipyardClient from './ShipyardClient'

export const metadata = { title: 'The Shipyard' }

export default async function ShipyardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('rod_inventory').select('rod_tier').eq('user_id', user.id)

  // Free rods never appear in rod_inventory — everybody has them, so there is
  // nothing to record. The shipyard has to add them back or a new captain sees
  // an empty rack and no way to fill it.
  const owned = new Set((rows ?? []).map(r => Number(r.rod_tier)))
  for (const r of RODS) if (r.cost === 0 && !r.earnedOnly && !r.traderOnly) owned.add(r.tier)

  const holdTier = Number(profile?.fish_hold_tier ?? 0)

  return (
    <ShipyardClient
      doubloons={Number(profile?.doubloons ?? 0)}
      fishingLevel={getLevelFromXP(Number(profile?.fishing_xp ?? 0))}
      equippedRod={Number(profile?.rod_tier ?? 0)}
      ownedRods={[...owned].sort((a, b) => a - b)}
      rackTier={Number(profile?.rod_rack_tier ?? 0)}
      aboard={(profile?.rods_aboard as number[] | null) ?? []}
      hullTier={Number(profile?.hull_speed_tier ?? 0)}
      holdTier={holdTier}
      holdCapacity={getFishHold(holdTier).capacity}
      completionistEffects={(profile?.completionist_effects as number[] | null) ?? null}
    />
  )
}
