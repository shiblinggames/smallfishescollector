export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { ZONES, type Expedition, type DailyExpeditionRow } from '@/lib/expeditions'
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

  const [{ data: profile }, { data: expeditionRow }] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    admin.from('expeditions').select('*').eq('id', expeditionId).eq('user_id', user.id).single(),
  ])

  if (!expeditionRow) redirect('/expeditions')
  const expedition = expeditionRow as Expedition

  // Allow viewing completed/failed expeditions (redirect to results)
  if (expedition.status === 'completed' || expedition.status === 'failed') {
    redirect(`/expeditions/results?id=${expeditionId}`)
  }

  const today = new Date().toISOString().split('T')[0]
  if (expedition.expedition_date !== today) redirect('/expeditions')

  const { data: dailyRow } = await admin
    .from('daily_expeditions')
    .select('*')
    .eq('expedition_date', today)
    .eq('zone', expedition.zone)
    .single()

  if (!dailyRow) redirect('/expeditions')

  const zoneConfig = ZONES[expedition.zone]

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <VoyagePage
        expedition={expedition}
        dailyContent={dailyRow as DailyExpeditionRow}
        zoneName={zoneConfig.name}
        zoneIcon={zoneConfig.icon}
        totalEvents={zoneConfig.length - 1}
      />
    </>
  )
}
