'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ALL_BOUNTIES, BOUNTY_BY_ID, BOUNTY_DAILY_MAX,
  bountyGems, rollBounties, bountyToday, canOffer,
  rungFor, nextRung, rungGems,
  type Bounty, type BountyMeter, type BountyRung,
} from '@/lib/bounties'

// The measuring layer for BOUNTIES.
//
// Almost nothing here needed new tracking code, because the game already writes
// down what a bounty asks about. raid_completions is a real log carrying
// raid_id and elapsed_ms, daily_voyages is a row per voyage, and profiles keeps
// a pile of monotonic counters. A bounty records where those stood when it was
// handed out and progress is what has happened since.
//
// The one exception is depth. profiles.gauntlet_deepest is a LIFETIME high-water
// mark, so "reach depth 10 today" would be permanently uncompletable for a
// captain who had already been to 15. A run ending is a moment, not a total, so
// the gauntlet writes one row to bounty_events and depth bounties read that.

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
}

const SHUT: BountyBoard = {
  unlocked: false, lockReason: 'Clear Chapter I to open the bounty board',
  bounties: [], gems: 0, rerollUsed: false, remaining: 0,
  rungMax: 0, dailyMax: BOUNTY_DAILY_MAX, rung: null, next: null,
}

type Admin = ReturnType<typeof createAdminClient>

/** Everything the meters read, fetched once for the whole board rather than
 *  per bounty. Four reads total however many bounties are on it. */
type Signals = {
  raids: { raid_id: string; elapsed_ms: number | null }[]
  /** Rows, not a count: the haul and route meters need what each one brought
   *  back, and one read serves all four voyage meters. */
  voyages: { total_doubloons: number | null; route: string | null }[]
  events: { kind: string; value: number }[]
  profile: Record<string, unknown>
}

async function readSignals(admin: Admin, uid: string, since: string): Promise<Signals> {
  const [raidsRes, voyRes, evRes, profRes] = await Promise.all([
    admin.from('raid_completions').select('raid_id, elapsed_ms')
      .eq('user_id', uid).gte('completed_at', since),
    admin.from('daily_voyages').select('total_doubloons, route')
      .eq('user_id', uid).eq('status', 'revealed').gte('created_at', since),
    admin.from('bounty_events').select('kind, value')
      .eq('user_id', uid).gte('created_at', since),
    admin.from('profiles').select('*').eq('id', uid).single(),
  ])
  return {
    raids: (raidsRes.data ?? []) as Signals['raids'],
    voyages: (voyRes.data ?? []) as Signals['voyages'],
    events: (evRes.data ?? []) as Signals['events'],
    profile: (profRes.data ?? {}) as Record<string, unknown>,
  }
}

/** How far along one bounty is. Capped by the caller, not here. */
function measure(meter: BountyMeter, s: Signals, baseline: number): number {
  switch (meter.kind) {
    case 'raid_clear':
      return s.raids.filter(r => r.raid_id === meter.raidId).length
    case 'raid_any':
      return s.raids.length
    case 'raid_any_of':
      // Named ids, not a suffix match. "Any challenge raid" made a hard bounty
      // only as hard as Pete on Challenge, which a capped captain clears
      // without noticing.
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
async function clearedRaids(admin: Admin, uid: string): Promise<Set<string>> {
  const { data } = await admin.from('raid_completions')
    .select('raid_id').eq('user_id', uid)
  return new Set(((data ?? []) as { raid_id: string }[]).map(r => r.raid_id))
}

function rungFacts(rung: BountyRung) {
  const nx = nextRung(rung)
  return {
    rung: { chapter: rung.chapter, title: rung.title, boss: rung.boss },
    next: nx ? { chapter: nx.chapter, title: nx.title, boss: nx.boss, gems: rungGems(nx.slots) } : null,
    rungMax: rungGems(rung.slots),
  }
}

export async function getBountyBoard(): Promise<BountyBoard> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return SHUT

  const admin = createAdminClient()
  const cleared = await clearedRaids(admin, uid)
  const rung = rungFor(cleared)
  if (!rung) return SHUT
  const facts = rungFacts(rung)

  const today = bountyToday()
  const { data: row } = await admin.from('bounty_progress').select('*').eq('user_id', uid).single()

  // Does the board on file still match the rung it is supposed to be?
  //
  // bounty_ids are frozen the moment a board is handed out and only re-roll
  // when the DATE turns over, so any change to the tiers or the rung sizes
  // leaves yesterday's shape sitting in front of whoever already loaded it
  // today. Re-tiering the catalogue mid-afternoon did exactly that: a board
  // rolled as standard/standard/hard/elite redrew itself as easy/easy/medium/
  // elite, because two of those bounties had changed bands underneath it.
  //
  // So the composition is checked, not just the date. Compared as a multiset:
  // the slot ORDER is not meaningful, only how many of each tier.
  //
  // Not re-rolled once anything is claimed. Handing someone a fresh board after
  // they have been paid for part of the old one either takes back work they
  // finished or pays them twice for it, and neither is worth fixing a cosmetic
  // mismatch that corrects itself at midnight anyway.
  const staleShape = row != null && row.date === today && (() => {
    const tiers = ((row.bounty_ids as string[]) ?? [])
      .map(id => BOUNTY_BY_ID.get(id)?.tier)
      .filter((t): t is Bounty['tier'] => t != null)
      .sort()
    const anyClaimed = ((row.claimed as boolean[]) ?? []).some(Boolean)
    return !anyClaimed && tiers.join(',') !== [...rung.slots].sort().join(',')
  })()

  // A new day, a captain who has never had a board, or a board whose shape no
  // longer exists.
  if (!row || row.date !== today || staleShape) {
    const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).single()
    const ranGauntlet = Number((profile as Record<string, unknown> | null)?.gauntlet_runs_completed ?? 0) > 0
    const rolled = rollBounties(uid, today, rung.slots, cleared, ranGauntlet)
    const assignedAt = new Date().toISOString()
    await admin.from('bounty_progress').upsert({
      user_id: uid,
      date: today,
      bounty_ids: rolled.map(b => b.id),
      baselines: baselinesFor(rolled, (profile ?? {}) as Record<string, unknown>),
      claimed: rolled.map(() => false),
      assigned_at: assignedAt,
      reroll_used: false,
      updated_at: assignedAt,
    }, { onConflict: 'user_id' })
    return {
      unlocked: true, lockReason: null,
      bounties: rolled.map(b => ({
        id: b.id, name: b.name, desc: b.desc, tier: b.tier,
        gems: bountyGems(b), target: b.target, progress: 0, claimed: false,
      })),
      gems: Number((profile as { gems?: number } | null)?.gems ?? 0),
      rerollUsed: false,
      remaining: rolled.reduce((n, b) => n + bountyGems(b), 0),
      dailyMax: BOUNTY_DAILY_MAX,
      ...facts,
    }
  }

  const ids = (row.bounty_ids as string[]) ?? []
  const claimed = (row.claimed as boolean[]) ?? []
  const baselines = (row.baselines as Record<string, number>) ?? {}
  const signals = await readSignals(admin, uid, row.assigned_at as string)

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
  }
}

export type ClaimResult = { ok: true; gems: number; total: number } | { error: string }

export async function claimBounty(bountyId: string): Promise<ClaimResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('bounty_progress').select('*').eq('user_id', user.id).single()
  if (!row || row.date !== bountyToday()) return { error: 'That board has expired' }

  const ids = (row.bounty_ids as string[]) ?? []
  const i = ids.indexOf(bountyId)
  if (i < 0) return { error: 'Not on your board' }

  const claimed = (row.claimed as boolean[]) ?? []
  if (claimed[i]) return { error: 'Already claimed' }

  const b = BOUNTY_BY_ID.get(bountyId)
  if (!b) return { error: 'Unknown bounty' }

  // Re-measure server-side. The client's number is a display, never a
  // permission: a bounty pays because the work is in the log, not because a
  // button said it was done.
  const signals = await readSignals(admin, user.id, row.assigned_at as string)
  const baselines = (row.baselines as Record<string, number>) ?? {}
  if (measure(b.meter, signals, baselines[bountyId] ?? 0) < b.target) {
    return { error: 'Not finished yet' }
  }

  // Claim the slot before paying anything. Test and flip are the SAME
  // statement inside claim_bounty_slot, so two taps landing together cannot
  // both come back true and the gems are granted exactly once. Read-then-write
  // from here would pay twice.
  const { data: won } = await admin.rpc('claim_bounty_slot', {
    uid: user.id, slot: i, today: row.date as string,
  })
  if (won !== true) return { error: 'Already claimed' }

  const gems = bountyGems(b)
  const { data: prof } = await admin.from('profiles')
    .select('gems, bounties_claimed, bounty_gems_earned, bounty_boards_cleared, bounty_elites_claimed')
    .eq('id', user.id).single()
  const total = Number(prof?.gems ?? 0) + gems

  // Was this the last one on the board? Counted HERE because the board is
  // overwritten tomorrow morning and there is no later pass that could notice.
  // The stored array is one slot behind (the RPC just flipped index i), so
  // check every OTHER slot and treat this one as taken.
  const after = ids.every((_, k) => k === i || claimed[k] === true)

  const stats = {
    gems: total,
    bounties_claimed: Number(prof?.bounties_claimed ?? 0) + 1,
    bounty_gems_earned: Number(prof?.bounty_gems_earned ?? 0) + gems,
    bounty_boards_cleared: Number(prof?.bounty_boards_cleared ?? 0) + (after ? 1 : 0),
    bounty_elites_claimed: Number(prof?.bounty_elites_claimed ?? 0) + (b.tier === 'elite' ? 1 : 0),
  }
  await admin.from('profiles').update(stats).eq('id', user.id)

  return { ok: true, gems, total }
}

export type RerollResult = { ok: true } | { error: string }

/** One swap a day, for a bounty you have no way to attempt. Rerolls the whole
 *  slot, not the whole board, and never hands back something already claimed. */
export async function rerollBounty(bountyId: string): Promise<RerollResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: row } = await admin.from('bounty_progress').select('*').eq('user_id', user.id).single()
  if (!row || row.date !== bountyToday()) return { error: 'That board has expired' }
  if (row.reroll_used === true) return { error: 'You have used today\'s swap' }

  const ids = [...((row.bounty_ids as string[]) ?? [])]
  const i = ids.indexOf(bountyId)
  if (i < 0) return { error: 'Not on your board' }
  const claimed = (row.claimed as boolean[]) ?? []
  if (claimed[i]) return { error: 'That one is already paid' }

  const old = BOUNTY_BY_ID.get(bountyId)
  if (!old) return { error: 'Unknown bounty' }

  // Same tier, never one already on the board, and never one this captain
  // cannot reach. A swap that hands over an impossible order is worse than the
  // order it replaced, since the swap is spent.
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
  const cleared = await clearedRaids(admin, user.id)
  const ranGauntlet = Number((profile as Record<string, unknown> | null)?.gauntlet_runs_completed ?? 0) > 0
  const pool = ALL_BOUNTIES.filter(b =>
    b.tier === old.tier && b.id !== bountyId && !ids.includes(b.id)
    && canOffer(b, cleared, ranGauntlet))
  if (pool.length === 0) return { error: 'Nothing else to offer' }
  const replacement = pool[Math.floor(Math.random() * pool.length)]
  ids[i] = replacement.id

  // A counter bounty needs its own baseline taken NOW, or the swap would hand
  // over a bounty already part-finished by this morning's play.
  const baselines = { ...((row.baselines as Record<string, number>) ?? {}) }
  delete baselines[bountyId]
  if (replacement.meter.kind === 'counter') {
    baselines[replacement.id] = Number((profile as Record<string, unknown>)?.[replacement.meter.column] ?? 0)
  }

  const { error } = await admin.from('bounty_progress')
    .update({ bounty_ids: ids, baselines, reroll_used: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('date', row.date)
    .eq('reroll_used', false)
  if (error) return { error: 'Could not swap that one' }

  return { ok: true }
}

/** Called by the gauntlet when a run ends. The only thing bounties needed that
 *  the game was not already writing down. Fire and forget: a lost event costs a
 *  bounty tick, never a run. */
export async function logBountyEvent(userId: string, kind: string, value: number): Promise<void> {
  try {
    await createAdminClient().from('bounty_events').insert({ user_id: userId, kind, value })
  } catch { /* a bounty tick is never worth failing a run over */ }
}

/** Remember that this captain has been told about a rung.
 *
 *  Guarded to only ever RAISE the number. Two hub loads racing each other, or
 *  an old page left open in another tab, must never walk it backwards and
 *  re-announce a rung that has already been delivered. */
export async function markBountyRungSeen(chapter: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles')
    .update({ bounty_rung_seen: chapter })
    .eq('id', user.id)
    .lt('bounty_rung_seen', chapter)
}
