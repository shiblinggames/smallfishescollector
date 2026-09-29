// ── BOUNTIES, CORE (Steam prep, 2026-09-29) ──
//
// The bounty board with nothing of the web in it: the day's orders, their
// meters, a claim, the day's one swap, the points ladder's milestones and the
// rung announcement. Each takes the store (DailyData) and the captain's id. On
// the web expeditions/bountyActions checks the session and hands these the
// Supabase store; offline, the local save's.
//
// Almost nothing here needed new tracking code, because the game already writes
// down what a bounty asks about. The raid clears are a real log carrying the
// raid and its time, the voyages are a row each, and the profile keeps a pile
// of monotonic counters. A bounty records where those stood when it was handed
// out and progress is what has happened since.
//
// The one exception is depth. gauntlet_deepest is a LIFETIME high-water mark,
// so "reach depth 10 today" would be permanently uncompletable for a captain
// who had already been to 15. A run ending is a moment, not a total, so the
// gauntlet logs one bounty event and depth bounties read that.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; every table read and guarded write became a store operation; the
// swap reports a write that did not land (it used to report success).

import { clockNow } from '@/lib/clock'
import { inCaptainsWater, type CaptainWaterRow } from '@/lib/captainWater'
import { isChallengeRaidId, baseRaidIdOf } from '@/lib/raidChallenge'
import {
  ALL_BOUNTIES, BOUNTY_BY_ID, BOUNTY_DAILY_MAX,
  bountyGems, rollBounties, bountyToday, canOffer,
  rungFor, nextRung, rungGems,
  bountyPoints, BOUNTY_POINTS, BOUNTY_SWEEP_POINTS, BOUNTY_MILESTONES, nextMilestone, milestonesEarned,
  type Bounty, type BountyMeter, type BountyRung,
} from '@/lib/bounties'
import { hardcoreUnlocked } from '@/lib/gauntlet'
import { rngNext } from '@/lib/rng'
import type { DailyData, BountySignals } from '@/lib/data/dailyData'

export type BountyView = {
  id: string
  name: string
  desc: string
  tier: Bounty['tier']
  gems: number
  target: number
  progress: number
  claimed: boolean
}

export type BountyBoard = {
  unlocked: boolean
  /** Why it is shut, when it is shut. */
  lockReason: string | null
  bounties: BountyView[]
  gems: number
  rerollUsed: boolean
  /** Gems still on the table today. */
  remaining: number
  /** The most this board can pay at the captain's current rung. */
  rungMax: number
  /** The most it could ever pay, once every rung is earned. */
  dailyMax: number
  /** Which chapter's rung is in force. */
  rung: { chapter: number; title: string; boss: string } | null
  /** What the next rung adds, and who is standing in the way of it. */
  next: { chapter: number; title: string; boss: string; gems: number } | null
  /**
   * A RUNG EARNED AND NOT YET ANNOUNCED.
   *
   * Bounties open at the end of Chapter I and grow a rung with every chapter
   * after it, and none of that is worth anything if a captain never learns it
   * happened: a fourth order appearing weeks later reads as a bug rather than
   * a reward. `bounty_rung_seen` is the last one we told them about, so any gap
   * is an announcement owed.
   *
   * IT RIDES THE BOARD because the board is already read at exactly the right
   * moment: the chart polls it on crossing into the anchorage and again when
   * the Posting House closes.
   *
   * A captain who cleared two chapters between visits is told about the one
   * they LANDED on, not the one they passed through.
   */
  news: { chapter: number; title: string; boss: string; orders: number; gems: number; first: boolean } | null
  /** The slow ladder under the daily gems. */
  points: number
  /** Milestones collected so far. */
  milestonesClaimed: number
  /** Rungs earned but not yet collected. */
  milestonesReady: number
  /** The next rung of the ladder, or null once the capstone is taken. */
  nextMilestone: { points: number; label: string } | null
  /** Points on the board today, if every remaining order is cleared. */
  pointsToday: number
}

export const SHUT_BOARD: BountyBoard = {
  unlocked: false, lockReason: 'Clear Chapter I to open the bounty board',
  bounties: [], gems: 0, rerollUsed: false, remaining: 0,
  rungMax: 0, dailyMax: BOUNTY_DAILY_MAX, rung: null, next: null, news: null,
  points: 0, milestonesClaimed: 0, milestonesReady: 0, nextMilestone: null, pointsToday: 0,
}

/** Everything the meters read, fetched once for the whole board rather than
 *  per bounty. */
type Signals = BountySignals & { profile: Record<string, unknown> }

async function readSignals(db: DailyData, uid: string, since: string): Promise<Signals> {
  const [signals, profile] = await Promise.all([db.bountySignals(uid, since), db.profile(uid, '*')])
  return { ...signals, profile: profile ?? {} }
}

/** How far along one bounty is. Capped by the caller, not here. */
function measure(meter: BountyMeter, s: Signals, baseline: number): number {
  switch (meter.kind) {
    case 'raid_clear':
      // KAN-9. A challenge clear IS a clear of that raid, just a harder one, so
      // it counts toward the base bounty. ONE DIRECTION ONLY: the challenge
      // satisfies the base, never the reverse. Matched by stripping the suffix
      // rather than by a prefix test, so a raid whose id happens to start with
      // another's cannot cross-credit.
      return s.raids.filter(r => r.raid_id === meter.raidId
        || (isChallengeRaidId(r.raid_id) && baseRaidIdOf(r.raid_id) === meter.raidId)).length
    case 'raid_any':
      return s.raids.length
    case 'raid_any_of':
      // Named ids, not a suffix match. "Any challenge raid" made a hard bounty
      // only as hard as Pete on Challenge.
      return s.raids.filter(r => meter.raidIds.includes(r.raid_id)).length
    case 'raid_fast':
      return s.raids.filter(r =>
        r.raid_id === meter.raidId && (r.elapsed_ms ?? Infinity) <= meter.underS * 1000).length
    case 'voyages':
      return s.voyages.length
    case 'raid_distinct':
      return new Set(s.raids.map(r => r.raid_id)).size
    case 'raid_budget': {
      // The N FASTEST clears, not the first N. A bad run in the middle of the
      // day should not sink an order the rest of the day could still fill.
      const times = s.raids
        .map(r => r.elapsed_ms ?? Infinity)
        .filter(ms => Number.isFinite(ms))
        .sort((a, b) => a - b)
        .slice(0, meter.raids)
      if (times.length < meter.raids) return 0
      return times.reduce((n, ms) => n + ms, 0) <= meter.totalS * 1000 ? 1 : 0
    }
    case 'voyage_haul':
      return s.voyages.filter(v => Number(v.total_doubloons ?? 0) >= meter.atLeast).length
    case 'voyage_haul_total':
      return s.voyages.reduce((n, v) => n + Number(v.total_doubloons ?? 0), 0) >= meter.atLeast ? 1 : 0
    case 'voyage_route':
      return s.voyages.filter(v => v.route === meter.route).length
    case 'counter':
      // The only meter that needs a baseline: the column counts a lifetime, so
      // today's progress is the distance travelled since the board was set.
      return Math.max(0, Number(s.profile[meter.column] ?? 0) - baseline)
    case 'event':
      return s.events.filter(e => e.kind === meter.eventKind && e.value >= meter.atLeast).length
  }
}

/** The counter meters' starting values, so a lifetime total can be read as a
 *  daily delta. Log-based meters need nothing: they count rows by timestamp. */
function baselinesFor(bounties: Bounty[], profile: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of bounties) {
    if (b.meter.kind === 'counter') out[b.id] = Number(profile[b.meter.column] ?? 0)
  }
  return out
}

/** Every raid this captain has ever cleared. Decides BOTH which rung of the
 *  board they are on and which orders can be offered at all, off one read. */
async function clearedRaids(db: DailyData, uid: string): Promise<Set<string>> {
  return new Set(await db.clearedRaidIds(uid))
}

/** Can the hardcore door open? Asked of hardcoreUnlocked rather than
 *  re-derived, so an order can never be offered through a door the game keeps
 *  shut. clearedNodes is raid_node_progress.cleared, NOT the raid-id set: the
 *  gate is a map NODE ('chapter_2_class'), which no raid id will ever match. */
function hardcoreOpen(profile: Record<string, unknown> | null): boolean {
  return hardcoreUnlocked({
    captain: inCaptainsWater(profile as CaptainWaterRow | null),
    isAdmin: (profile as { is_admin?: boolean } | null)?.is_admin ?? false,
    clearedNodes: ((profile as { raid_node_progress?: { cleared?: string[] } } | null)?.raid_node_progress?.cleared) ?? [],
    deepest: Number(profile?.gauntlet_deepest ?? 0),
  })
}

function rungFacts(rung: BountyRung, seen: number) {
  const nx = nextRung(rung)
  return {
    rung: { chapter: rung.chapter, title: rung.title, boss: rung.boss },
    next: nx ? { chapter: nx.chapter, title: nx.title, boss: nx.boss, gems: rungGems(nx.slots) } : null,
    rungMax: rungGems(rung.slots),
    // The rung is derived from raid clears; `seen` is the last one announced.
    // Any gap is an announcement owed. See BountyBoard.news.
    news: rung.chapter > seen
      ? {
          chapter: rung.chapter, title: rung.title, boss: rung.boss,
          orders: rung.slots.length, gems: rungGems(rung.slots),
          first: rung.chapter === 1,
        }
      : null,
  }
}

/** The points half of the board, off the same profile row. */
function ladderFacts(profile: Record<string, unknown> | null, bounties: BountyView[]) {
  const points = Number(profile?.bounty_points ?? 0)
  const claimed = Number(profile?.bounty_milestones_claimed ?? 0)
  const nxt = nextMilestone(claimed)
  // What is still winnable today: the unclaimed orders, plus the sweep bonus
  // if none of them have been missed yet.
  const left = bounties.filter(b => !b.claimed)
  const sweepStillOn = bounties.length > 0
  return {
    points,
    milestonesClaimed: claimed,
    milestonesReady: Math.max(0, milestonesEarned(points) - claimed),
    nextMilestone: nxt ? { points: nxt.points, label: nxt.label } : null,
    pointsToday: left.reduce((n, b) => n + (BOUNTY_POINTS[b.tier] ?? 0), 0)
      + (sweepStillOn && left.length === bounties.length ? BOUNTY_SWEEP_POINTS : 0),
  }
}

export async function getBountyBoard(db: DailyData, uid: string): Promise<BountyBoard> {
  const cleared = await clearedRaids(db, uid)
  const rung = rungFor(cleared)
  if (!rung) return SHUT_BOARD
  const seenRow = await db.profile(uid, 'bounty_rung_seen')
  const facts = rungFacts(rung, Number(seenRow?.bounty_rung_seen ?? 0))

  const today = bountyToday()
  const row = await db.bountyBoard(uid)

  // Does the board on file still match the rung it is supposed to be?
  //
  // bounty_ids are frozen the moment a board is handed out and only re-roll
  // when the DATE turns over, so any change to the tiers or the rung sizes
  // leaves yesterday's shape sitting in front of whoever already loaded it
  // today. So the composition is checked, not just the date. Compared as a
  // multiset: the slot ORDER is not meaningful, only how many of each tier.
  //
  // Not re-rolled once anything is claimed. Handing someone a fresh board after
  // they have been paid for part of the old one either takes back work they
  // finished or pays them twice for it.
  const staleShape = row != null && row.date === today && (() => {
    const tiers = (row.bounty_ids ?? [])
      .map(id => BOUNTY_BY_ID.get(id)?.tier)
      .filter((t): t is Bounty['tier'] => t != null)
      .sort()
    const anyClaimed = (row.claimed ?? []).some(Boolean)
    return !anyClaimed && tiers.join(',') !== [...rung.slots].sort().join(',')
  })()

  // A new day, a captain who has never had a board, or a board whose shape no
  // longer exists.
  if (!row || row.date !== today || staleShape) {
    const profile = await db.profile(uid, '*')
    const ranGauntlet = Number(profile?.gauntlet_runs_completed ?? 0) > 0
    const hcOpen = hardcoreOpen(profile)
    // ARCHIVE THE OUTGOING BOARD before it is overwritten, so the catalogue can
    // be tuned from history rather than inference. Losing a history row must
    // never cost a captain their board.
    if (row?.bounty_ids) await db.archiveBountyBoard(uid, row).catch(() => {})
    const rolled = rollBounties(uid, today, rung.slots, cleared, ranGauntlet, hcOpen)
    const assignedAt = new Date(clockNow()).toISOString()
    await db.setBountyBoard(uid, {
      date: today,
      bounty_ids: rolled.map(b => b.id),
      baselines: baselinesFor(rolled, profile ?? {}),
      claimed: rolled.map(() => false),
      assigned_at: assignedAt,
      reroll_used: false,
    })
    const views = rolled.map(b => ({
      id: b.id, name: b.name, desc: b.desc, tier: b.tier,
      gems: bountyGems(b), target: b.target, progress: 0, claimed: false,
    }))
    return {
      unlocked: true, lockReason: null,
      bounties: views,
      gems: Number(profile?.gems ?? 0),
      rerollUsed: false,
      remaining: rolled.reduce((n, b) => n + bountyGems(b), 0),
      dailyMax: BOUNTY_DAILY_MAX,
      ...facts,
      ...ladderFacts(profile, views),
    }
  }

  const ids = row.bounty_ids ?? []
  const claimed = row.claimed ?? []
  const baselines = row.baselines ?? {}
  const signals = await readSignals(db, uid, row.assigned_at)

  const bounties: BountyView[] = ids.map((id, i) => {
    const b = BOUNTY_BY_ID.get(id)
    if (!b) return null
    return {
      id: b.id, name: b.name, desc: b.desc, tier: b.tier,
      gems: bountyGems(b), target: b.target,
      progress: Math.min(b.target, measure(b.meter, signals, baselines[id] ?? 0)),
      claimed: claimed[i] === true,
    }
  }).filter((b): b is BountyView => b !== null)

  return {
    unlocked: true, lockReason: null,
    bounties,
    gems: Number(signals.profile.gems ?? 0),
    rerollUsed: row.reroll_used === true,
    remaining: bounties.filter(b => !b.claimed).reduce((n, b) => n + b.gems, 0),
    dailyMax: BOUNTY_DAILY_MAX,
    ...facts,
    ...ladderFacts(signals.profile, bounties),
  }
}

export type ClaimResult = { ok: true; gems: number; total: number; points: number; sweep: boolean } | { error: string }

export async function claimBounty(db: DailyData, uid: string, bountyId: string): Promise<ClaimResult> {
  const row = await db.bountyBoard(uid)
  if (!row || row.date !== bountyToday()) return { error: 'That board has expired' }

  const ids = row.bounty_ids ?? []
  const i = ids.indexOf(bountyId)
  if (i < 0) return { error: 'Not on your board' }

  const claimed = row.claimed ?? []
  if (claimed[i]) return { error: 'Already claimed' }

  const b = BOUNTY_BY_ID.get(bountyId)
  if (!b) return { error: 'Unknown bounty' }

  // Re-measure here. The client's number is a display, never a permission: a
  // bounty pays because the work is in the log, not because a button said it
  // was done.
  const signals = await readSignals(db, uid, row.assigned_at)
  const baselines = row.baselines ?? {}
  if (measure(b.meter, signals, baselines[bountyId] ?? 0) < b.target) {
    return { error: 'Not finished yet' }
  }

  // Claim the slot before paying anything. Test and flip are one operation, so
  // two taps landing together cannot both come back true.
  if (!(await db.claimBountySlot(uid, i, row.date))) return { error: 'Already claimed' }

  const gems = bountyGems(b)

  // Was this the last one on the board? Counted HERE because the board is
  // overwritten tomorrow morning and there is no later pass that could notice.
  // The row read is one slot behind (index i was just flipped), so check every
  // OTHER slot and treat this one as taken.
  const after = ids.every((_, k) => k === i || claimed[k] === true)

  // Points ride with the gems: the order's own by tier, plus the sweep bonus
  // when this claim is the one that finishes the board.
  const earnedPoints = bountyPoints(b) + (after ? BOUNTY_SWEEP_POINTS : 0)

  // Everything moves IN PLACE.
  const bump = (col: string, n: number) => n > 0 ? db.bumpStat(uid, col, n) : null
  const [total] = await Promise.all([
    db.grant(uid, 'gems', gems),
    bump('bounties_claimed', 1),
    bump('bounty_gems_earned', gems),
    bump('bounty_boards_cleared', after ? 1 : 0),
    bump('bounty_elites_claimed', b.tier === 'elite' ? 1 : 0),
    bump('bounty_points', earnedPoints),
  ])

  return { ok: true, gems, total, points: earnedPoints, sweep: after }
}

export type MilestoneResult =
  | { ok: true; label: string; doubloons: number; gems: number; shipSkinId: string | null }
  | { error: string }

/** Collect the next rung of the points ladder.
 *
 *  One rung at a time and strictly in order, which is what lets the claimed
 *  count be a single integer: "collected the first five" is the whole truth and
 *  cannot arrive out of sequence. */
export async function claimBountyMilestone(db: DailyData, uid: string): Promise<MilestoneResult> {
  const p = await db.profile(uid, 'bounty_points, bounty_milestones_claimed, ship_skins')
  if (!p) return { error: 'Profile not found' }

  const claimed = Number(p.bounty_milestones_claimed ?? 0)
  const points = Number(p.bounty_points ?? 0)
  const m = BOUNTY_MILESTONES[claimed]
  if (!m) return { error: 'Every milestone is already collected' }
  if (points < m.points) return { error: `${m.points - points} more points needed` }

  const skins = ((p.ship_skins as string[] | null) ?? [])
  const grantSkin = m.shipSkinId && !skins.includes(m.shipSkinId)

  // Guarded on the count we read, so two taps cannot collect the same rung
  // twice: the second finds the number already moved and matches nothing.
  const won = await db.updateProfileIf(uid, { bounty_milestones_claimed: claimed + 1 }, [{ col: 'bounty_milestones_claimed', eq: claimed }])
  if (!won) return { error: 'Already collected' }

  // Paid only after the rung flipped, and in place.
  await Promise.all([
    m.doubloons ? db.grant(uid, 'doubloons', m.doubloons) : null,
    m.gems ? db.grant(uid, 'gems', m.gems) : null,
    grantSkin ? db.addToList(uid, 'ship_skins', m.shipSkinId as string) : null,
  ])

  if (m.doubloons) await db.ledger(uid, m.doubloons, 'Bounty milestone')

  return {
    ok: true, label: m.label,
    doubloons: m.doubloons ?? 0, gems: m.gems ?? 0,
    shipSkinId: grantSkin ? (m.shipSkinId as string) : null,
  }
}

export type RerollResult = { ok: true } | { error: string }

/** One swap a day, for a bounty you have no way to attempt. Rerolls the one
 *  slot, not the whole board, and never hands back something already claimed. */
export async function rerollBounty(db: DailyData, uid: string, bountyId: string): Promise<RerollResult> {
  const row = await db.bountyBoard(uid)
  if (!row || row.date !== bountyToday()) return { error: 'That board has expired' }
  if (row.reroll_used === true) return { error: 'You have used today\'s swap' }

  const ids = [...(row.bounty_ids ?? [])]
  const i = ids.indexOf(bountyId)
  if (i < 0) return { error: 'Not on your board' }
  const claimed = row.claimed ?? []
  if (claimed[i]) return { error: 'That one is already paid' }

  const old = BOUNTY_BY_ID.get(bountyId)
  if (!old) return { error: 'Unknown bounty' }

  // Same tier, never one already on the board, and never one this captain
  // cannot reach. A swap that hands over an impossible order is worse than the
  // order it replaced, since the swap is spent.
  const profile = await db.profile(uid, '*')
  const cleared = await clearedRaids(db, uid)
  const ranGauntlet = Number(profile?.gauntlet_runs_completed ?? 0) > 0
  const hcOpen = hardcoreOpen(profile)
  // The FAMILY rule applies to a swap too, or the one swap a day could hand over
  // "Clear two different raids" to sit beside "Clear two raids".
  const onBoard = ids.map(id => BOUNTY_BY_ID.get(id)).filter((b): b is NonNullable<typeof b> => b != null && b.id !== bountyId)
  const pool = ALL_BOUNTIES.filter(b =>
    b.tier === old.tier && b.id !== bountyId && !ids.includes(b.id)
    && !(b.family && onBoard.some(o => o.family === b.family))
    && canOffer(b, cleared, ranGauntlet, hcOpen))
  if (pool.length === 0) return { error: 'Nothing else to offer' }
  const replacement = pool[Math.floor(rngNext() * pool.length)]
  ids[i] = replacement.id

  // A counter bounty needs its own baseline taken NOW, or the swap would hand
  // over a bounty already part-finished by this morning's play.
  const baselines = { ...(row.baselines ?? {}) }
  delete baselines[bountyId]
  if (replacement.meter.kind === 'counter') {
    baselines[replacement.id] = Number(profile?.[replacement.meter.column] ?? 0)
  }

  if (!(await db.swapBounty(uid, row.date, { bounty_ids: ids, baselines }))) return { error: 'Could not swap that one' }
  return { ok: true }
}

/** Remember that this captain has been told about a rung. Only ever RAISES the
 *  number: two loads racing, or an old page left open in another tab, must
 *  never walk it backwards and re-announce a rung already delivered. */
export async function markBountyRungSeen(db: DailyData, uid: string, chapter: number): Promise<void> {
  await db.raiseBountyRungSeen(uid, chapter)
}
