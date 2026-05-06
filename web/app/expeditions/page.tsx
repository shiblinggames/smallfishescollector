import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { EXPEDITION_SHIP_STATS, type Expedition } from '@/lib/expeditions'
import RaidCard from './RaidCard'
import DailyVoyagePanel from './DailyVoyagePanel'
import VoyageHistory from './VoyageHistory'
import ExpeditionsTour from './ExpeditionsTour'
import { getCollectionForCrew } from './actions'
import { getDailyVoyageState } from './voyageActions'
import { getLevelFromXP, getXPProgress, getNavigatorTitle } from '@/lib/expeditionLevel'
import { getShipSkin } from '@/lib/shipSkins'

export default async function ExpeditionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: expeditionRows }, collection, dailyVoyageState, { data: voyageHistoryRows }] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, ship_tier, gems, saved_crew, ship_name, expedition_xp, equipped_ship_skin')
      .eq('id', user.id)
      .single(),
    admin.from('expeditions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'completed', 'failed'])
      .order('started_at', { ascending: false })
      .limit(20),
    getCollectionForCrew(),
    getDailyVoyageState(),
    admin.from('daily_voyages')
      .select('id, route, total_doubloons, total_gems, crew_lost, created_at, captains_log')
      .eq('user_id', user.id)
      .eq('status', 'revealed')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const shipTier = profile?.ship_tier ?? 0
  const doubloons = profile?.doubloons ?? 0
  const navLevel = getLevelFromXP(profile?.expedition_xp ?? 0)
  const recentExpeditions = (expeditionRows ?? []) as Expedition[]
  const savedCrewVariantIds: number[] = (profile?.saved_crew as number[] | null) ?? []
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const shipName = profile?.ship_name as string | null ?? null
  const equippedShipSkin = profile?.equipped_ship_skin as string | null ?? null
  const xpProgress = getXPProgress(profile?.expedition_xp ?? 0)

  // Compute crew scores server-side
  const crewCards = savedCrewVariantIds
    .map(id => collection.find(c => c.variantId === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
  const hasCrew = crewCards.length > 0
  const totalPower   = crewCards.reduce((s, c, i) => s + Math.round(c.power   * (i === 0 ? 1 : 0.8)), 0)
  const totalDodge   = crewCards.reduce((s, c, i) => s + Math.round(c.dodge   * (i === 0 ? 1 : 0.8)), 0)
  const totalFortune = crewCards.reduce((s, c, i) => s + Math.round(c.fortune * (i === 0 ? 1 : 0.8)), 0)
  const voyageScore  = totalPower + totalDodge + Math.round(totalFortune * 0.5)
  const powerMax     = shipStats.minDamage + Math.floor(totalPower / 4)
  const raidScore    = Math.floor(powerMax * 4) + Math.floor(shipStats.durability * 0.5) + Math.floor(totalDodge * 0.4) + Math.floor(totalFortune * 0.2)

  const skinFilter = equippedShipSkin ? (getShipSkin(equippedShipSkin)?.filter ?? 'none') : 'none'

  const activeExpedition = recentExpeditions.find(e => e.status === 'active') ?? null
  const hasPendingVoyage = !('error' in dailyVoyageState) && dailyVoyageState.todayVoyage !== null
  const hasActiveRaid = !!activeExpedition

  return (
    <>
      {/* Background image — sits above the black body but below all page content */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/expedition-background.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.92) 100%)',
        }} />
      </div>

      {/* All content — stacking context above the background */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={doubloons} gems={profile?.gems ?? 0} />

      <ExpeditionsTour />
      <main className="min-h-screen pb-24 sm:pb-0">

        <div className="px-5 max-w-lg mx-auto expeditions-content" style={{ paddingTop: '1rem' }}>

          {/* Ship Hero */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              background: 'rgba(6,8,12,0.82)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              padding: '1.25rem 1rem 1.1rem',
              position: 'relative',
            }}>
              <Link
                href="/expeditions/loadout"
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{ position: 'absolute', top: 14, right: 14, fontSize: '0.58rem', color: '#6a7490', textDecoration: 'none' }}
              >
                Loadout →
              </Link>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shipStats.image}
                alt={shipName ?? shipStats.name}
                style={{ width: 110, height: 110, objectFit: 'contain', display: 'block', margin: '0 auto 0.875rem', filter: skinFilter }}
              />

              <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.05rem', color: '#e0ddd8', marginBottom: '0.3rem' }}>
                {shipName ?? shipStats.name}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.62rem', color: '#7090c0' }}>Lv {xpProgress.level}</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#5a7aaa', fontStyle: 'italic' }}>{getNavigatorTitle(xpProgress.level)}</p>
                </div>
                <div style={{ width: 90, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${xpProgress.progress * 100}%`, background: 'linear-gradient(90deg, #4a6090 0%, #7090c0 100%)', boxShadow: '0 0 5px rgba(112,144,192,0.45)' }} />
                </div>
              </div>

              {hasCrew ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '2.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: '#9a9488', marginBottom: 3 }}>Voyage</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '2.4rem', color: '#f0ede8', lineHeight: 1 }}>{voyageScore}</p>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', marginTop: 4 }} />
                  <div style={{ textAlign: 'center' }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: '#9a9488', marginBottom: 3 }}>Raid</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '2.4rem', color: '#f0ede8', lineHeight: 1 }}>{raidScore}</p>
                  </div>
                </div>
              ) : (
                <p className="font-karla text-center" style={{ fontSize: '0.68rem', color: '#5a5248' }}>
                  No crew assigned —{' '}
                  <Link href="/expeditions/loadout" style={{ color: '#7090c0', textDecoration: 'none' }}>set loadout →</Link>
                </p>
              )}
            </div>
          </div>

          {/* ── Voyage card ── */}
          <div style={{ marginBottom: '1rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Voyages</p>
            <DailyVoyagePanel
              savedCrewVariantIds={savedCrewVariantIds}
              collection={collection}
              shipTier={shipTier}
              todayVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.todayVoyage}
              readyVoyage={'error' in dailyVoyageState ? null : dailyVoyageState.readyVoyage}
              expeditionXP={profile?.expedition_xp ?? 0}
              raidActive={hasActiveRaid}
            />
            <VoyageHistory voyages={(voyageHistoryRows ?? []) as import('./VoyageHistory').VoyageHistoryEntry[]} />
          </div>

          {/* ── Raids ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>Raids</p>
            <RaidCard navLevel={navLevel} />
          </div>

          <div className="pb-16" />
        </div>
      </main>
      </div>
    </>
  )
}
