// ── THE DAILY LOOP, CORE (Steam prep, 2026-09-29) ──
//
// The daily challenges (the orders, a claim, the sweep), the Daily Haul (the
// day's gems and bait, the week's crate, the disc's state), the mailbox and
// the contests, with nothing of the web in them. Each takes the store
// (DailyData) and the captain's id. On the web the server actions
// (fishing/dailyChallengeActions, actions/dailyBonus, actions/mail,
// tavern/contests/actions) check the session and hand these the Supabase
// store; offline, the local save's.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid` (and, for mail, the account's join time is passed in); every table read
// and guarded write became a store operation; the day and the week read the
// game clock.

import { clockNow } from '@/lib/clock'
import { dailyChallengesWithOverride, getTodayUTC, DAILY_SWEEP_GEMS, type DailyChallengeState } from '@/lib/dailyChallenges'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { grantCrateLootTo, type CrateTier, type CrateLoot } from '@/lib/crateLoot'
import { isPremiumActive } from '@/lib/premium'
import { kingWeekStr } from '@/app/(app)/tavern/trivia/constants'
import { rngNext } from '@/lib/rng'
import type { ClaimMailErrorCode, ClaimMailResult, InboxResult } from '@/lib/mailTypes'
import type { ContestView } from '@/lib/contests'
import type { DailyData, DailyFlag } from '@/lib/data/dailyData'

// ── The daily challenges ──────────────────────────────────────────────────────

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
  let roll = rngNext() * total
  for (const [tier, weight] of MASTER_CRATE_WEIGHTS) {
    roll -= weight
    if (roll < 0) return tier
  }
  return 'wooden'
}

// Get-or-create the snapshot of the player's fishing level for the day.
// The challenges they're served depend on which zones they have unlocked:
// snapshotting locks today's set so leveling up across a zone boundary
// (e.g. 14 → 15, unlocking Open Waters) doesn't swap a challenge out
// from under their in-progress count.
async function resolveSnapshotLevel(db: DailyData, uid: string, date: string, currentLevel: number): Promise<number> {
  const row = await db.dailyRow(uid, date)
  if (row?.fishing_level_snapshot != null) return row.fishing_level_snapshot
  // First touch today (or legacy row with NULL snapshot): pin the current
  // level so subsequent reads stay stable.
  await db.pinDailySnapshot(uid, date, currentLevel)
  return currentLevel
}

async function challengesFor(db: DailyData, uid: string, date: string) {
  const profile = await db.profile(uid, 'fishing_xp, doubloons')
  const currentLevel = getLevelFromXP(Number(profile?.fishing_xp ?? 0))
  const snapLevel = await resolveSnapshotLevel(db, uid, date, currentLevel)
  return { profile, challenges: dailyChallengesWithOverride(date, await db.challengeOverride(date), snapLevel) }
}

export async function getDailyChallenge(db: DailyData, uid: string): Promise<DailyChallengeState | null> {
  const date = getTodayUTC()
  const { challenges } = await challengesFor(db, uid, date)
  const row = await db.dailyRow(uid, date)

  // Sliced to however many challenges the player actually has. Below the
  // Master gate that is three, and the fourth slot simply never surfaces.
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

export async function claimDailyReward(db: DailyData, uid: string, index: 0 | 1 | 2 | 3): Promise<
  | { doubloons: number; crate?: { tier: CrateTier; loot: CrateLoot } }
  | { error: string }
> {
  const date = getTodayUTC()
  const { profile, challenges } = await challengesFor(db, uid, date)
  if (!profile) return { error: 'Profile not found' }
  const challenge = challenges[index]

  // A client can ask for index 3 whenever it likes, so the gate is here and
  // not in the UI: below Fishing 75 there are three challenges and this read
  // is undefined, which fails closed.
  if (!challenge) return { error: 'Challenge not available' }

  const row = await db.dailyRow(uid, date)
  const progress = [row?.p1 ?? 0, row?.p2 ?? 0, row?.p3 ?? 0, row?.p4 ?? 0]
  const claimed = [
    row?.claimed_1 ?? false, row?.claimed_2 ?? false,
    row?.claimed_3 ?? false, row?.claimed_4 ?? false,
  ]

  if (progress[index] < challenge.target) return { error: 'Challenge not complete' }
  if (claimed[index]) return { error: 'Already claimed' }

  // Atomic claim: flip this index's flag only if it is not already true. Only
  // the winner of a concurrent double-fire is paid.
  const flag = `claimed_${index + 1}` as DailyFlag
  if (!(await db.claimDailyFlag(uid, date, flag))) return { error: 'Already claimed' }

  // ── The payout ────────────────────────────────────────────────────────────
  // Master pays a rolled crate and no coin; the other three pay coin and no
  // crate. The crate loot grant handles the whole grant (doubloons, bait,
  // cosmetic, pet).
  //
  // IT DOES NOT FEED THE CRATE BADGES, and that is deliberate. Those count
  // crates you fished up, and this one was handed over for clearing a
  // challenge. The counter is bumped in reelCrate alone.
  //
  // The claim flag above is already flipped, so the crate cannot be rolled
  // twice even if the loot grant throws.
  let crate: { tier: CrateTier; loot: CrateLoot } | undefined
  let newDoubloons = Number(profile.doubloons ?? 0)

  if (challenge.crateReward) {
    const tier = rollMasterCrateTier()
    crate = { tier, loot: await grantCrateLootTo(db, uid, tier) }
    // The loot may have paid doubloons into the profile, so re-read rather than
    // returning the stale pre-grant balance to the UI.
    const after = await db.profile(uid, 'doubloons')
    newDoubloons = Number(after?.doubloons ?? newDoubloons)
    void db.bumpStat(uid, 'daily_master_cleared', 1).catch(() => {})
  } else {
    // Paid in place, so a sale landing at the same moment is not written over.
    ;[newDoubloons] = await Promise.all([
      db.grant(uid, 'doubloons', challenge.reward),
      db.ledger(uid, challenge.reward, `Daily challenge (${challenge.label})`),
    ])
  }

  // The sweep bonus is NOT paid here. It has its own claim, below.
  return { doubloons: newDoubloons, crate }
}

/** Claim the all-three sweep bonus.
 *
 *  Its own claim, and its own tap: paid in the same moment as a doubloon
 *  reward, the gems were easy to miss entirely.
 *
 *  THE SWEEP IS STILL THREE. It only ever inspects the first three, so the
 *  optional Master challenge can neither trigger it nor block it: a level 75
 *  player must never owe more work than a level 20 player for the same gems. */
export async function claimDailySweep(db: DailyData, uid: string): Promise<{ gems: number; awarded: number } | { error: string }> {
  const date = getTodayUTC()
  const row = await db.dailyRow(uid, date)

  if (!row) return { error: 'Nothing to claim' }
  if (!(row.claimed_1 && row.claimed_2 && row.claimed_3)) return { error: 'Claim all three first' }
  if (row.claimed_bonus) return { error: 'Already claimed' }

  // Same guarded flip the individual claims use: only the call that actually
  // sets the flag pays.
  if (!(await db.claimDailyFlag(uid, date, 'claimed_bonus'))) return { error: 'Already claimed' }

  // In place: the gem balance is shared with chest opens and casino payouts.
  const gems = await db.grant(uid, 'gems', DAILY_SWEEP_GEMS)
  // Lifetime swept days, for the sweep badges. A failed counter must never cost
  // the player the gems they just earned.
  void db.bumpStat(uid, 'daily_challenge_sweeps', 1).catch(() => {})

  return { gems, awarded: DAILY_SWEEP_GEMS }
}

// ── The Daily Haul ────────────────────────────────────────────────────────────
//
// Three claims. Gems and bait reset daily; the crate is weekly. Members get more
// of each: 150 vs 50 gems, chum vs worms, a gold crate vs a wooden one.

const DAILY_GEMS = 50
const MEMBER_DAILY_GEMS = 150
const DAILY_BAIT_QTY = 20

const todayStr = () => new Date(clockNow()).toISOString().split('T')[0]
const weekStr = () => kingWeekStr(new Date(clockNow()))

export async function claimDailyBonus(db: DailyData, uid: string): Promise<{ claimed: boolean; gems?: number; amount?: number }> {
  // Stamp today FIRST, and only if it is not already stamped. Two taps fired
  // together both pass a plain read; only one of them stamps.
  const profile = await db.stampIfNew(uid, 'last_daily_claim', todayStr())
  if (!profile) return { claimed: false }

  const isPremium = isPremiumActive(profile as Parameters<typeof isPremiumActive>[0])
  const bonus = isPremium ? MEMBER_DAILY_GEMS : DAILY_GEMS

  const [newGems] = await Promise.all([
    db.grant(uid, 'gems', bonus),
    db.ledger(uid, bonus, isPremium ? 'Daily bonus (Member)' : 'Daily bonus', 'gems'),
  ])

  return { claimed: true, gems: newGems, amount: bonus }
}

/** Daily bait: 20 chum for members, 20 worms for everyone else. */
export async function claimDailyBait(db: DailyData, uid: string): Promise<{ claimed: boolean; baitType?: string; quantity?: number }> {
  // Stamp today FIRST, only where it is not already stamped, and pay only if
  // this request is the one that stamped it.
  const profile = await db.stampIfNew(uid, 'last_worm_claim', todayStr())
  if (!profile) return { claimed: false }

  const baitType = isPremiumActive(profile as Parameters<typeof isPremiumActive>[0]) ? 'chum' : 'worm'
  // Added in place, so a cast spending bait at the same moment is not undone.
  await db.addBait(uid, baitType, DAILY_BAIT_QTY)

  return { claimed: true, baitType, quantity: DAILY_BAIT_QTY }
}

/** Weekly free crate: gold for members, wooden for everyone else, with the full
 *  fishing-crate loot table for its tier. One per Monday-week. Paid through the
 *  loot table directly, not reelCrate: reelCrate binds to a fishing crate
 *  TOKEN and would open nothing while still burning the weekly claim. */
export async function claimWeeklyCrate(db: DailyData, uid: string): Promise<
  | { claimed: false }
  | { claimed: true; tier: 'wooden' | 'gold'; loot: CrateLoot }
> {
  // Stamp the gate FIRST so a fast double-tap can't open two crates, and make
  // the stamp itself the check.
  const profile = await db.stampIfNew(uid, 'last_crate_claim_week', weekStr())
  if (!profile) return { claimed: false }

  const tier: 'wooden' | 'gold' = isPremiumActive(profile as Parameters<typeof isPremiumActive>[0]) ? 'gold' : 'wooden'
  // The full loot table, and none of the crate badges: those count crates you
  // fished up, and this one arrived for showing up on a Monday.
  const loot = await grantCrateLootTo(db, uid, tier)

  return { claimed: true, tier, loot }
}

/** WHAT IS STILL WAITING, for the disc on the sea. Read-only and cheap on
 *  purpose: it runs on every chart load, and the disc is one of the first
 *  things drawn. */
export async function bonusState(db: DailyData, uid: string): Promise<{
  isPremium: boolean
  gemsClaimed: boolean
  baitClaimed: boolean
  crateClaimed: boolean
} | null> {
  const profile = await db.profile(uid, 'is_premium, premium_expires_at, last_daily_claim, last_worm_claim, last_crate_claim_week')
  if (!profile) return null
  const today = todayStr()
  return {
    isPremium: isPremiumActive(profile as Parameters<typeof isPremiumActive>[0]),
    gemsClaimed: profile.last_daily_claim === today,
    baitClaimed: profile.last_worm_claim === today,
    crateClaimed: profile.last_crate_claim_week === weekStr(),
  }
}

// ── Mail ──────────────────────────────────────────────────────────────────────
//
// Per-captain state (read, claimed) sits beside each message. `joinedAt` is
// when the account was made: a broadcast older than that reaches a captain
// only if it is evergreen (onboarding mail).

/** Every live message, newest first, with this captain's read and claim state. */
export async function getInbox(db: DailyData, uid: string, joinedAt: string): Promise<InboxResult> {
  const messages = await db.inbox(uid, joinedAt)
  const unreadCount = messages.reduce((n, m) => n + (m.readAt ? 0 : 1), 0)
  return { messages, unreadCount }
}

/** The unread count for the Nav pip, without the bodies. */
export async function getMailUnreadCount(db: DailyData, uid: string, joinedAt: string): Promise<number> {
  const { visible, read } = await db.mailIds(uid, joinedAt)
  const readSet = new Set(read)
  return visible.reduce((n, id) => n + (readSet.has(id) ? 0 : 1), 0)
}

/** Mark one message read. Idempotent: the first read time is kept, and so is a
 *  claim. */
export async function markMailRead(db: DailyData, uid: string, messageId: string): Promise<{ ok: boolean }> {
  await db.markMailRead(uid, [messageId])
  return { ok: true }
}

/** Mark every visible message read ("Mark all read" in the inbox header). */
export async function markAllMailRead(db: DailyData, uid: string, joinedAt: string): Promise<{ ok: boolean; count: number }> {
  const { visible, read } = await db.mailIds(uid, joinedAt)
  const readSet = new Set(read)
  const toMark = visible.filter(id => !readSet.has(id))
  if (toMark.length === 0) return { ok: true, count: 0 }
  await db.markMailRead(uid, toMark)
  return { ok: true, count: toMark.length }
}

/** Claim a message's attachment, once. Returns the amounts AND the captain's
 *  new totals so the Nav can patch its currency without a round-trip. */
export async function claimMailAttachment(db: DailyData, uid: string, messageId: string): Promise<ClaimMailResult> {
  const result = await db.claimMail(uid, messageId)
  if (!result) return { ok: false, error: 'not_found' }
  if (result.error) {
    const code: ClaimMailErrorCode =
      result.error === 'not_found' || result.error === 'no_attachment' || result.error === 'already_claimed'
        ? result.error
        : 'not_found'
    return { ok: false, error: code }
  }
  if (!result.ok) return { ok: false, error: 'not_found' }

  const profile = await db.profile(uid, 'gems, doubloons')
  return {
    ok: true,
    gems: result.gems ?? 0,
    doubloons: result.doubloons ?? 0,
    newGems: Number(profile?.gems ?? 0),
    newDoubloons: Number(profile?.doubloons ?? 0),
  }
}

// ── Contests ──────────────────────────────────────────────────────────────────

/** Clear the "new contest" pulse on the tavern tile once the page is opened.
 *  Re-armed by resetting has_seen_contests when a new contest launches. */
export async function markContestsSeen(db: DailyData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_contests: true })
}

/** Every contest's winner and, for the live board-backed ones, the top three. */
export async function getContestsView(db: DailyData, uid: string): Promise<Record<string, ContestView>> {
  return db.contestsView(uid)
}
