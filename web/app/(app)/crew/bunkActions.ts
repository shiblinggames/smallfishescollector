'use server'

// THE CREW HALL'S BUNKS — server actions.
//
// A benched crew takes a bunk and is LOCKED there for a full stint (the hall's
// Stores tier sets how long). Collecting pays the whole stint and frees the
// bunk. There is no early exit, so there is no unbunk action: the only way out
// is to finish.
//
// The settlement helpers live in lib/crewBunkSettle.ts rather than here: they
// take an admin client, and every async export from a 'use server' file becomes
// a client-callable endpoint.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clampHallTier } from '@/lib/crewHall'
import { canBunk, drillsMaxed, hallTierRequiredFor, ladderHallLocked, nextDrillCost, nextStoresCost, storesMaxed, tierNumeral } from '@/lib/crewBunks'
import { bunkContext, loadBunks, releaseBunk, type TraitOffer } from '@/lib/crewBunkSettle'
import { decodeTraitStats, netTraitStats } from '@/lib/crewEffects'
import { encodeTraitId } from '@/lib/crewGen'
import type { CrewXPGrant } from '@/lib/crewXPGrant'
import { getCrewState, type CrewActionResult, type CrewState } from './actions'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CLOSED = 'The hall is not taking bunks yet.'

/** A claim reports what each crew earned AND who came back, so the panel can
 *  name every hand and flash level-ups without a second round trip.
 *  `freed` includes hands who earned nothing because they are already at the
 *  level ceiling — without it a claim of only maxed crew would look like
 *  nothing happened. */
export type BunkClaimResult =
  | { state: CrewState; grants: CrewXPGrant[]; freed: number[]; offers: TraitOffer[] }
  | { error: string }

export async function bunkCrew(crewId: number, slot: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: crew } = await admin
    .from('user_crew').select('id, xp, voyage_slot, raid_slot, died_at')
    .eq('id', crewId).eq('user_id', user.id).maybeSingle()
  if (!crew) return { error: 'Crew not found' }
  if ((crew as any).died_at) return { error: 'That hand is gone.' }
  if ((crew as any).voyage_slot !== null || (crew as any).raid_slot !== null) {
    return { error: 'Take them out of their party first.' }
  }
  if (!canBunk((crew as any).xp ?? 0)) {
    return { error: 'They are fully trained. Bunk a hand who can still learn.' }
  }

  // A trawling crew is away from the hall entirely.
  const { data: onTrawl } = await admin
    .from('trawls').select('id').eq('user_id', user.id).eq('crew_id', crewId).maybeSingle()
  if (onTrawl) return { error: 'They are out on a trawl. Collect it first.' }

  const ctx = await bunkContext(admin, user.id)
  if (!ctx.open) return { error: CLOSED }
  const bunks = await loadBunks(admin, user.id)
  if (bunks.some(b => b.crew_id === crewId)) return { error: 'They already have a bunk.' }
  if (bunks.length >= ctx.slots) return { error: 'Every bunk is taken. Build another.' }

  // WHICH bunk matters now that the sixth one can re-cut a trait, so the slot
  // comes from the tile you tapped rather than being picked for you.
  const want = Math.floor(slot)
  if (!Number.isFinite(want) || want < 0 || want >= ctx.slots) {
    return { error: 'That bunk is not open yet.' }
  }
  if (bunks.some(b => b.slot === want)) return { error: 'That bunk is taken.' }

  // Stamp the TERMS on the row. This is the deal: this rate, this long. Buying
  // Drills or Stores afterwards changes what the NEXT hand gets, never this one.
  // The unique indexes on crew_id and (user_id, slot) are the real guard against
  // a double tap putting one hand in two bunks, or two hands in one bunk.
  const { error } = await admin.from('crew_hall_bunks').insert({
    user_id: user.id,
    crew_id: crewId,
    slot: want,
    rate_per_hour: ctx.rate,
    cap_hours: ctx.capHours,
  })
  if (error) return { error: 'Could not bunk that hand.' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/**
 * Collect ONE finished stint. Tapping a single hand used to collect every
 * finished bunk at once, which is a surprising amount to happen from one tap
 * on one crew. Does nothing if that stint is still running, so it is safe
 * against a stale tile.
 */
export async function collectBunk(crewId: number): Promise<BunkClaimResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { grants, freed, offers } = await releaseBunk(admin, user.id, crewId)

  const state = await getCrewState()
  return state ? { state, grants, freed, offers } : { error: 'Failed to load crew' }
}

/** Which of the three stats to take off the offer. */
export type TraitPicks = { power: boolean; dodge: boolean; fortune: boolean }

/**
 * Take an offered trait, STAT BY STAT. Anything not picked keeps its current
 * value, so a good stat is banked and the hunt continues on the other two.
 *
 * This is the ratchet, and it is the whole reason the Leviathan bunk is a
 * chase rather than a slot machine. Every offer used to be all or nothing,
 * which meant Divine could only ever arrive as one exact simultaneous roll of
 * three 4s: about 1 in 743, and no amount of accepting ever moved it, because
 * the roll never reads what the hand is carrying. Banking stats one at a time
 * turns that into roughly 16 offers. The brake is the bunk itself, which is
 * one slot producing four offers a day for the entire roster.
 *
 * The VALUES are read off the crew row, never from the caller. All the client
 * gets to say is which crew and which of three stats, so the worst a forged
 * request can do is pick a different subset of a trait the server itself
 * rolled.
 */
export async function acceptTraitOffer(crewId: number, picks: TraitPicks): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: crew } = await admin
    .from('user_crew').select('id, effects, trait_offer, died_at')
    .eq('id', crewId).eq('user_id', user.id).maybeSingle()
  if (!crew) return { error: 'Crew not found' }
  if ((crew as any).died_at) return { error: 'That hand is gone.' }

  const offer = (crew as any).trait_offer as string | null
  if (!offer) return { error: 'There is no offer to take.' }
  const offered = decodeTraitStats(offer)
  if (!offered) return { error: 'That offer could not be read.' }

  const current = netTraitStats(((crew as any).effects ?? []) as string[])
  const merged = {
    power:   picks?.power   ? offered.power   : current.power,
    dodge:   picks?.dodge   ? offered.dodge   : current.dodge,
    fortune: picks?.fortune ? offered.fortune : current.fortune,
  }
  // An all-zero result is stored as [] rather than an all-zero id, so the
  // roster reads it the same as a hand who never had a trait.
  const id = encodeTraitId(merged)
  const effects = id ? [id] : []

  // Guarded on the exact offer we merged against, so a double tap cannot apply
  // one offer and then a newer one that arrived in between.
  const { data: applied } = await admin
    .from('user_crew').update({ effects, trait_offer: null })
    .eq('id', crewId).eq('user_id', user.id).eq('trait_offer', offer).select('id')
  if (!(applied ?? []).length) return { error: 'That offer is no longer on the table.' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Throw the offer back. Their current trait stands. */
export async function declineTraitOffer(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  await admin.from('user_crew').update({ trait_offer: null })
    .eq('id', crewId).eq('user_id', user.id)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Drills buy XP PER HOUR. */
export async function buyDrill(): Promise<CrewActionResult> {
  return buyUpgrade('drill')
}

/** Stores buy HOW MANY HOURS a bunk keeps earning before it fills. */
export async function buyStores(): Promise<CrewActionResult> {
  return buyUpgrade('stores')
}

/**
 * The hall's two in-panel upgrade trees. Bunk COUNT is not here — that comes
 * from the hall tier alone, so the three things you can buy never overlap:
 * upgrade the building for room, drill for speed, stock stores for time.
 *
 * Canonical doubloon flow: the atomic `deduct_doubloons` RPC first (a relative
 * debit guarded on the live balance, so two concurrent buys cannot both read
 * the same balance and pay once), then the grant and a ledger row.
 * `upgradeCrewHall` predates this and uses an absolute overwrite with no ledger
 * row - follow this, not that.
 */
async function buyUpgrade(kind: 'drill' | 'stores'): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const ctx = await bunkContext(admin, user.id)
  if (!ctx.open) return { error: CLOSED }

  const isDrill = kind === 'drill'
  const from = isDrill ? ctx.drillLevel : ctx.storesLevel
  const col = isDrill ? 'crew_drill_level' : 'crew_stores_level'
  // Both ladders stop at six.
  if (isDrill && drillsMaxed(from)) return { error: 'The drills are as sharp as they get.' }
  if (!isDrill && storesMaxed(from)) return { error: 'Stores are already full.' }

  // The hall leads and its contents follow: tier N of either ladder needs hall
  // tier N. Enforced here and not only on the button, since the action is
  // callable directly.
  if (ladderHallLocked(from, clampHallTier(ctx.hallTier))) {
    return { error: `Upgrade the hall to tier ${hallTierRequiredFor(from + 1)} first.` }
  }

  const cost = isDrill ? nextDrillCost(from) : nextStoresCost(from)
  if (cost <= 0) return { error: 'Nothing left to buy.' }
  if (ctx.doubloons < cost) return { error: `Need ${cost.toLocaleString()} \u27e1` }

  const { data: newBalance } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: cost })
  if (newBalance == null) return { error: `Need ${cost.toLocaleString()} \u27e1` }

  // Guarded on the level we priced against, so a double submit cannot buy two
  // levels for one payment.
  const { data: bumped } = await admin
    .from('profiles').update({ [col]: from + 1 })
    .eq('id', user.id).eq(col, from).select('id')

  if (!(bumped ?? []).length) {
    // Lost the race. Refund rather than charging for nothing.
    await admin.rpc('deduct_doubloons', { uid: user.id, amount: -cost })
    return { error: 'That upgrade was already bought.' }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -cost,
    reason: `Crew Hall: ${isDrill ? 'Drill' : 'Stores'} ${tierNumeral(from + 1)}`,
  })

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}
