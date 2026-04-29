export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { ZONES } from '@/lib/expeditions'
import { getExpeditionState } from '../actions'
import VoyagePage from './VoyagePage'

export default async function ExpeditionsVoyagePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id: idParam } = await searchParams
  const expeditionId = idParam ? parseInt(idParam, 10) : null
  if (!expeditionId || isNaN(expeditionId)) redirect('/expeditions')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, stateResult] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    getExpeditionState(expeditionId),
  ])

  if ('error' in stateResult) redirect('/expeditions')

  const { expedition, nodeType, currentEvent, shopOptions } = stateResult

  if (expedition.status === 'completed' || expedition.status === 'failed') {
    redirect(`/expeditions/results?id=${expeditionId}`)
  }

  const zoneConfig = ZONES[expedition.zone]

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <VoyagePage
        expedition={expedition}
        nodeType={nodeType}
        currentEvent={currentEvent}
        shopOptions={shopOptions}
        zoneName={zoneConfig.name}
        zoneIcon={zoneConfig.icon}
      />
    </>
  )
}
