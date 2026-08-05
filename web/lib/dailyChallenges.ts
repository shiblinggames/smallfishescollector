export type DailyChallengeType = 'catch_any' | 'catch_zone' | 'land_perfects' | 'catch_rarity' | 'earn_value'

export interface DailyChallenge {
  type: DailyChallengeType
  target: number
  zone?: string
  minRarity?: number
  /** Doubloons paid on claim. Zero for Master challenges, which pay a crate. */
  reward: number
  label: string
  /** Master challenges pay a randomly rolled supply crate instead of coin. */
  crateReward?: boolean
}

export interface DailyChallengeState {
  date: string
  /** Three, or FOUR once the player is Master-eligible. Never assume three. */
  challenges: DailyChallenge[]
  progress: number[]
  claimed: boolean[]
  /** Has today's all-three sweep bonus already been paid? */
  sweepClaimed: boolean
}

/** Fishing level that unlocks the optional fourth "Master" challenge.
 *
 *  Deliberately the same level that opens the Ancient Deep, so the tier has a
 *  reason to exist beyond bigger numbers: the day you can reach the oldest
 *  water is the day the tide starts setting you a fourth task. */
export const MASTER_MIN_LEVEL = 75

/** Gems paid once a day for claiming ALL THREE challenges.
 *
 *  Deliberately small. The three doubloon rewards are the day's actual pay;
 *  this is a nudge to finish the hard one instead of pocketing the easy two.
 *  Ten a day means ten swept days buys one recruit reroll (100), so the number
 *  is legible without being a faucet. Sweeps run about 18% of played days, so
 *  it stays a reward for the full set rather than a login stipend.
 *
 *  Lives here and not in the action: a 'use server' file silently drops
 *  non-async exports, so the UI could not import it from there. */
export const DAILY_SWEEP_GEMS = 10

// Pool sizes are 14, 13, 11 — LCM is 2002 days before the same 3-combo repeats
const TIER1: DailyChallenge[] = [
  { type: 'catch_any',     target: 10,  reward: 75,  label: 'Catch 10 fish' },
  { type: 'catch_any',     target: 15,  reward: 75,  label: 'Catch 15 fish' },
  { type: 'catch_zone',    target: 8,   zone: 'shallows',    reward: 60,  label: 'Catch 8 fish in the Shallows' },
  { type: 'catch_zone',    target: 12,  zone: 'shallows',    reward: 65,  label: 'Catch 12 fish in the Shallows' },
  { type: 'catch_zone',    target: 5,   zone: 'open_waters', reward: 70,  label: 'Catch 5 fish in Open Waters' },
  { type: 'land_perfects', target: 3,   reward: 80,  label: 'Land 3 perfect catches' },
  { type: 'land_perfects', target: 5,   reward: 90,  label: 'Land 5 perfect catches' },
  { type: 'land_perfects', target: 7,   reward: 90,  label: 'Land 7 perfect catches' },
  { type: 'catch_rarity',  target: 1,   minRarity: 2, reward: 65,  label: 'Catch an Uncommon or better fish' },
  { type: 'catch_rarity',  target: 3,   minRarity: 2, reward: 70,  label: 'Catch 3 Uncommon or better fish' },
  { type: 'catch_rarity',  target: 1,   minRarity: 3, reward: 75,  label: 'Catch a Rare or better fish' },
  { type: 'earn_value',    target: 300,  reward: 70,  label: 'Catch fish worth 300 ⟡ total' },
  { type: 'earn_value',    target: 500,  reward: 75,  label: 'Catch fish worth 500 ⟡ total' },
  { type: 'earn_value',    target: 800,  reward: 80,  label: 'Catch fish worth 800 ⟡ total' },
]

const TIER2: DailyChallenge[] = [
  { type: 'catch_any',     target: 20,  reward: 160, label: 'Catch 20 fish' },
  { type: 'catch_any',     target: 25,  reward: 175, label: 'Catch 25 fish' },
  { type: 'catch_any',     target: 30,  reward: 180, label: 'Catch 30 fish' },
  { type: 'catch_zone',    target: 8,   zone: 'open_waters', reward: 150, label: 'Catch 8 fish in Open Waters' },
  { type: 'catch_zone',    target: 12,  zone: 'open_waters', reward: 165, label: 'Catch 12 fish in Open Waters' },
  { type: 'catch_zone',    target: 5,   zone: 'deep',        reward: 165, label: 'Catch 5 fish in the Deep' },
  { type: 'catch_zone',    target: 8,   zone: 'deep',        reward: 180, label: 'Catch 8 fish in the Deep' },
  { type: 'land_perfects', target: 10,  reward: 200, label: 'Land 10 perfect catches' },
  { type: 'land_perfects', target: 15,  reward: 200, label: 'Land 15 perfect catches' },
  { type: 'catch_rarity',  target: 2,   minRarity: 3, reward: 160, label: 'Catch 2 Rare or better fish' },
  { type: 'catch_rarity',  target: 1,   minRarity: 4, reward: 175, label: 'Catch an Epic or better fish' },
  { type: 'earn_value',    target: 2000, reward: 175, label: 'Catch fish worth 2,000 ⟡ total' },
  { type: 'earn_value',    target: 3500, reward: 185, label: 'Catch fish worth 3,500 ⟡ total' },
]

const TIER3: DailyChallenge[] = [
  { type: 'catch_any',     target: 40,  reward: 325, label: 'Catch 40 fish' },
  { type: 'catch_any',     target: 50,  reward: 325, label: 'Catch 50 fish' },
  { type: 'catch_zone',    target: 3,   zone: 'abyss', reward: 350, label: 'Catch 3 fish in the Abyss' },
  { type: 'catch_zone',    target: 5,   zone: 'abyss', reward: 375, label: 'Catch 5 fish in the Abyss' },
  { type: 'catch_zone',    target: 8,   zone: 'abyss', reward: 375, label: 'Catch 8 fish in the Abyss' },
  { type: 'land_perfects', target: 20,  reward: 350, label: 'Land 20 perfect catches' },
  { type: 'land_perfects', target: 30,  reward: 360, label: 'Land 30 perfect catches' },
  { type: 'catch_rarity',  target: 1,   minRarity: 5, reward: 375, label: 'Catch a Legendary fish' },
  { type: 'catch_rarity',  target: 2,   minRarity: 4, reward: 350, label: 'Catch 2 Epic or better fish' },
  { type: 'catch_rarity',  target: 3,   minRarity: 4, reward: 360, label: 'Catch 3 Epic or better fish' },
  { type: 'earn_value',    target: 6000, reward: 350, label: 'Catch fish worth 6,000 ⟡ total' },
]

// ── TIER 4: Master. Optional, unlocked at Fishing 75, pays a crate. ─────────
//
// Tuned against live claim rates rather than feel. On days a player fishes at
// all, Easy is claimed 55% of the time, Medium 44%, Hard 35%. Master is meant
// to sit near 10-15% for the players who can see it, so targets run roughly
// 2.5-3x their Hard counterparts.
//
// Two ceilings shape these numbers and neither is obvious from the targets:
//   - Ancient Deep bites take 45-120 SECONDS, so its counts stay low. Ten
//     catches there is already ~15 minutes of waiting; asking for 25 would be
//     an afternoon, not a challenge.
//   - Legendary is 2% even in the Abyss, so counting legendaries past 2 turns
//     into a 300-cast coin-flip. Epic-or-better (10% in the Abyss) carries the
//     rarity slot instead.
//
// reward is 0 on purpose: Master pays a rolled crate, not coin. See
// claimDailyReward.
const TIER4: DailyChallenge[] = [
  { type: 'catch_any',     target: 120,   reward: 0, crateReward: true, label: 'Catch 120 fish' },
  { type: 'catch_any',     target: 150,   reward: 0, crateReward: true, label: 'Catch 150 fish' },
  { type: 'catch_zone',    target: 10,    zone: 'ancient_deep', reward: 0, crateReward: true, label: 'Catch 10 fish in the Ancient Deep' },
  { type: 'catch_zone',    target: 15,    zone: 'ancient_deep', reward: 0, crateReward: true, label: 'Catch 15 fish in the Ancient Deep' },
  { type: 'catch_zone',    target: 25,    zone: 'abyss',        reward: 0, crateReward: true, label: 'Catch 25 fish in the Abyss' },
  { type: 'catch_zone',    target: 35,    zone: 'abyss',        reward: 0, crateReward: true, label: 'Catch 35 fish in the Abyss' },
  { type: 'land_perfects', target: 60,    reward: 0, crateReward: true, label: 'Land 60 perfect catches' },
  { type: 'land_perfects', target: 80,    reward: 0, crateReward: true, label: 'Land 80 perfect catches' },
  { type: 'catch_rarity',  target: 2,     minRarity: 5, reward: 0, crateReward: true, label: 'Catch 2 Legendary fish' },
  { type: 'catch_rarity',  target: 12,    minRarity: 4, reward: 0, crateReward: true, label: 'Catch 12 Epic or better fish' },
  { type: 'earn_value',    target: 40000, reward: 0, crateReward: true, label: 'Catch fish worth 40,000 ⟡ total' },
  { type: 'earn_value',    target: 60000, reward: 0, crateReward: true, label: 'Catch fish worth 60,000 ⟡ total' },
]

/** Every challenge in every tier, flat. Exists so scripts/check-copy.mts can
 *  hold these labels to the same house rules as every other systems string. */
export const ALL_DAILY_CHALLENGES: DailyChallenge[] = [...TIER1, ...TIER2, ...TIER3, ...TIER4]

function dateHash(date: string, salt: number): number {
  let h = (salt * 2654435761) >>> 0
  for (const c of date) h = (((h ^ c.charCodeAt(0)) * 1664525) >>> 0) + 1013904223
  return h >>> 0
}

// Min fishing level to unlock each zone. Duplicated from
// app/(app)/fishing/zoneData.ts because lib/ can't import from app/.
// Keep these two constants in sync.
const ZONE_MIN_LEVEL: Record<string, number> = {
  shallows:     1,
  open_waters: 15,
  deep:        30,
  abyss:       50,
  ancient_deep: 75,
}

function isEligibleAtLevel(challenge: DailyChallenge, fishingLevel: number): boolean {
  if (!challenge.zone) return true
  const min = ZONE_MIN_LEVEL[challenge.zone] ?? 1
  return fishingLevel >= min
}

// Deterministic picker that respects the player's unlocked zones.
//
// Try the date's natural index first. If that challenge references a
// zone the player hasn't unlocked, probe forward (deterministically)
// until we find one they CAN do. Because unlocked zones only grow
// monotonically as the player levels, the same player always lands on
// the same probe sequence on a given date — leveling up won't shift
// a challenge they're already mid-way through (unless they cross a
// zone boundary, which is what the level snapshot in
// daily_challenge_progress guards against).
function pickEligible(
  date: string,
  salt: number,
  pool: DailyChallenge[],
  fishingLevel: number,
): DailyChallenge {
  let h = dateHash(date, salt)
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const idx = h % pool.length
    if (isEligibleAtLevel(pool[idx], fishingLevel)) return pool[idx]
    // Probe forward deterministically (LCG-style bump) so the order
    // is reproducible from the same starting hash.
    h = (h * 2654435761 + 1) >>> 0
  }
  // Shouldn't happen — every tier has non-zone challenges that are
  // always eligible — but fall back to the raw modulo just in case.
  return pool[dateHash(date, salt) % pool.length]
}

export function getDailyChallenges(
  date: string,
  // Default to "all zones unlocked" so existing client-only fallback
  // paths keep working. Server paths always pass the real level.
  fishingLevel: number = 999,
): DailyChallenge[] {
  const set = [
    pickEligible(date, 1, TIER1, fishingLevel),
    pickEligible(date, 2, TIER2, fishingLevel),
    pickEligible(date, 3, TIER3, fishingLevel),
  ]
  // The fourth is OPTIONAL and only exists past the gate. Callers must read
  // the array's length rather than assuming three, which is why the state
  // type stopped being a 3-tuple.
  if (fishingLevel >= MASTER_MIN_LEVEL) set.push(pickEligible(date, 4, TIER4, fishingLevel))
  return set
}

// Server-side only: checks challenge_overrides first, falls back to
// the level-aware picker. Admin overrides bypass the level filter on
// purpose (so we can pin event challenges regardless of unlock state).
// Pass an admin Supabase client; the client-side game always uses
// getDailyChallenges directly.
export async function getEffectiveDailyChallenges(
  date: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  fishingLevel: number,
): Promise<DailyChallenge[]> {
  const { data } = await admin
    .from('challenge_overrides')
    .select('tier1, tier2, tier3')
    .eq('date', date)
    .maybeSingle()
  // An override pins the three coin challenges only. The Master slot keeps
  // coming from the pool, so pinning an event day cannot accidentally hand
  // out a crate or silently delete the fourth challenge from under a
  // high-level player mid-day.
  if (data) {
    const set = [data.tier1, data.tier2, data.tier3]
    if (fishingLevel >= MASTER_MIN_LEVEL) set.push(pickEligible(date, 4, TIER4, fishingLevel))
    return set
  }
  return getDailyChallenges(date, fishingLevel)
}

export function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export function challengeIncrement(
  challenge: DailyChallenge,
  fishHabitat: string,
  fishRarity: number,
  fishSellValue: number,
  catchQty: number,
  isPerfect: boolean,
): number {
  switch (challenge.type) {
    case 'catch_any':     return catchQty
    case 'catch_zone':    return fishHabitat === challenge.zone ? catchQty : 0
    case 'land_perfects': return isPerfect ? 1 : 0
    case 'catch_rarity':  return fishRarity >= (challenge.minRarity ?? 1) ? 1 : 0
    case 'earn_value':    return fishSellValue * catchQty
    default:              return 0
  }
}
