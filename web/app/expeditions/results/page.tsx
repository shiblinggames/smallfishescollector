import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import {
  ZONES, EXPEDITION_SHIP_STATS, HULL_POINTS, STAT_LABELS, STAT_ICONS, RARITY_COLORS,
  type Expedition, type DailyExpeditionRow, type EventResult, type EventNode,
} from '@/lib/expeditions'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

export default async function ExpeditionsResultsPage({
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

  // Still active — send to voyage
  if (expedition.status === 'active') redirect(`/expeditions/voyage?id=${expeditionId}`)

  const { data: dailyRow } = await admin
    .from('daily_expeditions')
    .select('event_sequence')
    .eq('expedition_date', expedition.expedition_date)
    .eq('zone', expedition.zone)
    .maybeSingle()

  const zoneConfig = ZONES[expedition.zone]
  const shipStats = EXPEDITION_SHIP_STATS[expedition.ship_tier]
  const hullMax = HULL_POINTS[expedition.ship_tier] ?? 3
  const failed = expedition.status === 'failed'
  const loot = expedition.loot
  const events: EventResult[] = expedition.events ?? []
  const eventSequence: EventNode[] = (dailyRow?.event_sequence ?? []) as EventNode[]
  const successCount = events.filter(e => e.outcome === 'success').length

  const rarityColor = loot?.lootRarity ? (RARITY_COLORS[loot.lootRarity] ?? '#f0c040') : '#6a6764'

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 max-w-lg mx-auto pb-12">

          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: '1.1rem' }}>{zoneConfig.icon}</span>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
                {zoneConfig.name}
              </p>
            </div>
            <h1 className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: failed ? '#f87171' : '#f0ede8' }}>
              {failed ? 'Expedition Failed' : 'Expedition Complete'}
            </h1>
            <p className="font-karla mt-1" style={{ fontSize: '0.72rem', color: '#6a6764' }}>
              {successCount} / {events.length} events succeeded · {hullMax - (expedition.hull_damage ?? 0)}/{hullMax} hull remaining
            </p>
          </div>

          {/* Loot summary */}
          {!failed && loot && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14,
                padding: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.1em] mb-3" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
                Loot Earned
              </p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.4rem' }}>
                    {loot.doubloons.toLocaleString()} ⟡
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764' }}>Doubloons</p>
                </div>
                {loot.cardFilename && loot.cardName && (
                  <div className="flex items-center gap-2.5 flex-1">
                    <img
                      src={IMG_BASE + loot.cardFilename}
                      alt={loot.cardName}
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                    <div>
                      <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: rarityColor, marginBottom: 2 }}>
                        {loot.lootRarity.charAt(0).toUpperCase() + loot.lootRarity.slice(1)} · {loot.cardVariantName}
                      </p>
                      <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.88rem' }}>
                        {loot.cardName}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failed message */}
          {failed && (
            <div
              style={{
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.15)',
                borderRadius: 14,
                padding: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <p className="font-karla text-[#f87171]" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                Your ship took too much damage and limped back to port. No rewards this run.
              </p>
            </div>
          )}

          {/* Event timeline */}
          {events.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: '1.25rem',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.1em] px-4 pt-3 pb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
                Voyage Log
              </p>
              {events.map((result, i) => {
                const node = eventSequence[result.nodeIndex]
                const success = result.outcome === 'success'
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-2.5"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1 }}>
                      {success ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
                        {node?.name ?? result.eventType}
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.65rem', color: '#6a6764', lineHeight: 1.4 }}>
                        {result.text}
                      </p>
                      {!result.noRoll && result.roll !== undefined && result.stat && (
                        <p className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4845', marginTop: 1 }}>
                          {STAT_ICONS[result.stat]} {result.roll} + {result.base} + {result.crewBonus ?? 0} = {result.total} vs {result.threshold}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ship stats used */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14,
              padding: '0.875rem 1rem',
              marginBottom: '1.25rem',
            }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
              {shipStats.name} Stats
            </p>
            <div className="grid grid-cols-5 gap-1">
              {(['combat', 'navigation', 'durability', 'speed', 'luck'] as const).map(stat => (
                <div key={stat} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.7rem', marginBottom: 1 }}>{STAT_ICONS[stat]}</p>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.75rem' }}>{shipStats[stat]}</p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', color: '#4a4845' }}>{STAT_LABELS[stat].slice(0, 3)}</p>
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/expeditions"
            style={{
              display: 'block',
              width: '100%',
              padding: '0.875rem',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              textAlign: 'center',
              textDecoration: 'none',
              fontSize: '0.72rem',
              color: '#a0a09a',
            }}
            className="font-karla font-700 uppercase tracking-[0.1em]"
          >
            Return to Port
          </Link>

        </div>
      </main>
    </>
  )
}
