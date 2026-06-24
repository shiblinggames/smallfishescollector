import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BADGE_MAP, badgeReward, badgeDetail } from '@/lib/badges'
import { getLevelFromXP as fishLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import AchievementsClient, { type JourneyGroup, type JourneyGoal } from '@/app/(app)/achievements/AchievementsClient'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { reconcileBadges } from '@/app/(app)/achievements/badgeActions'
import { crewLevelFromXP, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { CREW_HALL_MAX_TIER } from '@/lib/crewHall'

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
const CHALLENGE_RAID_IDS = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']
const LEGENDARY_SLUGS = new Set(['catfish', 'doby_mick', 'mako'])

export default async function BadgesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile via the request-scoped cached loader (lib/userData.ts).
  // reconcileBadges runs first-class so any newly-met condition is granted on
  // visit (and its return is the authoritative unlocked list).
  const [profile, collectionRes, speciesRes, voyageCountRes, unlocked, raidComplRes, crewRes] = await Promise.all([
    getCurrentProfile(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
    admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'revealed'),
    reconcileBadges(),
    admin.from('raid_completions').select('raid_id, elapsed_ms').eq('user_id', user.id),
    admin.from('user_crew').select('xp, died_at, cards(slug)').eq('user_id', user.id),
  ])

  // ── Derive everything from existing data — no new columns ────────────────
  const has = (id: string) => unlocked.includes(id)

  const raids = (raidComplRes.data ?? []) as { raid_id: string; elapsed_ms: number | null }[]
  const raidIds = new Set<string>(raids.map(r => r.raid_id))
  const fastestCorsairs = Math.min(Infinity, ...raids.filter(r => r.raid_id === 'corsairs_reckoning').map(r => r.elapsed_ms ?? Infinity))
  const crew = (crewRes.data ?? []) as unknown as { xp: number | null; died_at: string | null; cards: { slug: string | null } | null }[]
  const maxCrewLevel = crew.reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  const hasLegendaryCrew = crew.some(c => !!c.cards?.slug && LEGENDARY_SLUGS.has(c.cards.slug))
  const legendsOwned = new Set(crew.map(c => c.cards?.slug).filter((s): s is string => !!s && LEGENDARY_SLUGS.has(s))).size
  const hasLostCrew = crew.some(c => c.died_at != null)
  const challengeCleared = CHALLENGE_RAID_IDS.filter(id => raidIds.has(id)).length
  const collectionCount = (collectionRes.data ?? []).length

  const crewHallTier = Number(profile?.crew_hall_tier ?? 0)
  const recruits = Number(profile?.lifetime_recruits ?? 0)
  const gauntletDeepest = Number(profile?.gauntlet_deepest ?? 0)
  const gauntletFathoms = Number(profile?.gauntlet_fathoms ?? 0)
  const pvpWins = Number(profile?.pvp_wins ?? 0)
  const puzzlePoints = Number(profile?.puzzle_points ?? 0)
  const highestRaidDmg = Number(profile?.highest_raid_damage ?? 0)
  const totalPerfects = Number(profile?.total_perfects ?? 0)
  const doubleCatches = Number(profile?.fishing_double_catches ?? 0)
  const casts = Number(profile?.fishing_casts ?? 0)
  const cratesOpened = Number(profile?.fishing_crates_opened ?? 0)
  const snags = Number(profile?.fishing_snags ?? 0)
  const jackpots = Number(profile?.fishing_jackpots ?? 0)
  const beacons = Number(profile?.tide_run_beacons_smashed ?? 0)
  const tideTotal = Number(profile?.tide_run_total_distance ?? 0)
  const isPremium = !!profile?.is_premium

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
  const claimed = new Set<string>((profile?.claimed_badge_rewards as string[] | null) ?? [])

  // ── Goal builders ───────────────────────────────────────────────────────
  // Badge-backed goal: shows live progress AND flips to "earned" once the
  // badge is unlocked (badge = the cosmetic payoff for the pursuit). Carries
  // its difficulty + claimable doubloon reward + whether it's been claimed.
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
      difficulty: BADGE_MAP[badgeId]?.difficulty,
      reward: badgeReward(badgeId),
      claimed: claimed.has(badgeId),
      detail: badgeDetail(badgeId),
    }
  }

  const groups: JourneyGroup[] = [
    {
      title: 'Fishing Mastery',
      accent: '#4ade80',
      goals: [
        badgeGoal('prestige_i', 'Prestige I', 'Reach Prestige in any fishing zone', totalStars > 0 ? 1 : 0, 1, '/fishing', { binary: true }),
        badgeGoal('trophy_catch', 'Trophy Catch', 'Land a Trophy-tier fish', has('trophy_catch') ? 1 : 0, 1, '/fishing', { binary: true }),
        badgeGoal('unbroken', 'Unbroken', 'Land 10 perfect catches in a row', streakBest, 10, '/fishing'),
        badgeGoal('relentless', 'Relentless', 'Land 15 perfect catches in a row', streakBest, 15, '/fishing'),
        badgeGoal('untouchable', 'Untouchable', 'Land 20 perfect catches in a row', streakBest, 20, '/fishing'),
        badgeGoal('sure_shot', 'Sure Shot', 'Land 250 perfect catches all-time', totalPerfects, 250, '/fishing'),
        badgeGoal('dead_eye', 'Dead-Eye', 'Land 1,000 perfect catches all-time', totalPerfects, 1000, '/fishing'),
        badgeGoal('master_angler', 'Master Angler', 'Reach Fishing Level 100', fishLevel, 100, '/fishing'),
        badgeGoal('zone_legend', 'Zone Legend', 'Reach Prestige in all 4 zones', prestigedZones, 4, '/fishing'),
        badgeGoal('prestige_stars', 'Prestige Stars', 'Earn all 20 prestige stars (5 per zone)', totalStars, 20, '/fishing'),
      ],
    },
    {
      title: 'Fishing Feats',
      accent: '#34d399',
      goals: [
        badgeGoal('got_away', 'The One That Got Away', 'Lose 50 fish to snapped lines', snags, 50, '/fishing'),
        badgeGoal('two_for_the_pot', 'Two for the Pot', 'Reel in a double catch', doubleCatches, 1, '/fishing', { binary: true }),
        badgeGoal('two_fisted', 'Two-Fisted', 'Land 100 double catches', doubleCatches, 100, '/fishing'),
        badgeGoal('saltlung', 'Saltlung', 'Cast your line 1,000 times', casts, 1000, '/fishing'),
        badgeGoal('salted_through', 'Salted Through', 'Cast your line 10,000 times', casts, 10_000, '/fishing'),
        badgeGoal('crate_digger', 'Crate Digger', 'Open 50 supply crates', cratesOpened, 50, '/fishing'),
        badgeGoal('reel_lucky', 'Reel Lucky', 'Hit a fishing jackpot', jackpots, 1, '/fishing', { binary: true }),
      ],
    },
    {
      title: 'The Collection',
      accent: '#60a5fa',
      goals: [
        badgeGoal('half_the_sea', 'Half the Sea', 'Catch 50 fish species', collectionCount, 50, '/fishing'),
        badgeGoal('hundred_fins', 'A Hundred Fins', 'Catch 100 fish species', collectionCount, 100, '/fishing'),
        badgeGoal('ancient_ones', 'Ancient Ones', 'Catch all 6 Ancient Deep trophies', trophies, 6, '/fishing'),
        badgeGoal('full_collection', 'Full Collection', `Catch every fish species (${collected}/${speciesTotal})`, collected, speciesTotal, '/fishing'),
      ],
    },
    {
      title: 'Crew',
      accent: '#5ec8e8',
      goals: [
        badgeGoal('growing_crew', 'Growing Crew', 'Recruit 25 crew', recruits, 25, '/crew'),
        badgeGoal('theres_a_grave', "There's a Grave?", 'Lose a crew member for the first time', hasLostCrew ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('legendary_recruit', 'Legendary Recruit', 'Recruit a legendary crew', hasLegendaryCrew ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('three_legends', 'The Three Legends', 'Own all 3 legendary crew at once', legendsOwned, 3, '/crew'),
        badgeGoal('crewmaster', 'Crewmaster', 'Reach the top Crew Hall tier', crewHallTier, CREW_HALL_MAX_TIER, '/crew'),
        badgeGoal('full_muster', 'Full Muster', 'Recruit 100 crew', recruits, 100, '/crew'),
        badgeGoal('old_salt', 'Old Salt', 'Level a crew to 100', maxCrewLevel, CREW_MAX_LEVEL, '/crew'),
      ],
    },
    {
      title: 'Expeditions & Combat',
      accent: '#c8704a',
      goals: [
        badgeGoal('navigator', 'Wayfinder', 'Reach Navigation Level 50', navLevel, 50, '/expeditions'),
        badgeGoal('maiden_voyage', 'Maiden Voyage', 'Complete your first voyage', voyagesDone, 1, '/expeditions', { binary: true }),
        badgeGoal('old_sea_dog', 'Old Sea Dog', 'Complete 50 voyages', voyagesDone, 50, '/expeditions'),
        badgeGoal('fleet_admiral', 'Fleet Admiral', 'Complete 100 voyages', voyagesDone, 100, '/expeditions'),
        badgeGoal('opening_salvo', 'Opening Salvo', 'Land a single raid hit for 50+', highestRaidDmg, 50, '/raids'),
        badgeGoal('hard_hitter', 'Hard Hitter', 'Land a single raid hit for 100+', highestRaidDmg, 100, '/raids'),
        badgeGoal('heavy_broadside', 'Heavy Broadside', 'Land a single raid hit for 250+', highestRaidDmg, 250, '/raids'),
        badgeGoal('swift_reckoning', 'Swift Reckoning', "Clear Corsair's Reckoning in under 1:30", fastestCorsairs <= 90_000 ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('corsairs_bane', "Corsair's Bane", 'Defeat Barnacle Pete in challenge mode', raidIds.has('corsairs_reckoning_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('ghost_ship', "Krust's Crutch", 'Defeat Captain Krust in challenge mode', raidIds.has('captain_krust_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('cartographers_fall', "The Cartographer's Fall", 'Defeat the Cartographer in challenge mode', raidIds.has('cartographer_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('toll_paid', 'Toll Paid', 'Defeat Tollmaster Spet in challenge mode', raidIds.has('tollmasters_cut_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('master_navigator', 'Master Navigator', 'Reach Navigation Level 100', navLevel, 100, '/expeditions'),
        badgeGoal('finndicates_bane', "Finndicate's Bane", 'Clear all 4 raids in challenge mode', challengeCleared, 4, '/raids'),
      ],
    },
    {
      title: 'The Gauntlet',
      accent: '#a06ff2',
      goals: [
        badgeGoal('into_the_deep', 'Into the Deep', 'Descend to depth 5 in the Gauntlet', gauntletDeepest, 5, '/raids/gauntlet'),
        badgeGoal('fathomless', 'Fathomless', 'Bank 500 Fathoms all-time', gauntletFathoms, 500, '/raids/gauntlet'),
        badgeGoal('davy_jones', "Davy Jones' Locker", 'Descend to depth 10 in the Gauntlet', gauntletDeepest, 10, '/raids/gauntlet'),
      ],
    },
    {
      title: 'Broadsides',
      accent: '#f87171',
      goals: [
        badgeGoal('first_blood', 'First Blood', 'Win a ship duel', pvpWins, 1, '/expeditions'),
        badgeGoal('brawler', 'Broadside Brawler', 'Win 10 ship duels', pvpWins, 10, '/expeditions'),
        badgeGoal('duelist', 'Duelist', 'Win 25 ship duels', pvpWins, 25, '/expeditions'),
      ],
    },
    {
      title: 'The Chart Room',
      accent: '#c4a96a',
      goals: [
        badgeGoal('quartermaster', 'Quartermaster', 'Bank 40 charting points', puzzlePoints, 40, '/tavern/chart-room'),
        badgeGoal('den_magnate', 'Den Magnate', 'Bank 80 charting points (top the Den purse)', puzzlePoints, 80, '/tavern/chart-room'),
      ],
    },
    {
      title: 'The Den & Records',
      accent: '#f0c040',
      goals: [
        badgeGoal('catfish_jackpot', 'Catfish Jackpot', 'Win the slots Catfish Jackpot', has('catfish_jackpot') ? 1 : 0, 1, '/tavern', { binary: true }),
        badgeGoal('tide_runner', 'Tide Runner', 'Reach 300m in a single Tide Run', tideBest, 300, '/tavern/tide-run', { record: true }),
        badgeGoal('tide_champion', 'Tide Champion', 'Reach 500m in a single Tide Run', tideBest, 500, '/tavern/tide-run', { record: true }),
        badgeGoal('tide_master', 'Tide Master', 'Reach 750m in a single Tide Run', tideBest, 750, '/tavern/tide-run', { record: true }),
        badgeGoal('beacon_breaker', 'Beacon Breaker', 'Smash 500 beacons across all Tide Runs', beacons, 500, '/tavern/tide-run'),
        badgeGoal('long_haul', 'The Long Haul', 'Swim 100,000m total across Tide Runs', tideTotal, 100_000, '/tavern/tide-run'),
      ],
    },
    {
      title: 'Wealth',
      accent: '#a78bfa',
      goals: [
        badgeGoal('baby_steps', 'Baby Steps', 'Hold 100,000 doubloons at once', doubloons, 100_000, '/fishing'),
        badgeGoal('deep_pockets', 'Deep Pockets', 'Hold 1,000,000 doubloons at once', doubloons, 1_000_000, '/fishing'),
        badgeGoal('bilge_baron', 'Bilge Baron', 'Hold 2,500,000 doubloons at once', doubloons, 2_500_000, '/fishing'),
      ],
    },
    {
      title: 'Captain',
      accent: '#e6b94a',
      goals: [
        badgeGoal('captains_colors', "Captain's Colors", 'Become a Captain', isPremium ? 1 : 0, 1, '/profile', { binary: true }),
      ],
    },
  ]

  const allGoals = groups.flatMap(g => g.goals)
  const doneCount = allGoals.filter(g => g.done).length

  return (
    <>
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-2xl mx-auto pb-16">
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>Badges</h1>
            {/* Story moved out of here — a quiet link back to the Captain's Log. */}
            <Link href="/achievements" className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Captain&apos;s Log →
            </Link>
          </div>

          <AchievementsClient groups={groups} doneCount={doneCount} totalCount={allGoals.length} />
        </div>
      </main>
    </>
  )
}
