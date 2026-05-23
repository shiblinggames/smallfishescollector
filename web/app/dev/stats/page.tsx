import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'

// Admin-only cross-player aggregate dashboard. Reads everything from the
// admin_stats() SQL function (one round-trip). Gated on profiles.is_admin.
export const dynamic = 'force-dynamic'

type Stat = { label: string; value: number | string; by?: string | null }

function fmt(n: unknown): string {
  return typeof n === 'number' ? n.toLocaleString() : String(n ?? '—')
}

export default async function DevStatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!prof?.is_admin) notFound()

  const { data } = await admin.rpc('admin_stats')
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = (data ?? {}) as any
  const byIf = (v: number, name: unknown) => (v > 0 ? (name as string) : null)

  // Raid id → boss display name (see lib/bossRaids.ts). Falls back to the raw
  // id so a newly-added raid still appears.
  const RAID_BOSS_NAMES: Record<string, string> = {
    corsairs_reckoning: 'Barnacle Pete',
    captain_krust: 'Captain Krust',
  }
  const raidBossStats: Stat[] = ((s.raids?.byBoss ?? []) as { raidId: string; players: number; completions: number }[])
    .map(b => ({
      label: RAID_BOSS_NAMES[b.raidId] ?? b.raidId,
      value: b.players,
      by: b.completions !== b.players ? `${b.completions} total clears` : null,
    }))

  const sections: { title: string; accent: string; stats: Stat[] }[] = [
    {
      title: 'Players', accent: '#60a5fa',
      stats: [
        { label: 'Total players',  value: s.players ?? 0 },
        { label: 'Active members', value: s.members ?? 0 },
      ],
    },
    {
      title: 'Fishing', accent: '#34d399',
      stats: [
        { label: 'Lines cast',         value: s.fishing?.casts ?? 0 },
        { label: 'Perfects landed',    value: s.fishing?.perfects ?? 0 },
        { label: 'Fish caught',        value: s.fishing?.caught ?? 0 },
        { label: 'Species discovered', value: s.fishing?.species ?? 0 },
        { label: 'Crates opened',      value: s.fishing?.crates ?? 0 },
      ],
    },
    {
      title: 'Raids', accent: '#f87171',
      stats: [
        { label: 'Raids cleared', value: s.raids?.cleared ?? 0 },
        { label: 'Biggest hit',   value: s.raids?.biggestHit ?? 0, by: byIf(s.raids?.biggestHit ?? 0, s.raids?.biggestHitBy) },
        ...raidBossStats,
      ],
    },
    {
      title: 'Tide Run', accent: '#22d3ee',
      stats: [
        { label: 'Total distance',  value: `${fmt(s.tideRun?.distance ?? 0)} m` },
        { label: 'Longest run',     value: `${fmt(s.tideRun?.longest ?? 0)} m`, by: byIf(s.tideRun?.longest ?? 0, s.tideRun?.longestBy) },
        { label: 'Beacons smashed', value: s.tideRun?.beacons ?? 0 },
        { label: 'Most beacons',    value: s.tideRun?.mostBeacons ?? 0, by: byIf(s.tideRun?.mostBeacons ?? 0, s.tideRun?.mostBeaconsBy) },
      ],
    },
    {
      title: 'Voyages', accent: '#c084fc',
      stats: [
        { label: 'Voyages completed', value: s.voyages?.completed ?? 0 },
        { label: 'Loot hauled',       value: `${fmt(s.voyages?.loot ?? 0)} ⟡` },
        { label: 'Crew lost',         value: s.voyages?.crewLost ?? 0 },
      ],
    },
    {
      title: 'Recruits', accent: '#7fd0a0',
      stats: [
        { label: 'Lifetime recruited', value: s.recruits?.lifetime ?? 0 },
        { label: 'Crew on rosters',    value: s.recruits?.total ?? 0 },
        { label: 'Legendary crew', value: s.recruits?.legendary ?? 0 },
        { label: 'Epic crew',      value: s.recruits?.epic ?? 0 },
        { label: 'Rare crew',      value: s.recruits?.rare ?? 0 },
        { label: 'Common crew',    value: s.recruits?.common ?? 0 },
        { label: 'Crew deployed',  value: s.recruits?.deployed ?? 0 },
      ],
    },
    {
      title: 'Tavern', accent: '#fb923c',
      stats: [
        { label: 'Slot spins',       value: s.tavern?.slotSpins ?? 0 },
        { label: 'Slot wins',        value: s.tavern?.slotWins ?? 0 },
        { label: 'Biggest slot win', value: `${fmt(s.tavern?.slotBiggest ?? 0)} ⟡` },
        { label: 'C&A rolls',        value: s.tavern?.caRolls ?? 0 },
        { label: 'C&A wins',         value: s.tavern?.caWins ?? 0 },
        { label: 'Biggest C&A win',  value: `${fmt(s.tavern?.caBiggest ?? 0)} ⟡` },
      ],
    },
    {
      title: 'Economy', accent: '#f0c040',
      stats: [
        { label: 'Doubloons earned', value: `${fmt(s.economy?.doubloonsEarned ?? 0)} ⟡` },
        { label: 'Doubloons spent',  value: `${fmt(s.economy?.doubloonsSpent ?? 0)} ⟡` },
        { label: 'Fish sold',        value: `${fmt(s.economy?.fishSold ?? 0)} ⟡` },
        { label: 'Gems earned',      value: `${fmt(s.economy?.gemsEarned ?? 0)} ◆` },
        { label: 'Doubloons held',   value: `${fmt(s.economy?.doubloonsHeld ?? 0)} ⟡` },
        { label: 'Gems held',        value: `${fmt(s.economy?.gemsHeld ?? 0)} ◆` },
      ],
    },
  ]

  return (
    <main className="min-h-screen" style={{ background: '#06101c', padding: '2rem 1rem 4rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.9rem', color: '#f5f2ec', marginBottom: 6 }}>Admin Stats</p>
        <p className="font-karla" style={{ fontSize: '0.92rem', color: '#b2aca3', marginBottom: 26 }}>
          Live cross-player aggregates across {fmt(s.players ?? 0)} players.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {sections.map(sec => (
            <div key={sec.title} style={{ background: 'rgba(8,14,24,0.55)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.2rem 1.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
                <span aria-hidden style={{ width: 4, height: 18, borderRadius: 2, background: sec.accent, flexShrink: 0 }} />
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.82rem', color: '#e4e0d9' }}>{sec.title}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {sec.stats.map(st => (
                  <div key={st.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <span className="font-karla" style={{ fontSize: '0.95rem', color: '#c6c0b7' }}>{st.label}</span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: sec.accent }}>{fmt(st.value)}</span>
                      {st.by && <span className="font-karla" style={{ display: 'block', fontSize: '0.7rem', color: '#928d84', marginTop: 2 }}>{st.by}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
