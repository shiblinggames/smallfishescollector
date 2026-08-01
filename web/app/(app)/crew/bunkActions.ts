'use server'

// THE BUNKHOUSE — server actions.
//
// A benched crew takes a bunk in the Crew Hall and accrues crew XP from the
// row's `since`, capped at BUNK_CAP_HOURS. Claiming banks the XP and resets
// `since`; the crew STAYS bunked, so there is no redeploy cycle.
//
// The settlement helpers live in lib/crewBunkSettle.ts rather than here: they
// take an admin client, and every async export from a 'use server' file becomes
// a client-callable endpoint.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canBunk, nextDrillCost, drillName } from '@/lib/crewBunks'
import { bunkContext, loadBunks, settleBunks, releaseBunk } from '@/lib/crewBunkSettle'
import type { CrewXPGrant } from '@/lib/crewXPGrant'
import { getCrewState, type CrewActionResult, type CrewState } from './actions'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CLOSED = 'The Bunkhouse is not open yet.'

/** A claim also reports what each crew earned, so the panel can flash level-ups
 *  without a second round trip — CrewXPGrant already carries old/new level. */
export type BunkClaimResult = { state: CrewState; grants: CrewXPGrant[] } | { error: string }

export async function bunkCrew(crewId: number): Promise<CrewActionResult> {
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

  // The unique index on crew_id is the real guard against a double tap.
  const { error } = await admin.from('crew_hall_bunks').insert({ user_id: user.id, crew_id: crewId })
  if (error) return { error: 'Could not bunk that hand.' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

export async function unbunkCrew(crewId: number): Promise<BunkClaimResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const grants = await releaseBunk(admin, user.id, crewId)
  const state = await getCrewState()
  return state ? { state, grants } : { error: 'Failed to load crew' }
}

export async function claimBunks(): Promise<BunkClaimResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const ctx = await bunkContext(admin, user.id)
  // Deliberately NOT gated: if the flag is ever switched back off, whatever a
  // crew already earned must still be collectable rather than stranded.
  const grants = await settleBunks(admin, user.id, await loadBunks(admin, user.id), ctx.rate)

  const state = await getCrewState()
  return state ? { state, grants } : { error: 'Failed to load crew' }
}

/**
 * Buy the next Drill level. The ONLY doubloon purchase in the Bunkhouse: bunk
 * count comes from the hall tier alone, so there is exactly one thing to buy
 * here and one thing to buy on the hall above.
 *
 * Canonical doubloon flow: the atomic `deduct_doubloons` RPC first (a relative
 * debit guarded on the live balance, so two concurrent buys cannot both read
 * the same balance and pay once), then the grant and a ledger row.
 * `upgradeCrewHall` predates this and uses an absolute overwrite with no ledger
 * row - follow this, not that.
 */
export async function buyDrill(): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const ctx = await bunkContext(admin, user.id)
  if (!ctx.open) return { error: CLOSED }
  const cost = nextDrillCost(ctx.drillLevel)
  if (ctx.doubloons < cost) return { error: `Need ${cost.toLocaleString()} ⟡` }

  const { data: newBalance } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: cost })
  if (newBalance == null) return { error: `Need ${cost.toLocaleString()} ⟡` }

  // Guarded on the level we priced against, so a double submit cannot buy two
  // levels for one payment.
  const { data: bumped } = await admin
    .from('profiles').update({ crew_drill_level: ctx.drillLevel + 1 })
    .eq('id', user.id).eq('crew_drill_level', ctx.drillLevel).select('id')

  if (!(bumped ?? []).length) {
    // Lost the race. Refund rather than charging for nothing.
    await admin.rpc('deduct_doubloons', { uid: user.id, amount: -cost })
    return { error: 'That upgrade was already bought.' }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -cost,
    reason: `Bunkhouse: Drill ${drillName(ctx.drillLevel + 1)}`,
  })

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}
