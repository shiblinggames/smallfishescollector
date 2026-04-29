export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { createAdminClient } from '@/lib/supabase/admin'
import { ZONES, EXPEDITION_SHIP_STATS, type ZoneKey } from '@/lib/expeditions'
import { getCollectionForCrew, getUserItems } from '../actions'
import PreparePage from './PreparePage'

export default async function ExpeditionsPreparePage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>
}) {
  const { zone: zoneParam } = await searchParams
  const zone = zoneParam as ZoneKey | undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!zone || !ZONES[zone]) redirect('/expeditions')

  const admin = createAdminClient()

  const [{ data: profile }, collection, userItems] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, ship_tier, gems, saved_crew').eq('id', user.id).single(),
    getCollectionForCrew(),
    getUserItems(),
  ])

  // Check for existing active expedition
  const { data: activeRun } = await admin
    .from('expeditions')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRun) redirect(`/expeditions/voyage?id=${activeRun.id}`)

  const shipTier = profile?.ship_tier ?? 0
  const zoneConfig = ZONES[zone]

  if (shipTier < zoneConfig.requiredShipTier) redirect('/expeditions')

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <PreparePage
        zone={zone}
        zoneConfig={zoneConfig}
        shipStats={EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]}
        shipTier={shipTier}
        doubloons={profile?.doubloons ?? 0}
        collection={collection}
        userItems={userItems}
        savedCrewVariantIds={(profile?.saved_crew as number[] | null) ?? []}
      />
    </>
  )
}
