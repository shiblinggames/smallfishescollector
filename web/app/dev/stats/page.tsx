import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GAUNTLET_UPGRADES } from '@/lib/gauntletUpgrades'
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

  const [{ data }, { data: trawlData }, { data: gauntletRows }, { data: flagRows }] = await Promise.all([
    admin.rpc('admin_stats'),
    admin.rpc('trawl_admin_stats'),
    admin.from('profiles')
      .select('username, gauntlet_deepest, gauntlet_best_depth, gauntlet_best_depth_ms, gauntlet_fathoms, gauntlet_upgrades')
      .eq('is_admin', false),
    admin.from('anomaly_flags')
      .select('user_id, kind, severity, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
  ])
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = (data ?? {}) as any
  const t = (trawlData ?? {}) as any
  const byIf = (v: number, name: unknown) => (v > 0 ? (name as string) : null)

  // ── Security flags — advisory anomaly signals (anomaly_flags). Aggregated per
  // player so repeat trippers float to the top. A cap-trip is a near-certain
  // forged call (a legit client can't exceed a legit ceiling). Advisory only.
  type FlagRow = { user_id: string; kind: string; severity: number; detail: any; created_at: string }
  const flagRowsArr = (flagRows ?? []) as FlagRow[]
  const flagUserIds = [...new Set(flagRowsArr.map(f => f.user_id))]
  const { data: flagUsers } = flagUserIds.length
    ? await admin.from('profiles').select('id, username').in('id', flagUserIds)
    : { data: [] as { id: string; username: string | null }[] }
  const nameById = new Map((flagUsers ?? []).map((u: any) => [u.id as string, (u.username as string | null)]))
  const flagByUser = new Map<string, { count: number; maxSev: number; kinds: Record<string, number> }>()
  for (const f of flagRowsArr) {
    const e = flagByUser.get(f.user_id) ?? { count: 0, maxSev: 0, kinds: {} }
    e.count += 1
    e.maxSev = Math.max(e.maxSev, f.severity)
    e.kinds[f.kind] = (e.kinds[f.kind] ?? 0) + 1
    flagByUser.set(f.user_id, e)
  }
  const flaggedUsers = [...flagByUser.entries()]
    .map(([uid, e]) => ({ uid, name: nameById.get(uid) ?? uid.slice(0, 8), ...e }))
    .sort((a, b) => b.maxSev - a.maxSev || b.count - a.count)

  // ── Davy Jones Gauntlet — computed in JS from the profile snapshot above
  // (no admin_stats RPC change needed). gauntlet_deepest = lifetime deepest incl.
  // deaths; gauntlet_best_depth = cash-out-only record (the leaderboard column).
  type GRow = { username: string | null; gauntlet_deepest: number | null; gauntlet_best_depth: number | null; gauntlet_best_depth_ms: number | null; gauntlet_fathoms: number | null; gauntlet_upgrades: string[] | null }
  const gRows = (gauntletRows ?? []) as GRow[]
  const descenders = gRows.filter(r => (r.gauntlet_deepest ?? 0) > 0)
  const deepestBanked = gRows.filter(r => (r.gauntlet_best_depth ?? 0) > 0).sort((a, b) => (b.gauntlet_best_depth ?? 0) - (a.gauntlet_best_depth ?? 0))[0] ?? null
  const deepestReached = [...descenders].sort((a, b) => (b.gauntlet_deepest ?? 0) - (a.gauntlet_deepest ?? 0))[0] ?? null
  const fathomsHeld = gRows.reduce((a, r) => a + (r.gauntlet_fathoms ?? 0), 0)
  const upgradesOwned = gRows.reduce((a, r) => a + (r.gauntlet_upgrades?.length ?? 0), 0)
  const avgDepth = descenders.length ? Math.round(descenders.reduce((a, r) => a + (r.gauntlet_deepest ?? 0), 0) / descenders.length) : 0
  const upgradeTally: Record<string, number> = {}
  for (const r of gRows) for (const id of (r.gauntlet_upgrades ?? [])) upgradeTally[id] = (upgradeTally[id] ?? 0) + 1
  const topUpgrade = Object.entries(upgradeTally).sort((a, b) => b[1] - a[1])[0] ?? null
  const upgradeName = (id: string) => GAUNTLET_UPGRADES.find(u => u.id === id)?.name ?? id
  const fmtMs = (ms: number) => { const sec = Math.floor(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }

  // Trawls — crew passive fishing. Active trawls are a live snapshot (the
  // `trawls` table, cleared on collect); the rest is collection history from
  // the doubloon ledger. XP isn't logged separately, so only doubloons show.
  const topTrawlZone = ((t.byZone ?? []) as { label: string; collections: number; doubloons: number }[])[0] ?? null
  const trawlStats: Stat[] = [
    { label: 'At sea now',        value: t.activeNow ?? 0,        by: byIf(t.readyToCollect ?? 0, `${fmt(t.readyToCollect ?? 0)} ready to collect`) },
    { label: 'Captains at sea',   value: t.captainsTrawling ?? 0 },
    { label: 'Hauls collected',   value: t.collections ?? 0 },
    { label: 'Doubloons paid',    value: `${fmt(t.totalDoubloons ?? 0)} ⟡` },
    { label: 'Avg per haul',      value: `${fmt(t.avgDoubloons ?? 0)} ⟡` },
    { label: 'Captains who trawled', value: t.uniqueCaptains ?? 0 },
    { label: 'Last 24h',          value: `${fmt(t.collections24h ?? 0)} hauls`, by: byIf(t.doubloons24h ?? 0, `${fmt(t.doubloons24h ?? 0)} ⟡`) },
    { label: 'Last 7d',           value: `${fmt(t.collections7d ?? 0)} hauls`,  by: byIf(t.doubloons7d ?? 0, `${fmt(t.doubloons7d ?? 0)} ⟡`) },
    ...(topTrawlZone ? [{ label: 'Top zone', value: topTrawlZone.label, by: `${fmt(topTrawlZone.doubloons)} ⟡ · ${fmt(topTrawlZone.collections)} hauls` }] : []),
  ]

  // Raid id → boss display name (see lib/bossRaids.ts). Falls back to the raw
  // id so a newly-added raid still appears.
  const RAID_BOSS_NAMES: Record<string, string> = {
    corsairs_reckoning: 'Barnacle Pete',
    captain_krust: 'Captain Krust',
    the_cartographer: 'The Cartographer',
  }
  const raidBossStats: Stat[] = ((s.raids?.byBoss ?? []) as { raidId: string; players: number; completions: number }[])
    .map(b => ({
      label: RAID_BOSS_NAMES[b.raidId] ?? b.raidId,
      value: b.players,
      by: b.completions !== b.players ? `${b.completions} total clears` : null,
    }))

  // Fleet Records — fleet-wide aggregates pulled up as the headline
  // brag wall + the one record (Biggest fish) that isn't already on
  // the public leaderboard. Anything the leaderboard already shows
  // (perfect streak, tavern payouts, etc.) stays out — this is a
  // brag wall, not a duplicate. Stays first in the section list so
  // the admin lands on the headline numbers before per-feature
  // operational stats. Feature sections below keep their own copies
  // of these aggregates as well — the brag wall is a curated
  // headline, the sections are the detailed breakdowns.
  const flex = s.flex ?? {}
  const biggestFish = flex.biggestFish ?? {}
  const fleetRecords: Stat[] = [
    { label: 'Fish caught fleet-wide', value: flex.fishCaught ?? 0 },
    { label: 'Lines cast',             value: s.fishing?.casts ?? 0 },
    { label: 'Distance sailed',        value: `${fmt(flex.distanceSailed ?? 0)} m` },
    { label: 'Voyages completed',      value: s.voyages?.completed ?? 0 },
    { label: 'Raids cleared',          value: s.raids?.cleared ?? 0 },
    { label: 'Crew recruited',         value: s.recruits?.lifetime ?? 0 },
    { label: 'Tide Run beacons',       value: s.tideRun?.beacons ?? 0 },
    { label: 'Deepest Gauntlet descent', value: deepestBanked ? `Depth ${deepestBanked.gauntlet_best_depth}` : '—', by: deepestBanked?.username ?? null },
    {
      label: 'Biggest fish landed',
      value: biggestFish.length ? `${biggestFish.length}″ ${biggestFish.species ?? ''}`.trim() : '—',
      by:    biggestFish.username ?? null,
    },
  ]

  const sections: { title: string; accent: string; stats: Stat[] }[] = [
    {
      title: 'Fleet Records', accent: '#fbbf24',
      stats: fleetRecords,
    },
    {
      title: 'Players', accent: '#60a5fa',
      stats: [
        { label: 'Registered players', value: s.players ?? 0 },
        { label: 'Active (7 days)',    value: s.activePlayers ?? 0 },
        { label: 'Premium members',    value: s.members ?? 0 },
        { label: 'Badges earned',      value: s.badgesEarned ?? 0 },
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
        // Personal-best rows = engagement signal; each row is the
        // first time a player landed a tier-Trophy / -Large / etc.
        // catch of that species and got their length recorded.
        { label: 'Personal bests',     value: s.fishing?.personalBests ?? 0 },
        // Prestige — the zone-reset endgame loop. Captains = players
        // with at least one prestiged zone; stars capped at 5/zone to
        // match the badge math on /achievements.
        { label: 'Captains prestiged', value: s.prestige?.captains ?? 0 },
        { label: 'Prestige stars lit', value: s.prestige?.stars ?? 0 },
      ],
    },
    {
      // Goldens — 1/1000 shiny Perfect catches. 'Total caught' is every
      // landed golden; sold + mounted are the terminal choices. Any gap
      // between total and (sold + mounted) is in-flight catches where
      // the player hasn't yet picked in the choice modal.
      title: 'Goldens', accent: '#fbcc4a',
      stats: [
        { label: 'Total caught',     value: s.goldens?.total ?? 0 },
        { label: 'Mounted in Log',   value: s.goldens?.mounted ?? 0 },
        { label: 'Sold for 10×',     value: s.goldens?.sold ?? 0 },
        {
          label: 'Most by one captain',
          value: s.goldens?.topCaptainCount ?? 0,
          by:    byIf(s.goldens?.topCaptainCount ?? 0, s.goldens?.topCaptainBy),
        },
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
      title: 'Davy Jones Gauntlet', accent: '#2dd4bf',
      stats: [
        { label: 'Captains who descended', value: descenders.length },
        { label: 'Deepest descent (banked)', value: deepestBanked ? `Depth ${deepestBanked.gauntlet_best_depth}` : '—', by: deepestBanked ? `${deepestBanked.username ?? '—'}${deepestBanked.gauntlet_best_depth_ms ? ' · ' + fmtMs(deepestBanked.gauntlet_best_depth_ms) : ''}` : null },
        { label: 'Deepest reached (any run)', value: deepestReached ? `Depth ${deepestReached.gauntlet_deepest}` : '—', by: deepestReached?.username ?? null },
        { label: 'Average depth reached', value: descenders.length ? `Depth ${avgDepth}` : '—' },
        { label: 'Fathoms in circulation', value: fmt(fathomsHeld) },
        { label: 'Locker upgrades owned', value: upgradesOwned },
        ...(topUpgrade ? [{ label: 'Most-bought upgrade', value: upgradeName(topUpgrade[0]), by: `${topUpgrade[1]} captains` }] : []),
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
      // Trawls — crew passive fishing. "At sea now" + "Captains at sea" are a
      // live snapshot; everything below is collection history from the ledger.
      title: 'Trawls', accent: '#5eead4',
      stats: trawlStats,
    },
    {
      // Crew Hall — recruit + deployment + sentiment signals. Fallen
      // / Nicknamed counts surface from user_crew so the section
      // covers the full lifecycle (Lifetime → Roster → Deployed →
      // Fallen) plus the lighter "are people bonding with their
      // crew" signal (nickname adoption + highest-XP captain).
      title: 'Crew Hall', accent: '#7fd0a0',
      stats: [
        { label: 'Lifetime recruited', value: s.recruits?.lifetime ?? 0 },
        { label: 'Crew on rosters',    value: s.recruits?.total ?? 0 },
        { label: 'Legendary crew', value: s.recruits?.legendary ?? 0 },
        { label: 'Epic crew',      value: s.recruits?.epic ?? 0 },
        { label: 'Rare crew',      value: s.recruits?.rare ?? 0 },
        { label: 'Common crew',    value: s.recruits?.common ?? 0 },
        { label: 'Crew deployed',  value: s.recruits?.deployed ?? 0 },
        { label: 'Lost at sea',    value: s.recruits?.fallen ?? 0 },
        { label: 'Nicknamed',      value: s.recruits?.nicknamed ?? 0 },
        {
          label: 'Top crew XP',
          value: s.recruits?.topXP ?? 0,
          by:    byIf(s.recruits?.topXP ?? 0, s.recruits?.topXPBy),
        },
        // Hall ladder (5 tiers): upgrades = total rungs climbed
        // fleet-wide, maxed = captains sitting at tier 5.
        { label: 'Hall upgrades bought', value: s.recruits?.hallUpgrades ?? 0 },
        { label: 'Halls fully upgraded', value: s.recruits?.hallMaxed ?? 0 },
      ],
    },
    {
      // Tavern — Slots is the long-runner; Crown & Anchor was retired
      // 2026-06-06 when Blackjack took over the wager game slot so its
      // rolls/wins lines were dropped from this section (the table is
      // still on disk if we ever want the historical totals back).
      title: 'Tavern', accent: '#fb923c',
      stats: [
        { label: 'Slot spins',       value: s.tavern?.slotSpins ?? 0 },
        { label: 'Slot wins',        value: s.tavern?.slotWins ?? 0 },
        { label: 'Biggest slot win', value: `${fmt(s.tavern?.slotBiggest ?? 0)} ⟡` },
        // Catfish Jackpot — live pot + the last claim. History is only
        // the most recent winner (single-row state table).
        { label: 'Jackpot pot now',  value: `${fmt(s.jackpot?.pot ?? 0)} chips` },
        {
          label: 'Last catfish',
          value: s.jackpot?.lastAmount ? `${fmt(s.jackpot.lastAmount)} chips` : '—',
          by:    s.jackpot?.lastBy ?? null,
        },
      ],
    },
    {
      // The Den — the shared chip wallet behind blackjack / roulette /
      // slots. Chips in play = balances players haven't cashed out or
      // busted; buy-ins are doubloons converted at the cage.
      title: 'The Den', accent: '#2dd4bf',
      stats: [
        { label: 'Chips in play',     value: s.den?.chipsHeld ?? 0 },
        { label: 'Buy-ins',           value: s.den?.buyIns ?? 0 },
        { label: 'Doubloons cashed in', value: `${fmt(s.den?.buyInTotal ?? 0)} ⟡` },
      ],
    },
    {
      // The Parlor — trivia hub. Board = Captain's Board daily column;
      // ladder = Pirate King weekly climb with its three endings
      // (crowned at rung 10, walked with winnings, busted on a miss).
      title: 'The Parlor', accent: '#e0b358',
      stats: [
        { label: 'Board columns played', value: s.parlor?.boardPlays ?? 0 },
        { label: 'Board payouts',        value: `${fmt(s.parlor?.boardPayout ?? 0)} ⟡` },
        { label: 'Ladder climbs',        value: s.parlor?.ladderRuns ?? 0 },
        { label: 'Pirate Kings crowned', value: s.parlor?.kingsCrowned ?? 0 },
        { label: 'Walked with winnings', value: s.parlor?.walked ?? 0 },
        { label: 'Busted on the climb',  value: s.parlor?.busted ?? 0 },
        { label: 'Ladder payouts',       value: `${fmt(s.parlor?.ladderPayout ?? 0)} ⟡` },
      ],
    },
    {
      // Blackjack — the main wager game. Net delta is positive on a
      // hand the player won (counting only their payout - wager), and
      // negative on a loss. We surface the largest single-hand swing
      // in either direction so the admin can spot variance outliers.
      title: 'Blackjack', accent: '#dca494',
      stats: [
        { label: 'Hands played',       value: s.blackjack?.hands ?? 0 },
        { label: 'Total wagered',      value: `${fmt(s.blackjack?.totalWagered ?? 0)} ⟡` },
        {
          label: 'Biggest single win',
          value: `${fmt(s.blackjack?.biggestWin ?? 0)} ⟡`,
          by:    byIf(s.blackjack?.biggestWin ?? 0, s.blackjack?.biggestWinBy),
        },
        {
          label: 'Biggest single loss',
          value: `${fmt(s.blackjack?.biggestLoss ?? 0)} ⟡`,
          by:    byIf(s.blackjack?.biggestLoss ?? 0, s.blackjack?.biggestLossBy),
        },
      ],
    },
    {
      // Fish Roulette — admin-gated for now, so volume is intentionally
      // small. Keeping the section live so it auto-populates once the
      // admin gate drops and players hit it.
      title: 'Fish Roulette', accent: '#0a7a3a',
      stats: [
        { label: 'Spins',         value: s.roulette?.spins ?? 0 },
        { label: 'Total wagered', value: `${fmt(s.roulette?.totalWagered ?? 0)} ⟡` },
        { label: 'Biggest win',   value: `${fmt(s.roulette?.biggestWin ?? 0)} ⟡` },
      ],
    },
    {
      // Captain's Mail — broadcast-only for now, so 'messages' is the
      // total notes sent, 'reads' is total per-player open events
      // (one row per player per message tapped), and 'claims' is how
      // many attachment claims fired. Healthy claim rate vs reads ≈
      // attachments are valued; low rate ≈ players ignore them.
      title: 'Mail', accent: '#c4a96a',
      stats: [
        { label: 'Messages sent',      value: s.mail?.messages ?? 0 },
        { label: 'Opens (per-player)', value: s.mail?.reads ?? 0 },
        { label: 'Attachments claimed', value: s.mail?.claims ?? 0 },
      ],
    },
    {
      // Daily Challenges — each /tavern/daily-bonus daily picks 3
      // tasks; claimed_1/2/3 booleans track completion. Total
      // completions = sum across rows; active days = distinct (player,
      // date) pairs that have ANY of the three picks attempted.
      title: 'Daily Challenges', accent: '#a78bfa',
      stats: [
        { label: 'Picks completed', value: s.dailyChallenges?.completed ?? 0 },
        { label: 'Active days',     value: s.dailyChallenges?.activeDays ?? 0 },
      ],
    },
    {
      // Earned numbers EXCLUDE 'Admin grant' transactions so the totals
      // reflect what players actually earned through gameplay, not what
      // got handed to them via admin tools. Held balances are unfiltered
      // because they're current state regardless of source.
      title: 'Economy', accent: '#f0c040',
      stats: [
        { label: 'Doubloons earned', value: `${fmt(s.economy?.doubloonsEarned ?? 0)} ⟡` },
        { label: 'Doubloons spent',  value: `${fmt(s.economy?.doubloonsSpent ?? 0)} ⟡` },
        { label: 'Fish sold',        value: `${fmt(s.economy?.fishSold ?? 0)} ⟡` },
        { label: 'Gems earned',      value: `${fmt(s.economy?.gemsEarned ?? 0)} ◆` },
        { label: 'Doubloons held',   value: `${fmt(s.economy?.doubloonsHeld ?? 0)} ⟡` },
        { label: 'Gems held',        value: `${fmt(s.economy?.gemsHeld ?? 0)} ◆` },
        // Patient sells = the 90%-in-1h delayed liquidate lane; counts
        // settled payouts, a read on whether the lane gets used.
        { label: 'Patient sells settled', value: s.economy?.patientSells ?? 0 },
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

        {/* Security flags — advisory anomaly signals, review manually. Cap trips
            are near-certain forgeries; this never auto-acts. */}
        <div style={{
          background: flaggedUsers.length ? 'rgba(60,12,12,0.5)' : 'rgba(8,20,14,0.45)',
          border: `1px solid ${flaggedUsers.length ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.28)'}`,
          borderRadius: 16, padding: '1.2rem 1.3rem', marginBottom: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: flaggedUsers.length ? 14 : 0 }}>
            <span aria-hidden style={{ width: 4, height: 18, borderRadius: 2, background: flaggedUsers.length ? '#f87171' : '#34d399', flexShrink: 0 }} />
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.82rem', color: '#e4e0d9' }}>
              Security Flags{flaggedUsers.length ? ` · ${flagRowsArr.length} recent` : ''}
            </p>
          </div>
          {flaggedUsers.length === 0 ? (
            <p className="font-karla" style={{ fontSize: '0.9rem', color: '#7fd0a0' }}>No anomalies flagged — cap trips would surface here.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {flaggedUsers.map((u, i) => (
                <div key={u.uid} style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
                  borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.07)',
                  paddingTop: i === 0 ? 0 : 10, paddingBottom: 10,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="font-karla font-700" style={{ fontSize: '0.98rem', color: u.maxSev >= 3 ? '#fca5a5' : '#e4e0d9' }}>{u.name}</span>
                    <span className="font-karla" style={{ display: 'block', fontSize: '0.72rem', color: '#928d84', marginTop: 2 }}>
                      {Object.entries(u.kinds).map(([k, n]) => `${k.replace('cap_trip:', '')} ×${n}`).join(' · ')}
                    </span>
                  </div>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f87171' }}>{u.count}</span>
                    <span className="font-karla" style={{ display: 'block', fontSize: '0.7rem', color: '#928d84', marginTop: 2 }}>sev {u.maxSev}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

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
