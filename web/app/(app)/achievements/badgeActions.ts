'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stampBadges } from '@/lib/badgeGrant'
import { BADGES, BADGE_MAP, BADGE_REWARD, BADGE_GEM_REWARD, badgeReward, badgeGemReward, MAX_EQUIPPED_BADGES } from '@/lib/badges'
import { earnedBadgeIds, BADGE_PROFILE_COLUMNS, type BadgeProfileFields, exchangeStatsFrom, type ExchangePositionRow } from '@/lib/badgeConditions'

/** Grant every badge whose condition is met but not yet recorded. Derives
 *  from existing data (no per-feature hook needed), so it self-heals any
 *  badge a player has already earned. Called when the Captain's Log loads.
 *  Shares its condition logic with the Achievement Points leaderboard via
 *  lib/badgeConditions so the two can't drift. Three badges can't be derived
 *  from stored state — Trophy Catch, Catfish Jackpot, Full Collection — so
 *  those keep dedicated unlock hooks at their moment. */
export async function reconcileBadges(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const [{ data: profile }, { data: raidRows }, { data: crewRows }, { count: voyageCount }, { count: collectionCount }, { data: rodRows }, { count: goldenCount }, { data: exchangeRows }] = await Promise.all([
    admin.from('profiles').select(`unlocked_badges, badge_unlocked_at, ${BADGE_PROFILE_COLUMNS}`).eq('id', user.id).single(),
    admin.from('raid_completions').select('raid_id, elapsed_ms').eq('user_id', user.id),
    admin.from('user_crew').select('xp, died_at, effects, cards(slug)').eq('user_id', user.id),
    admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'revealed'),
    admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    admin.from('shiny_catches').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('exchange_bets').select('status, stake, payout').eq('user_id', user.id),
  ])
  if (!profile) return []

  const have = new Set<string>((profile.unlocked_badges as string[] | null) ?? [])
  // Supabase types cards as an array though it's a to-one object at runtime.
  const crew = (crewRows ?? []) as unknown as { xp: number | null; died_at: string | null; effects: string[] | null; cards: { slug: string | null } | null }[]
  const derived = earnedBadgeIds(profile as BadgeProfileFields, {
    raids: (raidRows ?? []) as { raid_id: string; elapsed_ms: number | null }[],
    crew: crew.map(c => ({ xp: c.xp, died_at: c.died_at, effects: c.effects ?? null, slug: c.cards?.slug ?? null })),
    voyageCount: voyageCount ?? 0,
    // Lifetime species (prestige-proof) drives the collection badges; fall back
    // to the live count for any row the backfill hasn't reached.
    collectionCount: Math.max(collectionCount ?? 0, Number((profile as BadgeProfileFields).lifetime_species_count ?? 0)),
    rodTiers: ((rodRows ?? []) as { rod_tier: number }[]).map(r => r.rod_tier),
    goldenCount: goldenCount ?? 0,
    exchange: exchangeStatsFrom((exchangeRows ?? []) as ExchangePositionRow[]),
  })

  const toGrant = derived.filter(id => !have.has(id))
  if (toGrant.length === 0) return [...have]

  const next = [...have, ...toGrant]
  await admin.from('profiles').update({
    unlocked_badges: next,
    badge_unlocked_at: stampBadges((profile as { badge_unlocked_at?: unknown }).badge_unlocked_at, toGrant),
  }).eq('id', user.id)
  return next
}

/** Claim one earned badge's reward. Atomic + idempotent: the RPC only grants if
 *  the badge is unlocked AND not yet claimed, and it moves BOTH currencies in
 *  the one statement that marks it claimed, so a Grandmaster can never land the
 *  coin and miss the gems. */
export async function claimBadgeReward(badgeId: string): Promise<{ newDoubloons: number; newGems: number; claimed: string[]; amount: number; gems: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const amount = badgeReward(badgeId)
  const gems = badgeGemReward(badgeId)
  if (!BADGE_MAP[badgeId] || amount <= 0) return { error: 'No reward for that badge' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_badge_reward', {
    p_user: user.id, p_badge: badgeId, p_amount: amount, p_gems: gems,
  })
  if (error) return { error: 'Could not claim reward' }
  const row = (Array.isArray(data) ? data[0] : data) as { new_doubloons: number; new_gems: number; claimed: string[]; granted: boolean } | undefined
  return {
    newDoubloons: Number(row?.new_doubloons ?? 0),
    newGems: Number(row?.new_gems ?? 0),
    claimed: row?.claimed ?? [],
    amount: row?.granted ? amount : 0,
    gems: row?.granted ? gems : 0,
  }
}

/** Claim every earned-but-unclaimed badge reward at once. */
export async function claimAllBadgeRewards(): Promise<{ newDoubloons: number; newGems: number; claimed: string[]; totalGranted: number; totalGems: number; count: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, gems, unlocked_badges, claimed_badge_rewards').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = new Set<string>((profile.unlocked_badges as string[] | null) ?? [])
  const already = new Set<string>((profile.claimed_badge_rewards as string[] | null) ?? [])
  const claimable = BADGES.filter(b => unlocked.has(b.id) && !already.has(b.id))
  if (claimable.length === 0) {
    return {
      newDoubloons: Number(profile.doubloons ?? 0), newGems: Number(profile.gems ?? 0),
      claimed: [...already], totalGranted: 0, totalGems: 0, count: 0,
    }
  }

  // Sequential so each RPC's read-add-write of both balances is deterministic.
  let newDoubloons = Number(profile.doubloons ?? 0)
  let newGems = Number(profile.gems ?? 0)
  let claimed: string[] = [...already]
  let totalGranted = 0
  let totalGems = 0
  for (const b of claimable) {
    const amount = BADGE_REWARD[b.difficulty]
    const gems = BADGE_GEM_REWARD[b.difficulty]
    const { data } = await admin.rpc('claim_badge_reward', {
      p_user: user.id, p_badge: b.id, p_amount: amount, p_gems: gems,
    })
    const row = (Array.isArray(data) ? data[0] : data) as { new_doubloons: number; new_gems: number; claimed: string[]; granted: boolean } | undefined
    if (row?.granted) { totalGranted += amount; totalGems += gems }
    newDoubloons = Number(row?.new_doubloons ?? newDoubloons)
    newGems = Number(row?.new_gems ?? newGems)
    claimed = row?.claimed ?? claimed
  }
  return { newDoubloons, newGems, claimed, totalGranted, totalGems, count: claimable.length }
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

// Badges the CLIENT is allowed to unlock directly. These are raid combat-feat
// trophies earned mid-fight (client-side combat, so the server can't re-derive
// them) — they carry small rewards. EVERY other badge is granted only by a
// trusted server hook via grantBadgeDirect, so a crafted `unlockBadge('zone_legend')`
// call can no longer forge a high-value badge and then claim its doubloon reward.
// Keep this in sync with the unlockBadge() calls in RaidGame.tsx (the only client
// caller).
const CLIENT_GRANTABLE_BADGES = new Set<string>([
  'corsairs_bane', 'ghost_ship',          // challenge-mode boss clears
  'all_hands_legends', 'iron_ruse', 'tight_quarters', 'dead_reckoning', // raid feats
  'not_a_shot_fired',
])

export async function unlockBadge(badgeId: string): Promise<{ ok: true } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }
  // Only the client-earned raid feat badges may be unlocked via this HTTP-
  // reachable action. Server-side milestones grant their badges through
  // grantBadgeDirect (lib/badgeGrant), which this endpoint deliberately can't reach.
  if (!CLIENT_GRANTABLE_BADGES.has(badgeId)) return { error: 'Not eligible' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges, badge_unlocked_at')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const current = (profile.unlocked_badges as string[]) ?? []
  if (current.includes(badgeId)) return { ok: true }

  await admin
    .from('profiles')
    .update({
      unlocked_badges: [...current, badgeId],
      badge_unlocked_at: stampBadges((profile as { badge_unlocked_at?: unknown }).badge_unlocked_at, [badgeId]),
    })
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
