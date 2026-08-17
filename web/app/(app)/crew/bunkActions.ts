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
import { canBunk, drillsMaxed, hallTierRequiredFor, isLeviathanSlot, ladderHallLocked, nextDrillCost, nextStoresCost, storesMaxed, tierNumeral } from '@/lib/crewBunks'
import { bunkContext, loadBunks, releaseBunk, NEUTRAL_OFFER, type TraitUpgrade } from '@/lib/crewBunkSettle'
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
  | { state: CrewState; grants: CrewXPGrant[]; freed: number[]; upgrades: TraitUpgrade[] }
  | { error: string }

/**
 * Put a hand in a bunk.
 *
 * `hours` is honoured on the LEVIATHAN bunk only, and only up to the Stores
 * cap. Stores buys a longer stint, which is pure convenience for XP (a stint
 * pays rate x hours and takes hours, so XP per day is rate x 24 whatever you
 * pick) - but the Leviathan bunk rolls ONE trait per stint, so a longer stint
 * is strictly fewer rolls. Buying Stores to six therefore used to cut the
 * re-cut rate to a sixth, which is an upgrade that makes you worse at the one
 * thing the top hall exists for. Choosing the length fixes that without
 * touching XP, because XP per day does not depend on it either way.
 *
 * The ordinary bunks keep taking the full cap: there is nothing to trade off
 * there, and a length picker on all six would be a decision with no stakes.
 */
export async function bunkCrew(crewId: number, slot: number, hours?: number): Promise<CrewActionResult> {
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
  // Slot-aware: an ordinary bunk pays XP and a maxed hand has nothing to gain,
  // but the Leviathan bunk pays a trait RE-CUT and a maxed hand is exactly who
  // wants one. bunkCrew already knows which bunk is being filled, so the check
  // just has to be told.
  if (!canBunk((crew as any).xp ?? 0, slot)) {
    return { error: 'They are fully trained. Send them to the Leviathan bunk, or bunk a hand who can still learn.' }
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

  // Clamp to the Stores cap. Only the Leviathan bunk may shorten: everywhere
  // else the cap IS the stint. Validated here rather than trusted, since this
  // is an HTTP endpoint and a shorter stint means more trait rolls per day.
  const capHours = ctx.capHours
  const askedHours = Math.floor(Number(hours))
  const stintHours = isLeviathanSlot(want) && Number.isFinite(askedHours)
    ? Math.max(1, Math.min(capHours, askedHours))
    : capHours

  // Stamp the TERMS on the row. This is the deal: this rate, this long. Buying
  // Drills or Stores afterwards changes what the NEXT hand gets, never this one.
  // The unique indexes on crew_id and (user_id, slot) are the real guard against
  // a double tap putting one hand in two bunks, or two hands in one bunk.
  const { error } = await admin.from('crew_hall_bunks').insert({
    user_id: user.id,
    crew_id: crewId,
    slot: want,
    rate_per_hour: ctx.rate,
    cap_hours: stintHours,
  })
  if (error) return { error: 'Could not bunk that hand.' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/**
 * Answer a Leviathan offer: keep what the hand carries, or take the new roll.
 *
 * The offer lives on user_crew.pending_trait, written when the stint settled.
 * That is deliberate and it is the whole anti-reroll guard: if the roll were
 * held on the client, a refresh would draw a fresh one and the 1-in-28 would be
 * worth nothing. Same lesson as castLine's pending_cast token.
 *
 * BOTH answers clear the offer, and the clear is CONDITIONAL on the offer still
 * being there (`.not('pending_trait','is',null)`), so two taps cannot both
 * apply. Declining is a real decision with a real cost - that draw is spent.
 */
export async function resolveTraitOffer(
  crewId: number,
  accept: boolean,
): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: crew } = await admin
    .from('user_crew').select('id, pending_trait, effects')
    .eq('id', crewId).eq('user_id', user.id).maybeSingle()
  if (!crew) return { error: 'Crew not found' }
  const offer = (crew as { pending_trait?: string | null }).pending_trait
  if (!offer) return { error: 'No offer to answer.' }

  // The neutral sentinel means the draw was 0/0/0 -- taking it strips the
  // trait, which is a legitimate (if unkind) outcome of a flat table.
  const nextEffects = offer === NEUTRAL_OFFER ? [] : [offer]

  const { data: written } = await admin
    .from('user_crew')
    .update(accept ? { effects: nextEffects, pending_trait: null } : { pending_trait: null })
    .eq('id', crewId).eq('user_id', user.id)
    .not('pending_trait', 'is', null)     // idempotent: a second tap changes nothing
    .select('id')
  if (!(written ?? []).length) return { error: 'That offer was already answered.' }

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

  const { grants, freed, upgrades } = await releaseBunk(admin, user.id, crewId)

  const state = await getCrewState()
  return state ? { state, grants, freed, upgrades } : { error: 'Failed to load crew' }
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
