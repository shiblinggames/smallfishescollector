'use server'

// THE SHIPYARD's value mutations. Each checks the session and hands
// lib/core/ship the Supabase store: every refit prices itself from lib/shipyard
// and never from the request, and goes through the service-role client, the
// house rule for anything that moves money.
//
// buyRackBerth AND setRodsAboard ARE GONE. The rod rack is removed: you carry
// every rod you own and swap freely from the loadout screen at sea (see
// lib/shipyard and docs/systems/gear.md). Both actions took money or wrote
// `rods_aboard`, and both are deleted rather than left exported. A dead server
// action that still spends doubloons is one import away from being live again.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { shipData } from '@/lib/data/shipData'
import { buyShipyardTier, equipRod as equipRodCore, type HullLadder, type ShipyardResult } from '@/lib/core/ship'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// THE CHART IS A CACHED PAGE, and every one of these changes what stands on it.
//
// /sea renders on the server from the profile, and the shipyard returns to it
// with router.back(), which restores the CACHED entry rather than asking for a
// fresh one. Nothing invalidated it, so a captain could equip a boat, sail away
// and still be in the old one. It did not read as a stale render; it read as
// the equip having silently failed.
async function ladder(col: HullLadder): Promise<ShipyardResult> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await buyShipyardTier(shipData(createAdminClient()), uid, col)
  if ('ok' in res) revalidatePath('/sea')
  return res
}

// ASYNC, even though they only forward. A 'use server' file may export nothing
// but async functions.
export async function buyHullTier(): Promise<ShipyardResult> { return ladder('hull_speed_tier') }
export async function buyHandlingTier(): Promise<ShipyardResult> { return ladder('hull_handling_tier') }
export async function buyLanternTier(): Promise<ShipyardResult> { return ladder('lantern_tier') }
export async function buyAccelTier(): Promise<ShipyardResult> { return ladder('hull_accel_tier') }

/** Equip a rod. The Shipyard is where this happens now; see docs/systems. */
export async function equipRod(tier: number): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await equipRodCore(shipData(createAdminClient()), uid, tier)
  if ('ok' in res) revalidatePath('/sea')
  return res
}
