import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { BADGE_MAP } from '@/lib/badges'
import { getLevelFromXP as fishLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { type JourneyGroup, type JourneyGoal } from './AchievementsClient'
import { type StoryLogData } from './StoryLog'
import LogTabs from './LogTabs'
import { FINN_ENCOUNTER_BEATS, FINN_REVEAL_BEAT } from '@/lib/finn'
import { getRaidMapView } from '@/app/expeditions/raidMapActions'
import { isCombatNode } from '@/lib/raidMap'

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const

export default async function AchievementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, collectionRes, speciesRes, voyageCountRes, raidMap] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, gems, unlocked_badges, fishing_xp, expedition_xp, prestige_levels, trophy_catches, highest_perfect_streak, tide_run_best_distance, fotd_longest_streak, finn_seen_beats, finn_revealed')
      .eq('id', user.id).single(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
    admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'revealed'),
    getRaidMapView(),
  ])

  // ── Derive everything from existing data — no new columns ────────────────
  const unlocked: string[] = (profile?.unlocked_badges as string[] | null) ?? []
  const has = (id: string) => unlocked.includes(id)

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
  const fotdBest = profile?.fotd_longest_streak ?? 0
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
      ],
    },
    {
      title: 'Expeditions & Combat',
      accent: '#c8704a',
      goals: [
        badgeGoal('navigator', 'Navigator', 'Reach Navigation Level 50', navLevel, 50, '/expeditions'),
        progressGoal('nav_100', 'Master Navigator', 'Reach Navigation Level 100', navLevel, 100, '/expeditions'),
        badgeGoal('fleet_admiral', 'Fleet Admiral', 'Complete 100 voyages', voyagesDone, 100, '/expeditions'),
        badgeGoal('corsairs_bane', "Corsair's Bane", 'Defeat Barnacle Pete in under 2 minutes', 0, 1, '/raids', { binary: true }),
        badgeGoal('ghost_ship', 'Ghost Ship', 'Defeat Barnacle Pete without taking damage', 0, 1, '/raids', { binary: true }),
      ],
    },
    {
      title: 'Tavern & Records',
      accent: '#f0c040',
      goals: [
        progressGoal('tide_run', 'Tide Run Distance', 'Reach 500 in a single run', tideBest, 500, '/tavern/tide-run', { record: true }),
        progressGoal('fotd_streak', 'Daily Detective', 'Solve Fish of the Day 10 days in a row', fotdBest, 10, '/tavern/fish-of-the-day', { record: true }),
      ],
    },
    {
      title: 'Wealth',
      accent: '#a78bfa',
      goals: [
        badgeGoal('deep_pockets', 'Deep Pockets', 'Hold 1,000,000 doubloons at once', doubloons, 1_000_000, '/fishing'),
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
      return { label: n.label, kind, lines: [n.bridge ?? n.flavor] }
    })
  const raidNextView = raidViews.find(v => v.status === 'available')
  const raidNext = raidNextView
    ? { label: raidNextView.node.label, flavor: raidNextView.node.flavor }
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
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
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
