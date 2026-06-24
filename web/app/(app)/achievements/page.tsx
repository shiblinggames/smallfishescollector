import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { BADGE_MAP } from '@/lib/badges'
import { getLevelFromXP as fishLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { type JourneyGroup, type JourneyGoal } from './AchievementsClient'
import { type StoryLogData } from './StoryLog'
import LogTabs from './LogTabs'
import { FINN_ENCOUNTER_BEATS, FINN_REVEAL_BEAT } from '@/lib/finn'
import { getRaidMapView } from '@/app/(app)/expeditions/raidMapActions'
import { isCombatNode } from '@/lib/raidMap'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { reconcileBadges } from './badgeActions'
import { crewLevelFromXP, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { CREW_HALL_MAX_TIER } from '@/lib/crewHall'

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
const CHALLENGE_RAID_IDS = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']

export default async function AchievementsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile via the request-scoped cached loader (lib/userData.ts).
  // reconcileBadges runs first-class so any newly-met condition is granted on
  // visit (and its return is the authoritative unlocked list).
  const [profile, collectionRes, speciesRes, voyageCountRes, raidMap, unlocked, raidComplRes, crewRes] = await Promise.all([
    getCurrentProfile(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
    admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'revealed'),
    getRaidMapView(),
    reconcileBadges(),
    admin.from('raid_completions').select('raid_id').eq('user_id', user.id),
    admin.from('user_crew').select('xp').eq('user_id', user.id).is('died_at', null),
  ])

  // ── Derive everything from existing data — no new columns ────────────────
  const has = (id: string) => unlocked.includes(id)

  const raidIds = new Set<string>(((raidComplRes.data ?? []) as { raid_id: string }[]).map(r => r.raid_id))
  const maxCrewLevel = ((crewRes.data ?? []) as { xp: number | null }[])
    .reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  const challengeCleared = CHALLENGE_RAID_IDS.filter(id => raidIds.has(id)).length

  const crewHallTier = Number(profile?.crew_hall_tier ?? 0)
  const recruits = Number(profile?.lifetime_recruits ?? 0)
  const gauntletDeepest = Number(profile?.gauntlet_deepest ?? 0)
  const gauntletFathoms = Number(profile?.gauntlet_fathoms ?? 0)
  const pvpWins = Number(profile?.pvp_wins ?? 0)
  const puzzlePoints = Number(profile?.puzzle_points ?? 0)
  const highestRaidDmg = Number(profile?.highest_raid_damage ?? 0)
  const totalPerfects = Number(profile?.total_perfects ?? 0)

  const fishLevel = fishLevelFromXP(Number(profile?.fishing_xp ?? 0))
  const navLevel = navLevelFromXP(Number(profile?.expedition_xp ?? 0))

  const prestige = (profile?.prestige_levels as Record<string, number> | null) ?? {}
  const prestigedZones = ZONES.filter(z => (prestige[z] ?? 0) >= 1).length
  const totalStars = ZONES.reduce((s, z) => s + Math.min(5, prestige[z] ?? 0), 0)

  const trophies = ((profile?.trophy_catches as number[] | null) ?? []).length

  const nonAncientIds = new Set(
    ((speciesRes.data ?? []) as { id: number; habitat: string }[])
      .filter(s => s.habitat !== 'ancient_deep')
      .map(s => s.id),
  )
  const collectedIds = new Set(((collectionRes.data ?? []) as { fish_id: number }[]).map(r => r.fish_id))
  const collected = [...nonAncientIds].filter(id => collectedIds.has(id)).length
  const speciesTotal = nonAncientIds.size || 134

  const voyagesDone = voyageCountRes.count ?? 0
  const streakBest = profile?.highest_perfect_streak ?? 0
  const tideBest = profile?.tide_run_best_distance ?? 0
  const doubloons = profile?.doubloons ?? 0

  // ── Goal builders ───────────────────────────────────────────────────────
  // Badge-backed goal: shows live progress AND flips to "earned" once the
  // badge is unlocked (badge = the cosmetic payoff for the pursuit).
  function badgeGoal(
    badgeId: string, label: string, desc: string,
    current: number, target: number, href: string,
    opts: { binary?: boolean; record?: boolean } = {},
  ): JourneyGoal {
    const earned = has(badgeId) || (!opts.binary && current >= target)
    return {
      id: badgeId, label, desc, href,
      current: Math.min(current, target), target,
      done: earned,
      badgeImage: BADGE_MAP[badgeId]?.imageUrl,
      binary: !!opts.binary,
      record: !!opts.record,
    }
  }
  // Pure progress goal (no badge art) — long arcs worth chasing that aren't
  // in the 12-badge set. Makes this a journey, not just a trophy shelf.
  function progressGoal(
    id: string, label: string, desc: string,
    current: number, target: number, href: string,
    opts: { record?: boolean } = {},
  ): JourneyGoal {
    return {
      id, label, desc, href,
      current: Math.min(current, target), target,
      done: current >= target,
      record: !!opts.record,
    }
  }

  const groups: JourneyGroup[] = [
    {
      title: 'Fishing Mastery',
      accent: '#4ade80',
      goals: [
        badgeGoal('master_angler', 'Master Angler', 'Reach Fishing Level 100', fishLevel, 100, '/fishing'),
        badgeGoal('unbroken', 'Unbroken', 'Land 10 perfect catches in a row', streakBest, 10, '/fishing'),
        badgeGoal('dead_eye', 'Dead-Eye', 'Land 1,000 perfect catches all-time', totalPerfects, 1000, '/fishing'),
        badgeGoal('trophy_catch', 'Trophy Catch', 'Land a Trophy-tier fish', has('trophy_catch') ? 1 : 0, 1, '/fishing', { binary: true }),
        badgeGoal('prestige_i', 'Prestige I', 'Reach Prestige in any fishing zone', totalStars > 0 ? 1 : 0, 1, '/fishing', { binary: true }),
        badgeGoal('zone_legend', 'Zone Legend', 'Reach Prestige in all 4 zones', prestigedZones, 4, '/fishing'),
        progressGoal('prestige_stars', 'Prestige Stars', 'Earn all 20 prestige stars (5 per zone)', totalStars, 20, '/fishing'),
      ],
    },
    {
      title: 'The Collection',
      accent: '#60a5fa',
      goals: [
        badgeGoal('full_collection', 'Full Collection', `Catch every fish species (${collected}/${speciesTotal})`, collected, speciesTotal, '/fishing'),
        badgeGoal('ancient_ones', 'Ancient Ones', 'Catch all 6 Ancient Deep trophies', trophies, 6, '/fishing'),
        progressGoal('half_the_sea', 'Half the Sea', 'Catch 50 fish species', collected, 50, '/fishing'),
      ],
    },
    {
      title: 'Crew',
      accent: '#5ec8e8',
      goals: [
        badgeGoal('crewmaster', 'Crewmaster', 'Reach the top Crew Hall tier', crewHallTier, CREW_HALL_MAX_TIER, '/crew'),
        badgeGoal('old_salt', 'Old Salt', 'Level a crew to 100', maxCrewLevel, CREW_MAX_LEVEL, '/crew'),
        badgeGoal('full_muster', 'Full Muster', 'Recruit 100 crew', recruits, 100, '/crew'),
        progressGoal('growing_crew', 'Growing Crew', 'Recruit 25 crew', recruits, 25, '/crew'),
      ],
    },
    {
      title: 'Expeditions & Combat',
      accent: '#c8704a',
      goals: [
        badgeGoal('navigator', 'Wayfinder', 'Reach Navigation Level 50', navLevel, 50, '/expeditions'),
        progressGoal('nav_100', 'Master Navigator', 'Reach Navigation Level 100', navLevel, 100, '/expeditions'),
        badgeGoal('fleet_admiral', 'Fleet Admiral', 'Complete 100 voyages', voyagesDone, 100, '/expeditions'),
        badgeGoal('cartographers_fall', "The Cartographer's Fall", 'Defeat the Cartographer', raidIds.has('cartographer') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('toll_paid', 'Toll Paid', 'Defeat Tollmaster Spet', raidIds.has('tollmasters_cut') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('heavy_broadside', 'Heavy Broadside', 'Land a single raid hit for 250+', highestRaidDmg, 250, '/raids'),
        badgeGoal('corsairs_bane', "Corsair's Bane", 'Defeat Barnacle Pete in challenge mode', has('corsairs_bane') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('ghost_ship', "Krust's Crutch", 'Defeat Captain Krust in challenge mode', has('ghost_ship') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('finndicates_bane', "Finndicate's Bane", 'Clear all 4 raids in challenge mode', challengeCleared, 4, '/raids'),
      ],
    },
    {
      title: 'The Gauntlet',
      accent: '#a06ff2',
      goals: [
        badgeGoal('davy_jones', "Davy Jones' Locker", 'Descend to depth 10 in the Gauntlet', gauntletDeepest, 10, '/raids/gauntlet'),
        progressGoal('into_the_deep', 'Into the Deep', 'Descend to depth 5', gauntletDeepest, 5, '/raids/gauntlet'),
        progressGoal('fathomless', 'Fathomless', 'Bank 1,000 Fathoms all-time', gauntletFathoms, 1000, '/raids/gauntlet'),
      ],
    },
    {
      title: 'Broadsides',
      accent: '#f87171',
      goals: [
        badgeGoal('first_blood', 'First Blood', 'Win a ship duel', pvpWins, 1, '/expeditions'),
        badgeGoal('duelist', 'Duelist', 'Win 25 ship duels', pvpWins, 25, '/expeditions'),
        progressGoal('brawler', 'Broadside Brawler', 'Win 10 ship duels', pvpWins, 10, '/expeditions'),
      ],
    },
    {
      title: 'The Chart Room',
      accent: '#c4a96a',
      goals: [
        badgeGoal('den_magnate', 'Den Magnate', 'Bank 80 charting points (top the Den purse)', puzzlePoints, 80, '/tavern/chart-room'),
        progressGoal('quartermaster', 'Quartermaster', 'Bank 40 charting points', puzzlePoints, 40, '/tavern/chart-room'),
      ],
    },
    {
      title: 'The Den & Records',
      accent: '#f0c040',
      goals: [
        badgeGoal('tide_master', 'Tide Master', 'Reach 750m in a single Tide Run', tideBest, 750, '/tavern/tide-run', { record: true }),
        progressGoal('tide_run', 'Tide Run Distance', 'Reach 500m in a single run', tideBest, 500, '/tavern/tide-run', { record: true }),
        badgeGoal('catfish_jackpot', 'Catfish Jackpot', 'Win the slots Catfish Jackpot', has('catfish_jackpot') ? 1 : 0, 1, '/tavern', { binary: true }),
      ],
    },
    {
      title: 'Wealth',
      accent: '#a78bfa',
      goals: [
        badgeGoal('deep_pockets', 'Deep Pockets', 'Hold 1,000,000 doubloons at once', doubloons, 1_000_000, '/fishing'),
        progressGoal('bilge_baron', 'Bilge Baron', 'Hold 5,000,000 doubloons at once', doubloons, 5_000_000, '/fishing'),
      ],
    },
  ]

  const allGoals = groups.flatMap(g => g.goals)
  const doneCount = allGoals.filter(g => g.done).length

  // ── Story recap — what each arc has revealed up to where you are ─────────
  const seenFinn = new Set((profile?.finn_seen_beats as string[] | null) ?? [])
  const finnRevealed = !!profile?.finn_revealed || seenFinn.has('reveal')
  const finnEncounter = FINN_ENCOUNTER_BEATS.filter(b => seenFinn.has(b.id)).map(b => ({ id: b.id, lines: b.lines }))

  const raidViews = raidMap.views
  const raidDone = raidViews
    .filter(v => v.status === 'cleared')
    .map(v => {
      const n = v.node
      const kind: 'story' | 'combat' | 'milestone' | 'shop' =
        n.type === 'story' ? 'story' : isCombatNode(n.type) ? 'combat' : n.type === 'milestone' ? 'milestone' : 'shop'
      // Tight one-line recap per stop: the node's bridge (what beating it
      // set in motion), falling back to its flavor. The full descriptions and
      // fragment quotes stay in the node detail sheets, not this summary.
      return { label: n.label, kind, lines: [n.bridge ?? n.flavor], image: n.image ?? null }
    })
  const raidNextView = raidViews.find(v => v.status === 'available')
  const raidNext = raidNextView
    ? { label: raidNextView.node.label, flavor: raidNextView.node.flavor, image: raidNextView.node.image ?? null }
    : null

  const storyData: StoryLogData = {
    finn: {
      encounter: finnEncounter,
      revealed: finnRevealed,
      revealLines: finnRevealed ? FINN_REVEAL_BEAT.lines : [],
      discovered: finnEncounter.length + (finnRevealed ? 1 : 0),
      total: FINN_ENCOUNTER_BEATS.length + 1,
    },
    raid: {
      done: raidDone,
      next: raidNext,
      clearedCount: raidDone.length,
      total: raidViews.length,
    },
  }

  return (
    <>
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-2xl mx-auto pb-16">
          <div className="mb-6">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>Captain&apos;s Log</h1>
          </div>

          <LogTabs
            storyData={storyData}
            groups={groups}
            doneCount={doneCount}
            totalCount={allGoals.length}
          />
        </div>
      </main>
    </>
  )
}
