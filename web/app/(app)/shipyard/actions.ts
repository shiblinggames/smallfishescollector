'use server'

// THE SHIPYARD's four value mutations. Every one of them prices itself from
// lib/shipyard and never from the request, and every one goes through the
// service-role client — the house rule for anything that moves money.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { RODS } from '@/lib/rods'
import {
  nextHullCost, MAX_HULL_TIER,
  nextHandlingCost, MAX_HANDLING_TIER,
  nextAccelCost, MAX_ACCEL_TIER,
  nextLanternCost, MAX_LANTERN_TIER,
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

// ── buyRackBerth AND setRodsAboard ARE GONE ─────────────────────────────────
//
// The rod rack is removed: you carry every rod you own and swap freely from the
// loadout screen at sea. See the note at the top of lib/shipyard for why, and
// docs/systems/gear.md for what the Shipyard is for now.
//
// Both actions took money or wrote `rods_aboard`, and both are deleted rather
// than left exported. A dead server action that still spends doubloons is one
// import away from being live again.
// HULL GOES THROUGH THE SHARED HELPER TOO. It was a hand-copied version of
// buyTier, which is exactly why it was the one ladder that did not get the
// error check below — the note on buyTier already warned that "three
// near-identical ladders is exactly where a fix gets applied to two of them",
// and then this one sat outside the helper and was the one that broke.
// ASYNC, even though it only forwards. A 'use server' file may export nothing
// but async functions — the usual symptom is the export being silently dropped;
// here the compiler refuses outright, which is the better failure.
export async function buyHullTier(): Promise<Res> {
  return buyTier('hull_speed_tier', MAX_HULL_TIER, nextHullCost, 'hull tier', 'Your hull is as fine as it gets.')
}

/**
 * THE OTHER TWO MOVEMENT LADDERS.
 *
 * Identical in shape to buyHullTier and deliberately so — same re-read after
 * the spend, same reason. Two taps landing together would both have read the
 * same tier and both have paid; re-reading means the second lands on the tier
 * the first produced instead of overwriting it.
 *
 * Written as one helper rather than copied twice: three near-identical ladders
 * is exactly where a fix gets applied to two of them.
 */
async function buyTier(
  col: 'hull_speed_tier' | 'hull_handling_tier' | 'hull_accel_tier' | 'lantern_tier',
  maxTier: number,
  cost: (t: number) => number | null,
  label: string,
  full: string,
): Promise<Res> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: p } = await admin.from('profiles').select(col).eq('id', user.id).single()
  const tier = Number((p as Record<string, unknown> | null)?.[col] ?? 0)
  if (tier >= maxTier) return { error: full }

  const price = cost(tier)
  if (price == null) return { error: full }

  const bal = await spend(admin, user.id, price, `Shipyard: ${label} ${tier + 1}`)
  if (bal == null) return { error: `That refit costs ${price.toLocaleString()} and you have not got it.` }

  const { data: after } = await admin.from('profiles').select(col).eq('id', user.id).single()
  // ── THE WRITE IS CHECKED, AND A FAILURE GIVES THE MONEY BACK ──────────
  //
  // This used to be an unread `await`. `profiles_hull_speed_tier_range` was
  // still CHECK (<= 3) from when the hull had four rungs; the ladder grew to
  // six, so Postgres rejected every refit past tier 3 — AFTER `spend()` had
  // taken the coin. supabase-js returns errors in the result object rather than
  // throwing, so it failed in total silence: two captains paid sixteen times
  // between them for refits that never landed, and the yard cheerfully offered
  // the same upgrade again on the next visit.
  //
  // Widening that constraint fixes today's bug. Reading the error is what stops
  // the next one, whatever it turns out to be: an upgrade that cannot be
  // written must not be an upgrade that was paid for.
  const { error: writeErr } = await admin.from('profiles')
    .update({ [col]: Math.min(maxTier, Number((after as Record<string, unknown> | null)?.[col] ?? tier) + 1) })
    .eq('id', user.id)
  if (writeErr) {
    // Straight back. A negative deduct is the house refund, the same shape the
    // crew bunks and the homestead already use.
    await admin.rpc('deduct_doubloons', { uid: user.id, amount: -price })
    await admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: price, reason: `Refunded: ${label} ${tier + 1} could not be fitted`,
    })
    return { error: 'The yard could not fit that. Your coin is back in your purse.' }
  }
  // THE CHART IS A CACHED PAGE, and this changed what is standing on it.
  //
  // /sea is rendered on the server from the profile, and the shipyard returns to
  // it with router.back() — which restores the CACHED entry rather than asking
  // for a new one. Nothing here invalidated it, so a captain could equip a boat,
  // sail away, and still be in the old one. Worse than a stale render: it looked
  // like the equip had silently failed, and it stuck on whichever boat happened
  // to be current when that cache entry was made.
  revalidatePath('/sea')
  return { ok: true, doubloons: bal }
}

export async function buyHandlingTier(): Promise<Res> {
  return buyTier('hull_handling_tier', MAX_HANDLING_TIER, nextHandlingCost,
    'rudder', 'Her rudder is as fine as it gets.')
}

export async function buyLanternTier(): Promise<Res> {
  return buyTier('lantern_tier', MAX_LANTERN_TIER, nextLanternCost, 'lantern', 'Your lantern is as bright as they come.')
}

export async function buyAccelTier(): Promise<Res> {
  return buyTier('hull_accel_tier', MAX_ACCEL_TIER, nextAccelCost,
    'rig', 'Her rig is as fine as it gets.')
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

  // THE CHART IS A CACHED PAGE, and this changed what stands on it.
  //
  // /sea renders on the server from the profile, and the shipyard returns to it
  // with router.back() — which restores the CACHED entry rather than asking for
  // a fresh one. Nothing invalidated it, so a captain could equip a boat, sail
  // away and still be in the old one. It did not read as a stale render; it read
  // as the equip having silently failed.
  revalidatePath('/sea')
  await admin.from('profiles').update({ rod_tier: tier }).eq('id', user.id)
  return { ok: true }
}
