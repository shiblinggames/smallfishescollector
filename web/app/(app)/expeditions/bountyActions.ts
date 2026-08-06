'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ALL_BOUNTIES, BOUNTY_BY_ID, BOUNTY_SLOTS, BOUNTY_DAILY_MAX,
  BOUNTY_UNLOCK_RAID, bountyGems, rollBounties, bountyToday,
  type Bounty, type BountyMeter,
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
  dailyMax: number
}

const DONE: BountyBoard = {
  unlocked: false, lockReason: 'Clear the campaign to open the bounty board',
  bounties: [], gems: 0, rerollUsed: false, remaining: 0, dailyMax: BOUNTY_DAILY_MAX,
}

type Admin = ReturnType<typeof createAdminClient>

/** Everything the meters read, fetched once for the whole board rather than
 *  per bounty. Four reads total however many bounties are on it. */
type Signals = {
  raids: { raid_id: string; elapsed_ms: number | null }[]
  voyages: number
  events: { kind: string; value: number }[]
  profile: Record<string, unknown>
}

async function readSignals(admin: Admin, uid: string, since: string): Promise<Signals> {
  const [raidsRes, voyRes, evRes, profRes] = await Promise.all([
    admin.from('raid_completions').select('raid_id, elapsed_ms')
      .eq('user_id', uid).gte('completed_at', since),
    admin.from('daily_voyages').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('status', 'revealed').gte('created_at', since),
    admin.from('bounty_events').select('kind, value')
      .eq('user_id', uid).gte('created_at', since),
    admin.from('profiles').select('*').eq('id', uid).single(),
  ])
  return {
    raids: (raidsRes.data ?? []) as Signals['raids'],
    voyages: voyRes.count ?? 0,
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
    case 'raid_challenge_any':
      return s.raids.filter(r => r.raid_id.endsWith('_challenge')).length
    case 'raid_fast':
      return s.raids.filter(r =>
        r.raid_id === meter.raidId && (r.elapsed_ms ?? Infinity) <= meter.underS * 1000).length
    case 'voyages':
      return s.voyages
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

async function isUnlocked(admin: Admin, uid: string): Promise<boolean> {
  const { count } = await admin.from('raid_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid).eq('raid_id', BOUNTY_UNLOCK_RAID)
  return (count ?? 0) > 0
}

export async function getBountyBoard(): Promise<BountyBoard> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return DONE

  const admin = createAdminClient()
  if (!(await isUnlocked(admin, uid))) return DONE

  const today = bountyToday()
  const { data: row } = await admin.from('bounty_progress').select('*').eq('user_id', uid).single()

  // A new day, or a captain who has never had a board.
  if (!row || row.date !== today) {
    const { data: profile } = await admin.from('profiles').select('*').eq('id', uid).single()
    const rolled = rollBounties(uid, today)
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
      remaining: BOUNTY_DAILY_MAX,
      dailyMax: BOUNTY_DAILY_MAX,
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
  const { data: prof } = await admin.from('profiles').select('gems').eq('id', user.id).single()
  const total = Number(prof?.gems ?? 0) + gems
  await admin.from('profiles').update({ gems: total }).eq('id', user.id)

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

  // Same tier, and never one already on the board.
  const pool = ALL_BOUNTIES.filter(b =>
    b.tier === old.tier && b.id !== bountyId && !ids.includes(b.id))
  if (pool.length === 0) return { error: 'Nothing else to offer' }
  const replacement = pool[Math.floor(Math.random() * pool.length)]
  ids[i] = replacement.id

  // A counter bounty needs its own baseline taken NOW, or the swap would hand
  // over a bounty already part-finished by this morning's play.
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
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
