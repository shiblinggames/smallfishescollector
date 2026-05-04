import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import {
  ZONES, EXPEDITION_SHIP_STATS, ENEMIES, EXPEDITION_ITEMS, computeTotalCrewStats,
  type Expedition, type ZoneLoot,
} from '@/lib/expeditions'
import { generateCaptainsLog } from '@/lib/captains-log'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

async function claimRewardInline(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  expedition: Expedition,
  userId: string,
): Promise<ZoneLoot> {
  const zone = ZONES[expedition.zone]
  const variance = 0.8 + Math.random() * 0.4
  const doubloons = Math.floor(zone.baseDoubloons * variance)

  const crew = computeTotalCrewStats(expedition.crew_loadout ?? [])
  const fortuneBonus = Math.min(crew.fortune / 200, 0.15)
  const effectiveDropChance = zone.itemDropChance + fortuneBonus

  let itemDropped: string | null = null
  if (zone.itemDropPool.length > 0 && Math.random() < effectiveDropChance) {
    const pool = zone.itemDropPool
    itemDropped = pool[Math.floor(Math.random() * pool.length)]

    const { data: existingItem } = await admin
      .from('expedition_items')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('item_id', itemDropped)
      .maybeSingle()

    if (existingItem) {
      await admin.from('expedition_items').update({ quantity: existingItem.quantity + 1 }).eq('id', existingItem.id)
    } else {
      await admin.from('expedition_items').insert({ user_id: userId, item_id: itemDropped, quantity: 1 })
    }
  }

  const loot: ZoneLoot = { doubloons, itemDropped }

  // Mark completed atomically — only if still active (prevents double-claim)
  const { data: claimed } = await admin
    .from('expeditions')
    .update({ status: 'completed', loot, completed_at: new Date().toISOString() })
    .eq('id', expedition.id)
    .eq('status', 'active')
    .select('id')
    .single()

  if (claimed) {
    const { data: profileData } = await admin.from('profiles').select('doubloons').eq('id', userId).single()
    const newDoubloons = (profileData?.doubloons ?? 0) + doubloons
    await Promise.all([
      admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', userId),
      admin.from('doubloon_transactions').insert({
        user_id: userId,
        amount: doubloons,
        reason: `Expedition reward: ${zone.name}`,
      }),
    ])
  }

  return loot
}

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
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    admin.from('expeditions').select('*').eq('id', expeditionId).eq('user_id', user.id).single(),
  ])

  if (!expeditionRow) redirect('/expeditions')
  let expedition = expeditionRow as Expedition

  const zoneConfig = ZONES[expedition.zone]

  if (expedition.status === 'active') {
    if (expedition.current_node >= zoneConfig.nodes.length) {
      // Zone complete but reward not yet claimed — claim it now server-side
      const loot = await claimRewardInline(admin, expedition, user.id)
      expedition = { ...expedition, status: 'completed', loot }
    } else {
      redirect(`/expeditions/voyage?id=${expeditionId}`)
    }
  }

  // Generate captain's log on first visit to results (covers all terminal states)
  if (!expedition.captains_log) {
    try {
      const combatLog = expedition.combat_state?.log ?? []
      const log = await generateCaptainsLog({
        expeditionId: expedition.id,
        zone: expedition.zone,
        shipTier: expedition.ship_tier,
        outcome: expedition.status === 'completed' ? 'completed' : 'failed',
        nodesCompleted: expedition.events?.filter(e => e.outcome === 'win' || e.outcome === 'event' || e.outcome === 'shop').length ?? 0,
        hullDamage: expedition.hull_damage ?? 0,
        crew: expedition.crew_loadout ?? [],
        combatLog,
        events: expedition.events ?? [],
        lootDoubloons: expedition.loot?.doubloons ?? 0,
      })
      await admin.from('expeditions').update({
        captains_log: log,
        log_generated_at: new Date().toISOString(),
      }).eq('id', expedition.id)
      expedition = { ...expedition, captains_log: log }
    } catch {
      // Log generation never blocks results display
    }
  }

  const ship = EXPEDITION_SHIP_STATS[expedition.ship_tier] ?? EXPEDITION_SHIP_STATS[0]
  const runBuffs = expedition.run_buffs ?? []
  const durabilityBuff = runBuffs.filter(b => b.effect === 'durability').reduce((s, b) => s + b.value, 0)
  const maxDurability = ship.durability + durabilityBuff
  const remainingDurability = Math.max(0, maxDurability - (expedition.hull_damage ?? 0))
  const failed = expedition.status === 'failed'
  const loot = expedition.loot
  const events = expedition.events ?? []
  const crew = expedition.crew_loadout ?? []

  const NODE_TYPE_LABEL: Record<string, string> = {
    fight: 'Combat',
    boss:  'Boss Fight',
    event: 'Event',
    shop:  'Shop',
  }

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 max-w-lg mx-auto pb-12 sm:[zoom:1.4]">

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
              {ship.name} · {remainingDurability}/{maxDurability} durability remaining
            </p>
          </div>

          {/* Loot summary */}
          {!failed && loot && (
            <div style={{
              background: 'rgba(240,192,64,0.06)',
              border: '1px solid rgba(240,192,64,0.2)',
              borderRadius: 14,
              padding: '1rem',
              marginBottom: '1.25rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.1em] mb-3" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
                Loot Earned
              </p>
              <div className="flex items-end gap-4">
                <div>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.4rem' }}>
                    +{loot.doubloons.toLocaleString()} ⟡
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764' }}>Doubloons</p>
                </div>
                {loot.itemDropped && (() => {
                  const item = EXPEDITION_ITEMS[loot.itemDropped]
                  return (
                    <div style={{
                      background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)',
                      borderRadius: 8, padding: '0.4rem 0.75rem',
                    }}>
                      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#a78bfa' }}>
                        {item?.name ?? loot.itemDropped.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764' }}>
                        {item?.effectDescription ?? 'Permanent item'}
                      </p>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Failed message */}
          {failed && (
            <div style={{
              background: 'rgba(248,113,113,0.06)',
              border: '1px solid rgba(248,113,113,0.15)',
              borderRadius: 14,
              padding: '1rem',
              marginBottom: '1.25rem',
            }}>
              <p className="font-karla text-[#f87171]" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                Your ship took too much damage and sank before reaching port. No rewards this run.
              </p>
            </div>
          )}

          {/* Node timeline */}
          {events.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: '1.25rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.1em] px-4 pt-3 pb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
                Voyage Log
              </p>
              {events.map((result, i) => {
                const enemyId = (result.details as Record<string, unknown>)?.enemyId as string | undefined
                const enemy = enemyId ? ENEMIES[enemyId] : null
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                      {result.outcome === 'win' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      ) : result.outcome === 'lose' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
                        {NODE_TYPE_LABEL[result.type] ?? result.type}
                        {enemy ? ` — ${enemy.name}` : ''}
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
                        {result.outcome === 'win' ? 'Victory'
                          : result.outcome === 'lose' ? 'Defeated'
                          : result.outcome === 'event' ? 'Choice made'
                          : result.outcome === 'shop' ? 'Visited shop'
                          : result.outcome}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Crew used */}
          {crew.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: '1.25rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.1em] px-4 pt-3 pb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>
                Crew
              </p>
              {crew.map((card, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-karla font-600 truncate" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{card.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{card.rarity}</p>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    {[{ label: 'PWR', val: card.power, color: '#f87171' }, { label: 'DGE', val: card.dodge, color: '#60a5fa' }, { label: 'FTN', val: card.fortune, color: '#f0c040' }].map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: s.color }}>{s.val}</p>
                        <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Captain's log */}
          {expedition.captains_log && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '1.25rem',
              background: 'rgba(180,120,30,0.05)',
              border: '0.5px solid rgba(180,120,30,0.18)',
              borderRadius: 14,
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: 'rgba(180,120,30,0.55)', marginBottom: '0.625rem' }}>
                Captain&apos;s Log
              </p>
              <p className="font-karla" style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', margin: 0 }}>
                {expedition.captains_log}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Link
              href={`/expeditions/prepare?zone=${expedition.zone}`}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.875rem',
                background: 'rgba(240,192,64,0.1)',
                border: '1px solid rgba(240,192,64,0.25)',
                borderRadius: 12,
                textAlign: 'center',
                textDecoration: 'none',
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
            >
              <span style={{ fontSize: '0.72rem', color: '#f0c040' }}>Run Again — {zoneConfig.entryCost} ⟡</span>
            </Link>
            <Link
              href="/expeditions"
              style={{
                display: 'block',
                width: '100%',
                padding: '0.875rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                textAlign: 'center',
                textDecoration: 'none',
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
            >
              <span style={{ fontSize: '0.72rem', color: '#6a6764' }}>Return to Port</span>
            </Link>
          </div>

        </div>
      </main>
    </>
  )
}
