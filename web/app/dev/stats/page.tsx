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
        { label: 'Jackpots hit',       value: s.fishing?.jackpots ?? 0 },
        { label: 'Double catches',     value: s.fishing?.doubles ?? 0 },
        { label: 'Snags (lines lost)', value: s.fishing?.snags ?? 0 },
        { label: 'Crates opened',      value: s.fishing?.crates ?? 0 },
      ],
    },
    {
      title: 'Raids', accent: '#f87171',
      stats: [
        { label: 'Raids cleared', value: s.raids?.cleared ?? 0 },
        { label: 'Biggest hit',   value: s.raids?.biggestHit ?? 0, by: byIf(s.raids?.biggestHit ?? 0, s.raids?.biggestHitBy) },
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
      title: 'Packs', accent: '#f0c040',
      stats: [
        { label: 'Packs opened', value: s.packs?.opened ?? 0 },
        { label: 'God packs',    value: s.packs?.godPacks ?? 0 },
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
        <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8', marginBottom: 4 }}>Admin Stats</p>
        <p className="font-karla" style={{ fontSize: '0.75rem', color: '#9a948c', marginBottom: 22 }}>
          Live cross-player aggregates across {fmt(s.players ?? 0)} players.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {sections.map(sec => (
            <div key={sec.title} style={{ background: 'rgba(8,14,24,0.55)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '0.95rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span aria-hidden style={{ width: 3, height: 13, borderRadius: 2, background: sec.accent, flexShrink: 0 }} />
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.66rem', color: '#d8d4cd' }}>{sec.title}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {sec.stats.map(st => (
                  <div key={st.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span className="font-karla" style={{ fontSize: '0.72rem', color: '#a8a29a' }}>{st.label}</span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: sec.accent }}>{fmt(st.value)}</span>
                      {st.by && <span className="font-karla" style={{ display: 'block', fontSize: '0.54rem', color: '#6a6764', marginTop: 1 }}>{st.by}</span>}
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
