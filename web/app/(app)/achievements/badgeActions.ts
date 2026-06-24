'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BADGES, BADGE_MAP, BADGE_REWARD, badgeReward, MAX_EQUIPPED_BADGES } from '@/lib/badges'
import { getLevelFromXP as fishLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { crewLevelFromXP, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { CREW_HALL_MAX_TIER } from '@/lib/crewHall'

// Zones that prestige (Ancient Deep doesn't — see fishing/actions.ts).
const PRESTIGE_ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
// All four raids' challenge-completion ids (Finndicate's Bane capstone).
const CHALLENGE_RAID_IDS = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']

/** Grant every badge whose condition is met but not yet recorded. Derives
 *  from existing data (no per-feature hook needed), so it self-heals any
 *  badge a player has already earned. Called when the Captain's Log loads.
 *  Two badges can't be derived from stored state — Trophy Catch and Catfish
 *  Jackpot — so those keep dedicated unlock hooks at their moment. */
export async function reconcileBadges(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const [{ data: profile }, { data: raidRows }, { data: crewRows }, { count: voyageCount }] = await Promise.all([
    admin.from('profiles').select('unlocked_badges, fishing_xp, expedition_xp, highest_perfect_streak, total_perfects, doubloons, crew_hall_tier, lifetime_recruits, highest_raid_damage, pvp_wins, puzzle_points, tide_run_best_distance, gauntlet_deepest, trophy_catches, prestige_levels').eq('id', user.id).single(),
    admin.from('raid_completions').select('raid_id').eq('user_id', user.id),
    admin.from('user_crew').select('xp').eq('user_id', user.id).is('died_at', null),
    admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'revealed'),
  ])
  if (!profile) return []

  const have = new Set<string>((profile.unlocked_badges as string[] | null) ?? [])
  const raidIds = new Set<string>(((raidRows ?? []) as { raid_id: string }[]).map(r => r.raid_id))
  const maxCrewLevel = ((crewRows ?? []) as { xp: number | null }[])
    .reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  const prestige = (profile.prestige_levels as Record<string, number> | null) ?? {}

  const cond: Record<string, boolean> = {
    master_angler:  fishLevelFromXP(Number(profile.fishing_xp ?? 0)) >= 100,
    navigator:      navLevelFromXP(Number(profile.expedition_xp ?? 0)) >= 50,
    unbroken:       Number(profile.highest_perfect_streak ?? 0) >= 10,
    dead_eye:       Number(profile.total_perfects ?? 0) >= 1000,
    deep_pockets:   Number(profile.doubloons ?? 0) >= 1_000_000,
    prestige_i:     PRESTIGE_ZONES.some(z => (prestige[z] ?? 0) >= 1),
    zone_legend:    PRESTIGE_ZONES.every(z => (prestige[z] ?? 0) >= 1),
    ancient_ones:   ((profile.trophy_catches as number[] | null) ?? []).length >= 6,
    crewmaster:     Number(profile.crew_hall_tier ?? 0) >= CREW_HALL_MAX_TIER,
    full_muster:    Number(profile.lifetime_recruits ?? 0) >= 100,
    old_salt:       maxCrewLevel >= CREW_MAX_LEVEL,
    fleet_admiral:  (voyageCount ?? 0) >= 100,
    heavy_broadside: Number(profile.highest_raid_damage ?? 0) >= 250,
    first_blood:    Number(profile.pvp_wins ?? 0) >= 1,
    duelist:        Number(profile.pvp_wins ?? 0) >= 25,
    den_magnate:    Number(profile.puzzle_points ?? 0) >= 80,
    tide_master:    Number(profile.tide_run_best_distance ?? 0) >= 750,
    davy_jones:     Number(profile.gauntlet_deepest ?? 0) >= 10,
    corsairs_bane:  raidIds.has('corsairs_reckoning_challenge'),
    ghost_ship:     raidIds.has('captain_krust_challenge'),
    cartographers_fall: raidIds.has('cartographer'),
    toll_paid:      raidIds.has('tollmasters_cut'),
    finndicates_bane: CHALLENGE_RAID_IDS.every(id => raidIds.has(id)),
  }

  const toGrant = Object.entries(cond).filter(([id, met]) => met && BADGE_MAP[id] && !have.has(id)).map(([id]) => id)
  if (toGrant.length === 0) return [...have]

  const next = [...have, ...toGrant]
  await admin.from('profiles').update({ unlocked_badges: next }).eq('id', user.id)
  return next
}

/** Claim the doubloon reward for one earned badge. Atomic + idempotent: the
 *  RPC only grants if the badge is unlocked AND not yet claimed. */
export async function claimBadgeReward(badgeId: string): Promise<{ newDoubloons: number; claimed: string[]; amount: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const amount = badgeReward(badgeId)
  if (!BADGE_MAP[badgeId] || amount <= 0) return { error: 'No reward for that badge' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_badge_reward', { p_user: user.id, p_badge: badgeId, p_amount: amount })
  if (error) return { error: 'Could not claim reward' }
  const row = (Array.isArray(data) ? data[0] : data) as { new_doubloons: number; claimed: string[]; granted: boolean } | undefined
  return {
    newDoubloons: Number(row?.new_doubloons ?? 0),
    claimed: row?.claimed ?? [],
    amount: row?.granted ? amount : 0,
  }
}

/** Claim every earned-but-unclaimed badge reward at once. */
export async function claimAllBadgeRewards(): Promise<{ newDoubloons: number; claimed: string[]; totalGranted: number; count: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, unlocked_badges, claimed_badge_rewards').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = new Set<string>((profile.unlocked_badges as string[] | null) ?? [])
  const already = new Set<string>((profile.claimed_badge_rewards as string[] | null) ?? [])
  const claimable = BADGES.filter(b => unlocked.has(b.id) && !already.has(b.id))
  if (claimable.length === 0) {
    return { newDoubloons: Number(profile.doubloons ?? 0), claimed: [...already], totalGranted: 0, count: 0 }
  }

  // Sequential so each RPC's read-add-write of doubloons is deterministic.
  let newDoubloons = Number(profile.doubloons ?? 0)
  let claimed: string[] = [...already]
  let totalGranted = 0
  for (const b of claimable) {
    const amount = BADGE_REWARD[b.difficulty]
    const { data } = await admin.rpc('claim_badge_reward', { p_user: user.id, p_badge: b.id, p_amount: amount })
    const row = (Array.isArray(data) ? data[0] : data) as { new_doubloons: number; claimed: string[]; granted: boolean } | undefined
    if (row?.granted) totalGranted += amount
    newDoubloons = Number(row?.new_doubloons ?? newDoubloons)
    claimed = row?.claimed ?? claimed
  }
  return { newDoubloons, claimed, totalGranted, count: claimable.length }
}

export async function getUnlockedBadges(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges')
    .eq('id', user.id)
    .single()
  return (profile?.unlocked_badges as string[] | null) ?? []
}

export async function unlockBadge(badgeId: string): Promise<{ ok: true } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const current = (profile.unlocked_badges as string[]) ?? []
  if (current.includes(badgeId)) return { ok: true }

  await admin
    .from('profiles')
    .update({ unlocked_badges: [...current, badgeId] })
    .eq('id', user.id)

  return { ok: true }
}

export async function equipBadge(
  badgeId: string,
  slot: 0 | 1 | 2,
): Promise<{ equipped: string[] } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges, equipped_badges')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const unlocked = (profile.unlocked_badges as string[]) ?? []
  if (!unlocked.includes(badgeId)) return { error: 'Badge not unlocked' }

  const equipped = [...((profile.equipped_badges as string[]) ?? [])]
  while (equipped.length < MAX_EQUIPPED_BADGES) equipped.push('')

  // Remove the badge from any other slot it's already in
  for (let i = 0; i < MAX_EQUIPPED_BADGES; i++) {
    if (equipped[i] === badgeId && i !== slot) equipped[i] = ''
  }
  equipped[slot] = badgeId

  await admin.from('profiles').update({ equipped_badges: equipped }).eq('id', user.id)
  return { equipped }
}

export async function unequipBadge(
  slot: 0 | 1 | 2,
): Promise<{ equipped: string[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('equipped_badges')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const equipped = [...((profile.equipped_badges as string[]) ?? [])]
  while (equipped.length < MAX_EQUIPPED_BADGES) equipped.push('')
  equipped[slot] = ''

  await admin.from('profiles').update({ equipped_badges: equipped }).eq('id', user.id)
  return { equipped }
}
