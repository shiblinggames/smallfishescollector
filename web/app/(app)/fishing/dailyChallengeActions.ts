'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveDailyChallenges, getTodayUTC, DAILY_SWEEP_GEMS, type DailyChallengeState } from '@/lib/dailyChallenges'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { grantCrateLoot, type CrateTier, type CrateLoot } from '@/lib/crateLoot'

/** Tier weights for the Master challenge's crate.
 *
 *  Every tier is reachable, which is the point: the prize is a real roll, not
 *  a fixed payout wearing a crate's clothes. But it is not uniform either.
 *  Diamond is 3% of natural crate drops in the Shallows, so handing it out a
 *  quarter of the time would flatten the tier ladder everywhere else in the
 *  game. Twelve percent keeps it a genuine event while still being something
 *  a regular Master clearer sees every couple of weeks. */
const MASTER_CRATE_WEIGHTS: [CrateTier, number][] = [
  ['wooden',  25],
  ['metal',   35],
  ['gold',    28],
  ['diamond', 12],
]

function rollMasterCrateTier(): CrateTier {
  const total = MASTER_CRATE_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)
  let roll = Math.random() * total
  for (const [tier, weight] of MASTER_CRATE_WEIGHTS) {
    roll -= weight
    if (roll < 0) return tier
  }
  return 'wooden'
}

// Get-or-create the snapshot of the player's fishing level for the day.
// The challenges they're served depend on which zones they have unlocked
// — snapshotting locks today's set so leveling up across a zone boundary
// (e.g. 14 → 15, unlocking Open Waters) doesn't swap a challenge out
// from under their in-progress count.
async function resolveSnapshotLevel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  date: string,
  currentLevel: number,
): Promise<number> {
  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('fishing_level_snapshot')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()
  if (row?.fishing_level_snapshot != null) return row.fishing_level_snapshot
  // First touch today (or legacy row with NULL snapshot) — pin the
  // current level so subsequent reads stay stable.
  await admin
    .from('daily_challenge_progress')
    .upsert(
      { user_id: userId, date, fishing_level_snapshot: currentLevel },
      { onConflict: 'user_id,date' },
    )
  return currentLevel
}

export async function getDailyChallenge(): Promise<DailyChallengeState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const date = getTodayUTC()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles').select('fishing_xp').eq('id', user.id).single()
  const currentLevel = getLevelFromXP(profile?.fishing_xp ?? 0)
  const snapLevel = await resolveSnapshotLevel(admin, user.id, date, currentLevel)
  const challenges = await getEffectiveDailyChallenges(date, admin, snapLevel)

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, p4, claimed_1, claimed_2, claimed_3, claimed_4, claimed_bonus')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  // Sliced to however many challenges the player actually has. Below the
  // Master gate that is three, and the p4/claimed_4 columns simply never
  // surface.
  const progress = [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0, row?.p4 ?? 0]
  const claimed = [
    row?.claimed_1 ?? false, row?.claimed_2 ?? false,
    row?.claimed_3 ?? false, row?.claimed_4 ?? false,
  ]

  return {
    date,
    challenges,
    progress: progress.slice(0, challenges.length),
    claimed: claimed.slice(0, challenges.length),
    sweepClaimed: row?.claimed_bonus ?? false,
  }
}

export async function claimDailyReward(
  index: 0 | 1 | 2 | 3,
): Promise<
  | { doubloons: number; crate?: { tier: CrateTier; loot: CrateLoot } }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const date = getTodayUTC()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles').select('fishing_xp, doubloons').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const currentLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const snapLevel = await resolveSnapshotLevel(admin, user.id, date, currentLevel)
  const challenges = await getEffectiveDailyChallenges(date, admin, snapLevel)
  const challenge = challenges[index]

  // A client can ask for index 3 whenever it likes, so the gate is here and
  // not in the UI: below Fishing 75 getEffectiveDailyChallenges returns three
  // challenges and this read is undefined, which fails closed.
  if (!challenge) return { error: 'Challenge not available' }

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, p4, claimed_1, claimed_2, claimed_3, claimed_4, claimed_bonus')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  const progress = [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0, row?.p4 ?? 0]
  const claimed = [
    row?.claimed_1 ?? false, row?.claimed_2 ?? false,
    row?.claimed_3 ?? false, row?.claimed_4 ?? false,
  ]

  if (progress[index] < challenge.target) return { error: 'Challenge not complete' }
  if (claimed[index]) return { error: 'Already claimed' }

  const claimKey = `claimed_${index + 1}` as 'claimed_1' | 'claimed_2' | 'claimed_3' | 'claimed_4'

  // Atomic claim: flip this index's flag in one guarded update (matching
  // not-yet-true, i.e. false OR null). Only the winner of a concurrent
  // double-fire gets a row back, so the reward is granted exactly once — the
  // old read-check-then-write let two parallel calls both pass and pay twice.
  const { data: claimedRow } = await admin
    .from('daily_challenge_progress')
    .update({ [claimKey]: true })
    .eq('user_id', user.id)
    .eq('date', date)
    .not(claimKey, 'is', true)
    .select('user_id')
    .maybeSingle()
  if (!claimedRow) return { error: 'Already claimed' }

  // ── The payout ────────────────────────────────────────────────────────────
  // Master pays a rolled crate and no coin; the other three pay coin and no
  // crate. grantCrateLoot handles the whole grant (doubloons, bait, cosmetic,
  // pet) and bumps the lifetime crates-opened counter itself, so a Master
  // clear also feeds the crate badges exactly like a reeled crate would.
  //
  // The claim flag above is already flipped, so the crate cannot be rolled
  // twice even if the loot grant throws.
  let crate: { tier: CrateTier; loot: CrateLoot } | undefined
  let newDoubloons = profile.doubloons ?? 0

  if (challenge.crateReward) {
    const tier = rollMasterCrateTier()
    crate = { tier, loot: await grantCrateLoot(admin, user.id, tier) }
    // grantCrateLoot may have paid doubloons into the profile, so re-read
    // rather than returning the stale pre-grant balance to the UI.
    const { data: after } = await admin
      .from('profiles').select('doubloons').eq('id', user.id).single()
    newDoubloons = after?.doubloons ?? newDoubloons
    void admin.rpc('bump_profile_stat', { uid: user.id, col: 'daily_master_cleared', n: 1 })
      .then(() => {}, () => {})
  } else {
    newDoubloons += challenge.reward
    await Promise.all([
      admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
      admin.from('doubloon_transactions').insert({
        user_id: user.id, amount: challenge.reward,
        reason: `Daily challenge (${challenge.label})`,
      }),
    ])
  }

  // The sweep bonus is NOT paid here. It has its own claim, below.
  return { doubloons: newDoubloons, crate }
}

/** Claim the all-three sweep bonus.
 *
 *  Its own action, and its own tap. This used to pay itself the instant the
 *  third challenge was claimed, which meant the gems arrived in the same
 *  moment as a doubloon reward and were easy to miss entirely.
 *
 *  THE SWEEP IS STILL THREE. It only ever inspects indexes 0-2, so the
 *  optional Master challenge can neither trigger it nor block it: a level 75
 *  player must never owe more work than a level 20 player for the same gems. */
export async function claimDailySweep(): Promise<
  { gems: number; awarded: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const date = getTodayUTC()
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('daily_challenge_progress')
    .select('claimed_1, claimed_2, claimed_3, claimed_bonus')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  if (!row) return { error: 'Nothing to claim' }
  if (!(row.claimed_1 && row.claimed_2 && row.claimed_3)) return { error: 'Claim all three first' }
  if (row.claimed_bonus) return { error: 'Already claimed' }

  // Same guarded flip the individual claims use: only the call that actually
  // sets the flag pays, so a double tap or two tabs cannot both collect.
  const { data: swept } = await admin
    .from('daily_challenge_progress')
    .update({ claimed_bonus: true })
    .eq('user_id', user.id)
    .eq('date', date)
    .not('claimed_bonus', 'is', true)
    .select('user_id')
    .maybeSingle()
  if (!swept) return { error: 'Already claimed' }

  // Atomic bump rather than read-add-write: the gem balance is shared with
  // chest opens and casino payouts, so an absolute overwrite could stomp a
  // concurrent grant.
  await admin.rpc('bump_profile_stat', { uid: user.id, col: 'gems', n: DAILY_SWEEP_GEMS })
  // Lifetime swept days, for the sweep badges. Fire and forget: a failed
  // counter must never cost the player the gems they just earned.
  void admin.rpc('bump_profile_stat', { uid: user.id, col: 'daily_challenge_sweeps', n: 1 })
    .then(() => {}, () => {})

  const { data: after } = await admin
    .from('profiles').select('gems').eq('id', user.id).single()

  return { gems: after?.gems ?? 0, awarded: DAILY_SWEEP_GEMS }
}
