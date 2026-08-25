'use server'

// THE SHIPYARD's four value mutations. Every one of them prices itself from
// lib/shipyard and never from the request, and every one goes through the
// service-role client — the house rule for anything that moves money.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RODS } from '@/lib/rods'
import {
  rackSlots, nextRackCost, MAX_RACK_TIER,
  nextHullCost, MAX_HULL_TIER,
} from '@/lib/shipyard'

type Ok = { ok: true; doubloons: number }
type Res = Ok | { error: string }

/** Shared: take the coin, log it, and hand back the balance the DATABASE landed
 *  on rather than the one this request predicted. */
async function spend(
  admin: ReturnType<typeof createAdminClient>,
  userId: string, amount: number, reason: string,
): Promise<number | null> {
  // The RESULT is the guard, not the error. deduct_doubloons does its balance
  // check inside its own WHERE and returns NULL rather than raising, so a
  // caller that checks `error` grants the upgrade for free.
  const { data, error } = await admin.rpc('deduct_doubloons', { uid: userId, amount })
  if (error || data == null) return null
  await admin.from('doubloon_transactions').insert({ user_id: userId, amount: -amount, reason })
  return Number(data)
}

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function buyRackBerth(): Promise<Res> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: p } = await admin
    .from('profiles').select('rod_rack_tier').eq('id', user.id).single()
  const tier = Number(p?.rod_rack_tier ?? 0)
  if (tier >= MAX_RACK_TIER) return { error: 'Your rack is already full.' }

  const cost = nextRackCost(tier)
  if (cost == null) return { error: 'Your rack is already full.' }

  const bal = await spend(admin, user.id, cost, `Shipyard: rod berth ${tier + 2}`)
  if (bal == null) return { error: `That berth costs ${cost.toLocaleString()} and you have not got it.` }

  // Re-read rather than trusting `tier` — two taps landing together would both
  // have read the same tier and both have paid, and this way the second one
  // lands on the tier the first produced.
  const { data: after } = await admin
    .from('profiles').select('rod_rack_tier').eq('id', user.id).single()
  await admin.from('profiles')
    .update({ rod_rack_tier: Math.min(MAX_RACK_TIER, Number(after?.rod_rack_tier ?? tier) + 1) })
    .eq('id', user.id)
  return { ok: true, doubloons: bal }
}

export async function buyHullTier(): Promise<Res> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: p } = await admin
    .from('profiles').select('hull_speed_tier').eq('id', user.id).single()
  const tier = Number(p?.hull_speed_tier ?? 0)
  if (tier >= MAX_HULL_TIER) return { error: 'Your hull is as fine as it gets.' }

  const cost = nextHullCost(tier)
  if (cost == null) return { error: 'Your hull is as fine as it gets.' }

  const bal = await spend(admin, user.id, cost, `Shipyard: hull tier ${tier + 1}`)
  if (bal == null) return { error: `That refit costs ${cost.toLocaleString()} and you have not got it.` }

  const { data: after } = await admin
    .from('profiles').select('hull_speed_tier').eq('id', user.id).single()
  await admin.from('profiles')
    .update({ hull_speed_tier: Math.min(MAX_HULL_TIER, Number(after?.hull_speed_tier ?? tier) + 1) })
    .eq('id', user.id)
  return { ok: true, doubloons: bal }
}

/**
 * LOAD THE RACK.
 *
 * Takes the whole list rather than one rod at a time, because it is a loadout:
 * you are saying what the boat carries, not adding to a pile. Validated hard —
 * every tier must be a real rod the player actually owns, duplicates are
 * dropped, and the list is clamped to the berths they have paid for.
 */
export async function setRodsAboard(tiers: number[]): Promise<{ ok: true; aboard: number[] } | { error: string }> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: p } = await admin
    .from('profiles').select('rod_rack_tier, rod_tier').eq('id', user.id).single()
  const slots = rackSlots(Number(p?.rod_rack_tier ?? 0))
  const equipped = Number(p?.rod_tier ?? 0)

  const { data: owned } = await admin
    .from('rod_inventory').select('rod_tier').eq('user_id', user.id)
  const ownedSet = new Set((owned ?? []).map(r => Number(r.rod_tier)))
  // Free rods are owned by everybody and never appear in rod_inventory.
  for (const r of RODS) if (r.cost === 0 && !r.earnedOnly && !r.traderOnly) ownedSet.add(r.tier)
  ownedSet.add(equipped)

  const clean = [...new Set(tiers.map(Number))]
    .filter(t => Number.isInteger(t) && ownedSet.has(t))
    // The equipped rod is in your hands, not in the rack — it is always aboard
    // and must not eat a berth.
    .filter(t => t !== equipped)
    .slice(0, Math.max(0, slots - 1))

  await admin.from('profiles').update({ rods_aboard: clean }).eq('id', user.id)
  return { ok: true, aboard: clean }
}

/** Equip a rod. The Shipyard is where this happens now — see docs/systems. */
export async function equipRod(tier: number): Promise<{ ok: true } | { error: string }> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const rod = RODS.find(r => r.tier === tier)
  if (!rod) return { error: 'No such rod.' }

  if (rod.cost !== 0 || rod.earnedOnly || rod.traderOnly) {
    const { data: has } = await admin
      .from('rod_inventory').select('rod_tier')
      .eq('user_id', user.id).eq('rod_tier', tier).maybeSingle()
    if (!has) return { error: 'You do not carry that rod.' }
  }

  await admin.from('profiles').update({ rod_tier: tier }).eq('id', user.id)
  return { ok: true }
}
